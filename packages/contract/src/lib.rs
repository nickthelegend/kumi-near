//! Kumi crew hub: "your group chat is a fund".
//!
//! Each crew gets its own Sputnik DAO v2 instance, created by this contract through the Sputnik
//! factory with a policy the hub writes (crew members in one role, a strict-majority vote). The
//! hub holds the crew's vault (the Moloch "guild bank" pattern), because ragequit must work
//! without a vote. The DAO is the only account that can authorize a voted trade, install or
//! revoke a captain key, or admit a member.
//!
//! * Shares: one non-transferable NEP-245 token id per crew (`crew:<id>`), minted at NAV.
//! * Voted trades: `propose_trade` records the quote and files a FunctionCall proposal in the
//!   crew's DAO. When the vote passes, the DAO calls `execute_trade`, once.
//! * Captain lane: the DAO installs a function-call access key on this account that may call only
//!   `captain_trade`; the contract enforces max size, trades per day and allowed assets.
//! * Ragequit: burn shares for the exact pro-rata slice of every asset. No vote. A full exit also
//!   ends the member's vote: the hub drops them from the member list, deletes their captain key,
//!   and files and approves a `RemoveMemberFromRole` proposal in the crew's DAO (the hub's DAO
//!   role may do exactly that). If the removal fails it is recorded (`get_stale_voters`), logged
//!   as `member_removal_failed`, and anyone can retry it with `remove_ex_member`.
//! * Vote recount: before a voted trade executes, the hub re-reads the DAO proposal and counts only
//!   approvals from accounts that hold shares now. They must be a strict majority of the
//!   shareholders, so an ex-member's earlier or late vote can never carry a trade.
//! * Follower vault: outsiders deposit; every crew trade is mirrored pro rata in the same swap;
//!   the crew earns a performance fee above a high-water mark.
//! * Receipts: every state change appends an on-chain receipt that the P&L engine reads.
use near_sdk::json_types::{Base64VecU8, U128, U64};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::serde_json::{self, json};
use near_sdk::store::LookupMap;
use near_sdk::{
    env, near, require, AccountId, Allowance, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue, PublicKey,
};
use primitive_types::U256;
use std::collections::BTreeMap;

pub const ONE_NEAR: u128 = 10u128.pow(24);
/// Price-per-share scale: 1.0 is 10^24.
pub const PPS_ONE: u128 = 10u128.pow(24);
const DAY_NS: u64 = 86_400_000_000_000;
const MAX_MEMBERS: usize = 16;
const MAX_ASSETS: usize = 4;
const MIN_DEPOSIT: u128 = ONE_NEAR / 100;
const CAPTAIN_GAS_ALLOWANCE: NearToken = NearToken::from_millinear(500);
const GAS_FACTORY: Gas = Gas::from_tgas(150);
const GAS_ON_CREATED: Gas = Gas::from_tgas(50);
const GAS_VIEW_POLICY: Gas = Gas::from_tgas(10);
const GAS_ON_POLICY: Gas = Gas::from_tgas(25);
const GAS_ADD_PROPOSAL: Gas = Gas::from_tgas(25);
const GAS_ON_PROPOSAL: Gas = Gas::from_tgas(10);
const GAS_EXECUTE_ACTION: u64 = 150_000_000_000_000;
const GAS_SWAP: Gas = Gas::from_tgas(20);
const GAS_ON_SWAP: Gas = Gas::from_tgas(25);
const GAS_VIEW_RESERVES: Gas = Gas::from_tgas(5);
const GAS_ON_MARKS: Gas = Gas::from_tgas(60);
const GAS_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_ON_PAYOUT: Gas = Gas::from_tgas(8);
const GAS_VIEW_PROPOSAL: Gas = Gas::from_tgas(10);
const GAS_ON_TALLY: Gas = Gas::from_tgas(60);
const GAS_ACT_PROPOSAL: Gas = Gas::from_tgas(25);
const GAS_ON_REMOVAL_FILED: Gas = Gas::from_tgas(55);
const GAS_ON_REMOVAL_DONE: Gas = Gas::from_tgas(10);
/// The crew's voting role in its DAO.
const CREW_ROLE: &str = "crew";
/// Raw storage prefixes (no change to the contract's Borsh state layout): ex-members whose DAO
/// role removal is still pending, per crew; and the block at which the DAO last admitted a member.
const STALE_PREFIX: &[u8] = b"x";
const ADMIT_PREFIX: &[u8] = b"a";

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Asset {
    /// Display symbol, e.g. "SOL". On testnet it maps to a Kumi test pool token.
    pub symbol: String,
    /// The NEP-141 token contract (on testnet: a Kumi test pool with a built-in NEAR pool).
    pub token: AccountId,
    pub decimals: u8,
    /// The real-asset 1Click id that mainnet quotes use, e.g. "nep141:sol.omft.near".
    pub intents_asset: String,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum Side { Buy, Sell }

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum TradeKind { Vote, Captain }

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum TradeStatus { Filing, Voting, Executing, Executed, Failed }

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Trade {
    pub id: u64,
    pub kind: TradeKind,
    pub proposer: AccountId,
    pub side: Side,
    pub asset: String,
    /// Share of the input side's holdings to trade, in basis points, read at execution time.
    pub bps: u16,
    /// The quote attached at proposal: `quote_in` in, `quote_out` out. Bounds the fill.
    pub quote_in: U128,
    pub quote_out: U128,
    /// sha256 (hex) of the full off-chain quote JSON (pool quote plus the 1Click dry quote).
    pub quote_hash: String,
    pub dao_proposal_id: Option<u64>,
    pub status: TradeStatus,
    pub created_at: U64,
    pub executed_at: Option<U64>,
    pub crew_in: U128,
    pub crew_out: U128,
    pub vault_in: U128,
    pub vault_out: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Captain {
    pub account_id: AccountId,
    pub public_key: PublicKey,
    pub max_bps: u16,
    pub max_daily: u16,
    pub assets: Vec<String>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Default)]
pub struct Vault {
    pub shares: BTreeMap<AccountId, u128>,
    pub supply: u128,
    pub near: u128,
    pub tokens: BTreeMap<String, u128>,
    pub fee_bps: u16,
    /// High-water mark, price per share (PPS_ONE = 1.0).
    pub hwm: u128,
    /// Total fee value moved to the crew, valued in yoctoNEAR at crystallization.
    pub fees_paid: u128,
}

#[near(serializers = [borsh])]
pub struct Crew {
    pub name: String,
    pub dao: AccountId,
    pub creator: AccountId,
    pub created_at: u64,
    pub allowed: Vec<AccountId>,
    pub shares: BTreeMap<AccountId, u128>,
    pub supply: u128,
    pub near: u128,
    pub tokens: BTreeMap<String, u128>,
    pub deposited: u128,
    pub slippage_bps: u16,
    pub captain: Option<Captain>,
    pub captain_day: u64,
    pub captain_count: u16,
    pub vault: Vault,
    pub busy: bool,
    pub trade_count: u64,
    pub receipt_count: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Mark {
    pub symbol: String,
    pub near_reserve: U128,
    pub token_reserve: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Receipt {
    pub seq: u64,
    pub kind: String,
    pub account_id: AccountId,
    pub at: U64,
    pub block: U64,
    pub trade_id: Option<u64>,
    /// NEAR moved in (+) to the crew side by this event, and out (-) of it.
    pub near_in: U128,
    pub near_out: U128,
    pub asset: Option<String>,
    pub token_in: U128,
    pub token_out: U128,
    pub shares: U128,
    /// Pool marks the contract read on-chain for this event (joins, follows, fees).
    pub marks: Vec<Mark>,
    /// Crew state after the event.
    pub crew_near: U128,
    pub crew_tokens: Vec<(String, U128)>,
    pub crew_supply: U128,
    /// Follower vault state after the event.
    pub vault_near: U128,
    pub vault_tokens: Vec<(String, U128)>,
    pub vault_supply: U128,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct CrewView {
    pub id: u64,
    pub name: String,
    pub dao: AccountId,
    pub creator: AccountId,
    pub created_at: U64,
    pub allowed: Vec<AccountId>,
    pub members: Vec<(AccountId, U128)>,
    pub supply: U128,
    pub near: U128,
    pub tokens: Vec<(String, U128)>,
    pub deposited: U128,
    pub slippage_bps: u16,
    pub captain: Option<Captain>,
    pub captain_trades_today: u16,
    pub vault_supply: U128,
    pub vault_near: U128,
    pub vault_tokens: Vec<(String, U128)>,
    pub vault_fee_bps: u16,
    pub vault_hwm: U128,
    pub vault_fees_paid: U128,
    pub followers: Vec<(AccountId, U128)>,
    pub busy: bool,
    pub trade_count: u64,
    pub receipt_count: u64,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Reserves { pub near: U128, pub token: U128, pub fee_bps: u16 }

#[near(serializers = [json])]
pub enum MarkAction {
    Join { account_id: AccountId, amount: U128 },
    Follow { account_id: AccountId, amount: U128 },
    Unfollow { account_id: AccountId, shares: U128 },
    Fee,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Kumi {
    owner: AccountId,
    factory: AccountId,
    dao_deposit: u128,
    assets: Vec<Asset>,
    crews: LookupMap<u64, Crew>,
    crew_count: u64,
    trades: LookupMap<(u64, u64), Trade>,
    receipts: LookupMap<(u64, u64), Receipt>,
    claimable: LookupMap<(AccountId, String), u128>,
    captain_keys: LookupMap<PublicKey, u64>,
}

#[near]
impl Kumi {
    #[init]
    pub fn new(owner: AccountId, factory: AccountId, dao_deposit: U128, assets: Vec<Asset>) -> Self {
        require!(assets.len() <= MAX_ASSETS, "ERR_TOO_MANY_ASSETS");
        Self {
            owner, factory, dao_deposit: dao_deposit.0, assets,
            crews: LookupMap::new(b"c"), crew_count: 0,
            trades: LookupMap::new(b"t"), receipts: LookupMap::new(b"r"),
            claimable: LookupMap::new(b"l"), captain_keys: LookupMap::new(b"k"),
        }
    }

    /// The owner can list another pool asset. The owner has no path to any crew's funds.
    pub fn add_asset(&mut self, asset: Asset) {
        require!(env::predecessor_account_id() == self.owner, "ERR_OWNER_ONLY");
        require!(self.assets.len() < MAX_ASSETS, "ERR_TOO_MANY_ASSETS");
        require!(self.assets.iter().all(|a| a.symbol != asset.symbol), "ERR_ASSET_EXISTS");
        self.assets.push(asset);
    }

    // ------------------------------------------------------------------ crews

    /// Creates `<slug>.<factory>` through the Sputnik v2 factory, with the crew members as the
    /// only voting role (strict majority, no bond, one-day period) and the hub allowed to file
    /// trade proposals and to remove a member who has ragequit (it files and approves
    /// `RemoveMemberFromRole` only). Attach at least `dao_deposit` (the DAO's code storage).
    #[payable]
    pub fn create_crew(&mut self, name: String, slug: String, members: Vec<AccountId>, fee_bps: u16) -> Promise {
        let deposit = env::attached_deposit().as_yoctonear();
        require!(deposit >= self.dao_deposit, "ERR_DAO_DEPOSIT");
        require!(!name.trim().is_empty() && name.len() <= 48, "ERR_NAME");
        require!(!slug.is_empty() && slug.len() <= 24 && slug.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-'), "ERR_SLUG");
        require!(!members.is_empty() && members.len() <= MAX_MEMBERS, "ERR_MEMBERS");
        require!(fee_bps <= 3_000, "ERR_FEE");
        let creator = env::predecessor_account_id();
        let hub = env::current_account_id();
        let period = (DAY_NS as u128).to_string();
        let args = json!({
            "config": { "name": slug, "purpose": format!("Kumi crew: {name}"), "metadata": "" },
            "policy": {
                "roles": [
                    { "name": "crew", "kind": { "Group": members },
                      "permissions": ["*:AddProposal", "*:VoteApprove", "*:VoteReject", "*:VoteRemove", "*:Finalize"],
                      "vote_policy": {} },
                    { "name": "hub", "kind": { "Group": [hub] }, "permissions": HUB_PERMISSIONS, "vote_policy": {} }
                ],
                "default_vote_policy": { "weight_kind": "RoleWeight", "quorum": "0", "threshold": [1, 2] },
                "proposal_bond": "0",
                "proposal_period": period,
                "bounty_bond": "0",
                "bounty_forgiveness_period": period
            }
        });
        let encoded = Base64VecU8::from(serde_json::to_vec(&args).unwrap());
        Promise::new(self.factory.clone())
            .function_call("create", json!({"name": slug, "args": encoded}).to_string().into_bytes(),
                NearToken::from_yoctonear(deposit), GAS_FACTORY)
            .then(Self::ext(hub).with_static_gas(GAS_ON_CREATED)
                .on_crew_created(name, slug, members, fee_bps, creator, U128(deposit)))
    }

    /// The factory's `create` returns before the DAO exists, so the hub reads the new DAO's
    /// policy next. The crew is registered only if the DAO exists with exactly the policy the
    /// hub wrote; otherwise the factory has refunded the hub and the hub refunds the creator.
    #[private]
    pub fn on_crew_created(&mut self, name: String, slug: String, members: Vec<AccountId>, fee_bps: u16,
        creator: AccountId, deposit: U128) -> Promise {
        let dao: AccountId = format!("{slug}.{}", self.factory).parse().unwrap();
        if env::promise_result_checked(0, 64).is_err() {
            emit("crew_failed", json!({"slug": slug}));
            return Promise::new(creator).transfer(NearToken::from_yoctonear(deposit.0));
        }
        Promise::new(dao)
            .function_call("get_policy", b"{}".to_vec(), NearToken::from_yoctonear(0), GAS_VIEW_POLICY)
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_ON_POLICY)
                .on_dao_policy(name, slug, members, fee_bps, creator, deposit))
    }

    #[private]
    pub fn on_dao_policy(&mut self, name: String, slug: String, members: Vec<AccountId>, fee_bps: u16,
        creator: AccountId, deposit: U128) -> Option<u64> {
        let hub = env::current_account_id();
        let group = |policy: &serde_json::Value, role: &str| -> Option<Vec<String>> {
            let r = policy["roles"].as_array()?.iter().find(|r| r["name"] == role)?;
            let mut g: Vec<String> = r["kind"]["Group"].as_array()?.iter().filter_map(|v| v.as_str().map(String::from)).collect();
            g.sort();
            Some(g)
        };
        let mut want: Vec<String> = members.iter().map(|m| m.to_string()).collect();
        want.sort();
        let ours = env::promise_result_checked(0, 16_384).ok()
            .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
            .map(|p| group(&p, "crew") == Some(want) && group(&p, "hub") == Some(vec![hub.to_string()]))
            .unwrap_or(false);
        if !ours {
            Promise::new(creator).transfer(NearToken::from_yoctonear(deposit.0)).detach();
            emit("crew_failed", json!({"slug": slug}));
            return None;
        }
        let dao: AccountId = format!("{slug}.{}", self.factory).parse().unwrap();
        let id = self.crew_count;
        self.crew_count += 1;
        let crew = Crew {
            name, dao: dao.clone(), creator: creator.clone(), created_at: env::block_timestamp(), allowed: members,
            shares: BTreeMap::new(), supply: 0, near: 0, tokens: BTreeMap::new(), deposited: 0,
            slippage_bps: 300, captain: None, captain_day: 0, captain_count: 0,
            vault: Vault { fee_bps, hwm: PPS_ONE, ..Default::default() },
            busy: false, trade_count: 0, receipt_count: 0,
        };
        self.crews.insert(id, crew);
        emit("crew_created", json!({"crew_id": id, "dao": dao, "creator": creator}));
        Some(id)
    }

    /// DAO-only: admit another member (the DAO also adds them to its `crew` role). Re-admitting
    /// an ex-member cancels their pending removal and voids older ragequit receipts as proof.
    pub fn add_member(&mut self, crew_id: u64, account_id: AccountId) {
        let crew = self.crew_mut(crew_id);
        require!(env::predecessor_account_id() == crew.dao, "ERR_DAO_ONLY");
        require!(crew.allowed.len() < MAX_MEMBERS, "ERR_MEMBERS");
        if !crew.allowed.contains(&account_id) { crew.allowed.push(account_id.clone()); }
        env::storage_write(&admit_key(crew_id, &account_id), &env::block_height().to_le_bytes());
        let mut stale = self.stale_voters(crew_id);
        if stale.contains(&account_id) { stale.retain(|a| a != &account_id); self.write_stale(crew_id, &stale); }
    }

    /// Deposit NEAR and receive crew shares at NAV. If the crew holds tokens, the contract first
    /// reads every pool's reserves on-chain and mints in the callback.
    #[payable]
    pub fn join(&mut self, crew_id: u64) -> PromiseOrValue<U128> {
        let account_id = env::predecessor_account_id();
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount >= MIN_DEPOSIT, "ERR_MIN_DEPOSIT");
        let crew = self.crew(crew_id);
        require!(crew.allowed.contains(&account_id), "ERR_NOT_INVITED");
        require!(!crew.busy, "ERR_TRADE_IN_FLIGHT");
        let held: Vec<String> = crew.tokens.iter().filter(|(_, v)| **v > 0).map(|(k, _)| k.clone()).collect();
        if held.is_empty() {
            return PromiseOrValue::Value(U128(self.finish_join(crew_id, account_id, amount, &[])));
        }
        PromiseOrValue::Promise(self.with_marks(crew_id, held, MarkAction::Join { account_id, amount: U128(amount) }))
    }

    /// Burn `shares` for the exact pro-rata slice of the crew's NEAR and every token. No vote.
    /// NEAR is paid at once; each token is sent with `ft_transfer` and becomes claimable if
    /// the member is not registered on that token. Burning all of one's shares is a full exit:
    /// the account stops being a member and loses its DAO vote (see `exit_voter`). Attach about
    /// 150 Tgas or more; with too little gas the whole ragequit reverts, so it never pays out
    /// while leaving the vote in place unrecorded.
    pub fn ragequit(&mut self, crew_id: u64, shares: U128) -> U128 {
        let account_id = env::predecessor_account_id();
        let tokens = self.token_map();
        let crew = self.crew_mut(crew_id);
        require!(!crew.busy, "ERR_TRADE_IN_FLIGHT");
        let owned = *crew.shares.get(&account_id).unwrap_or(&0);
        require!(shares.0 > 0 && shares.0 <= owned, "ERR_SHARES");
        let supply = crew.supply;
        let full = shares.0 == supply;
        let near_out = if full { crew.near } else { mul_div(crew.near, shares.0, supply) };
        let mut token_out: Vec<(String, u128)> = vec![];
        for (symbol, bal) in crew.tokens.iter_mut() {
            let out = if full { *bal } else { mul_div(*bal, shares.0, supply) };
            if out > 0 { *bal -= out; token_out.push((symbol.clone(), out)); }
        }
        crew.near -= near_out;
        crew.supply -= shares.0;
        let exited = owned == shares.0;
        if exited { crew.shares.remove(&account_id); } else { crew.shares.insert(account_id.clone(), owned - shares.0); }
        if near_out > 0 { Promise::new(account_id.clone()).transfer(NearToken::from_yoctonear(near_out)).detach(); }
        for (symbol, out) in &token_out {
            self.pay_token(&tokens, &account_id, symbol, *out);
        }
        let (sym, tok) = token_out.first().cloned().map(|(s, t)| (Some(s), t)).unwrap_or((None, 0));
        self.push_receipt(crew_id, "ragequit", &account_id, None, 0, near_out, sym, 0, tok, shares.0, vec![]);
        emit("ragequit", json!({"crew_id": crew_id, "account_id": account_id, "shares": shares,
            "near_out": U128(near_out), "tokens_out": token_out.iter().map(|(s, v)| (s.clone(), U128(*v))).collect::<Vec<_>>(), "exited": exited}));
        if exited { self.exit_voter(crew_id, &account_id); }
        U128(near_out)
    }

    /// Anyone: (re)file the DAO role removal of a zero-share ex-member. Valid for an account whose
    /// removal is pending (`get_stale_voters`), or, for an exit made before the hub removed votes,
    /// for an account still listed as a member with zero shares whose ragequit receipt
    /// `ragequit_seq` proves it left (and that the DAO has not re-admitted since).
    pub fn remove_ex_member(&mut self, crew_id: u64, account_id: AccountId, ragequit_seq: Option<u64>) {
        let crew = self.crew(crew_id);
        require!(crew.shares.get(&account_id).copied().unwrap_or(0) == 0, "ERR_STILL_HOLDS_SHARES");
        if self.stale_voters(crew_id).contains(&account_id) {
            let dao = crew.dao.clone();
            self.file_removal(crew_id, dao, account_id);
            return;
        }
        require!(crew.allowed.contains(&account_id), "ERR_NOT_A_MEMBER");
        let seq = ragequit_seq.unwrap_or_else(|| env::panic_str("ERR_RAGEQUIT_RECEIPT_REQUIRED"));
        let receipt = self.receipts.get(&(crew_id, seq)).unwrap_or_else(|| env::panic_str("ERR_NO_RECEIPT"));
        require!(receipt.kind == "ragequit" && receipt.account_id == account_id, "ERR_NOT_A_RAGEQUIT");
        if let Some(admitted) = admitted_at(crew_id, &account_id) {
            require!(receipt.block.0 > admitted, "ERR_READMITTED_SINCE");
        }
        self.exit_voter(crew_id, &account_id);
    }

    #[private]
    pub fn on_removal_filed(&mut self, crew_id: u64, account_id: AccountId) -> PromiseOrValue<bool> {
        let pid = env::promise_result_checked(0, 32).ok().and_then(|b| serde_json::from_slice::<u64>(&b).ok());
        let Some(pid) = pid else {
            self.removal_failed(crew_id, &account_id, None,
                "the DAO refused the hub's RemoveMemberFromRole proposal (the hub's DAO role needs remove_member_from_role:AddProposal and :VoteApprove)");
            return PromiseOrValue::Value(false);
        };
        let dao = self.crew(crew_id).dao.clone();
        let act = json!({"id": pid, "action": "VoteApprove", "proposal": removal_kind(&account_id)});
        PromiseOrValue::Promise(Promise::new(dao.clone())
            .function_call("act_proposal", act.to_string().into_bytes(), NearToken::from_yoctonear(0), GAS_ACT_PROPOSAL)
            .then(Promise::new(dao).function_call("get_proposal", json!({"id": pid}).to_string().into_bytes(), NearToken::from_yoctonear(0), GAS_VIEW_PROPOSAL))
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_ON_REMOVAL_DONE).on_removal_done(crew_id, account_id, pid)))
    }

    /// The removal counts only if the DAO shows the hub's proposal as Approved (Sputnik applies a
    /// `RemoveMemberFromRole` in the approving call).
    #[private]
    pub fn on_removal_done(&mut self, crew_id: u64, account_id: AccountId, dao_proposal_id: u64) -> bool {
        let approved = env::promise_result_checked(0, 16_384).ok()
            .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
            .map(|p| p["status"] == "Approved")
            .unwrap_or(false);
        if !approved {
            self.removal_failed(crew_id, &account_id, Some(dao_proposal_id), "the hub's approval did not pass the removal proposal");
            return false;
        }
        let mut stale = self.stale_voters(crew_id);
        stale.retain(|a| a != &account_id);
        self.write_stale(crew_id, &stale);
        emit("member_removed", json!({"crew_id": crew_id, "account_id": account_id, "dao_proposal_id": dao_proposal_id}));
        true
    }

    /// Retry a token payout that could not be delivered (e.g. the account was not registered).
    pub fn claim_token(&mut self, symbol: String) {
        let account_id = env::predecessor_account_id();
        let key = (account_id.clone(), symbol.clone());
        let amount = self.claimable.remove(&key).unwrap_or(0);
        require!(amount > 0, "ERR_NOTHING_TO_CLAIM");
        let tokens = self.token_map();
        self.pay_token(&tokens, &account_id, &symbol, amount);
    }

    // ------------------------------------------------------------------ voted trades

    /// Any member with shares proposes a trade with its quote. The hub files a FunctionCall
    /// proposal in the crew's DAO that calls `execute_trade` if the vote passes.
    pub fn propose_trade(&mut self, crew_id: u64, side: Side, asset: String, bps: u16,
        quote_in: U128, quote_out: U128, quote_hash: String) -> Promise {
        let proposer = env::predecessor_account_id();
        let hub = env::current_account_id();
        self.require_asset(&asset);
        check_trade_args(bps, quote_in, quote_out, &quote_hash);
        let crew = self.crew_mut(crew_id);
        require!(crew.shares.get(&proposer).copied().unwrap_or(0) > 0, "ERR_NOT_MEMBER");
        let dao = crew.dao.clone();
        let id = crew.trade_count;
        crew.trade_count += 1;
        let verb = if side == Side::Buy { "buy" } else { "sell" };
        let trade = Trade {
            id, kind: TradeKind::Vote, proposer: proposer.clone(), side, asset: asset.clone(), bps, quote_in, quote_out,
            quote_hash: quote_hash.clone(), dao_proposal_id: None, status: TradeStatus::Filing,
            created_at: U64(env::block_timestamp()), executed_at: None,
            crew_in: U128(0), crew_out: U128(0), vault_in: U128(0), vault_out: U128(0),
        };
        self.trades.insert((crew_id, id), trade);
        let action_args = Base64VecU8::from(json!({"crew_id": crew_id, "trade_id": id}).to_string().into_bytes());
        let proposal = json!({"proposal": {
            "description": format!("Kumi trade #{id}: {verb} {asset} {}.{:02}% (proposed by {proposer}; quote sha256 {quote_hash})", bps / 100, bps % 100),
            "kind": { "FunctionCall": { "receiver_id": hub, "actions": [{
                "method_name": "execute_trade", "args": action_args, "deposit": "0", "gas": GAS_EXECUTE_ACTION.to_string()
            }]}}
        }});
        Promise::new(dao)
            .function_call("add_proposal", proposal.to_string().into_bytes(), NearToken::from_yoctonear(0), GAS_ADD_PROPOSAL)
            .then(Self::ext(hub).with_static_gas(GAS_ON_PROPOSAL).on_proposal_added(crew_id, id))
    }

    #[private]
    pub fn on_proposal_added(&mut self, crew_id: u64, trade_id: u64) -> Option<u64> {
        let proposal_id = env::promise_result_checked(0, 32).ok().and_then(|b| serde_json::from_slice::<u64>(&b).ok());
        let trade = self.trades.get_mut(&(crew_id, trade_id)).expect("ERR_TRADE");
        match proposal_id {
            Some(pid) => { trade.dao_proposal_id = Some(pid); trade.status = TradeStatus::Voting; }
            None => trade.status = TradeStatus::Failed,
        }
        emit("trade_proposed", json!({"crew_id": crew_id, "trade_id": trade_id, "dao_proposal_id": proposal_id}));
        proposal_id
    }

    /// Called only by the crew's DAO when the trade's proposal passes. A trade executes once:
    /// a second proposal for the same trade (a vote replay) fails here. The hub then re-reads the
    /// trade's own DAO proposal and recounts it (`on_tally`) before any NEAR moves.
    pub fn execute_trade(&mut self, crew_id: u64, trade_id: u64) -> Promise {
        let dao = self.crew(crew_id).dao.clone();
        require!(env::predecessor_account_id() == dao, "ERR_DAO_ONLY");
        let trade = self.trades.get(&(crew_id, trade_id)).expect("ERR_TRADE");
        require!(trade.status == TradeStatus::Voting, "ERR_TRADE_STATE");
        let pid = trade.dao_proposal_id.unwrap_or_else(|| env::panic_str("ERR_NO_PROPOSAL"));
        Promise::new(dao)
            .function_call("get_proposal", json!({"id": pid}).to_string().into_bytes(), NearToken::from_yoctonear(0), GAS_VIEW_PROPOSAL)
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_ON_TALLY).on_tally(crew_id, trade_id))
    }

    /// Only approvals from accounts that hold crew shares now count, and they must be a strict
    /// majority of the shareholders. A member who approved and then ragequit, or a zero-share
    /// account whose DAO role removal failed, cannot carry a trade. A refusal panics, so the DAO
    /// marks the proposal Failed and nothing moves.
    #[private]
    pub fn on_tally(&mut self, crew_id: u64, trade_id: u64) -> Promise {
        let proposal = env::promise_result_checked(0, 16_384).ok()
            .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
            .unwrap_or_else(|| env::panic_str("ERR_PROPOSAL_READ"));
        let status = self.trades.get(&(crew_id, trade_id)).expect("ERR_TRADE").status;
        require!(status == TradeStatus::Voting, "ERR_TRADE_STATE");
        let crew = self.crew(crew_id);
        let votes = proposal["votes"].as_object().cloned().unwrap_or_default();
        let holders = crew.shares.values().filter(|s| **s > 0).count();
        let approvals = crew.shares.iter()
            .filter(|(a, s)| **s > 0 && votes.get(a.as_str()).and_then(|v| v.as_str()) == Some("Approve"))
            .count();
        if approvals * 2 <= holders {
            env::panic_str(&format!("ERR_STALE_VOTES: {approvals} of {holders} shareholders approved; a strict majority is needed"));
        }
        self.start_swap(crew_id, trade_id)
    }

    // ------------------------------------------------------------------ captain lane

    /// DAO-only: install the captain's function-call key on this account (it may call only
    /// `captain_trade`) and set the crew's limits. Replaces and deletes any previous key.
    pub fn set_captain(&mut self, crew_id: u64, captain: Captain) -> Promise {
        let hub = env::current_account_id();
        require!(captain.max_bps > 0 && captain.max_bps <= 10_000, "ERR_BPS");
        require!(captain.max_daily > 0 && captain.max_daily <= 50, "ERR_DAILY");
        require!(!captain.assets.is_empty(), "ERR_ASSETS");
        for a in &captain.assets { self.require_asset(a); }
        require!(self.captain_keys.get(&captain.public_key).is_none(), "ERR_KEY_IN_USE");
        let crew = self.crew_mut(crew_id);
        require!(env::predecessor_account_id() == crew.dao, "ERR_DAO_ONLY");
        require!(crew.allowed.contains(&captain.account_id), "ERR_CAPTAIN_NOT_MEMBER");
        let old = crew.captain.replace(captain.clone()).map(|c| c.public_key);
        crew.captain_count = 0;
        crew.captain_day = env::block_timestamp() / DAY_NS;
        let mut promise = Promise::new(hub.clone());
        if let Some(old_key) = old {
            self.captain_keys.remove(&old_key);
            promise = promise.delete_key(old_key);
        }
        self.captain_keys.insert(captain.public_key.clone(), crew_id);
        emit("captain_set", json!({"crew_id": crew_id, "captain": captain.account_id, "max_bps": captain.max_bps,
            "max_daily": captain.max_daily, "assets": captain.assets}));
        promise.add_access_key_allowance(captain.public_key, Allowance::limited(CAPTAIN_GAS_ALLOWANCE).unwrap(), hub, "captain_trade")
    }

    /// DAO-only: remove the captain and delete the key.
    pub fn revoke_captain(&mut self, crew_id: u64) -> Promise {
        require!(env::predecessor_account_id() == self.crew(crew_id).dao, "ERR_DAO_ONLY");
        let key = self.drop_captain(crew_id).unwrap_or_else(|| env::panic_str("ERR_NO_CAPTAIN"));
        emit("captain_revoked", json!({"crew_id": crew_id}));
        Promise::new(env::current_account_id()).delete_key(key)
    }

    /// Signed with the captain's function-call key on this account. Executes at once, within
    /// the crew's limits. The key cannot call anything else, so it cannot withdraw.
    pub fn captain_trade(&mut self, crew_id: u64, side: Side, asset: String, bps: u16,
        quote_in: U128, quote_out: U128, quote_hash: String) -> Promise {
        require!(env::predecessor_account_id() == env::current_account_id(), "ERR_CAPTAIN_KEY_ONLY");
        let signer = env::signer_account_pk();
        require!(self.captain_keys.get(&signer) == Some(&crew_id), "ERR_NOT_CAPTAIN");
        self.require_asset(&asset);
        check_trade_args(bps, quote_in, quote_out, &quote_hash);
        let crew = self.crew_mut(crew_id);
        let captain = crew.captain.clone().expect("ERR_NO_CAPTAIN");
        require!(captain.public_key == signer, "ERR_NOT_CAPTAIN");
        require!(captain.assets.contains(&asset), "ERR_ASSET_NOT_ALLOWED");
        require!(bps <= captain.max_bps, "ERR_CAPTAIN_LIMIT");
        let day = env::block_timestamp() / DAY_NS;
        if day != crew.captain_day { crew.captain_day = day; crew.captain_count = 0; }
        require!(crew.captain_count < captain.max_daily, "ERR_DAILY_LIMIT");
        crew.captain_count += 1;
        let id = crew.trade_count;
        crew.trade_count += 1;
        self.trades.insert((crew_id, id), Trade {
            id, kind: TradeKind::Captain, proposer: captain.account_id, side, asset, bps, quote_in, quote_out, quote_hash,
            dao_proposal_id: None, status: TradeStatus::Voting, created_at: U64(env::block_timestamp()), executed_at: None,
            crew_in: U128(0), crew_out: U128(0), vault_in: U128(0), vault_out: U128(0),
        });
        self.start_swap(crew_id, id)
    }

    // ------------------------------------------------------------------ follower vault

    /// Anyone can follow a crew: the deposit buys vault shares at the vault's NAV, after the
    /// performance fee is crystallized.
    #[payable]
    pub fn follow(&mut self, crew_id: u64) -> Promise {
        let account_id = env::predecessor_account_id();
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount >= MIN_DEPOSIT, "ERR_MIN_DEPOSIT");
        let crew = self.crew(crew_id);
        require!(!crew.busy, "ERR_TRADE_IN_FLIGHT");
        let held = self.symbols_held(&crew.vault.tokens);
        self.with_marks(crew_id, held, MarkAction::Follow { account_id, amount: U128(amount) })
    }

    /// Exit the vault at any time: the fee is crystallized first, then the exact pro-rata slice
    /// of the vault's NEAR and tokens is paid out.
    pub fn unfollow(&mut self, crew_id: u64, shares: U128) -> Promise {
        let account_id = env::predecessor_account_id();
        let crew = self.crew(crew_id);
        require!(!crew.busy, "ERR_TRADE_IN_FLIGHT");
        let owned = crew.vault.shares.get(&account_id).copied().unwrap_or(0);
        require!(shares.0 > 0 && shares.0 <= owned, "ERR_SHARES");
        let held = self.symbols_held(&crew.vault.tokens);
        self.with_marks(crew_id, held, MarkAction::Unfollow { account_id, shares })
    }

    /// Anyone can crystallize the performance fee above the high-water mark.
    pub fn crystallize_fee(&mut self, crew_id: u64) -> Promise {
        let crew = self.crew(crew_id);
        require!(!crew.busy, "ERR_TRADE_IN_FLIGHT");
        let held = self.symbols_held(&crew.vault.tokens);
        self.with_marks(crew_id, held, MarkAction::Fee)
    }

    #[private]
    pub fn on_marks(&mut self, crew_id: u64, symbols: Vec<String>, action: MarkAction) -> U128 {
        let mut marks = vec![];
        let mut ok = true;
        for (i, symbol) in symbols.iter().enumerate() {
            match env::promise_result_checked(i as u64, 256).ok().and_then(|b| serde_json::from_slice::<Reserves>(&b).ok()) {
                Some(r) if r.near.0 > 0 && r.token.0 > 0 => marks.push(Mark { symbol: symbol.clone(), near_reserve: r.near, token_reserve: r.token }),
                _ => ok = false,
            }
        }
        let busy = self.crew(crew_id).busy;
        match action {
            MarkAction::Join { account_id, amount } => {
                if !ok || busy { refund(&account_id, amount.0, if busy { "ERR_TRADE_IN_FLIGHT" } else { "ERR_MARKS" }); return U128(0); }
                U128(self.finish_join(crew_id, account_id, amount.0, &marks))
            }
            MarkAction::Follow { account_id, amount } => {
                if !ok || busy { refund(&account_id, amount.0, if busy { "ERR_TRADE_IN_FLIGHT" } else { "ERR_MARKS" }); return U128(0); }
                self.crystallize(crew_id, &marks);
                U128(self.finish_follow(crew_id, account_id, amount.0, &marks))
            }
            MarkAction::Unfollow { account_id, shares } => {
                require!(ok && !busy, "ERR_MARKS_OR_BUSY");
                self.crystallize(crew_id, &marks);
                U128(self.finish_unfollow(crew_id, account_id, shares.0, &marks))
            }
            MarkAction::Fee => {
                require!(ok && !busy, "ERR_MARKS_OR_BUSY");
                U128(self.crystallize(crew_id, &marks))
            }
        }
    }

    // ------------------------------------------------------------------ swap settlement

    #[private]
    pub fn on_swap(&mut self, crew_id: u64, trade_id: u64, crew_in: U128, vault_in: U128) -> bool {
        let out = env::promise_result_checked(0, 64).ok().and_then(|b| serde_json::from_slice::<U128>(&b).ok()).map(|v| v.0);
        let mut trade = self.trades.get(&(crew_id, trade_id)).cloned().expect("ERR_TRADE");
        let asset = trade.asset.clone();
        let crew = self.crew_mut(crew_id);
        crew.busy = false;
        let total = crew_in.0 + vault_in.0;
        let ok = match out {
            Some(out) if out > 0 => {
                let crew_out = mul_div(out, crew_in.0, total);
                let vault_out = out - crew_out;
                match trade.side {
                    Side::Buy => {
                        *crew.tokens.entry(asset.clone()).or_insert(0) += crew_out;
                        *crew.vault.tokens.entry(asset.clone()).or_insert(0) += vault_out;
                    }
                    Side::Sell => { crew.near += crew_out; crew.vault.near += vault_out; }
                }
                trade.status = TradeStatus::Executed;
                trade.crew_in = crew_in; trade.vault_in = vault_in;
                trade.crew_out = U128(crew_out); trade.vault_out = U128(vault_out);
                trade.executed_at = Some(U64(env::block_timestamp()));
                true
            }
            _ => {
                // Slippage bound hit or pool failure: the pool refunded, so restore the holdings.
                match trade.side {
                    Side::Buy => { crew.near += crew_in.0; crew.vault.near += vault_in.0; }
                    Side::Sell => {
                        *crew.tokens.entry(asset.clone()).or_insert(0) += crew_in.0;
                        *crew.vault.tokens.entry(asset.clone()).or_insert(0) += vault_in.0;
                    }
                }
                trade.status = TradeStatus::Failed;
                false
            }
        };
        let kind = if trade.kind == TradeKind::Captain { "captain_trade" } else { "trade" };
        let proposer = trade.proposer.clone();
        let (near_in, near_out, token_in, token_out) = match (ok, trade.side) {
            (true, Side::Buy) => (0, crew_in.0, trade.crew_out.0, 0),
            (true, Side::Sell) => (trade.crew_out.0, 0, 0, crew_in.0),
            _ => (0, 0, 0, 0),
        };
        self.trades.insert((crew_id, trade_id), trade);
        if ok {
            self.push_receipt(crew_id, kind, &proposer, Some(trade_id), near_in, near_out, Some(asset), token_in, token_out, 0, vec![]);
        }
        emit(if ok { "trade_executed" } else { "trade_failed" }, json!({"crew_id": crew_id, "trade_id": trade_id}));
        ok
    }

    #[private]
    pub fn on_token_payout(&mut self, account_id: AccountId, symbol: String, amount: U128) -> bool {
        if env::promise_result_checked(0, 16).is_ok() { return true; }
        let key = (account_id, symbol);
        let prev = self.claimable.get(&key).copied().unwrap_or(0);
        self.claimable.insert(key, prev + amount.0);
        false
    }

    // ------------------------------------------------------------------ views

    pub fn get_config(&self) -> serde_json::Value {
        json!({"owner": self.owner, "factory": self.factory, "dao_deposit": U128(self.dao_deposit), "crew_count": self.crew_count})
    }
    pub fn get_assets(&self) -> Vec<Asset> { self.assets.clone() }
    pub fn get_crew(&self, crew_id: u64) -> Option<CrewView> { self.crews.get(&crew_id).map(|c| view_of(crew_id, c)) }
    pub fn list_crews(&self, from: Option<u64>, limit: Option<u64>) -> Vec<CrewView> {
        let from = from.unwrap_or(0);
        let end = (from + limit.unwrap_or(20).min(50)).min(self.crew_count);
        (from..end).filter_map(|id| self.get_crew(id)).collect()
    }
    pub fn get_trade(&self, crew_id: u64, trade_id: u64) -> Option<Trade> { self.trades.get(&(crew_id, trade_id)).cloned() }
    pub fn get_trades(&self, crew_id: u64, from: Option<u64>, limit: Option<u64>) -> Vec<Trade> {
        let count = self.crews.get(&crew_id).map(|c| c.trade_count).unwrap_or(0);
        let from = from.unwrap_or(0);
        let end = (from + limit.unwrap_or(50).min(100)).min(count);
        (from..end).filter_map(|i| self.trades.get(&(crew_id, i)).cloned()).collect()
    }
    pub fn get_receipts(&self, crew_id: u64, from: Option<u64>, limit: Option<u64>) -> Vec<Receipt> {
        let count = self.crews.get(&crew_id).map(|c| c.receipt_count).unwrap_or(0);
        let from = from.unwrap_or(0);
        let end = (from + limit.unwrap_or(50).min(100)).min(count);
        (from..end).filter_map(|i| self.receipts.get(&(crew_id, i)).cloned()).collect()
    }
    pub fn get_claimable(&self, account_id: AccountId, symbol: String) -> U128 {
        U128(self.claimable.get(&(account_id, symbol)).copied().unwrap_or(0))
    }
    /// Ex-members who left with zero shares but whose DAO vote removal has not succeeded yet.
    /// Their votes never count toward a trade (see `on_tally`); `remove_ex_member` retries.
    pub fn get_stale_voters(&self, crew_id: u64) -> Vec<AccountId> { self.stale_voters(crew_id) }

    // NEP-245 multi-token views. Token ids: `crew:<id>` (member shares) and `vault:<id>`
    // (follower shares). Shares are non-transferable: they leave only by ragequit or unfollow.
    pub fn mt_balance_of(&self, account_id: AccountId, token_id: String) -> U128 {
        let (vault, id) = parse_token_id(&token_id);
        let crew = self.crew(id);
        let book = if vault { &crew.vault.shares } else { &crew.shares };
        U128(book.get(&account_id).copied().unwrap_or(0))
    }
    pub fn mt_batch_balance_of(&self, account_id: AccountId, token_ids: Vec<String>) -> Vec<U128> {
        token_ids.into_iter().map(|t| self.mt_balance_of(account_id.clone(), t)).collect()
    }
    pub fn mt_supply(&self, token_id: String) -> Option<U128> {
        let (vault, id) = parse_token_id(&token_id);
        self.crews.get(&id).map(|c| U128(if vault { c.vault.supply } else { c.supply }))
    }
    pub fn mt_batch_supply(&self, token_ids: Vec<String>) -> Vec<Option<U128>> {
        token_ids.into_iter().map(|t| self.mt_supply(t)).collect()
    }
    #[payable]
    pub fn mt_transfer(&mut self, receiver_id: AccountId, token_id: String, amount: U128, approval: Option<(AccountId, u64)>, memo: Option<String>) {
        let _ = (receiver_id, token_id, amount, approval, memo);
        env::panic_str("ERR_NON_TRANSFERABLE: crew and vault shares leave only by ragequit or unfollow");
    }
}

// ---------------------------------------------------------------------- internals

impl Kumi {
    fn crew(&self, id: u64) -> &Crew { self.crews.get(&id).expect("ERR_NO_CREW") }
    fn crew_mut(&mut self, id: u64) -> &mut Crew { self.crews.get_mut(&id).expect("ERR_NO_CREW") }
    fn token_map(&self) -> BTreeMap<String, AccountId> { self.assets.iter().map(|a| (a.symbol.clone(), a.token.clone())).collect() }
    fn require_asset(&self, symbol: &str) { require!(self.assets.iter().any(|a| a.symbol == symbol), "ERR_UNKNOWN_ASSET"); }
    fn symbols_held(&self, tokens: &BTreeMap<String, u128>) -> Vec<String> {
        tokens.iter().filter(|(_, v)| **v > 0).map(|(k, _)| k.clone()).collect()
    }

    fn stale_voters(&self, crew_id: u64) -> Vec<AccountId> {
        env::storage_read(&stale_key(crew_id))
            .map(|b| near_sdk::borsh::from_slice(&b).unwrap_or_else(|_| env::panic_str("ERR_STALE_STATE")))
            .unwrap_or_default()
    }
    fn write_stale(&mut self, crew_id: u64, list: &[AccountId]) {
        if list.is_empty() { env::storage_remove(&stale_key(crew_id)); }
        else { env::storage_write(&stale_key(crew_id), &near_sdk::borsh::to_vec(list).unwrap()); }
    }

    /// Removes the captain (if any) and its key from the index; returns the key to delete.
    fn drop_captain(&mut self, crew_id: u64) -> Option<PublicKey> {
        let old = self.crew_mut(crew_id).captain.take()?;
        self.captain_keys.remove(&old.public_key);
        Some(old.public_key)
    }

    /// A member with zero shares stops being a voter: off the member list, captain key deleted if
    /// it is theirs, recorded as a stale voter until the DAO confirms the role removal.
    fn exit_voter(&mut self, crew_id: u64, account_id: &AccountId) {
        let crew = self.crew_mut(crew_id);
        crew.allowed.retain(|a| a != account_id);
        let dao = crew.dao.clone();
        let is_captain = crew.captain.as_ref().is_some_and(|c| &c.account_id == account_id);
        if is_captain {
            let key = self.drop_captain(crew_id).unwrap();
            emit("captain_revoked", json!({"crew_id": crew_id, "reason": "the captain ragequit"}));
            Promise::new(env::current_account_id()).delete_key(key).detach();
        }
        let mut stale = self.stale_voters(crew_id);
        if !stale.contains(account_id) { stale.push(account_id.clone()); self.write_stale(crew_id, &stale); }
        self.file_removal(crew_id, dao, account_id.clone());
    }

    /// Files a `RemoveMemberFromRole` proposal in the crew's DAO; `on_removal_filed` approves it
    /// with the hub's own vote (the hub's role has weight 1 of 1 for this proposal kind only).
    fn file_removal(&self, crew_id: u64, dao: AccountId, account_id: AccountId) {
        let proposal = json!({"proposal": {
            "description": format!("Kumi: {account_id} ragequit and holds zero shares; the hub removes their crew vote"),
            "kind": removal_kind(&account_id),
        }});
        Promise::new(dao)
            .function_call("add_proposal", proposal.to_string().into_bytes(), NearToken::from_yoctonear(0), GAS_ADD_PROPOSAL)
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_ON_REMOVAL_FILED).on_removal_filed(crew_id, account_id))
            .detach();
    }

    fn removal_failed(&mut self, crew_id: u64, account_id: &AccountId, dao_proposal_id: Option<u64>, reason: &str) {
        let mut stale = self.stale_voters(crew_id);
        if !stale.contains(account_id) { stale.push(account_id.clone()); self.write_stale(crew_id, &stale); }
        env::log_str(&format!("{account_id} still has a vote in crew {crew_id}'s DAO: {reason}. Their votes do not count toward trades; retry with remove_ex_member."));
        emit("member_removal_failed", json!({"crew_id": crew_id, "account_id": account_id, "dao_proposal_id": dao_proposal_id,
            "reason": reason, "retry": "remove_ex_member"}));
    }

    /// Reads `get_reserves` from every pool in `symbols` (joined promises), then `on_marks`.
    fn with_marks(&self, crew_id: u64, symbols: Vec<String>, action: MarkAction) -> Promise {
        let tokens = self.token_map();
        let hub = env::current_account_id();
        let callback = Self::ext(hub.clone()).with_static_gas(GAS_ON_MARKS);
        let mut joined: Option<Promise> = None;
        for s in &symbols {
            let p = Promise::new(tokens[s].clone()).function_call("get_reserves", b"{}".to_vec(), NearToken::from_yoctonear(0), GAS_VIEW_RESERVES);
            joined = Some(match joined { None => p, Some(j) => j.and(p) });
        }
        match joined {
            Some(j) => j.then(callback.on_marks(crew_id, symbols, action)),
            // Nothing held: no reads needed. A self-call keeps one code path.
            None => callback.on_marks(crew_id, symbols, action),
        }
    }

    fn finish_join(&mut self, crew_id: u64, account_id: AccountId, amount: u128, marks: &[Mark]) -> u128 {
        let crew = self.crew_mut(crew_id);
        let nav = crew.near + value_of(&crew.tokens, marks);
        let minted = if crew.supply == 0 || nav == 0 { amount } else { mul_div(amount, crew.supply, nav) };
        require!(minted > 0, "ERR_DUST_DEPOSIT");
        *crew.shares.entry(account_id.clone()).or_insert(0) += minted;
        crew.supply += minted;
        crew.near += amount;
        crew.deposited += amount;
        self.push_receipt(crew_id, "join", &account_id, None, amount, 0, None, 0, 0, minted, marks.to_vec());
        emit("join", json!({"crew_id": crew_id, "account_id": account_id, "amount": U128(amount), "shares": U128(minted)}));
        minted
    }

    fn finish_follow(&mut self, crew_id: u64, account_id: AccountId, amount: u128, marks: &[Mark]) -> u128 {
        let crew = self.crew_mut(crew_id);
        let v = &mut crew.vault;
        let nav = v.near + value_of(&v.tokens, marks);
        let minted = if v.supply == 0 || nav == 0 { amount } else { mul_div(amount, v.supply, nav) };
        require!(minted > 0, "ERR_DUST_DEPOSIT");
        if v.supply == 0 { v.hwm = PPS_ONE; }
        *v.shares.entry(account_id.clone()).or_insert(0) += minted;
        v.supply += minted;
        v.near += amount;
        self.push_receipt(crew_id, "follow", &account_id, None, 0, 0, None, 0, 0, minted, marks.to_vec());
        emit("follow", json!({"crew_id": crew_id, "account_id": account_id, "amount": U128(amount), "shares": U128(minted)}));
        minted
    }

    fn finish_unfollow(&mut self, crew_id: u64, account_id: AccountId, shares: u128, marks: &[Mark]) -> u128 {
        let tokens = self.token_map();
        let crew = self.crew_mut(crew_id);
        let v = &mut crew.vault;
        let owned = v.shares.get(&account_id).copied().unwrap_or(0);
        require!(shares > 0 && shares <= owned, "ERR_SHARES");
        let full = shares == v.supply;
        let near_out = if full { v.near } else { mul_div(v.near, shares, v.supply) };
        let mut token_out = vec![];
        for (symbol, bal) in v.tokens.iter_mut() {
            let out = if full { *bal } else { mul_div(*bal, shares, v.supply) };
            if out > 0 { *bal -= out; token_out.push((symbol.clone(), out)); }
        }
        v.near -= near_out;
        v.supply -= shares;
        if owned == shares { v.shares.remove(&account_id); } else { v.shares.insert(account_id.clone(), owned - shares); }
        if near_out > 0 { Promise::new(account_id.clone()).transfer(NearToken::from_yoctonear(near_out)).detach(); }
        for (symbol, out) in &token_out { self.pay_token(&tokens, &account_id, symbol, *out); }
        self.push_receipt(crew_id, "unfollow", &account_id, None, 0, 0, None, 0, 0, shares, marks.to_vec());
        emit("unfollow", json!({"crew_id": crew_id, "account_id": account_id, "shares": U128(shares), "near_out": U128(near_out)}));
        near_out
    }

    /// Performance fee above the high-water mark, paid in kind from the vault to the crew.
    /// Returns the fee value in yoctoNEAR.
    fn crystallize(&mut self, crew_id: u64, marks: &[Mark]) -> u128 {
        let crew = self.crew_mut(crew_id);
        if crew.vault.supply == 0 || crew.vault.fee_bps == 0 { return 0; }
        let nav = crew.vault.near + value_of(&crew.vault.tokens, marks);
        let pps = mul_div(nav, PPS_ONE, crew.vault.supply);
        if pps <= crew.vault.hwm { return 0; }
        let gain = mul_div(pps - crew.vault.hwm, crew.vault.supply, PPS_ONE);
        let fee = mul_div(gain, crew.vault.fee_bps as u128, 10_000);
        if fee == 0 || nav == 0 { return 0; }
        let near_fee = mul_div(crew.vault.near, fee, nav);
        crew.vault.near -= near_fee;
        crew.near += near_fee;
        let mut moved = vec![];
        for (symbol, bal) in crew.vault.tokens.iter_mut() {
            let t = mul_div(*bal, fee, nav);
            if t > 0 { *bal -= t; moved.push((symbol.clone(), t)); }
        }
        for (symbol, t) in &moved { *crew.tokens.entry(symbol.clone()).or_insert(0) += t; }
        // Rounded up, so the floor-rounded price never re-crosses its own mark by dust.
        // In-kind transfers round down, so also take the re-marked post-fee price.
        let left = crew.vault.near + value_of(&crew.vault.tokens, marks);
        crew.vault.hwm = mul_div_ceil(nav - fee, PPS_ONE, crew.vault.supply).max(mul_div(left, PPS_ONE, crew.vault.supply));
        crew.vault.fees_paid += fee;
        let hwm = crew.vault.hwm;
        let hub = env::current_account_id();
        self.push_receipt(crew_id, "fee", &hub, None, near_fee, 0, None, 0, 0, 0, marks.to_vec());
        emit("fee", json!({"crew_id": crew_id, "fee": U128(fee), "hwm": U128(hwm)}));
        fee
    }

    /// Debits the crew and the vault by `bps` of the input side and sends one combined swap, so
    /// followers fill in the same swap at the same price. The quote bounds the minimum out.
    fn start_swap(&mut self, crew_id: u64, trade_id: u64) -> Promise {
        let trade = self.trades.get(&(crew_id, trade_id)).cloned().expect("ERR_TRADE");
        let token = self.token_map()[&trade.asset].clone();
        let crew = self.crew_mut(crew_id);
        require!(!crew.busy, "ERR_TRADE_IN_FLIGHT");
        let bps = trade.bps as u128;
        let (crew_in, vault_in) = match trade.side {
            Side::Buy => (mul_div(crew.near, bps, 10_000), mul_div(crew.vault.near, bps, 10_000)),
            Side::Sell => (
                mul_div(crew.tokens.get(&trade.asset).copied().unwrap_or(0), bps, 10_000),
                mul_div(crew.vault.tokens.get(&trade.asset).copied().unwrap_or(0), bps, 10_000),
            ),
        };
        let total = crew_in + vault_in;
        require!(total > 0, "ERR_NOTHING_TO_TRADE");
        let min_out = mul_div(mul_div(total, trade.quote_out.0, trade.quote_in.0), 10_000 - crew.slippage_bps as u128, 10_000);
        match trade.side {
            Side::Buy => { crew.near -= crew_in; crew.vault.near -= vault_in; }
            Side::Sell => {
                *crew.tokens.get_mut(&trade.asset).unwrap() -= crew_in;
                if vault_in > 0 { *crew.vault.tokens.get_mut(&trade.asset).unwrap() -= vault_in; }
            }
        }
        crew.busy = true;
        let t = self.trades.get_mut(&(crew_id, trade_id)).unwrap();
        t.status = TradeStatus::Executing;
        let swap = match trade.side {
            Side::Buy => Promise::new(token).function_call("buy", json!({"min_out": U128(min_out)}).to_string().into_bytes(),
                NearToken::from_yoctonear(total), GAS_SWAP),
            Side::Sell => Promise::new(token).function_call("sell", json!({"amount": U128(total), "min_out": U128(min_out)}).to_string().into_bytes(),
                NearToken::from_yoctonear(1), GAS_SWAP),
        };
        swap.then(Self::ext(env::current_account_id()).with_static_gas(GAS_ON_SWAP).on_swap(crew_id, trade_id, U128(crew_in), U128(vault_in)))
    }

    fn pay_token(&mut self, tokens: &BTreeMap<String, AccountId>, account_id: &AccountId, symbol: &str, amount: u128) {
        Promise::new(tokens[symbol].clone())
            .function_call("ft_transfer", json!({"receiver_id": account_id, "amount": U128(amount), "memo": "kumi payout"}).to_string().into_bytes(),
                NearToken::from_yoctonear(1), GAS_FT_TRANSFER)
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_ON_PAYOUT).on_token_payout(account_id.clone(), symbol.to_string(), U128(amount)))
            .detach();
    }

    #[allow(clippy::too_many_arguments)]
    fn push_receipt(&mut self, crew_id: u64, kind: &str, account_id: &AccountId, trade_id: Option<u64>, near_in: u128, near_out: u128,
        asset: Option<String>, token_in: u128, token_out: u128, shares: u128, marks: Vec<Mark>) {
        let crew = self.crew_mut(crew_id);
        let seq = crew.receipt_count;
        crew.receipt_count += 1;
        let pairs = |m: &BTreeMap<String, u128>| m.iter().map(|(k, v)| (k.clone(), U128(*v))).collect::<Vec<_>>();
        let receipt = Receipt {
            seq, kind: kind.to_string(), account_id: account_id.clone(), at: U64(env::block_timestamp()), block: U64(env::block_height()),
            trade_id, near_in: U128(near_in), near_out: U128(near_out), asset, token_in: U128(token_in), token_out: U128(token_out),
            shares: U128(shares), marks,
            crew_near: U128(crew.near), crew_tokens: pairs(&crew.tokens), crew_supply: U128(crew.supply),
            vault_near: U128(crew.vault.near), vault_tokens: pairs(&crew.vault.tokens), vault_supply: U128(crew.vault.supply),
        };
        self.receipts.insert((crew_id, seq), receipt);
    }
}

fn view_of(id: u64, c: &Crew) -> CrewView {
    let pairs = |m: &BTreeMap<String, u128>| m.iter().map(|(k, v)| (k.clone(), U128(*v))).collect::<Vec<_>>();
    let today = env::block_timestamp() / DAY_NS;
    CrewView {
        id, name: c.name.clone(), dao: c.dao.clone(), creator: c.creator.clone(), created_at: U64(c.created_at),
        allowed: c.allowed.clone(), members: c.shares.iter().map(|(k, v)| (k.clone(), U128(*v))).collect(),
        supply: U128(c.supply), near: U128(c.near), tokens: pairs(&c.tokens), deposited: U128(c.deposited),
        slippage_bps: c.slippage_bps, captain: c.captain.clone(),
        captain_trades_today: if c.captain_day == today { c.captain_count } else { 0 },
        vault_supply: U128(c.vault.supply), vault_near: U128(c.vault.near), vault_tokens: pairs(&c.vault.tokens),
        vault_fee_bps: c.vault.fee_bps, vault_hwm: U128(c.vault.hwm), vault_fees_paid: U128(c.vault.fees_paid),
        followers: c.vault.shares.iter().map(|(k, v)| (k.clone(), U128(*v))).collect(),
        busy: c.busy, trade_count: c.trade_count, receipt_count: c.receipt_count,
    }
}

/// The hub's permissions in every crew DAO it creates: file trade proposals (FunctionCall to the
/// hub), and file and approve the removal of a member who has ragequit. Nothing else.
const HUB_PERMISSIONS: [&str; 3] = ["call:AddProposal", "remove_member_from_role:AddProposal", "remove_member_from_role:VoteApprove"];

fn removal_kind(account_id: &AccountId) -> serde_json::Value {
    json!({"RemoveMemberFromRole": {"member_id": account_id, "role": CREW_ROLE}})
}

fn stale_key(crew_id: u64) -> Vec<u8> { [STALE_PREFIX, &crew_id.to_le_bytes()].concat() }

fn admit_key(crew_id: u64, account_id: &AccountId) -> Vec<u8> {
    [ADMIT_PREFIX, &crew_id.to_le_bytes(), account_id.as_bytes()].concat()
}

fn admitted_at(crew_id: u64, account_id: &AccountId) -> Option<u64> {
    env::storage_read(&admit_key(crew_id, account_id)).map(|b| u64::from_le_bytes(b.try_into().unwrap_or_else(|_| env::panic_str("ERR_ADMIT_STATE"))))
}

fn check_trade_args(bps: u16, quote_in: U128, quote_out: U128, quote_hash: &str) {
    require!(bps > 0 && bps <= 10_000, "ERR_BPS");
    require!(quote_in.0 > 0 && quote_out.0 > 0, "ERR_QUOTE");
    require!(quote_hash.len() == 64 && quote_hash.bytes().all(|b| b.is_ascii_hexdigit()), "ERR_QUOTE_HASH");
}

fn parse_token_id(token_id: &str) -> (bool, u64) {
    let (kind, id) = token_id.split_once(':').unwrap_or_else(|| env::panic_str("ERR_TOKEN_ID"));
    let id: u64 = id.parse().unwrap_or_else(|_| env::panic_str("ERR_TOKEN_ID"));
    match kind { "crew" => (false, id), "vault" => (true, id), _ => env::panic_str("ERR_TOKEN_ID") }
}

/// Value of token holdings in yoctoNEAR at pool marks: amount * near_reserve / token_reserve.
pub fn value_of(tokens: &BTreeMap<String, u128>, marks: &[Mark]) -> u128 {
    tokens.iter().filter(|(_, v)| **v > 0).map(|(symbol, amount)| {
        let m = marks.iter().find(|m| &m.symbol == symbol).unwrap_or_else(|| env::panic_str("ERR_MISSING_MARK"));
        mul_div(*amount, m.near_reserve.0, m.token_reserve.0)
    }).sum()
}

fn refund(account: &AccountId, amount: u128, reason: &str) {
    env::log_str(&format!("refund {amount} to {account}: {reason}"));
    Promise::new(account.clone()).transfer(NearToken::from_yoctonear(amount)).detach();
}

fn emit(event: &str, data: serde_json::Value) {
    env::log_str(&format!("EVENT_JSON:{}", json!({"standard": "kumi", "version": "1.0.0", "event": event, "data": [data]})));
}

pub fn mul_div_ceil(a: u128, b: u128, d: u128) -> u128 {
    require!(d > 0, "ERR_DIV_ZERO");
    let n = (U256::from(a) * U256::from(b) + U256::from(d) - U256::one()) / U256::from(d);
    require!(n <= U256::from(u128::MAX), "ERR_OVERFLOW");
    n.as_u128()
}

pub fn mul_div(a: u128, b: u128, d: u128) -> u128 {
    require!(d > 0, "ERR_DIV_ZERO");
    let n = U256::from(a) * U256::from(b) / U256::from(d);
    require!(n <= U256::from(u128::MAX), "ERR_OVERFLOW");
    n.as_u128()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn mul_div_is_exact_floor_without_overflow() {
        assert_eq!(mul_div(u128::MAX, 2, 4), u128::MAX / 2);
        assert_eq!(mul_div(10, 1, 3), 3);
    }
    #[test]
    fn value_uses_pool_ratio() {
        let mut t = BTreeMap::new();
        t.insert("SOL".to_string(), 50u128);
        let marks = vec![Mark { symbol: "SOL".into(), near_reserve: U128(1_000), token_reserve: U128(100) }];
        assert_eq!(value_of(&t, &marks), 500);
    }
}
