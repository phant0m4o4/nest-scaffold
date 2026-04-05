import { ISliderCaptchaTrackRules } from './interfaces/slider-captcha-track-rules.interface';

/**
 * Slider Captcha 模块常量
 *
 * 说明：
 * - 统一管理缓存前缀、默认尺寸、默认安全阈值，避免魔法数字散落在各个类中
 * - 所有默认值都可以被 forRoot/defaultRuntimeConfig/runtimeConfig 覆盖
 * - DEFAULT_TRACK_RULES 是防脚本策略的“保底规则”，偏向安全与可用性的折中
 */
export class SliderCaptchaConstants {
  /** 动态模块 options 注入 token */
  static readonly OPTIONS_TOKEN = 'SLIDER_CAPTCHA_OPTIONS';
  /** 验证码挑战缓存前缀 */
  static readonly CAPTCHA_CACHE_PREFIX = 'slider-captcha';
  /** 验证通过后的一次性 token 缓存前缀 */
  static readonly PASS_CACHE_PREFIX = 'slider-captcha:pass';
  /** 默认背景画布宽度 */
  static readonly DEFAULT_CANVAS_WIDTH_PX = 320;
  /** 默认背景画布高度 */
  static readonly DEFAULT_CANVAS_HEIGHT_PX = 160;
  /** 最终坐标容差（像素） */
  static readonly DEFAULT_TOLERANCE_PX = 6;
  /** 挑战缓存默认 TTL（秒） */
  static readonly DEFAULT_TTL_SECONDS = 300;
  /** 默认允许重试次数（0 表示一次性） */
  static readonly DEFAULT_MAX_RETRIES = 0;
  /** 默认启用 passToken 二次校验 */
  static readonly DEFAULT_ISSUE_PASS_TOKEN = true;
  /** passToken 默认 TTL（秒） */
  static readonly DEFAULT_PASS_TTL_SECONDS = 180;
  /** 默认拼图块尺寸 */
  static readonly DEFAULT_PIECE_SIZE_PX = 48;
  /** 默认拼图块安全边距 */
  static readonly DEFAULT_PIECE_MARGIN_PX = 12;
  /** 默认轨迹规则（用于过滤机器脚本轨迹） */
  static readonly DEFAULT_TRACK_RULES: Required<ISliderCaptchaTrackRules> = {
    minTrackPoints: 8,
    maxTrackPoints: 200,
    minDragDurationMs: 250,
    maxDragDurationMs: 15000,
    maxBackwardPx: 8,
    maxBackwardCount: 2,
    maxSegmentSpeedPxPerMs: 3.5,
    minAverageSpeedPxPerMs: 0.01,
    minSpeedVariance: 0.001,
    finalPointTolerancePx: 2,
  };
}
