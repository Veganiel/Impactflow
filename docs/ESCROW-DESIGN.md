# ImpactFlow Escrow Design — v0.5 Testnet staking prototype

## Funding model

1. An organization creates a pending campaign. Its NEAR account is snapshotted as the payout recipient.
2. A platform reviewer verifies the organization and proposal off-chain, then activates it with `approve_campaign(campaign_id)`. Pending campaigns reject donations.
3. Donors send native NEAR as an attached deposit to `donate(campaign_id)` on an approved campaign.
4. The campaign owner proposes a milestone with a payout cap.
5. The owner publishes an HTTPS evidence link and submits the milestone.
6. A separate platform reviewer account approves it.
7. The contract transfers the milestone amount to the fixed recipient. An asynchronous callback marks it paid or restores the escrow accounting if transfer fails.

## Optional staking

- A targeted campaign's owner may stake only once `raised >= goal`.
- An ongoing fund uses `goal = 0`, has no fundraising cap, and may continue accepting donations before and during staking. Its owner may stake after its remaining escrow reaches the reviewer-configured threshold.
- The threshold is a manually maintained NEAR equivalent of $1,000. There is no live USD price oracle in this contract; zero means ongoing-fund staking is disabled until the reviewer sets a value.
- The platform reviewer configures one approved NEAR staking-pool account. The owner cannot select or redirect funds to an arbitrary pool.
- The contract protects other campaigns' liquid liabilities and a small operating reserve before sending a stake.
- This first version permits one active campaign position across the contract at a time. The owner starts unstaking when the project needs funds. The contract waits at least four epochs, checks the pool's `can_withdraw` response, and then withdraws.
- NEAR staking rewards that arrive in the withdrawal are credited to the same campaign. If the pool returns less than principal, campaign escrow is reduced to keep accounting aligned with returned assets.
- Milestone releases cannot spend the staked principal. The UI reports the pool, principal, reward, unlock epoch and current epoch. Pool outages, delayed callbacks and validator risk remain possible.
- The reviewer-only migration is deployed on Testnet. It preserved both existing campaigns and their milestone data; a unit test also verifies the migrated escrow sum. The migration accepts at most 100 campaign IDs and must not be reused after success.
- Current Testnet deployment: contract `impactflow-escrow-xyz.testnet`, WASM SHA-256 base58 `F2egoqRgYczdsNEg7jeGD1E9Hs54j6pzZPfKVe29rdCs`; latest code-upgrade transaction `A7h753bUH8NAG4PYx3HDUqFUmJKYcoKiDFEpXcfqqhTc`. The initial deployment was `CH6hrcaM5niExH7NhkqkFG8ahgJeCk8ctJtz2yqqxsmR`; one-time migration was `BgLtFM9Jx3NBwHpz6PaPk9nqvx31e4WcgyV5zqU8BYBx`.
- Testnet RPC verification after the latest upgrade confirmed the expected WASM hash, reviewer `impactflow-reviewer-xyz.testnet`, and both campaigns and their milestone state. Staking remains idle and no pool is configured; live stake/unstake/withdrawal has not yet been tested.
- The website attaches 150 Tgas to escrow calls. The pool-balance callback reserves 80 Tgas so it can schedule the pool withdrawal and its completion callback within the callback's own gas budget.
- A candidate testnet pool, `pennyvalidators.pool.f863973.m0`, was present in the current validator set and returned the expected zero-balance `get_account` response for this contract during preflight. Recheck its active status and pool interface before configuring it; it is not configured.
- Staking is a Testnet prototype and is not independently audited. Do not use real funds or describe yield as guaranteed.
- The local v2 code change is not deployed yet. Deploy the reviewed WASM and call `migrate_v2` from the reviewer account before using ongoing funds. This migration preserves existing campaign and staking state and initializes the threshold to zero. Do not call the original `migrate` again.

## Separation of duties

- Campaign owner: creates campaign, proposes milestones, submits evidence.
- Reviewer/admin: approves release.
- Contract: enforces amount bounds, evidence requirement, fixed recipient, and payout state machine.
- Donor: contributes; donors cannot currently vote or request refunds in this prototype.

## Critical limitations

- Native NEAR only. No NEP-141 tokens in this first contract.
- No direct NEAR Intents integration inside the contract. 1Click is an off-chain quote/deposit/swap lifecycle; it must not be treated as a trusted on-chain deposit without verifying settlement on-chain.
- Confidential Intents is a routing/execution privacy feature, not a private donation ledger. Donations made to a public NEAR escrow contract remain visible as on-chain contract calls and balances.
- This version does not have refunds, campaign cancellation, storage accounting, DAO review, pause controls, or formal verification.
- A single platform reviewer is a centralization risk. Production should use a multisig or a role-based review committee.
- A fixed payout recipient prevents an owner from redirecting campaign funds after launch, but organization wallet recovery and legal identity verification remain off-chain concerns.

## Intents integration boundary

NEAR Intents 1Click follows quote → deposit → status → success/refund. It is mainnet-only. Keep quote creation and status polling in the backend. To fund the escrow from an Intents route, the route's destination must be a supported asset and the resulting settlement must be independently verified before crediting the campaign. Never credit a campaign from a browser callback or an unverified status response.

## Privacy

Offer distinct labels:
- Public donation: sender and amount may be visible on the relevant chain.
- Confidential route: Confidential Intents may reduce public visibility of supported swap execution details, subject to service controls and compliance.
- Anonymous display: hide the donor's profile name in the ImpactFlow UI only. This does not make an on-chain transfer private.

Never market these options as guaranteed anonymity.
