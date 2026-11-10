-- After creating a dedicated non-admin read_write role scoped to this isolated database.
-- Provisioning must select the preview branch explicitly. Never apply in production.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
 user_wallets, wallet_operations, wallet_oauth_flows, vanlinks, fiat_activity,
 fiat_webhook_events, command_environment, command_migrations FROM command_preview_app;
REVOKE UPDATE, DELETE, TRUNCATE ON command_audit FROM command_preview_app;
