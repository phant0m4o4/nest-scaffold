/**
 * verify 入参中的轨迹点
 */
interface ISliderCaptchaTrackPoint {
  x: number;
  y: number;
  t: number;
}

/**
 * 校验请求参数
 */
export interface ISliderCaptchaVerifyPayload {
  captchaId: string;
  finalSlideX: number;
  track: ISliderCaptchaTrackPoint[];
  bindingKey?: string;
}
