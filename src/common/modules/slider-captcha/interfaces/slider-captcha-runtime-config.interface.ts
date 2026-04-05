import { ISliderCaptchaTrackRules } from './slider-captcha-track-rules.interface';

/**
 * 运行时生成配置
 */
export interface ISliderCaptchaRuntimeConfig {
  tolerancePx?: number;
  ttlSeconds?: number;
  maxRetries?: number;
  issuePassToken?: boolean;
  passTtlSeconds?: number;
  pieceSizePx?: number;
  pieceMarginPx?: number;
  bindingKey?: string;
  trackRules?: ISliderCaptchaTrackRules;
}
