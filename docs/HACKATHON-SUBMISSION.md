# NEAR HACKATHON submission — ImpactFlow

Checked against <https://nearhackathon.com/> and its `HACKATHON.md` on 14 November 2026.

**Deadline: 14 November 2026, 23:59 UTC** (00:59 on 15 November in Germany). Submit once; changes go through <https://nearhackathon.com/request-changes>.

## Checklist

- [x] Public repository with a LICENSE (MIT): <https://github.com/Veganiel/Impactflow>
- [x] README with reproducible setup (`npm ci && npm run dev:all`), verified from a fresh clone with no `.env`
- [x] Libraries, external services and AI assistance listed in the README
- [x] No secrets in the repository or its history
- [ ] Demo video recorded (required: the demo runs locally, so screenshots alone are not enough)
- [ ] Public X post: says it was built at NEAR HACKATHON, tags `@NEARProtocol` and `#NEARHackathon`, attaches the video
- [ ] NEAR **mainnet** account for prize payout (named like `team.near` or a 64-character implicit account)
- [ ] Form submitted at <https://nearhackathon.com/#apply>

## Form fields

| Field | Value |
|---|---|
| Project name | ImpactFlow |
| Team lead | *(your name)* |
| Email address | *(your email)* |
| Team size | *(1 or 2 - 4)* |
| Tracks | Real-World Money, Open Innovation |
| NEAR wallet address | *(your mainnet payout account; not a `.testnet` account)* |
| Repository link | https://github.com/Veganiel/Impactflow |
| Demo post link | *(link to the X post)* |
| Website | *(leave empty; the demo runs locally)* |

### What did you build? (1,646 of 2,000 characters)

```text
ImpactFlow is milestone-based funding for public-benefit projects on NEAR. Donations go into a Rust escrow contract and are released only when a project proposes a milestone, submits public evidence and a reviewer approves the payout. The payout recipient is fixed at campaign creation, so a reviewer can release funds but never redirect them.

It runs end to end on NEAR Testnet: campaign creation, reviewer approval, wallet-signed donations, milestone evidence and a reviewer-approved payout are all on-chain, and the deployed code hash matches the public repository. The app shows a live ledger of escrow transactions, each linked to NearBlocks.

Campaigns commit to a hold date. Donations close on that date, and funded campaigns can optionally stake idle escrow with an approved validator only while at least three days remain to unstake. In that final window anyone can force the unstake, so donations are never staked indefinitely. Rewards flow back to the same campaign.

Donors on other chains can preview routes through NEAR Intents 1Click (231 assets, e.g. Solana USDC or BTC to NEAR) and request real deposit instructions with status tracking. A NEAR AI Cloud agent gives project teams feedback on how clear and complete their proposal is before review; it advises and never approves.

Security: creators pay their own campaign storage (prevents storage-griefing), escrow math is overflow-checked, failed transfers roll back, and 34 contract tests plus web/API tests run in CI. Open limits are documented in the README: Testnet only, no audit yet, and single reviewer/deployer keys that should become a multisig or DAO before mainnet.
```

## X post

Post from the team account with the demo video attached:

```text
Built ImpactFlow at NEAR HACKATHON 🌱

Donations sit in a NEAR escrow and are only released when a project shows proof and a reviewer approves. Every step is on-chain.

✅ Live on Testnet
🌐 Cross-chain via NEAR Intents

github.com/Veganiel/Impactflow

@NEARProtocol #NEARHackathon
```

Optional extra mentions: `@NearLegion`, `@NearBuilders`.

## Demo video (about 2–3 minutes)

The judges' AI screening checks that the project runs and does what the README says, so show the real app and real transactions.

1. **Problem (10 s).** "Donors can't see whether their money created impact. ImpactFlow releases funds only against proof."
2. **Create a campaign (25 s).** Connect the Testnet wallet and create a campaign with a believable title, a goal and a hold date. The wallet shows the 0.05 NEAR storage deposit (the excess is refunded).
3. **Approve (15 s).** Switch to the reviewer account and select **Approve campaign**.
4. **Donate (20 s).** Donate 0.01–0.1 NEAR. The raised total updates, then open the transaction on NearBlocks.
5. **Proof (40 s).** As the owner, propose a milestone and submit an HTTPS evidence link. As the reviewer, select **Approve & release**. The milestone shows **Paid to recipient**.
6. **Live ledger (15 s).** Scroll to "See where every token goes": the payout appears as a real transaction.
7. **Cross-chain (25 s).** Choose USDC on Solana to wNEAR and get a live quote preview. Mention that real deposit instructions and status tracking are available.
8. **Trust (15 s).** Show the README section "Verified on NEAR Testnet" and the matching code hash.

Leave out the staking cycle (unstaking takes about two days) and the AI agent unless a NEAR AI key is configured.

## Track positioning

- **08 — Real-World Money (primary):** programmable escrow for donations and grants, payouts tied to evidence, cross-chain contributions through NEAR Intents.
- **13 — Open Innovation:** proof-gated public-benefit funding with bounded, opt-in staking of idle escrow.
- Not selected: **03 — Privacy & Private AI**, because the confidential Intents sign-in has not been verified live.
