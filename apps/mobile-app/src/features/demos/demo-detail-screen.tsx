import { demoPublicIdSchema } from '@nest-scaffold/contracts';
import { skipToken, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/action-button';
import { DEMO_TYPE_LABELS } from '@/features/demos/demo-card';
import { apiClient } from '@/lib/api';
import { colors } from '@/lib/theme';

export function DemoDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ publicId?: string | string[] }>();
  const parsedId = demoPublicIdSchema.safeParse(params.publicId);
  const publicId = parsedId.success ? parsedId.data : undefined;
  const query = useQuery({
    queryKey: ['public-demos', 'detail', publicId],
    queryFn: publicId
      ? ({ signal }) => apiClient.getPublicDemo(publicId, { signal })
      : skipToken,
  });
  const demo = query.data?.data;
  const refresh = () => {
    // 手动刷新失败时由 Query 状态呈现，保留已加载内容。
    void query.refetch();
  };
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          publicId ? (
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={refresh}
              tintColor={colors.primary}
            />
          ) : undefined
        }
      >
        <View style={styles.navigation}>
          <ActionButton label="返回发现" onPress={goBack} secondary />
          <Text style={styles.eyebrow}>示例详情</Text>
        </View>

        {!publicId ? (
          <View style={styles.state}>
            <Text style={styles.stateTitle} accessibilityRole="alert">
              无效的示例链接
            </Text>
            <Text style={styles.stateCopy}>请返回发现页，重新选择内容。</Text>
          </View>
        ) : query.isPending ? (
          <View style={styles.state}>
            {query.fetchStatus === 'paused' ? (
              <>
                <Text style={styles.stateTitle}>等待网络连接</Text>
                <Text style={styles.stateCopy}>连接恢复后会自动加载内容。</Text>
              </>
            ) : (
              <>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={styles.stateCopy}>正在加载详情…</Text>
              </>
            )}
          </View>
        ) : !demo && query.isError ? (
          <View style={styles.state}>
            <Text style={styles.stateTitle} accessibilityRole="alert">
              暂时无法加载详情
            </Text>
            <Text style={styles.stateCopy}>请检查网络连接，稍后再试。</Text>
            <ActionButton
              label="重新加载"
              onPress={refresh}
              disabled={query.isFetching}
            />
          </View>
        ) : !demo ? (
          <View style={styles.state}>
            <Text style={styles.stateTitle}>未找到这条示例</Text>
            <Text style={styles.stateCopy}>
              内容可能已被删除，请返回发现页浏览其他示例。
            </Text>
            <ActionButton
              label="重新加载"
              onPress={refresh}
              disabled={query.isFetching}
            />
          </View>
        ) : (
          <>
            {query.fetchStatus === 'paused' && (
              <Text style={styles.notice} accessibilityRole="alert">
                网络已断开，当前显示上次加载的内容。
              </Text>
            )}
            {query.isError && (
              <View style={styles.errorBanner} accessibilityRole="alert">
                <Text style={styles.errorText}>
                  刷新失败，当前显示上次加载的内容。
                </Text>
                <ActionButton label="重试" onPress={refresh} secondary />
              </View>
            )}
            <View style={styles.card}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {DEMO_TYPE_LABELS[demo.type]}
                </Text>
              </View>
              <Text style={styles.title} selectable>
                {demo.name}
              </Text>
              <Text style={styles.subtitle}>每一个示例，都有自己的故事。</Text>
              <View style={styles.fields}>
                <View style={styles.field}>
                  <Text style={styles.label}>公开编号</Text>
                  <Text style={styles.value} selectable>
                    {demo.publicId}
                  </Text>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>短编号</Text>
                  <Text style={styles.value} selectable>
                    {demo.shortPublicId}
                  </Text>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>创建时间</Text>
                  <Text style={styles.value}>
                    {new Date(demo.createdAt).toLocaleString('zh-CN')}
                  </Text>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>更新时间</Text>
                  <Text style={styles.value}>
                    {new Date(demo.updatedAt).toLocaleString('zh-CN')}
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.refresh}>
              <ActionButton
                label={query.isFetching ? '刷新中…' : '刷新详情'}
                onPress={refresh}
                disabled={query.isFetching}
                secondary
              />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    padding: 24,
    paddingBottom: 40,
  },
  navigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 28,
  },
  eyebrow: { color: colors.muted, fontSize: 13 },
  card: {
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  badgeText: { color: colors.primary, fontSize: 12, fontWeight: '600' },
  title: { color: colors.text, fontSize: 28, fontWeight: '700', marginTop: 20 },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 22,
    marginTop: 12,
  },
  fields: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 28,
    paddingTop: 24,
    gap: 24,
  },
  field: { gap: 8 },
  label: { color: colors.muted, fontSize: 12 },
  value: { color: colors.text, fontSize: 14, lineHeight: 22, flexShrink: 1 },
  refresh: { alignItems: 'center', marginTop: 24 },
  state: {
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  stateTitle: { color: colors.text, fontSize: 20, fontWeight: '600' },
  stateCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 24,
    textAlign: 'center',
  },
  notice: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 22,
    marginBottom: 16,
  },
  errorBanner: {
    backgroundColor: colors.errorLight,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    marginBottom: 16,
  },
  errorText: { color: colors.error, fontSize: 13, lineHeight: 20 },
});
