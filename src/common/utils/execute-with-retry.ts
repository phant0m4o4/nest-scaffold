/**
 * 带重试机制执行异步函数
 * @description 提供通用的重试编排能力：支持最大重试次数、固定或指数退避的等待时间、抖动、最大等待上限、自定义重试判定回调、重试前回调，以及可选的 AbortSignal 中断。
 * - 算法：在每次失败后，根据当前重试序号 `attemptIndex` 计算下一次等待时间，若仍可重试则等待后继续；全部尝试失败后抛出最后一次错误。
 * - 幂等性：建议传入的 `asyncFunction` 满足幂等或具备可重入保障，避免产生副作用放大。
 * - 中断：若提供 `signal`，在发起或等待期间被中断将抛出 `name = 'AbortError'` 的错误。
 * @param asyncFunction 要执行的异步函数（需返回 Promise）
 * @param maxRetryCount 最大重试次数，默认 3，必须 ≥ 1
 * @param retryDelayMs 基础重试间隔（毫秒），默认 1000，必须 ≥ 0
 * @param options 可选项，详见 {@link ExecuteWithRetryOptions}
 * @returns 执行结果（成功时 resolve 第一次成功的返回值）
 * @throws 如果所有重试都失败，抛出最后一次捕获的错误；若被中断，抛出 `AbortError`
 * @example
 * // 基础用法（向后兼容）
 * await executeWithRetry(() => fetchData());
 * await executeWithRetry(() => fetchData(), 5, 1000);
 * @example
 * // 指数退避 + 抖动 + 最大间隔
 * await executeWithRetry(
 *   () => fetchData(),
 *   5,
 *   500,
 *   { exponentialBackoff: true, jitter: true, maxDelayMs: 5000 }
 * );
 * @example
 * // 自定义重试判定 + 重试回调（日志）
 * await executeWithRetry(
 *   () => fetchData(),
 *   5,
 *   500,
 *   {
 *     shouldRetry: (err, attempt) => err.name !== 'AbortError' && attempt < 4,
 *     onRetry: (err, attempt, delay) => console.warn(`[retry] #${attempt + 1} in ${delay}ms`, err.message),
 *   }
 * );
 * @example
 * // 支持 AbortSignal 主动中断
 * const ac = new AbortController();
 * const p = executeWithRetry(() => fetchData(), 5, 500, { signal: ac.signal });
 * ac.abort();
 * await p; // 将抛出 name 为 'AbortError' 的错误
 */
import { normalizeError } from './normalize-error';

export interface ExecuteWithRetryOptions {
  /**
   * 自定义重试判定回调
   * @description 返回 true 表示需要重试；false 表示直接抛出当前错误
   * @param error 本次捕获的错误
   * @param attemptIndex 当前尝试序号（从 0 开始）
   */
  shouldRetry?: (error: unknown, attemptIndex: number) => boolean;
  /**
   * 重试前回调（如日志、指标打点）
   * @param error 本次捕获的错误（标准化为 Error）
   * @param attemptIndex 当前尝试序号（从 0 开始）
   * @param nextDelayMs 预计的下一次等待时长（毫秒）
   */
  onRetry?: (
    error: Error,
    attemptIndex: number,
    nextDelayMs: number,
  ) => void | Promise<void>;
  /** 是否使用指数退避（delay = base * 2^attemptIndex），默认 false */
  exponentialBackoff?: boolean;
  /** 是否引入抖动（随机 0.5x~1.0x），默认 false */
  jitter?: boolean;
  /** 最大退避间隔（毫秒），用于对指数退避进行封顶；默认不封顶 */
  maxDelayMs?: number;
  /** 允许外部中断（被中断时抛出 name = 'AbortError' 的错误） */
  signal?: AbortSignal;
}

/**
 * 计算下一次等待时长（毫秒）
 * @description 按选项在固定间隔或指数退避基础上叠加：封顶与抖动，并确保非负整数。
 * @param attemptIndex 当前尝试序号（从 0 开始）
 * @param baseDelayMs 基础间隔（毫秒）
 * @param options 选项（指数退避、抖动、最大间隔）
 * @returns 下次等待时长（毫秒）
 * @notes 抖动实现使用 `Math.random()`，如需可测性可在外层屏蔽或注入替代实现。
 */
function computeDelayMs(
  attemptIndex: number,
  baseDelayMs: number,
  options?: ExecuteWithRetryOptions,
): number {
  const { exponentialBackoff, jitter, maxDelayMs } = options ?? {};
  const raw = exponentialBackoff
    ? baseDelayMs * Math.pow(2, attemptIndex)
    : baseDelayMs;
  const capped = Math.min(raw, maxDelayMs ?? raw);
  if (jitter) {
    const factor = 0.5 + Math.random() * 0.5; // 0.5x ~ 1.0x
    return Math.max(0, Math.floor(capped * factor));
  }
  return Math.max(0, Math.floor(capped));
}

/**
 * 延时等待（支持 AbortSignal 中断）
 * @param ms 等待时长（毫秒）
 * @param signal 可选中断信号；若在等待前或等待中被触发，将以 `AbortError` 失败
 * @returns Promise<void> 在到期且未被中断时 resolve
 */
async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      const error = new Error('Aborted');
      error.name = 'AbortError';
      reject(error);
    };
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer);
        const error = new Error('Aborted');
        error.name = 'AbortError';
        reject(error);
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

/**
 * 执行异步函数并在失败时按策略重试
 * @param asyncFunction 要执行的异步函数（需返回 Promise）
 * @param maxRetryCount 最大重试次数，默认 3，必须 ≥ 1
 * @param retryDelayMs 基础重试间隔（毫秒），默认 1000，必须 ≥ 0
 * @param options 可选项（指数退避、抖动、最大间隔、自定义判定、重试回调、AbortSignal）
 * @returns 第一次成功的返回值
 * @throws 若所有尝试均失败，抛出最后一次错误；若被中断，抛出 `AbortError`
 * @complexity 时间复杂度 O(maxRetryCount)；空间复杂度 O(1)
 */
export async function executeWithRetry<T>(
  asyncFunction: () => Promise<T>,
  maxRetryCount: number = 3,
  retryDelayMs: number = 1000,
  options?: ExecuteWithRetryOptions,
): Promise<T> {
  if (maxRetryCount < 1) {
    throw new Error('最大重试次数必须至少为 1');
  }
  if (retryDelayMs < 0) {
    throw new Error('重试延迟时间必须为非负数');
  }

  const shouldRetry = options?.shouldRetry ?? (() => true);
  const onRetry = options?.onRetry;
  const signal = options?.signal;

  const createAbortError = () => {
    const error = new Error('Aborted');
    error.name = 'AbortError';
    return error;
  };

  if (signal?.aborted) {
    throw createAbortError();
  }

  let lastEncounteredError: Error | null = null;

  for (
    let currentAttempt = 0;
    currentAttempt < maxRetryCount;
    currentAttempt++
  ) {
    try {
      return await asyncFunction();
    } catch (error: unknown) {
      const normalized = normalizeError(error);
      lastEncounteredError = normalized;

      if (!shouldRetry(normalized, currentAttempt)) {
        throw normalized;
      }

      // 如果还有重试次数，按策略等待后继续
      if (currentAttempt < maxRetryCount - 1) {
        const delay = computeDelayMs(currentAttempt, retryDelayMs, options);
        if (onRetry) await onRetry(normalized, currentAttempt, delay);
        if (signal?.aborted) throw createAbortError();
        await sleep(delay, signal);
        if (signal?.aborted) throw createAbortError();
      }
    }
  }

  // 所有重试都失败，抛出最后一次遇到的错误
  throw lastEncounteredError ?? new Error('执行失败：未知错误');
}
