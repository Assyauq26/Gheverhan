-- Execute as migration owner after 001–004 in the dedicated database.
GRANT USAGE ON SCHEMA installer TO js_control_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA installer TO js_control_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA installer TO js_control_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA installer GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO js_control_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA installer GRANT USAGE, SELECT ON SEQUENCES TO js_control_runtime;
