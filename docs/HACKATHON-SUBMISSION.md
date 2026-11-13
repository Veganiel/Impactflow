# NEAR Hackathon submission checklist — ImpactFlow

Based on the public NEAR Hackathon page checked on 2 November 2026. Re-check the live organizer instructions immediately before submitting.

## Track positioning

- Primary: **08 — Real-World Money**. ImpactFlow applies programmable money and cross-chain payment rails to real-world impact projects and organizations.
- Secondary: **03 — Privacy & Private AI**, only if a supported Confidential Intents route is actually demonstrated and privacy claims are carefully qualified.
- Do not claim there is an “Impact” track in the current public list. Select only tracks that the final build genuinely fits.

## Required submission artifacts

- [ ] Public GitHub repository. Judges cannot open a private repository.
- [ ] README with reproducible “do X, see Y” setup and demo steps.
- [ ] Demo post on X that says the project was built at NEAR HACKATHON, tags `@NEARProtocol`, includes `#NEARHackathon`, and attaches a demo video or screenshots.
- [ ] Submission form containing both the repository link and demo-post link.
- [ ] Confirm the exact deadline: 14 November 2026, 23:59 UTC.
- [ ] Check organizer instructions for prize payout account requirements; a mainnet NEAR account for prize payout is distinct from a requirement to deploy the application to mainnet.
- [ ] Ensure no `.env`, JWT, private keys, seed phrases, or other secrets exist in the repository or its history.

## Demo flow to record

1. Register a company or NGO account.
2. Connect a NEAR wallet and show the connected account.
3. Create a project and show that it enters moderation review.
4. Show the escrow contract source and its unit-test scenarios.
5. If deployed, create a testnet campaign, donate testnet NEAR, submit milestone evidence and approve a payout with the reviewer account.
6. Show NEAR Intents dry quote preview separately. Do not imply that a dry quote moved funds.
7. Show confidentiality options and explain that they do not make the public escrow contract's on-chain activity anonymous.

## Mainnet statement

The public hackathon page reviewed on 2 November 2026 describes building a working prototype, publishing the repository, posting a demo and submitting both links. It does not state that an application must be deployed to mainnet. Testnet is appropriate for a safe escrow demonstration. A mainnet account may still be needed for prize payout; verify the latest organizer rules.
