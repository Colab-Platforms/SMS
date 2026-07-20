-- Rename the enum value in place (Postgres 10+, no table rewrite, no data loss).
ALTER TYPE "ChannelType" RENAME VALUE 'telegram' TO 'whatsapp';

-- Defensive data fix: notification_settings.notification_channels is a free-form
-- string column, NOT bound to the ChannelType enum, so the rename above does not
-- touch it. This is a no-op if no row references "telegram", but safe/idempotent
-- to run regardless.
UPDATE "notification_settings"
SET "notification_channels" = REPLACE("notification_channels", 'telegram', 'whatsapp')
WHERE "notification_channels" LIKE '%telegram%';
