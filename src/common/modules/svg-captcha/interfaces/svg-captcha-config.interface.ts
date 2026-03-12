/**
 * SVG Captcha 配置接口
 */
export interface ISvgCaptchaConfig {
  /**
   * 验证码字符长度
   * @default 4
   */
  length?: number;
  /**
   * 验证码字符集
   * @default '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'
   */
  charset?: string;
  /**
   * 验证码过期时间（秒）
   * @default 300
   */
  ttlSeconds?: number;
  /**
   * SVG 宽度
   * @default 120
   */
  width?: number;
  /**
   * SVG 高度
   * @default 40
   */
  height?: number;
  /**
   * 字体大小范围 [min, max]
   * @default [20, 30]
   */
  fontSizeRange?: [number, number];
  /**
   * 字符颜色范围（RGB）
   * @default { min: [0, 0, 0], max: [100, 100, 100] }
   */
  colorRange?: {
    min: [number, number, number];
    max: [number, number, number];
  };
  /**
   * 背景颜色（RGB）
   * @default [255, 255, 255]
   */
  backgroundColor?: [number, number, number];
  /**
   * 是否启用噪声线
   * @default true
   */
  noiseLines?: boolean;
  /**
   * 噪声线数量
   * @default 3
   */
  noiseLinesCount?: number;
  /**
   * 是否启用噪声点
   * @default true
   */
  noiseDots?: boolean;
  /**
   * 噪声点数量
   * @default 20
   */
  noiseDotsCount?: number;
  /**
   * 字符旋转角度范围（度）
   * @default [-15, 15]
   */
  rotationRange?: [number, number];
  /**
   * 允许的最大重试次数（验证失败后还能再尝试的次数）
   * - 0 表示不允许重试，验证一次即失效（默认行为）
   * - N 表示允许失败后再尝试 N 次（共 N+1 次机会）
   * @default 0
   */
  maxRetries?: number;
  /**
   * 验证时是否区分大小写
   * - false：不区分大小写（默认，用户友好）
   * - true：区分大小写（更高安全性）
   * @default false
   */
  caseSensitive?: boolean;
}
