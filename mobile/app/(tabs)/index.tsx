import { useEffect, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { crewNav, computePnl, getReceipts, type Receipt } from '@kumi/sdk';
import { Text } from '../../components/T';
import { Screen } from '../../components/Screen';
import { LiveDot } from '../../components/Live';
import { Avatar, Brand, Btn, Card, Chip, CrewAvatar, Empty, Ic, Notice, Skeleton, TokenLogo, TxLink, ago, st, tap } from '../../components/ui';
import { HUB, api, isHolder, nameOf, near, readHub, useLive, type ChatMessage } from '../../lib/near';
import { crewChat, useApp } from '../../lib/store';
import { C, F, TONE, art, crewTone } from '../../lib/theme';

const KIND: Record<Receipt['kind'], [string, string, keyof typeof TONE]> = {
  join: ['chipped in', 'coin', 'butter'], ragequit: ['left with their share', 'exit', 'pink'], trade: ['crew trade filled', 'bolt', 'coral'],
  captain_trade: ['captain trade filled', 'bolt', 'coral'], follow: ['followed the crew', 'plus', 'mint'], unfollow: ['left the vault', 'exit', 'pink'], fee: ['fee to the crew', 'coin', 'butter'],
};

/** Chats: your crews (with the latest message and live fund value), every crew on the hub, and the hub's live receipts. */
export default function Chats() {
  const { account, seen, setUnread, server } = useApp();
  const me = account?.accountId ?? null;
  const router = useRouter();
  const hub = useLive(async () => {
    const h = await readHub();
    const receipts = await Promise.all(h.crews.map(c => getReceipts(HUB, c)));
    const chats = await Promise.all(h.crews.map(c => api<ChatMessage[]>(`/api/messages?crew=${c.id}`).catch(() => [] as ChatMessage[])));
    const last = chats.map(l => l.filter(m => m.kind !== 'system').slice(-1)[0] ?? null);
    const unread = chats.map((l, i) => l.filter(m => m.ts > (seen[crewChat(h.crews[i]!.id)] ?? 0) && m.account !== me).length);
    return { ...h, receipts, last, unread };
  }, [me, seen], 6000);
  const d = hub.data;
  const rows = useMemo(() => (d ? d.crews.map((c, i) => ({ c, pnl: computePnl(d.receipts[i]!, c, d.marks), last: d.last[i], unread: d.unread[i] ?? 0, mine: !!me && c.allowed.includes(me) })) : []), [d, me]);
  const mine = rows.filter(r => r.mine);
  const others = rows.filter(r => !r.mine);
  const total = mine.reduce((s, r) => s + r.unread, 0);
  useEffect(() => { setUnread(total); }, [total]);
  const feed = useMemo(() => (d ? d.crews.flatMap((c, i) => d.receipts[i]!.map(r => ({ r, c }))).sort((a, b) => Number(BigInt(b.r.at) - BigInt(a.r.at))).slice(0, 6) : []), [d]);

  return (
    <Screen tabs>
      <View style={st.between}>
        <Brand size={30} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Scan a join code" testID="scan" onPress={() => { tap(); router.push('/scan'); }}
            style={{ height: 42, paddingHorizontal: 14, borderRadius: 21, backgroundColor: '#fff', borderWidth: 2, borderColor: C.edge, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ic name="qr" size={16} color={C.plum} /><Text style={{ fontWeight: '700', fontSize: 14, color: C.plum }}>Scan</Text>
          </Pressable>
          {me && <Pressable accessibilityRole="button" accessibilityLabel="Your wallet" onPress={() => router.push('/wallet')}><Avatar address={me} size={42} ring="#fff" /></Pressable>}
        </View>
      </View>

      <View style={{ gap: 2 }}>
        <Text style={{ fontWeight: '800', fontSize: 30, lineHeight: 36, color: C.ink, letterSpacing: -0.6 }}>Your crews</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><LiveDot on={!!d} size={7} /><Text style={{ fontSize: 13, color: C.ink2 }}>{server ? 'NEAR testnet · chat server live' : 'NEAR testnet · chat server offline'}</Text></View>
      </View>

      {hub.error && !d && <Card pad={6}><Empty scene={art.scene.offline} alt="A worried penguin holding an unplugged cable" title="Can't reach NEAR testnet" body={hub.error} action={<Btn title="Try again" tone="plum" size="sm" onPress={hub.reload} />} /></Card>}
      {!d && !hub.error && <Skeleton rows={3} height={76} />}

      {d && (
        <Card pad={6}>
          {mine.length === 0 ? (
            <Empty scene={art.scene.joinCrew} alt="A frog and a fox welcoming a bunny into a chat bubble" title="No crew yet" body="Crews are invite-only. Show a member your join code; they vote you in." action={<Btn title="Show my join code" tone="plum" size="sm" icon="qr" onPress={() => router.push({ pathname: '/invite', params: { crew: '0', name: rows[0]?.c.name ?? '' } })} />} />
          ) : mine.map((r, i) => (
            <Pressable key={r.c.id} testID={`chat-${crewChat(r.c.id)}`} accessibilityRole="button" accessibilityLabel={`${r.c.name}${r.unread ? `, ${r.unread} unread` : ''}`} onPress={() => { tap(); router.push(`/chat/${crewChat(r.c.id)}`); }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 20, backgroundColor: pressed ? TONE[crewTone(`crew-${r.c.id}`)].soft : 'transparent', borderTopWidth: i ? 1 : 0, borderColor: C.line })}>
              <CrewAvatar id={`crew-${r.c.id}`} size={54} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text numberOfLines={1} style={{ fontWeight: '800', fontSize: 17, color: C.ink, flexShrink: 1 }}>{r.c.name}</Text>
                  <Chip text={isHolder(r.c, me) ? 'member' : 'invited'} tone={isHolder(r.c, me) ? 'plum' : 'mint'} style={{ height: 20, paddingHorizontal: 7 }} textStyle={{ fontSize: 10.5 }} />
                </View>
                <Text numberOfLines={1} style={{ fontSize: 13.5, color: r.unread ? C.ink : C.ink2, fontWeight: r.unread ? '600' : '400', marginTop: 1 }}>{r.last ? `${nameOf(r.last.account, me)}: ${r.last.kind === 'trade' ? `pitched ${r.last.trade?.side} ${r.last.trade?.asset} ${(r.last.trade?.bps ?? 0) / 100}%` : r.last.kind === 'invite' ? `invited ${nameOf(r.last.invite?.accountId, me)}` : r.last.text}` : 'No messages yet'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 5 }}>
                <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ink3 }}>{r.last ? ago(r.last.ts / 1000) : ''}</Text>
                {r.unread > 0 ? <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: C.coral, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 11.5, fontWeight: '800', color: '#fff' }}>{r.unread}</Text></View>
                  : <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ink2 }}>{near(crewNav(r.c, d.marks), 3)} Ⓝ</Text>}
              </View>
            </Pressable>
          ))}
        </Card>
      )}

      {d && others.length > 0 && (
        <View style={{ gap: 10 }}>
          <Text style={st.h2}>Crews on Kumi</Text>
          {others.map(r => (
            <Card key={r.c.id} pad={14}>
              <Pressable onPress={() => router.push(`/chat/${crewChat(r.c.id)}`)} style={{ gap: 10 }} accessibilityRole="button" accessibilityLabel={`Open ${r.c.name}`}>
                <View style={st.row}>
                  <CrewAvatar id={`crew-${r.c.id}`} size={50} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '800', fontSize: 17, color: C.ink }}>{r.c.name}</Text>
                    <Text style={{ fontSize: 13, color: C.ink2 }}>{r.c.members.filter(([, n]) => BigInt(n) > 0n).length} members · {r.c.followers.length} followers · invite-only</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontFamily: F.monoBold, fontSize: 15, color: r.pnl.returnPct >= 0 ? C.mintInk : C.pinkInk }}>{r.pnl.returnPct >= 0 ? '+' : ''}{r.pnl.returnPct.toFixed(2)}%</Text>
                    <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ink2 }}>{near(crewNav(r.c, d.marks), 3)} NEAR</Text>
                  </View>
                </View>
              </Pressable>
            </Card>
          ))}
        </View>
      )}

      {d && feed.length > 0 && (
        <Card pad={14}>
          <View style={[st.between, { marginBottom: 6 }]}><Text style={st.h2}>On-chain now</Text><View style={st.row}><LiveDot size={7} /><Text style={{ fontSize: 12, color: C.mintInk, fontWeight: '700' }}>hub receipts</Text></View></View>
          {feed.map(({ r, c }) => {
            const [label, icon, tone] = KIND[r.kind];
            return (
              <View key={`${c.id}-${r.seq}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderColor: C.line }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: TONE[tone].base, alignItems: 'center', justifyContent: 'center' }}><Ic name={icon} size={15} color={C.plum2} /></View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 14, color: C.ink }}><Text style={{ fontWeight: '800' }}>{r.kind.includes('trade') ? c.name : nameOf(r.account_id, me)}</Text> {label}</Text>
                  <Text style={{ fontSize: 11.5, color: C.ink3 }}>{r.asset ? `${r.asset} · ` : ''}{near(BigInt(r.near_in) > 0n ? r.near_in : r.near_out, 4)} NEAR · {ago(Number(BigInt(r.at) / 1_000_000_000n))} ago</Text>
                </View>
                {r.asset ? <TokenLogo sym={r.asset} size={24} test /> : <TokenLogo sym="NEAR" size={24} />}
              </View>
            );
          })}
        </Card>
      )}
      {!server && <Notice>Chat, sign-up and votes need the Kumi server (`pnpm run server`). The fund reads straight from NEAR.</Notice>}
    </Screen>
  );
}
