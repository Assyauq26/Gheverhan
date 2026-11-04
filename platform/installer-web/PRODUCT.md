# JetSeller installation workspace

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML, CSS and browser JavaScript served by the independent installer control plane. This implementation follows the parent task's explicit stack delegation; no store runtime or shared commerce authentication is reused.

## Users

Verified sellers preparing their own VPS and domain and checking installation progress. Their task is to create an installation intent, confirm a real device pairing and understand the next action.

## Product Purpose

Operate an independent self-hosted installation without sending store customer data, database passwords or shipping credentials to the center.

## Capabilities and Constraints

Use real same-origin registry/session/pairing APIs with authenticated ownership and CSRF checks. Show unavailable authentication and bootstrap honestly. A paired device is not an installed store; an installed store is not ready to sell. No production deployment, fake login, synthetic success or arbitrary remote shell. Bootstrap commands remain absent until verified distribution is configured.

## Brand Commitments

JetSeller red and white with restrained black primary actions; Indonesian labels and practical operator copy. Inherit the existing store dashboard's familiar sans typography, simple controls and restrained hierarchy without copying its commerce authority.

## Accessibility & Inclusion

Keyboard navigation, visible focus, explicit labels, 44px minimum controls, live error/status announcements, mobile-first flow and reduced-motion support. No external fonts, tracking or customer data.

## Open Decisions

Identity-provider deployment and independently trusted bootstrap distribution remain separate engineering gates; this surface does not invent them.
