#!/bin/sh
set -eu
# Explicit post-migration operation. Password never appears in a command argument.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' LOOP
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO js_runtime',t.tablename);
 END LOOP;
END $$;
GRANT SELECT ON TABLE public._prisma_migrations TO js_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO js_runtime;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO js_runtime;
SQL
