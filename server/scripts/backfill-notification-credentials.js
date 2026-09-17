#!/usr/bin/env node

/**
 * One-time backfill: copies today's global WasenderAPI / Resend credentials
 * (WASENDER_API_KEY, RESEND_API_KEY, EMAIL_FROM, EMAIL_LOCALE from .env) into
 * an existing organization's NotificationChannel.credentials, so its
 * notifications keep working after the per-company credentials feature ships
 * without needing the new Settings UI re-entered immediately.
 *
 * Idempotent: only writes a channel's credentials if that organization does
 * not already have credentials stored for it.
 *
 * Usage: node server/scripts/backfill-notification-credentials.js [--org-slug default]
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const prisma = require('../lib/prisma').raw; // unscoped — runs outside any org context

function parseArgs(argv) {
    const args = { orgSlug: 'default' };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--org-slug') args.orgSlug = argv[++i];
    }
    return args;
}

async function backfillChannel(orgId, channelType, credentials, label) {
    const existing = await prisma.notificationChannel.findUnique({
        where: { organization_id_channel_type: { organization_id: orgId, channel_type: channelType } },
    });
    if (existing?.credentials) {
        console.log(`ℹ️  ${channelType} credentials already present — skipping.`);
        return;
    }
    await prisma.notificationChannel.upsert({
        where:  { organization_id_channel_type: { organization_id: orgId, channel_type: channelType } },
        update: { credentials: JSON.stringify(credentials) },
        create: {
            organization_id: orgId,
            channel_type:    channelType,
            channel_config:  JSON.stringify({}),
            credentials:     JSON.stringify(credentials),
            is_active:       false,
        },
    });
    console.log(`✅ Backfilled ${channelType} credentials from ${label}.`);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const org = await prisma.organization.findUnique({ where: { slug: args.orgSlug } });
    if (!org) {
        console.error(`❌ No organization found with slug "${args.orgSlug}". Nothing to backfill.`);
        process.exit(1);
    }

    if (process.env.WASENDER_API_KEY) {
        await backfillChannel(org.id, 'whatsapp', { api_key: process.env.WASENDER_API_KEY }, 'WASENDER_API_KEY');
    } else {
        console.log('ℹ️  WASENDER_API_KEY not set — skipping whatsapp backfill.');
    }

    if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
        await backfillChannel(org.id, 'email', {
            api_key: process.env.RESEND_API_KEY,
            from:    process.env.EMAIL_FROM,
            locale:  process.env.EMAIL_LOCALE || 'zh-CN',
        }, 'RESEND_API_KEY/EMAIL_FROM/EMAIL_LOCALE');
    } else {
        console.log('ℹ️  RESEND_API_KEY and/or EMAIL_FROM not set — skipping email backfill.');
    }
}

main()
    .catch((error) => { console.error('❌ Backfill failed:', error); process.exit(1); })
    .finally(() => prisma.$disconnect());
