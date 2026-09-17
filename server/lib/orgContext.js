const { AsyncLocalStorage } = require('node:async_hooks');

// Holds the "current company" for the lifetime of a request (or a background
// job's per-company slice of work), without having to pass organizationId
// through every function call manually.
const als = new AsyncLocalStorage();

function runWithOrg(organizationId, fn) {
    return als.run({ organizationId }, fn);
}

// Fails loudly rather than silently scoping by `undefined` — a missing org
// context is a bug (e.g. a background job forgot to wrap its work), and it
// must surface immediately instead of leaking unscoped data.
function getOrgId() {
    const store = als.getStore();
    if (!store || store.organizationId == null) {
        throw new Error('organizationId requested outside of an org-scoped context');
    }
    return store.organizationId;
}

function tryGetOrgId() {
    return als.getStore()?.organizationId ?? null;
}

module.exports = { runWithOrg, getOrgId, tryGetOrgId };
