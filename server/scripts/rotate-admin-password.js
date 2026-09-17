#!/usr/bin/env node

/**
 * Rotate a user's password for a specific company (organization).
 * Usage:
 *   node server/scripts/rotate-admin-password.js --org-slug <slug> --username <username> [--password <newPassword> | --hash <bcryptHash>]
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const prisma = require('../lib/prisma').raw;
const { hashPassword } = require('../utils/password');

function printUsage() {
    console.log('Usage: node server/scripts/rotate-admin-password.js --org-slug <slug> --username <username> [--password <newPassword> | --hash <bcryptHash>]');
    console.log('Options:');
    console.log('  --org-slug        Slug of the company whose user password is being rotated');
    console.log('  --username        Username within that company');
    console.log('  --password, -p    Plain text password that will be hashed before storing');
    console.log('  --hash, -h        Pre-generated bcrypt hash to store directly');
    console.log('  --help            Show this message');
}

function parseArgs(argv) {
    const args = { orgSlug: undefined, username: undefined, password: undefined, hash: undefined, help: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        switch (arg) {
            case '--org-slug':
                args.orgSlug = argv[i + 1]; i += 1; break;
            case '--username':
                args.username = argv[i + 1]; i += 1; break;
            case '--password': case '-p':
                args.password = argv[i + 1]; i += 1; break;
            case '--hash': case '-h':
                args.hash = argv[i + 1]; i += 1; break;
            case '--help':
                args.help = true; break;
            default:
                console.error(`Unknown argument: ${arg}`);
                args.help = true; break;
        }
    }
    return args;
}

async function main() {
    const argv = process.argv.slice(2);
    const args = parseArgs(argv);

    const missingCredential = (!args.password || args.password.startsWith('--')) && (!args.hash || args.hash.startsWith('--'));
    if (args.help || !args.orgSlug || !args.username || missingCredential) {
        printUsage();
        process.exit(args.help ? 0 : 1);
    }

    if (args.password && args.hash) {
        console.error('Please provide either --password or --hash, not both.');
        process.exit(1);
    }

    try {
        const organization = await prisma.organization.findUnique({ where: { slug: args.orgSlug } });
        if (!organization) {
            console.error(`❌ No organization found with slug "${args.orgSlug}".`);
            process.exit(1);
        }

        const user = await prisma.user.findFirst({ where: { organization_id: organization.id, username: args.username } });
        if (!user) {
            console.error(`❌ No user "${args.username}" found in organization "${organization.name}".`);
            process.exit(1);
        }

        const newHash = args.hash || hashPassword(args.password);
        await prisma.user.update({ where: { id: user.id }, data: { password_hash: newHash } });

        console.log(`✅ Password updated for "${args.username}" in "${organization.name}".`);
        console.log(`🔐 Stored hash: ${newHash}`);
    } catch (error) {
        console.error('❌ Failed to rotate password:', error.message);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main();
}

module.exports = { main };
