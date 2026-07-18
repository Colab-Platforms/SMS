#!/usr/bin/env node

/**
 * Data Reset Script — Prisma + NeonDB version.
 * Resets payment_history and monthly_category_summary tables.
 *
 * Usage:
 *   node resetData.js --payment-history              Reset payment_history table
 *   node resetData.js --monthly-category-summary     Reset monthly_category_summary table
 *   node resetData.js --all                          Reset all tables
 *   node resetData.js --payment-history --recalculate  Reset payment_history & recalculate summaries
 *   node resetData.js --rebuild-from-subscriptions   Rebuild all payment history from subscriptions
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const prisma  = require('../lib/prisma');
const MonthlyCategorySummaryService = require('../services/monthlyCategorySummaryService');
const logger  = require('../utils/logger');

// ---- Parse arguments -------------------------------------------------------
const args = process.argv.slice(2);
const resetPaymentHistory           = args.includes('--payment-history')           || args.includes('--all');
const resetMonthlyCategorySummary   = args.includes('--monthly-category-summary')  || args.includes('--all');
const recalculateAfterReset         = args.includes('--recalculate');
const rebuildFromSubscriptions      = args.includes('--rebuild-from-subscriptions');

console.log('🔧 Data Reset Script (NeonDB / Prisma)');

if (!resetPaymentHistory && !resetMonthlyCategorySummary && !rebuildFromSubscriptions) {
    console.log(`
Usage:
  node resetData.js [options]

Options:
  --payment-history              Reset payment_history table
  --monthly-category-summary     Reset monthly_category_summary table
  --all                          Reset all tables
  --recalculate                  Recalculate monthly summaries after resetting payment_history
  --rebuild-from-subscriptions   Rebuild payment_history from subscriptions, then recalculate summaries

Examples:
  node resetData.js --all
  node resetData.js --payment-history
  node resetData.js --payment-history --recalculate
  node resetData.js --rebuild-from-subscriptions
`);
    process.exit(0);
}

// ---- Main ------------------------------------------------------------------
async function resetData() {
    const monthlyCategorySummaryService = new MonthlyCategorySummaryService(prisma);

    try {
        // ---- Reset payment_history ------------------------------------------
        if (resetPaymentHistory) {
            console.log('\n📝 Resetting payment_history table...');
            const currentCount = await prisma.paymentHistory.count();
            console.log(`📊 Current records: ${currentCount}`);

            if (currentCount > 0) {
                const result = await prisma.paymentHistory.deleteMany({});
                console.log(`🗑️  Deleted ${result.count} payment_history records`);
            } else {
                console.log('ℹ️  payment_history is already empty');
            }
        }

        // ---- Reset monthly_category_summary ---------------------------------
        if (resetMonthlyCategorySummary) {
            console.log('\n📝 Resetting monthly_category_summary table...');
            const currentCount = await prisma.monthlyCategorySummary.count();
            console.log(`📊 Current records: ${currentCount}`);

            if (currentCount > 0) {
                const result = await prisma.monthlyCategorySummary.deleteMany({});
                console.log(`🗑️  Deleted ${result.count} monthly_category_summary records`);
            } else {
                console.log('ℹ️  monthly_category_summary is already empty');
            }
        }

        // ---- Rebuild payment history from subscriptions ---------------------
        if (rebuildFromSubscriptions) {
            console.log('\n🔄 Rebuilding payment_history from subscriptions...');

            // Clear existing payment history
            const deleted = await prisma.paymentHistory.deleteMany({});
            console.log(`🗑️  Cleared ${deleted.count} existing payment_history records`);

            // Clear existing monthly summaries
            await prisma.monthlyCategorySummary.deleteMany({});

            // Rebuild from each subscription
            const subscriptions = await prisma.subscription.findMany({
                where: { start_date: { not: null } },
                select: {
                    id: true, start_date: true, billing_cycle: true,
                    amount: true, currency: true, last_billing_date: true, status: true,
                },
            });

            console.log(`📊 Found ${subscriptions.length} subscriptions to process`);

            let totalPayments = 0;
            for (const sub of subscriptions) {
                try {
                    console.log(`🔄 Processing subscription ${sub.id} (${sub.billing_cycle})`);
                    const payments = generateHistoricalPayments(sub);

                    if (payments.length > 0) {
                        await prisma.paymentHistory.createMany({
                            data: payments.map((p) => ({
                                subscription_id:      sub.id,
                                payment_date:         new Date(p.payment_date),
                                amount_paid:          sub.amount,
                                currency:             sub.currency,
                                billing_period_start: new Date(p.billing_period_start),
                                billing_period_end:   new Date(p.billing_period_end),
                                status:               'succeeded',
                                notes:                'Rebuilt from subscription data',
                            })),
                        });
                        totalPayments += payments.length;
                        console.log(`   ✅ Generated ${payments.length} records for subscription ${sub.id}`);
                    }
                } catch (error) {
                    console.error(`   ❌ Error processing subscription ${sub.id}:`, error.message);
                }
            }

            console.log(`✅ Rebuilt ${totalPayments} payment_history records`);

            // Recalculate monthly summaries
            console.log('\n🔄 Recalculating monthly_category_summary...');
            await monthlyCategorySummaryService.recalculateAllMonthlyCategorySummaries();
            console.log('✅ monthly_category_summary recalculated');
        }

        // ---- Recalculate after payment history reset ------------------------
        if (resetPaymentHistory && recalculateAfterReset && !rebuildFromSubscriptions) {
            console.log('\n🔄 Recalculating monthly_category_summary...');
            await monthlyCategorySummaryService.recalculateAllMonthlyCategorySummaries();
            console.log('✅ monthly_category_summary recalculated');
        }

        // ---- Final status ---------------------------------------------------
        console.log('\n🎉 Data reset complete!');
        console.log('\n📊 Final status:');
        const [paymentCount, summaryCount] = await Promise.all([
            prisma.paymentHistory.count(),
            prisma.monthlyCategorySummary.count(),
        ]);
        console.log(`   payment_history:           ${paymentCount} records`);
        console.log(`   monthly_category_summary:  ${summaryCount} records`);

    } catch (error) {
        console.error('❌ Reset failed:', error.message);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// ---- Helpers ---------------------------------------------------------------

function generateHistoricalPayments(subscription) {
    const payments  = [];
    if (!subscription.start_date) return payments;

    const startDate = new Date(subscription.start_date);
    const today     = new Date();
    today.setHours(0, 0, 0, 0);

    if (subscription.status === 'cancelled' && !subscription.last_billing_date) {
        const end = calculateNextBillingDate(startDate, subscription.billing_cycle);
        payments.push({
            payment_date:         startDate.toISOString().split('T')[0],
            billing_period_start: startDate.toISOString().split('T')[0],
            billing_period_end:   end.toISOString().split('T')[0],
        });
        return payments;
    }

    const endDate     = subscription.last_billing_date ? new Date(subscription.last_billing_date) : today;
    let   currentDate = new Date(startDate);

    while (currentDate <= endDate) {
        const next = calculateNextBillingDate(currentDate, subscription.billing_cycle);
        payments.push({
            payment_date:         currentDate.toISOString().split('T')[0],
            billing_period_start: currentDate.toISOString().split('T')[0],
            billing_period_end:   next.toISOString().split('T')[0],
        });
        currentDate = new Date(next);
    }

    return payments;
}

function calculateNextBillingDate(date, billingCycle) {
    const next = new Date(date);
    switch (billingCycle) {
        case 'monthly':    next.setMonth(next.getMonth() + 1);         break;
        case 'quarterly':  next.setMonth(next.getMonth() + 3);         break;
        case 'semiannual': next.setMonth(next.getMonth() + 6);         break;
        case 'yearly':     next.setFullYear(next.getFullYear() + 1);   break;
        default: throw new Error(`Unknown billing cycle: ${billingCycle}`);
    }
    return next;
}

// ---- Run -------------------------------------------------------------------
resetData();
