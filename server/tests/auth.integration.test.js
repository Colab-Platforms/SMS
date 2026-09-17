/**
 * Auth Integration Tests — organization-scoped login.
 *
 * These tests use the real Prisma client connected to a test database.
 * Set DATABASE_URL to a test/shadow Neon branch in your CI environment.
 *
 * Each test creates its own organization + user and cleans them up afterwards.
 */

const express = require('express');
const session = require('express-session');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const { PrismaClient } = require('@prisma/client');
const createAuthRoutes = require('../routes/auth');

let prisma;

function buildApp(prismaClient) {
    const app = express();
    app.use(express.json());
    app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false }));
    app.use('/auth', createAuthRoutes(prismaClient));
    return app;
}

async function createTestOrgAndUser(prismaClient, { orgName, username, password }) {
    const organization = await prismaClient.organization.create({
        data: { name: orgName, slug: orgName.toLowerCase().replace(/\s+/g, '-'), is_active: true },
    });
    const user = await prismaClient.user.create({
        data: {
            organization_id: organization.id,
            username,
            password_hash: bcrypt.hashSync(password, 12),
            role: 'admin',
        },
    });
    return { organization, user };
}

describe('Organization-scoped authentication', () => {
    beforeAll(async () => {
        prisma = new PrismaClient();
        prisma.raw = prisma; // routes/auth.js expects db.raw for the pre-login lookup
        await prisma.$connect();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    afterEach(async () => {
        await prisma.user.deleteMany({ where: { organization: { slug: { startsWith: 'test-org' } } } });
        await prisma.organization.deleteMany({ where: { slug: { startsWith: 'test-org' } } });
    });

    // -------------------------------------------------------------------------

    test('login succeeds with correct organization, username and password, and updates last_login_at', async () => {
        const { organization, user } = await createTestOrgAndUser(prisma, {
            orgName: 'Test Org A', username: 'admin', password: 'super-secret',
        });

        const app = buildApp(prisma);
        const loginResponse = await request(app)
            .post('/auth/login')
            .send({ organizationId: organization.id, username: 'admin', password: 'super-secret' });

        expect(loginResponse.status).toBe(200);

        const record = await prisma.user.findUnique({ where: { id: user.id } });
        expect(record.last_login_at).toBeTruthy();
    });

    // -------------------------------------------------------------------------

    test('login fails when the username exists in a different organization', async () => {
        const { organization: orgA } = await createTestOrgAndUser(prisma, {
            orgName: 'Test Org A', username: 'admin', password: 'super-secret',
        });
        const { organization: orgB } = await createTestOrgAndUser(prisma, {
            orgName: 'Test Org B', username: 'admin', password: 'different-secret',
        });

        const app = buildApp(prisma);

        // Org A's id with Org B's password should fail — usernames aren't globally unique.
        const crossOrgLogin = await request(app)
            .post('/auth/login')
            .send({ organizationId: orgA.id, username: 'admin', password: 'different-secret' });
        expect(crossOrgLogin.status).toBe(401);

        // Sanity check: each org's own credentials still work independently.
        const orgALogin = await request(app)
            .post('/auth/login')
            .send({ organizationId: orgA.id, username: 'admin', password: 'super-secret' });
        expect(orgALogin.status).toBe(200);

        const orgBLogin = await request(app)
            .post('/auth/login')
            .send({ organizationId: orgB.id, username: 'admin', password: 'different-secret' });
        expect(orgBLogin.status).toBe(200);
    });

    // -------------------------------------------------------------------------

    test('login fails with wrong password', async () => {
        const { organization } = await createTestOrgAndUser(prisma, {
            orgName: 'Test Org A', username: 'admin', password: 'super-secret',
        });

        const app = buildApp(prisma);
        const response = await request(app)
            .post('/auth/login')
            .send({ organizationId: organization.id, username: 'admin', password: 'wrong-password' });

        expect(response.status).toBe(401);
    });

    // -------------------------------------------------------------------------

    test('authenticated change-password endpoint rotates credentials', async () => {
        const { organization } = await createTestOrgAndUser(prisma, {
            orgName: 'Test Org A', username: 'admin', password: 'super-secret',
        });

        const app   = buildApp(prisma);
        const agent = request.agent(app);

        // Login
        const loginResp = await agent
            .post('/auth/login')
            .send({ organizationId: organization.id, username: 'admin', password: 'super-secret' });
        expect(loginResp.status).toBe(200);

        // Change password
        const changeResp = await agent
            .post('/auth/change-password')
            .send({ currentPassword: 'super-secret', newPassword: 'another-secret1', confirmPassword: 'another-secret1' });
        expect(changeResp.status).toBe(200);

        // Old password rejected
        const oldPwLogin = await agent
            .post('/auth/login')
            .send({ organizationId: organization.id, username: 'admin', password: 'super-secret' });
        expect(oldPwLogin.status).toBe(401);

        // New password accepted
        const newPwLogin = await agent
            .post('/auth/login')
            .send({ organizationId: organization.id, username: 'admin', password: 'another-secret1' });
        expect(newPwLogin.status).toBe(200);
    });

    // -------------------------------------------------------------------------

    test('GET /auth/organizations lists active organizations without requiring login', async () => {
        const { organization } = await createTestOrgAndUser(prisma, {
            orgName: 'Test Org A', username: 'admin', password: 'super-secret',
        });

        const app = buildApp(prisma);
        const response = await request(app).get('/auth/organizations');

        expect(response.status).toBe(200);
        expect(response.body.organizations.some((o) => o.id === organization.id)).toBe(true);
    });
});
