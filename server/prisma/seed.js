const prisma = require('../lib/prisma');

/**
 * Default categories for seeding
 */
const DEFAULT_CATEGORIES = [
    { value: 'video', label: 'Video Streaming' },
    { value: 'music', label: 'Music Streaming' },
    { value: 'software', label: 'Software' },
    { value: 'cloud', label: 'Cloud Storage' },
    { value: 'news', label: 'News & Magazines' },
    { value: 'game', label: 'Games' },
    { value: 'productivity', label: 'Productivity' },
    { value: 'education', label: 'Education' },
    { value: 'finance', label: 'Finance' },
    { value: 'other', label: 'Other' },
];

/**
 * Default payment methods for seeding
 */
const DEFAULT_PAYMENT_METHODS = [
    { value: 'creditcard', label: 'Credit Card' },
    { value: 'debitcard', label: 'Debit Card' },
    { value: 'paypal', label: 'PayPal' },
    { value: 'applepay', label: 'Apple Pay' },
    { value: 'googlepay', label: 'Google Pay' },
    { value: 'banktransfer', label: 'Bank Transfer' },
    { value: 'crypto', label: 'Cryptocurrency' },
    { value: 'other', label: 'Other' },
];

/**
 * Default exchange rates seeded with INR as base currency
 */
const DEFAULT_EXCHANGE_RATES = [
    { from_currency: 'INR', to_currency: 'INR', rate: 1.0 },
    { from_currency: 'INR', to_currency: 'USD', rate: 0.012 },
    { from_currency: 'INR', to_currency: 'CNY', rate: 0.0783 },
    { from_currency: 'INR', to_currency: 'EUR', rate: 0.0102 },
    { from_currency: 'INR', to_currency: 'GBP', rate: 0.009 },
    { from_currency: 'INR', to_currency: 'CAD', rate: 0.0151 },
    { from_currency: 'INR', to_currency: 'AUD', rate: 0.0163 },
    { from_currency: 'INR', to_currency: 'JPY', rate: 1.324 },
    { from_currency: 'INR', to_currency: 'TRY', rate: 0.3256 },
    { from_currency: 'INR', to_currency: 'HKD', rate: 0.094 },
];

/**
 * Seed global reference data into the PostgreSQL database via Prisma.
 * Uses upsert so it is idempotent and safe to run multiple times.
 *
 * This only seeds data shared across ALL companies (categories, payment
 * methods, exchange rates). Per-company data (settings, scheduler settings,
 * notification settings, the first admin login) is created by
 * server/scripts/create-organization.js when a new company is provisioned.
 */
async function seed() {
    console.log('🌱 Starting database seeding...');

    try {
        // Seed categories
        for (const category of DEFAULT_CATEGORIES) {
            await prisma.category.upsert({
                where: { value: category.value },
                update: { label: category.label },
                create: category,
            });
        }
        console.log(`✅ ${DEFAULT_CATEGORIES.length} categories seeded`);

        // Seed payment methods
        for (const method of DEFAULT_PAYMENT_METHODS) {
            await prisma.paymentMethod.upsert({
                where: { value: method.value },
                update: { label: method.label },
                create: method,
            });
        }
        console.log(`✅ ${DEFAULT_PAYMENT_METHODS.length} payment methods seeded`);

        // Seed exchange rates (insert-only — never overwrite a rate that already
        // exists, since the scheduler may have since replaced it with a live fetch)
        for (const rate of DEFAULT_EXCHANGE_RATES) {
            await prisma.exchangeRate.upsert({
                where: {
                    from_currency_to_currency: {
                        from_currency: rate.from_currency,
                        to_currency: rate.to_currency,
                    },
                },
                update: {},
                create: rate,
            });
        }
        console.log(`✅ ${DEFAULT_EXCHANGE_RATES.length} exchange rates seeded`);

        console.log('🎉 Database seeding completed successfully!');
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        throw error;
    }
}

// Run seed if called directly (disconnect only when this is the top-level process —
// callers that import seed() as a library keep using the shared prisma singleton afterwards)
if (require.main === module) {
    seed()
        .catch((error) => {
            console.error(error);
            process.exit(1);
        })
        .finally(() => prisma.$disconnect());
}

module.exports = seed;
