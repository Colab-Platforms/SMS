-- Stage 2 of the organization (multi-tenant) migration.
-- Run only after the backfill script has assigned organization_id on every
-- existing row (verified: zero NULLs). Makes organization_id required,
-- switches per-company tables' identity constraints to be scoped by
-- organization, and adds the foreign keys.

-- users: organization-scoped username uniqueness instead of global
ALTER TABLE "users" ALTER COLUMN "organization_id" SET NOT NULL;
DROP INDEX "users_username_key";
CREATE UNIQUE INDEX "users_organization_id_username_key" ON "users"("organization_id", "username");
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- subscriptions
ALTER TABLE "subscriptions" ALTER COLUMN "organization_id" SET NOT NULL;
CREATE INDEX "subscriptions_organization_id_idx" ON "subscriptions"("organization_id");
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- payment_history
ALTER TABLE "payment_history" ALTER COLUMN "organization_id" SET NOT NULL;
CREATE INDEX "payment_history_organization_id_idx" ON "payment_history"("organization_id");
ALTER TABLE "payment_history" ADD CONSTRAINT "payment_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- monthly_category_summary: primary key becomes organization-scoped
ALTER TABLE "monthly_category_summary" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "monthly_category_summary" DROP CONSTRAINT "monthly_category_summary_pkey";
ALTER TABLE "monthly_category_summary" ADD CONSTRAINT "monthly_category_summary_pkey" PRIMARY KEY ("organization_id", "year", "month", "category_id");
ALTER TABLE "monthly_category_summary" ADD CONSTRAINT "monthly_category_summary_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- settings: singleton row per organization instead of a single global row.
-- The old PK was a hardcoded id (always 1); switch id to a real
-- auto-incrementing surrogate key and make organization_id the natural
-- unique key services look up by.
CREATE SEQUENCE IF NOT EXISTS "settings_id_seq" OWNED BY "settings"."id";
SELECT setval('settings_id_seq', COALESCE((SELECT MAX(id) FROM "settings"), 0) + 1, false);
ALTER TABLE "settings" ALTER COLUMN "id" SET DEFAULT nextval('settings_id_seq');
ALTER TABLE "settings" ALTER COLUMN "organization_id" SET NOT NULL;
CREATE UNIQUE INDEX "settings_organization_id_key" ON "settings"("organization_id");
ALTER TABLE "settings" ADD CONSTRAINT "settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- scheduler_settings: same singleton-to-per-organization treatment
CREATE SEQUENCE IF NOT EXISTS "scheduler_settings_id_seq" OWNED BY "scheduler_settings"."id";
SELECT setval('scheduler_settings_id_seq', COALESCE((SELECT MAX(id) FROM "scheduler_settings"), 0) + 1, false);
ALTER TABLE "scheduler_settings" ALTER COLUMN "id" SET DEFAULT nextval('scheduler_settings_id_seq');
ALTER TABLE "scheduler_settings" ALTER COLUMN "organization_id" SET NOT NULL;
CREATE UNIQUE INDEX "scheduler_settings_organization_id_key" ON "scheduler_settings"("organization_id");
ALTER TABLE "scheduler_settings" ADD CONSTRAINT "scheduler_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- notification_settings: organization-scoped notification_type uniqueness
ALTER TABLE "notification_settings" ALTER COLUMN "organization_id" SET NOT NULL;
DROP INDEX "notification_settings_notification_type_key";
CREATE UNIQUE INDEX "notification_settings_organization_id_notification_type_key" ON "notification_settings"("organization_id", "notification_type");
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- notification_channels: organization-scoped channel_type uniqueness
ALTER TABLE "notification_channels" ALTER COLUMN "organization_id" SET NOT NULL;
DROP INDEX "notification_channels_channel_type_key";
CREATE UNIQUE INDEX "notification_channels_organization_id_channel_type_key" ON "notification_channels"("organization_id", "channel_type");
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- notification_history
ALTER TABLE "notification_history" ALTER COLUMN "organization_id" SET NOT NULL;
CREATE INDEX "notification_history_organization_id_idx" ON "notification_history"("organization_id");
ALTER TABLE "notification_history" ADD CONSTRAINT "notification_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
