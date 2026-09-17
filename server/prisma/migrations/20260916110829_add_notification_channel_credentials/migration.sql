-- Adds per-organization provider credentials storage for notification
-- channels (WasenderAPI key for whatsapp, Resend API key + verified "from"
-- address for email). Nullable and additive only — existing rows get NULL
-- and every existing recipient-list read/write path is unaffected.
--
-- SECURITY: this column must never be included in the response of
-- GET /protected/notifications/channels/:channelType (see the explicit
-- `select` in NotificationService.getChannelConfig()). Only the dedicated
-- credentials methods/endpoints touch this column.
ALTER TABLE "notification_channels" ADD COLUMN "credentials" TEXT;
