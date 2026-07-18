/**
 * Auth Integration Tests — Prisma + NeonDB version.
 *
 * These tests use the real Prisma client connected to a test database.
 * Set DATABASE_URL to a test/shadow Neon branch in your CI environment.
 *
 * Each test cleans up the users table before running to ensure isolation.
 */

const express = require('express');
const session = require('express-session');
const request = require('supertest');

const { PrismaClient } = require('@prisma/client');
const createAuthRoutes = require('../routes/auth');
const { createAdminUserManager } = require('../config/authCredentials');

// Use a dedicated test prisma client (inherits DATABASE_URL from env)
let prisma;

function buildApp(prismaClient) {
    const app = express();
    app.use(express.json());
    app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false }));
    app.use('/auth', createAuthRoutes(prismaClient));
    return app;
}

describe('Admin authentication', () => {
    const originalEnv = {
        ADMIN_USERNAME:      process.env.ADMIN_USERNAME,
        ADMIN_PASSWORD:      process.env.ADMIN_PASSWORD,
        ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    };

    beforeAll(async () => {
        prisma = new PrismaClient();
        await prisma.$connect();
    });

    afterAll(async () => {
        // Restore env vars
        if (originalEnv.ADMIN_USERNAME === undefined) delete process.env.ADMIN_USERNAME;
        else process.env.ADMIN_USERNAME = originalEnv.ADMIN_USERNAME;

        if (originalEnv.ADMIN_PASSWORD === undefined) delete process.env.ADMIN_PASSWORD;
        else process.env.ADMIN_PASSWORD = originalEnv.ADMIN_PASSWORD;

        if (originalEnv.ADMIN_PASSWORD_HASH === undefined) delete process.env.ADMIN_PASSWORD_HASH;
        else process.env.ADMIN_PASSWORD_HASH = originalEnv.ADMIN_PASSWORD_HASH;

        await prisma.$disconnect();
    });

    beforeEach(async () => {
        process.env.ADMIN_USERNAME = 'admin';
        process.env.ADMIN_PASSWORD = 'super-secret';
        delete process.env.ADMIN_PASSWORD_HASH;

        // Clean users table before each test for isolation
        await prisma.user.deleteMany({ where: { username: 'admin' } });
    });

    // -------------------------------------------------------------------------

    test('bootstrapDefaultAdmin seeds admin user with hashed password', async () => {
        const adminManager = createAdminUserManager(prisma);
        await adminManager.bootstrapDefaultAdmin();

        const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
        expect(admin).toBeDefined();
        expect(admin.role).toBe('admin');
        expect(admin.password_hash).toBeDefined();
        // Hash should not be the plain text password
        expect(admin.password_hash).not.toEqual('super-secret');
    });

    // -------------------------------------------------------------------------

    test('login succeeds with seeded credentials and updates last_login_at', async () => {
        const adminManager = createAdminUserManager(prisma);
        await adminManager.bootstrapDefaultAdmin();

        const app  = buildApp(prisma);
        const loginResponse = await request(app)
            .post('/auth/login')
            .send({ username: 'admin', password: 'super-secret' });

        expect(loginResponse.status).toBe(200);

        const record = await prisma.user.findUnique({ where: { username: 'admin' } });
        expect(record.last_login_at).toBeTruthy();
    });

    // -------------------------------------------------------------------------

    test('password rotation invalidates old credentials and accepts new ones', async () => {
        const adminManager = createAdminUserManager(prisma);
        await adminManager.bootstrapDefaultAdmin();

        const app = buildApp(prisma);

        // Old password works
        const oldLoginResp = await request(app)
            .post('/auth/login')
            .send({ username: 'admin', password: 'super-secret' });
        expect(oldLoginResp.status).toBe(200);

        // Rotate password
        await adminManager.setAdminPassword({ password: 'new-secret' });

        // Old password rejected
        const failedLogin = await request(app)
            .post('/auth/login')
            .send({ username: 'admin', password: 'super-secret' });
        expect(failedLogin.status).toBe(401);

        // New password accepted
        const successLogin = await request(app)
            .post('/auth/login')
            .send({ username: 'admin', password: 'new-secret' });
        expect(successLogin.status).toBe(200);
    });

    // -------------------------------------------------------------------------

    test('authenticated change-password endpoint rotates credentials', async () => {
        const adminManager = createAdminUserManager(prisma);
        await adminManager.bootstrapDefaultAdmin();

        const app   = buildApp(prisma);
        const agent = request.agent(app);

        // Login
        const loginResp = await agent
            .post('/auth/login')
            .send({ username: 'admin', password: 'super-secret' });
        expect(loginResp.status).toBe(200);

        // Change password
        const changeResp = await agent
            .post('/auth/change-password')
            .send({ currentPassword: 'super-secret', newPassword: 'another-secret1', confirmPassword: 'another-secret1' });
        expect(changeResp.status).toBe(200);

        // Old password rejected
        const oldPwLogin = await agent
            .post('/auth/login')
            .send({ username: 'admin', password: 'super-secret' });
        expect(oldPwLogin.status).toBe(401);

        // New password accepted
        const newPwLogin = await agent
            .post('/auth/login')
            .send({ username: 'admin', password: 'another-secret1' });
        expect(newPwLogin.status).toBe(200);
    });
});
