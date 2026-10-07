import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// 按 shadcn/ui 的本地组件方式维护，保留当前实际使用的两种样式。
export function Button({
  className = '',
  variant = 'default',
  type = 'button',
  ...props
}: ComponentProps<'button'> & { variant?: 'default' | 'outline' }) {
  return (
    <button
      data-slot="button"
      type={type}
      className={cn(
        'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50',
        variant === 'outline'
          ? 'border border-input bg-background hover:bg-muted'
          : 'bg-primary text-primary-foreground hover:opacity-90',
        className,
      )}
      {...props}
    />
  );
}
