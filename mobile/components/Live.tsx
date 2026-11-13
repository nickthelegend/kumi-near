import { useEffect, useRef, useState } from 'react';
import { View, type StyleProp, type TextStyle } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient as SvgGrad, Path, Stop } from 'react-native-svg';
import { Text } from './T';
import { C } from '../lib/theme';

/** A number that counts to its new value when a live read changes it (no motion on first paint). */
export function CountUp({ value, format, style }: { value: number; format: (n: number) => string; style?: StyleProp<TextStyle> }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; from.current = value; setShown(value); return; }
    const a = from.current, b = value, t0 = Date.now(), dur = 900;
    if (a === b) return;
    let raf = 0;
    const step = () => {
      const k = Math.min(1, (Date.now() - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(a + (b - a) * e);
      if (k < 1) raf = requestAnimationFrame(step); else from.current = b;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <Text style={style}>{format(shown)}</Text>;
}

/** The green "connected" dot, breathing while the feed is live. */
export function LiveDot({ on = true, size = 8 }: { on?: boolean; size?: number }) {
  const s = useSharedValue(1);
  useEffect(() => {
    if (!on) return;
    s.value = withRepeat(withSequence(withTiming(2.2, { duration: 1100, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System }), withTiming(1, { duration: 0 })), -1, false, undefined, ReduceMotion.System);
  }, [on]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: s.value }], opacity: (2.2 - s.value) / 1.2 * 0.55 }));
  const col = on ? C.mint : C.ink3;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {on && <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: col }, ring]} />}
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: col }} />
    </View>
  );
}

/** Price-per-share (or any) series as a soft area line; the last point is marked. */
export function Spark({ data, width, height = 64, color = C.coral, fill = true }: { data: number[]; width: number; height?: number; color?: string; fill?: boolean }) {
  if (data.length < 2 || width <= 0) return <View style={{ width, height }} />;
  const min = Math.min(...data), max = Math.max(...data);
  const pad = (max - min) * 0.12 || Math.abs(max) * 0.01 || 1;
  const lo = min - pad, hi = max + pad;
  const x = (i: number) => (i / (data.length - 1)) * (width - 6) + 3;
  const y = (v: number) => 4 + (1 - (v - lo) / (hi - lo)) * (height - 8);
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${d} L${x(data.length - 1).toFixed(1)} ${height} L${x(0).toFixed(1)} ${height} Z`;
  const id = `g${color.replace('#', '')}`;
  return (
    <Svg width={width} height={height}>
      <Defs><SvgGrad id={id} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={color} stopOpacity={0.28} /><Stop offset="1" stopColor={color} stopOpacity={0} /></SvgGrad></Defs>
      {fill && <Path d={area} fill={`url(#${id})`} />}
      <Path d={d} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={x(data.length - 1)} cy={y(data[data.length - 1]!)} r={4.5} fill={color} stroke="#fff" strokeWidth={2} />
    </Svg>
  );
}
