const { Prisma } = require('@prisma/client');
const { getOrgId } = require('./orgContext');

// Explicit allowlist (not a denylist): models that carry organization_id and
// must always be filtered/stamped by the current company. Anything not in
// this list (Category, PaymentMethod, ExchangeRate, Organization) is treated
// as shared/global and passed through untouched.
const ORG_SCOPED_MODELS = new Set([
    'User',
    'Subscription',
    'PaymentHistory',
    'MonthlyCategorySummary',
    'Settings',
    'SchedulerSettings',
    'NotificationSetting',
    'NotificationChannel',
    'NotificationHistory',
]);

const FILTERABLE_READ_OPS = new Set([
    'findMany', 'findFirst', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy',
    'updateMany', 'deleteMany',
]);
const UNIQUE_READ_OPS = new Set(['findUnique', 'findUniqueOrThrow']);
const SINGLE_MUTATE_OPS = new Set(['update', 'delete']);

function uncapitalize(name) {
    return name.charAt(0).toLowerCase() + name.slice(1);
}

function notFoundError(model, operation) {
    return new Prisma.PrismaClientKnownRequestError(
        `An operation failed because it depends on one or more records that were required but not found. No '${model}' record found for a ${operation} query.`,
        { code: 'P2025', clientVersion: Prisma.prismaVersion.client }
    );
}

function orgScopeExtension() {
    return Prisma.defineExtension((client) =>
        client.$extends({
            name: 'org-scope',
            query: {
                $allModels: {
                    async $allOperations({ model, operation, args, query }) {
                        if (!ORG_SCOPED_MODELS.has(model)) {
                            return query(args);
                        }

                        // Reads/bulk-writes with a filterable WhereInput: safe to AND-merge.
                        if (FILTERABLE_READ_OPS.has(operation)) {
                            const organizationId = getOrgId();
                            args.where = { AND: [args.where ?? {}, { organization_id: organizationId }] };
                            return query(args);
                        }

                        // findUnique/findUniqueOrThrow: WhereUniqueInput can't accept an
                        // extra organization_id field, so rewrite to findFirst with the
                        // org filter merged in (the standard documented workaround).
                        if (UNIQUE_READ_OPS.has(operation)) {
                            const organizationId = getOrgId();
                            const result = await client[uncapitalize(model)].findFirst({
                                ...args,
                                where: { AND: [args.where, { organization_id: organizationId }] },
                            });
                            if (!result && operation === 'findUniqueOrThrow') {
                                throw notFoundError(model, operation);
                            }
                            return result;
                        }

                        // update/delete by id (WhereUniqueInput again): verify ownership
                        // first, then perform the real single-row operation. This is what
                        // closes the cross-tenant IDOR gap — a mismatched org id now
                        // fails exactly like a nonexistent id (P2025), not a 200 with
                        // someone else's data.
                        if (SINGLE_MUTATE_OPS.has(operation)) {
                            const organizationId = getOrgId();
                            const owned = await client[uncapitalize(model)].findFirst({
                                where: { AND: [args.where, { organization_id: organizationId }] },
                                select: { id: true },
                            });
                            if (!owned) {
                                throw notFoundError(model, operation);
                            }
                            return query(args);
                        }

                        // create: stamp organization_id onto the new row.
                        if (operation === 'create') {
                            const organizationId = getOrgId();
                            args.data = { ...args.data, organization_id: organizationId };
                            return query(args);
                        }

                        // createMany: stamp every element.
                        if (operation === 'createMany') {
                            const organizationId = getOrgId();
                            args.data = args.data.map((item) => ({ ...item, organization_id: organizationId }));
                            return query(args);
                        }

                        // upsert: `where` must already be a genuine unique selector and
                        // can't be auto-merged the way filterable reads can. Every upsert
                        // call site on an org-scoped model is fixed manually (it must
                        // already include organization_id in both `where` and `create`)
                        // — passed through unmodified here by design.
                        return query(args);
                    },
                },
            },
        })
    );
}

module.exports = { orgScopeExtension, ORG_SCOPED_MODELS };
