import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Text, TextInput } from '../components/T';
import { Screen, SheetHeader } from '../components/Screen';
import { Btn, Card, Notice, st } from '../components/ui';
import { IS_WEB } from '../lib/wallet';
import { C, F } from '../lib/theme';
import { routeFor } from '../lib/links';

/** Scan a join code (camera or a photo of it) or paste one: opens the crew with /invite drafted for the vote. */
export default function Scan() {
  const router = useRouter();
  const [perm, ask] = useCameraPermissions();
  const [paste, setPaste] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [handled, setHandled] = useState(false);
  const open = (code: string) => {
    const r = routeFor(code);
    if (!r) { setErr('That is not a Kumi join code. Codes look like kumi://invite/0/name.kumi-77b50457fb.testnet'); return; }
    setHandled(true);
    router.replace({ pathname: r.path as any, params: r.params });
  };
  const fromPhoto = async () => {
    setErr(null);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets[0]) return;
    try {
      const found = await (CameraView as any).scanFromURLAsync?.(res.assets[0].uri, ['qr']);
      if (found?.[0]?.data) open(found[0].data); else setErr('No Kumi QR code found in that photo.');
    } catch (e) { setErr(`Could not read that photo: ${(e as Error).message}`); }
  };
  return (
    <Screen>
      <SheetHeader title="Scan a join code" sub="Vote a friend into your crew: scan their code, a photo of it, or paste it" />
      <Card pad={10}>
        {IS_WEB ? <View style={{ height: 220, borderRadius: 20, backgroundColor: C.plum, alignItems: 'center', justifyContent: 'center', padding: 20 }}><Text style={{ color: '#fff', textAlign: 'center', fontSize: 14.5 }}>The camera scanner runs on the phone. In the web preview, paste the link below.</Text></View>
          : !perm ? <View style={{ height: 260 }} />
          : !perm.granted ? (
            <View style={{ height: 260, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16 }}>
              <Text style={{ fontSize: 14.5, color: C.ink2, textAlign: 'center' }}>Kumi needs the camera only to read invite QR codes.</Text>
              <Btn title="Allow camera" tone="plum" onPress={ask} />
            </View>
          ) : (
            <View style={{ height: 300, borderRadius: 20, overflow: 'hidden' }}>
              <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={handled ? undefined : r => open(r.data)} />
              <View pointerEvents="none" style={{ position: 'absolute', left: '18%', right: '18%', top: '15%', bottom: '15%', borderWidth: 4, borderColor: C.butter, borderRadius: 24 }} />
            </View>
          )}
      </Card>
      {!IS_WEB && <Btn title="Pick a photo of a QR" tone="white" icon="qr" onPress={fromPhoto} />}
      <Card pad={14}>
        <View style={{ gap: 8 }}>
          <Text style={st.h2}>Paste a code or account</Text>
          <TextInput testID="paste" value={paste} onChangeText={t => { setPaste(t); setErr(null); }} placeholder="kumi://invite/0/name.kumi-77b50457fb.testnet" placeholderTextColor={C.ink3} autoCapitalize="none" autoCorrect={false}
            style={{ height: 50, borderRadius: 16, backgroundColor: '#fff', borderWidth: 2, borderColor: C.edge, paddingHorizontal: 14, fontSize: 15, color: C.ink, fontFamily: F.mono, outlineStyle: 'none' } as any} />
          <Btn testID="open-paste" title="Open" tone="coral" disabled={!paste.trim()} onPress={() => open(paste)} />
        </View>
      </Card>
      {err && <Notice error>{err}</Notice>}
    </Screen>
  );
}
