import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Animated, { FadeInDown, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { shareholderTally, type Asset, type Crew, type Invite, type Proposal, type Trade } from '@kumi/sdk';
import { Text } from './T';
import { Avatar, Btn, Chip, Ic, TestTag, TokenLogo, TxLink, ago } from './ui';
import { C, F, TONE, art, type Tone } from '../lib/theme';
import { nameOf, near, units, type ChatMessage } from '../lib/near';

const enter = FadeInDown.duration(260).reduceMotion(ReduceMotion.System);

export function Bubble({ m, me, showWho }: { m: ChatMessage; me?: string | null; showWho: boolean }) {
  const mine = !!me && m.account === me;
  const isCmd = m.text.startsWith('/');
  return (
    <Animated.View entering={enter} style={{ flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8, alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '84%' }}>
      {!mine && (showWho ? <Avatar address={m.account} size={30} /> : <View style={{ width: 30 }} />)}
      <View style={{ flexShrink: 1 }}>
        {showWho && (
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 3, marginHorizontal: 4, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
            <Text style={{ fontWeight: '700', fontSize: 13, color: C.ink }}>{nameOf(m.account, me)}</Text>
            {!mine && <TestTag address={m.account} />}
            <Text style={{ fontSize: 11.5, color: C.ink3 }}>{ago(m.ts / 1000)}</Text>
          </View>
        )}
        <View style={{ borderRadius: 22, borderBottomLeftRadius: mine ? 22 : 8, borderBottomRightRadius: mine ? 8 : 22, backgroundColor: mine ? '#1f0e29' : C.edge, paddingBottom: 4 }}>
          <View style={{ paddingVertical: 10, paddingHorizontal: 15, borderRadius: 22, borderBottomLeftRadius: mine ? 22 : 8, borderBottomRightRadius: mine ? 8 : 22, backgroundColor: mine ? C.plum : C.panel, borderWidth: 2, borderColor: mine ? C.plum : '#fff' }}>
            <Text style={{ fontSize: 15.5, lineHeight: 22, color: mine ? '#fff' : C.ink, fontFamily: isCmd ? F.mono : undefined }}>{m.text}</Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

/** A chat event as the web's pill: tone by kind (butter money, mint joins, pink exits, coral trades). */
export function EventPill({ who, me, tone, icon, text, hash }: { who: string; me?: string | null; tone: Tone; icon: string; text: ReactNode; hash?: string }) {
  const t = TONE[tone];
  return (
    <Animated.View entering={enter} style={{ alignSelf: 'center', alignItems: 'center', gap: 3, maxWidth: '100%' }}>
      <View style={{ maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, paddingLeft: 5, paddingRight: 13, borderRadius: 999, backgroundColor: t.soft, borderWidth: 2, borderColor: '#fff' }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: t.base, alignItems: 'center', justifyContent: 'center' }}><Ic name={icon} size={14} color={C.plum2} /></View>
        <Text style={{ flexShrink: 1, fontSize: 13.5, color: C.ink2, fontWeight: '600' }}><Text style={{ fontWeight: '800', color: C.ink }}>{nameOf(who, me)}</Text> {text}</Text>
      </View>
      {hash ? <TxLink hash={hash} color={t.ink} /> : null}
    </Animated.View>
  );
}

/** The yes bar: grows with a spring when a vote lands (live, from the DAO), with the majority line marked. */
function VoteBar({ yes, no, of, needed }: { yes: number; no: number; of: number; needed: number }) {
  const w = useSharedValue(0);
  useEffect(() => { w.value = withSpring(of ? yes / of : 0, { damping: 16, stiffness: 140, reduceMotion: ReduceMotion.System }); }, [yes, of]);
  const bar = useAnimatedStyle(() => ({ width: `${Math.min(1, w.value) * 100}%` }));
  return (
    <View style={{ height: 14, borderRadius: 7, backgroundColor: '#eadcc4', overflow: 'hidden', flexDirection: 'row' }}>
      <Animated.View style={[{ height: '100%', backgroundColor: C.coral, borderRadius: 7 }, bar]} />
      {no > 0 && <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${(no / Math.max(1, of)) * 100}%`, backgroundColor: C.pink }} />}
      {of > 0 && <View style={{ position: 'absolute', left: `${(needed / of) * 100}%`, marginLeft: -1.5, top: -2, bottom: -2, width: 3, backgroundColor: C.plum }} />}
    </View>
  );
}

/** Pops a number when it changes (a vote landing). */
function Pop({ children, k, style }: { children: ReactNode; k: unknown; style?: any }) {
  const s = useSharedValue(1);
  const [first, setFirst] = useState(true);
  useEffect(() => { if (first) { setFirst(false); return; } s.value = 1.35; s.value = withTiming(1, { duration: 420, reduceMotion: ReduceMotion.System }); }, [k]);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={[a, style]}>{children}</Animated.View>;
}

function VoteBand({ p, crew, me, label }: { p: Proposal; crew: Crew; me?: string | null; label?: string }) {
  const t = shareholderTally(p, crew);
  const voters = Object.entries(p.votes ?? {});
  return (
    <View style={{ padding: 12, borderRadius: 18, backgroundColor: C.butterSoft, gap: 9 }}>
      {label ? <Text style={{ fontSize: 11.5, fontWeight: '700', color: C.butterInk }}>{label} · DAO #{p.id}</Text> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Pop k={t.approve}><Text style={{ fontFamily: F.monoBold, fontSize: 17, color: C.ink }}>{t.approve}</Text></Pop>
          <Text style={{ fontSize: 13.5, color: C.ink }}>of {t.members} shareholders yes</Text>
        </View>
        <Text style={{ fontSize: 12.5, color: C.ink2 }}>needs {t.needed}</Text>
      </View>
      <VoteBar yes={t.approve} no={t.reject} of={t.members} needed={t.needed} />
      {voters.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {voters.map(([who, v]) => (
            <View key={who} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 2, paddingRight: 9, height: 26, borderRadius: 13, backgroundColor: '#fff' }}>
              <Avatar address={who} size={22} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: v === 'Approve' ? C.mintInk : C.pinkInk }}>{nameOf(who, me)} {v === 'Approve' ? 'yes' : 'no'}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const STATUS: Record<string, [string, Tone | 'grey']> = {
  draft: ['Quote ready', 'butter'], filing: ['Filing', 'butter'], voting: ['Voting', 'butter'], executing: ['Executing', 'coral'],
  executed: ['Executed', 'mint'], failed: ['Not filled', 'pink'], expired: ['Expired', 'grey'], error: ['No quote', 'pink'],
};

/** A trade pitched in chat: plum header, the attached pool quote, the live Sputnik vote, then the fill. */
export function TradeCard({ m, me, crew, trade, proposal, assets, isMember, busy, onVote, onFile }: {
  m: ChatMessage; me?: string | null; crew: Crew; trade?: Trade; proposal?: Proposal; assets: Asset[]; isMember: boolean; busy?: string | null;
  onVote: (p: Proposal, yes: boolean) => void; onFile: () => void;
}) {
  const t = m.trade!;
  const q = t.quote;
  const asset = assets.find(a => a.symbol === t.asset);
  const dec = asset?.decimals ?? 8;
  const mine = !!me && m.account === me;
  const status = t.error ? 'error' : proposal?.status === 'Expired' ? 'expired' : trade?.status ?? (q ? 'draft' : 'error');
  const myVote = me ? proposal?.votes?.[me] : undefined;
  const canVote = isMember && proposal?.status === 'InProgress' && !myVote && trade?.status === 'voting';
  const canFile = mine && t.lane === 'vote' && q && t.proposalId === undefined && !t.error;
  const filled = trade?.status === 'executed';
  const buy = t.side === 'buy';
  const exec = m.txs.find(x => x.label === 'executed');
  const decider = exec ? m.txs.find(x => x.hash === exec.hash && x.label !== 'executed') : undefined;
  const intents = q && 'quote' in q.intents ? (q.intents as any).quote : null;
  const [s] = STATUS[status] ?? ['', 'grey'];
  const tone = STATUS[status]?.[1] ?? 'grey';
  return (
    <Animated.View entering={enter} style={{ alignSelf: 'stretch', borderRadius: 28, backgroundColor: C.edge, paddingBottom: 7 }} testID={`trade-${t.tradeId ?? m.id}`}>
      <View style={{ borderRadius: 28, borderWidth: 3, borderColor: '#fff', backgroundColor: C.panel, overflow: 'hidden' }}>
        <LinearGradient colors={buy ? ['#6a3a80', C.plum, C.plum] : ['#ff9a7e', C.coral, '#ff6a7f']} locations={[0, 0.6, 1]} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
          <TokenLogo sym={t.asset} size={42} test />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1, color: 'rgba(255,255,255,0.85)' }}>{nameOf(m.account, me).toUpperCase()} PITCHED{t.tradeId !== undefined ? ` · #${t.tradeId}` : ''}</Text>
            <Text style={{ fontFamily: F.display, fontSize: 25, lineHeight: 30, color: '#fff' }}>{buy ? 'BUY' : 'SELL'} {t.asset} · {t.bps / 100}%</Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.92)' }}>{t.lane === 'captain' ? 'Captain lane · no vote' : `${t.bps / 100}% of the crew's ${buy ? 'NEAR' : `t${t.asset}`} · crew vote`}</Text>
          </View>
          <View style={{ paddingHorizontal: 10, height: 26, borderRadius: 999, backgroundColor: '#fff', justifyContent: 'center' }}>
            <Text style={{ fontSize: 11.5, fontWeight: '800', color: tone === 'mint' ? C.mintInk : tone === 'pink' ? C.pinkInk : tone === 'grey' ? C.ink3 : C.plum }}>{s}</Text>
          </View>
        </LinearGradient>
        <View style={{ padding: 14, gap: 10 }}>
          {t.error ? <Text style={{ fontSize: 13.5, color: C.pinkInk }}>{t.error}</Text> : null}
          {trade?.status === 'failed' && <Text style={{ fontSize: 13.5, color: C.ink2 }}>The vote passed, but the pool moved more than {crew.slippage_bps / 100}% past the quote, so it refused the fill. Every holding was restored.</Text>}
          {q && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Leg k={filled ? 'Crew paid' : 'Crew pays'} sym={buy ? 'NEAR' : t.asset} test={!buy} v={filled ? (buy ? near(trade!.crew_in, 4) : units(trade!.crew_in, dec, 6)) : (buy ? near(q.amount_in, 4) : units(q.amount_in, dec, 6))} unit={buy ? 'NEAR' : `t${t.asset}`} />
              <Ic name="arrow" size={18} color={C.ink3} />
              <Leg k={filled ? 'Crew got' : 'Pool quote'} sym={buy ? t.asset : 'NEAR'} test={buy} v={filled ? (buy ? units(trade!.crew_out, dec, 6) : near(trade!.crew_out, 4)) : (buy ? units(q.pool.amount_out, dec, 6) : near(q.pool.amount_out, 4))} unit={buy ? `t${t.asset}` : 'NEAR'} />
            </View>
          )}
          {q && !filled && <Text style={{ fontSize: 12, color: C.ink3 }}>{intents ? `Mainnet NEAR Intents dry quote: ${Number(intents.amountInFormatted).toPrecision(4)} → ${Number(intents.amountOutFormatted).toPrecision(4)} ${buy ? t.asset : 'NEAR'}` : 'Mainnet NEAR Intents quote unavailable at this size'} · fills here on Kumi's testnet pool</Text>}
          {proposal && <VoteBand p={proposal} crew={crew} me={me} />}
          {filled && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 18, backgroundColor: C.mintSoft }}>
              <Image source={art.sticker.party} style={{ width: 46, height: 46 }} contentFit="contain" accessibilityLabel="A bunny jumping in confetti" />
              <Text style={{ flex: 1, fontSize: 13.5, color: C.ink, lineHeight: 19 }}>
                {decider ? <><Text style={{ fontWeight: '800' }}>{nameOf(decider.account, me)}</Text> cast the deciding vote. </> : null}The DAO ran the trade in the same transaction{BigInt(trade!.vault_in) > 0n ? ', followers mirrored it' : ''}.
              </Text>
            </View>
          )}
          {canVote && proposal && (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Btn testID="vote-yes" title={busy === 'yes' ? 'Signing…' : 'Vote yes'} tone="coral" icon="thumb" busy={busy === 'yes'} disabled={!!busy && busy !== 'yes'} onPress={() => onVote(proposal, true)} style={{ flex: 1 }} />
              <Btn title="No" tone="white" icon="thumbDown" disabled={!!busy} onPress={() => onVote(proposal, false)} style={{ flex: 0.6 }} />
            </View>
          )}
          {myVote && !filled && <Chip text={myVote === 'Approve' ? 'You voted yes' : 'You voted no'} tone={myVote === 'Approve' ? 'mint' : 'pink'} dot />}
          {canFile && <Btn testID="file-trade" title={busy === 'file' ? 'Filing to the DAO…' : 'Put it to a vote'} tone="coral" icon="arrow" busy={busy === 'file'} onPress={onFile} />}
          {m.txs.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 }}>
              {m.txs.filter((x, i, a) => a.findIndex(y => y.hash === x.hash) === i).map(x => <TxLink key={x.hash + x.label} hash={x.hash} label={x.hash === exec?.hash ? 'vote + trade' : x.label} />)}
            </View>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

function Leg({ k, sym, test, v, unit }: { k: string; sym: string; test?: boolean; v: string; unit: string }) {
  return (
    <View style={{ flex: 1, padding: 10, borderRadius: 16, backgroundColor: C.panel2, borderWidth: 1, borderColor: C.line, gap: 3 }}>
      <Text style={{ fontSize: 11.5, color: C.ink3, fontWeight: '600' }}>{k}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <TokenLogo sym={sym} size={20} test={test} />
        <Text style={{ fontFamily: F.monoBold, fontSize: 14, color: C.ink, flexShrink: 1 }} numberOfLines={1}>{v}</Text>
      </View>
      <Text style={{ fontSize: 11, color: C.ink3 }}>{unit}</Text>
    </View>
  );
}

/** An invitation: both proposals (the DAO crew role and the hub's admission gate) with their live votes. */
export function InviteCard({ m, me, crew, stored, role, gate, isHolder, busy, onVote, onFile }: {
  m: ChatMessage; me?: string | null; crew: Crew; stored?: Invite; role?: Proposal; gate?: Proposal; isHolder: boolean; busy?: string | null;
  onVote: (yes: boolean) => void; onFile: () => void;
}) {
  const i = m.invite!;
  const admitted = stored?.status === 'admitted';
  const failed = stored?.status === 'failed' || [role, gate].some(p => p && ['Rejected', 'Expired', 'Failed'].includes(p.status));
  const canVote = !!me && isHolder && !admitted && !failed && [role, gate].some(p => p?.status === 'InProgress' && !p.votes?.[me]);
  const isMe = !!me && i.accountId === me;
  return (
    <Animated.View entering={enter} style={{ alignSelf: 'stretch', borderRadius: 28, backgroundColor: C.edge, paddingBottom: 7 }}>
      <View style={{ borderRadius: 28, borderWidth: 3, borderColor: '#fff', backgroundColor: C.panel, overflow: 'hidden' }}>
        <LinearGradient colors={[C.mintTop, C.mint, C.mint]} locations={[0, 0.6, 1]} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
          <Avatar address={i.accountId} size={42} ring="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1, color: '#0b3d27' }}>{nameOf(m.account, me).toUpperCase()} INVITED</Text>
            <Text style={{ fontFamily: F.display, fontSize: 23, lineHeight: 28, color: '#08311f' }} numberOfLines={1}>ADD {isMe ? 'YOU' : nameOf(i.accountId, me).toUpperCase()}</Text>
            <Text style={{ fontSize: 12.5, color: '#0b3d27' }} numberOfLines={1}>{i.accountId}</Text>
          </View>
          <View style={{ paddingHorizontal: 10, height: 26, borderRadius: 999, backgroundColor: '#fff', justifyContent: 'center' }}>
            <Text style={{ fontSize: 11.5, fontWeight: '800', color: admitted ? C.mintInk : failed ? C.pinkInk : C.plum }}>{admitted ? 'Admitted' : failed ? 'Not admitted' : gate ? 'Voting' : 'Filing'}</Text>
          </View>
        </LinearGradient>
        <View style={{ padding: 14, gap: 10 }}>
          {!admitted && <Text style={{ fontSize: 13.5, color: C.ink2, lineHeight: 19 }}>Two votes: the crew's DAO role, then the hub's admission. Each needs a majority of current shareholders.</Text>}
          {role && <VoteBand p={role} crew={crew} me={me} label="Crew role" />}
          {gate && <VoteBand p={gate} crew={crew} me={me} label="Hub admission" />}
          {admitted && <Text style={{ fontSize: 13.5, color: C.mintInk, fontWeight: '700' }}>{isMe ? 'You are in. Chip in to get shares and a vote.' : `${nameOf(i.accountId, me)} can chip in now.`}</Text>}
          {canVote && (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Btn title={busy === 'invite' ? 'Signing…' : 'Vote yes'} tone="mint" icon="thumb" busy={busy === 'invite'} onPress={() => onVote(true)} style={{ flex: 1 }} />
              <Btn title="No" tone="white" disabled={!!busy} onPress={() => onVote(false)} style={{ flex: 0.6 }} />
            </View>
          )}
          {isHolder && me === m.account && i.proposalId === undefined && !failed && <Btn title={busy === 'file-invite' ? 'Filing…' : 'Put the invite to a vote'} tone="plum" busy={busy === 'file-invite'} onPress={onFile} />}
          {m.txs.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 }}>{m.txs.map(x => <TxLink key={x.hash + x.label} hash={x.hash} label={x.label} />)}</View>}
        </View>
      </View>
    </Animated.View>
  );
}
