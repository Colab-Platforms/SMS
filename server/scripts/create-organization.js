#!/usr/bin/env node

/**
 * Provision a new company (organization) and its first admin login.
 *
 * Usage:
 *   node server/scripts/create-organization.js \
 *     --name "Acme Corp" --slug acme-corp \
 *     --admin-username admin --admin-password "SomeStrongPassword" \
 *     [--currency INR]
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const prisma = require('../lib/prisma').raw; // unscoped — no org context exists yet
const { hashPassword } = require('../utils/password');
const { getBaseCurrency } = require('../config/currencies');
const { DEFAULT_NOTIFICATION_SETTINGS } = require('../config/defaultNotificationSettings');

function printUsage() {
    console.log('Usage: node server/scripts/create-organization.js --name <name> --slug <slug> --admin-username <username> --admin-password <password> [--currency <code>]');
    console.log('Options:');
    console.log('  --name              Company display name (must be unique)');
    console.log('  --slug              Short unique identifier, e.g. "acme-corp"');
    console.log('  --admin-username    Username for the company\'s first admin login');
    console.log('  --admin-password    Plain text password (will be bcrypt-hashed)');
    console.log('  --admin-password-hash   Pre-generated bcrypt hash, instead of --admin-password');
    console.log('  --currency          Default currency code for this company (default: app base currency)');
    console.log('  --help              Show this message');
}

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        switch (arg) {
            case '--name': args.name = argv[++i]; break;
            case '--slug': args.slug = argv[++i]; break;
            case '--admin-username': args.adminUsername = argv[++i]; break;
            case '--admin-password': args.adminPassword = argv[++i]; break;
            case '--admin-password-hash': args.adminPasswordHash = argv[++i]; break;
            case '--currency': args.currency = argv[++i]; break;
            case '--help': args.help = true; break;
            default:
                console.error(`Unknown argument: ${arg}`);
                args.help = true;
        }
    }
    return args;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    const hasCredential = args.adminPassword || args.adminPasswordHash;
    if (args.help || !args.name || !args.slug || !args.adminUsername || !hasCredential) {
        printUsage();
        process.exit(args.help ? 0 : 1);
    }
    if (args.adminPassword && args.adminPasswordHash) {
        console.error('Please provide either --admin-password or --admin-password-hash, not both.');
        process.exit(1);
    }

    try {
        const organization = await prisma.organization.create({
            data: { name: args.name, slug: args.slug, is_active: true },
        });

        const passwordHash = args.adminPasswordHash || hashPassword(args.adminPassword);
        const admin = await prisma.user.create({
            data: {
                organization_id: organization.id,
                username: args.adminUsername,
                password_hash: passwordHash,
                role: 'admin',
            },
        });

        await prisma.settings.create({
            data: {
                organization_id: organization.id,
                currency: args.currency || getBaseCurrency(),
            },
        });

        await prisma.schedulerSettings.create({
            data: { organization_id: organization.id },
        });

        for (const setting of DEFAULT_NOTIFICATION_SETTINGS) {
            await prisma.notificationSetting.create({
                data: { organization_id: organization.id, ...setting },
            });
        }

        console.log(`✅ Organization "${organization.name}" (id=${organization.id}, slug=${organization.slug}) created.`);
        console.log(`✅ Admin login "${admin.username}" created for this company.`);
    } catch (error) {
        if (error.code === 'P2002') {
            console.error('❌ A company with that name/slug (or a user with that username in this company) already exists.');
        } else {
            console.error('❌ Failed to create organization:', error.message);
        }
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main();
}

module.exports = { main };
