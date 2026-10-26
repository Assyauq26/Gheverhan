# Rollback / release boundary

This PR is review-only. No Production deployment, migration, theme reset or live data write is authorized. Keep existing published themes and transaction services unchanged.

Before any later separately approved release, retain the previous application artifact and run the existing migration/preflight, unit, isolated PostgreSQL and browser checks. This feature introduces no database migration or persistent schema version, so application rollback needs no data rollback. After a separately approved release, roll back to the prior known-good application artifact or revert this PR through the normal reviewed release workflow. Do not reset database/theme records or remove product/cart/order data.

Verify catalog browsing, explicit variant selection, cart increments/badges, Buy Now, checkout totals, published themes and login continuation after either direction. Keep Production migrations and autodeploy controls governed by the existing release process. Do not push a rollback directly to main in this task.
