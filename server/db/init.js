const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const prisma  = require('../lib/prisma');
const seed    = require('../prisma/seed');
const { createAdminUserManager } = require('../config/authCredentials');

/**
 * Initialize the database — runs seed data and bootstraps the admin user.
 * Schema is managed externally by: npx prisma migrate deploy
 */
async function initializeDatabase() {
    console.log('🔄 Initializing database...');
    console.log('🗄️  Database: NeonDB (PostgreSQL via Prisma)');

    try {
        // Verify connection
        await prisma.$queryRaw`SELECT 1`;
        console.log('✅ Database connection established');

        // Seed default data (idempotent — safe to run multiple times)
        await seed();

        // Bootstrap admin user
        const adminManager = createAdminUserManager(prisma);
        await adminManager.bootstrapDefaultAdmin();
        console.log('✅ Admin user bootstrapped successfully.');

        console.log('🎉 Database initialization completed successfully!');
        console.log('\n📊 Database is ready with all required tables and data.');

        return prisma;
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        process.exit(1);
    }
}

// Run initialization if this script is executed directly.
// Disconnect afterwards so the process can exit — Prisma's pool otherwise
// keeps the event loop alive indefinitely (matters when a shell script,
// e.g. start.sh, is waiting on this command to finish before continuing).
if (require.main === module) {
    initializeDatabase().finally(() => prisma.$disconnect());
}

module.exports = initializeDatabase;
