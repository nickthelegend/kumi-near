import '../lib/polyfills';
import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Baloo2_600SemiBold, Baloo2_700Bold, Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import { Urbanist_400Regular, Urbanist_500Medium, Urbanist_600SemiBold, Urbanist_700Bold, Urbanist_800ExtraBold } from '@expo-google-fonts/urbanist';
import { AppProvider, useApp } from '../lib/store';
import { C } from '../lib/theme';
import { Brand } from '../components/ui';
import { ApproveHost } from '../components/Approve';

function Gate() {
  const { ready, account, onboarded } = useApp();
  const segments = useSegments();
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    const inOnboarding = segments[0] === 'onboarding' || segments[0] === 'backup';
    if ((!account || !onboarded) && !inOnboarding) router.replace('/onboarding');
  }, [ready, account, onboarded, segments]);
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.cream }, animation: 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
      <Stack.Screen name="chat/[id]" options={{ gestureEnabled: true }} />
      <Stack.Screen name="scan" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="invite" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="fund" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="backup" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
    </Stack>
  );
}

export default function Root() {
  const [loaded] = useFonts({ Baloo2_600SemiBold, Baloo2_700Bold, Baloo2_800ExtraBold, Urbanist_400Regular, Urbanist_500Medium, Urbanist_600SemiBold, Urbanist_700Bold, Urbanist_800ExtraBold, SpaceMono_400Regular, SpaceMono_700Bold });
  if (!loaded)
    return (
      <View style={{ flex: 1, backgroundColor: C.cream, alignItems: 'center', justifyContent: 'center' }}>
        <Brand size={44} label={false} />
      </View>
    );
  return (
    <View style={{ flex: 1, backgroundColor: C.cream }}>
      <AppProvider>
        <StatusBar style="dark" />
        <Gate />
        <ApproveHost />
      </AppProvider>
    </View>
  );
}
