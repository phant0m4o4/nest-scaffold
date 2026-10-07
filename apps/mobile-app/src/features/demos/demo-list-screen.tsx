import type { DemoListQuery, DemoType } from '@nest-scaffold/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/action-button';
import { DemoCard, DEMO_TYPE_LABELS } from '@/features/demos/demo-card';
import { apiClient } from '@/lib/api';
import { colors } from '@/lib/theme';
import { usePreferencesStore } from '@/stores/preferences.store';

const FILTERS: { value: DemoType | undefined; label: string }[] = [
  { value: undefined, label: '全部' },
  { value: 'TYPE_1', label: DEMO_TYPE_LABELS.TYPE_1 },
  { value: 'TYPE_2', label: DEMO_TYPE_LABELS.TYPE_2 },
  { value: 'TYPE_3', label: DEMO_TYPE_LABELS.TYPE_3 },
];

export function DemoListScreen() {
  const [page, setPage] = useState(1);
  const [nameInput, setNameInput] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<DemoType>();
  const isCompact = usePreferencesStore((state) => state.isCompact);
  const filters: DemoListQuery = {
    page,
    pageSize: 10,
    name: name || undefined,
    type,
  };
  const query = useQuery({
    queryKey: ['public-demos', filters],
    queryFn: ({ signal }) => apiClient.listPublicDemos(filters, { signal }),
  });

  const search = () => {
    setPage(1);
    setName(nameInput.trim());
  };
  const clearFilters = () => {
    setPage(1);
    setNameInput('');
    setName('');
    setType(undefined);
  };
  const refresh = () => {
    // refetch 默认将请求错误保留在 Query 状态，由下面的错误提示呈现。
    void query.refetch();
  };
  const hasItems = Boolean(query.data?.data.length);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.content}
        data={query.data?.data ?? []}
        keyExtractor={(item) => item.publicId}
        renderItem={({ item }) => (
          <DemoCard demo={item} isCompact={isCompact} />
        )}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={refresh}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.brandRow}>
              <Text style={styles.brand}>NEST / MOBILE</Text>
              <View style={styles.brandMark}>
                <Text style={styles.brandMarkText}>N</Text>
              </View>
            </View>
            <Text style={styles.title}>发现新内容</Text>
            <Text style={styles.subtitle}>从这里开始，探索每一个可能。</Text>
            <View style={styles.hero}>
              <Text style={styles.heroEyebrow}>EXPLORE THE COLLECTION</Text>
              <Text style={styles.heroTitle}>灵感，从一个示例开始。</Text>
              <Text style={styles.heroDescription}>
                浏览公开示例，找到你感兴趣的内容。
              </Text>
            </View>
            <View style={styles.searchRow}>
              <TextInput
                accessibilityLabel="按名称搜索示例"
                placeholder="搜索示例名称"
                placeholderTextColor={colors.muted}
                value={nameInput}
                onChangeText={setNameInput}
                onSubmitEditing={search}
                returnKeyType="search"
                clearButtonMode="while-editing"
                maxLength={100}
                style={styles.searchInput}
              />
              <ActionButton label="搜索" onPress={search} />
            </View>
            <View style={styles.filters}>
              {FILTERS.map((filter) => (
                <Pressable
                  key={filter.value ?? 'all'}
                  accessibilityRole="button"
                  accessibilityState={{ selected: type === filter.value }}
                  onPress={() => {
                    setPage(1);
                    setType(filter.value);
                  }}
                  style={[
                    styles.filter,
                    type === filter.value && styles.activeFilter,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterText,
                      type === filter.value && styles.activeFilterText,
                    ]}
                  >
                    {filter.label}
                  </Text>
                </Pressable>
              ))}
              {(name || type) && (
                <ActionButton
                  label="清除筛选"
                  onPress={clearFilters}
                  secondary
                />
              )}
            </View>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>公开示例</Text>
              <Text style={styles.count}>
                {query.data ? `${query.data.meta.total} 个内容` : '浏览列表'}
              </Text>
            </View>
            {query.fetchStatus === 'paused' && hasItems && (
              <Text style={styles.notice} accessibilityRole="alert">
                网络已断开，连接恢复后将自动更新。
              </Text>
            )}
            {query.isError && hasItems && (
              <View style={styles.errorBanner} accessibilityRole="alert">
                <Text style={styles.errorText}>
                  刷新失败，当前显示上次加载的内容。
                </Text>
                <ActionButton label="重试" onPress={refresh} secondary />
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            {query.isPending ? (
              query.fetchStatus === 'paused' ? (
                <>
                  <Text style={styles.emptyTitle}>等待网络连接</Text>
                  <Text style={styles.emptyCopy}>
                    连接恢复后会自动加载内容。
                  </Text>
                </>
              ) : (
                <>
                  <ActivityIndicator color={colors.primary} size="large" />
                  <Text style={styles.emptyCopy}>正在加载内容…</Text>
                </>
              )
            ) : query.isError ? (
              <>
                <Text style={styles.emptyTitle} accessibilityRole="alert">
                  暂时无法加载
                </Text>
                <Text style={styles.emptyCopy}>请检查网络连接，稍后再试。</Text>
                <ActionButton
                  label="重新加载"
                  onPress={refresh}
                  disabled={query.isFetching}
                />
              </>
            ) : (
              <>
                <Text style={styles.emptyTitle}>这里还没有内容</Text>
                <Text style={styles.emptyCopy}>
                  {name || type
                    ? '试试其他名称或分类。'
                    : '新的示例添加后，会在这里显示。'}
                </Text>
              </>
            )}
          </View>
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <View style={styles.pagination}>
              <ActionButton
                label="上一页"
                secondary
                disabled={page <= 1 || query.isFetching}
                onPress={() => setPage((current) => Math.max(1, current - 1))}
              />
              <Text style={styles.pageNumber}>
                {page} / {Math.max(1, query.data?.meta.totalPages ?? page)}
              </Text>
              <ActionButton
                label="下一页"
                secondary
                disabled={!query.data?.meta.hasNextPage || query.isFetching}
                onPress={() => setPage((current) => current + 1)}
              />
            </View>
            <Text style={styles.footerText}>下拉刷新，查看最新内容</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 18,
    marginBottom: 28,
  },
  brand: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: { color: colors.primary, fontWeight: '700', fontSize: 18 },
  title: { color: colors.text, fontSize: 32, fontWeight: '700' },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 10,
    lineHeight: 22,
  },
  hero: {
    marginTop: 28,
    padding: 24,
    borderRadius: 22,
    backgroundColor: colors.primary,
  },
  heroEyebrow: {
    color: '#B8D8C2',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 2,
  },
  heroTitle: {
    color: colors.surface,
    fontSize: 22,
    fontWeight: '600',
    marginTop: 20,
    lineHeight: 32,
  },
  heroDescription: {
    color: '#D5E7DA',
    fontSize: 12,
    lineHeight: 20,
    marginTop: 10,
  },
  searchRow: { flexDirection: 'row', gap: 10, marginTop: 28 },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    color: colors.text,
    backgroundColor: colors.surface,
    fontSize: 14,
  },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  filter: {
    minHeight: 44,
    paddingHorizontal: 15,
    justifyContent: 'center',
    borderRadius: 12,
  },
  activeFilter: { backgroundColor: colors.primaryLight },
  filterText: { color: colors.muted, fontSize: 13 },
  activeFilterText: { color: colors.primary, fontWeight: '600' },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 26,
    marginBottom: 16,
  },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '600' },
  count: { color: colors.muted, fontSize: 12 },
  notice: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
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
  empty: {
    minHeight: 220,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '600' },
  emptyCopy: {
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 22,
  },
  footer: { paddingTop: 16 },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  pageNumber: { color: colors.muted, fontSize: 13 },
  footerText: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 11,
    marginTop: 24,
  },
});
