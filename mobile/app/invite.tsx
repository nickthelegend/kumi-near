import { useState } from 'react';
import { Share, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { Text } from '../components/T';
import { Screen, SheetHeader } from '../components/Screen';
import { Avatar, Btn, Card, CrewAvatar, Notice, st } from '../components/ui';
import { C, F } from '../lib/theme';
import { useApp } from '../lib/store';

/**
 * Your join code: kumi://invite/<crew>/<your account>. A shareholder scans it (Chats → Scan) and their app drafts
 * `/invite <your account>` for the crew to vote on (the DAO role and the hub's admission gate).
 */
export default function Invite() {
  const { crew = '0', name = '' } = useLocalSearchParams<{ crew?: string; name?: string }>();
  const { account } = useApp();
  const [copied, setCopied] = useState(false);
  const me = account?.accountId ?? '';
  const link = `kumi://invite/${Number(crew) || 0}/${me}`;
  return (
    <Screen modal>
      <SheetHeader title="Your join code" sub={name ? `Show it to a ${name} member` : 'Show it to a crew member'} />
      <Card pad={18}>
        <View style={{ alignItems: 'center', gap: 14 }}>
          <View style={st.row}><CrewAvatar id={`crew-${Number(crew) || 0}`} size={44} /><Text style={{ fontWeight: '800', fontSize: 20, color: C.ink }}>{name || 'Kumi crew'}</Text></View>
          <View style={{ padding: 14, borderRadius: 24, backgroundColor: '#fff', borderWidth: 3, borderColor: C.edge }}>
            <QRCode value={link} size={220} color={C.plum2} backgroundColor="#fff" />
          </View>
          <View style={st.row}><Avatar address={me} size={30} /><Text selectable style={{ fontFamily: F.mono, fontSize: 12, color: C.ink2 }}>{me}</Text></View>
          <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
            <Btn title={copied ? 'Copied' : 'Copy'} tone="white" icon={copied ? 'check' : 'copy'} style={{ flex: 1 }} onPress={() => { Clipboard.setStringAsync(me).then(() => setCopied(true)).catch(() => {}); }} />
            <Btn title="Share" tone="coral" icon="send" style={{ flex: 1 }} onPress={() => { Share.share({ message: `Vote me into ${name || 'the crew'} on Kumi: /invite ${me}` }).catch(() => {}); }} />
          </View>
        </View>
      </Card>
      <Notice>A member scans this and sends /invite. When a majority of shareholders votes yes on both proposals, you can chip in.</Notice>
    </Screen>
  );
}
