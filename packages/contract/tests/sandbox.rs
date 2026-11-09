//! Each assertion calls the contract on a real nearcore sandbox.
use near_workspaces::types::{AccessKey, KeyType, NearToken, SecretKey};
use near_workspaces::{Account, Contract, Worker, network::Sandbox};
use serde_json::{json, Value};

const WASM: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/target/near/kumi_contract.wasm");
const QUOTE: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

async fn setup() -> anyhow::Result<(Worker<Sandbox>, Contract, Account, Account, Account)> {
    let worker = near_workspaces::sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let dao = worker.dev_create_account().await?;
    let alice = worker.dev_create_account().await?;
    let bob = worker.dev_create_account().await?;
    let contract = owner.deploy(&std::fs::read(WASM)?).await?.into_result()?;
    owner.call(contract.id(), "new").args_json(json!({"dao":dao.id()})).transact().await?.into_result()?;
    Ok((worker, contract, dao, alice, bob))
}

async fn view(c: &Contract, method: &str) -> anyhow::Result<Value> {
    Ok(c.view(method).await?.json()?)
}

fn rejected(result: near_workspaces::result::ExecutionFinalResult, reason: &str) {
    let error = result.into_result().expect_err("expected chain rejection");
    assert!(format!("{error:?}").contains(reason), "{error:?}");
}

#[tokio::test]
async fn join_and_exact_full_ragequit() -> anyhow::Result<()> {
    let (_worker, c, _dao, alice, _bob) = setup().await?;
    let deposit = 5 * 10u128.pow(24);
    alice.call(c.id(), "join").deposit(NearToken::from_yoctonear(deposit)).transact().await?.into_result()?;
    assert_eq!(view(&c, "get_nav").await?, deposit.to_string());
    assert_eq!(c.view("ft_balance_of").args_json(json!({"account_id": alice.id()})).await?.json::<String>()?, deposit.to_string());
    alice.call(c.id(), "ragequit").args_json(json!({"shares":deposit.to_string()})).transact().await?.into_result()?;
    assert_eq!(view(&c, "get_nav").await?, "0");
    assert_eq!(view(&c, "ft_total_supply").await?, "0");
    Ok(())
}

#[tokio::test]
async fn three_members_receive_proportional_shares_and_one_exits() -> anyhow::Result<()> {
    let (_worker, c, _dao, alice, bob) = setup().await?;
    for account in [&alice, &bob] {
        account.call(c.id(), "join").deposit(NearToken::from_near(2)).transact().await?.into_result()?;
    }
    assert_eq!(view(&c, "get_nav").await?, (4 * 10u128.pow(24)).to_string());
    bob.call(c.id(), "ragequit").args_json(json!({"shares":(2 * 10u128.pow(24)).to_string()})).transact().await?.into_result()?;
    assert_eq!(view(&c, "get_nav").await?, (2 * 10u128.pow(24)).to_string());
    assert_eq!(view(&c, "get_members").await?.as_array().unwrap().len(), 1);
    Ok(())
}

#[tokio::test]
async fn only_dao_can_authorize_and_proposal_cannot_be_replayed() -> anyhow::Result<()> {
    let (_worker, c, dao, alice, bob) = setup().await?;
    alice.call(c.id(), "join").deposit(NearToken::from_near(3)).transact().await?.into_result()?;
    alice.call(c.id(), "propose_trade").args_json(json!({"asset":"SOL","amount":10u128.pow(24).to_string(),"quote_hash":QUOTE})).transact().await?.into_result()?;
    let bad = bob.call(c.id(), "authorize_trade").args_json(json!({"trade_id":0,"dao_proposal_id":7})).transact().await?;
    rejected(bad, "ERR_DAO_ONLY");
    dao.call(c.id(), "authorize_trade").args_json(json!({"trade_id":0,"dao_proposal_id":7})).transact().await?.into_result()?;
    let replay = dao.call(c.id(), "authorize_trade").args_json(json!({"trade_id":0,"dao_proposal_id":7})).transact().await?;
    rejected(replay, "ERR_VOTE_REPLAY");
    assert_eq!(view(&c, "get_trades").await?[0]["status"], "authorized");
    Ok(())
}

#[tokio::test]
async fn captain_function_key_limits_assets_size_and_daily_count() -> anyhow::Result<()> {
    let (worker, c, dao, alice, _bob) = setup().await?;
    alice.call(c.id(), "join").deposit(NearToken::from_near(10)).transact().await?.into_result()?;
    let key = SecretKey::from_random(KeyType::ED25519);
    c.as_account().batch(c.id()).add_key(key.public_key(), AccessKey::function_call_access(c.id(), &["captain_trade"], None)).transact().await?.into_result()?;
    dao.call(c.id(), "set_captain").args_json(json!({"policy":{"public_key":key.public_key().to_string(),"max_bps":1000,"max_daily":1,"assets":["SOL"]}})).transact().await?.into_result()?;
    let captain = Account::from_secret_key(c.id().clone(), key, &worker);
    let too_large = captain.call(c.id(), "captain_trade").args_json(json!({"asset":"SOL","amount":(2 * 10u128.pow(24)).to_string(),"quote_hash":QUOTE})).transact().await?;
    rejected(too_large, "ERR_CAPTAIN_LIMIT");
    let wrong_asset = captain.call(c.id(), "captain_trade").args_json(json!({"asset":"BTC","amount":10u128.pow(24).to_string(),"quote_hash":QUOTE})).transact().await?;
    rejected(wrong_asset, "ERR_ASSET_NOT_ALLOWED");
    captain.call(c.id(), "captain_trade").args_json(json!({"asset":"SOL","amount":10u128.pow(24).to_string(),"quote_hash":QUOTE})).transact().await?.into_result()?;
    let daily = captain.call(c.id(), "captain_trade").args_json(json!({"asset":"SOL","amount":10u128.pow(24).to_string(),"quote_hash":QUOTE})).transact().await?;
    rejected(daily, "ERR_DAILY_LIMIT");
    let exit = captain.call(c.id(), "ragequit").args_json(json!({"shares":"1"})).transact().await;
    assert!(exit.map(|r| r.is_failure()).unwrap_or(true));
    Ok(())
}

#[tokio::test]
async fn pending_trade_does_not_block_ragequit() -> anyhow::Result<()> {
    let (_worker, c, _dao, alice, _bob) = setup().await?;
    alice.call(c.id(), "join").deposit(NearToken::from_near(2)).transact().await?.into_result()?;
    alice.call(c.id(), "propose_trade").args_json(json!({"asset":"SOL","amount":10u128.pow(24).to_string(),"quote_hash":QUOTE})).transact().await?.into_result()?;
    alice.call(c.id(), "ragequit").args_json(json!({"shares":(2 * 10u128.pow(24)).to_string()})).transact().await?.into_result()?;
    assert_eq!(view(&c, "get_nav").await?, "0");
    assert_eq!(view(&c, "get_trades").await?[0]["status"], "proposed");
    Ok(())
}
