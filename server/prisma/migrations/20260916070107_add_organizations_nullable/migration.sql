-- Stage 1 of the organization (multi-tenant) migration.
-- Adds the organizations table and organization_id as a NULLABLE column
-- everywhere it will eventually be required. Nullable for now so this
-- applies cleanly to tables that already have data; a backfill script
-- populates every row, and a follow-up migration then makes the column
-- required and adds the real constraints.

-- CreateTable
CREATE TABLE "organizations" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organizations_name_key" ON "organizations"("name");
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- AlterTable: add nullable organization_id columns
ALTER TABLE "users" ADD COLUMN "organization_id" INTEGER;
ALTER TABLE "subscriptions" ADD COLUMN "organization_id" INTEGER;
ALTER TABLE "payment_history" ADD COLUMN "organization_id" INTEGER;
ALTER TABLE "monthly_category_summary" ADD COLUMN "organization_id" INTEGER;
ALTER TABLE "settings" ADD COLUMN "organization_id" INTEGER;
ALTER TABLE "scheduler_settings" ADD COLUMN "organization_id" INTEGER;
ALTER TABLE "notification_settings" ADD COLUMN "organization_id" INTEGER;
ALTER TABLE "notification_channels" ADD COLUMN "organization_id" INTEGER;
ALTER TABLE "notification_history" ADD COLUMN "organization_id" INTEGER;
