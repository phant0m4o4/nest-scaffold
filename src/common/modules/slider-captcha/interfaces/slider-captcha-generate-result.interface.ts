/**
 * 生成滑块验证码结果
 */
export interface ISliderCaptchaGenerateResult {
  captchaId: string;
  backgroundImageBase64: string;
  puzzleImageBase64: string;
  slotY: number;
  maskRotationDegrees: 0 | 90 | 180 | 270;
  correctX?: number;
}
