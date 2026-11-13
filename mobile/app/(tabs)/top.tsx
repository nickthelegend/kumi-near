import { useMemo } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { computePnl, getReceipts, rankSeason, seasonRow, seasonStart } from '@kumi/sdk';
import { Text } from '../../components/T';
import { Screen } from '../../components/Screen';
import { LiveDot } from '../../components/Live';
import { Avatar, Card, Chip, CrewAvatar, Notice, Obj, Skeleton, st } from '../../components/ui';
import { HUB, nameOf, readCrew, cachedCrew, readHub, useLive } from '../../lib/near';
import { useApp } from '../../lib/store';
import { C, F, art } from '../../lib/theme';

/**
 * Top: this week's season (crews ranked by return minus half the max drawdown, from receipts only) and the crew's
 * callers: every executed pitch marked to the live pool price, credited to the member who pitched it.
 */
export default function Top() {
  const { account } = useApp();
  const me = account?.accountId ?? null;
  const season = useLive(async () => {
    const h = await readHub();
    const rows = await Promise.all(h.crews.map(async c => seasonRow(c, computePnl(await getReceipts(HUB, c), c, h.marks))));
    return rankSeason(rows);
  }, [], 15000);
  const crew = useLive(() => readCrew(0), [], 15000, cachedCrew(0));
  const callers = useMemo(() => {
    const d = crew.data;
    if (!d) return [];
    const by = new Map<string, { calls: number; wins: number; pnl: number }>();
    for (const t of d.trades) {
      if (t.status !== 'executed' || t.kind !== 'vote') continue;
      const a = d.assets.find(x => x.symbol === t.asset), m = d.marks.find(x => x.symbol === t.asset);
      if (!a || !m) continue;
      const px = Number(BigInt(m.near_reserve)) / Number(BigInt(m.token_reserve));
      // Buy: tokens received now worth vs NEAR paid. Sell: NEAR received vs tokens given, both at today's pool price.
      const pnl = t.side === 'buy' ? Number(BigInt(t.crew_out)) * px - Number(BigInt(t.crew_in)) : Number(BigInt(t.crew_out)) - Number(BigInt(t.crew_in)) * px;
      const row = by.get(t.proposer) ?? { calls: 0, wins: 0, pnl: 0 };
      row.calls++; if (pnl >= 0) row.wins++; row.pnl += pnl / 1e24;
      by.set(t.proposer, row);
    }
    return [...by.entries()].map(([who, r]) => ({ who, ...r })).sort((a, b) => b.pnl - a.pnl);
  }, [crew.data]);
  const start = seasonStart();

  return (
    <Screen tabs>
      <Text style={{ fontWeight: '800', fontSize: 30, color: C.ink, letterSpacing: -0.6 }}>Top</Text>
      <View style={{ borderRadius: 28, backgroundColor: C.plumEdge, paddingBottom: 7 }}>
        <View style={{ borderRadius: 28, backgroundColor: C.plum, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Obj name="crown" size={64} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.display, fontSize: 22, lineHeight: 27, color: '#fff' }}>Season of {start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>Return minus half the worst drawdown, rebuilt from the hub's receipts. Nobody can edit it.</Text>
          </View>
        </View>
      </View>

      {season.error && !season.data && <Notice error>{season.error}</Notice>}
      {!season.data ? <Skeleton rows={2} height={80} /> : (
        <Card pad={8}>
          {season.data.map((r, i) => (
            <View key={r.crewId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderTopWidth: i ? 1 : 0, borderColor: C.line }}>
              <Text style={{ fontFamily: F.display, fontSize: 22, color: i === 0 ? C.butterInk : C.ink3, width: 26 }}>{i + 1}</Text>
              <CrewAvatar id={`crew-${r.crewId}`} size={48} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', fontSize: 16.5, color: C.ink }}>{r.name}</Text>
                <Text style={{ fontSize: 12.5, color: C.ink2 }}>{r.members} members · {r.followers} followers · {r.trades} trades</Text>
                {r.verified && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}><LiveDot size={6} /><Text style={{ fontSize: 11.5, color: C.mintInk, fontWeight: '700' }}>verified from receipts</Text></View>}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontFamily: F.monoBold, fontSize: 17, color: r.returnPct >= 0 ? C.mintInk : C.pinkInk }}>{r.returnPct >= 0 ? '+' : ''}{r.returnPct.toFixed(2)}%</Text>
                <Text style={{ fontSize: 11.5, color: C.ink3 }}>max dd {r.maxDrawdownPct.toFixed(2)}%</Text>
              </View>
            </View>
          ))}
        </Card>
      )}

      <View style={st.between}><Text style={st.h2}>Night Owls callers</Text><Chip text="marked live" tone="mint" dot /></View>
      {!crew.data ? <Skeleton rows={3} height={64} /> : callers.length === 0 ? <Card pad={10}><Text style={st.body}>No voted trades yet.</Text></Card> : (
        <Card pad={8}>
          {callers.map((c, i) => (
            <View key={c.who} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderTopWidth: i ? 1 : 0, borderColor: C.line }}>
              <View><Avatar address={c.who} size={44} ring={c.who === me ? C.coral : undefined} />{i === 0 && <Image source={art.obj.crown} style={{ position: 'absolute', top: -14, left: 8, width: 28, height: 28 }} contentFit="contain" />}</View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', fontSize: 16, color: C.ink }}>{nameOf(c.who, me)}</Text>
                <Text style={{ fontSize: 12.5, color: C.ink2 }}>{c.calls} pitch{c.calls > 1 ? 'es' : ''} passed · {c.wins} in profit</Text>
              </View>
              <Text style={{ fontFamily: F.monoBold, fontSize: 15, color: c.pnl >= 0 ? C.mintInk : C.pinkInk }}>{c.pnl >= 0 ? '+' : ''}{c.pnl.toFixed(4)} Ⓝ</Text>
            </View>
          ))}
        </Card>
      )}
      <Text style={{ fontSize: 11.5, color: C.ink3, textAlign: 'center' }}>Each executed pitch is valued at today's pool price against what the crew paid.</Text>
    </Screen>
  );
}
