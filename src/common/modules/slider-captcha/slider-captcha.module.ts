import { CacheModule } from '@/common/modules/cache/cache.module';
import { DynamicModule, Module } from '@nestjs/common';
import { ISliderCaptchaModuleOptions } from './interfaces/slider-captcha-module-options.interface';
import { SliderCaptchaBackgroundStore } from './slider-captcha-background.store';
import { SliderCaptchaConstants } from './slider-captcha.constants';
import { SliderCaptchaImageComposer } from './slider-captcha-image-composer';
import { SliderCaptchaService } from './slider-captcha.service';
import { SliderCaptchaTrackValidator } from './slider-captcha-track-validator';

/**
 * Slider Captcha 模块
 *
 * 设计要点：
 * - 使用 DynamicModule + forRoot 传入底图路径数组与安全配置
 * - 对外仅导出 SliderCaptchaService，业务层通过服务调用 generate/verify
 * - BackgroundStore、Composer、Validator 在模块内部协作，业务无需感知细节
 */
@Module({})
export class SliderCaptchaModule {
  /**
   * 注册模块
   *
   * @param options 模块初始化参数（底图路径、默认参数、可选 bindingSecret 等）
   * @returns 动态模块定义
   */
  static forRoot(options: ISliderCaptchaModuleOptions): DynamicModule {
    return {
      module: SliderCaptchaModule,
      imports: [CacheModule],
      providers: [
        {
          provide: SliderCaptchaConstants.OPTIONS_TOKEN,
          useValue: options,
        },
        SliderCaptchaBackgroundStore,
        SliderCaptchaImageComposer,
        SliderCaptchaTrackValidator,
        SliderCaptchaService,
      ],
      exports: [SliderCaptchaService],
    };
  }
}
