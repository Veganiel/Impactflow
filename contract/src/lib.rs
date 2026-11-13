use near_sdk::{
    env, near, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue,
    serde_json::json,
    store::LookupMap,
    BorshStorageKey,
};
use near_sdk::json_types::U128;
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};

const CALLBACK_GAS: Gas = Gas::from_tgas(20);
const POOL_CALL_GAS: Gas = Gas::from_tgas(35);
// This callback starts a pool withdrawal and then schedules a final callback.
// Its own gas budget must cover both nested receipts plus callback execution.
const WITHDRAW_CALLBACK_GAS: Gas = Gas::from_tgas(80);
const REQUIRED_UNSTAKE_EPOCHS: u64 = 4;
const DAY_MS: u64 = 24 * 60 * 60 * 1000;
/// Staking must leave enough time to unstake (4 epochs, roughly 2 days) and withdraw before the hold date.
const STAKE_EXIT_BUFFER_MS: u64 = 3 * DAY_MS;
/// A campaign's hold date must be at least one day and at most three years in the future when set.
const MIN_HOLD_MS: u64 = DAY_MS;
const MAX_HOLD_MS: u64 = 3 * 365 * DAY_MS;

#[derive(BorshSerialize, BorshDeserialize, Clone)]
#[borsh(crate = "near_sdk::borsh")]
pub struct Milestone {
    pub title: String,
    pub evidence_uri: Option<String>,
    pub amount: u128,
    pub status: MilestoneStatus,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
#[borsh(crate = "near_sdk::borsh")]
pub enum MilestoneStatus {
    Proposed,
    Submitted,
    Paying,
    Paid,
}

#[derive(BorshSerialize, BorshDeserialize, Clone)]
#[borsh(crate = "near_sdk::borsh")]
pub struct Campaign {
    pub id: u64,
    pub owner: AccountId,
    pub recipient: AccountId,
    pub title: String,
    pub description: String,
    pub goal: u128,
    pub raised: u128,
    pub remaining_escrow: u128,
    pub active: bool,
    pub milestones: Vec<Milestone>,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
#[borsh(crate = "near_sdk::borsh")]
pub enum StakeState { Idle, Staking, Staked, Unstaking, Unstaked, CheckingWithdraw, Withdrawing }

#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "near_sdk::borsh")]
struct LegacyEscrow {
    admin: AccountId,
    next_campaign_id: u64,
    campaigns: LookupMap<u64, Campaign>,
}

/// State layout deployed before reviewer-configured open-fund thresholds.
#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "near_sdk::borsh")]
struct LegacyEscrowV2 {
    admin: AccountId,
    next_campaign_id: u64,
    campaigns: LookupMap<u64, Campaign>,
    staking_pool: Option<AccountId>,
    stake_campaign_id: Option<u64>,
    staked_principal: u128,
    stake_state: StakeState,
    unstake_epoch: u64,
    total_escrow: u128,
    stake_rewards: u128,
    campaign_staking_rewards: LookupMap<u64, u128>,
}

/// State layout deployed on Testnet before per-campaign hold dates (v2 with open-fund threshold).
#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "near_sdk::borsh")]
struct LegacyEscrowV3 {
    admin: AccountId,
    next_campaign_id: u64,
    campaigns: LookupMap<u64, Campaign>,
    staking_pool: Option<AccountId>,
    stake_campaign_id: Option<u64>,
    staked_principal: u128,
    stake_state: StakeState,
    unstake_epoch: u64,
    total_escrow: u128,
    stake_rewards: u128,
    campaign_staking_rewards: LookupMap<u64, u128>,
    minimum_open_fund_stake: u128,
}

#[derive(near_sdk::serde::Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct PoolAccountView {
    unstaked_balance: U128,
    can_withdraw: bool,
}

#[derive(BorshStorageKey, BorshSerialize)]
#[borsh(crate = "near_sdk::borsh")]
enum StorageKey {
    Campaigns,
    CampaignStakingRewards,
    CampaignHoldUntil,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct ImpactFlowEscrow {
    admin: AccountId,
    next_campaign_id: u64,
    campaigns: LookupMap<u64, Campaign>,
    staking_pool: Option<AccountId>,
    stake_campaign_id: Option<u64>,
    staked_principal: u128,
    stake_state: StakeState,
    unstake_epoch: u64,
    total_escrow: u128,
    stake_rewards: u128,
    campaign_staking_rewards: LookupMap<u64, u128>,
    // Reviewer-set NEAR equivalent of $1,000. Zero keeps open-fund staking disabled.
    minimum_open_fund_stake: u128,
    // Per-campaign date (Unix ms) until which donations may be collected and held.
    campaign_hold_until: LookupMap<u64, u64>,
}

#[near]
impl ImpactFlowEscrow {
    #[init]
    pub fn new(admin: AccountId) -> Self {
        Self {
            admin,
            next_campaign_id: 0,
            campaigns: LookupMap::new(StorageKey::Campaigns),
            staking_pool: None,
            stake_campaign_id: None,
            staked_principal: 0,
            stake_state: StakeState::Idle,
            unstake_epoch: 0,
            total_escrow: 0,
            stake_rewards: 0,
            campaign_staking_rewards: LookupMap::new(StorageKey::CampaignStakingRewards),
            minimum_open_fund_stake: 0,
            campaign_hold_until: LookupMap::new(StorageKey::CampaignHoldUntil),
        }
    }

    /// One-time migration for the previously deployed v0.1 state layout.
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let old: LegacyEscrow = env::state_read().expect("Legacy escrow state is missing or already migrated");
        assert_eq!(env::predecessor_account_id(), old.admin, "Only the contract reviewer may migrate state");
        assert!(old.next_campaign_id <= 100, "Use a batched migration for more than 100 campaigns");
        let mut total_escrow = 0u128;
        for id in 0..old.next_campaign_id {
            if let Some(campaign) = old.campaigns.get(&id) {
                total_escrow = total_escrow.checked_add(campaign.remaining_escrow).expect("Escrow total overflow");
            }
        }
        Self {
            admin: old.admin,
            next_campaign_id: old.next_campaign_id,
            campaigns: old.campaigns,
            staking_pool: None,
            stake_campaign_id: None,
            staked_principal: 0,
            stake_state: StakeState::Idle,
            unstake_epoch: 0,
            total_escrow,
            stake_rewards: 0,
            campaign_staking_rewards: LookupMap::new(StorageKey::CampaignStakingRewards),
            minimum_open_fund_stake: 0,
            campaign_hold_until: LookupMap::new(StorageKey::CampaignHoldUntil),
        }
    }

    /// Upgrade the current staking state while preserving campaigns and accounting.
    #[init(ignore_state)]
    pub fn migrate_v2() -> Self {
        let old: LegacyEscrowV2 = env::state_read().expect("Current escrow state is missing or already migrated");
        assert_eq!(env::predecessor_account_id(), old.admin, "Only the contract reviewer may migrate state");
        Self {
            admin: old.admin,
            next_campaign_id: old.next_campaign_id,
            campaigns: old.campaigns,
            staking_pool: old.staking_pool,
            stake_campaign_id: old.stake_campaign_id,
            staked_principal: old.staked_principal,
            stake_state: old.stake_state,
            unstake_epoch: old.unstake_epoch,
            total_escrow: old.total_escrow,
            stake_rewards: old.stake_rewards,
            campaign_staking_rewards: old.campaign_staking_rewards,
            minimum_open_fund_stake: 0,
            campaign_hold_until: LookupMap::new(StorageKey::CampaignHoldUntil),
        }
    }

    /// Add per-campaign hold dates while preserving all campaigns, staking and accounting state.
    #[init(ignore_state)]
    pub fn migrate_v3() -> Self {
        let old: LegacyEscrowV3 = env::state_read().expect("Current escrow state is missing or already migrated");
        assert_eq!(env::predecessor_account_id(), old.admin, "Only the contract reviewer may migrate state");
        Self {
            admin: old.admin,
            next_campaign_id: old.next_campaign_id,
            campaigns: old.campaigns,
            staking_pool: old.staking_pool,
            stake_campaign_id: old.stake_campaign_id,
            staked_principal: old.staked_principal,
            stake_state: old.stake_state,
            unstake_epoch: old.unstake_epoch,
            total_escrow: old.total_escrow,
            stake_rewards: old.stake_rewards,
            campaign_staking_rewards: old.campaign_staking_rewards,
            minimum_open_fund_stake: old.minimum_open_fund_stake,
            campaign_hold_until: LookupMap::new(StorageKey::CampaignHoldUntil),
        }
    }

    /// Configure the single reviewer-approved staking pool. No arbitrary pool can be selected by campaign owners.
    pub fn set_staking_pool(&mut self, pool_id: AccountId) {
        assert_eq!(env::predecessor_account_id(), self.admin, "Only platform reviewer");
        assert_ne!(pool_id, env::current_account_id(), "Contract cannot stake with itself");
        assert_eq!(self.stake_state, StakeState::Idle, "Finish the current staking position first");
        self.staking_pool = Some(pool_id);
    }

    /// Set the NEAR amount that currently represents the open-fund $1,000 threshold.
    /// The reviewer maintains this manually; it is not a live oracle price.
    pub fn set_open_fund_stake_threshold(&mut self, amount: U128) {
        assert_eq!(env::predecessor_account_id(), self.admin, "Only platform reviewer");
        assert!(amount.0 > 0, "Threshold must be positive");
        self.minimum_open_fund_stake = amount.0;
    }

    /// Create a campaign. The caller is its owner and the fixed payout recipient.
    pub fn create_campaign(
        &mut self,
        title: String,
        description: String,
        goal: U128,
        hold_until_ms: u64,
    ) -> u64 {
        let owner = env::predecessor_account_id();
        assert_valid_hold_date(hold_until_ms);
        assert!(title.trim().len() >= 8 && title.len() <= 120, "Title must be 8-120 chars");
        assert!(description.trim().len() >= 30 && description.len() <= 2_000, "Description must be 30-2000 chars");
        // A zero goal marks an ongoing fund with no fundraising cap.

        let id = self.next_campaign_id;
        self.next_campaign_id += 1;
        let campaign = Campaign {
            id,
            owner: owner.clone(),
            recipient: owner,
            title,
            description,
            goal: goal.0,
            raised: 0,
            remaining_escrow: 0,
            // A campaign must pass an off-chain review before receiving donations.
            active: false,
            milestones: vec![],
        };
        self.campaigns.insert(id, campaign);
        self.campaign_hold_until.insert(id, hold_until_ms);
        id
    }

    /// Campaigns created before hold dates existed can set one once. It cannot be changed afterwards.
    pub fn set_campaign_hold_until(&mut self, campaign_id: u64, hold_until_ms: u64) {
        let owner = self.campaigns.get(&campaign_id).expect("Campaign not found").owner.clone();
        assert_eq!(env::predecessor_account_id(), owner, "Only campaign owner");
        assert!(self.campaign_hold_until.get(&campaign_id).is_none(), "Hold date is already set and cannot be changed");
        assert_valid_hold_date(hold_until_ms);
        self.campaign_hold_until.insert(campaign_id, hold_until_ms);
    }

    /// Activate a campaign after the platform has reviewed the organization and proposal.
    pub fn approve_campaign(&mut self, campaign_id: u64) {
        assert_eq!(env::predecessor_account_id(), self.admin, "Only platform reviewer");
        let mut campaign = self.campaigns.get(&campaign_id).cloned().expect("Campaign not found");
        assert!(!campaign.active, "Campaign is already active");
        campaign.active = true;
        self.campaigns.insert(campaign_id, campaign);
    }

    /// Donate native NEAR. The full attached deposit is credited to campaign escrow.
    #[payable]
    pub fn donate(&mut self, campaign_id: u64) {
        let amount = env::attached_deposit().as_yoctonear();
        assert!(amount > 0, "Attach a positive NEAR amount");
        let mut campaign = self.campaigns.get(&campaign_id).cloned().expect("Campaign not found");
        assert!(campaign.active, "Campaign is not active");
        if let Some(hold_until) = self.campaign_hold_until.get(&campaign_id) {
            assert!(env::block_timestamp_ms() < *hold_until, "The donation period for this campaign has ended");
        }
        campaign.raised = campaign.raised.checked_add(amount).expect("Raised amount overflow");
        campaign.remaining_escrow = campaign.remaining_escrow.checked_add(amount).expect("Escrow overflow");
        self.total_escrow = self.total_escrow.checked_add(amount).expect("Escrow total overflow");
        self.campaigns.insert(campaign_id, campaign);
    }

    /// Owners may stake after the target is met, or after an ongoing fund reaches the reviewer-set NEAR threshold.
    pub fn stake_campaign_escrow(&mut self, campaign_id: u64, amount: U128) -> Promise {
        assert_eq!(self.stake_state, StakeState::Idle, "Another campaign staking position is active");
        let pool = self.staking_pool.clone().expect("Reviewer has not configured a staking pool");
        let campaign = self.campaigns.get(&campaign_id).cloned().expect("Campaign not found");
        assert_eq!(env::predecessor_account_id(), campaign.owner, "Only campaign owner");
        assert!(campaign.active, "Campaign is not active");
        let hold_until = *self.campaign_hold_until.get(&campaign_id).expect("Set a campaign hold date before staking");
        assert!(
            env::block_timestamp_ms().saturating_add(STAKE_EXIT_BUFFER_MS) <= hold_until,
            "Too close to the campaign hold date: staking needs at least 3 days to unstake and withdraw"
        );
        if campaign.goal == 0 {
            assert!(self.minimum_open_fund_stake > 0, "Reviewer has not configured the open-fund staking threshold");
            assert!(campaign.remaining_escrow >= self.minimum_open_fund_stake, "Open fund has not reached the reviewer-set staking threshold");
        } else {
            assert!(campaign.raised >= campaign.goal, "Campaign funding goal is not reached");
        }
        assert!(amount.0 > 0 && amount.0 <= campaign.remaining_escrow, "Invalid stake amount");
        // Keep every other campaign's liabilities liquid, along with a small gas/storage reserve.
        let reserve = NearToken::from_millinear(20).as_yoctonear();
        let other_liabilities = self.total_escrow.checked_sub(campaign.remaining_escrow).expect("Escrow accounting invariant failed");
        let liquid = env::account_balance().as_yoctonear();
        assert!(liquid >= other_liabilities.checked_add(amount.0).and_then(|v| v.checked_add(reserve)).expect("Stake bound overflow"), "Insufficient liquid balance after protecting other campaigns and reserve");
        self.stake_campaign_id = Some(campaign_id);
        self.staked_principal = amount.0;
        self.stake_state = StakeState::Staking;
        self.campaigns.insert(campaign_id, campaign);
        Promise::new(pool).function_call(
            "deposit_and_stake".to_string(),
            b"{}".to_vec(),
            NearToken::from_yoctonear(amount.0), POOL_CALL_GAS,
        ).then(Promise::new(env::current_account_id()).function_call(
            "on_stake_complete".to_string(),
            json!({"campaign_id": campaign_id, "amount": amount}).to_string().into_bytes(),
            NearToken::from_yoctonear(0), CALLBACK_GAS,
        ))
    }

    #[private]
    pub fn on_stake_complete(&mut self, campaign_id: u64, amount: U128) {
        assert_eq!(self.stake_state, StakeState::Staking, "No stake is pending");
        assert_eq!(self.stake_campaign_id, Some(campaign_id), "Unexpected campaign");
        if env::promise_result_checked(0, 0).is_ok() {
            self.stake_state = StakeState::Staked;
        } else {
            self.staked_principal = self.staked_principal.checked_sub(amount.0).expect("Stake amount underflow");
            self.stake_campaign_id = None;
            self.stake_state = StakeState::Idle;
        }
    }

    /// Start unbonding when the project needs cash. NEAR pools generally require four epochs before withdrawal.
    pub fn unstake_campaign_escrow(&mut self, campaign_id: u64) -> Promise {
        let campaign = self.campaigns.get(&campaign_id).cloned().expect("Campaign not found");
        assert!(
            env::predecessor_account_id() == campaign.owner || self.exit_window_open(campaign_id),
            "Only the campaign owner can unstake before the exit window opens"
        );
        assert_eq!(self.stake_campaign_id, Some(campaign_id), "Campaign has no staked position");
        assert_eq!(self.stake_state, StakeState::Staked, "Campaign is not ready to unstake");
        let pool = self.staking_pool.clone().expect("Staking pool is not configured");
        self.stake_state = StakeState::Unstaking;
        Promise::new(pool).function_call("unstake_all".to_string(), b"{}".to_vec(), NearToken::from_yoctonear(0), POOL_CALL_GAS)
            .then(Promise::new(env::current_account_id()).function_call(
                "on_unstake_complete".to_string(), json!({"campaign_id":campaign_id}).to_string().into_bytes(), NearToken::from_yoctonear(0), CALLBACK_GAS,
            ))
    }

    #[private]
    pub fn on_unstake_complete(&mut self, campaign_id: u64) {
        assert_eq!(self.stake_state, StakeState::Unstaking, "No unstake is pending");
        assert_eq!(self.stake_campaign_id, Some(campaign_id), "Unexpected campaign");
        if env::promise_result_checked(0, 0).is_ok() {
            self.unstake_epoch = env::epoch_height();
            self.stake_state = StakeState::Unstaked;
        } else {
            self.stake_state = StakeState::Staked;
        }
    }

    /// After four epochs, query the pool's withdrawable balance and retrieve it.
    pub fn withdraw_campaign_escrow(&mut self, campaign_id: u64) -> Promise {
        let campaign = self.campaigns.get(&campaign_id).cloned().expect("Campaign not found");
        assert!(
            env::predecessor_account_id() == campaign.owner || self.exit_window_open(campaign_id),
            "Only the campaign owner can withdraw before the exit window opens"
        );
        assert_eq!(self.stake_campaign_id, Some(campaign_id), "Campaign has no staking position");
        assert_eq!(self.stake_state, StakeState::Unstaked, "Campaign has not finished unstaking");
        assert!(env::epoch_height() >= self.unstake_epoch + REQUIRED_UNSTAKE_EPOCHS, "Staking pool withdrawal is still locked");
        let pool = self.staking_pool.clone().expect("Staking pool is not configured");
        self.stake_state = StakeState::CheckingWithdraw;
        Promise::new(pool).function_call("get_account".to_string(), json!({"account_id":env::current_account_id()}).to_string().into_bytes(), NearToken::from_yoctonear(0), POOL_CALL_GAS)
            .then(Promise::new(env::current_account_id()).function_call(
                "on_pool_balance_for_withdraw".to_string(), json!({"campaign_id":campaign_id}).to_string().into_bytes(), NearToken::from_yoctonear(0), WITHDRAW_CALLBACK_GAS,
            ))
    }

    #[private]
    pub fn on_pool_balance_for_withdraw(&mut self, campaign_id: u64) -> PromiseOrValue<bool> {
        assert_eq!(self.stake_state, StakeState::CheckingWithdraw, "No pool balance query is pending");
        assert_eq!(self.stake_campaign_id, Some(campaign_id), "Unexpected campaign");
        let bytes = match env::promise_result_checked(0, 1_000_000) {
            Ok(bytes) => bytes,
            Err(_) => { self.stake_state = StakeState::Unstaked; return PromiseOrValue::Value(false); }
        };
        let account: PoolAccountView = match near_sdk::serde_json::from_slice(&bytes) {
            Ok(value) => value,
            Err(_) => { self.stake_state = StakeState::Unstaked; return PromiseOrValue::Value(false); }
        };
        if !account.can_withdraw || account.unstaked_balance.0 == 0 {
            self.stake_state = StakeState::Unstaked;
            return PromiseOrValue::Value(false);
        }
        let pool = self.staking_pool.clone().expect("Staking pool is not configured");
        self.stake_state = StakeState::Withdrawing;
        PromiseOrValue::Promise(Promise::new(pool).function_call(
            "withdraw".to_string(), json!({"amount":account.unstaked_balance}).to_string().into_bytes(), NearToken::from_yoctonear(0), POOL_CALL_GAS,
        ).then(Promise::new(env::current_account_id()).function_call(
            "on_withdraw_complete".to_string(), json!({"campaign_id":campaign_id,"withdrawn":account.unstaked_balance}).to_string().into_bytes(), NearToken::from_yoctonear(0), CALLBACK_GAS,
        )))
    }

    #[private]
    pub fn on_withdraw_complete(&mut self, campaign_id: u64, withdrawn: U128) {
        assert_eq!(self.stake_state, StakeState::Withdrawing, "No pool withdrawal is pending");
        assert_eq!(self.stake_campaign_id, Some(campaign_id), "Unexpected campaign");
        if env::promise_result_checked(0, 0).is_ok() {
            let rewards = withdrawn.0.saturating_sub(self.staked_principal);
            let loss = self.staked_principal.saturating_sub(withdrawn.0);
            let mut campaign = self.campaigns.get(&campaign_id).cloned().expect("Campaign not found");
            campaign.remaining_escrow = campaign.remaining_escrow.checked_sub(loss).expect("Staking loss exceeds campaign escrow");
            campaign.remaining_escrow = campaign.remaining_escrow.checked_add(rewards).expect("Escrow overflow");
            self.total_escrow = self.total_escrow.checked_sub(loss).expect("Escrow total underflow after staking loss");
            self.total_escrow = self.total_escrow.checked_add(rewards).expect("Escrow total overflow");
            self.stake_rewards = self.stake_rewards.checked_add(rewards).expect("Rewards overflow");
            let campaign_rewards = self.campaign_staking_rewards.get(&campaign_id).copied().unwrap_or(0)
                .checked_add(rewards).expect("Campaign rewards overflow");
            self.campaign_staking_rewards.insert(campaign_id, campaign_rewards);
            self.campaigns.insert(campaign_id, campaign);
            self.staked_principal = 0;
            self.stake_campaign_id = None;
            self.stake_state = StakeState::Idle;
        } else {
            self.stake_state = StakeState::Unstaked;
        }
    }

    /// Campaign owner proposes a milestone and its requested payout.
    pub fn propose_milestone(&mut self, campaign_id: u64, title: String, amount: U128) -> u32 {
        let mut campaign = self.campaigns.get(&campaign_id).cloned().expect("Campaign not found");
        assert_eq!(env::predecessor_account_id(), campaign.owner, "Only campaign owner");
        assert!(campaign.active, "Campaign is not active");
        assert!(title.trim().len() >= 5 && title.len() <= 120, "Milestone title must be 5-120 chars");
        let campaign_staked = if self.stake_campaign_id == Some(campaign_id) { self.staked_principal } else { 0 };
        assert!(self.stake_state != StakeState::CheckingWithdraw && self.stake_state != StakeState::Withdrawing, "Staking withdrawal is in progress");
        assert!(amount.0 > 0 && amount.0 <= campaign.remaining_escrow.saturating_sub(campaign_staked), "Milestone amount exceeds liquid campaign escrow");
        campaign.milestones.push(Milestone {
            title,
            evidence_uri: None,
            amount: amount.0,
            status: MilestoneStatus::Proposed,
        });
        let id = (campaign.milestones.len() - 1) as u32;
        self.campaigns.insert(campaign_id, campaign);
        id
    }

    /// Owner submits a public evidence URL for the proposed milestone.
    pub fn submit_milestone_evidence(&mut self, campaign_id: u64, milestone_id: u32, evidence_uri: String) {
        let mut campaign = self.campaigns.get(&campaign_id).cloned().expect("Campaign not found");
        assert_eq!(env::predecessor_account_id(), campaign.owner, "Only campaign owner");
        assert!(evidence_uri.starts_with("https://") && evidence_uri.len() <= 500, "Evidence must be an HTTPS URL");
        let milestone = campaign.milestones.get_mut(milestone_id as usize).expect("Milestone not found");
        assert_eq!(milestone.status, MilestoneStatus::Proposed, "Milestone is not awaiting evidence");
        milestone.evidence_uri = Some(evidence_uri);
        milestone.status = MilestoneStatus::Submitted;
        self.campaigns.insert(campaign_id, campaign);
    }

    /// Admin approves and releases a milestone payout. Payout recipient is fixed at campaign creation.
    pub fn approve_and_release(&mut self, campaign_id: u64, milestone_id: u32) -> Promise {
        assert_eq!(env::predecessor_account_id(), self.admin, "Only platform reviewer");
        let mut campaign = self.campaigns.get(&campaign_id).cloned().expect("Campaign not found");
        let index = milestone_id as usize;
        let (amount, has_evidence, status) = {
            let milestone = campaign.milestones.get(index).expect("Milestone not found");
            (milestone.amount, milestone.evidence_uri.is_some(), milestone.status.clone())
        };
        assert_eq!(status, MilestoneStatus::Submitted, "Milestone has not been submitted");
        assert!(has_evidence, "Evidence is required");
        let campaign_staked = if self.stake_campaign_id == Some(campaign_id) { self.staked_principal } else { 0 };
        assert!(self.stake_state != StakeState::CheckingWithdraw && self.stake_state != StakeState::Withdrawing, "Staking withdrawal is in progress");
        assert!(amount <= campaign.remaining_escrow.saturating_sub(campaign_staked), "Insufficient liquid escrow; unstake and withdraw campaign funds first");
        campaign.remaining_escrow -= amount;
        self.total_escrow = self.total_escrow.checked_sub(amount).expect("Escrow total underflow");
        campaign.milestones[index].status = MilestoneStatus::Paying;
        let recipient = campaign.recipient.clone();
        self.campaigns.insert(campaign_id, campaign);

        Promise::new(recipient)
            .transfer(NearToken::from_yoctonear(amount))
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "on_payout_complete".to_string(),
                    json!({
                        "campaign_id": campaign_id,
                        "milestone_id": milestone_id,
                        "amount": U128(amount)
                    }).to_string().into_bytes(),
                    NearToken::from_yoctonear(0),
                    CALLBACK_GAS,
                )
            )
    }

    /// Restore escrow if the asynchronous NEAR transfer failed.
    #[private]
    pub fn on_payout_complete(&mut self, campaign_id: u64, milestone_id: u32, amount: U128) {
        let mut campaign = self.campaigns.get(&campaign_id).cloned().expect("Campaign not found");
        let milestone = campaign.milestones.get_mut(milestone_id as usize).expect("Milestone not found");
        assert_eq!(milestone.status, MilestoneStatus::Paying, "Payout is not pending");
        if env::promise_result_checked(0, 0).is_ok() {
            milestone.status = MilestoneStatus::Paid;
        } else {
            campaign.remaining_escrow = campaign.remaining_escrow.checked_add(amount.0).expect("Escrow overflow");
            self.total_escrow = self.total_escrow.checked_add(amount.0).expect("Escrow total overflow");
            milestone.status = MilestoneStatus::Submitted;
        }
        self.campaigns.insert(campaign_id, campaign);
    }

    pub fn get_campaign(&self, campaign_id: u64) -> Option<CampaignView> {
        self.campaigns.get(&campaign_id).cloned().map(|campaign| {
            let id = campaign.id;
            let mut view = CampaignView::from(campaign);
            view.hold_until_ms = self.campaign_hold_until.get(&id).copied().unwrap_or(0);
            view.staking_rewards = U128(self.campaign_staking_rewards.get(&id).copied().unwrap_or(0));
            if self.stake_campaign_id == Some(id) {
                view.staked_escrow = U128(self.staked_principal);
                view.stake_status = stake_state_name(&self.stake_state).to_string();
                view.unstake_epoch = self.unstake_epoch;
            }
            view
        })
    }

    pub fn get_staking_config(&self) -> StakingConfigView {
        StakingConfigView {
            pool_id: self.staking_pool.clone(),
            active_campaign_id: self.stake_campaign_id,
            principal: U128(self.staked_principal),
            status: stake_state_name(&self.stake_state).to_string(),
            unstake_epoch: self.unstake_epoch,
            required_unstake_epochs: REQUIRED_UNSTAKE_EPOCHS,
            current_epoch: env::epoch_height(),
            minimum_open_fund_stake: U128(self.minimum_open_fund_stake),
            stake_exit_buffer_ms: STAKE_EXIT_BUFFER_MS,
            now_ms: env::block_timestamp_ms(),
        }
    }

    /// True once a campaign is within the exit buffer of its hold date: anyone may then unstake/withdraw
    /// so staked donations are never held past the date the campaign committed to.
    fn exit_window_open(&self, campaign_id: u64) -> bool {
        match self.campaign_hold_until.get(&campaign_id) {
            Some(hold_until) => env::block_timestamp_ms().saturating_add(STAKE_EXIT_BUFFER_MS) >= *hold_until,
            None => false,
        }
    }

    pub fn get_campaign_count(&self) -> u64 {
        self.next_campaign_id
    }

    pub fn get_admin(&self) -> AccountId {
        self.admin.clone()
    }
}

#[derive(near_sdk::serde::Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct CampaignView {
    pub id: u64,
    pub owner: AccountId,
    pub recipient: AccountId,
    pub title: String,
    pub description: String,
    pub goal: U128,
    pub raised: U128,
    pub remaining_escrow: U128,
    pub active: bool,
    pub milestones: Vec<MilestoneView>,
    pub staked_escrow: U128,
    pub staking_rewards: U128,
    pub stake_status: String,
    pub unstake_epoch: u64,
    /// Unix ms until which donations may be collected and held; 0 = not set (legacy campaign).
    pub hold_until_ms: u64,
}

#[derive(near_sdk::serde::Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct StakingConfigView {
    pub pool_id: Option<AccountId>,
    pub active_campaign_id: Option<u64>,
    pub principal: U128,
    pub status: String,
    pub unstake_epoch: u64,
    pub required_unstake_epochs: u64,
    pub current_epoch: u64,
    pub minimum_open_fund_stake: U128,
    pub stake_exit_buffer_ms: u64,
    pub now_ms: u64,
}

fn assert_valid_hold_date(hold_until_ms: u64) {
    let now = env::block_timestamp_ms();
    assert!(hold_until_ms >= now.saturating_add(MIN_HOLD_MS), "Hold date must be at least one day in the future");
    assert!(hold_until_ms <= now.saturating_add(MAX_HOLD_MS), "Hold date must be within three years");
}

fn stake_state_name(state: &StakeState) -> &'static str {
    match state {
        StakeState::Idle => "idle",
        StakeState::Staking => "staking",
        StakeState::Staked => "staked",
        StakeState::Unstaking => "unstaking",
        StakeState::Unstaked => "unstaked",
        StakeState::CheckingWithdraw => "checking_withdraw",
        StakeState::Withdrawing => "withdrawing",
    }
}

#[derive(near_sdk::serde::Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct MilestoneView {
    pub title: String,
    pub evidence_uri: Option<String>,
    pub amount: U128,
    pub status: String,
}

impl From<Campaign> for CampaignView {
    fn from(c: Campaign) -> Self {
        Self {
            id: c.id,
            owner: c.owner,
            recipient: c.recipient,
            title: c.title,
            description: c.description,
            goal: U128(c.goal),
            raised: U128(c.raised),
            remaining_escrow: U128(c.remaining_escrow),
            active: c.active,
            staked_escrow: U128(0),
            staking_rewards: U128(0),
            stake_status: "idle".to_string(),
            unstake_epoch: 0,
            hold_until_ms: 0,
            milestones: c.milestones.into_iter().map(|m| MilestoneView {
                title: m.title,
                evidence_uri: m.evidence_uri,
                amount: U128(m.amount),
                status: match m.status {
                    MilestoneStatus::Proposed => "proposed",
                    MilestoneStatus::Submitted => "submitted",
                    MilestoneStatus::Paying => "paying",
                    MilestoneStatus::Paid => "paid",
                }.to_string(),
            }).collect(),
        }
    }
}


#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::{
        testing_env,
        test_utils::VMContextBuilder,
        PromiseResult,
    };
    #[allow(deprecated)]
    use near_sdk::test_utils::testing_env_with_promise_results;

    const HOLD: u64 = START_MS + 30 * DAY_MS;
    const START_MS: u64 = 1_800_000_000_000;

    fn account(value: &str) -> AccountId {
        value.parse().expect("valid test account")
    }

    fn set_context(predecessor: &str, deposit: NearToken) {
        set_context_with_balance(predecessor, deposit, NearToken::from_yoctonear(0));
    }

    fn set_context_with_balance(predecessor: &str, deposit: NearToken, balance: NearToken) {
        let predecessor = account(predecessor);
        let context = VMContextBuilder::new()
            .current_account_id(account("impactflow.testnet"))
            .block_timestamp(START_MS * 1_000_000)
            .predecessor_account_id(predecessor.clone())
            .signer_account_id(predecessor)
            .attached_deposit(deposit)
            .account_balance(balance)
            .build();
        testing_env!(context);
    }

    fn set_context_with_promise_result(predecessor: &str, result: PromiseResult) {
        let predecessor = account(predecessor);
        let context = VMContextBuilder::new()
            .current_account_id(account("impactflow.testnet"))
            .block_timestamp(START_MS * 1_000_000)
            .predecessor_account_id(predecessor.clone())
            .signer_account_id(predecessor)
            .build();
        #[allow(deprecated)]
        testing_env_with_promise_results(context, result);
    }

    fn set_context_with_epoch(predecessor: &str, epoch_height: u64) {
        let predecessor = account(predecessor);
        let context = VMContextBuilder::new()
            .current_account_id(account("impactflow.testnet"))
            .block_timestamp(START_MS * 1_000_000)
            .predecessor_account_id(predecessor.clone())
            .signer_account_id(predecessor)
            .epoch_height(epoch_height)
            .build();
        testing_env!(context);
    }

    fn set_context_with_epoch_and_promise_result(
        predecessor: &str,
        epoch_height: u64,
        result: PromiseResult,
    ) {
        let predecessor = account(predecessor);
        let context = VMContextBuilder::new()
            .current_account_id(account("impactflow.testnet"))
            .block_timestamp(START_MS * 1_000_000)
            .predecessor_account_id(predecessor.clone())
            .signer_account_id(predecessor)
            .epoch_height(epoch_height)
            .build();
        #[allow(deprecated)]
        testing_env_with_promise_results(context, result);
    }

    fn initialized() -> ImpactFlowEscrow {
        set_context("reviewer.testnet", NearToken::from_yoctonear(0));
        ImpactFlowEscrow::new(account("reviewer.testnet"))
    }

    fn create_approved_campaign(contract: &mut ImpactFlowEscrow) -> u64 {
        set_context("ngo.testnet", NearToken::from_yoctonear(0));
        let id = contract.create_campaign(
            "Restore local habitats".to_string(),
            "Funding native habitat restoration and measurable biodiversity work.".to_string(),
            U128(10),
            HOLD,
        );
        set_context("reviewer.testnet", NearToken::from_yoctonear(0));
        contract.approve_campaign(id);
        id
    }

    #[test]
    fn campaign_creation_fixes_owner_as_recipient() {
        let mut contract = initialized();
        set_context("ngo.testnet", NearToken::from_yoctonear(0));
        let id = contract.create_campaign(
            "Restore local habitats".to_string(),
            "Funding native habitat restoration and measurable biodiversity work.".to_string(),
            U128(10),
            HOLD,
        );
        let campaign = contract.get_campaign(id).expect("campaign exists");
        assert_eq!(campaign.owner, account("ngo.testnet"));
        assert_eq!(campaign.recipient, account("ngo.testnet"));
        assert_eq!(campaign.raised.0, 0);
        assert!(!campaign.active);
    }

    #[test]
    fn only_reviewer_can_approve_campaign() {
        let mut contract = initialized();
        set_context("ngo.testnet", NearToken::from_yoctonear(0));
        let id = contract.create_campaign("Restore local habitats".to_string(), "Funding native habitat restoration and measurable biodiversity work.".to_string(), U128(10), HOLD);
        set_context("attacker.testnet", NearToken::from_yoctonear(0));
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| contract.approve_campaign(id)));
        assert!(result.is_err());
    }

    #[test]
    fn donations_are_rejected_before_campaign_approval() {
        let mut contract = initialized();
        set_context("ngo.testnet", NearToken::from_yoctonear(0));
        let id = contract.create_campaign("Restore local habitats".to_string(), "Funding native habitat restoration and measurable biodiversity work.".to_string(), U128(10), HOLD);
        set_context("donor.testnet", NearToken::from_near(1));
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| contract.donate(id)));
        assert!(result.is_err());
    }

    #[test]
    fn donation_increases_raised_and_escrow() {
        let mut contract = initialized();
        let id = create_approved_campaign(&mut contract);
        set_context("donor.testnet", NearToken::from_near(1));
        contract.donate(id);
        let campaign = contract.get_campaign(id).expect("campaign exists");
        assert_eq!(campaign.raised.0, NearToken::from_near(1).as_yoctonear());
        assert_eq!(campaign.remaining_escrow.0, NearToken::from_near(1).as_yoctonear());
    }

    #[test]
    fn only_owner_can_propose_milestone() {
        let mut contract = initialized();
        let id = create_approved_campaign(&mut contract);
        set_context("donor.testnet", NearToken::from_yoctonear(0));
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.propose_milestone(id, "Plant native trees".to_string(), U128(1));
        }));
        assert!(result.is_err());
    }

    #[test]
    fn milestone_cannot_exceed_available_escrow() {
        let mut contract = initialized();
        let id = create_approved_campaign(&mut contract);
        set_context("donor.testnet", NearToken::from_near(1));
        contract.donate(id);
        set_context("ngo.testnet", NearToken::from_yoctonear(0));
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.propose_milestone(id, "Plant native trees".to_string(), U128(2 * NearToken::from_near(1).as_yoctonear()));
        }));
        assert!(result.is_err());
    }

    #[test]
    fn evidence_is_required_before_review() {
        let mut contract = initialized();
        let id = create_approved_campaign(&mut contract);
        set_context("donor.testnet", NearToken::from_near(1));
        contract.donate(id);
        set_context("ngo.testnet", NearToken::from_yoctonear(0));
        let milestone = contract.propose_milestone(id, "Plant native trees".to_string(), U128(NearToken::from_near(1).as_yoctonear()));
        set_context("reviewer.testnet", NearToken::from_yoctonear(0));
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _ = contract.approve_and_release(id, milestone);
        }));
        assert!(result.is_err());
    }

    #[test]
    fn only_reviewer_can_approve_release() {
        let mut contract = initialized();
        let id = create_approved_campaign(&mut contract);
        set_context("donor.testnet", NearToken::from_near(1));
        contract.donate(id);
        set_context("ngo.testnet", NearToken::from_yoctonear(0));
        let milestone = contract.propose_milestone(id, "Plant native trees".to_string(), U128(NearToken::from_near(1).as_yoctonear()));
        contract.submit_milestone_evidence(id, milestone, "https://example.org/evidence".to_string());
        set_context("attacker.testnet", NearToken::from_yoctonear(0));
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _ = contract.approve_and_release(id, milestone);
        }));
        assert!(result.is_err());
    }

    #[test]
    fn evidence_must_be_https() {
        let mut contract = initialized();
        let id = create_approved_campaign(&mut contract);
        set_context("donor.testnet", NearToken::from_near(1));
        contract.donate(id);
        set_context("ngo.testnet", NearToken::from_yoctonear(0));
        let milestone = contract.propose_milestone(id, "Plant native trees".to_string(), U128(NearToken::from_near(1).as_yoctonear()));
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.submit_milestone_evidence(id, milestone, "http://example.org/evidence".to_string());
        }));
        assert!(result.is_err());
    }

    #[test]
    fn staking_is_rejected_until_full_campaign_goal_is_reached() {
        let mut contract = initialized();
        let id = create_approved_campaign(&mut contract);
        set_context("donor.testnet", NearToken::from_yoctonear(1));
        contract.donate(id);
        set_context("reviewer.testnet", NearToken::from_yoctonear(0));
        contract.set_staking_pool(account("pool.testnet"));
        set_context("ngo.testnet", NearToken::from_yoctonear(0));
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _ = contract.stake_campaign_escrow(id, U128(1));
        }));
        assert!(result.is_err());
        assert_eq!(contract.stake_state, StakeState::Idle);
    }

    #[test]
    fn fully_funded_owner_can_start_optional_staking() {
        let mut contract = initialized();
        set_context("ngo.testnet", NearToken::from_yoctonear(0));
        let id = contract.create_campaign(
            "Restore local habitats".to_string(),
            "Funding native habitat restoration and measurable biodiversity work.".to_string(),
            U128(10),
            HOLD,
        );
        set_context("reviewer.testnet", NearToken::from_yoctonear(0));
        contract.approve_campaign(id);
        contract.set_staking_pool(account("pool.testnet"));
        set_context("donor.testnet", NearToken::from_yoctonear(10));
        contract.donate(id);
        set_context_with_balance("ngo.testnet", NearToken::from_yoctonear(0), NearToken::from_near(1));
        let _promise = contract.stake_campaign_escrow(id, U128(5));
        assert_eq!(contract.stake_state, StakeState::Staking);
        assert_eq!(contract.stake_campaign_id, Some(id));
        assert_eq!(contract.staked_principal, 5);
    }

    #[test]
    fn successful_stake_callback_advances_to_staked_and_failure_releases_position() {
        let mut contract = initialized();
        let id = create_approved_campaign(&mut contract);
        set_context("donor.testnet", NearToken::from_near(1));
        contract.donate(id);
        let campaign = contract.campaigns.get_mut(&id).expect("campaign exists");
        campaign.goal = campaign.raised;
        set_context("reviewer.testnet", NearToken::from_yoctonear(0));
        contract.set_staking_pool(account("pool.testnet"));
        set_context_with_balance("ngo.testnet", NearToken::from_yoctonear(0), NearToken::from_near(2));
        let _promise = contract.stake_campaign_escrow(id, U128(7));
        set_context_with_promise_result("impactflow.testnet", PromiseResult::Successful(vec![]));
        contract.on_stake_complete(id, U128(7));
        assert_eq!(contract.stake_state, StakeState::Staked);

        // Use a fresh contract to cover the failed external pool receipt.
        let mut failed = initialized();
        let failed_id = create_approved_campaign(&mut failed);
        set_context("donor.testnet", NearToken::from_near(1));
        failed.donate(failed_id);
        let campaign = failed.campaigns.get_mut(&failed_id).expect("campaign exists");
        campaign.goal = campaign.raised;
        set_context("reviewer.testnet", NearToken::from_yoctonear(0));
        failed.set_staking_pool(account("pool.testnet"));
        set_context_with_balance("ngo.testnet", NearToken::from_yoctonear(0), NearToken::from_near(2));
        let _promise = failed.stake_campaign_escrow(failed_id, U128(7));
        set_context_with_promise_result("impactflow.testnet", PromiseResult::Failed);
        failed.on_stake_complete(failed_id, U128(7));
        assert_eq!(failed.stake_state, StakeState::Idle);
        assert_eq!(failed.stake_campaign_id, None);
        assert_eq!(failed.staked_principal, 0);
        assert_eq!(failed.get_campaign(failed_id).unwrap().remaining_escrow.0, NearToken::from_near(1).as_yoctonear());
    }

    #[test]
    fn unstake_callback_records_epoch_and_reverts_state_on_pool_failure() {
        let mut contract = initialized();
        let id = create_approved_campaign(&mut contract);
        set_context("reviewer.testnet", NearToken::from_yoctonear(0));
        contract.set_staking_pool(account("pool.testnet"));
        contract.stake_campaign_id = Some(id);
        contract.staked_principal = 5;
        contract.stake_state = StakeState::Unstaking;
        set_context_with_epoch_and_promise_result("impactflow.testnet", 42, PromiseResult::Successful(vec![]));
        contract.on_unstake_complete(id);
        assert_eq!(contract.stake_state, StakeState::Unstaked);
        assert_eq!(contract.unstake_epoch, 42);

        contract.stake_state = StakeState::Unstaking;
        set_context_with_promise_result("impactflow.testnet", PromiseResult::Failed);
        contract.on_unstake_complete(id);
        assert_eq!(contract.stake_state, StakeState::Staked);
    }

    #[test]
    fn available_pool_balance_starts_withdraw_and_failed_query_recovers_state() {
        let mut contract = initialized();
        let id = create_approved_campaign(&mut contract);
        set_context("reviewer.testnet", NearToken::from_yoctonear(0));
        contract.set_staking_pool(account("pool.testnet"));
        contract.stake_campaign_id = Some(id);
        contract.staked_principal = 500;
        contract.stake_state = StakeState::CheckingWithdraw;

        let json = br#"{"unstaked_balance":"550","can_withdraw":true}"#.to_vec();
        set_context_with_promise_result("impactflow.testnet", PromiseResult::Successful(json));
        let result = contract.on_pool_balance_for_withdraw(id);
        assert!(matches!(result, PromiseOrValue::Promise(_)));
        assert_eq!(contract.stake_state, StakeState::Withdrawing);

        contract.stake_state = StakeState::CheckingWithdraw;
        set_context_with_promise_result("impactflow.testnet", PromiseResult::Failed);
        let result = contract.on_pool_balance_for_withdraw(id);
        assert!(matches!(result, PromiseOrValue::Value(false)));
        assert_eq!(contract.stake_state, StakeState::Unstaked);
    }

    #[test]
    fn withdraw_promise_chain_fits_the_configured_gas_budgets() {
        // Entry call reserves 35 Tgas for the view and 80 Tgas for its callback.
        // That callback needs 35 Tgas for withdraw and 20 Tgas for final accounting.
        assert!(POOL_CALL_GAS.as_gas() + WITHDRAW_CALLBACK_GAS.as_gas() < Gas::from_tgas(150).as_gas());
        assert!(POOL_CALL_GAS.as_gas() + CALLBACK_GAS.as_gas() < WITHDRAW_CALLBACK_GAS.as_gas());
    }

    #[test]
    fn malformed_pool_response_does_not_leave_withdrawal_locked() {
        let mut contract = initialized();
        let id = create_approved_campaign(&mut contract);
        contract.stake_campaign_id = Some(id);
        contract.staked_principal = 500;
        contract.stake_state = StakeState::CheckingWithdraw;
        set_context_with_promise_result("impactflow.testnet", PromiseResult::Successful(b"not-json".to_vec()));
        let result = contract.on_pool_balance_for_withdraw(id);
        assert!(matches!(result, PromiseOrValue::Value(false)));
        assert_eq!(contract.stake_state, StakeState::Unstaked);
    }

    #[test]
    fn only_campaign_owner_can_start_unstaking_or_withdrawal() {
        let mut contract = initialized();
        let id = create_approved_campaign(&mut contract);
        set_context("reviewer.testnet", NearToken::from_yoctonear(0));
        contract.set_staking_pool(account("pool.testnet"));
        contract.stake_campaign_id = Some(id);
        contract.staked_principal = 5;
        contract.stake_state = StakeState::Staked;
        set_context("attacker.testnet", NearToken::from_yoctonear(0));
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _ = contract.unstake_campaign_escrow(id);
        }));
        assert!(result.is_err());
        assert_eq!(contract.stake_state, StakeState::Staked);

        contract.stake_state = StakeState::Unstaked;
        contract.unstake_epoch = 0;
        set_context_with_epoch("attacker.testnet", 10);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _ = contract.withdraw_campaign_escrow(id);
        }));
        assert!(result.is_err());
        assert_eq!(contract.stake_state, StakeState::Unstaked);
    }

    #[test]
    fn withdrawal_is_rejected_until_four_epochs_after_unstake() {
        let mut contract = initialized();
        let id = create_approved_campaign(&mut contract);
        contract.stake_campaign_id = Some(id);
        contract.staked_principal = 5;
        contract.stake_state = StakeState::Unstaked;
        contract.unstake_epoch = 100;
        set_context_with_epoch("ngo.testnet", 103);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _ = contract.withdraw_campaign_escrow(id);
        }));
        assert!(result.is_err());
        assert_eq!(contract.stake_state, StakeState::Unstaked);
    }

    #[test]
    fn pool_balance_callback_waits_when_pool_says_withdrawal_is_not_ready() {
        let mut contract = initialized();
        let id = create_approved_campaign(&mut contract);
        contract.stake_campaign_id = Some(id);
        contract.staked_principal = 5;
        contract.stake_state = StakeState::CheckingWithdraw;
        let json = br#"{"unstaked_balance":"500","can_withdraw":false}"#.to_vec();
        set_context_with_promise_result("impactflow.testnet", PromiseResult::Successful(json));
        let result = contract.on_pool_balance_for_withdraw(id);
        assert!(matches!(result, PromiseOrValue::Value(false)));
        assert_eq!(contract.stake_state, StakeState::Unstaked);
    }

    #[test]
    fn withdraw_callback_returns_rewards_to_the_same_campaign_and_persists_its_total() {
        let mut contract = initialized();
        let id = create_approved_campaign(&mut contract);
        let principal = NearToken::from_near(1).as_yoctonear();
        set_context("donor.testnet", NearToken::from_near(1));
        contract.donate(id);
        contract.stake_campaign_id = Some(id);
        contract.staked_principal = principal;
        contract.stake_state = StakeState::Withdrawing;
        let reward = NearToken::from_millinear(5).as_yoctonear();
        set_context_with_promise_result("impactflow.testnet", PromiseResult::Successful(vec![]));
        contract.on_withdraw_complete(id, U128(principal + reward));
        let campaign = contract.get_campaign(id).unwrap();
        assert_eq!(campaign.remaining_escrow.0, principal + reward);
        assert_eq!(campaign.staking_rewards.0, reward);
        assert_eq!(contract.total_escrow, principal + reward);
        assert_eq!(contract.stake_state, StakeState::Idle);

        let next_id = create_approved_campaign(&mut contract);
        contract.campaign_staking_rewards.insert(next_id, 7);
        contract.stake_rewards = reward + 100;
        contract.stake_campaign_id = Some(next_id);
        contract.staked_principal = 5;
        contract.stake_state = StakeState::Staked;
        assert_eq!(contract.get_campaign(next_id).unwrap().staking_rewards.0, 7);
    }

    #[test]
    fn a_staking_loss_reduces_campaign_and_total_escrow_liabilities() {
        let mut contract = initialized();
        let id = create_approved_campaign(&mut contract);
        let original = NearToken::from_near(1).as_yoctonear();
        set_context("donor.testnet", NearToken::from_near(1));
        contract.donate(id);
        let loss = NearToken::from_millinear(10).as_yoctonear();
        contract.stake_campaign_id = Some(id);
        contract.staked_principal = original;
        contract.stake_state = StakeState::Withdrawing;
        set_context_with_promise_result("impactflow.testnet", PromiseResult::Successful(vec![]));
        contract.on_withdraw_complete(id, U128(original - loss));
        assert_eq!(contract.get_campaign(id).unwrap().remaining_escrow.0, original - loss);
        assert_eq!(contract.total_escrow, original - loss);
        assert_eq!(contract.stake_state, StakeState::Idle);
    }

    #[test]
    fn only_reviewer_can_configure_staking_pool() {
        let mut contract = initialized();
        set_context("attacker.testnet", NearToken::from_yoctonear(0));
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.set_staking_pool(account("pool.testnet"));
        }));
        assert!(result.is_err());
    }

    #[test]
    fn migration_preserves_legacy_campaigns_and_escrow_total() {
        set_context("reviewer.testnet", NearToken::from_yoctonear(0));
        let mut campaigns = LookupMap::new(StorageKey::Campaigns);
        campaigns.insert(0, Campaign {
            id: 0,
            owner: account("ngo.testnet"),
            recipient: account("ngo.testnet"),
            title: "Restore local habitats".to_string(),
            description: "Funding native habitat restoration and measurable biodiversity work.".to_string(),
            goal: 10,
            raised: 7,
            remaining_escrow: 7,
            active: true,
            milestones: vec![],
        });
        env::state_write(&LegacyEscrow {
            admin: account("reviewer.testnet"),
            next_campaign_id: 1,
            campaigns,
        });
        let migrated = ImpactFlowEscrow::migrate();
        let campaign = migrated.get_campaign(0).expect("legacy campaign remains readable");
        assert_eq!(migrated.get_campaign_count(), 1);
        assert_eq!(campaign.remaining_escrow.0, 7);
        assert_eq!(migrated.total_escrow, 7);
        assert_eq!(migrated.get_staking_config().status, "idle");
    }

    #[test]
    fn milestone_cannot_spend_campaign_escrow_while_it_is_staked() {
        let mut contract = initialized();
        let id = create_approved_campaign(&mut contract);
        set_context("donor.testnet", NearToken::from_near(1));
        contract.donate(id);
        set_context("ngo.testnet", NearToken::from_yoctonear(0));
        let milestone = contract.propose_milestone(id, "Plant native trees".to_string(), U128(NearToken::from_near(1).as_yoctonear()));
        contract.submit_milestone_evidence(id, milestone, "https://example.org/evidence".to_string());
        contract.stake_campaign_id = Some(id);
        contract.staked_principal = NearToken::from_near(1).as_yoctonear();
        contract.stake_state = StakeState::Staked;
        set_context("reviewer.testnet", NearToken::from_yoctonear(0));
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _ = contract.approve_and_release(id, milestone);
        }));
        assert!(result.is_err());
    }


    fn set_context_at(predecessor: &str, deposit: NearToken, balance: NearToken, now_ms: u64) {
        let predecessor = account(predecessor);
        let context = VMContextBuilder::new()
            .current_account_id(account("impactflow.testnet"))
            .block_timestamp(now_ms * 1_000_000)
            .predecessor_account_id(predecessor.clone())
            .signer_account_id(predecessor)
            .attached_deposit(deposit)
            .account_balance(balance)
            .build();
        testing_env!(context);
    }

    fn funded_campaign_with_pool(contract: &mut ImpactFlowEscrow, hold_until_ms: u64) -> u64 {
        set_context("ngo.testnet", NearToken::from_yoctonear(0));
        let id = contract.create_campaign(
            "Restore local habitats".to_string(),
            "Funding native habitat restoration and measurable biodiversity work.".to_string(),
            U128(10),
            hold_until_ms,
        );
        set_context("reviewer.testnet", NearToken::from_yoctonear(0));
        contract.approve_campaign(id);
        contract.set_staking_pool(account("pool.testnet"));
        set_context("donor.testnet", NearToken::from_yoctonear(10));
        contract.donate(id);
        id
    }

    #[test]
    fn campaign_requires_a_hold_date_between_one_day_and_three_years() {
        let mut contract = initialized();
        set_context("ngo.testnet", NearToken::from_yoctonear(0));
        for bad in [START_MS, START_MS + DAY_MS - 1, START_MS + MAX_HOLD_MS + 1] {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                contract.create_campaign("Restore local habitats".to_string(), "Funding native habitat restoration and measurable biodiversity work.".to_string(), U128(10), bad);
            }));
            assert!(result.is_err(), "hold date {bad} should be rejected");
        }
        let id = contract.create_campaign("Restore local habitats".to_string(), "Funding native habitat restoration and measurable biodiversity work.".to_string(), U128(10), HOLD);
        assert_eq!(contract.get_campaign(id).unwrap().hold_until_ms, HOLD);
    }

    #[test]
    fn donations_close_at_the_hold_date() {
        let mut contract = initialized();
        let id = create_approved_campaign(&mut contract);
        set_context_at("donor.testnet", NearToken::from_near(1), NearToken::from_yoctonear(0), HOLD - 1);
        contract.donate(id);
        set_context_at("donor.testnet", NearToken::from_near(1), NearToken::from_yoctonear(0), HOLD);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| contract.donate(id)));
        assert!(result.is_err());
        assert_eq!(contract.get_campaign(id).unwrap().raised.0, NearToken::from_near(1).as_yoctonear());
    }

    #[test]
    fn staking_is_rejected_when_the_exit_buffer_no_longer_fits_before_the_hold_date() {
        let mut contract = initialized();
        let hold = START_MS + 10 * DAY_MS;
        let id = funded_campaign_with_pool(&mut contract, hold);
        // Exactly three days before the hold date still fits.
        set_context_at("ngo.testnet", NearToken::from_yoctonear(0), NearToken::from_near(1), hold - STAKE_EXIT_BUFFER_MS);
        let _ = contract.stake_campaign_escrow(id, U128(5));
        assert_eq!(contract.stake_state, StakeState::Staking);

        let mut late = initialized();
        let late_id = funded_campaign_with_pool(&mut late, hold);
        set_context_at("ngo.testnet", NearToken::from_yoctonear(0), NearToken::from_near(1), hold - STAKE_EXIT_BUFFER_MS + 1);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _ = late.stake_campaign_escrow(late_id, U128(5));
        }));
        assert!(result.is_err());
        assert_eq!(late.stake_state, StakeState::Idle);
    }

    #[test]
    fn campaigns_without_a_hold_date_cannot_stake_until_the_owner_sets_one_once() {
        let mut contract = initialized();
        let id = funded_campaign_with_pool(&mut contract, HOLD);
        // Simulate a campaign created before hold dates existed.
        contract.campaign_hold_until.remove(&id);
        set_context_with_balance("ngo.testnet", NearToken::from_yoctonear(0), NearToken::from_near(1));
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _ = contract.stake_campaign_escrow(id, U128(5));
        }));
        assert!(result.is_err());

        set_context("attacker.testnet", NearToken::from_yoctonear(0));
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| contract.set_campaign_hold_until(id, HOLD)));
        assert!(result.is_err());

        set_context("ngo.testnet", NearToken::from_yoctonear(0));
        contract.set_campaign_hold_until(id, HOLD);
        assert_eq!(contract.get_campaign(id).unwrap().hold_until_ms, HOLD);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| contract.set_campaign_hold_until(id, HOLD + DAY_MS)));
        assert!(result.is_err(), "hold date must not be extendable");
    }

    #[test]
    fn anyone_can_unstake_and_withdraw_once_the_exit_window_opens() {
        let mut contract = initialized();
        let hold = START_MS + 10 * DAY_MS;
        let id = funded_campaign_with_pool(&mut contract, hold);
        contract.stake_campaign_id = Some(id);
        contract.staked_principal = 5;
        contract.stake_state = StakeState::Staked;

        // Before the exit window, strangers cannot force an unstake.
        set_context_at("anyone.testnet", NearToken::from_yoctonear(0), NearToken::from_yoctonear(0), hold - STAKE_EXIT_BUFFER_MS - 1);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _ = contract.unstake_campaign_escrow(id);
        }));
        assert!(result.is_err());
        assert_eq!(contract.stake_state, StakeState::Staked);

        // Once the remaining time only covers the exit, anyone may start it.
        set_context_at("anyone.testnet", NearToken::from_yoctonear(0), NearToken::from_yoctonear(0), hold - STAKE_EXIT_BUFFER_MS);
        let _ = contract.unstake_campaign_escrow(id);
        assert_eq!(contract.stake_state, StakeState::Unstaking);

        contract.stake_state = StakeState::Unstaked;
        contract.unstake_epoch = 0;
        let predecessor = account("anyone.testnet");
        let context = VMContextBuilder::new()
            .current_account_id(account("impactflow.testnet"))
            .block_timestamp(hold * 1_000_000)
            .epoch_height(REQUIRED_UNSTAKE_EPOCHS)
            .predecessor_account_id(predecessor.clone())
            .signer_account_id(predecessor)
            .build();
        testing_env!(context);
        let _ = contract.withdraw_campaign_escrow(id);
        assert_eq!(contract.stake_state, StakeState::CheckingWithdraw);
    }

    #[test]
    fn migration_v3_preserves_state_and_starts_without_hold_dates() {
        set_context("reviewer.testnet", NearToken::from_yoctonear(0));
        let mut campaigns = LookupMap::new(StorageKey::Campaigns);
        campaigns.insert(0, Campaign {
            id: 0,
            owner: account("ngo.testnet"),
            recipient: account("ngo.testnet"),
            title: "Restore local habitats".to_string(),
            description: "Funding native habitat restoration and measurable biodiversity work.".to_string(),
            goal: 10,
            raised: 7,
            remaining_escrow: 7,
            active: true,
            milestones: vec![],
        });
        env::state_write(&LegacyEscrowV3 {
            admin: account("reviewer.testnet"),
            next_campaign_id: 1,
            campaigns,
            staking_pool: Some(account("pool.testnet")),
            stake_campaign_id: None,
            staked_principal: 0,
            stake_state: StakeState::Idle,
            unstake_epoch: 0,
            total_escrow: 7,
            stake_rewards: 0,
            campaign_staking_rewards: LookupMap::new(StorageKey::CampaignStakingRewards),
            minimum_open_fund_stake: 42,
        });
        let migrated = ImpactFlowEscrow::migrate_v3();
        let campaign = migrated.get_campaign(0).expect("campaign remains readable");
        assert_eq!(campaign.remaining_escrow.0, 7);
        assert_eq!(campaign.hold_until_ms, 0);
        assert_eq!(migrated.total_escrow, 7);
        assert_eq!(migrated.minimum_open_fund_stake, 42);
        assert_eq!(migrated.get_staking_config().pool_id, Some(account("pool.testnet")));
    }

    #[test]
    fn only_reviewer_can_run_migration_v3() {
        set_context("reviewer.testnet", NearToken::from_yoctonear(0));
        env::state_write(&LegacyEscrowV3 {
            admin: account("reviewer.testnet"),
            next_campaign_id: 0,
            campaigns: LookupMap::new(StorageKey::Campaigns),
            staking_pool: None,
            stake_campaign_id: None,
            staked_principal: 0,
            stake_state: StakeState::Idle,
            unstake_epoch: 0,
            total_escrow: 0,
            stake_rewards: 0,
            campaign_staking_rewards: LookupMap::new(StorageKey::CampaignStakingRewards),
            minimum_open_fund_stake: 0,
        });
        set_context("attacker.testnet", NearToken::from_yoctonear(0));
        let result = std::panic::catch_unwind(|| ImpactFlowEscrow::migrate_v3());
        assert!(result.is_err());
    }
}
