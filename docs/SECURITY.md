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
- The escrow contract needs an independent audit, reviewer key governance, pause/recovery design and storage-cost review before mainnet use.

Passing tests verify only tested behavior; they do not prove the absence of vulnerabilities.
