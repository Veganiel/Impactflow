# ImpactFlow security posture

ImpactFlow is a hackathon prototype. This note describes implemented safeguards and remaining risks; it is not a security audit or a claim that the system is attack-proof.

## Implemented safeguards

- Passwords use per-user salted scrypt hashes, not plaintext.
- Account cookies are HttpOnly and SameSite=Lax; production cookies use Secure and expire after seven days.
- State-changing API requests carrying an Origin header are restricted to configured `APP_ORIGIN` values.
- A general per-client API limit and a per-client/per-account failed-login throttle reduce basic abuse and password guessing.
- Unknown accounts still perform a password hash operation to reduce timing-based account discovery.
- Responses set MIME-sniffing, clickjacking, referrer and browser-permission headers; production responses also set HSTS.
- JSON request bodies are limited to 32 KB.

Implementation and regression checks: `server/index.js` and `tests/api-smoke.test.js`.

## Smart contract safeguards

- Payouts only go to the recipient fixed at campaign creation; the reviewer can release funds but not redirect them.
- Releases require submitted HTTPS evidence and reviewer approval; staked principal cannot be released.
- Contract state is updated before external calls, and failed transfers or pool calls are rolled back in callbacks.
- All escrow arithmetic is checked for overflow and underflow.
- Campaign creators pay for their own storage (excess refunded), and campaigns are capped at 20 milestones, which prevents storage-griefing attacks that could otherwise lock the escrow balance.
- Donations close at each campaign's hold date; staking must end before it, and anyone can force the unstake in the final three days.
- 34 unit tests cover access control, accounting, staking callbacks, hold dates, migrations and storage charging.

## Review on 13 November 2026

- Frontend: every server- or chain-supplied value written as HTML is escaped (`esc`); evidence links must be HTTPS.
- Dependencies: `npm audit` reported 0 vulnerabilities.
- Repository and git history contain no keys, tokens or `.env` files.

## Trust boundaries

- The browser never receives `NEAR_INTENTS_JWT`; the API proxies partner requests.
- The API does not hold or transfer user funds. Users review and send deposits from their own wallet.
- Testnet escrow is a separate on-chain component. State changes need user wallet signatures; the deployed contract is not independently audited.
- Organization profiles and project proposals are local prototype records; they do not establish real-world identity or charitable status.

## Gaps before public production use

- Sessions, throttles and application data are process-local or local JSON. They are not suitable for multi-instance hosting and can be lost on restart or disk failure.
- IP throttling is process-local; add persistent limits and abuse protection at a trusted hosting edge before public exposure.
- There is no MFA, account recovery, durable session revocation, security monitoring, backup/restore plan, or independent penetration test.
- CORS and Origin checks are defense-in-depth, not a substitute for HTTPS, secure deployment configuration and careful secret management.
- The escrow contract needs an independent audit, reviewer key governance (multisig/DAO instead of single keys; the contract account's full-access key can currently redeploy code), and pause/recovery design before mainnet use.

Passing tests verify only tested behavior; they do not prove the absence of vulnerabilities.
