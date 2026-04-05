import { ISliderCaptchaRuntimeConfig } from './slider-captcha-runtime-config.interface';

/**
 * 模块级配置
 */
export interface ISliderCaptchaModuleOptions {
  backgroundImagePaths: readonly string[];
  canvasWidthPx?: number;
  canvasHeightPx?: number;
  maskSvgPaths?: readonly string[];
  bindingSecret?: string;
  defaultRuntimeConfig?: ISliderCaptchaRuntimeConfig;
}
