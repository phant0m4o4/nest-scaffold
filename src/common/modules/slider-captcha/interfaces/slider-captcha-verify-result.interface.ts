/**
 * 校验结果
 */
export interface ISliderCaptchaVerifyResult {
  isValid: boolean;
  passToken?: string;
  reason?: string;
}
