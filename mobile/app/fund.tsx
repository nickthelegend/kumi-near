import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { crewNav, memberShare, parseNear, ragequitPreview, vaultNav, viewAccount } from '@kumi/sdk';
import { Text, TextInput } from '../components/T';
import { Screen, SheetHeader } from '../components/Screen';
import { inp } from '../components/Sheet';
import { CountUp, LiveDot, Spark } from '../components/Live';
import { Avatar, Btn, Card, Chip, Empty, Ic, Notice, Obj, Skeleton, TokenLogo, TxLink, st, tap, useBusy } from '../components/ui';
import { chipIn, follow, isHolder, nameOf, near, priceOf, ragequit, readCrew, cachedCrew, units, useLive } from '../lib/near';
import { useApp } from '../lib/store';
import { C, F, art } from '../lib/theme';

/** The crew's fund: NAV and return recomputed from on-chain receipts, holdings, members, your exact exit, chip in, leave. */
export default function Fund() {
  const { crew: crewParam, chip } = useLocalSearchParams<{ crew?: string; chip?: string }>();
  const crewId = Number(crewParam ?? 0) || 0;
  const { account, record } = useApp();
  const me = account?.accountId ?? null;
  const live = useLive(() => readCrew(crewId), [crewId], 8000, cachedCrew(crewId));
  const bal = useLive(async () => (me ? BigInt((await viewAccount(me)).amount) : 0n), [me], 8000);
  const [w, setW] = useState(0);
  const [amount, setAmount] = useState('0.05');
  const [leaving, setLeaving] = useState(false);
  const [done, setDone] = useState<{ title: string; txs: { hash: string; label: string }[] } | null>(null);
  const act = useBusy();
  const d = live.data;

  if (!d) return (
    <Screen><SheetHeader title="Crew fund" sub="Reading NEAR testnet…" />
      {live.error ? <Card pad={6}><Empty scene={art.scene.offline} alt="A worried penguin holding an unplugged cable" title="Can't reach NEAR testnet" body={live.error} action={<Btn title="Try again" tone="plum" size="sm" onPress={live.reload} />} /></Card> : <Skeleton rows={4} height={90} />}
    </Screen>
  );
  const { crew, pnl, assets, marks } = d;
  const nav = crewNav(crew, marks);
  const supply = BigInt(crew.supply);
  const holders = crew.members.filter(([, n]) => BigInt(n) > 0n).sort((a, b) => (BigInt(b[1]) > BigInt(a[1]) ? 1 : -1));
  const allowed = !!me && crew.allowed.includes(me);
  const holder = isHolder(crew, me);
  const mine = me ? memberShare(crew, me) : { shares: 0n, bps: 0 };
  const exit = ragequitPreview(crew, mine.shares);
  const myValue = supply > 0n ? nav * mine.shares / supply : 0n;
  const rows = [{ sym: 'NEAR', amt: near(crew.near, 4), val: BigInt(crew.near), test: false },
    ...crew.tokens.filter(([, v]) => BigInt(v) > 0n).map(([s, v]) => {
      const a = assets.find(x => x.symbol === s); const m = marks.find(x => x.symbol === s);
      const val = m ? BigInt(v) * BigInt(m.near_reserve) / BigInt(m.token_reserve) : 0n;
      return { sym: s, amt: units(v, a?.decimals ?? 8, 6), val, test: true };
    })];
  const up = pnl.returnPct >= 0;
  const yocto = (() => { try { return parseNear(amount); } catch { return 0n; } })();

  return (
    <Screen>
      <SheetHeader title={crew.name} sub="The crew's fund, read from NEAR testnet" />

      <View style={{ borderRadius: 28, backgroundColor: C.plumEdge, paddingBottom: 7 }}>
        <View style={{ borderRadius: 28, backgroundColor: C.plum, padding: 18, gap: 6, overflow: 'hidden' }} onLayout={e => setW(e.nativeEvent.layout.width - 36)}>
          <View style={st.between}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><LiveDot size={7} /><Text style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.75)', fontWeight: '700' }}>Fund value · live</Text></View>
            <Chip text={`${up ? '+' : ''}${pnl.returnPct.toFixed(2)}%`} tone={up ? 'mint' : 'pink'} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <CountUp value={Number(nav / 10n ** 18n) / 1e6} format={n => n.toFixed(4)} style={{ fontFamily: F.display, fontSize: 44, lineHeight: 50, color: '#fff' }} />
            <Text style={{ fontFamily: F.displayBold, fontSize: 20, color: C.butter, marginBottom: 8 }}>NEAR</Text>
          </View>
          <Spark data={pnl.points.map(p => p.pps)} width={w} height={70} color={C.butter} />
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{pnl.verified ? `Recomputed from ${d.receipts.length} on-chain receipts · matches live state` : pnl.verifyNote}</Text>
        </View>
      </View>

      {done && (
        <Card pad={14}><View style={{ gap: 8, alignItems: 'center' }}>
          <Obj name="success" size={72} />
          <Text style={st.h2}>{done.title}</Text>
          {done.txs.map(t => <View key={t.hash} style={[st.between, { alignSelf: 'stretch' }]}><Text style={{ fontSize: 13.5, color: C.ink }}>{t.label}</Text><TxLink hash={t.hash} /></View>)}
        </View></Card>
      )}

      {holder && (
        <Card pad={16}>
          <View style={{ gap: 10 }}>
            <View style={st.between}><Text style={st.h2}>Your position</Text><Chip text={`${(mine.bps / 100).toFixed(1)}% of shares`} tone="butter" /></View>
            <Text style={{ fontFamily: F.monoBold, fontSize: 24, color: C.ink }}>{near(myValue, 4)} <Text style={{ fontSize: 14, color: C.ink2 }}>NEAR</Text></Text>
            <View style={{ padding: 12, borderRadius: 16, backgroundColor: C.pinkSoft, gap: 6 }}>
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.pinkInk }}>If you leave now, you get exactly</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                <View style={st.row}><TokenLogo sym="NEAR" size={20} /><Text style={{ fontFamily: F.monoBold, fontSize: 14, color: C.ink }}>{near(exit.near, 4)} NEAR</Text></View>
                {exit.tokens.map(t => <View key={t.symbol} style={st.row}><TokenLogo sym={t.symbol} size={20} test /><Text style={{ fontFamily: F.monoBold, fontSize: 14, color: C.ink }}>{units(t.amount, assets.find(a => a.symbol === t.symbol)?.decimals ?? 8, 6)} t{t.symbol}</Text></View>)}
              </View>
            </View>
            {!leaving ? <Btn testID="leave" title="Leave with my share" tone="pink" icon="exit" onPress={() => setLeaving(true)} /> : (
              <View style={{ gap: 8 }}>
                <View style={st.row}><Image source={art.leave} style={{ width: 64, height: 64, borderRadius: 14 }} contentFit="cover" /><Text style={{ flex: 1, fontSize: 13.5, color: C.ink2, lineHeight: 19 }}>Ragequit pays your exact share in kind, removes your vote from the crew's DAO, and needs no one's approval.</Text></View>
                {act.error && <Notice error>{act.error}</Notice>}
                <Btn testID="confirm-leave" title={act.busy ? `${act.busy}…` : 'Leave and take my share'} tone="pink" size="lg" busy={!!act.busy}
                  onPress={() => act.run('Signing on this phone', async step => { const txs = await ragequit(account!, crew, mine.shares, assets, step); record(txs); setDone({ title: 'You left with your share', txs }); setLeaving(false); live.reload(); bal.reload(); })} />
                <Btn title="Stay" tone="ghost" onPress={() => setLeaving(false)} />
              </View>
            )}
          </View>
        </Card>
      )}

      {allowed && !leaving && (
        <Card pad={16}>
          <View style={{ gap: 12 }}>
            <View style={st.row}><Obj name="coins" size={52} /><View style={{ flex: 1 }}><Text style={st.h2}>{holder ? 'Add to your stake' : 'Chip in'}</Text><Text style={{ fontSize: 13.5, color: C.ink2 }}>Shares are minted at today's fund value. Your wallet: {bal.data !== undefined ? `${near(bal.data, 4)} NEAR` : '…'}</Text></View></View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {['0.02', '0.05', '0.1'].map(a => <Pressable key={a} onPress={() => { tap(); setAmount(a); }} style={{ flex: 1, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: amount === a ? C.butter : '#fff', borderWidth: 2, borderColor: amount === a ? C.butterEdge : C.edge }}><Text style={{ fontFamily: F.monoBold, fontSize: 14, color: C.ink }}>{a}</Text></Pressable>)}
            </View>
            <TextInput testID="chip-amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={inp} />
            {act.error && <Notice error>{act.error}</Notice>}
            <Btn testID="confirm-chip" title={act.busy ? `${act.busy}…` : `Chip in ${amount} NEAR`} tone="butter" size="lg" icon="coin" busy={!!act.busy} disabled={yocto <= 0n}
              onPress={() => act.run('Signing on this phone', async () => { const r = await chipIn(account!, crewId, yocto); const txs = [{ hash: r.hash, label: `Chip in ${amount} NEAR` }]; record(txs); setDone({ title: 'You chipped in', txs }); live.reload(); bal.reload(); })} />
            {chip === '1' && !holder && <Text style={{ fontSize: 12.5, color: C.ink3, textAlign: 'center' }}>Minimum 0.01 NEAR, paid from your own account.</Text>}
          </View>
        </Card>
      )}

      <Card pad={16}>
        <View style={{ gap: 10 }}>
          <Text style={st.h2}>Holdings</Text>
          {rows.map(r => (
            <View key={r.sym} style={{ gap: 6 }}>
              <View style={st.between}>
                <View style={st.row}><TokenLogo sym={r.sym} size={30} test={r.test} /><View><Text style={{ fontWeight: '800', fontSize: 15.5, color: C.ink }}>{r.test ? `t${r.sym}` : r.sym}</Text><Text style={{ fontSize: 12, color: C.ink3 }}>{r.test ? `${priceOf(marks.find(m => m.symbol === r.sym), assets.find(a => a.symbol === r.sym)?.decimals ?? 8).toPrecision(5)} NEAR each · pool mark` : 'cash'}</Text></View></View>
                <View style={{ alignItems: 'flex-end' }}><Text style={{ fontFamily: F.monoBold, fontSize: 14, color: C.ink }}>{r.amt}</Text><Text style={{ fontSize: 12, color: C.ink3 }}>{near(r.val, 4)} NEAR</Text></View>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: C.panel3 }}><View style={{ width: `${nav > 0n ? Number(r.val * 1000n / nav) / 10 : 0}%`, height: '100%', borderRadius: 3, backgroundColor: r.sym === 'NEAR' ? C.mint : r.sym === 'SOL' ? C.coral : C.butter }} /></View>
            </View>
          ))}
        </View>
      </Card>

      <Card pad={16}>
        <View style={{ gap: 10 }}>
          <View style={st.between}><Text style={st.h2}>Members</Text><Text style={{ fontSize: 12.5, color: C.ink3 }}>one vote each · majority passes</Text></View>
          {holders.map(([a, n]) => {
            const pct = supply > 0n ? Number(BigInt(n) * 1000n / supply) / 10 : 0;
            return (
              <View key={a} style={st.row}>
                <Avatar address={a} size={36} ring={a === me ? C.coral : undefined} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={st.between}><Text style={{ fontWeight: '700', fontSize: 14.5, color: C.ink }}>{nameOf(a, me)}{crew.captain?.account_id === a ? '  · captain' : ''}</Text><Text style={{ fontFamily: F.monoBold, fontSize: 13, color: C.ink }}>{pct.toFixed(1)}%</Text></View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: C.panel3 }}><View style={{ width: `${pct}%`, height: '100%', borderRadius: 3, backgroundColor: a === me ? C.coral : C.plum3 }} /></View>
                </View>
              </View>
            );
          })}
        </View>
      </Card>

      <Card pad={16}>
        <View style={{ gap: 10 }}>
          <View style={st.row}><Obj name="rocket" size={48} /><View style={{ flex: 1 }}><Text style={st.h2}>Follower vault</Text><Text style={{ fontSize: 13, color: C.ink2 }}>Anyone can mirror the crew. Every trade fills the vault in the same swap; a {crew.vault_fee_bps / 100}% fee above the high-water mark goes to the crew.</Text></View></View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Stat k="Vault (NEAR)" v={near(vaultNav(crew, marks), 4)} />
            <Stat k="Followers" v={String(crew.followers.length)} />
            <Stat k="Fees (NEAR)" v={near(crew.vault_fees_paid, 4)} />
          </View>
          {account && !holder && <Btn title="Follow with 0.02 NEAR" tone="mint" icon="plus" busy={act.busy === 'Following'} onPress={() => act.run('Following', async () => { const r = await follow(account, crewId, parseNear('0.02')); const txs = [{ hash: r.hash, label: 'Follow 0.02 NEAR' }]; record(txs); setDone({ title: 'Following the crew', txs }); live.reload(); })} />}
        </View>
      </Card>

      {crew.captain && (
        <Card pad={16}>
          <View style={st.row}><Obj name="captain" size={48} /><View style={{ flex: 1 }}><Text style={st.h2}>Captain lane</Text><Text style={{ fontSize: 13, color: C.ink2 }}>{nameOf(crew.captain.account_id, me)} may trade up to {crew.captain.max_bps / 100}% at a time, {crew.captain.max_daily} a day, without a vote: a function-call key the crew voted onto the hub.</Text></View></View>
        </Card>
      )}
      <Text style={{ fontSize: 11.5, color: C.ink3, textAlign: 'center' }}>NEAR testnet · {crew.dao} · tSOL/tBTC fill on Kumi's labelled test pools</Text>
    </Screen>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flex: 1, padding: 10, borderRadius: 16, backgroundColor: C.panel2, borderWidth: 1, borderColor: C.line }}>
      <Text style={{ fontSize: 11.5, color: C.ink3, fontWeight: '600' }}>{k}</Text>
      <Text style={{ fontFamily: F.monoBold, fontSize: 13.5, color: C.ink, marginTop: 2 }} numberOfLines={1}>{v}</Text>
    </View>
  );
}
