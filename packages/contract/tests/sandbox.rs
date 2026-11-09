//! Real local nearcore sandbox, nothing mocked. The Sputnik DAO factory and its default DAO code
//! are the exact bytes deployed on NEAR testnet (`sputnikv2.testnet`, DAO v3.31), fetched and
//! hash-checked by `scripts/fetch-sputnik.mjs`. Each crew's DAO is created by the Kumi hub
//! through that factory, and every vote below is a real `act_proposal` on that DAO.
use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::{AccessKeyPermission, KeyType, NearToken, SecretKey};
use near_workspaces::{Account, AccountId, Contract, Worker};
use serde_json::{json, Value};

const ROOT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target");
const ONE: u128 = 10u128.pow(24);
const GAS_CAPTAIN: near_workspaces::types::Gas = near_workspaces::types::Gas::from_tgas(100);
const QUOTE_HASH: &str = "5e3b1c8f0d4a2b6c9e7f1a3d5c7b9e2f4a6c8e0b2d4f6a8c0e2b4d6f8a0c2e4b";

/// a * b / d in 256-bit, floor.
fn md(a: u128, b: u128, d: u128) -> u128 { (primitive_types::U256::from(a) * primitive_types::U256::from(b) / primitive_types::U256::from(d)).as_u128() }
fn near(n: u128) -> NearToken { NearToken::from_yoctonear(n) }
fn wasm(path: &str) -> Vec<u8> { std::fs::read(format!("{ROOT}/{path}")).unwrap_or_else(|e| panic!("{path}: {e}; run the build first")) }
fn num(v: &Value) -> u128 { v.as_str().map(|s| s.parse().unwrap()).unwrap_or_else(|| v.as_u64().unwrap() as u128) }

struct Env {
    worker: Worker<Sandbox>,
    root: Account,
    hub: Contract,
    sol: Contract,
    btc: Contract,
    lp: Account,
    alice: Account,
    bob: Account,
    cy: Account,
    dao: AccountId,
}

fn rejected(result: ExecutionFinalResult, reason: &str) {
    let text = format!("{:?}", result.into_result().expect_err(&format!("expected a chain rejection containing {reason}")));
    assert!(text.contains(reason), "expected {reason}, got {text}");
}

async fn user(root: &Account, name: &str, balance: u128) -> anyhow::Result<Account> {
    Ok(root.create_subaccount(name).initial_balance(near(balance)).transact().await?.into_result()?)
}

async fn pool(root: &Account, lp: &Account, name: &str, symbol: &str, decimals: u8, supply: u128) -> anyhow::Result<Contract> {
    let account = user(root, name, 10 * ONE).await?;
    let c = account.deploy(&wasm("near/kumi_testpool/kumi_testpool.wasm")).await?.into_result()?;
    c.call("new").args_json(json!({"owner": lp.id(), "name": format!("Kumi test {symbol}"), "symbol": symbol,
        "decimals": decimals, "total_supply": supply.to_string()})).transact().await?.into_result()?;
    Ok(c)
}

/// Factory as on testnet, two pools priced like mainnet (1 SOL = 60 NEAR, 1 BTC = 40,000 NEAR),
/// the hub, and a crew of three whose DAO the hub created through the factory.
async fn env() -> anyhow::Result<Env> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let factory = user(&root, "sputnik", 60 * ONE).await?;
    factory.deploy(&wasm("sputnik/factory.wasm")).await?.into_result()?;
    factory.call(factory.id(), "new").max_gas().transact().await?.into_result()?;
    let manifest: Value = serde_json::from_slice(&wasm("sputnik/manifest.json"))?;
    let hash = manifest["dao_code_hash"].as_str().unwrap().to_string();
    let stored = factory.call(factory.id(), "store").args(wasm("sputnik/dao.wasm")).deposit(near(6 * ONE)).max_gas().transact().await?;
    if stored.is_success() { assert_eq!(stored.json::<String>()?, hash); }
    factory.call(factory.id(), "set_default_code_hash").args_json(json!({"code_hash": hash})).transact().await?.into_result()?;

    let lp = user(&root, "lp", 200 * ONE).await?;
    let sol = pool(&root, &lp, "tsol", "SOL", 9, 1_000_000 * 10u128.pow(9)).await?;
    let btc = pool(&root, &lp, "tbtc", "BTC", 8, 1_000 * 10u128.pow(8)).await?;
    lp.call(sol.id(), "add_liquidity").args_json(json!({"token_amount": (10 * 10u128.pow(9)).to_string()})).deposit(near(600 * ONE / 10)).transact().await?.into_result()?;
    lp.call(btc.id(), "add_liquidity").args_json(json!({"token_amount": (2 * 10u128.pow(5)).to_string()})).deposit(near(80 * ONE / 100)).transact().await?.into_result()?;

    let hub_account = user(&root, "kumi", 30 * ONE).await?;
    let hub = hub_account.deploy(&wasm("near/kumi_contract/kumi_contract.wasm")).await?.into_result()?;
    hub.call("new").args_json(json!({"owner": hub.id(), "factory": factory.id(), "dao_deposit": (56 * ONE / 10).to_string(), "assets": [
        {"symbol": "SOL", "token": sol.id(), "decimals": 9, "intents_asset": "nep141:sol.omft.near"},
        {"symbol": "BTC", "token": btc.id(), "decimals": 8, "intents_asset": "nep141:btc.omft.near"}]})).transact().await?.into_result()?;
    for token in [sol.id(), btc.id()] {
        hub.as_account().call(token, "storage_deposit").args_json(json!({})).deposit(near(ONE / 100)).transact().await?.into_result()?;
    }
    let alice = user(&root, "alice", 40 * ONE).await?;
    let bob = user(&root, "bob", 40 * ONE).await?;
    let cy = user(&root, "cy", 40 * ONE).await?;
    let created = alice.call(hub.id(), "create_crew")
        .args_json(json!({"name": "Night Owls", "slug": "owls", "members": [alice.id(), bob.id(), cy.id()], "fee_bps": 2000}))
        .deposit(near(56 * ONE / 10)).max_gas().transact().await?.into_result()?;
    assert!(created.logs().iter().any(|l| l.contains("crew_created")), "crew registered after the DAO policy check");
    let dao: AccountId = format!("owls.{}", factory.id()).parse()?;
    Ok(Env { worker, root, hub, sol, btc, lp, alice, bob, cy, dao })
}

impl Env {
    async fn crew(&self) -> anyhow::Result<Value> { Ok(self.hub.view("get_crew").args_json(json!({"crew_id": 0})).await?.json()?) }
    async fn trade(&self, id: u64) -> anyhow::Result<Value> { Ok(self.hub.view("get_trade").args_json(json!({"crew_id": 0, "trade_id": id})).await?.json()?) }
    async fn join(&self, who: &Account, amount: u128) -> anyhow::Result<ExecutionFinalResult> {
        Ok(who.call(self.hub.id(), "join").args_json(json!({"crew_id": 0})).deposit(near(amount)).max_gas().transact().await?)
    }
    async fn propose(&self, who: &Account, side: &str, asset: &str, bps: u16) -> anyhow::Result<(u64, u64)> {
        let (qin, qout) = self.quote(side, asset, bps).await?;
        let r = who.call(self.hub.id(), "propose_trade").args_json(json!({"crew_id": 0, "side": side, "asset": asset, "bps": bps,
            "quote_in": qin.to_string(), "quote_out": qout.to_string(), "quote_hash": QUOTE_HASH})).max_gas().transact().await?.into_result()?;
        let pid: u64 = r.json::<Option<u64>>()?.expect("proposal filed");
        let crew = self.crew().await?;
        Ok((crew["trade_count"].as_u64().unwrap() - 1, pid))
    }
    /// The quote a client attaches: the pool's own quote for the amount the trade would move now.
    async fn quote(&self, side: &str, asset: &str, bps: u16) -> anyhow::Result<(u128, u128)> {
        let crew = self.crew().await?;
        let pool = if asset == "SOL" { &self.sol } else { &self.btc };
        let held = |list: &Value| list.as_array().unwrap().iter().find(|p| p[0] == asset).map(|p| num(&p[1])).unwrap_or(0);
        let base = if side == "buy" { num(&crew["near"]) + num(&crew["vault_near"]) } else { held(&crew["tokens"]) + held(&crew["vault_tokens"]) };
        let amount = base * bps as u128 / 10_000;
        let method = if side == "buy" { "quote_buy" } else { "quote_sell" };
        let arg = if side == "buy" { "near_in" } else { "token_in" };
        let out: Value = pool.view(method).args_json(json!({arg: amount.to_string()})).await?.json()?;
        Ok((amount, num(&out)))
    }
    async fn proposal(&self, id: u64) -> anyhow::Result<Value> {
        Ok(self.worker.view(&self.dao, "get_proposal").args_json(json!({"id": id})).await?.json()?)
    }
    async fn vote(&self, who: &Account, id: u64) -> anyhow::Result<ExecutionFinalResult> {
        let kind = self.proposal(id).await?["kind"].clone();
        Ok(who.call(&self.dao, "act_proposal").args_json(json!({"id": id, "action": "VoteApprove", "proposal": kind})).max_gas().transact().await?)
    }
    async fn dao_call(&self, method: &str, args: Value) -> anyhow::Result<u64> {
        let encoded = base64_encode(&serde_json::to_vec(&args)?);
        let r = self.alice.call(&self.dao, "add_proposal").args_json(json!({"proposal": {"description": format!("{method}"),
            "kind": {"FunctionCall": {"receiver_id": self.hub.id(), "actions": [{"method_name": method, "args": encoded,
            "deposit": "0", "gas": "150000000000000"}]}}}})).max_gas().transact().await?.into_result()?;
        Ok(r.json()?)
    }
    async fn balance(&self, id: &AccountId) -> anyhow::Result<u128> { Ok(self.worker.view_account(id).await?.balance.as_yoctonear()) }
    async fn ft(&self, token: &Contract, id: &AccountId) -> anyhow::Result<u128> {
        Ok(num(&token.view("ft_balance_of").args_json(json!({"account_id": id})).await?.json::<Value>()?))
    }
}

fn base64_encode(bytes: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = (b[0] as u32) << 16 | (b[1] as u32) << 8 | b[2] as u32;
        for i in 0..4 {
            if i <= chunk.len() { out.push(T[(n >> (18 - 6 * i)) as usize & 63] as char) } else { out.push('=') }
        }
    }
    out
}

fn holding(list: &Value, symbol: &str) -> u128 {
    list.as_array().unwrap().iter().find(|p| p[0] == symbol).map(|p| num(&p[1])).unwrap_or(0)
}
fn shares_of(crew: &Value, who: &Account) -> u128 {
    crew["members"].as_array().unwrap().iter().find(|p| p[0] == who.id().as_str()).map(|p| num(&p[1])).unwrap_or(0)
}

#[tokio::test]
async fn crew_dao_is_created_by_factory_with_member_policy() -> anyhow::Result<()> {
    let e = env().await?;
    let policy: Value = e.worker.view(&e.dao, "get_policy").await?.json()?;
    let crew_role = policy["roles"].as_array().unwrap().iter().find(|r| r["name"] == "crew").unwrap();
    assert_eq!(crew_role["kind"]["Group"].as_array().unwrap().len(), 3);
    assert_eq!(policy["proposal_bond"], "0");
    let crew = e.crew().await?;
    assert_eq!(crew["dao"], e.dao.as_str());
    // Not invited: rejected.
    let mallory = user(&e.root, "mallory", 10 * ONE).await?;
    rejected(e.join(&mallory, ONE).await?, "ERR_NOT_INVITED");
    // A bad slug never reaches the factory; a deposit below the DAO's storage is rejected.
    rejected(e.alice.call(e.hub.id(), "create_crew").args_json(json!({"name": "x", "slug": "Bad Slug", "members": [e.alice.id()], "fee_bps": 0}))
        .deposit(near(6 * ONE)).max_gas().transact().await?, "ERR_SLUG");
    rejected(e.alice.call(e.hub.id(), "create_crew").args_json(json!({"name": "x", "slug": "cheap", "members": [e.alice.id()], "fee_bps": 0}))
        .deposit(near(ONE)).max_gas().transact().await?, "ERR_DAO_DEPOSIT");
    // A slug that already exists fails inside the factory; the deposit comes back and no crew is added.
    let before = e.balance(e.alice.id()).await?;
    let dup = e.alice.call(e.hub.id(), "create_crew").args_json(json!({"name": "dup", "slug": "owls", "members": [e.alice.id()], "fee_bps": 0}))
        .deposit(near(56 * ONE / 10)).max_gas().transact().await?.into_result()?;
    let _ = dup;
    assert!(before - e.balance(e.alice.id()).await? < ONE / 10, "deposit refunded");
    assert!(e.hub.view("get_crew").args_json(json!({"crew_id": 1})).await?.json::<Option<Value>>()?.is_none());
    Ok(())
}

#[tokio::test]
async fn share_math_join_at_nav_and_exact_ragequit() -> anyhow::Result<()> {
    let e = env().await?;
    e.join(&e.alice, ONE).await?.into_result()?;
    e.join(&e.bob, 2 * ONE).await?.into_result()?;
    let crew = e.crew().await?;
    assert_eq!(num(&crew["near"]), 3 * ONE);
    assert_eq!(shares_of(&crew, &e.alice) * 2, shares_of(&crew, &e.bob));
    // Buy SOL with 50% by vote (2 of 3), then cy joins: shares minted at NAV from on-chain marks.
    let (tid, pid) = e.propose(&e.alice, "buy", "SOL", 5000).await?;
    e.vote(&e.alice, pid).await?.into_result()?;
    e.vote(&e.bob, pid).await?.into_result()?;
    assert_eq!(e.trade(tid).await?["status"], "executed");
    let crew = e.crew().await?;
    let sol_held = holding(&crew["tokens"], "SOL");
    assert!(sol_held > 0);
    assert_eq!(e.ft(&e.sol, e.hub.id()).await?, sol_held, "hub token balance equals the crew ledger");
    let r: Value = e.sol.view("get_reserves").await?.json()?;
    let nav = num(&crew["near"]) + md(sol_held, num(&r["near"]), num(&r["token"]));
    let supply = num(&crew["supply"]);
    e.join(&e.cy, ONE).await?.into_result()?;
    let crew = e.crew().await?;
    let expected = md(ONE, supply, nav);
    assert_eq!(shares_of(&crew, &e.cy), expected, "cy minted exactly amount * supply / NAV (nav {nav}, supply {supply})");
    // Bob ragequits all his shares: exact pro-rata NEAR and SOL, no vote.
    let (bob_shares, supply, near_now, sol_now) = (shares_of(&crew, &e.bob), num(&crew["supply"]), num(&crew["near"]), holding(&crew["tokens"], "SOL"));
    e.bob.call(e.sol.id(), "storage_deposit").args_json(json!({})).deposit(near(ONE / 100)).transact().await?.into_result()?;
    let paid = e.bob.call(e.hub.id(), "ragequit").args_json(json!({"crew_id": 0, "shares": bob_shares.to_string()})).max_gas().transact().await?.into_result()?;
    assert_eq!(num(&paid.json::<Value>()?), md(near_now, bob_shares, supply), "exact pro-rata NEAR");
    assert_eq!(e.ft(&e.sol, e.bob.id()).await?, md(sol_now, bob_shares, supply));
    // Everyone else leaves; the last exit takes everything, leaving zero dust.
    for who in [&e.alice, &e.cy] {
        who.call(e.sol.id(), "storage_deposit").args_json(json!({})).deposit(near(ONE / 100)).transact().await?.into_result()?;
        let s = shares_of(&e.crew().await?, who);
        who.call(e.hub.id(), "ragequit").args_json(json!({"crew_id": 0, "shares": s.to_string()})).max_gas().transact().await?.into_result()?;
    }
    let crew = e.crew().await?;
    assert_eq!(num(&crew["supply"]), 0);
    assert_eq!(num(&crew["near"]), 0);
    assert_eq!(holding(&crew["tokens"], "SOL"), 0);
    assert_eq!(e.ft(&e.sol, e.hub.id()).await?, 0);
    // A ragequit by a non-member and a double exit both fail.
    rejected(e.bob.call(e.hub.id(), "ragequit").args_json(json!({"crew_id": 0, "shares": "1"})).transact().await?, "ERR_SHARES");
    Ok(())
}

#[tokio::test]
async fn proposal_vote_execute_and_vote_replay_rejected() -> anyhow::Result<()> {
    let e = env().await?;
    for who in [&e.alice, &e.bob, &e.cy] { e.join(who, 2 * ONE).await?.into_result()?; }
    let (tid, pid) = e.propose(&e.bob, "buy", "BTC", 2000).await?;
    let p = e.proposal(pid).await?;
    assert_eq!(p["kind"]["FunctionCall"]["actions"][0]["method_name"], "execute_trade");
    assert_eq!(e.trade(tid).await?["status"], "voting");
    // Only the DAO can execute; a member calling directly is rejected.
    rejected(e.alice.call(e.hub.id(), "execute_trade").args_json(json!({"crew_id": 0, "trade_id": tid})).max_gas().transact().await?, "ERR_DAO_ONLY");
    // An outsider cannot vote in the crew DAO.
    let mallory = user(&e.root, "mallory", 5 * ONE).await?;
    assert!(e.vote(&mallory, pid).await?.is_failure());
    // 1 of 3 approvals: still voting. 2 of 3: executed, 20% of NEAR spent.
    e.vote(&e.alice, pid).await?.into_result()?;
    assert_eq!(e.trade(tid).await?["status"], "voting");
    e.vote(&e.cy, pid).await?.into_result()?;
    let t = e.trade(tid).await?;
    assert_eq!(t["status"], "executed");
    assert_eq!(num(&t["crew_in"]), 6 * ONE * 2000 / 10_000);
    assert_eq!(e.proposal(pid).await?["status"], "Approved");
    let crew = e.crew().await?;
    assert_eq!(num(&crew["near"]), 6 * ONE - num(&t["crew_in"]));
    assert_eq!(holding(&crew["tokens"], "BTC"), num(&t["crew_out"]));
    // Vote replay: a second DAO proposal for the same trade passes the vote but the hub refuses.
    let replay = e.dao_call("execute_trade", json!({"crew_id": 0, "trade_id": tid})).await?;
    e.vote(&e.alice, replay).await?.into_result()?;
    e.vote(&e.bob, replay).await?.into_result()?;
    assert_eq!(e.proposal(replay).await?["status"], "Failed");
    let after = e.crew().await?;
    assert_eq!(after["near"], crew["near"]);
    assert_eq!(after["tokens"], crew["tokens"]);
    // Second voted trade: sell half the BTC back.
    let (tid2, pid2) = e.propose(&e.alice, "sell", "BTC", 5000).await?;
    e.vote(&e.alice, pid2).await?.into_result()?;
    e.vote(&e.bob, pid2).await?.into_result()?;
    assert_eq!(e.trade(tid2).await?["status"], "executed");
    let receipts: Vec<Value> = e.hub.view("get_receipts").args_json(json!({"crew_id": 0})).await?.json()?;
    let kinds: Vec<&str> = receipts.iter().map(|r| r["kind"].as_str().unwrap()).collect();
    assert_eq!(kinds, ["join", "join", "join", "trade", "trade"]);
    Ok(())
}

#[tokio::test]
async fn captain_key_limits_are_enforced_and_it_cannot_withdraw() -> anyhow::Result<()> {
    let e = env().await?;
    for who in [&e.alice, &e.bob, &e.cy] { e.join(who, 2 * ONE).await?.into_result()?; }
    let key = SecretKey::from_random(KeyType::ED25519);
    let pid = e.dao_call("set_captain", json!({"crew_id": 0, "captain": {"account_id": e.cy.id(), "public_key": key.public_key().to_string(),
        "max_bps": 1000, "max_daily": 2, "assets": ["SOL"]}})).await?;
    e.vote(&e.alice, pid).await?.into_result()?;
    e.vote(&e.bob, pid).await?.into_result()?;
    assert_eq!(e.proposal(pid).await?["status"], "Approved");
    // The vote installed a function-call key on the hub that may call only captain_trade.
    let keys = e.worker.view_access_keys(e.hub.id()).await?;
    let fc = keys.iter().find(|k| k.public_key.to_string() == key.public_key().to_string()).expect("captain key installed");
    match &fc.access_key.permission {
        AccessKeyPermission::FunctionCall(p) => assert_eq!(p.method_names, vec!["captain_trade".to_string()]),
        other => panic!("expected function-call key, got {other:?}"),
    }
    let captain = Account::from_secret_key(e.hub.id().clone(), key, &e.worker);
    let trade = |asset: &str, bps: u16, qin: u128, qout: u128| json!({"crew_id": 0, "side": "buy", "asset": asset, "bps": bps,
        "quote_in": qin.to_string(), "quote_out": qout.to_string(), "quote_hash": QUOTE_HASH});
    let (qin, qout) = e.quote("buy", "SOL", 1000).await?;
    rejected(captain.call(e.hub.id(), "captain_trade").args_json(trade("SOL", 1500, qin, qout)).gas(GAS_CAPTAIN).transact().await?, "ERR_CAPTAIN_LIMIT");
    rejected(captain.call(e.hub.id(), "captain_trade").args_json(trade("BTC", 500, qin, qout)).gas(GAS_CAPTAIN).transact().await?, "ERR_ASSET_NOT_ALLOWED");
    let before = e.balance(e.hub.id()).await?;
    captain.call(e.hub.id(), "captain_trade").args_json(trade("SOL", 1000, qin, qout)).gas(GAS_CAPTAIN).transact().await?.into_result()?;
    let crew = e.crew().await?;
    assert_eq!(num(&crew["near"]), 6 * ONE - 6 * ONE / 10);
    assert!(holding(&crew["tokens"], "SOL") > 0);
    assert_eq!(e.trade(0).await?["kind"], "captain");
    let (qin, qout) = e.quote("buy", "SOL", 500).await?;
    captain.call(e.hub.id(), "captain_trade").args_json(trade("SOL", 500, qin, qout)).gas(GAS_CAPTAIN).transact().await?.into_result()?;
    rejected(captain.call(e.hub.id(), "captain_trade").args_json(trade("SOL", 500, qin, qout)).gas(GAS_CAPTAIN).transact().await?, "ERR_DAILY_LIMIT");
    // The key cannot call anything else: no ragequit, no policy change, no transfer out.
    for (method, args) in [("ragequit", json!({"crew_id": 0, "shares": "1"})), ("add_asset", json!({"asset": {"symbol": "X", "token": e.sol.id(), "decimals": 1, "intents_asset": "x"}})),
        ("claim_token", json!({"symbol": "SOL"}))] {
        let r = captain.call(e.hub.id(), method).args_json(args).transact().await;
        assert!(r.map(|r| r.is_failure()).unwrap_or(true), "{method} must be refused for the captain key");
    }
    let sent = captain.transfer_near(e.cy.id(), near(ONE)).await;
    assert!(sent.map(|r| r.is_failure()).unwrap_or(true), "a function-call key cannot transfer NEAR");
    // Only swap gas left the hub account (paid from the key allowance); the crew's NEAR moved into SOL, not out.
    assert!(before - e.balance(e.hub.id()).await? < ONE, "hub balance moved only by the swap and gas");
    // A different signer (the hub's own full-access key) is not the captain.
    rejected(e.hub.as_account().call(e.hub.id(), "captain_trade").args_json(trade("SOL", 100, qin, qout)).max_gas().transact().await?, "ERR_NOT_CAPTAIN");
    // Revoke by vote deletes the key.
    let rid = e.dao_call("revoke_captain", json!({"crew_id": 0})).await?;
    e.vote(&e.alice, rid).await?.into_result()?;
    e.vote(&e.bob, rid).await?.into_result()?;
    let keys = e.worker.view_access_keys(e.hub.id()).await?;
    assert!(keys.iter().all(|k| k.public_key.to_string() != fc.public_key.to_string()));
    Ok(())
}

#[tokio::test]
async fn ragequit_during_pending_trade_is_exact_and_trade_uses_what_is_left() -> anyhow::Result<()> {
    let e = env().await?;
    for who in [&e.alice, &e.bob, &e.cy] { e.join(who, 3 * ONE).await?.into_result()?; }
    let (tid, pid) = e.propose(&e.alice, "buy", "SOL", 5000).await?;
    e.vote(&e.alice, pid).await?.into_result()?;
    // Bob leaves while the vote is open: exactly one third of the NEAR.
    let bob_shares = shares_of(&e.crew().await?, &e.bob);
    let r = e.bob.call(e.hub.id(), "ragequit").args_json(json!({"crew_id": 0, "shares": bob_shares.to_string()})).max_gas().transact().await?.into_result()?;
    assert_eq!(num(&r.json::<Value>()?), 3 * ONE);
    // Bob's earlier approval still counts in the DAO; the vote passes with cy and executes on 6 NEAR.
    e.vote(&e.cy, pid).await?.into_result()?;
    let t = e.trade(tid).await?;
    assert_eq!(t["status"], "executed");
    assert_eq!(num(&t["crew_in"]), 3 * ONE, "50% of the 6 NEAR left, not of the 9 before the exit");
    Ok(())
}

#[tokio::test]
async fn follower_mirrors_pro_rata_and_pays_fee_above_high_water_mark() -> anyhow::Result<()> {
    let e = env().await?;
    for who in [&e.alice, &e.bob] { e.join(who, 2 * ONE).await?.into_result()?; }
    let fan = user(&e.root, "fan", 20 * ONE).await?;
    fan.call(e.hub.id(), "follow").args_json(json!({"crew_id": 0})).deposit(near(ONE)).max_gas().transact().await?.into_result()?;
    let (tid, pid) = e.propose(&e.alice, "buy", "SOL", 5000).await?;
    e.vote(&e.alice, pid).await?.into_result()?;
    e.vote(&e.bob, pid).await?.into_result()?;
    let t = e.trade(tid).await?;
    // Same swap, same price: vault_in/crew_in == vault_out/crew_out (exact up to 1 unit).
    let (ci, co, vi, vo) = (num(&t["crew_in"]), num(&t["crew_out"]), num(&t["vault_in"]), num(&t["vault_out"]));
    assert_eq!(ci, 2 * ONE);
    assert_eq!(vi, ONE / 2);
    assert!(md(co, vi, ONE).abs_diff(md(vo, ci, ONE)) <= 2, "pro-rata fill");
    // Mark-to-market after the buy, then after the SOL price rises (the LP buys 10 NEAR of SOL).
    let expected_fee = |crew: &Value, r: &Value, paid: u128| -> (u128, u128, u128) {
        let nav = num(&crew["vault_near"]) + md(holding(&crew["vault_tokens"], "SOL"), num(&r["near"]), num(&r["token"]));
        let vs = num(&crew["vault_supply"]);
        let pps = md(nav, ONE, vs);
        let hwm = num(&crew["vault_hwm"]);
        let fee = if pps > hwm { md(md(pps - hwm, vs, ONE), 2000, 10_000) } else { 0 };
        (paid + fee, nav, vs)
    };
    e.alice.call(e.hub.id(), "crystallize_fee").args_json(json!({"crew_id": 0})).max_gas().transact().await?.into_result()?;
    let first = num(&e.crew().await?["vault_fees_paid"]);
    e.alice.call(e.hub.id(), "crystallize_fee").args_json(json!({"crew_id": 0})).max_gas().transact().await?.into_result()?;
    assert_eq!(num(&e.crew().await?["vault_fees_paid"]), first, "no new gain above the HWM: no fee");
    e.lp.call(e.sol.id(), "buy").args_json(json!({"min_out": "0"})).deposit(near(10 * ONE)).transact().await?.into_result()?;
    let crew = e.crew().await?;
    let r: Value = e.sol.view("get_reserves").await?.json()?;
    let (fee, vault_nav, vs) = expected_fee(&crew, &r, first);
    let pps_before = md(vault_nav, ONE, vs);
    let crew_sol = holding(&crew["tokens"], "SOL");
    e.cy.call(e.hub.id(), "crystallize_fee").args_json(json!({"crew_id": 0})).max_gas().transact().await?.into_result()?;
    let after = e.crew().await?;
    assert!(fee > first);
    assert_eq!(num(&after["vault_fees_paid"]), fee, "20% of the gain above HWM");
    assert!(holding(&after["tokens"], "SOL") > crew_sol, "fee paid in kind to the crew");
    assert!(num(&after["vault_hwm"]) > md(vault_nav - (fee - first), ONE, vs) && num(&after["vault_hwm"]) < pps_before, "HWM moves to the post-fee price");
    // Crystallizing again at the same price pays nothing.
    e.cy.call(e.hub.id(), "crystallize_fee").args_json(json!({"crew_id": 0})).max_gas().transact().await?.into_result()?;
    assert_eq!(num(&e.crew().await?["vault_fees_paid"]), fee);
    // The follower exits any time with the exact vault slice.
    fan.call(e.sol.id(), "storage_deposit").args_json(json!({})).deposit(near(ONE / 100)).transact().await?.into_result()?;
    let vault_sol = holding(&after["vault_tokens"], "SOL");
    fan.call(e.hub.id(), "unfollow").args_json(json!({"crew_id": 0, "shares": vs.to_string()})).max_gas().transact().await?.into_result()?;
    assert_eq!(e.ft(&e.sol, fan.id()).await?, vault_sol);
    let done = e.crew().await?;
    assert_eq!(num(&done["vault_supply"]), 0);
    assert_eq!(num(&done["vault_near"]), 0);
    Ok(())
}

#[tokio::test]
async fn front_running_the_crew_is_bounded_by_the_attached_quote() -> anyhow::Result<()> {
    let e = env().await?;
    for who in [&e.alice, &e.bob] { e.join(who, 2 * ONE).await?.into_result()?; }
    let fan = user(&e.root, "fan", 40 * ONE).await?;
    fan.call(e.hub.id(), "follow").args_json(json!({"crew_id": 0})).deposit(near(ONE)).max_gas().transact().await?.into_result()?;
    fan.call(e.sol.id(), "storage_deposit").args_json(json!({})).deposit(near(ONE / 100)).transact().await?.into_result()?;
    let (tid, pid) = e.propose(&e.alice, "buy", "SOL", 5000).await?;
    e.vote(&e.alice, pid).await?.into_result()?;
    // The follower sees the open vote and buys SOL first, moving the price ~30%.
    fan.call(e.sol.id(), "buy").args_json(json!({"min_out": "0"})).deposit(near(10 * ONE)).transact().await?.into_result()?;
    let before = e.crew().await?;
    e.vote(&e.bob, pid).await?.into_result()?;
    // The fill would be worse than the quote minus 3% slippage: the pool refuses, holdings restored.
    assert_eq!(e.trade(tid).await?["status"], "failed");
    let after = e.crew().await?;
    assert_eq!(after["near"], before["near"]);
    assert_eq!(after["vault_near"], before["vault_near"]);
    assert_eq!(after["busy"], false);
    assert_eq!(e.ft(&e.sol, e.hub.id()).await?, 0);
    Ok(())
}
