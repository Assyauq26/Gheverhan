#!/bin/sh
set -eu
runtime_password=$(cat /run/secrets/runtime_password)
migration_password=$(cat /run/secrets/migration_password)
for secret in "$runtime_password" "$migration_password"; do
 case "$secret" in ''|*[!a-f0-9]*) exit 1;; esac
 [ "${#secret}" -eq 64 ] || exit 1
done
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE js_migrate LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '$migration_password';
CREATE ROLE js_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS PASSWORD '$runtime_password';
ALTER DATABASE "$POSTGRES_DB" OWNER TO js_migrate;
ALTER SCHEMA public OWNER TO js_migrate;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO js_runtime;
GRANT USAGE ON SCHEMA public TO js_runtime;
SQL
