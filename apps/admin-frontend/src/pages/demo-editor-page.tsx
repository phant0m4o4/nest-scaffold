import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Link,
  useNavigate,
  useParams,
  useSearch,
} from '@tanstack/react-router';
import { DemoForm } from '@/components/demo-form';
import { DemoNotice, useDemoNotice } from '@/components/demo-feedback';
import { DemoRecordState } from '@/pages/demo-detail-page';
import { api } from '@/lib/api';
import { demoLinkClass, parseDemoId } from '@/lib/demo-search';

export function NewDemoPage() {
  const search = useSearch({ from: '/demos/new' });
  const navigate = useNavigate({ from: '/demos/new' });
  const queryClient = useQueryClient();
  const setMessage = useDemoNotice((state) => state.setMessage);
  const [navigationError, setNavigationError] = useState('');

  return (
    <div className="space-y-7">
      <DemoNotice />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">新增示例记录</h1>
        <Link to="/demos" search={search} className={demoLinkClass}>
          返回列表
        </Link>
      </div>
      {navigationError && (
        <p role="alert" className="text-sm text-destructive">
          {navigationError}
        </p>
      )}
      <DemoForm
        onSave={async (input) => {
          const result = await api.createAdminDemo(input);
          setMessage(`已创建「${input.name}」`);
          await queryClient.invalidateQueries({ queryKey: ['admin-demos'] });
          await navigate({
            to: '/demos/$demoId',
            params: { demoId: String(result.data.id) },
            search,
          }).catch(() =>
            setNavigationError('记录已创建，页面切换未完成，请返回列表查看。'),
          );
        }}
      />
    </div>
  );
}

export function EditDemoPage() {
  const { demoId } = useParams({ from: '/demos/$demoId/edit' });
  const search = useSearch({ from: '/demos/$demoId/edit' });
  const navigate = useNavigate({ from: '/demos/$demoId/edit' });
  const queryClient = useQueryClient();
  const setMessage = useDemoNotice((state) => state.setMessage);
  const [navigationError, setNavigationError] = useState('');
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">编辑示例记录</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            ID {demo.id} · {demo.shortPublicId}
          </p>
        </div>
        <Link
          to="/demos/$demoId"
          params={{ demoId }}
          search={search}
          className={demoLinkClass}
        >
          取消编辑
        </Link>
      </div>
      {navigationError && (
        <p role="alert" className="text-sm text-destructive">
          {navigationError}
        </p>
      )}
      <DemoForm
        key={demo.id}
        initial={demo}
        onSave={async (input) => {
          await api.updateAdminDemo(demo.id, input);
          setMessage(`已保存「${input.name}」`);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['admin-demos'] }),
            queryClient.invalidateQueries({
              queryKey: ['admin-demo', demo.id],
            }),
          ]);
          await navigate({
            to: '/demos/$demoId',
            params: { demoId },
            search,
          }).catch(() =>
            setNavigationError('修改已保存，页面切换未完成，请返回详情查看。'),
          );
        }}
      />
    </div>
  );
}
