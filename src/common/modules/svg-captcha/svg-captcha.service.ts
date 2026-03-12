import { EnvironmentEnum } from '@/common/enums/environment.enum';
import { CacheService } from '@/common/modules/cache/cache.service';
import { Injectable } from '@nestjs/common';
import { randomBytes, randomInt } from 'node:crypto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ISvgCaptchaCacheEntry } from './interfaces/svg-captcha-cache-entry.interface';
import { ISvgCaptchaConfig } from './interfaces/svg-captcha-config.interface';
import { ISvgCaptchaResult } from './interfaces/svg-captcha-result.interface';

/**
 * SVG Captcha 服务
 *
 * 提供 SVG 格式的验证码生成和验证功能：
 * - 生成带噪声干扰的 SVG 验证码图片
 * - 将验证码答案存储在 Redis 缓存中（带 TTL）
 * - 支持大小写敏感/不敏感验证（默认不区分）
 * - 所有配置均通过 generate() 运行时参数动态传入
 * @see README.md 查看完整使用示例与配置说明
 */
@Injectable()
export class SvgCaptchaService {
  /** 缓存键前缀，所有验证码缓存均以此为前缀 */
  private static readonly _CACHE_KEY_PREFIX = 'svg-captcha';

  /** 默认配置（调用 generate() 时未传入的字段回退到此默认值） */
  private static readonly _DEFAULT_CONFIG: Required<ISvgCaptchaConfig> = {
    length: 4,
    charset: 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefhijkmnpqrstuvwxyz2345678',
    ttlSeconds: 300,
    width: 120,
    height: 40,
    fontSizeRange: [20, 30],
    colorRange: {
      min: [0, 0, 0],
      max: [100, 100, 100],
    },
    backgroundColor: [255, 255, 255],
    noiseLines: true,
    noiseLinesCount: 3,
    noiseDots: true,
    noiseDotsCount: 20,
    rotationRange: [-15, 15],
    maxRetries: 0,
    caseSensitive: false,
  };

  constructor(
    private readonly _cacheService: CacheService,
    @InjectPinoLogger(SvgCaptchaService.name)
    private readonly _logger: PinoLogger,
  ) {}

  /** 将运行时配置与默认配置合并，数组/对象字段用 ?? 防止被 undefined 覆盖 */
  private _getMergedConfig(
    runtimeConfig: ISvgCaptchaConfig = {},
  ): Required<ISvgCaptchaConfig> {
    const defaults = SvgCaptchaService._DEFAULT_CONFIG;
    const merged: Required<ISvgCaptchaConfig> = {
      ...defaults,
      ...runtimeConfig,
      fontSizeRange: runtimeConfig.fontSizeRange ?? defaults.fontSizeRange,
      colorRange: runtimeConfig.colorRange ?? defaults.colorRange,
      backgroundColor:
        runtimeConfig.backgroundColor ?? defaults.backgroundColor,
      rotationRange: runtimeConfig.rotationRange ?? defaults.rotationRange,
    };
    return merged;
  }

  /**
   * 生成随机整数（包含 min 和 max）
   * @private
   */
  private _randomInt(min: number, max: number): number {
    return randomInt(min, max + 1);
  }

  /**
   * 生成随机字符
   * @private
   */
  private _randomChar(charset: string): string {
    return charset[this._randomInt(0, charset.length - 1)];
  }

  /**
   * 生成随机颜色（RGB）
   * @private
   */
  private _randomColor(
    min: [number, number, number],
    max: [number, number, number],
  ): string {
    const r = this._randomInt(min[0], max[0]);
    const g = this._randomInt(min[1], max[1]);
    const b = this._randomInt(min[2], max[2]);
    return `rgb(${r},${g},${b})`;
  }

  /** 构建缓存键：`svg-captcha:{captchaId}` */
  private _buildCacheKey(captchaId: string): string {
    return `${SvgCaptchaService._CACHE_KEY_PREFIX}:${captchaId}`;
  }

  /** 生成验证码 ID（32 位十六进制随机字符串） */
  private _generateCaptchaId(): string {
    return randomBytes(16).toString('hex');
  }

  /** 生成指定长度的随机验证码文本 */
  private _generateText(length: number, charset: string): string {
    return Array.from({ length }, () => this._randomChar(charset)).join('');
  }

  /**
   * 生成噪声线 SVG
   * @private
   */
  private _generateNoiseLines(
    count: number,
    width: number,
    height: number,
  ): string {
    let lines = '';
    for (let i = 0; i < count; i++) {
      const x1 = this._randomInt(0, width);
      const y1 = this._randomInt(0, height);
      const x2 = this._randomInt(0, width);
      const y2 = this._randomInt(0, height);
      const color = this._randomColor([150, 150, 150], [200, 200, 200]);
      lines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1" opacity="0.5"/>`;
    }
    return lines;
  }

  /**
   * 生成噪声点 SVG
   * @private
   */
  private _generateNoiseDots(
    count: number,
    width: number,
    height: number,
  ): string {
    let dots = '';
    for (let i = 0; i < count; i++) {
      const x = this._randomInt(0, width);
      const y = this._randomInt(0, height);
      const color = this._randomColor([150, 150, 150], [200, 200, 200]);
      dots += `<circle cx="${x}" cy="${y}" r="1" fill="${color}" opacity="0.5"/>`;
    }
    return dots;
  }

  /**
   * 生成字符 SVG
   * @private
   */
  private _generateCharSvg(
    char: string,
    index: number,
    total: number,
    config: Required<ISvgCaptchaConfig>,
  ): string {
    const { width, height, fontSizeRange, colorRange, rotationRange } = config;
    const fontSize = this._randomInt(fontSizeRange[0], fontSizeRange[1]);
    const color = this._randomColor(colorRange.min, colorRange.max);
    const rotation = this._randomInt(rotationRange[0], rotationRange[1]);
    const charWidth = width / total;
    const x = charWidth * index + charWidth / 2;
    const y = height / 2 + fontSize / 3;
    const transform = `rotate(${rotation} ${x} ${y})`;
    return `<text x="${x}" y="${y}" font-size="${fontSize}" fill="${color}" text-anchor="middle" transform="${transform}" font-family="Arial, sans-serif" font-weight="bold">${char}</text>`;
  }

  /**
   * 生成 SVG 验证码
   * @param config 运行时配置（可选），未传入的字段使用默认值
   * @returns SVG 图片字符串 + captchaId（开发环境额外返回 answer）
   */
  async generate(config: ISvgCaptchaConfig = {}): Promise<ISvgCaptchaResult> {
    const mergedConfig = this._getMergedConfig(config);

    const captchaId = this._generateCaptchaId();
    const text = this._generateText(mergedConfig.length, mergedConfig.charset);

    const isCaseSensitive = config.caseSensitive ?? false;
    const cacheEntry: ISvgCaptchaCacheEntry = {
      answer: isCaseSensitive ? text : text.toLowerCase(),
      remainingRetries: config.maxRetries ?? 0,
      caseSensitive: isCaseSensitive,
    };
    await this._cacheService.set(
      this._buildCacheKey(captchaId),
      cacheEntry,
      mergedConfig.ttlSeconds,
    );

    const { width, height, backgroundColor } = mergedConfig;
    const bgColor = `rgb(${backgroundColor[0]},${backgroundColor[1]},${backgroundColor[2]})`;

    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<rect width="${width}" height="${height}" fill="${bgColor}"/>`;

    if (mergedConfig.noiseDots) {
      svg += this._generateNoiseDots(
        mergedConfig.noiseDotsCount,
        width,
        height,
      );
    }

    if (mergedConfig.noiseLines) {
      svg += this._generateNoiseLines(
        mergedConfig.noiseLinesCount,
        width,
        height,
      );
    }

    for (let i = 0; i < text.length; i++) {
      svg += this._generateCharSvg(text[i], i, text.length, mergedConfig);
    }

    svg += '</svg>';

    const isDev = process.env.NODE_ENV === EnvironmentEnum.DEVELOPMENT;
    this._logger.debug(
      { event: 'svg_captcha_generated', captchaId, ...(isDev ? { text } : {}) },
      `SVG 验证码已生成: ${captchaId}`,
    );
    return {
      svg,
      captchaId,
      ...(isDev ? { answer: text } : {}),
    };
  }

  /**
   * 验证验证码
   * @param captchaId 验证码 ID
   * @param answer 用户输入的答案
   * @returns 验证是否通过
   * @remarks
   * - 验证成功：立即删除缓存
   * - 验证失败且有剩余重试次数：递减重试次数，保留缓存（TTL 不重置）
   * - 验证失败且无剩余重试次数：立即删除缓存
   */
  async verify(captchaId: string, answer: string): Promise<boolean> {
    if (!captchaId || !answer) {
      return false;
    }
    const cacheKey = this._buildCacheKey(captchaId);
    const entry = await this._cacheService.get<ISvgCaptchaCacheEntry>(cacheKey);
    if (!entry) {
      this._logger.debug(
        { event: 'svg_captcha_expired', captchaId },
        `验证码已过期或不存在: ${captchaId}`,
      );
      return false;
    }
    const normalizedAnswer = entry.caseSensitive
      ? answer
      : answer.toLowerCase();
    const isValid = entry.answer === normalizedAnswer;
    if (isValid) {
      await this._cacheService.delete(cacheKey);
      this._logger.debug(
        { event: 'svg_captcha_verified', captchaId },
        `验证码验证成功: ${captchaId}`,
      );
      return true;
    }
    if (entry.remainingRetries > 0) {
      // 还有重试机会：递减次数，保留缓存并维持原 TTL
      entry.remainingRetries -= 1;
      const remainingTtl = await this._cacheService.getTTL(cacheKey);
      await this._cacheService.set(
        cacheKey,
        entry,
        remainingTtl > 0 ? remainingTtl : 1,
      );
      this._logger.debug(
        {
          event: 'svg_captcha_failed',
          captchaId,
          remainingRetries: entry.remainingRetries,
        },
        `验证码验证失败，剩余重试 ${entry.remainingRetries} 次: ${captchaId}`,
      );
    } else {
      // 无剩余重试：删除缓存
      await this._cacheService.delete(cacheKey);
      this._logger.debug(
        { event: 'svg_captcha_failed', captchaId, remainingRetries: 0 },
        `验证码验证失败且无剩余重试，已删除: ${captchaId}`,
      );
    }
    return false;
  }

  /**
   * 删除验证码（手动清理）
   *
   * @param captchaId 验证码 ID
   * @returns 是否删除成功
   */
  async delete(captchaId: string): Promise<boolean> {
    return await this._cacheService.delete(this._buildCacheKey(captchaId));
  }
}
