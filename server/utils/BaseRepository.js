const logger = require('./logger');

/**
 * Model name mapping: table name (snake_case plural) → Prisma model accessor (camelCase singular)
 * Used so subclasses can pass their table names and we map them to Prisma delegates.
 */
const TABLE_TO_MODEL = {
    users: 'user',
    settings: 'settings',
    exchange_rates: 'exchangeRate',
    categories: 'category',
    payment_methods: 'paymentMethod',
    subscriptions: 'subscription',
    payment_history: 'paymentHistory',
    monthly_category_summary: 'monthlyCategorySummary',
};

/**
 * Generic async database base class backed by Prisma ORM.
 * Provides standard CRUD operations that subclasses can use or override.
 *
 * IMPORTANT DIFFERENCES from the old better-sqlite3 version:
 *  - All methods are async (return Promises)
 *  - create() returns the full created record (not { lastInsertRowid })
 *  - update() returns the full updated record (not { changes })
 *  - delete() returns the deleted record
 *  - transaction() wraps prisma.$transaction
 */
class BaseRepository {
    constructor(prisma, tableName) {
        this.prisma = prisma;
        this.tableName = tableName;

        const modelName = TABLE_TO_MODEL[tableName];
        if (!modelName) {
            throw new Error(`BaseRepository: unknown table name "${tableName}". Add it to TABLE_TO_MODEL.`);
        }

        // this.model is the Prisma model delegate (e.g. prisma.subscription)
        this.model = prisma[modelName];
        this.modelName = modelName;
    }

    /**
     * Find all records matching optional filters, order, limit, offset.
     * @param {Object} options
     * @param {Object} options.filters - key/value WHERE conditions (equality only)
     * @param {string|Object} options.orderBy - e.g. 'name ASC' or { name: 'asc' }
     * @param {number} options.limit
     * @param {number} options.offset
     * @returns {Promise<Array>}
     */
    async findAll(options = {}) {
        try {
            const { filters = {}, orderBy, limit, offset } = options;

            const where = this._buildWhere(filters);
            const orderByClause = this._buildOrderBy(orderBy);

            const args = { where };
            if (orderByClause) args.orderBy = orderByClause;
            if (limit) args.take = limit;
            if (offset) args.skip = offset;

            return await this.model.findMany(args);
        } catch (error) {
            logger.error(`BaseRepository.findAll failed on ${this.tableName}:`, error.message);
            throw error;
        }
    }

    /**
     * Find a single record by its primary key id.
     * @param {number|string} id
     * @param {string} idField - currently only 'id' supported
     * @returns {Promise<Object|null>}
     */
    async findById(id, idField = 'id') {
        try {
            return await this.model.findUnique({ where: { [idField]: id } });
        } catch (error) {
            logger.error(`BaseRepository.findById failed on ${this.tableName}:`, error.message);
            throw error;
        }
    }

    /**
     * Find the first record matching filters.
     * @param {Object} filters
     * @returns {Promise<Object|null>}
     */
    async findOne(filters = {}) {
        try {
            const where = this._buildWhere(filters);
            return await this.model.findFirst({ where });
        } catch (error) {
            logger.error(`BaseRepository.findOne failed on ${this.tableName}:`, error.message);
            throw error;
        }
    }

    /**
     * Create a new record.
     * @param {Object} data
     * @returns {Promise<Object>} The created record (full object, NOT { lastInsertRowid })
     */
    async create(data) {
        try {
            return await this.model.create({ data });
        } catch (error) {
            logger.error(`BaseRepository.create failed on ${this.tableName}:`, error.message);
            throw error;
        }
    }

    /**
     * Create many records in a single transaction.
     * @param {Array} dataArray
     * @returns {Promise<{ count: number }>} Number of created records
     */
    async createMany(dataArray) {
        if (!Array.isArray(dataArray) || dataArray.length === 0) {
            return { count: 0 };
        }
        try {
            return await this.model.createMany({ data: dataArray, skipDuplicates: false });
        } catch (error) {
            logger.error(`BaseRepository.createMany failed on ${this.tableName}:`, error.message);
            throw error;
        }
    }

    /**
     * Update a record by id.
     * @param {number|string} id
     * @param {Object} data
     * @param {string} idField
     * @returns {Promise<Object>} The updated record
     */
    async update(id, data, idField = 'id') {
        try {
            return await this.model.update({
                where: { [idField]: id },
                data,
            });
        } catch (error) {
            logger.error(`BaseRepository.update failed on ${this.tableName}:`, error.message);
            throw error;
        }
    }

    /**
     * Update all records matching filters.
     * @param {Object} filters
     * @param {Object} data
     * @returns {Promise<{ count: number }>}
     */
    async updateWhere(filters, data) {
        if (!filters || Object.keys(filters).length === 0) {
            throw new Error('updateWhere: filters cannot be empty');
        }
        try {
            const where = this._buildWhere(filters);
            return await this.model.updateMany({ where, data });
        } catch (error) {
            logger.error(`BaseRepository.updateWhere failed on ${this.tableName}:`, error.message);
            throw error;
        }
    }

    /**
     * Delete a record by id.
     * @param {number|string} id
     * @param {string} idField
     * @returns {Promise<Object>} The deleted record
     */
    async delete(id, idField = 'id') {
        try {
            return await this.model.delete({ where: { [idField]: id } });
        } catch (error) {
            logger.error(`BaseRepository.delete failed on ${this.tableName}:`, error.message);
            throw error;
        }
    }

    /**
     * Delete all records matching filters.
     * @param {Object} filters
     * @returns {Promise<{ count: number }>}
     */
    async deleteWhere(filters) {
        if (!filters || Object.keys(filters).length === 0) {
            throw new Error('deleteWhere: filters cannot be empty');
        }
        try {
            const where = this._buildWhere(filters);
            return await this.model.deleteMany({ where });
        } catch (error) {
            logger.error(`BaseRepository.deleteWhere failed on ${this.tableName}:`, error.message);
            throw error;
        }
    }

    /**
     * Count records matching filters.
     * @param {Object} filters
     * @returns {Promise<number>}
     */
    async count(filters = {}) {
        try {
            const where = this._buildWhere(filters);
            return await this.model.count({ where });
        } catch (error) {
            logger.error(`BaseRepository.count failed on ${this.tableName}:`, error.message);
            throw error;
        }
    }

    /**
     * Check if any record exists matching filters.
     * @param {Object} filters
     * @returns {Promise<boolean>}
     */
    async exists(filters) {
        const n = await this.count(filters);
        return n > 0;
    }

    /**
     * Execute a set of operations in a Prisma transaction.
     * @param {Function} callback - receives (tx) prisma transaction client
     * @returns {Promise<*>}
     */
    async transaction(callback) {
        return await this.prisma.$transaction(callback);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Build a Prisma `where` object from a plain filters object.
     * Only handles equality conditions.
     */
    _buildWhere(filters = {}) {
        const where = {};
        for (const [key, value] of Object.entries(filters)) {
            if (value !== undefined && value !== null) {
                where[key] = value;
            }
        }
        return where;
    }

    /**
     * Convert a SQL-style orderBy string ('name ASC') to Prisma format ({ name: 'asc' }).
     * Also accepts a Prisma-style object directly.
     */
    _buildOrderBy(orderBy) {
        if (!orderBy) return undefined;
        if (typeof orderBy === 'object') return orderBy;

        // Parse "field ASC" or "field DESC" or "field1 ASC, field2 DESC"
        const parts = orderBy.split(',').map((part) => {
            const [field, direction = 'ASC'] = part.trim().split(/\s+/);
            return { [field]: direction.toLowerCase() };
        });

        return parts.length === 1 ? parts[0] : parts;
    }
}

module.exports = BaseRepository;
