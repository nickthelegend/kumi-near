import { useState } from 'react';
import { View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Text } from '../components/T';
import { Screen, SheetHeader } from '../components/Screen';
import { Btn, Card, Notice, Obj, st } from '../components/ui';
import { revealSecret } from '../lib/wallet';
import { C, F } from '../lib/theme';

/** Backup: the key is shown only after the owner taps Reveal, and only on this screen. Never logged or sent. */
export default function Backup() {
  const [secret, setSecret] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <Screen>
      <SheetHeader title="Back up your key" sub="Anyone with this key controls your NEAR account." />
      <Card pad={16}>
        <View style={{ gap: 12 }}>
          <View style={st.row}><Obj name="shield" size={56} /><Text style={{ flex: 1, fontSize: 14, color: C.ink2, lineHeight: 20 }}>Write it down somewhere private. Kumi can't recover it for you. It is a NEAR testnet account, so keep real funds out of it.</Text></View>
          {err && <Notice error>{err}</Notice>}
          {!secret ? <Btn title="Reveal my key" tone="plum" icon="key" onPress={() => revealSecret().then(setSecret, e => setErr(String(e?.message ?? e)))} /> : (
            <>
              <View style={{ padding: 14, borderRadius: 16, backgroundColor: C.plumSoft }}><Text selectable style={{ fontFamily: F.mono, fontSize: 13, color: C.plum2, lineHeight: 20 }}>{secret}</Text></View>
              <Btn title={copied ? 'Copied' : 'Copy key'} tone="white" icon={copied ? 'check' : 'copy'} onPress={() => { Clipboard.setStringAsync(secret).then(() => setCopied(true)).catch(() => {}); }} />
              <Btn title="Hide" tone="ghost" onPress={() => { setSecret(null); setCopied(false); }} />
            </>
          )}
        </View>
      </Card>
    </Screen>
  );
}
