import type { DemoType, PublicDemo } from '@nest-scaffold/contracts';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/lib/theme';

export const DEMO_TYPE_LABELS: Record<DemoType, string> = {
  TYPE_1: '类型一',
  TYPE_2: '类型二',
  TYPE_3: '类型三',
};

interface IDemoCardProps {
  demo: PublicDemo;
  isCompact: boolean;
}

export function DemoCard({ demo, isCompact }: IDemoCardProps) {
  return (
    <Link
      href={{
        pathname: '/demos/[publicId]',
        params: { publicId: demo.publicId },
      }}
      asChild
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`查看 ${demo.name} 的详情`}
        style={({ pressed }) => [
          styles.card,
          isCompact && styles.compact,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.heading}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{DEMO_TYPE_LABELS[demo.type]}</Text>
          </View>
          <Text style={styles.id}>{demo.shortPublicId}</Text>
        </View>
        <Text style={styles.name}>{demo.name}</Text>
        <View style={styles.footer}>
          {!isCompact && (
            <Text style={styles.date}>
              创建于 {new Date(demo.createdAt).toLocaleDateString('zh-CN')}
            </Text>
          )}
          <Text style={styles.more}>查看详情 →</Text>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 20,
    marginBottom: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  compact: { padding: 16, marginBottom: 8 },
  pressed: { opacity: 0.65 },
  heading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  badge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  badgeText: { color: colors.primary, fontSize: 11, fontWeight: '600' },
  id: { flexShrink: 1, color: colors.muted, fontSize: 11 },
  name: { color: colors.text, fontSize: 18, fontWeight: '600', marginTop: 14 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 14,
  },
  date: { color: colors.muted, fontSize: 12 },
  more: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 'auto',
  },
});
