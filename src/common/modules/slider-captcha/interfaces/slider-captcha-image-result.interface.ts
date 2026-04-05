/**
 * 图片合成输出
 */
export interface ISliderCaptchaImageResult {
  backgroundImageBase64: string;
  puzzleImageBase64: string;
  slotY: number;
  correctX: number;
  maskRotationDegrees: 0 | 90 | 180 | 270;
  pieceSizePx: number;
}
