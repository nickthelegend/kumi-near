import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { computePnl, formatNear, getAssets, getCrew, getMarks, getPolicy, getProposals, getReceipts, ragequitPreview, tally, view } from '@kumi/sdk';
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
              assert(text.includes(member.split('.')[0]));
              assert(text.includes(`Ragequit: ${formatNear(ragequitPreview(crew, BigInt(shares)).near, 8)} NEAR`), 'Exit differs from chain');
            }
            for (const proposal of proposals) {
              const count = tally(proposal, policy);
              assert(text.includes(`#${proposal.id} · ${proposal.status} · ${count.approve}/${count.needed} approvals`), 'Proposal count differs from chain');
            }
            if (crew.captain) assert(text.includes(`${crew.captain.max_bps / 100}%`), 'Captain limit differs');
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
  else throw new Error('BLOCKED: full browser flow is being added; use --read-only for the credential-free checks');
  console.log(`PASS: ${checks.length} browser states; no writes, no credentials, no console errors`);
} finally { mkdirSync(SHOTS, { recursive: true }); writeFileSync(join(SHOTS, 'r3-e2e-read-only.json'), JSON.stringify({ checks, errors }, null, 2)); }
