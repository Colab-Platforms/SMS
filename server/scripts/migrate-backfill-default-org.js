#!/usr/bin/env node

/**
 * One-time backfill: assigns all existing (pre-multi-tenant) data to a
 * "Default Organization" and converts the existing single hardcoded admin
 * (from ADMIN_USERNAME/ADMIN_PASSWORD/ADMIN_PASSWORD_HASH) into a real login
 * under that company.
 *
 * Run this AFTER the first migration (which adds organization_id as a
 * nullable column everywhere) and BEFORE the second migration (which makes
 * organization_id required). See docs/plan for the full sequencing.
 *
 * Usage: node server/scripts/migrate-backfill-default-org.js [--org-name "My Company"] [--org-slug my-company]
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

// Deliberately a bare, unextended PrismaClient — this script runs before any
// company context can exist, and needs to read/write across all rows.
const prisma = new PrismaClient();

function parseArgs(argv) {
    const args = { orgName: 'Default Organization', orgSlug: 'default' };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--org-name') args.orgName = argv[++i];
        if (argv[i] === '--org-slug') args.orgSlug = argv[++i];
    }
    return args;
}

function resolveAdminPasswordHash() {
    if (process.env.ADMIN_PASSWORD_HASH) return process.env.ADMIN_PASSWORD_HASH;
    if (process.env.ADMIN_PASSWORD) return bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12);
    return bcrypt.hashSync('admin', 12);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    const existingOrgCount = await prisma.organization.count();
    if (existingOrgCount > 0) {
        console.log('ℹ️  Organizations already exist — this backfill has probably already run. Doing nothing.');
        return;
    }

    console.log(`🏢 Creating "${args.orgName}" (slug: ${args.orgSlug})...`);
    const org = await prisma.organization.create({
        data: { name: args.orgName, slug: args.orgSlug, is_active: true },
    });

    console.log('📦 Assigning existing rows to this organization...');
    const [subs, settings, schedulerSettings, notificationSettings, notificationChannels] = await Promise.all([
        prisma.subscription.updateMany({ data: { organization_id: org.id } }),
        prisma.settings.updateMany({ data: { organization_id: org.id } }),
        prisma.schedulerSettings.updateMany({ data: { organization_id: org.id } }),
        prisma.notificationSetting.updateMany({ data: { organization_id: org.id } }),
        prisma.notificationChannel.updateMany({ data: { organization_id: org.id } }),
    ]);
    console.log(`   subscriptions: ${subs.count}, settings: ${settings.count}, schedulerSettings: ${schedulerSettings.count}, notificationSettings: ${notificationSettings.count}, notificationChannels: ${notificationChannels.count}`);

    // payment_history / notification_history: derive organization_id from
    // the parent subscription rather than a flat constant, so this script
    // stays correct if it's ever reused with more than one pre-existing org.
    const paymentHistoryUpdated = await prisma.$executeRaw`
        UPDATE payment_history ph
        SET organization_id = s.organization_id
        FROM subscriptions s
        WHERE ph.subscription_id = s.id AND ph.organization_id IS NULL
    `;
    console.log(`   payment_history: ${paymentHistoryUpdated}`);

    const notificationHistoryUpdated = await prisma.$executeRaw`
        UPDATE notification_history nh
        SET organization_id = s.organization_id
        FROM subscriptions s
        WHERE nh.subscription_id = s.id AND nh.organization_id IS NULL
    `;
    console.log(`   notification_history: ${notificationHistoryUpdated}`);

    const monthlyCategorySummaryUpdated = await prisma.monthlyCategorySummary.updateMany({
        data: { organization_id: org.id },
    });
    console.log(`   monthly_category_summary: ${monthlyCategorySummaryUpdated.count}`);

    // Convert today's single hardcoded admin (env-var based) into a real
    // per-company login, if one isn't already in the users table.
    const existingUserCount = await prisma.user.count();
    if (existingUserCount === 0) {
        const adminUsername = process.env.ADMIN_USERNAME || 'admin';
        const passwordHash  = resolveAdminPasswordHash();
        await prisma.user.create({
            data: {
                organization_id: org.id,
                username: adminUsername,
                password_hash: passwordHash,
                role: 'admin',
            },
        });
        console.log(`👤 Created admin login "${adminUsername}" under "${org.name}" (from ADMIN_USERNAME/ADMIN_PASSWORD env vars).`);
    } else {
        console.log('👤 Assigning existing user row(s) to this organization...');
        const usersUpdated = await prisma.user.updateMany({ data: { organization_id: org.id } });
        console.log(`   users: ${usersUpdated.count}`);
    }

    console.log('✅ Backfill complete. Verify with the check query before running the follow-up migration that makes organization_id required.');
}

main()
    .catch((error) => {
        console.error('❌ Backfill failed:', error);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
