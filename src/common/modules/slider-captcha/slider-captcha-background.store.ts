import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { InjectPinoLogger } from 'nestjs-pino';
import type { PinoLogger } from 'nestjs-pino';
import type { ISliderCaptchaModuleOptions } from './interfaces/slider-captcha-module-options.interface';
import { SliderCaptchaConstants } from './slider-captcha.constants';

/**
 * 底图内存仓库
 *
 * 职责：
 * - 在模块启动时把磁盘图片读取并标准化到统一尺寸
 * - 在运行时以 O(1) 从内存返回随机底图，避免请求链路磁盘 IO
 */
@Injectable()
export class SliderCaptchaBackgroundStore implements OnModuleInit {
  /** 预加载后的底图 Buffer 列表 */
  private _backgrounds: Buffer[] = [];
  /** 当前使用的画布宽度（由 options 或默认值决定） */
  private _canvasWidthPx: number =
    SliderCaptchaConstants.DEFAULT_CANVAS_WIDTH_PX;
  /** 当前使用的画布高度（由 options 或默认值决定） */
  private _canvasHeightPx: number =
    SliderCaptchaConstants.DEFAULT_CANVAS_HEIGHT_PX;

  constructor(
    @Inject(SliderCaptchaConstants.OPTIONS_TOKEN)
    private readonly _options: ISliderCaptchaModuleOptions,
    @InjectPinoLogger(SliderCaptchaBackgroundStore.name)
    private readonly _logger: PinoLogger,
  ) {}

  /**
   * 模块启动时预加载底图
   *
   * 关键步骤：
   * 1) 校验路径数组非空
   * 2) 按统一画布尺寸 resize + png 标准化
   * 3) 把结果持久在内存字段 _backgrounds
   */
  async onModuleInit(): Promise<void> {
    const inputPaths = this._options.backgroundImagePaths;
    if (!inputPaths || inputPaths.length === 0) {
      throw new Error('SliderCaptcha 背景图路径不能为空');
    }
    this._canvasWidthPx =
      this._options.canvasWidthPx ??
      SliderCaptchaConstants.DEFAULT_CANVAS_WIDTH_PX;
    this._canvasHeightPx =
      this._options.canvasHeightPx ??
      SliderCaptchaConstants.DEFAULT_CANVAS_HEIGHT_PX;
    const preloadedBuffers: Buffer[] = [];
    for (const imagePath of inputPaths) {
      try {
        // 读取磁盘源图；若路径错误会抛错并阻止服务启动
        const rawBuffer = await readFile(imagePath);
        // 统一输出为 PNG 并 cover 到目标尺寸，便于后续坐标计算稳定
        const normalizedBuffer = await sharp(rawBuffer)
          .resize(this._canvasWidthPx, this._canvasHeightPx, { fit: 'cover' })
          .png()
          .toBuffer();
        preloadedBuffers.push(normalizedBuffer);
      } catch (error: unknown) {
        this._logger.error(
          { event: 'slider_captcha_background_load_failed', imagePath, error },
          `Slider Captcha 底图加载失败: ${imagePath}`,
        );
        throw new Error(`SliderCaptcha 底图加载失败: ${imagePath}`);
      }
    }
    this._backgrounds = preloadedBuffers;
    this._logger.info(
      {
        event: 'slider_captcha_backgrounds_loaded',
        count: this._backgrounds.length,
        canvasWidthPx: this._canvasWidthPx,
        canvasHeightPx: this._canvasHeightPx,
      },
      `Slider Captcha 底图预加载完成，共 ${this._backgrounds.length} 张`,
    );
  }

  /**
   * 获取随机底图
   *
   * @returns 一张已标准化的背景图 Buffer
   */
  getRandomBackground(): Buffer {
    if (this._backgrounds.length === 0) {
      throw new Error('SliderCaptcha 底图库为空，请检查初始化流程');
    }
    const randomIndex = randomInt(0, this._backgrounds.length);
    return this._backgrounds[randomIndex];
  }

  /**
   * 获取当前画布宽度
   */
  getCanvasWidthPx(): number {
    return this._canvasWidthPx;
  }

  /**
   * 获取当前画布高度
   */
  getCanvasHeightPx(): number {
    return this._canvasHeightPx;
  }
}
