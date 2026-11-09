// A real MCP client over stdio against the live testnet hub. No stand-ins.
import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'node:path';

describe('kumi MCP over stdio', () => {
  it('lists tools, reads crews, and verifies P&L from receipts', async () => {
    const root = resolve(import.meta.dirname, '../../..');
    const transport = new StdioClientTransport({ command: resolve(root, 'node_modules/.bin/tsx'), args: [resolve(import.meta.dirname, '../src/main.ts')], cwd: root, stderr: 'ignore' });
    const client = new Client({ name: 'kumi-test', version: '0' });
    await client.connect(transport);
    const tools = (await client.listTools()).tools.map(t => t.name);
    expect(tools).toEqual(expect.arrayContaining(['list_crews', 'crew_pnl', 'season_leaderboard', 'quote_trade', 'crew_trades']));
    const crews = JSON.parse((await client.callTool({ name: 'list_crews', arguments: {} }) as { content: { text: string }[] }).content[0].text);
    expect(crews.crews.length).toBeGreaterThan(0);
    const pnl = JSON.parse((await client.callTool({ name: 'crew_pnl', arguments: { crew_id: crews.crews[0].id } }) as { content: { text: string }[] }).content[0].text);
    expect(pnl.verified).toBe(true);
    expect(pnl.receipts).toBeGreaterThan(0);
    const bad = await client.callTool({ name: 'quote_trade', arguments: { crew_id: 0, command: 'buy everything' } }) as { isError?: boolean };
    expect(bad.isError).toBe(true);
    await client.close();
  }, 90_000);
});
