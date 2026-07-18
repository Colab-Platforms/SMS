const bcrypt = require('bcryptjs');
const UserService = require('../services/userService');
const logger = require('../utils/logger');

function hashAdminPassword(plainPassword) {
    if (!plainPassword) {
        throw new Error('Plain password is required to generate a hash');
    }
    return bcrypt.hashSync(plainPassword, 12);
}

function resolveAdminPasswordHashFromEnv() {
    const configuredHash     = process.env.ADMIN_PASSWORD_HASH;
    const configuredPassword = process.env.ADMIN_PASSWORD;

    if (configuredHash) {
        return { passwordHash: configuredHash, source: 'hash' };
    }
    if (configuredPassword) {
        return { passwordHash: hashAdminPassword(configuredPassword), source: 'password' };
    }
    return { passwordHash: hashAdminPassword('admin'), source: 'default' };
}

/**
 * Create an admin user manager backed by the Prisma client.
 * All methods are async because UserService now uses Prisma.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 */
function createAdminUserManager(prisma) {
    if (!prisma) {
        throw new Error('Prisma client is required to create an admin user manager');
    }

    const userService   = new UserService(prisma);
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';

    async function getAdminUser() {
        return userService.getByUsername(adminUsername);
    }

    async function ensureAdminUser() {
        let user = await getAdminUser();
        if (user) return user;

        const { passwordHash, source } = resolveAdminPasswordHashFromEnv();

        await userService.createUser({
            username:      adminUsername,
            password_hash: passwordHash,
            role:          'admin',
        });

        logger.info(`Seeded default admin user \`${adminUsername}\` using ${source === 'default' ? 'fallback' : source} credentials`);

        if (source === 'password') {
            logger.warn('Generated ADMIN_PASSWORD_HASH from ADMIN_PASSWORD.');
            logger.warn('Consider storing the generated hash and removing ADMIN_PASSWORD for improved security.');
        }

        return getAdminUser();
    }

    async function bootstrapDefaultAdmin() {
        const user = await ensureAdminUser();
        if (!user) {
            throw new Error('Unable to bootstrap admin user');
        }
        return user;
    }

    async function setAdminPassword({ password, passwordHash }) {
        if (!password && !passwordHash) {
            throw new Error('Either password or passwordHash must be provided');
        }
        const newHash = passwordHash || hashAdminPassword(password);
        const existing = await ensureAdminUser();
        if (!existing) {
            throw new Error('Admin user does not exist');
        }
        await userService.updatePasswordHash(adminUsername, newHash);
        return newHash;
    }

    async function recordSuccessfulLogin() {
        const existing = await ensureAdminUser();
        if (!existing) {
            throw new Error('Admin user does not exist');
        }
        await userService.recordLastLogin(adminUsername);
    }

    return {
        getAdminUser,
        ensureAdminUser,
        bootstrapDefaultAdmin,
        setAdminPassword,
        recordSuccessfulLogin,
    };
}

module.exports = {
    createAdminUserManager,
    resolveAdminPasswordHashFromEnv,
    hashAdminPassword,
};
