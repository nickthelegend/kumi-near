import { Tabs } from 'expo-router';
import { TabBar } from '../../components/TabBar';
import { C } from '../../lib/theme';
import { useApp } from '../../lib/store';

export default function TabsLayout() {
  const { unread } = useApp();
  return (
    <Tabs tabBar={props => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.cream } }}>
      <Tabs.Screen name="index" options={{ title: 'Chats', tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined }} />
      <Tabs.Screen name="market" options={{ title: 'Market' }} />
      <Tabs.Screen name="top" options={{ title: 'Top' }} />
      <Tabs.Screen name="wallet" options={{ title: 'Wallet' }} />
    </Tabs>
  );
}
