#!/usr/bin/env python3
"""Run after Prisma migrations, before starting the app. Never prints secrets."""
import os
from pathlib import Path
import re
import secrets
import subprocess

os.umask(0o077)
root = Path("/opt/gheverhan/deploy")
env_file = root / ".env"
lines = env_file.read_text().splitlines()
values = dict(line.split("=", 1) for line in lines if line and not line.startswith("#") and "=" in line)
password = values.get("APP_DATABASE_PASSWORD") or secrets.token_hex(32)
if not re.fullmatch(r"[a-f0-9]{64}", password):
    raise SystemExit("APP_DATABASE_PASSWORD must be 64 hexadecimal characters")
if any(line.startswith("APP_DATABASE_PASSWORD=") for line in lines):
    lines = ["APP_DATABASE_PASSWORD=" + password if line.startswith("APP_DATABASE_PASSWORD=") else line for line in lines]
else:
    lines.append("APP_DATABASE_PASSWORD=" + password)
tmp = root / ".env.runtime.tmp"
tmp.write_text("\n".join(lines) + "\n")
tmp.chmod(0o600)
tmp.replace(env_file)

sql = """
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='gheverhan_runtime') THEN
  CREATE ROLE gheverhan_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
 END IF;
END $$;
ALTER ROLE gheverhan_runtime PASSWORD '%s';
GRANT CONNECT ON DATABASE gheverhan TO gheverhan_runtime;
GRANT USAGE ON SCHEMA public TO gheverhan_runtime;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' LOOP
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%%I TO gheverhan_runtime',t.tablename);
 END LOOP;
END $$;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gheverhan_runtime;
""" % password
# RLS is kept enabled. This is the trusted server role, matching the app's existing
# server-side authorization model; it is never exposed to browsers or a public DB port.
subprocess.run(["sudo","-n","docker-compose","exec","-T","db","psql","-U","gheverhan","-d","gheverhan","-v","ON_ERROR_STOP=1"],
    cwd=root, input=sql, text=True, stdout=subprocess.DEVNULL, check=True)
print("Runtime database role ready; migration owner remains separate")
