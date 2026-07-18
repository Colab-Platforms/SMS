const prisma = require('../lib/prisma');
const { createAdminUserManager } = require('./authCredentials');

/**
 * Initialize the database connection and bootstrap the admin user.
 * With Prisma + NeonDB the schema is managed by `prisma migrate`.
 * This function only handles application-level bootstrapping (admin user seeding).
 *
 * @returns {Promise<import('@prisma/client').PrismaClient>}
 */
async function initializeDatabase() {
    try {
        // Verify the connection by running a lightweight query
        await prisma.$queryRaw`SELECT 1`;
        console.log('✅ Database connection established (NeonDB / PostgreSQL)');

        // Bootstrap the default admin user
        const adminManager = createAdminUserManager(prisma);
        await adminManager.bootstrapDefaultAdmin();
        console.log('✅ Admin user bootstrapped successfully.');

        return prisma;
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        throw error;
    }
}

/**
 * Returns the shared Prisma client.
 * Kept for backward compatibility with code that calls createDatabaseConnection().
 */
function createDatabaseConnection() {
    return prisma;
}

module.exports = {
    initializeDatabase,
    createDatabaseConnection,
};
