const { PrismaClient } = require('@prisma/client');
const { orgScopeExtension } = require('./prismaOrgScope');

// Singleton pattern — prevents multiple connections during hot-reload in development
const basePrisma = global.__prisma || new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
    global.__prisma = basePrisma;
}

// Every consumer of this module gets the org-scoped client automatically.
// Reads/writes on company-owned tables (subscriptions, settings, etc.) are
// transparently filtered/stamped by the current request's organization —
// see server/lib/prismaOrgScope.js and server/lib/orgContext.js.
const prisma = basePrisma.$extends(orgScopeExtension());

// Unscoped escape hatch for the few places that must run before any company
// context exists (login's username lookup) or across all companies at once
// (the org-provisioning CLI script, the default-org backfill script).
prisma.raw = basePrisma;

module.exports = prisma;
