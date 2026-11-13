# Testnet acceptance checklist

- [ ] Build the contract with `cargo near build`.
- [ ] Deploy to a fresh NEAR testnet account.
- [ ] Initialize with a dedicated reviewer account.
- [ ] Create a campaign and verify it starts inactive.
- [ ] Verify donations to a pending campaign fail.
- [ ] Approve the campaign from the reviewer account and verify donations then succeed.
- [ ] Create a campaign and verify the caller is the fixed recipient.
- [ ] Donate 1 NEAR and verify `raised` and `remaining_escrow`.
- [ ] Verify non-owner cannot propose a milestone.
- [ ] Verify milestone amount cannot exceed remaining escrow.
- [ ] Verify milestone cannot be paid before HTTPS evidence submission.
- [ ] Verify non-reviewer cannot approve payout.
- [ ] Approve a milestone and verify payout reaches the fixed recipient.
- [ ] Simulate transfer failure and verify escrow is restored.
- [ ] Verify a second payout attempt cannot replay a completed milestone.
- [ ] Inspect contract balance against all campaign escrow liabilities.
- [ ] Run adversarial tests for overflow, duplicate calls, malformed evidence, and insufficient balance.

Do not move to mainnet until refunds, storage accounting, pause/recovery, multisig review, and an independent security audit are complete.

- [ ] Confirm contract storage costs cannot consume funds owed to donors.
- [ ] Confirm reviewer is a multisig or a controlled committee before mainnet.
- [ ] Confirm the deployed contract WASM hash matches the reviewed build.

## Optional staking upgrade (Testnet only)

### Ongoing funds and $1,000 reference threshold (deployed 5 November 2026)

- [ ] Save a complete pre-upgrade state snapshot and previous WASM before the upgrade.
- [ ] Build the updated contract, inspect the WASM and run the Web/API compile checks.
- [x] Deploy the updated WASM without an init call; have the reviewer wallet call `migrate_v2` (do not call `migrate`).
- The reviewer deployment commands for this project are:
  ```sh
  cd ~/Desktop/impactflow/contract
  RUSTFLAGS='-C link-arg=-s --cfg near' cargo build --target wasm32-unknown-unknown --profile release --locked
  near contract deploy impactflow-escrow-xyz.testnet use-file /Users/danielsuckrow/Desktop/impactflow/contract/target/wasm32-unknown-unknown/release/impactflow_escrow.wasm without-init-call network-config testnet sign-with-keychain send
  near contract call-function as-transaction impactflow-escrow-xyz.testnet migrate_v2 json-args '{}' prepaid-gas '100 Tgas' attached-deposit '0 NEAR' sign-as impactflow-reviewer-xyz.testnet network-config testnet sign-with-keychain send
  ```
- [ ] Verify both existing campaigns, milestones, staking state and reviewer account survived migration; verify the open-fund threshold starts at zero.
- [ ] Use the reviewer UI to set a current NEAR equivalent of $1,000. This is manually maintained and not an oracle price; record the reference rate/date used.
- [ ] Create an ongoing fund (`goal = 0`), approve it, and verify it accepts donations without a cap.
- [ ] Verify staking fails below the configured remaining-escrow threshold, becomes available at/above it, and additional donations remain possible during staking.
- [ ] Verify staked principal cannot be proposed or released as a milestone payout; then exercise the full stake → unstake → wait → withdraw flow on Testnet.

- [x] Build and deploy the withdrawal-callback gas fix; confirmed on-chain SHA-256 base58: `F2egoqRgYczdsNEg7jeGD1E9Hs54j6pzZPfKVe29rdCs`.
- [x] Verify post-upgrade RPC code hash, reviewer account, campaign count, and preserved campaign and milestone data.
- [x] Confirm the previous Testnet state matched the legacy layout and had two campaign IDs (within the migration limit of 100).
- [x] Initial staking contract deployment and one-time `migrate` call completed with the reviewer account. Post-migration RPC confirmed campaign state was preserved.
- Initial deployment transaction: `CH6hrcaM5niExH7NhkqkFG8ahgJeCk8ctJtz2yqqxsmR`.
- Migration transaction: `BgLtFM9Jx3NBwHpz6PaPk9nqvx31e4WcgyV5zqU8BYBx`.
- Latest code-upgrade transaction: `A7h753bUH8NAG4PYx3HDUqFUmJKYcoKiDFEpXcfqqhTc`.
- [ ] Save the previous contract WASM and a complete pre-upgrade state snapshot for rollback/reference before any future upgrade.
- [x] Reviewer-signed code-only upgrade completed; do not run `migrate` again.
- [ ] Configure a known, active Testnet staking-pool account from the reviewer wallet. Preflight candidate `pennyvalidators.pool.f863973.m0` was active and exposed `get_account` on 2026-11-04; recheck before configuring.
- [ ] Connect a campaign owner and confirm staking is unavailable below the campaign's full goal; confirm another account cannot stake for that campaign.
- [ ] On a fully funded test campaign, stake a small amount and inspect the signed transaction, pool receipt, contract state, and liquid escrow. Verify another campaign's funds remain available.
- [ ] Confirm milestone payouts cannot use staked principal. Start unstaking as the campaign owner and verify the UI blocks withdrawal before the pool reports it available and four epochs have passed.
- [ ] After configuring a pool, execute the complete stake → unstake → wait → withdraw flow on Testnet with a low-value, fully funded test campaign. Verify the wallet balance, pool `get_account`, campaign escrow, reward total, and UI state after each receipt.
- [ ] Withdraw after the pool unlocks. Verify principal and any actual reward return to the same campaign; verify a lower-than-principal result reduces its escrow liability rather than overstating available funds.
- [ ] Exercise failed stake, unstake, pool-query, withdrawal, and payout callbacks before presenting this workflow as end-to-end verified.
- [ ] Do not use mainnet or real funds; the contract has no independent security audit, emergency pause, or multi-position accounting.

## Campaign hold dates (v3 · deployed 13 November 2026)

Every campaign now has a hold date: the date until which donations may be collected and held. Donations close on that date. Staking is only allowed while at least 3 days remain (enough for the 4-epoch unstake plus withdrawal); once that exit window opens, **anyone** can start the unstake and withdrawal so donations are never staked past the committed date. Campaigns created before v3 can set a hold date once (`set_campaign_hold_until`); until then they cannot stake.

The live state was decoded byte-for-byte against `LegacyEscrowV3` (128 of 128 bytes matched) before this migration was written.

Run both commands directly after each other. Between deploy and migration the contract cannot read its state.

```sh
cd ~/Desktop/impactflow/contract
RUSTFLAGS='-C link-arg=-s --cfg near' cargo build --target wasm32-unknown-unknown --profile release --locked
near contract deploy impactflow-escrow-xyz.testnet use-file target/wasm32-unknown-unknown/release/impactflow_escrow.wasm without-init-call network-config testnet sign-with-keychain send
near contract call-function as-transaction impactflow-escrow-xyz.testnet migrate_v3 json-args '{}' prepaid-gas '100 Tgas' attached-deposit '0 NEAR' sign-as impactflow-reviewer-xyz.testnet network-config testnet sign-with-keychain send
```

- [x] Deploy the v3 WASM without an init call (`9dYo1DbiFxuZPWTmaH1YUUqccmJBuUEG8QivRKkyPRdW`).
- [x] Reviewer calls `migrate_v3` (`HiCh4nkPasWq5zzRtfmHwmhgzMvaU273dvtohGSxExcE`). Never call `migrate`, `migrate_v2` or `migrate_v3` again.
- [x] Verified: code hash `5v9deX8YbbDr2q2PaP4Jp8Rq9ssc7tUq3nohHGJwHfzT`, `get_campaign_count` is 2, both campaigns keep their totals and paid milestone, `hold_until_ms: 0`.
- [ ] Create a new campaign in the UI with a hold date and confirm `hold_until_ms` in `get_campaign`.

## Security hardening (v3.1 · deployed 13 November 2026)

- [x] `create_campaign` is payable and charges the caller for the storage it adds; any excess deposit is refunded. Without this, roughly 295 maximum-size spam campaigns could lock the contract's free balance and block donations and payouts.
- [x] Campaigns are capped at 20 milestones.
- [x] Code-only deploy without migration (state layout unchanged): `rMR4mWUopMhzErJ7EdGhg8LhKFf2CeiLQiSYvqu4YP7`, code hash `8wqUojNLmRQcWiYGsvr2hWYsvBU9Ytfxk9beB7Akdrym`. Both campaigns, totals and the paid milestone were verified afterwards.
