const BaseRepository = require('../utils/BaseRepository');
const logger = require('../utils/logger');

class UserService extends BaseRepository {
    constructor(prisma) {
        super(prisma, 'users');
    }

    async getByUsernameInOrg(organizationId, username) {
        try {
            return await this.findOne({ organization_id: organizationId, username });
        } catch (error) {
            logger.error('Failed to fetch user by username:', error.message);
            throw error;
        }
    }

    async createUser(userData) {
        try {
            const data = {
                role: 'admin',
                ...userData,
            };
            return await this.create(data);
        } catch (error) {
            logger.error('Failed to create user:', error.message);
            throw error;
        }
    }

    async updatePasswordHash(userId, passwordHash) {
        try {
            return await this.update(userId, { password_hash: passwordHash });
        } catch (error) {
            logger.error('Failed to update user password hash:', error.message);
            throw error;
        }
    }

    async recordLastLogin(userId) {
        try {
            return await this.update(userId, { last_login_at: new Date() });
        } catch (error) {
            logger.error('Failed to record last login:', error.message);
            throw error;
        }
    }
}

module.exports = UserService;
