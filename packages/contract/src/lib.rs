use near_sdk::json_types::U128;
use near_sdk::{env, near, require, AccountId, NearToken, PanicOnDefault, Promise, PublicKey};
use primitive_types::U256;
use std::collections::{BTreeMap, BTreeSet};

const DAY_NS: u64 = 86_400_000_000_000;

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Trade {
    pub id: u64,
    pub proposer: AccountId,
    pub asset: String,
    pub amount: U128,
    pub quote_hash: String,
    pub dao_proposal_id: Option<u64>,
    pub status: String,
    pub transfer_tx: Option<String>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct CaptainPolicy {
    pub public_key: PublicKey,
    pub max_bps: u16,
    pub max_daily: u16,
    pub assets: Vec<String>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Kumi {
    dao: AccountId,
    balances: BTreeMap<AccountId, u128>,
    supply: u128,
    nav: u128,
    trades: Vec<Trade>,
    used_proposals: BTreeSet<u64>,
    captain: Option<CaptainPolicy>,
    captain_day: u64,
    captain_count: u16,
}

#[near]
impl Kumi {
    #[init]
    pub fn new(dao: AccountId) -> Self {
        require!(!env::state_exists(), "ERR_INITIALIZED");
        Self { dao, balances: BTreeMap::new(), supply: 0, nav: 0, trades: vec![],
            used_proposals: BTreeSet::new(), captain: None, captain_day: 0, captain_count: 0 }
    }

    #[payable]
    pub fn join(&mut self) -> U128 {
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, "ERR_ZERO_DEPOSIT");
        let minted = if self.supply == 0 { amount } else {
            require!(self.nav > 0, "ERR_ZERO_NAV");
            mul_div(amount, self.supply, self.nav)
        };
        require!(minted > 0, "ERR_DUST_DEPOSIT");
        let owner = env::predecessor_account_id();
        let next = self.balance(&owner).checked_add(minted).expect("ERR_OVERFLOW");
        self.balances.insert(owner, next);
        self.supply = self.supply.checked_add(minted).expect("ERR_OVERFLOW");
        self.nav = self.nav.checked_add(amount).expect("ERR_OVERFLOW");
        U128(minted)
    }

    pub fn ragequit(&mut self, shares: U128) -> Promise {
        let owner = env::predecessor_account_id();
        let old = self.balance(&owner);
        require!(shares.0 > 0 && shares.0 <= old, "ERR_SHARES");
        require!(self.supply > 0, "ERR_EMPTY");
        let payout = if shares.0 == self.supply { self.nav } else { mul_div(shares.0, self.nav, self.supply) };
        require!(payout > 0, "ERR_DUST_REDEMPTION");
        self.balances.insert(owner.clone(), old - shares.0);
        self.supply -= shares.0;
        self.nav -= payout;
        Promise::new(owner).transfer(NearToken::from_yoctonear(payout))
    }

    pub fn propose_trade(&mut self, asset: String, amount: U128, quote_hash: String) -> u64 {
        let proposer = env::predecessor_account_id();
        require!(self.balance(&proposer) > 0, "ERR_NOT_MEMBER");
        require!(!asset.trim().is_empty() && asset.len() <= 80, "ERR_ASSET");
        require!(amount.0 > 0 && amount.0 <= self.nav, "ERR_AMOUNT");
        require!(quote_hash.len() == 64 && quote_hash.bytes().all(|b| b.is_ascii_hexdigit()), "ERR_QUOTE_HASH");
        let id = self.trades.len() as u64;
        self.trades.push(Trade { id, proposer, asset, amount, quote_hash,
            dao_proposal_id: None, status: "proposed".into(), transfer_tx: None });
        id
    }

    /// The Sputnik DAO's approved FunctionCall proposal invokes this method.
    /// It records authorization; the swap itself is a separate transaction.
    pub fn authorize_trade(&mut self, trade_id: u64, dao_proposal_id: u64) {
        require!(env::predecessor_account_id() == self.dao, "ERR_DAO_ONLY");
        require!(!self.used_proposals.contains(&dao_proposal_id), "ERR_VOTE_REPLAY");
        let trade = self.trades.get_mut(trade_id as usize).expect("ERR_TRADE");
        require!(trade.status == "proposed", "ERR_TRADE_STATE");
        trade.status = "authorized".into();
        trade.dao_proposal_id = Some(dao_proposal_id);
        self.used_proposals.insert(dao_proposal_id);
    }

    pub fn set_captain(&mut self, policy: CaptainPolicy) {
        require!(env::predecessor_account_id() == self.dao, "ERR_DAO_ONLY");
        require!(policy.max_bps > 0 && policy.max_bps <= 10_000, "ERR_BPS");
        require!(policy.max_daily > 0 && !policy.assets.is_empty(), "ERR_POLICY");
        self.captain = Some(policy);
        self.captain_count = 0;
        self.captain_day = env::block_timestamp() / DAY_NS;
    }

    /// A function-call key on this account may call only this method. It cannot
    /// call ragequit or change policy; signer public key is checked on-chain.
    pub fn captain_trade(&mut self, asset: String, amount: U128, quote_hash: String) -> u64 {
        require!(env::predecessor_account_id() == env::current_account_id(), "ERR_KEY_ACCOUNT");
        let policy = self.captain.as_ref().expect("ERR_NO_CAPTAIN");
        require!(env::signer_account_pk() == policy.public_key, "ERR_CAPTAIN_KEY");
        require!(policy.assets.contains(&asset), "ERR_ASSET_NOT_ALLOWED");
        require!(amount.0 > 0 && amount.0 <= mul_div(self.nav, policy.max_bps as u128, 10_000), "ERR_CAPTAIN_LIMIT");
        let day = env::block_timestamp() / DAY_NS;
        if day != self.captain_day { self.captain_day = day; self.captain_count = 0; }
        require!(self.captain_count < policy.max_daily, "ERR_DAILY_LIMIT");
        require!(quote_hash.len() == 64 && quote_hash.bytes().all(|b| b.is_ascii_hexdigit()), "ERR_QUOTE_HASH");
        self.captain_count += 1;
        let id = self.trades.len() as u64;
        self.trades.push(Trade { id, proposer: env::current_account_id(), asset, amount,
            quote_hash, dao_proposal_id: None, status: "captain_authorized".into(), transfer_tx: None });
        id
    }

    pub fn ft_balance_of(&self, account_id: AccountId) -> U128 { U128(self.balance(&account_id)) }
    pub fn ft_total_supply(&self) -> U128 { U128(self.supply) }
    pub fn get_nav(&self) -> U128 { U128(self.nav) }
    pub fn get_dao(&self) -> AccountId { self.dao.clone() }
    pub fn get_trades(&self) -> Vec<Trade> { self.trades.clone() }
    pub fn get_captain(&self) -> Option<CaptainPolicy> { self.captain.clone() }
    pub fn get_members(&self) -> Vec<(AccountId, U128)> {
        self.balances.iter().filter(|(_, v)| **v > 0).map(|(k, v)| (k.clone(), U128(*v))).collect()
    }
}

impl Kumi {
    fn balance(&self, account: &AccountId) -> u128 { *self.balances.get(account).unwrap_or(&0) }
}

fn mul_div(a: u128, b: u128, d: u128) -> u128 {
    require!(d > 0, "ERR_DIV_ZERO");
    let n = U256::from(a) * U256::from(b) / U256::from(d);
    require!(n <= U256::from(u128::MAX), "ERR_OVERFLOW");
    n.as_u128()
}
