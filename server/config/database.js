const prisma = require('../lib/prisma');

/**
 * Initialize the database connection.
 * With Prisma + NeonDB the schema is managed by `prisma migrate`.
 * Organizations and their admin users are provisioned via
 * `server/scripts/create-organization.js`, not bootstrapped at startup.
 *
 * @returns {Promise<import('@prisma/client').PrismaClient>}
 */
async function initializeDatabase() {
    try {
        // Verify the connection by running a lightweight query
        await prisma.$queryRaw`SELECT 1`;
        console.log('✅ Database connection established (NeonDB / PostgreSQL)');

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
