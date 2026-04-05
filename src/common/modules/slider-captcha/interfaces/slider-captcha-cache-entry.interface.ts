import { ISliderCaptchaTrackRules } from './slider-captcha-track-rules.interface';

/**
 * 缓存中的挑战数据
 */
export interface ISliderCaptchaCacheEntry {
  correctX: number;
  slotY: number;
  tolerancePx: number;
  remainingRetries: number;
  pieceSizePx: number;
  issuePassToken: boolean;
  passTtlSeconds: number;
  bindingDigest?: string;
  trackRules: Required<ISliderCaptchaTrackRules>;
}
