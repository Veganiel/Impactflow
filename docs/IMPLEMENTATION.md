# Implementation notes — ImpactFlow v0.5

## Architecture

- `index.html`, `styles.css`, `app.js`: responsive single-page application.
- `server/index.js`: Express API, authentication, organization and campaign endpoints, NEAR Intents proxy.
- `data/impactflow.json`: local development persistence; created at runtime and ignored by Git.
- `contract/`: native-NEAR Rust escrow prototype and unit tests.
- `tests/api-smoke.test.js`: API integration smoke test for registration, organization onboarding and campaign moderation.
- `@hot-labs/near-connect`: user-controlled NEAR wallet connection.

## API

- `POST /api/auth/register` — validates email/password, stores a salted scrypt hash, creates HttpOnly session cookie.
- `POST /api/auth/login` — verifies password hash and creates session.
- `POST /api/auth/logout`, `GET /api/auth/me`.
- `POST /api/organizations`, `GET /api/organizations/me`, `PATCH /api/organizations/wallet`.
- `POST /api/projects`, `GET /api/projects`, `GET /api/projects/mine`.
- `GET /api/near-intents/tokens` — live 1Click token list.
- `POST /api/near-intents/quote-preview` — 1Click quote with server-enforced `dry: true`.

## Security boundaries

Passwords are never stored in plaintext. The local prototype uses scrypt and random salts. Sessions are opaque random tokens in HttpOnly SameSite cookies and held in process memory; they expire after seven days or on restart. JSON storage is appropriate only for a single-process demo and is not safe for multi-instance production use. No email verification, password reset, MFA, role-based admin review, KYB, file upload, durable session store, CSRF token, or production database is implemented.

Organization status is always `unverified` by default. Campaign submissions are `pending_review` and are not published. User-provided wallet IDs are association metadata only; wallet ownership is not proven by saving an account ID. The connected wallet UI is user-initiated, but no transaction signing is invoked.

## NEAR Intents / privacy

The app calls `GET /v0/tokens` and `POST /v0/quote`. The server forces `dry: true` regardless of client input. The quote UI accepts the 1Click `confidentiality` options `public`, `basic` and `advanced`. The quote request is only a preview: no deposit address, deposit, signed intent, transaction status or refund workflow exists yet. Confidential mode reduces public visibility of supported execution details; it is not anonymity and does not prevent service operators or compliance systems from processing transaction information.

1Click flow for a future production implementation: quote (`dry:false`) → display and validate deposit instructions → user-signed deposit → deposit notification (if needed) → poll status → reconcile success/refund. That flow must be implemented with idempotency, quote expiry, chain-specific address validation, transaction verification, limits, monitoring and legal/security review. No part of it is enabled here.

## Test commands

- `npm run check` — JavaScript syntax checks.
- `npm test` — Node API smoke test (requires npm dependencies installed).
- `cd contract && cargo test` — Rust contract unit tests (requires Rust toolchain and dependency access).

## Production roadmap

1. Move data to PostgreSQL and sessions to a persistent store; add email verification, password reset, MFA and CSRF protection.
2. Build admin review and KYB verification workflow; store evidence securely and minimize personal data.
3. Implement a NEAR escrow contract with project-level accounting, milestone proposal, multi-party approval, payout, cancellation and refund rules. Add tests and third-party audit before mainnet.
4. Add wallet signature proof for account ownership and chain-aware wallet management.
5. Implement a 1Click committed quote and status lifecycle behind explicit user consent and audited transaction handling.
6. Test Confidential Intents routes against the current 1Click API, communicate limits clearly and perform privacy review.
7. Add monitoring, rate limits, backups, abuse prevention, incident response and legal/compliance review before real funds.

## References

- HOT Labs NEAR Connect: https://hot-labs.org/near-connect
- NEAR Intents 1Click API: https://docs.near-intents.org/integration/distribution-channels/1click-api
- NEAR Intents partner portal: https://partners.near-intents.org/
