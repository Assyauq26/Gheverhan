# Seller J&T settings simplification

Status: READY_FOR_REVIEW; stacked on JNT-SH-01 PR #141, not merged or deployed. Checkout remains fail-closed pending JNT-SH-02 and provider-authorized UAT.

Local seller settings now lead with the three Order account fields. Check Fee and tracking keep their own credentials, exposed through native accessible disclosure controls (expanded for an initially unconfigured account). Technical endpoint URLs and unavailable Order/Cancel verification are behind explicit advanced disclosures. No credential sharing between endpoints is inferred. Saved values are still never downloaded into inputs; blank preserves and replacement rotates through the existing backend.

The main actions are Simpan Pengaturan and Uji Koneksi. The connection action uses the existing read-only Check Fee probe against saved configuration, with server-side permissions/rate/Production gates. A response means Check Fee succeeded, not shipment/payment UAT or checkout activation. There are no real Order/Cancel calls, invented tariffs or safe-probe success. The local settings screen hides implementation milestone identifiers, preserves warehouse/service agreement requirements, and keeps Sandbox/Production separate.

This UI change does not certify region mapping. Administrative region IDs and J&T origin codes are not assumed interchangeable. Existing contract origin fields remain until an approved origin mapping supports a real searchable selector; that is a JNT-SH-02 product gap. EZ remains the only represented contracted service; no unverified HBO/JND/ECO choice is added.

Verification: Node22 typecheck PASS, lint PASS with existing unrelated hero-editor image warning; scoped detector returned no findings. Synthetic component browser captures inspected at 1440/390 with no page errors/overflow, hidden endpoint details and visible primary safe connection action. These captures are contract fixtures, not real J&T account or production evidence. The existing actual PostgreSQL/API/browser test updates labels and opens native Order disclosure while retaining authorization, encryption/redaction, secret clearing, audit and all eight viewport checks. Exact-HEAD CI is the authority for those integration results.

No carrier transport, encryption, secret schema, RBAC, deployment gate, production setting, database or visibility changed. Revert this UI/test/document PR for rollback; no data migration.
