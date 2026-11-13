import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Text, TextInput } from '../components/T';
import { Screen } from '../components/Screen';
import { inp } from '../components/Sheet';
import { Brand, Btn, Card, Ic, Notice, Obj, TxLink, st, useBusy } from '../components/ui';
import { useApp } from '../lib/store';
import { C, F, art } from '../lib/theme';
import { RELAYER, api } from '../lib/near';

type Start = { delivery: 'email' | 'setup-required'; setup?: string; previewCode?: string; existing: boolean; accountId?: string };
type Verify = { accountId: string; handle: string; created: boolean; createdTx?: string };

/** First run: a NEAR key made on this phone, then a NEAR testnet account for it (made by Kumi's relayer), then a tour. */
export default function Onboarding() {
  const app = useApp();
  const router = useRouter();
  const act = useBusy();
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<Start | null>(null);
  const [made, setMade] = useState<Verify | null>(null);
  const clean = handle.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20);
  const finish = async () => { await app.finishOnboarding(); router.replace('/'); };

  return (
    <Screen>
      <View style={[st.between, { marginTop: 4 }]}><Brand size={32} /><Text style={{ fontSize: 12.5, color: C.ink3, fontWeight: '700' }}>NEAR testnet</Text></View>
      <View style={{ borderRadius: 28, backgroundColor: '#22102b', paddingBottom: 7 }}>
        <View style={{ borderRadius: 28, overflow: 'hidden', backgroundColor: C.plum }}>
          <Image source={art.hero} style={{ width: '100%', aspectRatio: 1.45 }} contentFit="cover" />
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={{ fontWeight: '800', fontSize: 32, lineHeight: 37, color: C.ink, letterSpacing: -0.7 }}>Your group chat is a fund.</Text>
        <Text style={{ fontSize: 16, lineHeight: 23, color: C.ink2 }}>Pool money with friends. Pitch a trade in the chat; the crew votes, and the vote makes the trade on NEAR.</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={232} decelerationRate="fast" contentContainerStyle={{ gap: 12, paddingRight: 8 }} style={{ marginHorizontal: -16, paddingLeft: 16 }}>
        {([[art.scene.onboard1, 'Chip in with friends', 'A cat, a bunny and a bear waving from chat bubbles'], [art.scene.onboard2, 'Vote on trades together', 'A fox and a frog giving thumbs up beside a rising chart'], [art.scene.onboard3, 'Leave anytime with your share', 'A bunny walking out a door with a jar of coins']] as const).map(([img, t, alt]) => (
          <View key={t} style={{ width: 220, borderRadius: 24, backgroundColor: C.edge, paddingBottom: 5 }}>
            <View style={{ borderRadius: 24, overflow: 'hidden', backgroundColor: '#fff', borderWidth: 3, borderColor: '#fff' }}>
              <Image source={img} accessibilityLabel={alt} style={{ width: '100%', aspectRatio: 1.25 }} contentFit="cover" />
              <Text style={{ fontWeight: '800', fontSize: 15, color: C.ink, padding: 10 }}>{t}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {act.error && <Notice error>{act.error}</Notice>}
      {!app.publicKey ? (
        <Card pad={16}>
          <View style={{ gap: 12 }}>
            <View style={st.row}><Obj name="shield" size={54} /><Text style={{ flex: 1, fontSize: 14, color: C.ink2, lineHeight: 20 }}>Kumi makes a NEAR key on this phone. Only this phone holds it. No wallet app, no seed phrase to type.</Text></View>
            <Btn testID="create-key" title="Create my key" size="lg" busy={act.busy !== null} onPress={() => act.run('Creating', async () => { await app.createKey(); })} />
          </View>
        </Card>
      ) : !app.account ? (
        <Card pad={16}>
          <View style={{ gap: 12 }}>
            <View style={st.row}><Image source={art.scene.wallet} accessibilityLabel="A happy coral wallet with coins dropping in" style={{ width: 54, height: 54 }} contentFit="contain" /><View style={{ flex: 1 }}><Text style={st.h2}>Key ready</Text><Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ink2 }} numberOfLines={1}>{app.publicKey}</Text></View></View>
            {!app.server && <Notice error>The Kumi server is not reachable, so no account can be made yet. Start it with: pnpm run server</Notice>}
            <Text style={st.k}>Pick a name</Text>
            <TextInput testID="handle" value={handle} onChangeText={setHandle} placeholder="aki" placeholderTextColor={C.ink3} autoCapitalize="none" autoCorrect={false} style={inp} editable={!sent} />
            {clean.length >= 2 && <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.plum3 }}>{clean}.{RELAYER}</Text>}
            <Text style={st.k}>Email (for your sign-in code)</Text>
            <TextInput testID="email" value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={C.ink3} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" style={inp} editable={!sent} />
            {!sent ? (
              <Btn testID="send-code" title="Send my code" tone="plum" size="lg" disabled={clean.length < 2 || !email.includes('@') || !app.server} busy={act.busy !== null}
                onPress={() => act.run('Sending', async () => { const s = await api<Start>('/api/auth/start', { email }); setSent(s); if (s.previewCode) setCode(s.previewCode); })} />
            ) : (
              <>
                {sent.delivery === 'setup-required' && <Notice>Email delivery isn't set up on this testnet server ({sent.setup}), so the code shows here.</Notice>}
                <Text style={st.k}>6-digit code</Text>
                <TextInput testID="code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} style={[inp, { fontFamily: F.monoBold, letterSpacing: 6, fontSize: 20 }]} />
                <Btn testID="create-account" title={act.busy ? 'Creating your NEAR account…' : 'Create my NEAR account'} size="lg" busy={act.busy !== null} disabled={code.length !== 6}
                  onPress={() => act.run('Creating', async () => {
                    const v = await api<Verify>('/api/auth/verify', { email, code, handle: clean, publicKey: app.publicKey });
                    await app.setAccount({ accountId: v.accountId, handle: clean });
                    if (v.createdTx) app.record([{ hash: v.createdTx, label: 'NEAR account created' }]);
                    setMade(v);
                  })} />
              </>
            )}
          </View>
        </Card>
      ) : (
        <Card pad={16}>
          <View style={{ gap: 12 }}>
            <View style={st.row}><Obj name="success" size={58} /><View style={{ flex: 1 }}><Text style={st.h2}>You're on NEAR</Text><Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ink2 }}>{app.account.accountId}</Text></View></View>
            {made?.createdTx && (
              <View testID="account-made" style={{ gap: 8, padding: 12, borderRadius: 18, backgroundColor: C.panel2, borderWidth: 1, borderColor: C.line }}>
                <View style={st.row}><View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}><Ic name="check" size={14} color="#08311f" /></View><Text style={{ flex: 1, fontSize: 14.5, color: C.ink }}>Account made, with {app.server?.giftNear ?? 'some'} NEAR to chip in</Text><TxLink hash={made.createdTx} /></View>
                <View style={st.row}><View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}><Ic name="check" size={14} color="#08311f" /></View><Text style={{ flex: 1, fontSize: 14.5, color: C.ink }}>Gas is on Kumi: you never need a wallet pop-up</Text></View>
              </View>
            )}
            {[['chat', 'Get invited: show a member your join code'], ['coins', 'Chip in NEAR for shares and a vote'], ['vote', 'Pitch /buy SOL 10%; the crew votes it through']].map(([o, t]) => (
              <View key={t} style={st.row}><Obj name={o as any} size={40} still /><Text style={{ flex: 1, fontSize: 14.5, color: C.ink }}>{t}</Text></View>
            ))}
            <Btn testID="finish-onboarding" title="Open Kumi" size="lg" busy={act.busy !== null} onPress={() => act.run('Opening', finish)} />
            <Btn title="Back up the key first" tone="white" icon="key" onPress={() => router.push('/backup')} />
          </View>
        </Card>
      )}
      <Text style={{ fontSize: 11.5, color: C.ink3, textAlign: 'center' }}>Testnet only: test NEAR and Kumi's labelled test pools. MIT · © 2026 Nivesh Gajengi</Text>
    </Screen>
  );
}
