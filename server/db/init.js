const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const prisma  = require('../lib/prisma');
const seed    = require('../prisma/seed');

/**
 * Initialize the database — runs seed data (global reference lists only).
 * Schema is managed externally by: npx prisma migrate deploy
 * Companies (organizations) and their admin logins are created separately via
 * `node server/scripts/create-organization.js`.
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

        console.log('🎉 Database initialization completed successfully!');
        console.log('\n📊 Database is ready with all required tables and data.');
        console.log('💡 To add a company, run: node server/scripts/create-organization.js --help');

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
