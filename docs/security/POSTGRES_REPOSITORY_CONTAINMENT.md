# Remediation R4 — Tracked PostgreSQL runtime files

**SECURITY HOLD: this PR is intentionally draft. DO NOT MERGE until its operational prerequisites are complete.**

## Current scope
The public Git repository currently includes PostgreSQL runtime files under
`.postgres/data/`. They are runtime artifacts, not source code. This PR
removes the top-level `.postgres` subtree from **future tree snapshots**
and relies on the existing `.gitignore` entry to prevent ordinary re-addition.

## What this DOES NOT do
- It does **not** delete past Git commits, forks, clones, cached objects or
  downloaded copies. Historical objects may remain publicly retrievable.
- It does **not** prove whether production customer data, private keys,
  credentials or internal records were contained in the old snapshots.
- It does **not** rotate credentials or modify the hosted Supabase database.
- It does **not** safely preserve a developer's local tracked database directory:
  a `git pull` after merge can delete tracked files in existing clones.

## Required security response before merge
1. Quarantine and privately inspect an offline copy of the old committed
   PostgreSQL data for PII, secrets, authentication material and database origin.
   Do not upload findings, database dumps or credentials into a public issue/PR.
2. Ensure all developer machines with a local DB backup or restore it outside
   the tracked Git worktree, then confirm a clean recovery path.
3. Determine incident scope and whether token/password/key rotation or customer
   notifications are legally/operationally necessary.
4. Coordinate any history purge with repo owner/collaborators. A history rewrite
   requires special treatment of branches, tags, forks, caches and CI, and is
   not equivalent to merging this PR.
5. Confirm the live Vercel/Supabase infrastructure does not depend on any
   tracked local `.postgres` directory. Do not change production data here.

**Deployment risk:** no code or production DB migration in this PR, but a
future merge affects Git working trees and potentially local state. Review
with the repository owner first.
