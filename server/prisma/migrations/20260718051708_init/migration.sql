-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('light', 'dark', 'system');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('zh-CN', 'en', 'ja', 'ko', 'fr', 'de', 'es');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('monthly', 'yearly', 'quarterly', 'semiannual');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'trial', 'cancelled');

-- CreateEnum
CREATE TYPE "RenewalType" AS ENUM ('auto', 'manual');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('succeeded', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'user');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('renewal_reminder', 'expiration_warning', 'renewal_success', 'renewal_failure', 'subscription_change');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('telegram', 'email');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('sent', 'failed');

-- CreateTable
CREATE TABLE "settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "theme" "Theme" NOT NULL DEFAULT 'system',
    "show_original_currency" BOOLEAN NOT NULL DEFAULT true,
    "language" "Language" NOT NULL DEFAULT 'zh-CN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" SERIAL NOT NULL,
    "from_currency" TEXT NOT NULL,
    "to_currency" TEXT NOT NULL,
    "rate" DECIMAL(15,8) NOT NULL,
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" SERIAL NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "billing_cycle" "BillingCycle" NOT NULL,
    "next_billing_date" DATE,
    "last_billing_date" DATE,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "payment_method_id" INTEGER NOT NULL,
    "start_date" DATE,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "category_id" INTEGER NOT NULL,
    "renewal_type" "RenewalType" NOT NULL DEFAULT 'manual',
    "notes" TEXT,
    "website" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_history" (
    "id" SERIAL NOT NULL,
    "subscription_id" INTEGER NOT NULL,
    "payment_date" DATE NOT NULL,
    "amount_paid" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "billing_period_start" DATE NOT NULL,
    "billing_period_end" DATE NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'succeeded',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_category_summary" (
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,
    "total_amount_in_base_currency" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "base_currency" TEXT NOT NULL DEFAULT 'INR',
    "transactions_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_category_summary_pkey" PRIMARY KEY ("year","month","category_id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'admin',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_settings" (
    "id" SERIAL NOT NULL,
    "notification_type" "NotificationType" NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "advance_days" INTEGER DEFAULT 7,
    "repeat_notification" BOOLEAN NOT NULL DEFAULT false,
    "notification_channels" TEXT NOT NULL DEFAULT '["telegram"]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_channels" (
    "id" SERIAL NOT NULL,
    "channel_type" "ChannelType" NOT NULL,
    "channel_config" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_history" (
    "id" SERIAL NOT NULL,
    "subscription_id" INTEGER NOT NULL,
    "notification_type" TEXT NOT NULL,
    "channel_type" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL,
    "recipient" TEXT NOT NULL,
    "message_content" TEXT NOT NULL,
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduler_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "notification_check_time" TEXT NOT NULL DEFAULT '09:00',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduler_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_from_currency_to_currency_key" ON "exchange_rates"("from_currency", "to_currency");

-- CreateIndex
CREATE UNIQUE INDEX "categories_value_key" ON "categories"("value");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_value_key" ON "payment_methods"("value");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "notification_settings_notification_type_key" ON "notification_settings"("notification_type");

-- CreateIndex
CREATE UNIQUE INDEX "notification_channels_channel_type_key" ON "notification_channels"("channel_type");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_history" ADD CONSTRAINT "payment_history_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_category_summary" ADD CONSTRAINT "monthly_category_summary_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_history" ADD CONSTRAINT "notification_history_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
