import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, withSpring, ReduceMotion } from 'react-native-reanimated';
import type { BottomTabBarProps } from 'expo-router/build/layouts/Tabs';
import { Text } from './T';
import { Ic, tap } from './ui';
import { C } from '../lib/theme';

const ICON: Record<string, string> = { index: 'chat', market: 'chart', top: 'trophy', wallet: 'wallet' };
/** Space screens leave at the bottom for the floating tab bar. */
export const TAB_SPACE = 104;

/** The web's phone nav (room-375): a plum bar, the active tab a coral 3D pill that springs between tabs. */
export function TabBar({ state, descriptors, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const n = state.routes.length;
  const [w, setW] = useState(0);
  const slot = (w - 12) / n;
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: withSpring(state.index * slot, { damping: 18, stiffness: 220, reduceMotion: ReduceMotion.System }) }] }), [state.index, slot]);
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, bottom: Math.max(insets.bottom - 6, 10) }}>
      <View style={{ borderRadius: 26, backgroundColor: C.plumEdge, paddingBottom: 5 }}>
        <View onLayout={e => setW(e.nativeEvent.layout.width)} style={{ height: 66, borderRadius: 26, backgroundColor: C.plum, flexDirection: 'row', paddingHorizontal: 6, alignItems: 'center' }}>
          {w > 0 && <Animated.View style={[{ position: 'absolute', left: 6, top: 7, bottom: 7, width: slot, paddingHorizontal: 4 }, pill]}>
            <View style={{ flex: 1, borderRadius: 18, backgroundColor: C.coralEdge, paddingBottom: 3 }}>
              <View style={{ flex: 1, borderRadius: 18, backgroundColor: C.coral }} />
            </View>
          </Animated.View>}
          {state.routes.map((r, i) => {
            const on = state.index === i;
            const label = descriptors[r.key]!.options.title ?? r.name;
            const badge = descriptors[r.key]!.options.tabBarBadge;
            return (
              <Pressable key={r.key} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: on }} testID={`tab-${r.name}`}
                onPress={() => { tap(); if (!on) navigateToTab(r.key); }} style={{ flex: 1, height: 66, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                <View>
                  <Ic name={ICON[r.name] ?? 'chat'} size={20} color={on ? '#fff' : 'rgba(255,255,255,0.62)'} />
                  {badge ? <View style={{ position: 'absolute', top: -6, right: -12, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.butter, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}><Text style={{ fontSize: 10.5, fontWeight: '800', color: C.plum2 }}>{String(badge)}</Text></View> : null}
                </View>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: on ? '#fff' : 'rgba(255,255,255,0.62)' }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}
