import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { z } from 'zod';
import {
  createDemoSchema,
  demoTypeSchema,
  type AdminDemo,
  type CreateDemoInput,
} from '@nest-scaffold/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DemoError } from '@/components/demo-feedback';

const nameSchema = z
  .string()
  .trim()
  .min(1, '请输入名称')
  .max(100, '名称最多输入 100 个字符');

export function DemoForm({
  initial,
  onSave,
}: {
  initial?: AdminDemo;
  onSave: (input: CreateDemoInput) => Promise<void>;
}) {
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [validationMessage, setValidationMessage] = useState('');
  const parentSchema = z.string().refine((value) => {
    const trimmed = value.trim();
    if (!trimmed) return true;
    const id = Number(trimmed);
    return (
      /^\d+$/.test(trimmed) &&
      Number.isSafeInteger(id) &&
      id > 0 &&
      id !== initial?.id
    );
  }, '父记录 ID 必须是正整数，且不能指向当前记录');
  const form = useForm({
    defaultValues: {
      name: initial?.name ?? '',
      type: initial?.type ?? 'TYPE_1',
      parentId: initial?.parentId?.toString() ?? '',
    },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      setValidationMessage('');
      const parsed = createDemoSchema.safeParse({
        name: value.name,
        type: value.type,
        parentId: value.parentId.trim() ? Number(value.parentId) : null,
      });
      if (!parsed.success) {
        setValidationMessage(
          parsed.error.issues.map((issue) => issue.message).join('；'),
        );
        return;
      }
      try {
        await onSave(parsed.data);
      } catch (error) {
        setSubmitError(error);
      }
    },
  });

  return (
    <form
      className="max-w-2xl space-y-6 rounded-lg border border-border p-5 sm:p-7"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        form.handleSubmit().catch(setSubmitError);
      }}
    >
      <form.Field name="name" validators={{ onChange: nameSchema }}>
        {(field) => (
          <div>
            <label
              htmlFor="demo-name"
              className="mb-2 block text-sm font-medium"
            >
              名称 <span className="text-destructive">*</span>
            </label>
            <Input
              id="demo-name"
              name={field.name}
              value={field.state.value}
              maxLength={100}
              placeholder="例如：第一条示例记录"
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              aria-required="true"
              aria-invalid={field.state.meta.errors.length > 0}
              aria-describedby="demo-name-error"
            />
            <p id="demo-name-error" className="mt-2 text-sm text-destructive">
              {field.state.meta.errors
                .map((error) => error?.message)
                .join('，')}
            </p>
          </div>
        )}
      </form.Field>
      <form.Field name="type" validators={{ onChange: demoTypeSchema }}>
        {(field) => (
          <div>
            <label
              htmlFor="demo-type"
              className="mb-2 block text-sm font-medium"
            >
              类型 <span className="text-destructive">*</span>
            </label>
            <select
              id="demo-type"
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) =>
                field.handleChange(demoTypeSchema.parse(event.target.value))
              }
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-ring"
            >
              {demoTypeSchema.options.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        )}
      </form.Field>
      <form.Field name="parentId" validators={{ onChange: parentSchema }}>
        {(field) => (
          <div>
            <label
              htmlFor="demo-parent"
              className="mb-2 block text-sm font-medium"
            >
              父记录 ID（选填）
            </label>
            <Input
              id="demo-parent"
              name={field.name}
              inputMode="numeric"
              value={field.state.value}
              placeholder="留空表示无父记录"
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              aria-invalid={field.state.meta.errors.length > 0}
              aria-describedby="demo-parent-hint demo-parent-error"
            />
            <p
              id="demo-parent-hint"
              className="mt-2 text-sm text-muted-foreground"
            >
              填写已有记录的数字 ID；清空可解除父级关系。
            </p>
            <p id="demo-parent-error" className="mt-2 text-sm text-destructive">
              {field.state.meta.errors
                .map((error) => error?.message)
                .join('，')}
            </p>
          </div>
        )}
      </form.Field>
      {validationMessage && (
        <p role="alert" className="text-sm text-destructive">
          {validationMessage}
        </p>
      )}
      <DemoError error={submitError} />
      <form.Subscribe
        selector={(state) => [state.canSubmit, state.isSubmitting]}
      >
        {([canSubmit, isSubmitting]) => (
          <Button type="submit" disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? '保存中…' : initial ? '保存修改' : '创建记录'}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
