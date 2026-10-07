import { Tabs } from 'expo-router';
import { Text } from 'react-native';

import { colors } from '@/lib/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '发现',
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 22 }}>▦</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="preferences"
        options={{
          title: '偏好',
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 22 }}>☷</Text>
          ),
        }}
      />
    </Tabs>
  );
}
