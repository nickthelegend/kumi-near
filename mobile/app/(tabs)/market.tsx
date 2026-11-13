import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { amountOut, dryQuote, getReserves, intentsAssetFor, ONE_NEAR } from '@kumi/sdk';
import { Text } from '../../components/T';
import { Screen } from '../../components/Screen';
import { CountUp, LiveDot, Spark } from '../../components/Live';
import { Btn, Card, Chip, Notice, Skeleton, TokenLogo, TxLink, ago, st, tap } from '../../components/ui';
import { HUB, nameOf, near, readCrew, cachedCrew, units, useLive } from '../../lib/near';
import { useApp } from '../../lib/store';
import { C, F } from '../../lib/theme';

const SIZES = ['0.01', '0.05', '0.1', '0.5'];

/**
 * Market: the testnet pools the crew trades on (tSOL, tBTC), priced from their reserves; the price history the hub's
 * own receipts recorded; what a buy would get and its price impact; the crew's fills; a mainnet NEAR Intents reference.
 */
export default function Market() {
  const [sym, setSym] = useState<'SOL' | 'BTC'>('SOL');
  const { account } = useApp();
  const router = useRouter();
  const [w, setW] = useState(0);
  const crew = useLive(() => readCrew(0), [], 8000, cachedCrew(0));
  const asset = crew.data?.assets.find(a => a.symbol === sym);
  const pool = useLive(async () => (asset ? getReserves(asset.token) : null), [asset?.token], 4000);
  // A real mainnet 1Click dry quote for 1 NEAR -> the real asset (no funds move), refreshed once a minute.
  const ref = useLive(async () => {
    if (!asset) return null;
    const dest = asset.intents_asset || await intentsAssetFor(sym);
    const q = await dryQuote({ originAsset: 'nep141:wrap.near', destinationAsset: dest, amount: ONE_NEAR.toString(), confidentiality: 'public' });
    return Number((q as any).quote?.amountOutFormatted ?? 0);
  }, [asset?.token], 60_000);
  const dec = asset?.decimals ?? 8;
  const r = pool.data;
  const price = r ? (Number(BigInt(r.near)) / 1e24) / (Number(BigInt(r.token)) / 10 ** dec) : 0;
  const history = useMemo(() => {
    const out: { at: number; p: number }[] = [];
    for (const rc of crew.data?.receipts ?? []) {
      const m = rc.marks.find(x => x.symbol === sym);
      if (m) out.push({ at: Number(BigInt(rc.at) / 1_000_000n), p: (Number(BigInt(m.near_reserve)) / 1e24) / (Number(BigInt(m.token_reserve)) / 10 ** dec) });
      else if (rc.asset === sym && (rc.kind === 'trade' || rc.kind === 'captain_trade')) {
        const n = Number(BigInt(rc.near_out) || BigInt(rc.near_in)) / 1e24, t = Number(BigInt(rc.token_in) || BigInt(rc.token_out)) / 10 ** dec;
        if (n > 0 && t > 0) out.push({ at: Number(BigInt(rc.at) / 1_000_000n), p: n / t });
      }
    }
    if (price) out.push({ at: Date.now(), p: price });
    return out;
  }, [crew.data, sym, price]);
  const first = history[0]?.p;
  const change = first && price ? (price / first - 1) * 100 : 0;
  const fills = (crew.data?.trades ?? []).filter(t => t.asset === sym && t.status === 'executed').slice(-5).reverse();

  return (
    <Screen tabs>
      <Text style={{ fontWeight: '800', fontSize: 30, color: C.ink, letterSpacing: -0.6 }}>Market</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {(['SOL', 'BTC'] as const).map(x => {
          const on = x === sym;
          return (
            <Pressable key={x} testID={`market-${x}`} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => { tap(); setSym(x); }}
              style={{ flex: 1, borderRadius: 22, backgroundColor: on ? C.plumEdge : C.edge, paddingBottom: 4 }}>
              <View style={{ height: 52, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, backgroundColor: on ? C.plum : '#fff' }}>
                <TokenLogo sym={x} size={28} test />
                <Text style={{ fontWeight: '800', fontSize: 15.5, color: on ? '#fff' : C.ink }}>t{x} / NEAR</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {pool.error && !r && <Notice error>Could not read the t{sym} pool: {pool.error}</Notice>}
      {!r && !pool.error && <Skeleton rows={3} height={90} />}
      {r && (
        <Card pad={16}>
          <View style={{ gap: 8 }} onLayout={e => setW(e.nativeEvent.layout.width)}>
            <View style={st.between}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><LiveDot size={7} /><Text style={{ fontSize: 12.5, color: C.mintInk, fontWeight: '700' }}>Pool price · live</Text></View>
              <Chip text={`${change >= 0 ? '+' : ''}${change.toFixed(2)}% since first receipt`} tone={change >= 0 ? 'mint' : 'pink'} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              <CountUp value={price} format={n => n.toPrecision(6)} style={{ fontFamily: F.display, fontSize: 40, lineHeight: 46, color: C.ink }} />
              <Text style={{ fontFamily: F.displayBold, fontSize: 17, color: C.ink2, marginBottom: 7 }}>NEAR per t{sym}</Text>
            </View>
            <Spark data={history.map(h => h.p)} width={w} height={120} color={C.coral} />
            <View style={st.between}><Text style={{ fontSize: 11.5, color: C.ink3 }}>{history.length > 1 ? new Date(history[0]!.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</Text><Text style={{ fontSize: 11.5, color: C.ink3 }}>{history.length - 1} marks from hub receipts · now</Text></View>
            {ref.data ? <Text style={{ fontSize: 12.5, color: C.ink2 }}>Mainnet NEAR Intents reference: 1 NEAR ≈ <Text style={{ fontFamily: F.monoBold, color: C.ink }}>{ref.data.toPrecision(5)} {sym}</Text> (1Click dry quote)</Text> : null}
          </View>
        </Card>
      )}

      {r && (
        <Card pad={16}>
          <View style={{ gap: 10 }}>
            <View style={st.between}><Text style={st.h2}>If the crew buys</Text><Text style={{ fontSize: 12, color: C.ink3 }}>{r.fee_bps / 100}% pool fee</Text></View>
            {SIZES.map(s => {
              const inY = BigInt(Math.round(Number(s) * 1e6)) * 10n ** 18n;
              const out = amountOut(inY, BigInt(r.near), BigInt(r.token), BigInt(r.fee_bps));
              const fill = (Number(inY) / 1e24) / (Number(out) / 10 ** dec);
              const impact = price ? (fill / price - 1) * 100 : 0;
              return (
                <View key={s} style={[st.between, { paddingVertical: 6, borderTopWidth: 1, borderColor: C.line }]}>
                  <View style={st.row}><TokenLogo sym="NEAR" size={20} /><Text style={{ fontFamily: F.monoBold, fontSize: 14, color: C.ink }}>{s}</Text></View>
                  <Text style={{ fontFamily: F.mono, fontSize: 13.5, color: C.ink }}>→ {units(out, dec, 6)} t{sym}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 12.5, color: impact > 1 ? C.pinkInk : C.ink2, width: 62, textAlign: 'right' }}>{impact.toFixed(2)}%</Text>
                </View>
              );
            })}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Stat k="NEAR in pool" v={near(r.near, 3)} />
              <Stat k={`t${sym} in pool`} v={units(r.token, dec, 4)} />
            </View>
            {account && <Btn title={`Pitch a t${sym} buy to the crew`} tone="coral" icon="send" onPress={() => router.push({ pathname: '/chat/[id]', params: { id: 'c-0', draft: `/buy ${sym} 10%` } })} />}
          </View>
        </Card>
      )}

      <Card pad={16}>
        <View style={{ gap: 8 }}>
          <Text style={st.h2}>Crew fills in t{sym}</Text>
          {!crew.data ? <Skeleton rows={2} height={44} /> : fills.length === 0 ? <Text style={st.body}>No t{sym} trades yet. Pitch one in the crew chat.</Text> : fills.map(t => {
            const buy = t.side === 'buy';
            const n = Number(BigInt(buy ? t.crew_in : t.crew_out)) / 1e24, tok = Number(BigInt(buy ? t.crew_out : t.crew_in)) / 10 ** dec;
            return (
              <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderTopWidth: 1, borderColor: C.line }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: buy ? C.mintSoft : C.pinkSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontWeight: '800', fontSize: 12, color: buy ? C.mintInk : C.pinkInk }}>{buy ? 'BUY' : 'SELL'}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.monoBold, fontSize: 13.5, color: C.ink }}>{tok.toPrecision(5)} t{sym} · {n.toPrecision(4)} NEAR</Text>
                  <Text style={{ fontSize: 11.5, color: C.ink3 }}>#{t.id} · {t.kind === 'captain' ? 'captain lane' : `voted, pitched by ${nameOf(t.proposer)}`} · {t.executed_at ? `${ago(Number(BigInt(t.executed_at) / 1_000_000_000n))} ago` : ''}</Text>
                </View>
                <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ink2 }}>{tok > 0 ? (n / tok).toPrecision(4) : '–'}</Text>
              </View>
            );
          })}
        </View>
      </Card>
      <Text style={{ fontSize: 11.5, color: C.ink3, textAlign: 'center' }}>NEAR Intents has no testnet, so crew trades fill on Kumi's labelled t{sym} pool ({asset?.token ?? '…'}). Hub {HUB}.</Text>
    </Screen>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flex: 1, padding: 10, borderRadius: 16, backgroundColor: C.panel2, borderWidth: 1, borderColor: C.line }}>
      <Text style={{ fontSize: 11.5, color: C.ink3, fontWeight: '600' }}>{k}</Text>
      <Text style={{ fontFamily: F.monoBold, fontSize: 14, color: C.ink, marginTop: 2 }}>{v}</Text>
    </View>
  );
}
