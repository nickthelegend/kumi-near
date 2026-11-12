// Real browser flow. Private material is loaded only from gitignored paths and never logged.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium, type Browser, type Page } from 'playwright-core';
import { KeyPair, decodeDelegate, describeDelegate, getAssets, getCrew, getInvites, getPolicy, getProposals, getTrades, ragequitPreview, storageBalance, viewAccessKey, viewAccount, view } from '@kumi/sdk';
import { createApp } from '../packages/server/src/app.js';
import { Relayer } from '../packages/server/src/relayer.js';
import { Store } from '../packages/server/src/store.js';
import { Budget, ONE, TGAS } from './r3-evidence.js';
import { freePort, pause, preview, ROOT, SHOTS, withChromeLock } from './e2e-support.js';
import evidence from '../deployments/testnet-2026-11-09.json' with { type: 'json' };

type Session = { accountId: string; handle: string; key: string };
type Run = { handle: string; email: string; session?: Session; done: string[]; started_at: string; initial_members: string[]; initial_followers: string[]; tradeId?: number; captainTradeId?: number; inviteId?: number };
export async function fullFlow(shot: (p: Page, name: string) => Promise<void>, errors: string[]) {
  const hub = evidence.accounts.hub, root = evidence.accounts.root;
  const file = process.env.KUMI_E2E_EVIDENCE ?? `deployments/r3-${new Date().toISOString().slice(0, 10)}.json`;
  const membersFile = join(ROOT, '.near-credentials/run-players.json'), captainFile = join(ROOT, '.near-credentials/captain-0.json'), rootFile = join(ROOT, `.near-credentials/${root}.json`);
  for (const file of [membersFile, captainFile, rootFile]) if (!existsSync(file)) throw new Error(`BLOCKED: required credential file missing: ${file.split('/').at(-1)}`);
  const budget = new Budget(file); budget.beginFullRun();
  const initial = await getCrew(hub, 0); assert(initial);
  const players = Object.values(JSON.parse(readFileSync(membersFile, 'utf8'))) as Session[];
  // Include previously created QA members when a prior run stopped before its exit.
  for (const name of readdirSync(join(ROOT, '.near-credentials')).filter(n => /^qa[a-z0-9]+-e2e\.json$/.test(n))) {
    const saved = JSON.parse(readFileSync(join(ROOT, '.near-credentials', name), 'utf8')) as Session;
    if (saved.accountId?.endsWith(`.${root}`) && !players.some(p => p.accountId === saved.accountId)) players.push(saved);
  }
  const holders = initial.members.filter(([, n]) => BigInt(n) > 0n).map(([a]) => a);
  const members = players.filter(p => holders.includes(p.accountId));
  assert(members.length >= Math.floor(holders.length / 2) + 1, 'BLOCKED: majority member keys are missing');
  const captain = JSON.parse(readFileSync(captainFile, 'utf8')) as { account_id: string; private_key: string };
  assert.equal(captain.account_id, hub); assert(initial.captain);
  assert.equal(KeyPair.fromString(captain.private_key as `ed25519:${string}`).getPublicKey().toString(), initial.captain.public_key, 'BLOCKED: captain key does not match live policy');
  for (const p of members) await viewAccessKey(p.accountId, KeyPair.fromString(p.key as `ed25519:${string}`).getPublicKey().toString());
  await viewAccessKey(hub, initial.captain.public_key);
  const existing = budget.evidence.full_run as Run | undefined;
  const handle = `qa${Date.now().toString(36)}`;
  const run: Run = existing ?? { handle, email: `${handle}@example.test`, done: [], started_at: new Date().toISOString(), initial_members: holders, initial_followers: initial.followers.map(([a]) => a) };
  budget.evidence.full_run = run;
  const sessionFile = join(ROOT, `.near-credentials/${run.handle}-e2e.json`);
  if (existsSync(sessionFile)) run.session = JSON.parse(readFileSync(sessionFile, 'utf8'));
  // Public evidence must never contain a session key.
  const save = () => { const { session: _session, ...safe } = run; budget.evidence.full_run = safe; budget.save(); };
  save();
  const mark = (step: string) => { if (!run.done.includes(step)) run.done.push(step); save(); console.log(`PASS: ${step}`); };
  class GuardedRelayer extends Relayer {
    override async createPlayer(id: string, key: string, gift: bigint) {
      await budget.guard('sign_in_create_account', root, 100n * TGAS, gift);
      const hash = await super.createPlayer(id, key, gift); await budget.record('sign_in_create_account', hash, root, gift); return hash;
    }
    override async relay(encoded: string) {
      const d = describeDelegate(decodeDelegate(encoded));
      const gas = d.calls.reduce((n, c) => n + c.gas, 5n * TGAS), deposit = d.calls.reduce((n, c) => n + c.deposit, 0n);
      const step = `${d.senderId.split('.')[0]}_${d.calls.map(c => c.methodName).join('_')}`;
      await budget.guard(step, root, gas, deposit, d.senderId);
      const result = await super.relay(encoded); await budget.record(step, result.hash, root, deposit); return result;
    }
  }
  const relayer = new GuardedRelayer({ hub, accountId: root, credentialsFile: rootFile });
  const store = new Store(join(ROOT, 'data', `e2e-${run.handle}`));
  for (const p of members) store.savePlayer({ accountId: p.accountId, handle: p.handle, publicKey: KeyPair.fromString(p.key as `ed25519:${string}`).getPublicKey().toString(), emailHash: createHash('sha256').update(p.accountId).digest('hex'), createdTx: '', createdAt: 0 });
  const app = createApp({ hub, relayer, store, giftYocto: 26n * ONE / 1000n });
  const record = app.routes['POST /api/record'];
  app.routes['POST /api/record'] = async (body, url) => { await budget.record('captain_trade', String(body.hash), hub); return record(body, url); };
  const backend = Number(process.env.KUMI_E2E_SERVER_PORT ?? 5357); assert(backend >= 5300 && backend <= 5999); await freePort(backend);
  await new Promise<void>(ok => app.server.listen(backend, '127.0.0.1', ok));
  try {
    await preview(backend, async base => withChromeLock(async () => {
      const browser = await chromium.launch({ channel: 'chrome', headless: true });
      try {
        const watch = (p: Page) => {
          p.setDefaultTimeout(90_000);
          p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
          p.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`); });
          p.on('requestfailed', r => { if (r.failure()?.errorText !== 'net::ERR_ABORTED') errors.push(`Request failed: ${new URL(r.url()).pathname}`); });
        };
        async function page(session?: Session, cap = false) {
          const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
          if (session) await c.addInitScript(({ s, key }) => { localStorage.setItem('kumi:session:v1', JSON.stringify(s)); if (key) localStorage.setItem('kumi:captain:v1:0', key); }, { s: session, key: cap ? captain.private_key : '' });
          const p = await c.newPage(); watch(p); return p;
        }
        async function both(p: Page, name: string) { for (const width of [1440, 375]) { await p.setViewportSize({ width, height: 900 }); if (name === 'member-board' && width === 375) await p.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Fund', exact: true }).click(); await shot(p, `r3-${name}`);
          const checks = (budget.evidence.browser_checks ?? []) as { screenshot: string; width: number; overflow: number }[];
          const screenshot = `r3-${name}-${width}.png`;
          budget.evidence.browser_checks = [...checks.filter(c => c.screenshot !== screenshot), { screenshot, width, overflow: 0 }]; save(); } await p.setViewportSize({ width: 1440, height: 900 }); }
        async function room(p: Page) { await p.goto(`${base}/room`); await p.getByRole('textbox', { name: 'Message', exact: true }).waitFor(); }
        async function send(p: Page, text: string) { await p.getByRole('textbox', { name: 'Message', exact: true }).fill(text); await p.getByRole('button', { name: 'Send', exact: true }).click(); }
        async function chain(predicate: (c: NonNullable<Awaited<ReturnType<typeof getCrew>>>) => boolean) { for (let i = 0; i < 50; i++) { const c = await getCrew(hub, 0); if (c && predicate(c)) return c; await pause(1500); } throw new Error('Live crew state did not reach the expected result'); }
        const p = await page(run.session);
        if (!run.done.includes('sign-in')) {
          await p.goto(base); await p.getByRole('button', { name: 'Sign in', exact: true }).first().click();
          await p.getByLabel('Email', { exact: true }).fill(run.email); await p.getByPlaceholder('mika', { exact: true }).fill(run.handle);
          const started = p.waitForResponse(r => r.url().endsWith('/api/auth/start') && r.request().method() === 'POST');
          await p.getByRole('button', { name: 'Send my code', exact: true }).click(); const auth = await (await started).json();
          assert(auth.previewCode, 'BLOCKED: email preview code unavailable'); await p.getByLabel('Code', { exact: true }).fill(auth.previewCode);
          await p.getByRole('button', { name: 'Verify and create my account', exact: true }).click(); await p.getByRole('heading', { name: "You're in", exact: true }).waitFor();
          run.session = await p.evaluate(() => JSON.parse(localStorage.getItem('kumi:session:v1')!));
          writeFileSync(sessionFile, JSON.stringify(run.session), { mode: 0o600 }); await both(p, 'sign-in'); mark('sign-in');
          await p.getByRole('button', { name: 'Go to the crew chat', exact: true }).click();
        }
        assert(run.session); const fresh = run.session.accountId;
        if (!run.done.includes('follow')) {
          await p.goto(`${base}/crew/0`); await p.getByLabel('Amount in NEAR', { exact: true }).fill('0.01'); await p.getByRole('button', { name: 'Follow', exact: true }).click();
          await chain(c => c.followers.some(([a, n]) => a === fresh && BigInt(n) > 0n)); await p.locator('.follow-card').getByText('Done in', { exact: false }).waitFor(); await both(p, 'follow'); mark('follow');
        }
        const a = await page(members.find(m => m.accountId !== initial.captain!.account_id)!), captainPlayer = members.find(m => m.accountId === initial.captain!.account_id); assert(captainPlayer, 'BLOCKED: captain account browser session missing');
        const b = await page(captainPlayer, true);
        const voterPages = [a, b];
        for (const member of members.filter(m => m.accountId !== captainPlayer.accountId && m.accountId !== members.find(m => m.accountId !== initial.captain!.account_id)!.accountId)) voterPages.push(await page(member));
        await room(a); await room(b);
        if (!run.done.includes('invite')) {
          if (!store.messages(0).some(m => m.kind === 'invite' && m.invite?.accountId === fresh)) await send(a, `/invite ${fresh}`);
          const card = a.getByRole('article', { name: `Invitation: ${fresh}`, exact: true }); await card.waitFor(); await both(a, 'invite-draft');
          const file = card.getByRole('button', { name: 'Put invitation to a vote', exact: true }); if (await file.count()) await file.click();
          await card.getByText(/Hub admission #/).waitFor();
          for (const voter of voterPages) {
            await room(voter); const card = voter.getByRole('article', { name: `Invitation: ${fresh}`, exact: true });
            const button = card.getByRole('button', { name: 'Vote yes', exact: true }); if (await button.count()) { await button.click();
              const ids = store.messages(0).find(m => m.kind === 'invite' && m.invite?.accountId === fresh)!.invite!;
              const who = await voter.evaluate(() => JSON.parse(localStorage.getItem('kumi:session:v1')!).accountId) as string;
              for (const id of [ids.roleProposalId!, ids.proposalId!]) { let recorded = false; for (let n = 0; n < 60; n++) { const value = await view<{ votes: Record<string, string> }>(initial.dao, 'get_proposal', { id }); if (value.votes[who] === 'Approve') { recorded = true; break; } await pause(1000); } assert(recorded, 'Invitation vote did not settle'); }
            }
          }
          await chain(c => c.allowed.includes(fresh)); const invites = await getInvites(hub, 0); const admitted = invites.find(i => i.account_id === fresh); assert.equal(admitted?.status, 'admitted'); run.inviteId = admitted.id;
          await room(a); await a.getByRole('article', { name: `Invitation: ${fresh}`, exact: true }).getByText('Admitted', { exact: true }).waitFor(); await both(a, 'invite-admitted'); mark('invite');
        }
        if (!run.done.includes('chip-in')) {
          await room(p); await p.getByRole('button', { name: 'Chip in to Night Owls', exact: true }).click();
          const dialog = p.getByRole('dialog'); await dialog.locator('input').fill('0.01'); await dialog.getByRole('button', { name: 'Chip in 0.01 NEAR', exact: true }).click();
          await dialog.getByText('Joined in', { exact: false }).waitFor(); await both(p, 'chip-in-receipt'); await p.getByRole('button', { name: 'Back to the chat', exact: true }).click();
          await chain(c => c.members.some(([a, n]) => a === fresh && BigInt(n) > 0n)); await p.getByRole('button', { name: 'Ragequit', exact: true }).waitFor(); await p.locator('.pane.fund .member').filter({ hasText: run.handle }).waitFor(); await both(p, 'member-board'); mark('chip-in');
        }
        if (run.done.includes('chip-in') && !run.done.includes('ragequit')) { await room(p); await p.getByRole('button', { name: 'Ragequit', exact: true }).waitFor(); await both(p, 'member-board'); }
        if (!run.done.includes('voted-trade')) {
          await room(a); let cardData = store.messages(0).findLast(m => m.kind === 'trade' && m.trade?.lane === 'vote');
          if (!cardData) { await send(a, '/sell SOL 5%'); for (let i = 0; i < 60 && !cardData; i++) { await pause(1000); cardData = store.messages(0).findLast(m => m.kind === 'trade' && m.trade?.lane === 'vote'); } }
          assert(cardData); assert(!cardData.trade?.error, 'Trade quote failed'); const id = cardData.id;
          const card = a.locator('article.trade').filter({ hasText: 'Trade proposal · crew vote' }).last();
          if (cardData.trade?.proposalId === undefined) await card.getByRole('button', { name: 'Put it to a vote', exact: false }).click();
          await card.getByText(/approvals needed/).waitFor();
          for (const voter of [...voterPages, p]) {
            await room(voter); const c = voter.locator('article.trade').filter({ hasText: 'Trade proposal · crew vote' }).last();
            await c.getByText(/approvals needed/).waitFor();
            const account = await voter.evaluate(() => JSON.parse(localStorage.getItem('kumi:session:v1')!).accountId) as string;
            const current = await view<{ status: string; votes: Record<string, string> }>(initial.dao, 'get_proposal', { id: store.messages(0).find(m => m.id === id)!.trade!.proposalId });
            if (current.status === 'InProgress' && !current.votes[account]) {
              await budget.guard('voted_trade_vote', root, 195n * TGAS);
              const button = c.getByRole('button', { name: 'Vote yes', exact: true }); await button.waitFor(); await button.click();
              let recorded = false;
              for (let n = 0; n < 60; n++) { const value = await view<{ votes: Record<string, string> }>(initial.dao, 'get_proposal', { id: store.messages(0).find(m => m.id === id)!.trade!.proposalId }); if (value.votes[account] === 'Approve') { recorded = true; break; } await pause(1000); }
              assert(recorded, 'Trade vote did not settle');
            }
          }
          cardData = store.messages(0).find(m => m.id === id); assert(cardData?.trade?.tradeId !== undefined); run.tradeId = cardData.trade.tradeId;
          assert.equal((await getTrades(hub, (await getCrew(hub, 0))!)).find(t => t.id === run.tradeId)?.status, 'executed'); await room(a); await a.locator('article.trade').filter({ hasText: 'Trade proposal · crew vote' }).last().getByText('Executed', { exact: true }).waitFor(); await both(a, 'voted-trade'); mark('voted-trade');
        }
        if (!run.done.includes('captain-trade')) {
          await room(b); let cardData = store.messages(0).findLast(m => m.kind === 'trade' && m.trade?.lane === 'captain');
          if (!cardData) { await send(b, '/captain sell SOL 5%'); for (let i = 0; i < 60 && !cardData; i++) { await pause(1000); cardData = store.messages(0).findLast(m => m.kind === 'trade' && m.trade?.lane === 'captain'); } }
          assert(cardData && !cardData.trade?.error); const card = b.locator('article.trade').filter({ hasText: 'Captain trade · no vote' }).last();
          await budget.guard('captain_trade', hub, 100n * TGAS); await card.getByRole('button', { name: 'Execute with the captain key', exact: true }).click(); await card.getByText('Executed', { exact: true }).waitFor();
          run.captainTradeId = store.messages(0).find(m => m.id === cardData!.id)?.trade?.tradeId; assert(run.captainTradeId !== undefined); await both(b, 'captain-trade'); mark('captain-trade');
        }
        if (!run.done.includes('ragequit')) {
          await room(p); const before = (await getCrew(hub, 0))!, shares = before.members.find(([a]) => a === fresh)?.[1]; assert(shares);
          const preview = ragequitPreview(before, BigInt(shares)); budget.evidence.exit_preview = preview; save();
          await p.getByRole('button', { name: 'Ragequit', exact: true }).click(); await both(p, 'ragequit-preview');
          await p.getByRole('button', { name: 'Ragequit on testnet, in kind', exact: true }).click(); await p.getByText('Exited in', { exact: false }).waitFor(); await both(p, 'ragequit-receipt'); await p.getByRole('button', { name: 'Done', exact: true }).click();
          await chain(c => !c.allowed.includes(fresh) && !c.members.some(([a]) => a === fresh));
          for (const token of await getAssets(hub)) {
            const amount = await view<string>(token.token, 'ft_balance_of', { account_id: fresh }); const owed = preview.tokens.find(t => t.symbol === token.symbol)?.amount ?? '0'; assert.equal(amount, String(owed), 'Token payout does not match exit preview');
          }
          mark('ragequit');
        }
        if (!run.done.includes('unfollow')) {
          await p.goto(`${base}/crew/0`); const exit = p.getByRole('button', { name: 'Exit the vault, exact share', exact: true }); await exit.click(); await chain(c => !c.followers.some(([a]) => a === fresh)); await exit.waitFor({ state: 'hidden' }); await both(p, 'vault-exit'); mark('unfollow');
        }
        const final = (await getCrew(hub, 0))!;
        assert.deepEqual(final.members.filter(([, n]) => BigInt(n) > 0n).map(([a]) => a).sort(), run.initial_members.toSorted());
        assert.deepEqual(final.followers.map(([a]) => a).sort(), run.initial_followers.toSorted());
        assert(!(await getPolicy(final.dao)).roles.some(r => typeof r.kind === 'object' && r.kind.Group?.includes(fresh)), 'Exited member retained DAO role');
        assert.deepEqual(errors, [], 'Browser console/network errors');
        budget.evidence.full_run_result = { status: 'PASS', spent_yocto: budget.fullSpent.toString(), finished_at: new Date().toISOString(), steps: run.done, fresh_account: fresh, trade_id: run.tradeId, captain_trade_id: run.captainTradeId, invite_id: run.inviteId, final_member_count: final.members.length, final_follower_count: final.followers.length };
        save(); console.log(`PASS: full flow; spend ${Number(budget.fullSpent) / 1e24} NEAR; total ${Number(budget.spent) / 1e24} NEAR`);
      } catch (error) { budget.evidence.full_run_result = { status: 'BLOCKED', reason: error instanceof Error ? error.message : 'Full browser run did not finish', spent_yocto: budget.fullSpent.toString(), steps: run.done }; save(); const pages = browser.contexts().flatMap(c => c.pages()); for (const [n, p] of pages.entries()) await p.screenshot({ path: join(SHOTS, `r3-full-failure-${n}.png`) }).catch(() => {}); throw error; } finally { await browser.close(); }
    }));
  } finally { app.server.closeAllConnections(); await new Promise<void>(ok => app.server.close(() => ok())); }
}
