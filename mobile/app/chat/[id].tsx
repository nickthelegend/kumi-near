import { useEffect, useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { parseInviteCommand, parseTradeCommand, type Proposal } from '@kumi/sdk';
import { Text, TextInput } from '../../components/T';
import { Backdrop } from '../../components/Screen';
import { Bubble, EventPill, InviteCard, TradeCard } from '../../components/Message';
import { CountUp, LiveDot } from '../../components/Live';
import { Btn, CrewAvatar, Empty, Ic, Notice, Skeleton, TxLink, st, tap, useBusy } from '../../components/ui';
import { fileInvite, fileTrade, isHolder, readCrew, cachedCrew, readProposals, signedChat, useChat, useLive, vote, type ChatMessage } from '../../lib/near';
import { crewChat, useApp } from '../../lib/store';
import { C, F, art } from '../../lib/theme';

const HINTS: [string, 'coral' | 'pink' | 'butter' | 'mint'][] = [['/buy SOL 10%', 'coral'], ['/buy BTC 5%', 'butter'], ['/sell SOL 50%', 'pink'], ['/invite ', 'mint']];

/** The crew room: the signed chat (server WebSocket), trade and invite cards with live Sputnik votes, all on NEAR testnet. */
export default function ChatRoom() {
  const { id, draft } = useLocalSearchParams<{ id: string; draft?: string }>();
  const crewId = Number(String(id ?? 'c-0').replace(/^c-/, '')) || 0;
  const chat = crewChat(crewId);
  const { account, markSeen, record } = useApp();
  const me = account?.accountId ?? null;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const act = useBusy();
  const [cardBusy, setCardBusy] = useState<{ id: string; what: string } | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [text, setText] = useState(typeof draft === 'string' ? draft : '');
  const [lastTxs, setLastTxs] = useState<{ hash: string; label: string }[]>([]);
  const room = useChat(crewId);
  const live = useLive(() => readCrew(crewId), [crewId], 7000, cachedCrew(crewId));
  const st8 = live.data;
  const crew = st8?.crew;

  const ids = useMemo(() => room.messages.flatMap(m => [m.trade?.proposalId, m.invite?.roleProposalId, m.invite?.proposalId]).filter((x): x is number => typeof x === 'number'), [room.messages]);
  const props = useLive(async () => (crew ? readProposals(crew.dao, ids) : {}), [crew?.dao, ids.join(',')], 3500);
  // A card update (someone's vote landed) re-reads the DAO and the crew right away.
  useEffect(() => { props.reload(); live.reload(); }, [room.messages]);
  useEffect(() => { const last = room.messages[room.messages.length - 1]; if (last) markSeen(chat, last.ts); }, [room.messages.length]);

  const allowed = !!crew && !!me && crew.allowed.includes(me);
  const holder = isHolder(crew, me);
  const proposals: Record<number, Proposal> = props.data ?? {};

  // The raw /buy or /invite line is folded into the card it created; runs of the same sender drop the repeated name.
  const list = useMemo(() => {
    const ms = room.messages;
    const hidden = new Set<string>();
    ms.forEach((m, i) => {
      if (m.kind !== 'text' || !m.text.startsWith('/')) return;
      const next = ms.slice(i + 1, i + 4).find(n => (n.kind === 'trade' || n.kind === 'invite') && n.account === m.account);
      if (next) hidden.add(m.id);
    });
    // An invite card whose filing failed is dropped once a later card invites the same account.
    ms.forEach((m, i) => {
      if (m.kind === 'invite' && m.txs.some(t => /\(failed\)/.test(t.label)) && ms.slice(i + 1).some(n => n.kind === 'invite' && n.invite?.accountId === m.invite?.accountId)) hidden.add(m.id);
    });
    return ms.filter(m => !hidden.has(m.id)).slice(-80).reverse();
  }, [room.messages]);

  const parsedTrade = parseTradeCommand(text);
  const inviteTarget = /^\/invite\b/i.test(text.trim()) ? parseInviteCommand(text) : undefined;

  const send = () => act.run('Sending', async () => {
    const t = text.trim();
    if (!t || !account) return;
    if (inviteTarget === null) throw Error('Use /invite name.kumi-77b50457fb.testnet (a NEAR testnet account).');
    if (!room.send(await signedChat(account, crewId, t))) throw Error('Chat is offline: the Kumi server is not reachable.');
    setText('');
  });

  async function cardAct(m: ChatMessage, what: string, fn: () => Promise<{ hash: string; label: string }[]>) {
    setCardBusy({ id: m.id, what }); setCardError(null);
    try { const txs = await fn(); record(txs); setLastTxs(txs); live.reload(); props.reload(); }
    catch (e) { setCardError((e as Error).message); }
    finally { setCardBusy(null); }
  }

  const renderItem = ({ item: m, index }: { item: ChatMessage; index: number }) => {
    const prev = list[index + 1];
    const busy = cardBusy?.id === m.id ? cardBusy.what : null;
    if (m.kind === 'trade' && crew && st8) {
      const trade = st8.trades.find(t => t.id === m.trade?.tradeId);
      return <TradeCard m={m} me={me} crew={crew} trade={trade} proposal={m.trade?.proposalId !== undefined ? proposals[m.trade.proposalId] : undefined} assets={st8.assets} isMember={holder} busy={busy}
        onVote={(p, yes) => cardAct(m, yes ? 'yes' : 'no', async () => { const r = await vote(account!, crew.dao, p, yes, crewId, m.id); return [{ hash: r.hash, label: yes ? 'Vote yes' : 'Vote no' }]; })}
        onFile={() => cardAct(m, 'file', async () => { const r = await fileTrade(account!, crewId, m.id, m.trade!.quote!); return [{ hash: r.hash, label: 'Trade filed to the DAO' }]; })} />;
    }
    if (m.kind === 'invite' && crew && st8) {
      const i = m.invite!;
      const role = i.roleProposalId !== undefined ? proposals[i.roleProposalId] : undefined;
      const gate = i.proposalId !== undefined ? proposals[i.proposalId] : undefined;
      return <InviteCard m={m} me={me} crew={crew} stored={st8.invites.find(x => x.id === i.inviteId)} role={role} gate={gate} isHolder={holder} busy={busy}
        onVote={yes => cardAct(m, 'invite', async () => { const out = []; for (const p of [role, gate]) if (p?.status === 'InProgress' && !p.votes?.[me!]) { const r = await vote(account!, crew.dao, p, yes, crewId, m.id); out.push({ hash: r.hash, label: 'Invite vote' }); } return out; })}
        onFile={() => cardAct(m, 'file-invite', async () => { const r = await fileInvite(account!, crew, m.id, i.accountId, i.roleProposalId); return [{ hash: r.hash, label: 'Invite filed' }]; })} />;
    }
    if (m.kind === 'system') {
      const t = m.text;
      const hash = m.txs[0]?.hash;
      if (/ragequit/.test(t)) return <EventPill who={m.account} me={me} tone="pink" icon="exit" text="left with their exact share" hash={hash} />;
      if (/joined/.test(t)) return <EventPill who={m.account} me={me} tone="butter" icon="coin" text="chipped in and got shares" hash={hash} />;
      if (/invited/.test(t)) return <EventPill who={m.account} me={me} tone="mint" icon="plus" text={m.account === me ? 'were voted into the crew' : 'was voted into the crew'} hash={hash} />;
      if (/follow/.test(t)) return <EventPill who={m.account} me={me} tone="mint" icon="star" text="started following the crew" hash={hash} />;
      return <EventPill who={m.account} me={me} tone="coral" icon="bolt" text={t} hash={hash} />;
    }
    const showWho = !prev || prev.account !== m.account || prev.kind !== 'text' || m.ts - prev.ts > 600_000;
    return <Bubble m={m} me={me} showWho={showWho} />;
  };

  const navNear = st8?.pnl.navNear ?? 0;
  return (
    <View style={{ flex: 1, backgroundColor: C.cream }}>
      <Backdrop />
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 12, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,249,241,0.95)', borderBottomWidth: 1, borderColor: C.line }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to chats" onPress={() => { tap(); router.canGoBack() ? router.back() : router.replace('/'); }} hitSlop={10} style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 2, borderColor: C.edge }}>
          <Ic name="back" size={17} />
        </Pressable>
        <CrewAvatar id={`crew-${crewId}`} size={42} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontWeight: '800', fontSize: 18, color: C.ink }}>{crew?.name ?? ' '}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <LiveDot on={room.status === 'live'} size={7} />
            <Text numberOfLines={1} style={{ fontSize: 12.5, color: room.status === 'live' ? C.mintInk : C.ink3, fontWeight: '700' }}>{room.status === 'live' ? 'Live' : room.status === 'connecting' ? 'Connecting' : 'Chat offline'}</Text>
            <Text numberOfLines={1} style={{ fontSize: 12.5, color: C.ink2, flexShrink: 1 }}>· {crew ? `${crew.members.filter(([, n]) => BigInt(n) > 0n).length} shareholders` : ''}</Text>
          </View>
        </View>
        <Pressable testID="open-fund" accessibilityRole="button" accessibilityLabel="Open the crew fund" onPress={() => { tap(); router.push({ pathname: '/fund', params: { crew: String(crewId) } }); }} hitSlop={8}
          style={{ height: 40, paddingHorizontal: 12, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.plum }}>
          <Ic name="jar" size={15} color={C.butter} />
          {st8 ? <CountUp value={navNear} format={n => `${n.toFixed(3)} Ⓝ`} style={{ color: '#fff', fontFamily: F.monoBold, fontSize: 13 }} /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Fund</Text>}
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {live.error && !st8 && <View style={{ padding: 16 }}><Empty scene={art.scene.offline} alt="A worried penguin holding an unplugged cable" title="Can't reach NEAR testnet" body={`Could not read the crew: ${live.error}`} action={<Btn title="Try again" tone="plum" size="sm" onPress={live.reload} />} /></View>}
        {room.status === 'offline' && room.messages.length === 0 && st8 && <View style={{ padding: 16 }}><Notice>The chat server is offline, so messages and votes are paused. The fund still reads from NEAR: tap the jar.</Notice></View>}
        {!st8 && !live.error && <View style={{ padding: 16 }}><Skeleton rows={5} height={70} /></View>}
        {st8 && (
          <FlatList
            inverted
            data={list}
            keyExtractor={m => m.id}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 14, gap: 12 }}
            ListFooterComponent={<View style={{ alignItems: 'center', gap: 6, paddingVertical: 10 }}>
              <Text style={{ fontSize: 13, color: C.ink2, textAlign: 'center' }}>Messages are signed by each member's NEAR key. Trades and invites are Sputnik DAO votes.</Text>
              <Text style={{ fontSize: 11.5, color: C.ink3, textAlign: 'center' }}>{crew?.dao}</Text>
            </View>}
            ListEmptyComponent={room.status === 'connecting' ? <Skeleton rows={4} height={60} /> : <Empty scene={art.scene.emptyChat} alt="A cat asleep on a chat bubble" title="Quiet in here" body="Pitch the first trade with /buy SOL 10%." />}
          />
        )}

        <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: insets.bottom + 10, backgroundColor: 'rgba(255,249,238,0.97)', borderTopWidth: 1, borderColor: C.line, gap: 8 }}>
          {(act.error || room.error || cardError) && <Notice error>{act.error ?? cardError ?? room.error}</Notice>}
          {lastTxs.length > 0 && !cardBusy && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}><Text style={{ fontSize: 12, color: C.mintInk, fontWeight: '700' }}>Signed on this phone</Text>{lastTxs.map(t => <TxLink key={t.hash} hash={t.hash} label={t.label} />)}</View>}
          {cardBusy && <Text style={{ fontSize: 12.5, color: C.ink2, fontWeight: '600' }}>Signing on this phone · Kumi pays the gas · waiting for NEAR to finalise…</Text>}
          {st8 && !allowed ? (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Image source={art.scene.joinCrew} accessibilityLabel="A frog and a fox welcoming a bunny into the crew" style={{ width: 64, height: 64 }} contentFit="contain" />
                <Text style={{ flex: 1, fontSize: 13.5, color: C.ink2 }}><Text style={{ fontWeight: '800', color: C.ink }}>Invite-only.</Text> Shareholders vote new members in. Show a member your join code.</Text>
              </View>
              <Btn testID="join-code" title="Show my join code" tone="plum" icon="qr" onPress={() => router.push({ pathname: '/invite', params: { crew: String(crewId), name: crew?.name ?? '' } })} />
            </View>
          ) : st8 && !holder ? (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Image source={art.obj.jar} style={{ width: 54, height: 54 }} contentFit="contain" />
                <Text style={{ flex: 1, fontSize: 13.5, color: C.ink2 }}><Text style={{ fontWeight: '800', color: C.ink }}>You're in.</Text> Chip in to get shares and a vote.</Text>
              </View>
              <Btn testID="chip-in" title="Chip in" tone="butter" icon="coin" onPress={() => router.push({ pathname: '/fund', params: { crew: String(crewId), chip: '1' } })} />
            </View>
          ) : st8 ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
                {HINTS.map(([h, tone]) => <Pressable key={h} onPress={() => { tap(); setText(h); }} style={{ height: 32, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: tone === 'coral' ? C.coralSoft : tone === 'pink' ? C.pinkSoft : tone === 'butter' ? C.butterSoft : C.mintSoft }}><Text style={{ fontWeight: '700', fontSize: 12.5, color: tone === 'coral' ? C.coralInk : tone === 'pink' ? C.pinkInk : tone === 'butter' ? C.butterInk : C.mintInk }}>{h.trim()}</Text></Pressable>)}
              </ScrollView>
              {parsedTrade && <Text style={{ fontSize: 12.5, color: C.coralInk, fontWeight: '600' }}>Pitch: {parsedTrade.side} {parsedTrade.asset} with {parsedTrade.bps / 100}% of the crew's {parsedTrade.side === 'buy' ? 'NEAR' : parsedTrade.asset}. Kumi attaches a live pool quote.</Text>}
              {inviteTarget && <Text style={{ fontSize: 12.5, color: C.mintInk, fontWeight: '600' }}>Invite {inviteTarget}: the crew votes them in.</Text>}
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 5, height: 54, borderRadius: 27, backgroundColor: '#fff', borderWidth: 3, borderColor: '#fff', borderBottomWidth: 6, borderBottomColor: C.edge }}>
                <TextInput testID="composer" value={text} onChangeText={setText} placeholder="Message the crew, or /buy SOL 10%" placeholderTextColor={C.ink3} maxLength={500} returnKeyType="send" onSubmitEditing={send} autoCapitalize="none"
                  style={{ flex: 1, fontSize: 15.5, color: C.ink, height: 44, outlineStyle: 'none' } as any} />
                <Pressable testID="send" accessibilityRole="button" accessibilityLabel="Send" disabled={!text.trim() || act.busy !== null} onPress={send} style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: text.trim() ? C.coral : C.coralSoft }}>
                  <Ic name="send" size={18} color="#fff" />
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
