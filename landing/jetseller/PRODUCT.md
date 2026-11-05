# Product: Buat Toko Online Sendiri

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Indonesian sellers and UMKM who want a store on their own domain and compatible server. The public pages explain the offer, collect contact and intended-store information, and provide a Git Clone guide. Server setup requires technical knowledge or an administrator.

## Product Purpose

This scoped product is the public landing, PostgreSQL-backed contact registration and public installation guidance. Successful registration saves the submitted information and returns a reference with status `REGISTERED`. It does not install, provision, authenticate, or connect a store.

## Operating Context

The landing leads to `/pendaftaran`. `/panduan` is public and can be read without registering; `/kebijakan-privasi` explains the registration data policy. Downloading the repository and installing/configuring the application on the seller's server are separate actions. Store administration happens in the independently installed application after verification.

## Capabilities and Constraints

- Collect required name, email, store/brand name and product category; WhatsApp, domain, city and description are optional. Consent is required before submission.
- Offer review and editing before sending. In-progress information stays in tab memory, with no form persistence in localStorage.
- Save registration data to the platform PostgreSQL store, separate from the demo store's database and media. The public flow has no applicant directory.
- Provide a saved reference and public Git Clone instructions. `REGISTERED` means information saved, never installed or production-ready.
- No central seller account, password, login, OTP, dashboard, server pairing or agent belongs to this flow. The independent store's local administration is a separate product capability.
- The owner approved Apache-2.0 licensing and the privacy contact `m.rifatsyauqii@gmail.com`. The repository license and privacy page remain authoritative for their full text; this document does not broaden those commitments.
- VPS/domain and third-party service costs remain separate. Git Clone retrieves code; it does not install or verify a store. J&T integration requires its own configuration and authorization.

## Brand Commitments

Preserve the existing landing design. Registration uses the specified four-step structure, white/red identity with brand red `#E1251B`, and Plus Jakarta Sans. UI copy is Indonesian and distinguishes registration from installation.

## Scope and Evidence

This document governs `landing/jetseller` only. It records the explicit task constraints and the inspected HTML, CSS and registration client; it does not replace the older product/design documents under `platform/installer-web`. Current code and local screenshots show implementation intent and rendered appearance, not proof of production deployment, deliverability, installer completeness or operational readiness. Surface-specific composition and evidence live in `.impeccable/registration-surface.md`.
