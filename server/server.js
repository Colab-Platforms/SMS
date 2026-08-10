const express = require('express');
const cors    = require('cors');
const path    = require('path');
const ExchangeRateScheduler         = require('./services/exchangeRateScheduler');
const SubscriptionRenewalScheduler  = require('./services/subscriptionRenewalScheduler');
const NotificationScheduler         = require('./services/notificationScheduler');

// Load environment variables from root .env file
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { initializeDatabase } = require('./config/database');
const { createSessionMiddleware }   = require('./middleware/session');
const { requireLogin }              = require('./middleware/requireLogin');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { createSubscriptionRoutes, createProtectedSubscriptionRoutes } = require('./routes/subscriptions');
const { createSubscriptionManagementRoutes } = require('./routes/subscriptionManagement');
const { createAnalyticsRoutes }     = require('./routes/analytics');
const { createSettingsRoutes, createProtectedSettingsRoutes } = require('./routes/settings');
const { createExchangeRateRoutes, createProtectedExchangeRateRoutes } = require('./routes/exchangeRates');
const { createPaymentHistoryRoutes, createProtectedPaymentHistoryRoutes } = require('./routes/paymentHistory');
const { createMonthlyCategorySummaryRoutes, createProtectedMonthlyCategorySummaryRoutes } = require('./routes/monthlyCategorySummary');
const { createCategoriesRoutes, createProtectedCategoriesRoutes, createPaymentMethodsRoutes, createProtectedPaymentMethodsRoutes } = require('./routes/categoriesAndPaymentMethods');
const { createSubscriptionRenewalSchedulerRoutes, createProtectedSubscriptionRenewalSchedulerRoutes } = require('./routes/subscriptionRenewalScheduler');
const { createNotificationRoutes, createProtectedNotificationRoutes } = require('./routes/notifications');
const { createSchedulerRoutes, createProtectedSchedulerRoutes } = require('./routes/scheduler');
const userPreferencesRoutes = require('./routes/userPreferences');
const templatesRoutes       = require('./routes/templates');
const createAuthRoutes      = require('./routes/auth');

const app  = express();
const port = process.env.PORT || 3001;

// Configure trust proxy
const trustProxyConfig = process.env.TRUST_PROXY;
if (trustProxyConfig !== undefined) {
    if (trustProxyConfig === 'true')       app.set('trust proxy', true);
    else if (trustProxyConfig === 'false') app.set('trust proxy', false);
    else {
        const parsed = Number(trustProxyConfig);
        app.set('trust proxy', Number.isNaN(parsed) ? trustProxyConfig : parsed);
    }
} else if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(createSessionMiddleware());

// Async bootstrap
(async () => {
    try {
        // initializeDatabase() now returns the Prisma client
        const prisma = await initializeDatabase();
        console.log('🚀 Database ready');

        // Initialize schedulers with the Prisma client
        const exchangeRateScheduler        = new ExchangeRateScheduler(prisma);
        const subscriptionRenewalScheduler = new SubscriptionRenewalScheduler(prisma);
        const notificationScheduler        = new NotificationScheduler();

        exchangeRateScheduler.start();
        subscriptionRenewalScheduler.start();
        notificationScheduler.start();

        // Serve static files
        app.use(express.static(path.join(__dirname, '..', 'public')));

        // Health check
        app.get('/api/health', requireLogin, (req, res) => {
            res.json({ message: 'Subscription Management Backend is running!', status: 'healthy' });
        });

        // --- API Routers ---
        const apiRouter          = express.Router();
        const protectedApiRouter = express.Router();

        // Auth routes (no login required)
        app.use('/api/auth', createAuthRoutes(prisma));

        // Apply session auth
        apiRouter.use(requireLogin);
        protectedApiRouter.use(requireLogin);

        // Register route modules — all receive `prisma` instead of raw `db`
        apiRouter.use('/subscriptions', createSubscriptionRoutes(prisma));
        protectedApiRouter.use('/subscriptions', createProtectedSubscriptionRoutes(prisma));
        protectedApiRouter.use('/subscriptions', createSubscriptionManagementRoutes(prisma));

        apiRouter.use('/analytics', createAnalyticsRoutes(prisma));

        apiRouter.use('/settings', createSettingsRoutes(prisma));
        protectedApiRouter.use('/settings', createProtectedSettingsRoutes(prisma));

        apiRouter.use('/exchange-rates', createExchangeRateRoutes(prisma));
        protectedApiRouter.use('/exchange-rates', createProtectedExchangeRateRoutes(prisma, exchangeRateScheduler));

        apiRouter.use('/payment-history', createPaymentHistoryRoutes(prisma));
        protectedApiRouter.use('/payment-history', createProtectedPaymentHistoryRoutes(prisma));

        apiRouter.use('/monthly-category-summary', createMonthlyCategorySummaryRoutes(prisma));
        protectedApiRouter.use('/monthly-category-summary', createProtectedMonthlyCategorySummaryRoutes(prisma));

        apiRouter.use('/categories', createCategoriesRoutes(prisma));
        protectedApiRouter.use('/categories', createProtectedCategoriesRoutes(prisma));

        apiRouter.use('/payment-methods', createPaymentMethodsRoutes(prisma));
        protectedApiRouter.use('/payment-methods', createProtectedPaymentMethodsRoutes(prisma));

        apiRouter.use('/subscription-renewal-scheduler', createSubscriptionRenewalSchedulerRoutes(subscriptionRenewalScheduler));
        protectedApiRouter.use('/subscription-renewal-scheduler', createProtectedSubscriptionRenewalSchedulerRoutes(subscriptionRenewalScheduler));

        apiRouter.use('/notifications', createNotificationRoutes(prisma));
        protectedApiRouter.use('/notifications', createProtectedNotificationRoutes(prisma));

        apiRouter.use('/scheduler', createSchedulerRoutes(notificationScheduler));
        protectedApiRouter.use('/scheduler', createProtectedSchedulerRoutes(notificationScheduler));

        apiRouter.use('/user-preferences', userPreferencesRoutes);
        apiRouter.use('/templates', templatesRoutes);

        app.use('/api', apiRouter);
        app.use('/api/protected', protectedApiRouter);

        // SPA fallback
        app.use((req, res, next) => {
            if (req.path.startsWith('/api')) return next();
            const indexPath = path.join(__dirname, '..', 'public', 'index.html');
            res.sendFile(indexPath, (err) => {
                if (err) {
                    console.error('Error serving index.html:', err);
                    res.status(404).send('Frontend not found');
                }
            });
        });

        // Error handling (must be last)
        app.use(notFoundHandler);
        app.use(errorHandler);

        app.listen(port, "0.0.0.0", () => {
            console.log(`🚀 Subscription Management Server is running on http://localhost:${port}`);
            console.log(`📂 Frontend available at: http://localhost:${port}`);
            console.log(`🔧 API available at: http://localhost:${port}/api`);
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
})();