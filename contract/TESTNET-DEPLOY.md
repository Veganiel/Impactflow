# Testnet deployment runbook

This is a manual checklist. Do not run deployment commands until the contract has passed review and the account owner explicitly approves the deployment.

## Prerequisites

- Rust toolchain and `wasm32-unknown-unknown` target
- `cargo-near`
- NEAR CLI authenticated with a dedicated testnet account
- A separate reviewer testnet account

## Build

```bash
cd contract
cargo test
cargo near build non-reproducible-wasm --no-abi --locked --out-dir target/near
```

Use the exact WASM path printed by `cargo near build`.

## Deploy and initialize

Create a contract account and a separate reviewer account that you control. Never paste a seed phrase or private key into the repository, a shell script, or ChatGPT. Save generated keys to the macOS keychain.

```bash
near account create-account sponsor-by-faucet-service
near contract deploy CONTRACT_ACCOUNT_ID use-file target/near/impactflow_escrow.wasm with-init-call new json-args '{"admin":"REVIEWER_ACCOUNT_ID"}'
```

Choose an available testnet account ID and generate its key pair through the CLI prompts. Replace `CONTRACT_ACCOUNT_ID` and `REVIEWER_ACCOUNT_ID` with the two account IDs you created. Review every transaction summary yourself before confirming.

## Smoke-test sequence

1. Call `create_campaign` from an organization testnet account.
2. Call payable `donate` with a small testnet NEAR amount.
3. Call `get_campaign` and verify `raised` and `remaining_escrow`.
4. Call `propose_milestone` as the campaign owner.
5. Call `submit_milestone_evidence` with a test HTTPS URL.
6. Call `approve_and_release` from the configured reviewer account.
7. Verify the fixed recipient received the transfer and `get_campaign` shows the milestone as paid.

The testnet runbook does not imply that the contract is audited or safe for mainnet. The current prototype has no donor refund flow, NEP-141 token escrow, storage-cost accounting, multisig review, or emergency pause. Do not solicit real funds.

## Upgrade the already migrated staking prototype

The current account `impactflow-escrow-xyz.testnet` was upgraded with the withdrawal-callback gas fix in transaction `A7h753bUH8NAG4PYx3HDUqFUmJKYcoKiDFEpXcfqqhTc`. Use the code-only procedure below only for a future reviewed source change. The account has already been migrated; do not initialize it or call `migrate` again.

```bash
cd ~/Desktop/impactflow/contract
RUSTFLAGS='-C link-arg=-s --cfg near' cargo build --target wasm32-unknown-unknown --profile release --locked
near contract deploy impactflow-escrow-xyz.testnet use-file /Users/danielsuckrow/Desktop/impactflow/contract/target/wasm32-unknown-unknown/release/impactflow_escrow.wasm without-init-call network-config testnet sign-with-keychain send
```

Inspect the transaction summary and code hash yourself before confirming. This upgrade does not configure a staking pool or move funds; those are separate reviewer and campaign-owner transactions.
