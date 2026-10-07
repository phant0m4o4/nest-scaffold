import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { QueryProvider } from '@/lib/query-provider';
import { colors } from '@/lib/theme';

export default function RootLayout() {
  return (
    <QueryProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ title: '发现' }} />
        <Stack.Screen name="demos/[publicId]" options={{ title: '示例详情' }} />
      </Stack>
    </QueryProvider>
  );
}
