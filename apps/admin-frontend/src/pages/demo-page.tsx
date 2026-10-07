import { useEffect, useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { tableFeatures, useTable, type ColumnDef } from '@tanstack/react-table';
import { z } from 'zod';
import {
  demoTypeSchema,
  demoOrderColumnSchema,
  demoOrderDirectionSchema,
  type AdminDemo,
  type DemoType,
} from '@nest-scaffold/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { DeleteDemoButton } from '@/components/delete-demo-button';
import { DemoError, DemoNotice } from '@/components/demo-feedback';
import { demoLinkClass } from '@/lib/demo-search';

const features = tableFeatures({});
const columns: ColumnDef<typeof features, AdminDemo>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'name', header: '名称' },
  { accessorKey: 'shortPublicId', header: '编号' },
  { accessorKey: 'type', header: '类型' },
  {
    accessorKey: 'createdAt',
    header: '创建时间',
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleString('zh-CN'),
  },
];
const emptyRows: AdminDemo[] = [];
const nameSchema = z.string().trim().max(100, '名称最多输入 100 个字符');

interface IFilterFormProps {
  name: string;
  onSearch: (name: string) => Promise<void>;
}

function FilterForm({ name, onSearch }: IFilterFormProps) {
  const [submitError, setSubmitError] = useState('');
  const form = useForm({
    defaultValues: { name },
    onSubmit: async ({ value }) => {
      setSubmitError('');
      try {
        await onSearch(value.name.trim());
      } catch {
        setSubmitError('筛选未完成，请重试');
      }
    },
  });

  return (
    <form
      className="flex flex-1 flex-wrap items-start gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        form.handleSubmit().catch(() => setSubmitError('筛选未完成，请重试'));
      }}
    >
      <form.Field name="name" validators={{ onChange: nameSchema }}>
        {(field) => (
          <div className="min-w-44 flex-1 sm:max-w-80">
            <label htmlFor="name" className="mb-2 block text-sm font-medium">
              名称
            </label>
            <Input
              id="name"
              name={field.name}
              value={field.state.value}
              placeholder="输入名称查找"
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              aria-invalid={field.state.meta.errors.length > 0}
              aria-describedby={
                field.state.meta.errors.length ? 'name-error' : undefined
              }
            />
            {field.state.meta.errors.length > 0 && (
              <p
                id="name-error"
                role="alert"
                className="mt-2 text-sm text-destructive"
              >
                {field.state.meta.errors
                  .map((error) => error?.message)
                  .join('，')}
              </p>
            )}
          </div>
        )}
      </form.Field>
      <form.Subscribe
        selector={(state) => [state.canSubmit, state.isSubmitting]}
      >
        {([canSubmit, isSubmitting]) => (
          <Button
            type="submit"
            className="mt-7"
            disabled={!canSubmit || isSubmitting}
          >
            查询
          </Button>
        )}
      </form.Subscribe>
      {submitError && (
        <p role="alert" className="w-full text-sm text-destructive">
          {submitError}
        </p>
      )}
    </form>
  );
}

export function DemoPage() {
  const search = useSearch({ from: '/demos' });
  const navigate = useNavigate({ from: '/demos' });
  const [navigationError, setNavigationError] = useState('');
  const query = useQuery({
    queryKey: ['admin-demos', search],
    queryFn: ({ signal }) => api.listAdminDemos(search, { signal }),
  });
  const table = useTable({
    features,
    columns,
    data: query.data?.data ?? emptyRows,
    getRowId: (row) => row.publicId,
  });

  useEffect(() => {
    if (!query.data || query.isFetching) return;
    const lastPage = Math.max(1, query.data.meta.totalPages);
    if (search.page > lastPage) {
      navigate({
        search: (previous) => ({ ...previous, page: lastPage }),
        replace: true,
      }).catch(() => setNavigationError('页码调整未完成，请返回上一页重试'));
    }
  }, [query.data, query.isFetching, search.page, navigate]);

  function updateSearch(patch: Partial<typeof search>) {
    setNavigationError('');
    return navigate({ search: (previous) => ({ ...previous, ...patch }) });
  }

  function applySearch(patch: Partial<typeof search>) {
    updateSearch(patch).catch(() =>
      setNavigationError('页面切换未完成，请重试'),
    );
  }

  return (
    <div className="space-y-7">
      <DemoNotice />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-3 text-sm text-muted-foreground">
            工作空间 / 示例数据
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">示例数据</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            管理示例记录，按名称与类型查找，并查看父级关系。
          </p>
        </div>
        <div className="flex gap-3">
          <Link to="/demos/new" search={search} className={demoLinkClass}>
            新增记录
          </Link>
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => {
              query
                .refetch()
                .catch(() => setNavigationError('刷新未完成，请重试'));
            }}
          >
            {query.isFetching ? '加载中…' : '刷新列表'}
          </Button>
        </div>
      </div>

      <section
        aria-label="筛选条件"
        className="flex flex-wrap items-start gap-5 rounded-lg border border-border p-5"
      >
        <FilterForm
          key={search.name}
          name={search.name}
          onSearch={(name) => updateSearch({ name, page: 1 })}
        />
        <div className="w-full sm:w-44">
          <label htmlFor="type" className="mb-2 block text-sm font-medium">
            类型
          </label>
          <select
            id="type"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-ring"
            value={search.type ?? ''}
            onChange={(event) => {
              const type: DemoType | undefined = event.target.value
                ? demoTypeSchema.parse(event.target.value)
                : undefined;
              applySearch({ type, page: 1 });
            }}
          >
            <option value="">全部类型</option>
            {demoTypeSchema.options.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full sm:w-40">
          <label
            htmlFor="order-column"
            className="mb-2 block text-sm font-medium"
          >
            排序字段
          </label>
          <select
            id="order-column"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-ring"
            value={search.orderColumn}
            onChange={(event) =>
              applySearch({
                orderColumn: demoOrderColumnSchema.parse(event.target.value),
                page: 1,
              })
            }
          >
            <option value="createdAt">创建时间</option>
            <option value="updatedAt">更新时间</option>
            <option value="id">ID</option>
            <option value="name">名称</option>
            <option value="type">类型</option>
          </select>
        </div>
        <div className="w-full sm:w-32">
          <label
            htmlFor="order-direction"
            className="mb-2 block text-sm font-medium"
          >
            排序方向
          </label>
          <select
            id="order-direction"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-ring"
            value={search.orderDirection}
            onChange={(event) =>
              applySearch({
                orderDirection: demoOrderDirectionSchema.parse(
                  event.target.value,
                ),
                page: 1,
              })
            }
          >
            <option value="desc">降序</option>
            <option value="asc">升序</option>
          </select>
        </div>
      </section>

      {navigationError && (
        <p role="alert" className="text-sm text-destructive">
          {navigationError}
        </p>
      )}

      <section
        aria-label="数据列表"
        className="overflow-hidden rounded-lg border border-border"
        aria-busy={query.isFetching}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">全部记录</h2>
          {query.data && (
            <span className="text-sm text-muted-foreground">
              共 {query.data.meta.total} 条
            </span>
          )}
        </div>
        {query.isPending ? (
          <p
            role="status"
            className="px-5 py-16 text-center text-sm text-muted-foreground"
          >
            正在加载数据…
          </p>
        ) : query.isError ? (
          <div role="alert" className="space-y-4 px-5 py-16 text-center">
            <DemoError error={query.error} />
            <Button
              variant="outline"
              onClick={() => {
                query
                  .refetch()
                  .catch(() => setNavigationError('重试未完成，请稍后再试'));
              }}
            >
              重新加载
            </Button>
          </div>
        ) : query.data.data.length === 0 ? (
          <div role="status" className="px-5 py-16 text-center">
            <p className="font-medium">暂无记录</p>
            <p className="mt-2 text-sm text-muted-foreground">
              可以新增一条记录，或调整筛选条件。
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/60 text-muted-foreground">
                {table.getHeaderGroups().map((group) => (
                  <tr key={group.id}>
                    {group.headers.map((header) => (
                      <th
                        key={header.id}
                        scope="col"
                        className="px-5 py-3 font-medium whitespace-nowrap"
                      >
                        {header.isPlaceholder ? null : (
                          <table.FlexRender header={header} />
                        )}
                      </th>
                    ))}
                    <th
                      scope="col"
                      className="px-5 py-3 font-medium whitespace-nowrap"
                    >
                      操作
                    </th>
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-border">
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/40">
                    {row.getAllCells().map((cell) => (
                      <td key={cell.id} className="px-5 py-4 whitespace-nowrap">
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        <Link
                          to="/demos/$demoId"
                          params={{ demoId: String(row.original.id) }}
                          search={search}
                          className={demoLinkClass}
                        >
                          详情
                        </Link>
                        <Link
                          to="/demos/$demoId/edit"
                          params={{ demoId: String(row.original.id) }}
                          search={search}
                          className={demoLinkClass}
                        >
                          编辑
                        </Link>
                        <DeleteDemoButton
                          demo={row.original}
                          onDeleted={() =>
                            updateSearch({
                              page:
                                query.data.data.length === 1
                                  ? Math.max(1, search.page - 1)
                                  : search.page,
                            })
                          }
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border px-5 py-4">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            每页
            <select
              aria-label="每页条数"
              className="rounded-md border border-input bg-background px-2 py-1 text-foreground"
              value={search.pageSize}
              onChange={(event) =>
                applySearch({ page: 1, pageSize: Number(event.target.value) })
              }
            >
              {[...new Set([10, 20, 50, search.pageSize])]
                .sort((a, b) => a - b)
                .map((size) => (
                  <option key={size} value={size}>
                    {size} 条
                  </option>
                ))}
            </select>
          </label>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              第 {search.page} 页
              {query.data
                ? ` / ${Math.max(1, query.data.meta.totalPages)} 页`
                : ''}
            </span>
            <Button
              variant="outline"
              disabled={search.page <= 1 || query.isFetching}
              onClick={() => applySearch({ page: search.page - 1 })}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              disabled={!query.data?.meta.hasNextPage || query.isFetching}
              onClick={() => applySearch({ page: search.page + 1 })}
            >
              下一页
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
