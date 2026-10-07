import { getEventListeners } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  executeWithRetry,
  type ExecuteWithRetryOptions,
} from '@/common/utils/execute-with-retry';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('异步重试与取消', () => {
  it.each([NaN, Infinity, -Infinity, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    '无效尝试次数 %s 应在任务执行前拒绝',
    async (count) => {
      const task = vi.fn(async () => await Promise.resolve('完成'));
      await expect(executeWithRetry(task, count, 0)).rejects.toThrow();
      expect(task).not.toHaveBeenCalled();
    },
  );

  it.each([NaN, Infinity, -Infinity, -1, 2_147_483_648])(
    '无效基础延迟 %s 应在任务执行前拒绝',
    async (delay) => {
      const task = vi.fn(async () => await Promise.resolve('完成'));
      await expect(executeWithRetry(task, 2, delay)).rejects.toThrow();
      expect(task).not.toHaveBeenCalled();
    },
  );

  it.each([NaN, Infinity, -Infinity, -1, 2_147_483_648])(
    '无效最大延迟 %s 应在任务执行前拒绝',
    async (maxDelayMs) => {
      const task = vi.fn(async () => await Promise.resolve('完成'));
      await expect(
        executeWithRetry(task, 2, 0, { maxDelayMs }),
      ).rejects.toThrow();
      expect(task).not.toHaveBeenCalled();
    },
  );

  it('指数退避应在 Node 定时器上限封顶而非溢出为 1ms', async () => {
    vi.useFakeTimers();
    const onRetry = vi.fn<NonNullable<ExecuteWithRetryOptions['onRetry']>>();
    const task = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('首次失败'))
      .mockRejectedValueOnce(new Error('再次失败'))
      .mockResolvedValue('完成');
    const result = executeWithRetry(task, 3, 2_147_483_647, {
      exponentialBackoff: true,
      onRetry,
    });
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBe('完成');
    expect(onRetry.mock.calls.map((call) => call[2])).toEqual([
      2_147_483_647, 2_147_483_647,
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('零延迟指数退避经过大量尝试后仍应保持零且不产生 NaN', async () => {
    const task = vi.fn(async () => {
      if (task.mock.calls.length < 1027) throw new Error('暂时失败');
      return await Promise.resolve('完成');
    });
    const onRetry = vi.fn();
    await expect(
      executeWithRetry(task, 1027, 0, { exponentialBackoff: true, onRetry }),
    ).resolves.toBe('完成');
    expect(onRetry.mock.calls.every((call) => call[2] === 0)).toBe(true);
  });

  it('信号已取消时不应调用任务或重试回调', async () => {
    const controller = new AbortController();
    const task = vi.fn(async () => await Promise.resolve('完成'));
    const shouldRetry = vi.fn(() => true);
    const onRetry = vi.fn();
    controller.abort();

    await expect(
      executeWithRetry(task, 3, 0, {
        signal: controller.signal,
        shouldRetry,
        onRetry,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(task).not.toHaveBeenCalled();
    expect(shouldRetry).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  it('执行中的任务永久等待时仍应立即取消且不进入重试', async () => {
    const controller = new AbortController();
    const deferred = createDeferred<string>();
    const task = vi.fn(async () => await deferred.promise);
    const shouldRetry = vi.fn(() => true);
    const onRetry = vi.fn();
    const result = executeWithRetry(task, 3, 0, {
      signal: controller.signal,
      shouldRetry,
      onRetry,
    });

    controller.abort();

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(task).toHaveBeenCalledOnce();
    expect(shouldRetry).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  }, 500);

  it.each(['成功', '失败'] as const)(
    '取消后任务迟到%s不应覆盖取消结果或触发重试',
    async (completion) => {
      const controller = new AbortController();
      const deferred = createDeferred<string>();
      const task = vi.fn(async () => await deferred.promise);
      const shouldRetry = vi.fn(() => true);
      const onRetry = vi.fn();
      const result = executeWithRetry(task, 3, 0, {
        signal: controller.signal,
        shouldRetry,
        onRetry,
      });
      controller.abort();

      if (completion === '成功') deferred.resolve('迟到的结果');
      else deferred.reject(new Error('迟到的异常'));

      await expect(result).rejects.toMatchObject({ name: 'AbortError' });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(task).toHaveBeenCalledOnce();
      expect(shouldRetry).not.toHaveBeenCalled();
      expect(onRetry).not.toHaveBeenCalled();
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    },
  );

  it('异步重试回调永久等待时应立即取消且不再执行任务', async () => {
    const controller = new AbortController();
    const started = createDeferred<void>();
    const deferred = createDeferred<void>();
    const task = vi.fn(async () => await Promise.reject(new Error('暂时失败')));
    const shouldRetry = vi.fn(() => true);
    const onRetry = vi.fn(async () => {
      started.resolve();
      await deferred.promise;
    });
    const result = executeWithRetry(task, 3, 0, {
      signal: controller.signal,
      shouldRetry,
      onRetry,
    });
    await started.promise;

    controller.abort();

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(task).toHaveBeenCalledOnce();
    expect(shouldRetry).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledOnce();
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    // 包装已返回后再失败也必须有拒绝处理器，测试运行器会检查未处理拒绝。
    deferred.reject(new Error('取消后的回调异常'));
    await new Promise<void>((resolve) => setImmediate(resolve));
  }, 500);

  it('重试延迟中取消应清理计时器与监听且不再执行任务', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const task = vi.fn(async () => await Promise.reject(new Error('暂时失败')));
    const result = executeWithRetry(task, 3, 1000, {
      signal: controller.signal,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);

    controller.abort();

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(task).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  it('首次成功应返回结果并清理监听', async () => {
    const controller = new AbortController();
    const task = vi.fn(async () => await Promise.resolve('完成'));

    await expect(
      executeWithRetry(task, 3, 0, { signal: controller.signal }),
    ).resolves.toBe('完成');

    expect(task).toHaveBeenCalledOnce();
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  it('失败后应保留重试次数、回调参数与成功返回值', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const error = new Error('暂时失败');
    const task = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockResolvedValue('完成');
    const shouldRetry = vi.fn(() => true);
    const onRetry = vi.fn(async () => await Promise.resolve());
    const result = executeWithRetry(task, 3, 10, {
      signal: controller.signal,
      shouldRetry,
      onRetry,
      exponentialBackoff: true,
    });

    await vi.runAllTimersAsync();

    await expect(result).resolves.toBe('完成');
    expect(task).toHaveBeenCalledTimes(3);
    expect(shouldRetry).toHaveBeenNthCalledWith(1, error, 0);
    expect(shouldRetry).toHaveBeenNthCalledWith(2, error, 1);
    expect(onRetry).toHaveBeenNthCalledWith(1, error, 0, 10);
    expect(onRetry).toHaveBeenNthCalledWith(2, error, 1, 20);
    expect(vi.getTimerCount()).toBe(0);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  it('拒绝重试时应保留任务错误并清理监听', async () => {
    const controller = new AbortController();
    const error = new Error('不可重试');
    const task = vi.fn(async () => await Promise.reject(error));
    const onRetry = vi.fn();

    await expect(
      executeWithRetry(task, 3, 0, {
        signal: controller.signal,
        shouldRetry: () => false,
        onRetry,
      }),
    ).rejects.toBe(error);

    expect(task).toHaveBeenCalledOnce();
    expect(onRetry).not.toHaveBeenCalled();
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  it('全部尝试失败应抛出最后一次错误并清理监听', async () => {
    const controller = new AbortController();
    const lastError = new Error('最终失败');
    const task = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('首次失败'))
      .mockRejectedValueOnce(lastError);

    await expect(
      executeWithRetry(task, 2, 0, { signal: controller.signal }),
    ).rejects.toBe(lastError);

    expect(task).toHaveBeenCalledTimes(2);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  it.each(['同步', '异步'] as const)(
    '重试回调%s失败应停止重试并清理监听',
    async (failureType) => {
      const controller = new AbortController();
      const error = new Error('回调失败');
      const task = vi.fn(
        async () => await Promise.reject(new Error('任务失败')),
      );
      const onRetry = vi.fn(() => {
        if (failureType === '同步') throw error;
        return Promise.reject(error);
      });

      await expect(
        executeWithRetry(task, 3, 0, {
          signal: controller.signal,
          onRetry,
        }),
      ).rejects.toBe(error);

      expect(task).toHaveBeenCalledOnce();
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    },
  );

  it('未提供信号时应保持同步异常的重试行为', async () => {
    const task = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(() => {
        throw new Error('同步失败');
      })
      .mockResolvedValue('完成');
    const onRetry = vi.fn();

    await expect(executeWithRetry(task, 2, 0, { onRetry })).resolves.toBe(
      '完成',
    );

    expect(task).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(new Error('同步失败'), 0, 0);
  });
});
