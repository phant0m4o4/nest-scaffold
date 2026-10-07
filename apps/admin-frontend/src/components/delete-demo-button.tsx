import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdminDemo } from '@nest-scaffold/contracts';
import { Button } from '@/components/ui/button';
import { DemoError, useDemoNotice } from '@/components/demo-feedback';
import { api } from '@/lib/api';

export function DeleteDemoButton({
  demo,
  onDeleted,
}: {
  demo: AdminDemo;
  onDeleted: () => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [navigationError, setNavigationError] = useState('');
  const queryClient = useQueryClient();
  const setMessage = useDemoNotice((state) => state.setMessage);
  const mutation = useMutation({
    mutationFn: () => api.deleteAdminDemo(demo.id),
    onSuccess: async () => {
      setMessage(`已删除「${demo.name}」`);
      queryClient.removeQueries({ queryKey: ['admin-demo', demo.id] });
      await queryClient.invalidateQueries({ queryKey: ['admin-demos'] });
      setIsOpen(false);
      try {
        await onDeleted();
      } catch {
        setNavigationError('记录已删除，页面切换未完成，请返回列表刷新。');
      }
    },
  });

  useEffect(() => {
    if (isOpen) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [isOpen]);

  return (
    <>
      <Button
        variant="outline"
        className="text-destructive"
        onClick={() => {
          mutation.reset();
          setNavigationError('');
          setIsOpen(true);
        }}
      >
        删除
      </Button>
      {navigationError && (
        <p role="alert" className="text-sm text-destructive">
          {navigationError}
        </p>
      )}
      <dialog
        ref={dialogRef}
        aria-labelledby={headingId}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-border bg-background p-6 text-foreground shadow-xl backdrop:bg-black/40"
        onCancel={(event) => {
          if (mutation.isPending) event.preventDefault();
          else setIsOpen(false);
        }}
        onClose={() => setIsOpen(false)}
      >
        <h2 id={headingId} className="text-xl font-semibold">
          删除示例记录
        </h2>
        <p className="my-4 text-sm leading-6 text-muted-foreground">
          确定删除「{demo.name}
          」吗？删除后无法在此恢复。有子记录时，请先调整子记录的父级关系。
        </p>
        <DemoError error={mutation.error} />
        <div className="mt-6 flex justify-end gap-3">
          <Button
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => setIsOpen(false)}
          >
            取消
          </Button>
          <Button
            className="bg-destructive text-white"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? '删除中…' : '确认删除'}
          </Button>
        </div>
      </dialog>
    </>
  );
}
