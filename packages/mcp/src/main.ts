#!/usr/bin/env node
// Kumi MCP server: lets an agent read crews, verify P&L from on-chain receipts and price a trade.
// Read-only: it never signs. KUMI_HUB selects the hub (defaults to the recorded testnet deployment).
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  computePnl, getAssets, getCrew, getMarks, getReceipts, getTrades, listCrews, parseTradeCommand, quoteTrade, rankSeason, seasonRow, crewNav, formatNear,
} from '@kumi/sdk';

function defaultHub(): string {
  try { return JSON.parse(readFileSync(new URL('../../../deployments/testnet-2026-11-09.json', import.meta.url), 'utf8')).accounts.hub; }
  catch { return ''; }
}
export const HUB = process.env.KUMI_HUB || defaultHub();
const text = (v: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v, null, 2) }] });
const fail = (e: unknown) => ({ isError: true, content: [{ type: 'text' as const, text: String(e instanceof Error ? e.message : e) }] });
const need = () => { if (!HUB) throw new Error('Setup required: KUMI_HUB'); return HUB; };

export function buildServer() {
  const server = new McpServer({ name: 'kumi', version: '0.1.0' });

  server.tool('list_crews', 'List every crew on the Kumi hub (NEAR testnet) with NAV marked at on-chain pool prices', {}, async () => {
    try {
      const hub = need();
      const [crews, assets] = await Promise.all([listCrews(hub), getAssets(hub)]);
      const marks = await getMarks(assets);
      return text({ hub, network: 'testnet', crews: crews.map(c => ({ id: c.id, name: c.name, dao: c.dao, members: c.members.length, followers: c.followers.length,
        nav_near: formatNear(crewNav(c, marks), 6), captain: c.captain?.account_id ?? null, trades: c.trade_count })) });
    } catch (e) { return fail(e); }
  });

  server.tool('crew_pnl', 'Recompute a crew\'s P&L only from its on-chain receipts and check it against live state', { crew_id: z.number().int().min(0) }, async ({ crew_id }) => {
    try {
      const hub = need();
      const crew = await getCrew(hub, crew_id);
      if (!crew) throw new Error(`No crew ${crew_id} on ${hub}`);
      const [receipts, assets] = await Promise.all([getReceipts(hub, crew), getAssets(hub)]);
      const pnl = computePnl(receipts, crew, await getMarks(assets));
      return text({ crew: crew.name, return_pct: pnl.returnPct, max_drawdown_pct: pnl.maxDrawdownPct, score: pnl.score, nav_near: pnl.navNear,
        price_per_share: pnl.pps, verified: pnl.verified, note: pnl.verifyNote, receipts: receipts.length, season: seasonRow(crew, pnl) });
    } catch (e) { return fail(e); }
  });

  server.tool('season_leaderboard', 'This week\'s crew ranking by drawdown-adjusted return, recomputed from receipts', {}, async () => {
    try {
      const hub = need();
      const [crews, assets] = await Promise.all([listCrews(hub), getAssets(hub)]);
      const marks = await getMarks(assets);
      const rows = await Promise.all(crews.map(async c => seasonRow(c, computePnl(await getReceipts(hub, c), c, marks))));
      return text(rankSeason(rows));
    } catch (e) { return fail(e); }
  });

  server.tool('quote_trade', 'Price a chat command like "/buy SOL 20%" for a crew: the testnet pool quote plus a mainnet 1Click dry quote (no funds move)',
    { crew_id: z.number().int().min(0), command: z.string().min(4) }, async ({ crew_id, command }) => {
      try {
        const hub = need();
        const cmd = parseTradeCommand(command);
        if (!cmd) throw new Error('Use /buy SOL 20% or /sell SOL 50%');
        const crew = await getCrew(hub, crew_id);
        if (!crew) throw new Error(`No crew ${crew_id}`);
        return text(await quoteTrade(hub, crew, await getAssets(hub), cmd.side, cmd.asset, cmd.bps, { mainnetAccount: process.env.NEAR_MAINNET_ACCOUNT, jwt: process.env.ONECLICK_JWT }));
      } catch (e) { return fail(e); }
    });

  server.tool('crew_trades', 'Every trade a crew filed, with status, DAO proposal id, and the crew and follower fills', { crew_id: z.number().int().min(0) }, async ({ crew_id }) => {
    try {
      const hub = need();
      const crew = await getCrew(hub, crew_id);
      if (!crew) throw new Error(`No crew ${crew_id}`);
      return text(await getTrades(hub, crew));
    } catch (e) { return fail(e); }
  });
  return server;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  await buildServer().connect(new StdioServerTransport());
}
