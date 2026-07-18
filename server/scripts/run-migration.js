#!/usr/bin/env node

/**
 * Database initialisation script — Prisma + NeonDB version.
 *
 * Replaces the old SQLite migration runner.
 * Schema is now managed by Prisma Migrate; this script just runs
 * the seed and bootstraps the admin user.
 *
 * Usage: node server/scripts/run-migration.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const prisma = require('../lib/prisma');
const seed   = require('../prisma/seed');
const { createAdminUserManager } = require('../config/authCredentials');

async function runInit() {
    console.log('🚀 Running database initialisation (NeonDB / Prisma)...');

    try {
        // 1. Verify connection
        await prisma.$queryRaw`SELECT 1`;
        console.log('✅ Database connection established');

        // 2. Seed default data (idempotent)
        await seed();

        // 3. Bootstrap admin user
        const adminManager = createAdminUserManager(prisma);
        await adminManager.bootstrapDefaultAdmin();
        console.log('✅ Admin user ready');

        console.log('\n🎉 Initialisation completed successfully!');
        console.log('\n💡 If you have not already applied the schema, run:');
        console.log('   npx prisma migrate dev --name init   (development)');
        console.log('   npx prisma migrate deploy            (production / NeonDB)');

        process.exit(0);
    } catch (error) {
        console.error('❌ Initialisation failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    runInit();
}

module.exports = { runInit };
