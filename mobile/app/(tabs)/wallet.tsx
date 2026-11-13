import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { crewNav, memberShare, vaultNav, viewAccessKeys, viewAccount } from '@kumi/sdk';
import { Text } from '../../components/T';
import { Screen } from '../../components/Screen';
import { CountUp, LiveDot } from '../../components/Live';
import { Avatar, Btn, Card, Chip, CrewAvatar, Notice, Skeleton, TokenLogo, TxLink, ago, st, tap } from '../../components/ui';
import { accountUrl, near, readHub, useLive } from '../../lib/near';
import { useApp } from '../../lib/store';
import { IS_WEB } from '../../lib/wallet';
import { C, F } from '../../lib/theme';

/** Wallet: this phone's NEAR testnet account, its balance, its crew shares and vault position, and what it signed. */
export default function Wallet() {
  const { account, publicKey, activity } = useApp();
  const router = useRouter();
  const me = account?.accountId ?? null;
  const acct = useLive(async () => {
    if (!me) return null;
    const [v, keys] = await Promise.all([viewAccount(me), viewAccessKeys(me)]);
    return { amount: BigInt(v.amount), storage: v.storage_usage, keys: (keys as any).keys?.length ?? 0 };
  }, [me], 5000);
  const crews = useLive(async () => {
    if (!me) return [];
    const h = await readHub();
    return h.crews.filter(c => c.allowed.includes(me) || c.followers.some(([a]) => a === me)).map(c => {
      const s = memberShare(c, me);
      const supply = BigInt(c.supply);
      const f = BigInt(c.followers.find(([a]) => a === me)?.[1] ?? '0');
      const vs = BigInt(c.vault_supply);
      return { c, bps: s.bps, worth: supply > 0n ? crewNav(c, h.marks) * s.shares / supply : 0n, vault: vs > 0n ? vaultNav(c, h.marks) * f / vs : 0n };
    });
  }, [me], 10000);
  if (!me) return <Screen tabs><Skeleton rows={3} /></Screen>;
  const a = acct.data;
  return (
    <Screen tabs>
      <Text style={{ fontWeight: '800', fontSize: 30, color: C.ink, letterSpacing: -0.6 }}>Wallet</Text>

      <View style={{ borderRadius: 28, backgroundColor: '#22102b', paddingBottom: 7 }}>
        <LinearGradient colors={['#55306a', C.plum, C.plum2]} locations={[0, 0.55, 1]} style={{ borderRadius: 28, padding: 18, gap: 14 }}>
          <View style={st.between}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.75)' }}>On this phone · NEAR testnet</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 26, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)' }}>
              <LiveDot size={7} /><Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Live</Text>
            </View>
          </View>
          <View style={st.row}>
            <Avatar address={me} size={46} ring="rgba(255,255,255,0.3)" />
            <Pressable onPress={() => { tap(); Clipboard.setStringAsync(me).catch(() => {}); }} accessibilityRole="button" accessibilityLabel="Copy account" style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', fontSize: 18, color: '#fff' }} numberOfLines={1}>{account!.handle}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 11.5, color: 'rgba(255,255,255,0.7)' }} numberOfLines={1}>{me}</Text>
            </Pressable>
          </View>
          {!a ? <View style={{ height: 64, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)' }} /> : (
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              <TokenLogo sym="NEAR" size={30} />
              <CountUp value={Number(a.amount / 10n ** 18n) / 1e6} format={n => n.toFixed(4)} style={{ fontFamily: F.display, fontSize: 40, lineHeight: 46, color: '#fff' }} />
              <Text style={{ fontFamily: F.displayBold, fontSize: 18, color: C.butter, marginBottom: 7 }}>NEAR</Text>
            </View>
          )}
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>Kumi's relayer pays every gas fee (NEP-366). This NEAR is only for chipping in.</Text>
        </LinearGradient>
      </View>

      {acct.error && !a && <Notice error>Could not read this account: {acct.error}</Notice>}
      {IS_WEB && <Notice>Web preview: the key is stored in this browser. The app keeps it in the phone's keychain.</Notice>}

      <Card pad={14}>
        <Text style={[st.h2, { marginBottom: 8 }]}>Crews</Text>
        {!crews.data ? <Skeleton rows={1} /> : crews.data.length === 0 ? <Text style={st.body}>Not in a crew yet. Crews are invite-only: show a member your join code.</Text>
          : crews.data.map(({ c, bps, worth, vault }) => (
            <Pressable key={c.id} onPress={() => router.push({ pathname: '/fund', params: { crew: String(c.id) } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
              <CrewAvatar id={`crew-${c.id}`} size={42} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', fontSize: 15.5, color: C.ink }}>{c.name}</Text>
                <Text style={{ fontSize: 12, color: C.ink2 }}>{bps > 0 ? `${(bps / 100).toFixed(1)}% of the crew` : 'invited · not chipped in'}{vault > 0n ? ` · vault ${near(vault, 4)} NEAR` : ''}</Text>
              </View>
              <Text style={{ fontFamily: F.monoBold, fontSize: 14.5, color: C.ink }}>{near(worth, 4)} Ⓝ</Text>
            </Pressable>
          ))}
      </Card>

      <Card pad={16}>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <View style={{ padding: 8, borderRadius: 18, backgroundColor: '#fff', borderWidth: 2, borderColor: C.edge }}>
            <QRCode value={`kumi://invite/0/${me}`} size={104} color={C.plum2} backgroundColor="#fff" />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={st.h2}>Your join code</Text>
            <Text style={{ fontSize: 13.5, color: C.ink2, lineHeight: 19 }}>A crew member scans it; their app drafts /invite for the crew to vote on.</Text>
            <Pressable onPress={() => Linking.openURL(accountUrl(me))} accessibilityRole="link"><Text style={{ fontSize: 13, color: C.coralInk, fontWeight: '700' }}>View on NearBlocks</Text></Pressable>
          </View>
        </View>
      </Card>

      <Card pad={14}>
        <View style={[st.between, { marginBottom: 6 }]}><Text style={st.h2}>Signed on this phone</Text><Chip text={`${activity.length}`} tone="butter" /></View>
        {activity.length === 0 ? <Text style={st.body}>Every transaction this phone signs shows here with its NearBlocks link.</Text> : activity.slice(0, 12).map(t => (
          <View key={t.hash + t.label} style={[st.between, { paddingVertical: 7, borderTopWidth: 1, borderColor: C.line }]}>
            <View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: '600', color: C.ink }}>{t.label}</Text><Text style={{ fontSize: 11.5, color: C.ink3 }}>{ago(Math.floor(t.at / 1000))} ago</Text></View>
            <TxLink hash={t.hash} />
          </View>
        ))}
      </Card>

      <Card pad={14}>
        <View style={{ gap: 6 }}>
          <Text style={st.h2}>Key</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ink2 }} numberOfLines={1}>{publicKey}</Text>
          <Text style={{ fontSize: 12.5, color: C.ink3 }}>ed25519, made on this phone, kept in the iOS keychain{a ? ` · ${a.keys} access key${a.keys === 1 ? '' : 's'} on the account` : ''}.</Text>
        </View>
      </Card>
      <Btn title="Back up this key" tone="white" icon="key" onPress={() => router.push('/backup')} />
    </Screen>
  );
}
