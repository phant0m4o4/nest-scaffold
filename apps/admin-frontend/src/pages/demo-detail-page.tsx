import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Link,
  useNavigate,
  useParams,
  useSearch,
} from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { DeleteDemoButton } from '@/components/delete-demo-button';
import { DemoError, DemoNotice } from '@/components/demo-feedback';
import { api } from '@/lib/api';
import { demoLinkClass, parseDemoId, type DemoSearch } from '@/lib/demo-search';

export function DemoRecordState({
  id,
  isPending,
  error,
  retry,
  search,
}: {
  id: number | null;
  isPending: boolean;
  error: unknown;
  retry: () => Promise<unknown>;
  search: DemoSearch;
}) {
  const [retryError, setRetryError] = useState<unknown>(null);
  return (
    <div className="space-y-5 py-12">
      <h1 className="text-2xl font-semibold">
        {id === null
          ? '记录地址无效'
          : isPending
            ? '正在加载记录…'
            : error
              ? '加载失败'
              : '记录不存在或已删除'}
      </h1>
      <DemoError error={error} />
      <DemoError error={retryError} />
      <div className="flex gap-3">
        <Link to="/demos" search={search} className={demoLinkClass}>
          返回列表
        </Link>
        {!!error && (
          <Button
            onClick={() => {
              setRetryError(null);
              retry().catch(setRetryError);
            }}
          >
            重新加载
          </Button>
        )}
      </div>
    </div>
  );
}

export function DemoDetailPage() {
  const { demoId } = useParams({ from: '/demos/$demoId' });
  const search = useSearch({ from: '/demos/$demoId' });
  const navigate = useNavigate({ from: '/demos/$demoId' });
  const id = parseDemoId(demoId);
  const query = useQuery({
    queryKey: ['admin-demo', id],
    queryFn: ({ signal }) => api.getAdminDemo(id!, { signal }),
    enabled: id !== null,
  });
  const demo = query.data?.data;

  if (id === null || query.isPending || query.isError || !demo) {
    return (
      <DemoRecordState
        id={id}
        isPending={query.isPending}
        error={query.error}
        search={search}
        retry={() => query.refetch()}
      />
    );
  }

  return (
    <div className="space-y-7">
      <DemoNotice />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-3 text-sm text-muted-foreground">
            工作空间 / 示例数据 / 详情
          </p>
          <h1 className="text-3xl font-semibold break-words">{demo.name}</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link to="/demos" search={search} className={demoLinkClass}>
            返回列表
          </Link>
          <Link
            to="/demos/$demoId/edit"
            params={{ demoId }}
            search={search}
            className={demoLinkClass}
          >
            编辑
          </Link>
          <DeleteDemoButton
            demo={demo}
            onDeleted={() => navigate({ to: '/demos', search })}
          />
        </div>
      </div>
      <dl className="grid gap-6 rounded-lg border border-border p-6 sm:grid-cols-2">
        {[
          ['ID', demo.id],
          ['名称', demo.name],
          ['编号', demo.shortPublicId],
          ['公开标识', demo.publicId],
          ['类型', demo.type],
          ['父记录 ID', demo.parentId ?? '无'],
          ['创建时间', new Date(demo.createdAt).toLocaleString('zh-CN')],
          ['更新时间', new Date(demo.updatedAt).toLocaleString('zh-CN')],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="mt-2 break-all">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
