import { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { BottomTabBarProps } from 'expo-router/build/layouts/Tabs';
import { Text } from './T';
import { C } from '../lib/theme';

/** Space screens leave at the bottom for the floating tab bar and its raised centre button. */
export const TAB_SPACE = 118;
const BAR_H = 70;
const BLOB = 52;
const RM = ReduceMotion.System;

/** Kumi's tab icons: chunky rounded shapes, filled when the tab is active (no labels; each tab has an accessibility label). */
function TabIcon({ name, on }: { name: string; on: boolean }) {
  const ink = on ? '#fff' : 'rgba(255,244,230,0.62)';
  const fill = on ? '#fff' : 'none';
  const cut = on ? C.coral : 'none';
  const sw = 2.4;
  return (
    <Svg width={28} height={28} viewBox="0 0 28 28">
      {name === 'index' && <>
        <Path d="M5 8.5A4.5 4.5 0 0 1 9.5 4h9A4.5 4.5 0 0 1 23 8.5v6a4.5 4.5 0 0 1-4.5 4.5H12l-5 4v-4.3A4.5 4.5 0 0 1 5 14.5z" stroke={ink} strokeWidth={sw} fill={fill} strokeLinejoin="round" />
        <Circle cx={10.5} cy={11.6} r={1.6} fill={on ? cut : ink} /><Circle cx={14} cy={11.6} r={1.6} fill={on ? cut : ink} /><Circle cx={17.5} cy={11.6} r={1.6} fill={on ? cut : ink} />
      </>}
      {name === 'market' && <>
        <Rect x={5} y={12} width={4.6} height={9} rx={1.8} stroke={on ? 'none' : ink} strokeWidth={sw} fill={fill} />
        <Rect x={11.7} y={5.5} width={4.6} height={15.5} rx={1.8} stroke={on ? 'none' : ink} strokeWidth={sw} fill={fill} />
        <Rect x={18.4} y={9} width={4.6} height={12} rx={1.8} stroke={on ? 'none' : ink} strokeWidth={sw} fill={fill} />
        <Path d="M4 24.5h20" stroke={ink} strokeWidth={sw} strokeLinecap="round" />
      </>}
      {name === 'top' && <>
        <Path d="M4.5 9.5l5 4.5L14 6l4.5 8 5-4.5-2 11.5h-15z" stroke={ink} strokeWidth={sw} fill={fill} strokeLinejoin="round" />
        <Circle cx={14} cy={17} r={1.8} fill={on ? cut : ink} />
      </>}
      {name === 'wallet' && <>
        <Path d="M5 9a3.5 3.5 0 0 1 3.5-3.5h11.5v4" stroke={ink} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <Rect x={4.5} y={9} width={19} height={14} rx={4} stroke={ink} strokeWidth={sw} fill={fill} />
        <Circle cx={18.5} cy={16} r={1.9} fill={on ? cut : ink} />
      </>}
    </Svg>
  );
}

/** The crew button's mark: two friends' heads over a coin (crew + fund). */
function CrewMark() {
  return (
    <Svg width={30} height={30} viewBox="0 0 30 30">
      <Circle cx={10} cy={9} r={4.2} fill="#fff" /><Circle cx={20} cy={9} r={4.2} fill="#fff" />
      <Path d="M3.5 21a6.5 6.5 0 0 1 13 0M13.5 21a6.5 6.5 0 0 1 13 0" stroke="#fff" strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <Circle cx={15} cy={22.5} r={5} fill={C.butter} stroke={C.coralEdge} strokeWidth={1.6} />
      <Path d="M15 20.2v4.6M13.3 21.4h3.4" stroke={C.plum2} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

function TabButton({ name, label, on, badge, onPress }: { name: string; label: string; on: boolean; badge?: string | number; onPress: () => void }) {
  const s = useSharedValue(1);
  useEffect(() => { if (on) s.value = withSequence(withTiming(0.82, { duration: 90, reduceMotion: RM }), withSpring(1, { damping: 7, stiffness: 260, reduceMotion: RM })); }, [on]);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }, { translateY: on ? -1 : 0 }] }));
  return (
    <Pressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: on }} testID={`tab-${name}`} hitSlop={6}
      onPress={onPress} style={{ flex: 1, height: BAR_H, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={a}>
        <TabIcon name={name} on={on} />
        {badge ? <View style={{ position: 'absolute', top: -5, right: -9, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.butter, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: C.plum }}><Text style={{ fontSize: 10, fontWeight: '800', color: C.plum2 }}>{String(badge)}</Text></View> : null}
      </Animated.View>
    </Pressable>
  );
}

/**
 * Kumi's tab bar: a floating plum pill with icon-only tabs (each with an accessibility label), a coral blob that springs
 * to the active tab and squashes as it travels, a light haptic per switch, and a raised coral centre button that opens
 * the crew room (chat, votes, chip in).
 */
export function TabBar({ state, descriptors, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [w, setW] = useState(0);
  const slots = state.routes.length + 1;             // one slot in the middle for the crew button
  const slot = w / slots;
  const slotOf = (i: number) => (i < Math.floor(state.routes.length / 2) ? i : i + 1);
  const x = useSharedValue(0);
  const stretch = useSharedValue(1);
  useEffect(() => {
    if (!slot) return;
    const target = slotOf(state.index) * slot + (slot - BLOB) / 2;
    if (x.value === 0) { x.value = target; return; }
    x.value = withSpring(target, { damping: 14, stiffness: 190, mass: 0.9, reduceMotion: RM });
    stretch.value = withSequence(withTiming(1.45, { duration: 120, reduceMotion: RM }), withSpring(1, { damping: 8, stiffness: 220, reduceMotion: RM }));
  }, [state.index, slot]);
  const blob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { scaleX: stretch.value }, { scaleY: 1.4 - 0.4 * stretch.value }] }));
  const crew = useSharedValue(1);
  const crewStyle = useAnimatedStyle(() => ({ transform: [{ scale: crew.value }] }));
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom - 8, 12) }}>
      <View style={{ borderRadius: 30, backgroundColor: C.plumEdge, paddingBottom: 5, shadowColor: C.plum2, shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } }}>
        <LinearGradient colors={['#4a2759', C.plum]} style={{ height: BAR_H, borderRadius: 30, overflow: 'hidden' }}>
          <View onLayout={e => setW(e.nativeEvent.layout.width)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
            {w > 0 && (
              <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: (BAR_H - BLOB) / 2, width: BLOB, height: BLOB }, blob]}>
                <View style={{ flex: 1, borderRadius: BLOB / 2, backgroundColor: C.coralEdge, paddingBottom: 3 }}>
                  <LinearGradient colors={[C.coralTop, C.coral]} style={{ flex: 1, borderRadius: BLOB / 2 }} />
                </View>
              </Animated.View>
            )}
            {state.routes.map((r, i) => {
              const on = state.index === i;
              const opts = descriptors[r.key]!.options;
              const btn = <TabButton key={r.key} name={r.name} label={opts.title ?? r.name} on={on} badge={opts.tabBarBadge as any}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); if (!on) navigateToTab(r.key); }} />;
              return i === Math.floor(state.routes.length / 2) ? [<View key="gap" style={{ flex: 1 }} />, btn] : btn;
            })}
          </View>
        </LinearGradient>
      </View>
      {/* raised centre button: the crew room */}
      <Animated.View pointerEvents="box-none" style={[{ position: 'absolute', left: 0, right: 0, top: -24, alignItems: 'center' }, crewStyle]}>
        <Pressable testID="tab-crew" accessibilityRole="button" accessibilityLabel="Open your crew"
          onPressIn={() => { crew.value = withTiming(0.9, { duration: 80, reduceMotion: RM }); }}
          onPressOut={() => { crew.value = withSpring(1, { damping: 6, stiffness: 260, reduceMotion: RM }); }}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); router.push('/chat/c-0'); }}>
          <View style={{ width: 74, height: 74, borderRadius: 37, backgroundColor: C.cream, alignItems: 'center', justifyContent: 'center', shadowColor: C.coralEdge, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.coralEdge, paddingBottom: 4 }}>
              <LinearGradient colors={[C.coralTop, C.coral, '#ff5f6d']} locations={[0, 0.55, 1]} style={{ flex: 1, borderRadius: 32, alignItems: 'center', justifyContent: 'center' }}>
                <CrewMark />
              </LinearGradient>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}
