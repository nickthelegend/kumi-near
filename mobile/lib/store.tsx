import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { connect, type ServerConfig } from './near';
import { IS_WEB, SLOT, createKey, loadWallet, saveAccount, type Account } from './wallet';

/**
 * App state: the on-device key and the NEAR account it signs for, onboarding, what this phone has read in each chat
 * (unread badges) and the transactions it signed (Wallet → Activity). Crew state itself is read from NEAR testnet.
 */
type Seen = Record<string, number>;
export type Activity = { hash: string; label: string; at: number };
type Ctx = {
  ready: boolean;
  server: ServerConfig | null;
  reconnect: () => Promise<void>;
  publicKey: string | null;
  account: Account | null;
  onboarded: boolean;
  seen: Seen;
  createKey: () => Promise<string>;
  setAccount: (a: Account) => Promise<void>;
  finishOnboarding: () => Promise<void>;
  markSeen: (chat: string, ts: number) => void;
  activity: Activity[];
  record: (txs: { hash: string; label: string }[]) => void;
  unread: number;
  setUnread: (n: number) => void;
};
const Store = createContext<Ctx | null>(null);
export const useApp = () => {
  const v = useContext(Store);
  if (!v) throw Error('useApp outside provider');
  return v;
};

const K = { onboarded: `kumi.near.onboarded${SLOT}`, seen: `kumi.near.seen.v1${SLOT}`, activity: `kumi.near.activity.v1${SLOT}` };
async function getItem(k: string) {
  if (IS_WEB) { try { return globalThis.localStorage?.getItem(k) ?? null; } catch { return null; } }
  return SecureStore.getItemAsync(k);
}
async function setItem(k: string, v: string) {
  if (IS_WEB) { try { globalThis.localStorage?.setItem(k, v); } catch { /* private mode */ } return; }
  await SecureStore.setItemAsync(k, v);
}

export const crewChat = (id: number) => `c-${id}`;

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [server, setServer] = useState<ServerConfig | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [account, setAcct] = useState<Account | null>(null);
  const [onboarded, setOnboarded] = useState(false);
  const [seen, setSeen] = useState<Seen>({});
  const [activity, setActivity] = useState<Activity[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    (async () => {
      setServer(await connect());
      const w = await loadWallet();
      setPublicKey(w.publicKey); setAcct(w.account);
      setOnboarded((await getItem(K.onboarded)) === '1');
      setSeen(JSON.parse((await getItem(K.seen)) ?? '{}'));
      setActivity(JSON.parse((await getItem(K.activity)) ?? '[]'));
      setReady(true);
    })().catch(() => setReady(true));
  }, []);

  const markSeen = useCallback((chat: string, ts: number) => {
    setSeen(s => {
      if ((s[chat] ?? 0) >= ts) return s;
      const next = { ...s, [chat]: ts };
      void setItem(K.seen, JSON.stringify(next));
      return next;
    });
  }, []);

  const record = useCallback((txs: { hash: string; label: string }[]) => {
    setActivity(list => {
      const next = [...txs.map(t => ({ hash: t.hash, label: t.label, at: Date.now() })).reverse(), ...list].slice(0, 60);
      void setItem(K.activity, JSON.stringify(next));
      return next;
    });
  }, []);

  const value: Ctx = {
    ready, server, publicKey, account, onboarded, seen, markSeen, activity, record, unread, setUnread,
    reconnect: async () => { setServer(await connect()); },
    createKey: async () => { const pk = await createKey(); setPublicKey(pk); return pk; },
    setAccount: async (a: Account) => { await saveAccount(a); setAcct(a); },
    finishOnboarding: async () => { await setItem(K.onboarded, '1'); setOnboarded(true); },
  };
  return <Store.Provider value={value}>{children}</Store.Provider>;
}
