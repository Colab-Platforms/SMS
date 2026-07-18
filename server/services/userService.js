const BaseRepository = require('../utils/BaseRepository');
const logger = require('../utils/logger');

class UserService extends BaseRepository {
    constructor(prisma) {
        super(prisma, 'users');
    }

    async getByUsername(username) {
        try {
            return await this.findOne({ username });
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

    async updatePasswordHash(username, passwordHash) {
        try {
            return await this.updateWhere({ username }, { password_hash: passwordHash });
        } catch (error) {
            logger.error('Failed to update user password hash:', error.message);
            throw error;
        }
    }

    async recordLastLogin(username) {
        try {
            return await this.updateWhere({ username }, { last_login_at: new Date() });
        } catch (error) {
            logger.error('Failed to record last login:', error.message);
            throw error;
        }
    }
}

module.exports = UserService;
