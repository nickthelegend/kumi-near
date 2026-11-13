import type { ReactNode } from 'react';
import { Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Text } from './T';
import { Ic, tap } from './ui';
import { C } from '../lib/theme';
import { TAB_SPACE } from './TabBar';

/** The web's page background: butter fading to cream (body gradient in styles.css). */
export function Backdrop() {
  return <LinearGradient colors={['#ffe3a3', '#fff0cf', C.cream]} locations={[0, 0.3, 0.7]} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 760 }} pointerEvents="none" />;
}

export function Screen({ children, scroll = true, tabs, pad = 16, style }: { children: ReactNode; scroll?: boolean; tabs?: boolean; pad?: number; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  const body = { paddingTop: insets.top + 8, paddingHorizontal: pad, paddingBottom: (tabs ? TAB_SPACE : 24) + insets.bottom, gap: 16 };
  return (
    <View style={{ flex: 1, backgroundColor: C.cream }}>
      <Backdrop />
      {scroll ? <ScrollView contentContainerStyle={[body, style]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{children}</ScrollView> : <View style={[{ flex: 1 }, body, style]}>{children}</View>}
      {/* Status-bar scrim: scrolled content never runs under the clock or the Dynamic Island (same cream as the chat header). */}
      {insets.top > 0 && <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: insets.top, backgroundColor: 'rgba(255,240,207,0.96)' }} />}
    </View>
  );
}

/** Modal / sheet header: title, optional subtitle, and a close (or back) button. */
export function SheetHeader({ title, sub, back }: { title: string; sub?: string; back?: boolean }) {
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '800', fontSize: 24, color: C.ink, letterSpacing: -0.3 }}>{title}</Text>
        {sub ? <Text style={{ fontSize: 14, color: C.ink2, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={back ? 'Back' : 'Close'} onPress={() => { tap(); router.canGoBack() ? router.back() : router.replace('/'); }} hitSlop={10}
        style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.edge }}>
        <Ic name={back ? 'back' : 'x'} size={18} color={C.ink} />
      </Pressable>
    </View>
  );
}
