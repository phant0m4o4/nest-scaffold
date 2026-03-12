/**
 * 缓存中存储的验证码条目结构
 * @remarks 包含答案、剩余重试次数和验证策略，用于支持可配置的重试和大小写敏感机制
 */
export interface ISvgCaptchaCacheEntry {
  /** 验证码答案（caseSensitive=false 时存储小写，否则保留原始大小写） */
  readonly answer: string;
  /** 剩余可重试次数（0 表示本次是最后一次机会） */
  remainingRetries: number;
  /** 验证时是否区分大小写 */
  readonly caseSensitive: boolean;
}
