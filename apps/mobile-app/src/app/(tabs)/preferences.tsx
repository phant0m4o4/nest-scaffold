import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/lib/theme';
import { usePreferencesStore } from '@/stores/preferences.store';

export default function PreferencesScreen() {
  const isCompact = usePreferencesStore((state) => state.isCompact);
  const setCompact = usePreferencesStore((state) => state.setCompact);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>MAKE IT YOURS</Text>
        <Text style={styles.title}>阅读偏好</Text>
        <Text style={styles.subtitle}>选择适合自己的浏览方式。</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.copy}>
              <Text style={styles.label}>紧凑列表</Text>
              <Text style={styles.description}>缩小卡片间距，隐藏创建时间</Text>
            </View>
            <Switch
              accessibilityLabel="紧凑列表"
              value={isCompact}
              onValueChange={setCompact}
              trackColor={{ true: colors.primary }}
            />
          </View>
          <Text style={styles.note}>此偏好在本次使用期间生效。</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: 24 },
  eyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 18,
  },
  title: { color: colors.text, fontSize: 32, fontWeight: '700', marginTop: 12 },
  subtitle: { color: colors.muted, fontSize: 15, marginTop: 10 },
  card: {
    marginTop: 30,
    padding: 22,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  copy: { flex: 1 },
  label: { color: colors.text, fontSize: 17, fontWeight: '600' },
  description: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 8,
    lineHeight: 20,
  },
  note: { color: colors.muted, fontSize: 12, marginTop: 24 },
});
