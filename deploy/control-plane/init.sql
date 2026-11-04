-- Fresh dedicated control database only. Read secrets inside PostgreSQL, never echo.
REVOKE ALL ON DATABASE jetseller_control_plane FROM PUBLIC;
SELECT format('CREATE ROLE js_control_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', trim(pg_read_file('/run/secrets/owner_password'))) \gexec
SELECT format('CREATE ROLE js_control_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', trim(pg_read_file('/run/secrets/runtime_password'))) \gexec
GRANT CONNECT ON DATABASE jetseller_control_plane TO js_control_owner, js_control_runtime;
GRANT CREATE ON DATABASE jetseller_control_plane TO js_control_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
