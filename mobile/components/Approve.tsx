import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './T';
import { Btn } from './ui';
import { C, F } from '../lib/theme';
import { setApprover, type Approval } from '../lib/near';

/** The Approve bottom sheet. Every call the on-device key signs waits here first: Reject signs nothing.
 *  It is a window-level overlay so it also sits above any other open sheet. */
export function ApproveHost() {
  const [req, setReq] = useState<Approval | null>(null);
  const done = useRef<((ok: boolean) => void) | null>(null);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    setApprover(a => new Promise<boolean>(res => { done.current = res; setReq(a); }));
    return () => setApprover(null);
  }, []);
  if (!req) return null;
  const close = (ok: boolean) => { const d = done.current; done.current = null; setReq(null); d?.(ok); };
  const body = (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', backgroundColor: 'rgba(42,20,54,0.5)' }} testID="approve-sheet">
      <View style={{ backgroundColor: C.cream, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 18, paddingBottom: insets.bottom + 18, gap: 12 }}>
        <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: C.line2 }} />
        <Text style={{ fontFamily: F.display, fontSize: 24, color: C.ink, lineHeight: 28 }}>{req.title}</Text>
        <Text style={{ fontSize: 12, color: C.ink3, fontWeight: '700', letterSpacing: 0.4 }}>SIGNED WITH THE KEY ON THIS PHONE · TEST ACCOUNT</Text>
        <View style={{ backgroundColor: '#fff', borderRadius: 18, borderWidth: 2, borderColor: C.edge, paddingHorizontal: 14, paddingVertical: 4 }}>
          {req.rows.map(([k, v], i) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderColor: C.line }}>
              <Text style={{ color: C.ink3, fontSize: 13, fontWeight: '600' }}>{k}</Text>
              <Text style={{ color: C.ink, fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'right' }}>{v}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable onPress={() => close(false)} accessibilityRole="button" accessibilityLabel="Reject" testID="approve-reject"
            style={{ flex: 1, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.edge, backgroundColor: '#fff' }}>
            <Text style={{ fontWeight: '800', color: C.ink2, fontSize: 16 }}>Reject</Text>
          </Pressable>
          <View style={{ flex: 1.4 }}><Btn title="Approve" tone="coral" onPress={() => close(true)} testID="approve-ok" /></View>
        </View>
      </View>
    </View>
  );
  return Platform.OS === 'ios' ? <FullWindowOverlay>{body}</FullWindowOverlay> : body;
}
