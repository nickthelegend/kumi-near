//! Kumi test pool: a TESTNET-ONLY NEP-141 token (NEP-145 storage, NEP-148 metadata) with a
//! built-in NEAR/token constant-product pool, in the style of a Uniswap v1 exchange.
//!
//! NEAR Intents has no testnet, so Kumi's testnet trades settle against these pools instead.
//! The token ledger and the pool live in one contract, so `buy` and `sell` settle atomically
//! and return the exact amount out; the caller can trust that return value.
//! Pool fee: 0.30% of the input, which stays in the pool.
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::serde_json::json;
use near_sdk::store::LookupMap;
use near_sdk::{env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue};
use primitive_types::U256;

const STORAGE_DEPOSIT: NearToken = NearToken::from_micronear(1_250);
const FEE_BPS: u128 = 30;
const GAS_ON_TRANSFER: Gas = Gas::from_tgas(35);
const GAS_RESOLVE: Gas = Gas::from_tgas(15);

#[derive(Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
#[near(serializers = [borsh])]
pub struct FungibleTokenMetadata {
    pub spec: String,
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
    pub decimals: u8,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct StorageBalance { pub total: U128, pub available: U128 }

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct StorageBalanceBounds { pub min: U128, pub max: Option<U128> }

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Reserves { pub near: U128, pub token: U128, pub fee_bps: u16 }

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct TestPool {
    owner: AccountId,
    metadata: FungibleTokenMetadata,
    balances: LookupMap<AccountId, u128>,
    total_supply: u128,
    /// NEAR held by the pool side (yocto). Token reserve is this contract's own token balance.
    near_reserve: u128,
}

#[near]
impl TestPool {
    #[init]
    pub fn new(owner: AccountId, name: String, symbol: String, decimals: u8, total_supply: U128) -> Self {
        require!(total_supply.0 > 0, "ERR_SUPPLY");
        let mut balances = LookupMap::new(b"b");
        balances.insert(owner.clone(), total_supply.0);
        balances.insert(env::current_account_id(), 0);
        env::log_str(&format!("EVENT_JSON:{}", json!({"standard":"nep141","version":"1.0.0","event":"ft_mint",
            "data":[{"owner_id":owner,"amount":total_supply}]})));
        Self {
            owner,
            metadata: FungibleTokenMetadata { spec: "ft-1.0.0".into(), name, symbol, icon: None,
                reference: None, reference_hash: None, decimals },
            balances,
            total_supply: total_supply.0,
            near_reserve: 0,
        }
    }

    // ---------------- Pool ----------------

    /// Owner seeds liquidity: attached NEAR plus `token_amount` from the owner's balance.
    #[payable]
    pub fn add_liquidity(&mut self, token_amount: U128) {
        require!(env::predecessor_account_id() == self.owner, "ERR_OWNER_ONLY");
        let near_in = env::attached_deposit().as_yoctonear();
        require!(near_in > 0 && token_amount.0 > 0, "ERR_ZERO_LIQUIDITY");
        let pool = env::current_account_id();
        self.internal_transfer(&self.owner.clone(), &pool, token_amount.0, Some("add_liquidity"));
        self.near_reserve += near_in;
    }

    pub fn get_reserves(&self) -> Reserves {
        Reserves { near: U128(self.near_reserve), token: U128(self.pool_tokens()), fee_bps: FEE_BPS as u16 }
    }

    pub fn quote_buy(&self, near_in: U128) -> U128 { U128(amount_out(near_in.0, self.near_reserve, self.pool_tokens())) }
    pub fn quote_sell(&self, token_in: U128) -> U128 { U128(amount_out(token_in.0, self.pool_tokens(), self.near_reserve)) }

    /// Spend the attached NEAR on tokens. Fails with ERR_SLIPPAGE (refunding the NEAR) if the
    /// output is below `min_out`. Returns the exact tokens credited to the caller.
    #[payable]
    pub fn buy(&mut self, min_out: U128) -> U128 {
        let buyer = env::predecessor_account_id();
        require!(self.balances.contains_key(&buyer), "ERR_NOT_REGISTERED");
        let near_in = env::attached_deposit().as_yoctonear();
        require!(near_in > 0, "ERR_ZERO_INPUT");
        let out = amount_out(near_in, self.near_reserve, self.pool_tokens());
        require!(out > 0, "ERR_DUST");
        require!(out >= min_out.0, "ERR_SLIPPAGE");
        self.near_reserve += near_in;
        self.internal_transfer(&env::current_account_id(), &buyer, out, Some("buy"));
        env::log_str(&format!("EVENT_JSON:{}", json!({"standard":"kumi-pool","version":"1.0.0","event":"swap",
            "data":[{"account_id":buyer,"side":"buy","amount_in":U128(near_in),"amount_out":U128(out)}]})));
        U128(out)
    }

    /// Sell `amount` tokens for NEAR, paid to the caller. Fails with ERR_SLIPPAGE if the NEAR
    /// output is below `min_out`. Requires 1 yoctoNEAR. Returns the exact NEAR paid.
    #[payable]
    pub fn sell(&mut self, amount: U128, min_out: U128) -> U128 {
        near_sdk::assert_one_yocto();
        let seller = env::predecessor_account_id();
        require!(amount.0 > 0, "ERR_ZERO_INPUT");
        let out = amount_out(amount.0, self.pool_tokens(), self.near_reserve);
        require!(out > 0, "ERR_DUST");
        require!(out >= min_out.0, "ERR_SLIPPAGE");
        self.internal_transfer(&seller, &env::current_account_id(), amount.0, Some("sell"));
        self.near_reserve -= out;
        env::log_str(&format!("EVENT_JSON:{}", json!({"standard":"kumi-pool","version":"1.0.0","event":"swap",
            "data":[{"account_id":seller,"side":"sell","amount_in":amount,"amount_out":U128(out)}]})));
        Promise::new(seller).transfer(NearToken::from_yoctonear(out)).detach();
        U128(out)
    }

    // ---------------- NEP-141 ----------------

    #[payable]
    pub fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        near_sdk::assert_one_yocto();
        let sender = env::predecessor_account_id();
        self.internal_transfer(&sender, &receiver_id, amount.0, memo.as_deref());
    }

    #[payable]
    pub fn ft_transfer_call(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>, msg: String) -> PromiseOrValue<U128> {
        near_sdk::assert_one_yocto();
        require!(env::prepaid_gas() > GAS_ON_TRANSFER.saturating_add(GAS_RESOLVE).saturating_add(Gas::from_tgas(10)), "ERR_MORE_GAS");
        let sender = env::predecessor_account_id();
        self.internal_transfer(&sender, &receiver_id, amount.0, memo.as_deref());
        Promise::new(receiver_id.clone())
            .function_call("ft_on_transfer", json!({"sender_id": sender, "amount": amount, "msg": msg}).to_string().into_bytes(),
                NearToken::from_yoctonear(0), GAS_ON_TRANSFER)
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_RESOLVE).ft_resolve_transfer(sender, receiver_id, amount))
            .into()
    }

    #[private]
    pub fn ft_resolve_transfer(&mut self, sender_id: AccountId, receiver_id: AccountId, amount: U128) -> U128 {
        let unused = match env::promise_result_checked(0, 64) {
            Ok(bytes) => near_sdk::serde_json::from_slice::<U128>(&bytes).map(|v| v.0.min(amount.0)).unwrap_or(amount.0),
            Err(_) => amount.0,
        };
        if unused == 0 { return amount; }
        let held = self.balance(&receiver_id);
        let refund = unused.min(held);
        if refund > 0 { self.internal_transfer(&receiver_id, &sender_id, refund, Some("refund")); }
        U128(amount.0 - refund)
    }

    pub fn ft_total_supply(&self) -> U128 { U128(self.total_supply) }
    pub fn ft_balance_of(&self, account_id: AccountId) -> U128 { U128(self.balance(&account_id)) }
    pub fn ft_metadata(&self) -> FungibleTokenMetadata { self.metadata.clone() }

    // ---------------- NEP-145 ----------------

    #[payable]
    pub fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>) -> StorageBalance {
        let _ = registration_only;
        let account_id = account_id.unwrap_or_else(env::predecessor_account_id);
        let deposit = env::attached_deposit();
        if self.balances.contains_key(&account_id) {
            if !deposit.is_zero() { Promise::new(env::predecessor_account_id()).transfer(deposit).detach(); }
        } else {
            require!(deposit >= STORAGE_DEPOSIT, "ERR_STORAGE_DEPOSIT");
            self.balances.insert(account_id, 0);
            let extra = deposit.saturating_sub(STORAGE_DEPOSIT);
            if !extra.is_zero() { Promise::new(env::predecessor_account_id()).transfer(extra).detach(); }
        }
        StorageBalance { total: U128(STORAGE_DEPOSIT.as_yoctonear()), available: U128(0) }
    }
    pub fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.balances.contains_key(&account_id).then(|| StorageBalance { total: U128(STORAGE_DEPOSIT.as_yoctonear()), available: U128(0) })
    }
    pub fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        StorageBalanceBounds { min: U128(STORAGE_DEPOSIT.as_yoctonear()), max: Some(U128(STORAGE_DEPOSIT.as_yoctonear())) }
    }
}

impl TestPool {
    fn balance(&self, account: &AccountId) -> u128 { self.balances.get(account).copied().unwrap_or(0) }
    fn pool_tokens(&self) -> u128 { self.balance(&env::current_account_id()) }

    fn internal_transfer(&mut self, from: &AccountId, to: &AccountId, amount: u128, memo: Option<&str>) {
        require!(amount > 0, "ERR_ZERO_AMOUNT");
        require!(from != to, "ERR_SELF_TRANSFER");
        require!(self.balances.contains_key(to), "ERR_NOT_REGISTERED");
        let from_balance = self.balance(from);
        require!(from_balance >= amount, "ERR_INSUFFICIENT_BALANCE");
        self.balances.insert(from.clone(), from_balance - amount);
        let to_balance = self.balance(to);
        self.balances.insert(to.clone(), to_balance.checked_add(amount).expect("ERR_OVERFLOW"));
        env::log_str(&format!("EVENT_JSON:{}", json!({"standard":"nep141","version":"1.0.0","event":"ft_transfer",
            "data":[{"old_owner_id":from,"new_owner_id":to,"amount":U128(amount),"memo":memo}]})));
    }
}

/// Constant-product output with the fee taken from the input: out = in*(1-f)*R_out / (R_in + in*(1-f)).
pub fn amount_out(amount_in: u128, reserve_in: u128, reserve_out: u128) -> u128 {
    if amount_in == 0 || reserve_in == 0 || reserve_out == 0 { return 0; }
    let in_after_fee = U256::from(amount_in) * U256::from(10_000 - FEE_BPS);
    let numerator = in_after_fee * U256::from(reserve_out);
    let denominator = U256::from(reserve_in) * U256::from(10_000u128) + in_after_fee;
    (numerator / denominator).as_u128()
}

#[cfg(test)]
mod tests {
    use super::amount_out;
    #[test]
    fn constant_product_keeps_k_and_charges_fee() {
        let (rn, rt) = (1_000u128 * 10u128.pow(24), 50_000u128 * 10u128.pow(8));
        let out = amount_out(10u128.pow(24), rn, rt);
        // Without the fee: 50_000e8 * 1 / 1001 = 4_995_004_995; the fee makes it strictly less.
        assert!(out < 4_995_004_995 && out > 4_970_000_000);
        let k = |a: u128, b: u128| primitive_types::U256::from(a) * primitive_types::U256::from(b);
        assert!(k(rn + 10u128.pow(24), rt - out) >= k(rn, rt));
        assert_eq!(amount_out(0, rn, rt), 0);
    }
}
