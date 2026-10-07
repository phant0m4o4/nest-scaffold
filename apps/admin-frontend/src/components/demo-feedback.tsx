import { ApiError } from '@nest-scaffold/api-client';
import { create } from 'zustand';
import { Button } from '@/components/ui/button';

export const useDemoNotice = create<{
  message: string;
  setMessage: (message: string) => void;
}>((set) => ({ message: '', setMessage: (message) => set({ message }) }));

export function DemoNotice() {
  const { message, setMessage } = useDemoNotice();
  if (!message) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted p-4 text-sm"
    >
      <p>{message}</p>
      <Button
        variant="outline"
        onClick={() => setMessage('')}
        aria-label="关闭提示"
      >
        关闭
      </Button>
    </div>
  );
}

export function demoErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === 'RECORD_ALREADY_EXISTS')
      return '名称已存在，请使用其他名称。';
    if (error.code === 'FOREIGN_KEY_CONSTRAINT_VIOLATION')
      return '父记录不存在，或当前记录仍被子记录引用，请检查父级关系。';
    if (error.status === 422) return '输入内容未通过校验，请根据下方提示修改。';
    if (error.status === 409) return `操作存在冲突：${error.message}`;
    if (error.status === 404) return '记录已不存在，请返回列表刷新后重试。';
    return error.message;
  }
  return '请求未完成，请检查网络后重试。';
}

export function DemoError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div role="alert" className="space-y-2 text-sm text-destructive">
      <p>{demoErrorMessage(error)}</p>
      {error instanceof ApiError && error.errors?.length ? (
        <ul className="list-inside list-disc">
          {error.errors.map((item, index) => (
            <li key={`${item.field}-${index}`}>
              {item.field}：{item.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
