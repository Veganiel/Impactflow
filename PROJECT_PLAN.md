# ImpactFlow — build status and next milestones

> **Historical planning note (v0.3).** Since then, the escrow contract has been deployed to NEAR Testnet and completed a full campaign → donation → milestone → payout cycle on-chain. See the [README](README.md) for current status.

## Product scope

ImpactFlow is an all-causes funding platform: animal welfare, nature/climate, social justice, humanitarian aid, public health, education and other public-benefit initiatives. Eligible users include individuals, NGOs, companies, community groups and public institutions.

## Implemented in v0.3

- Responsive impact discovery UI with multiple cause categories.
- Account creation and login; salted scrypt password hashes; HttpOnly SameSite session cookie.
- Local persistent API store for accounts, organization profiles and project submissions.
- Company, NGO, community, public-institution and individual organization types.
- Connected NEAR wallet account can be associated with the user's organization.
- Campaign creation and a private "my submissions" list; new submissions require review.
- HOT Labs NEAR Connect integration.
- Live NEAR Intents supported-token list and dry quote previews.
- Public/basic/advanced confidentiality selection forwarded to 1Click quote API.
- Server enforces `dry: true`; no deposit addresses or real transfers are enabled.

## Not implemented / not safe to claim

- No production database, persistent session store, email verification, password recovery, MFA or admin moderation interface.
- No legal verification, KYB/KYC, sanctions screening or secure evidence uploads.
- No audited NEAR escrow smart contract, on-chain donation accounting, milestone approval or payout/refund execution.
- No committed 1Click quotes, deposits, status tracking or refund reconciliation.
- No claim of full anonymity: Confidential Intents reduces public visibility of supported swap details but does not conceal all information from service operators or compliance processes.

## Next development milestones

1. Replace local JSON storage with PostgreSQL and Redis-backed sessions; add email verification, password reset and MFA.
2. Build organization review and KYB workflows, admin role separation, audit log and secure evidence storage.
3. Specify and test a NEAR escrow contract: campaign registry, donor accounting, milestone approvals, payout caps, cancellation and refunds. Obtain independent audit before mainnet.
4. Implement the full 1Click lifecycle only after contract and compliance design: committed quote, user-signed deposit, status polling, idempotent settlement and refund handling.
5. Add a dedicated admin console, public impact evidence pages, campaign reporting and analytics.
6. Deploy with secrets management, monitoring, backups, abuse prevention, incident response, privacy and legal review.
