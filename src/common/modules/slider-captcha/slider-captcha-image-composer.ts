import { Inject, Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import type { ISliderCaptchaImageInput } from './interfaces/slider-captcha-image-input.interface';
import type { ISliderCaptchaImageResult } from './interfaces/slider-captcha-image-result.interface';
import type { ISliderCaptchaModuleOptions } from './interfaces/slider-captcha-module-options.interface';
import { SliderCaptchaBackgroundStore } from './slider-captcha-background.store';
import { SliderCaptchaConstants } from './slider-captcha.constants';

/**
 * 图片合成器
 *
 * 职责边界：
 * - 只负责图像层面的随机与合成，不处理缓存、重试、业务校验
 * - 输入统一参数，输出可直接给前端展示的 base64 数据
 */
@Injectable()
export class SliderCaptchaImageComposer {
  /** 支持的离散旋转角，避免任意角度导致的外接框复杂计算 */
  private static readonly _ROTATIONS: Array<0 | 90 | 180 | 270> = [
    0, 90, 180, 270,
  ];
  /** 已加载的拼图 SVG 资源数组（至少一个） */
  private readonly _maskSvgs: Buffer[];
  /** 缩放+旋转后的掩膜缓存，减少重复 sharp 计算 */
  private readonly _maskCache: Map<string, Buffer> = new Map<string, Buffer>();

  constructor(
    private readonly _backgroundStore: SliderCaptchaBackgroundStore,
    @Inject(SliderCaptchaConstants.OPTIONS_TOKEN)
    private readonly _options: ISliderCaptchaModuleOptions,
  ) {
    const explicitMaskPaths = this._extractMaskSvgPaths(
      this._options.maskSvgPaths,
    );
    const defaultMaskCandidates = [join(__dirname, 'assets', 'puzzle.svg')];
    const candidatePaths = [
      ...explicitMaskPaths,
      ...defaultMaskCandidates,
    ].filter(
      (path, index, allPaths) =>
        path.length > 0 && allPaths.indexOf(path) === index,
    );
    const resolvedMaskPaths = candidatePaths.filter((path) => existsSync(path));
    if (resolvedMaskPaths.length === 0) {
      throw new Error('未找到 slider captcha 蒙版文件 puzzle.svg');
    }
    this._maskSvgs = resolvedMaskPaths.map((path) => readFileSync(path));
  }
  /**
   * 提取并校验蒙版路径，确保后续数组操作类型安全
   */
  private _extractMaskSvgPaths(
    maskSvgPaths: ISliderCaptchaModuleOptions['maskSvgPaths'],
  ): string[] {
    if (!Array.isArray(maskSvgPaths)) {
      return [];
    }
    return maskSvgPaths.filter((path): path is string => {
      return typeof path === 'string' && path.length > 0;
    });
  }

  /**
   * 合成验证码背景图与拼图块
   *
   * @param input 画布与拼图参数
   * @returns 背景图与拼图块（base64）以及服务端校验坐标
   */
  async compose(
    input: ISliderCaptchaImageInput,
  ): Promise<ISliderCaptchaImageResult> {
    const rotation = this._getRandomRotation();
    const backgroundBuffer = this._backgroundStore.getRandomBackground();
    const correctX = this._getRandomPosition(
      input.pieceMarginPx,
      input.canvasWidthPx - input.pieceSizePx - input.pieceMarginPx,
    );
    const slotY = this._getRandomPosition(
      input.pieceMarginPx,
      input.canvasHeightPx - input.pieceSizePx - input.pieceMarginPx,
    );
    const selectedMaskIndex = randomInt(0, this._maskSvgs.length);
    const rotatedMaskBuffer = await this._getRotatedMaskBuffer(
      selectedMaskIndex,
      input.pieceSizePx,
      rotation,
    );
    // 先在原图对应位置做“挖空”效果
    const holeBuffer = await this._buildHoleBuffer(rotatedMaskBuffer);
    const backgroundWithHole = await sharp(backgroundBuffer)
      .composite([{ input: holeBuffer, top: slotY, left: correctX }])
      .png()
      .toBuffer();
    // 再用绝对坐标掩膜从整张图里扣出拼图块
    const pieceCanvas = await sharp(backgroundBuffer)
      .composite([
        {
          input: await this._buildAbsoluteMaskBuffer({
            width: input.canvasWidthPx,
            height: input.canvasHeightPx,
            maskBuffer: rotatedMaskBuffer,
            left: correctX,
            top: slotY,
          }),
          blend: 'dest-in',
        },
      ])
      .png()
      .toBuffer();
    const puzzlePiece = await sharp(pieceCanvas)
      .extract({
        left: correctX,
        top: slotY,
        width: input.pieceSizePx,
        height: input.pieceSizePx,
      })
      .png()
      .toBuffer();
    return {
      backgroundImageBase64: backgroundWithHole.toString('base64'),
      puzzleImageBase64: puzzlePiece.toString('base64'),
      slotY,
      correctX,
      maskRotationDegrees: rotation,
      pieceSizePx: input.pieceSizePx,
    };
  }

  /**
   * 生成随机旋转角
   */
  private _getRandomRotation(): 0 | 90 | 180 | 270 {
    const index = randomInt(0, SliderCaptchaImageComposer._ROTATIONS.length);
    return SliderCaptchaImageComposer._ROTATIONS[index];
  }

  /**
   * 生成随机坐标（包含边界）
   */
  private _getRandomPosition(min: number, max: number): number {
    if (max <= min) {
      return min;
    }
    return randomInt(min, max + 1);
  }

  /**
   * 获取旋转后的掩膜图
   *
   * 通过缓存键 pieceSize + rotation 复用结果，避免同参数重复渲染
   */
  private async _getRotatedMaskBuffer(
    selectedMaskIndex: number,
    pieceSizePx: number,
    rotation: 0 | 90 | 180 | 270,
  ): Promise<Buffer> {
    const cacheKey = `${selectedMaskIndex}:${pieceSizePx}:${rotation}`;
    const cachedMaskBuffer = this._maskCache.get(cacheKey);
    if (cachedMaskBuffer) {
      return cachedMaskBuffer;
    }
    const rotatedBuffer = await sharp(this._maskSvgs[selectedMaskIndex])
      .resize(pieceSizePx, pieceSizePx, { fit: 'contain' })
      .rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    this._maskCache.set(cacheKey, rotatedBuffer);
    return rotatedBuffer;
  }

  /**
   * 构建缺口图层
   *
   * 先生成半透明暗层，再与掩膜做 dest-in，得到“仅拼图形状区域可见”的暗层
   */
  private async _buildHoleBuffer(maskBuffer: Buffer): Promise<Buffer> {
    const metadata = await sharp(maskBuffer).metadata();
    const width =
      metadata.width ?? SliderCaptchaConstants.DEFAULT_PIECE_SIZE_PX;
    const height =
      metadata.height ?? SliderCaptchaConstants.DEFAULT_PIECE_SIZE_PX;
    const dimLayer = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 96 },
      },
    })
      .png()
      .toBuffer();
    return await sharp(dimLayer)
      .composite([{ input: maskBuffer, blend: 'dest-in' }])
      .png()
      .toBuffer();
  }

  /**
   * 构建画布级掩膜
   *
   * 目的：把 piece 尺寸的掩膜贴到整张画布指定 left/top，便于整图裁切拼图块
   */
  private async _buildAbsoluteMaskBuffer(input: {
    width: number;
    height: number;
    maskBuffer: Buffer;
    left: number;
    top: number;
  }): Promise<Buffer> {
    return await sharp({
      create: {
        width: input.width,
        height: input.height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: input.maskBuffer,
          left: input.left,
          top: input.top,
        },
      ])
      .png()
      .toBuffer();
  }
}
