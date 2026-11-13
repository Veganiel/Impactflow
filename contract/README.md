# ImpactFlow Escrow Contract (prototype)

Rust / `near-sdk` contract for **native NEAR only**. It provides campaign creation, attached-NEAR donations, owner-proposed milestones, HTTPS evidence submission, reviewer approval, and asynchronous payouts to the campaign's fixed recipient.

## Safety boundary

This is a development prototype, not an audited custody contract and not ready for mainnet funds. It intentionally has no arbitrary recipient changes, no owner-controlled release, and no cross-chain settlement hook. It also does not yet implement donor refunds, campaign cancellation, token (NEP-141) escrow, governance, upgrade controls, storage-deposit accounting, or emergency pause. Do not deploy to mainnet or solicit real donations.

## Build

```bash
rustup target add wasm32-unknown-unknown
cargo install cargo-near
cargo near build non-reproducible-wasm --no-abi --locked --out-dir target/near
```

The resulting WASM is written under `target/near/`.

## Deploy to testnet

Use NEAR CLI RS, then:

```bash
near account create-account sponsor-by-faucet-service
near contract deploy CONTRACT_ACCOUNT_ID use-file target/near/impactflow_escrow.wasm with-init-call new json-args '{"admin":"REVIEWER_ACCOUNT_ID"}'
```

Use the prompts to choose each testnet account ID, generate a key pair, and save it to the macOS keychain. Create a separate reviewer account. Replace the deployment placeholders with those account IDs. Confirm transaction details before approving them.

## Methods

- `new(admin)`
- `create_campaign(title, description, goal)` — creates a pending campaign; caller becomes its fixed payout recipient; `goal = 0` creates an ongoing fund with no cap
- `approve_campaign(campaign_id)` — reviewer activates a campaign after off-chain organization and project review
- `donate(campaign_id)` — payable; attach native NEAR
- `propose_milestone(campaign_id, title, amount)`
- `submit_milestone_evidence(campaign_id, milestone_id, evidence_uri)`
- `approve_and_release(campaign_id, milestone_id)` — reviewer only
- `get_campaign(campaign_id)`
- `get_campaign_count()`
- `set_open_fund_stake_threshold(amount)` — reviewer sets the NEAR amount used as the current $1,000 reference for ongoing-fund staking
- `get_staking_config()` — includes the configured open-fund threshold
- `migrate_v2()` — reviewer-only state migration from the currently deployed staking layout; preserves existing campaign and staking state and initializes the open-fund threshold to zero

Amounts are yoctoNEAR encoded as decimal strings in JSON (`U128`).

The $1,000 open-fund staking reference is not priced by a live oracle. The reviewer must set the corresponding NEAR amount and update it manually as the exchange rate changes. Until configured, open-fund staking remains disabled. Do not describe the displayed NEAR reference as an automatically verified USD value.

## Tests

Unit tests are included in `src/lib.rs` and cover reviewer-only campaign approval, rejecting donations to unapproved campaigns, campaign recipient immutability, deposit accounting, owner-only milestone creation, payout amount bounds, evidence requirements, HTTPS-only evidence links, and reviewer-only release. Run `cargo test` with the Rust toolchain and dependency access. These tests are not a substitute for sandbox integration tests.

## Important testnet caveats

The current prototype has no explicit storage-deposit accounting. NEAR contract storage consumes contract balance, so the current `remaining_escrow` counter is not yet a complete proof that every donor liability is fully collateralized. Before any real-value use, implement per-campaign storage deposits or a robust reserve/liability model and assert contract balance coverage.

The current campaign owner is also the payout recipient. This is intentionally fixed to prevent post-launch redirection, but it does not verify that the account belongs to a legally registered organization. The reviewer is a single admin account; production should replace this with a multisig or governed review committee.

## Before mainnet

Add and test donor-level refunds, explicit campaign closure, storage-cost accounting, per-campaign reviewer/DAO policy, pause and recovery controls, replay/idempotency protections, event standards, and adversarial tests. Commission an independent audit. Verify that the contract's actual balance always covers aggregate liabilities.
