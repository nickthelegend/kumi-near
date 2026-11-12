import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { computePnl, formatNear, formatUnits, held, memberShare, getAssets, getCrew, getMarks, getPolicy, getProposals, getReceipts, ragequitPreview, tally, view } from '@kumi/sdk';
import evidence from '../deployments/testnet-2026-11-09.json' with { type: 'json' };
import { freePort, preview, SHOTS, withChromeLock } from './e2e-support.js';

const readonly = process.argv.includes('--read-only');
const checks: { step: string; width: number; overflow: number }[] = [];
const errors: string[] = [];
async function shot(p: Page, step: string) {
  const data = await p.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, text: document.body.innerText }));
  await p.screenshot({ path: join(SHOTS, `${step}-${p.viewportSize()!.width}.png`) });
  assert.equal(data.overflow, 0, `${step}: horizontal overflow`);
  assert(!/\b(?:undefined|NaN)\b|ActionError|Smart contract panicked/.test(data.text), `${step}: raw error/data`);
  checks.push({ step, width: p.viewportSize()!.width, overflow: data.overflow });
}
async function readOnly() {
  await freePort(5998);
  await preview(5998, async base => withChromeLock(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
      const rpc = `${base}/api/rpc`, hub = evidence.accounts.hub;
      const crew = await getCrew(hub, 0, rpc); assert(crew, 'Recorded crew missing');
      const assets = await getAssets(hub, rpc), marks = await getMarks(assets, rpc);
      const pnl = computePnl(await getReceipts(hub, crew, rpc), crew, marks); assert(pnl.verified, 'Receipt P&L does not verify');
      const policy = await getPolicy(crew.dao, rpc), last = await view<number>(crew.dao, 'get_last_proposal_id', {}, rpc);
      const proposals = await getProposals(crew.dao, Math.max(0, last - 12), Math.min(last, 12), rpc);
      for (const width of [1440, 375]) {
        const context = await browser.newContext({ viewport: { width, height: 900 } }); const p = await context.newPage(); p.setDefaultTimeout(30000);
        p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); p.on('pageerror', e => errors.push(e.message));
        p.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`); });
        p.on('requestfailed', r => { if (r.failure()?.errorText !== 'net::ERR_ABORTED') errors.push(`Request failed: ${new URL(r.url()).pathname}`); });
        for (const [name, path, ready] of [['landing', '/', '.l-float'], ['lobby', '/app', '.calls2'], ['room', '/room', '.pane.fund .member'], ['crew', '/crew/0', '.follow-card'], ['season', '/leaderboard', '.rank-card']] as const) {
          await p.goto(base + path); await p.locator(ready).first().waitFor({ state: 'visible' });
          if (name === 'room') {
            await p.getByRole('heading', { name: 'DAO proposals', exact: true }).waitFor();
            const fund = p.locator('.pane.fund');
            await p.waitForFunction(() => !document.querySelector('.pane.fund .skeleton'));
            const text = await fund.innerText();
            assert(text.includes('Chat and actions need'), 'Offline setup sentence missing from fund');
            assert(text.includes(pnl.navNear.toFixed(4)), 'NAV differs from chain');
            for (const [member, shares] of crew.members) {
              const row = fund.locator('.member').filter({ hasText: member.split('.')[0] });
              assert.equal(await row.count(), 1, 'Member row missing or duplicated');
              assert((await row.locator('.share').innerText()).includes(`${(memberShare(crew, member).bps / 100).toFixed(1)}%`), 'Member shares differ from chain');
              assert(text.includes(member.split('.')[0]));
              assert(text.includes(`Ragequit: ${formatNear(ragequitPreview(crew, BigInt(shares)).near, 8)} NEAR`), 'Exit differs from chain');
            }
            assert((await fund.locator('.holding').first().innerText()).includes(formatNear(crew.near, 4)), 'Native holding differs');
            for (const [n, asset] of assets.entries()) assert((await fund.locator('.holding').nth(n + 1).innerText()).includes(formatUnits(held(crew.tokens, asset.symbol), asset.decimals, Math.min(asset.decimals, 8))), 'Token holding differs');
            for (const proposal of proposals) {
              const count = tally(proposal, policy);
              assert(text.includes(`#${proposal.id} · ${proposal.status} · ${count.approve}/${count.needed} approvals`), 'Proposal count differs from chain');
            }
            if (crew.captain) {
              assert(text.includes(`${crew.captain.max_bps / 100}%`), 'Captain size limit differs');
              assert(text.includes(`${crew.captain.max_daily} a day, in ${crew.captain.assets.join(', ')}`), 'Captain daily/asset limits differ');
              assert(text.includes(`${crew.captain_trades_today} used today`), 'Captain usage differs');
            }
          }
          await shot(p, `r3-read-only-${name}`);
          if (name === 'room') {
            await p.locator('.pane.fund .member').last().scrollIntoViewIfNeeded(); await shot(p, 'r3-read-only-room-members');
            await p.getByRole('heading', { name: 'DAO proposals', exact: true }).scrollIntoViewIfNeeded(); await shot(p, 'r3-read-only-room-proposals');
          }
        }
        await context.close();
      }
      assert.deepEqual(errors, [], 'Browser console/network errors');
    } finally { await browser.close(); }
  }));
}
try {
  if (readonly) await readOnly();
  else await (await import('./e2e-full.js')).fullFlow(shot, errors);
  console.log(`PASS: ${checks.length} browser states; ${readonly ? 'no writes, no credentials, ' : ''}no console errors`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
} finally {
  mkdirSync(SHOTS, { recursive: true });
  const file = join(SHOTS, readonly ? 'r3-e2e-read-only.json' : 'r3-e2e-full.json');
  const previous = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const runs = [...(previous.runs ?? []), { at: new Date().toISOString(), checks, errors, passed: !process.exitCode }];
  writeFileSync(file, JSON.stringify({ checks, errors, runs }, null, 2));
}
