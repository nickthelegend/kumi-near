// Server-side storage: small JSON files under data/ (gitignored). Chat history, players, tx links.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TradeQuote } from '@kumi/sdk';

export type TxLink = { label: string; hash: string; account: string; at: number };
export type ChatMessage = {
  id: string; crewId: number; account: string; ts: number; text: string;
  kind: 'text' | 'trade' | 'invite' | 'system';
  /** ed25519 signature (base64) over the canonical chat payload, by `publicKey`. */
  sig?: string; publicKey?: string;
  invite?: { accountId: string; roleProposalId?: number; proposalId?: number; inviteId?: number };
  trade?: { side: 'buy' | 'sell'; asset: string; bps: number; lane: 'vote' | 'captain'; quote: TradeQuote; tradeId?: number; proposalId?: number; error?: string };
  txs: TxLink[];
};
export type Player = { accountId: string; handle: string; publicKey: string; emailHash: string; createdTx: string; createdAt: number };

export class Store {
  private dir: string;
  constructor(dir: string) { this.dir = dir; mkdirSync(dir, { recursive: true }); }
  private read<T>(name: string, fallback: T): T {
    try { return JSON.parse(readFileSync(join(this.dir, name), 'utf8')) as T; } catch { return fallback; }
  }
  private write(name: string, value: unknown) {
    const path = join(this.dir, name);
    writeFileSync(path + '.tmp', JSON.stringify(value, null, 1));
    renameSync(path + '.tmp', path);
  }
  messages(crewId: number): ChatMessage[] { return this.read<ChatMessage[]>(`chat-${crewId}.json`, []); }
  saveMessages(crewId: number, list: ChatMessage[]) { this.write(`chat-${crewId}.json`, list.slice(-500)); }
  players(): Record<string, Player> { return this.read<Record<string, Player>>('players.json', {}); }
  savePlayer(p: Player) { const all = this.players(); all[p.emailHash] = p; this.write('players.json', all); }
  playerByAccount(accountId: string): Player | undefined { return Object.values(this.players()).find(p => p.accountId === accountId); }
}
