# ImpactFlow

**Funding with proof.** ImpactFlow is a NEAR hackathon prototype for routing support toward public-benefit projects and making their goals, review status and funding path easier to inspect.

## What works in this prototype

- Local account registration and sign-in, organization profiles and project proposals queued as `pending_review`.
- NEAR wallet selection through HOT Labs NEAR Connect.
- Live supported-asset discovery from NEAR Intents 1Click.
- Dry quote previews. The app accepts human-readable token amounts and converts them to the asset's smallest units before sending the request.
- An optional NEAR AI Cloud Project Readiness Agent that returns structured clarity/completeness notes for a signed-in project submitter. It does not verify facts or approve proposals; it requires server-side NEAR AI Cloud credentials.
- An optional non-dry quote request that can return deposit instructions. The user must make any transfer separately from their own wallet.
- Confidential routing options and a NEP-413 sign-in flow using the current verifier salt and a timestamped nonce. Live wallet authentication still needs verification before this feature should be presented as working end to end.
- A Rust NEAR escrow contract deployed and initialized on NEAR Testnet, plus a UI for creating campaigns, reviewer approval and native-NEAR donations. Read-only Testnet checks confirmed the deployed code hash, reviewer account and two readable campaigns; live wallet transactions still need end-to-end testing.
- Local contract/UI changes now support ongoing funds with no cap and a reviewer-configured NEAR reference threshold for staking. These changes are **not deployed to Testnet yet**: the contract needs a reviewer-signed code upgrade and `migrate_v2` call. The $1,000 reference is manually maintained, not a live USD oracle. The currently deployed contract remains on the prior full-goal staking rule until the upgrade is completed.

The campaign cards, totals, milestones and activity ledger on the landing page are illustrative demo content. The local contribution preview does not contact a wallet, save a donation or move money.

## Start the website

Requirements: Node.js 18 or newer. Internet access is needed for live NEAR Intents asset discovery and wallet services.

```bash
npm ci
npm run dev:all
```

Wait until the terminal says the API is ready and Vite has started, then open <http://localhost:5173>.

`npm run dev:all` starts the local API on port 8787, waits for its health check, and then starts the website. Press **Ctrl+C** once to stop both. If either port is already in use, stop the older ImpactFlow process before restarting.

The optional Project Readiness Agent uses NEAR AI Cloud. To enable it, set `NEAR_AI_API_KEY` and `NEAR_AI_MODEL` in `.env`; create a key and any required credits in the NEAR AI Cloud dashboard. The key stays on the server. Each review sends the project title, impact area, funding goal and description to NEAR AI Cloud only when the signed-in user clicks the review button. Do not send personal or confidential documents. The API stores prototype data in `data/impactflow.json`; sessions are kept in memory and end when the API restarts. No `.env` file is required for the local onboarding flow. If your NEAR Intents partner account requires an API key, copy `.env.example` to `.env` and set `NEAR_INTENTS_JWT` there. The default `NEAR_CONTRACT_ID` is the deployed Testnet account `impactflow-escrow-xyz.testnet`; override it in `.env` only if you deploy to a different account. Never put the partner key in browser code or commit `.env`.

To run the services separately instead, use two terminals:

```bash
npm run server
```

```bash
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

## Reproducible walkthrough

1. Open **Register**, create a local account, then save an organization profile. Profiles are marked unverified.
2. Select **Submit a project**, choose either a fixed target or an ongoing fund, and enter the required details. The proposal should appear under the account as `pending_review`; this is a local API record, not an on-chain campaign.
3. Open **Cross-chain** and wait for the supported-asset list. Choose two different assets, enter an amount in the selected token, and provide a recipient address for the destination network and a refund address for the source network.
4. Select **Get live quote preview**. This uses `dry: true`; it must not create a deposit address or move funds.
5. After a preview, **Create deposit instructions** requests a non-dry 1Click quote and may return a real deposit address. The website does not send or sign the transfer. For a judge walkthrough, stop at the dry preview unless you intentionally want to test a live route and understand the asset, network and address.
6. The Confidentiality options require Mainnet NEAR Intents authentication. Do not describe the flow as verified until a wallet signs in successfully and the service returns an access token. For named NEAR accounts, the signing public key may first need to be registered with `add_public_key` on `intents.near`; this is a separate Mainnet wallet confirmation. See [NEAR's account-key instructions](https://docs.near-intents.org/integration/verifier-contract/account-abstraction). Confidential routing does not guarantee anonymity.
7. The escrow panel reads the deployed Testnet contract live. Campaign creation, reviewer approval and native-NEAR Testnet donations require wallet transactions; complete a wallet walkthrough before presenting those actions as end-to-end verified. The separate local project proposal form does not create a contract campaign.
8. Ongoing-fund staking requires the pending contract upgrade and state-preserving `migrate_v2`. After that, the reviewer must configure an approved pool and set the manual NEAR equivalent of $1,000. Targeted campaigns still require their full goal; ongoing funds use the configured threshold and keep accepting donations. Read [the staking checklist](docs/TESTNET-CHECKLIST.md); do not present this as live until a small stake, later donation, delayed unstake and withdrawal have completed.

## Architecture

- `app.js` — page interactions, HOT Labs wallet connection, project submission and 1Click quote flow.
- `server/index.js` — local account and project API, NEAR Intents proxy, and read-only Testnet escrow queries.
- `near-intents-auth.js` — NEP-413 nonce and signature encoding helpers.
- `contract/src/lib.rs` — native-NEAR escrow contract prototype.
- `public/impactflow-evidence.json` — machine-readable summary copied into the production build and offered from the reviewer brief.
- `.github/workflows/ci.yml` — web and contract checks on pushes and pull requests.

## Checks

```bash
npm run check
npm run build
npm test
```

Rust contract tests:

```bash
cd contract
cargo test
```

The GitHub Actions workflow runs the web checks and Node API smoke test, plus the Rust contract tests. A passing test suite does not mean the contract has been deployed or audited.

## Status and limitations

### API security protections in this prototype

- Passwords are stored as salted scrypt hashes; successful sessions use random, HttpOnly, SameSite=Lax cookies.
- State-changing browser requests with an Origin header are restricted to the configured `APP_ORIGIN` allowlist.
- Failed sign-ins are throttled per client address and account identifier; the API also applies a general request limit.
- Responses include clickjacking, MIME-sniffing and referrer protections. HSTS is sent only in production mode.
- These protections reduce common risks; they do not make the prototype “unhackable.” Sessions and throttling are in memory and reset on restart. Before public production use, add persistent session storage, edge/WAF rate limits, HTTPS termination, monitoring, backups, dependency scanning and an independent security review.

- This is a hackathon prototype, not production donation infrastructure.
- Organization profiles are not identity verification, accreditation or due diligence. The local JSON store and in-memory sessions are development-only.
- The contract is deployed on Testnet but is not independently audited. The current prototype has no production-grade donor refund process, NEP-141 escrow, multisig review, storage-cost accounting or emergency controls.
- The sample campaign figures are not verified donations. The contribution preview is a local interaction only.
- The 1Click dry preview, non-dry quote request and Testnet escrow are separate flows. A NEAR Intents route does not fund the Testnet escrow.
- Confidential routing can reduce public visibility for supported routes. It cannot hide all activity from service operators, compliance systems or public-chain observers.

## Hackathon fit and submission

Potential fits are **Track 08 — Real-World Money** for cross-chain payments supporting public-benefit organizations, **Track 03 — Privacy & Private AI** if the Confidential Intents flow is successfully verified in the final demo, and **Track 13 — Open Innovation** if the team frames the public-benefit funding model as the novel part. Choose tracks based on the working demo; do not claim that the local project queue is on-chain funding or that a privacy option alone guarantees anonymity.

The current organizer page asks for a public repository, a public demo post on X that says it was built at NEAR HACKATHON and tags `@NEARProtocol` and `#NEARHackathon`, and a submission containing both links. The listed deadline is **14 November 2026, 23:59 UTC**. Re-check the [official NEAR Hackathon page](https://nearhackathon.com/) and its `HACKATHON.md` before submitting.

This README and `public/impactflow-evidence.json` describe current behavior and known gaps. Verify the instructions above against the running site and source before treating a feature as complete.
