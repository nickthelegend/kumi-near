import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Path, SvgXml } from 'react-native-svg';
import { txUrl, accountUrl } from '@kumi/sdk';
import { Text } from './T';
import { C, F, TONE, art, crewAnimal, crewTone, mascotOf, memberHue, type ObjName, type Tone } from '../lib/theme';
import { TOKEN_SVG } from '../lib/tokens';
import { isTestAccount, nameOf } from '../lib/near';

export const tap = () => { Haptics.selectionAsync().catch(() => {}); };
export const thud = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); };
export const yay = () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); };

/** The web's chunky card: white face, 3 px white rim, a solid 6 px "lip" underneath (box-shadow: 0 6px 0 var(--edge)). */
export function Card({ children, style, face = C.panel, edge = C.edge, radius = 28, pad = 16, lip = 6 }: { children: ReactNode; style?: StyleProp<ViewStyle>; face?: string; edge?: string; radius?: number; pad?: number; lip?: number }) {
  return (
    <View style={[{ borderRadius: radius, backgroundColor: edge, paddingBottom: lip }, style]}>
      <View style={{ borderRadius: radius, backgroundColor: face, borderWidth: 3, borderColor: face === C.panel ? '#fff' : 'rgba(255,255,255,0.0)', padding: pad, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}

type BtnTone = 'coral' | 'plum' | 'butter' | 'mint' | 'pink' | 'off' | 'ghost' | 'white';
const BTN: Record<BtnTone, { top: string; base: string; edge: string; ink: string }> = {
  coral: { top: C.coralTop, base: C.coral, edge: C.coralEdge, ink: '#fff' },
  plum: { top: '#5c3672', base: C.plum, edge: C.plumEdge, ink: '#fff' },
  butter: { top: C.butterTop, base: C.butter, edge: C.butterEdge, ink: C.plum2 },
  mint: { top: C.mintTop, base: C.mint, edge: C.mintEdge, ink: '#08311f' },
  pink: { top: '#ffe9f4', base: C.pinkSoft, edge: C.pinkEdge, ink: C.pinkInk },
  white: { top: '#fff', base: '#fff', edge: C.edge, ink: C.ink },
  off: { top: '#e9dccd', base: '#dccbb8', edge: '#c4ae96', ink: '#6c5a6c' },
  ghost: { top: 'transparent', base: 'transparent', edge: 'transparent', ink: C.ink2 },
};

/** The web's 3D pill button (.btn / .b3): gradient face, solid edge underneath, presses down 3 px. */
export function Btn({ title, onPress, tone = 'coral', busy, disabled, size = 'md', icon, style, testID }: {
  title: string; onPress?: () => unknown; tone?: BtnTone; busy?: boolean; disabled?: boolean; size?: 'sm' | 'md' | 'lg'; icon?: string; style?: StyleProp<ViewStyle>; testID?: string;
}) {
  const t = BTN[disabled ? 'off' : tone];
  const h = size === 'sm' ? 38 : size === 'lg' ? 56 : 48;
  const lip = tone === 'ghost' ? 0 : size === 'sm' ? 3 : 4;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      disabled={disabled || busy} onPress={() => { tap(); onPress?.(); }} style={style}>
      {({ pressed }) => (
        <View style={{ height: h + lip, justifyContent: 'flex-start' }}>
          <View style={{ position: 'absolute', left: 0, right: 0, top: lip, height: h, borderRadius: 999, backgroundColor: t.edge }} />
          <LinearGradient colors={[t.top, t.base]} locations={[0, 0.6]} style={[st.btn, { height: h, paddingHorizontal: size === 'sm' ? 14 : 22, transform: [{ translateY: pressed ? lip - 1 : 0 }] }]}>
            {busy ? <ActivityIndicator color={t.ink} /> : icon ? <Ic name={icon} size={size === 'sm' ? 15 : 18} color={t.ink} /> : null}
            <Text numberOfLines={1} style={{ color: t.ink, fontWeight: '700', fontSize: size === 'sm' ? 14 : size === 'lg' ? 17 : 15.5, letterSpacing: -0.1 }}>{title}</Text>
          </LinearGradient>
        </View>
      )}
    </Pressable>
  );
}

export function Chip({ text, tone = 'plum', dot, style, textStyle }: { text: string; tone?: Tone | 'grey'; dot?: boolean; style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle> }) {
  const [bg, ink] = tone === 'grey' ? [C.panel3, C.ink2] : [TONE[tone].soft, TONE[tone].ink];
  return (
    <View style={[st.chip, { backgroundColor: bg }, style]}>
      {dot && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tone === 'mint' ? C.mint : ink }} />}
      <Text style={[{ color: ink, fontWeight: '700', fontSize: 12 }, textStyle]}>{text}</Text>
    </View>
  );
}

/** A member: one of the clay crew mascots on a colour picked from the address (same picks as the web). */
export function Avatar({ address, size = 34, ring }: { address: string; size?: number; ring?: string }) {
  const name = nameOf(address);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: memberHue(address), overflow: 'hidden', alignItems: 'center', borderWidth: ring ? 2.5 : 0, borderColor: ring }}>
      <Image source={art.animals[mascotOf(address, name)]} style={{ width: size * 1.25, height: size * 1.25, marginTop: size * 0.12 }} contentFit="contain" />
    </View>
  );
}

/** A crew or channel: rounded tile in its tone with its mascot (web .crew-av). */
export function CrewAvatar({ id, size = 48 }: { id: string; size?: number }) {
  const t = TONE[crewTone(id)];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 3, backgroundColor: t.base, overflow: 'hidden', alignItems: 'center' }}>
      <Image source={art.animals[crewAnimal(id)]} style={{ width: size * 1.18, height: size * 1.18, marginTop: size * 0.1 }} contentFit="contain" />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: 'rgba(0,0,0,0.1)' }} />
    </View>
  );
}

/** Real token logo in a white coin; `test` marks Kumi's testnet pool tokens (tSOL, tBTC). */
export function TokenLogo({ sym, size = 28, test }: { sym: string; size?: number; test?: boolean }) {
  const s = sym.replace(/^t(?=[A-Z])/, '').toUpperCase();
  const svg = TOKEN_SVG[s];
  return (
    <View accessibilityLabel={test ? `Test ${s}` : s} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line }}>
      {svg ? <SvgXml xml={svg} width={size * 0.82} height={size * 0.82} /> : <Text style={{ fontSize: size * 0.32, fontWeight: '800', color: C.ink }}>{s.slice(0, 4)}</Text>}
      {test && size >= 26 && <View style={{ position: 'absolute', bottom: -4, right: -6, backgroundColor: C.butter, borderRadius: 6, paddingHorizontal: 3 }}><Text style={{ fontSize: 8, fontWeight: '800', color: C.plum2 }}>test</Text></View>}
    </View>
  );
}

/** One object from the Kumi 3D kit. Floats 4 px over 5.6 s like the web; still when the OS asks for reduced motion. */
export function Obj({ name, size = 64, still }: { name: ObjName; size?: number; still?: boolean }) {
  const y = useSharedValue(0);
  useEffect(() => {
    if (still || name === 'warning') return;
    y.value = withRepeat(withSequence(withTiming(-4, { duration: 2800, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.System }), withTiming(0, { duration: 2800, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.System })), -1, false, undefined, ReduceMotion.System);
  }, [still, name]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={a}><Image source={art.obj[name]} style={{ width: size, height: size }} contentFit="contain" /></Animated.View>;
}

export function Empty({ obj = 'empty', image, scene, alt, title, body, action }: { obj?: ObjName; image?: any; scene?: any; alt?: string; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 18, paddingHorizontal: 14, gap: 8 }}>
      {scene ? <Image source={scene} accessibilityLabel={alt} accessible={!!alt} style={{ width: 150, height: 150 }} contentFit="contain" />
        : image ? <Image source={image} style={{ width: 200, height: 140, borderRadius: 20 }} contentFit="cover" /> : <Obj name={obj} size={92} />}
      <Text style={{ fontWeight: '800', fontSize: 19, color: C.ink, textAlign: 'center' }}>{title}</Text>
      {body ? <Text style={{ fontSize: 14.5, lineHeight: 21, color: C.ink2, textAlign: 'center' }}>{body}</Text> : null}
      {action}
    </View>
  );
}

/** Shimmer-free skeleton bars (reduced motion safe). */
export function Skeleton({ rows = 3, height = 64 }: { rows?: number; height?: number }) {
  return (
    <View style={{ gap: 10 }} accessibilityLabel="Loading">
      {Array.from({ length: rows }, (_, i) => <View key={i} style={{ height, borderRadius: 20, backgroundColor: C.panel3, opacity: 1 - i * 0.18 }} />)}
    </View>
  );
}

export function Notice({ children, error, style }: { children: ReactNode; error?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View accessibilityRole={error ? 'alert' : undefined} style={[{ flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12, borderRadius: 16, backgroundColor: error ? C.pinkSoft : C.butterSoft, borderWidth: error ? 1.5 : 0, borderColor: 'rgba(255,143,199,0.7)' }, style]}>
      {error && <Obj name="warning" size={34} still />}
      <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: error ? C.ink : C.ink2, fontWeight: '500' }}>{children}</Text>
    </View>
  );
}

/** Kumi's mark: the rainbow tile with the cream ring (web .brand-mark), plus the wordmark. */
export function Brand({ size = 30, label = true }: { size?: number; label?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <LinearGradient colors={[C.coral, C.pink, C.butter, C.mint]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={{ width: size, height: size, borderRadius: size * 0.34, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: size * 0.5, height: size * 0.5, borderRadius: size, backgroundColor: C.cream, borderWidth: size * 0.125, borderColor: C.plum }} />
      </LinearGradient>
      {label && <Text style={{ fontFamily: F.display, fontSize: size * 0.8, color: C.coral, letterSpacing: -0.5, lineHeight: size * 1.05 }}>Kumi<Text style={{ fontSize: 12, color: C.ink3, fontFamily: undefined }}> 組</Text></Text>}
    </View>
  );
}

/** A caller's on-chain reputation next to their name: rank and win rate from the leaderboard (crown for the top 3). */
export function CallerBadge({ rank, winRate, light }: { rank: number; winRate: number | null; light?: boolean }) {
  if (winRate === null) return null;
  return (
    <View testID="caller-badge" accessibilityLabel={`Caller rank ${rank}, ${Math.round(winRate * 100)}% wins`} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingLeft: rank <= 3 && winRate >= 0.5 ? 2 : 6, paddingRight: 6, height: 18, borderRadius: 9, backgroundColor: light ? 'rgba(255,255,255,0.92)' : C.butterSoft }}>
      {rank <= 3 && winRate >= 0.5 && <Image source={art.obj.crown} style={{ width: 15, height: 15 }} contentFit="contain" />}
      <Text style={{ fontSize: 10.5, fontWeight: '800', color: C.butterInk }}>#{rank} · {Math.round(winRate * 100)}%</Text>
    </View>
  );
}

/** "Kumi test account" tag next to the names of Kumi's own seeded accounts. */
export function TestTag({ address }: { address: string }) {
  if (!isTestAccount(address)) return null;
  return <View style={{ paddingHorizontal: 5, height: 16, borderRadius: 5, backgroundColor: C.plumSoft, justifyContent: 'center' }}><Text style={{ fontSize: 9.5, fontWeight: '700', color: C.plum3 }}>test acct</Text></View>;
}

export function TxLink({ hash, label, color = C.ink2 }: { hash: string; label?: string; color?: string }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${label ?? 'Transaction'} on NearBlocks`} onPress={() => Linking.openURL(txUrl(hash))} hitSlop={8}>
      <Text style={{ fontFamily: F.mono, fontSize: 11, color, textDecorationLine: 'underline', textDecorationStyle: 'dashed' }}>{label ? `${label} · ` : ''}{hash.slice(0, 6)}…{hash.slice(-4)}</Text>
    </Pressable>
  );
}
export function AddrLink({ a, label }: { a: string; label?: string }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL(accountUrl(a))} hitSlop={8}>
      <Text style={{ fontFamily: F.mono, fontSize: 11.5, color: C.ink2, textDecorationLine: 'underline' }}>{label ?? a}</Text>
    </Pressable>
  );
}

const PATHS: Record<string, string> = {
  send: 'M4 12l16-8-6 16-2.5-6.5L4 12z', arrow: 'M5 12h14M13 6l6 6-6 6', back: 'M19 12H5M11 6l-6 6 6 6', check: 'M5 12.5l4.5 4.5L19 7.5', x: 'M6 6l12 12M18 6L6 18',
  chat: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H10l-4 3.5V17H6a2 2 0 0 1-2-2z',
  crews: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2.5 19a5.5 5.5 0 0 1 11 0M10.5 19a5.5 5.5 0 0 1 11 0',
  jar: 'M8 3h8M7 6h10M7 6l-1 3v9a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V9l-1-3M9 13h6',
  thumb: 'M7 11v9H4v-9zM7 11l4-7a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 20H7',
  thumbDown: 'M17 13V4h3v9zM17 13l-4 7a2 2 0 0 1-2-2v-4H6a2 2 0 0 1-2-2.3l1.2-6A2 2 0 0 1 7.2 4H17',
  exit: 'M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10', plus: 'M12 6v12M6 12h12',
  key: 'M14.5 9.5a4.5 4.5 0 1 0-3.9 4.46L10 15h-2v2H6v2H3v-3l6.04-6.04A4.5 4.5 0 0 0 14.5 9.5zM15.5 8.5h.01',
  chart: 'M4 19h16M6 15l4-4 3 3 5-6', bolt: 'M13 3L5 13h6l-1 8 8-10h-6z',
  book: 'M4 6h7M4 10h5M4 14h8M4 18h4M14 6h6M16 10h4M13 14h7M17 18h3',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2', copy: 'M9 9h10v10H9zM5 15V5h10',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z',
  wallet: 'M4 7a2 2 0 0 1 2-2h11v4M4 7v10a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2zM16 14h.01',
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 9.5c0-1 1.3-1.8 3-1.8s3 .8 3 1.8-1.3 1.6-3 1.9-3 .9-3 1.9 1.3 1.8 3 1.8 3-.8 3-1.8M12 6v1.7M12 16.3V18',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 15v2',
  eye: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4.5M16 6h3a3 3 0 0 1-3 4.5M12 13v4M8.5 20h7M10 17h4',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  spark: 'M11 3l1.9 5.6L18.5 10.5l-5.6 1.9L11 18l-1.9-5.6L3.5 10.5l5.6-1.9zM18.5 3.5v3M17 5h3',
};
export function Ic({ name, size = 18, color = C.ink }: { name: string; size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d={PATHS[name] ?? PATHS.x!} stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

/** "3 min ago" from a unix second. */
export function ago(ts: number): string {
  const s = Math.max(0, Math.round(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function useBusy() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (label: string, fn: (step: (l: string) => void) => Promise<void>) => {
    setBusy(label); setError(null);
    try { await fn(l => setBusy(l)); yay(); } catch (e: any) { setError(e?.message ?? String(e)); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}); } finally { setBusy(null); }
  };
  return { busy, error, setError, run };
}

export const st = StyleSheet.create({
  btn: { borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  chip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 26, paddingHorizontal: 10, borderRadius: 999 },
  h1: { fontWeight: '800', fontSize: 28, lineHeight: 34, color: C.ink, letterSpacing: -0.5 },
  h2: { fontWeight: '800', fontSize: 19, color: C.ink, letterSpacing: -0.2 },
  k: { fontWeight: '700', fontSize: 12.5, color: C.ink3 },
  body: { fontWeight: '400', fontSize: 15, lineHeight: 21, color: C.ink2 },
  mono: { fontFamily: F.mono, fontSize: 13, color: C.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
});
