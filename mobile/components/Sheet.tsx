import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './T';
import { Ic, st } from './ui';
import { C } from '../lib/theme';

/** Bottom sheet used by the chat room and the wallet (cream face, grab handle, close button). */
export function Sheet({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} visible>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(42,20,54,0.45)' }} onPress={onClose} accessibilityLabel="Close" />
      <View style={{ backgroundColor: C.cream, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 18, paddingBottom: insets.bottom + 18, gap: 14, maxHeight: '88%' }}>
        <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: C.line2 }} />
        <View style={st.between}>
          <Text style={{ fontWeight: '800', fontSize: 22, color: C.ink }}>{title}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}><Ic name="x" size={20} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </Modal>
  );
}

export const inp = { height: 50, borderRadius: 16, backgroundColor: '#fff', borderWidth: 2, borderColor: C.edge, paddingHorizontal: 14, fontSize: 16, color: C.ink, outlineStyle: 'none' } as any;
