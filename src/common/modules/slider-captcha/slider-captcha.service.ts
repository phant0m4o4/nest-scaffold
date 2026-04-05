import { EnvironmentEnum } from '@/common/enums/environment.enum';
import { CacheService } from '@/common/modules/cache/cache.service';
import { Inject, Injectable } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { InjectPinoLogger } from 'nestjs-pino';
import type { PinoLogger } from 'nestjs-pino';
import type { ISliderCaptchaCacheEntry } from './interfaces/slider-captcha-cache-entry.interface';
import type { ISliderCaptchaGenerateResult } from './interfaces/slider-captcha-generate-result.interface';
import type { ISliderCaptchaModuleOptions } from './interfaces/slider-captcha-module-options.interface';
import type { ISliderCaptchaRuntimeConfig } from './interfaces/slider-captcha-runtime-config.interface';
import type { ISliderCaptchaTrackRules } from './interfaces/slider-captcha-track-rules.interface';
import type { ISliderCaptchaVerifyPayload } from './interfaces/slider-captcha-verify-payload.interface';
import type { ISliderCaptchaVerifyResult } from './interfaces/slider-captcha-verify-result.interface';
import { SliderCaptchaBackgroundStore } from './slider-captcha-background.store';
import { SliderCaptchaConstants } from './slider-captcha.constants';
import { SliderCaptchaImageComposer } from './slider-captcha-image-composer';
import { SliderCaptchaTrackValidator } from './slider-captcha-track-validator';

interface ISliderCaptchaResolvedRuntimeConfig extends Omit<
  Required<ISliderCaptchaRuntimeConfig>,
  'trackRules'
> {
  trackRules: Required<ISliderCaptchaTrackRules>;
}

/**
 * Slider Captcha 服务
 *
 * 业务编排中心，负责：
 * - 参数合并与默认值回落
 * - 调用图像合成器生成挑战
 * - 缓存挑战、校验挑战、消耗重试次数
 * - 生成并消费 passToken（二次校验）
 */
@Injectable()
export class SliderCaptchaService {
  constructor(
    private readonly _cacheService: CacheService,
    private readonly _backgroundStore: SliderCaptchaBackgroundStore,
    private readonly _imageComposer: SliderCaptchaImageComposer,
    private readonly _trackValidator: SliderCaptchaTrackValidator,
    @Inject(SliderCaptchaConstants.OPTIONS_TOKEN)
    private readonly _options: ISliderCaptchaModuleOptions,
    @InjectPinoLogger(SliderCaptchaService.name)
    private readonly _logger: PinoLogger,
  ) {}

  /**
   * 生成验证码
   *
   * 流程：
   * 1) 合并运行时参数
   * 2) 生成 captchaId
   * 3) 调用 composer 产出图片和正确坐标
   * 4) 写入缓存（含轨迹规则、重试次数、可选 binding digest）
   */
  async generate(
    runtimeConfig: ISliderCaptchaRuntimeConfig = {},
  ): Promise<ISliderCaptchaGenerateResult> {
    const mergedConfig = this._getMergedRuntimeConfig(runtimeConfig);
    const captchaId = this._generateCaptchaId();
    const imageResult = await this._imageComposer.compose({
      canvasWidthPx: this._backgroundStore.getCanvasWidthPx(),
      canvasHeightPx: this._backgroundStore.getCanvasHeightPx(),
      pieceMarginPx: mergedConfig.pieceMarginPx,
      pieceSizePx: mergedConfig.pieceSizePx,
    });
    const cacheEntry: ISliderCaptchaCacheEntry = {
      correctX: imageResult.correctX,
      slotY: imageResult.slotY,
      tolerancePx: mergedConfig.tolerancePx,
      remainingRetries: mergedConfig.maxRetries,
      pieceSizePx: imageResult.pieceSizePx,
      issuePassToken: mergedConfig.issuePassToken,
      passTtlSeconds: mergedConfig.passTtlSeconds,
      bindingDigest: this._buildBindingDigest(runtimeConfig.bindingKey),
      trackRules: mergedConfig.trackRules,
    };
    await this._cacheService.set(
      this._buildCaptchaCacheKey(captchaId),
      cacheEntry,
      mergedConfig.ttlSeconds,
    );
    const isDevelopment = process.env.NODE_ENV === EnvironmentEnum.DEVELOPMENT;
    this._logger.debug(
      {
        event: 'slider_captcha_generated',
        captchaId,
        slotY: imageResult.slotY,
        maskRotationDegrees: imageResult.maskRotationDegrees,
      },
      `Slider 验证码已生成: ${captchaId}`,
    );
    return {
      captchaId,
      backgroundImageBase64: imageResult.backgroundImageBase64,
      puzzleImageBase64: imageResult.puzzleImageBase64,
      slotY: imageResult.slotY,
      maskRotationDegrees: imageResult.maskRotationDegrees,
      ...(isDevelopment ? { correctX: imageResult.correctX } : {}),
    };
  }

  /**
   * 验证验证码
   *
   * 逐层校验顺序：
   * - payload 基础合法性
   * - 挑战是否存在
   * - binding 是否匹配
   * - 轨迹是否可信
   * - 最终 X 是否落入容差
   * 任一失败都会按策略消耗重试次数。
   */
  async verify(
    payload: ISliderCaptchaVerifyPayload,
  ): Promise<ISliderCaptchaVerifyResult> {
    if (!payload.captchaId || !Number.isFinite(payload.finalSlideX)) {
      return { isValid: false, reason: 'INVALID_PAYLOAD' };
    }
    const cacheKey = this._buildCaptchaCacheKey(payload.captchaId);
    const cacheEntry =
      await this._cacheService.get<ISliderCaptchaCacheEntry>(cacheKey);
    if (!cacheEntry) {
      return { isValid: false, reason: 'CAPTCHA_NOT_FOUND' };
    }
    if (!this._isBindingValid(cacheEntry, payload.bindingKey)) {
      await this._consumeRetry(cacheKey, cacheEntry);
      return { isValid: false, reason: 'BINDING_MISMATCH' };
    }
    const trackValidationResult = this._trackValidator.validate(
      payload,
      cacheEntry.trackRules,
    );
    if (!trackValidationResult.isValid) {
      await this._consumeRetry(cacheKey, cacheEntry);
      return trackValidationResult;
    }
    const isXValid =
      Math.abs(payload.finalSlideX - cacheEntry.correctX) <=
      cacheEntry.tolerancePx;
    if (!isXValid) {
      await this._consumeRetry(cacheKey, cacheEntry);
      return { isValid: false, reason: 'SLIDE_X_MISMATCH' };
    }
    await this._cacheService.delete(cacheKey);
    const passToken = cacheEntry.issuePassToken
      ? await this._issuePassToken(payload.captchaId, cacheEntry.passTtlSeconds)
      : undefined;
    this._logger.info(
      { event: 'slider_captcha_verified', captchaId: payload.captchaId },
      `Slider 验证码验证成功: ${payload.captchaId}`,
    );
    return { isValid: true, ...(passToken ? { passToken } : {}) };
  }

  /**
   * 删除验证码缓存
   */
  async delete(captchaId: string): Promise<boolean> {
    return await this._cacheService.delete(
      this._buildCaptchaCacheKey(captchaId),
    );
  }

  /**
   * 消费 passToken（一次性）
   *
   * 设计意图：把“已通过人机验证”状态拆分为可复用的短期票据，
   * 供登录/注册等第二步接口幂等消费。
   */
  async consumePassToken(passToken: string): Promise<boolean> {
    if (!passToken) {
      return false;
    }
    return await this._cacheService.delete(this._buildPassCacheKey(passToken));
  }

  /**
   * 统一合并运行时配置
   *
   * 优先级：runtimeConfig > module defaultRuntimeConfig > constants defaults
   */
  private _getMergedRuntimeConfig(
    runtimeConfig: ISliderCaptchaRuntimeConfig,
  ): ISliderCaptchaResolvedRuntimeConfig {
    const defaults = this._options.defaultRuntimeConfig ?? {};
    const trackRules = this._getMergedTrackRules(
      defaults.trackRules,
      runtimeConfig.trackRules,
    );
    return {
      tolerancePx:
        runtimeConfig.tolerancePx ??
        defaults.tolerancePx ??
        SliderCaptchaConstants.DEFAULT_TOLERANCE_PX,
      ttlSeconds:
        runtimeConfig.ttlSeconds ??
        defaults.ttlSeconds ??
        SliderCaptchaConstants.DEFAULT_TTL_SECONDS,
      maxRetries:
        runtimeConfig.maxRetries ??
        defaults.maxRetries ??
        SliderCaptchaConstants.DEFAULT_MAX_RETRIES,
      issuePassToken:
        runtimeConfig.issuePassToken ??
        defaults.issuePassToken ??
        SliderCaptchaConstants.DEFAULT_ISSUE_PASS_TOKEN,
      passTtlSeconds:
        runtimeConfig.passTtlSeconds ??
        defaults.passTtlSeconds ??
        SliderCaptchaConstants.DEFAULT_PASS_TTL_SECONDS,
      pieceSizePx:
        runtimeConfig.pieceSizePx ??
        defaults.pieceSizePx ??
        SliderCaptchaConstants.DEFAULT_PIECE_SIZE_PX,
      pieceMarginPx:
        runtimeConfig.pieceMarginPx ??
        defaults.pieceMarginPx ??
        SliderCaptchaConstants.DEFAULT_PIECE_MARGIN_PX,
      bindingKey: runtimeConfig.bindingKey ?? defaults.bindingKey ?? '',
      trackRules,
    };
  }

  /**
   * 合并轨迹规则
   */
  private _getMergedTrackRules(
    defaultRules: ISliderCaptchaTrackRules | undefined,
    runtimeRules: ISliderCaptchaTrackRules | undefined,
  ): Required<ISliderCaptchaTrackRules> {
    return {
      ...SliderCaptchaConstants.DEFAULT_TRACK_RULES,
      ...(defaultRules ?? {}),
      ...(runtimeRules ?? {}),
    };
  }

  /**
   * 消耗一次重试次数
   *
   * 行为：
   * - remainingRetries <= 0: 立即删除挑战
   * - 其余情况：递减后按剩余 TTL 回写，避免重置过期时间
   */
  private async _consumeRetry(
    cacheKey: string,
    cacheEntry: ISliderCaptchaCacheEntry,
  ): Promise<void> {
    if (cacheEntry.remainingRetries <= 0) {
      await this._cacheService.delete(cacheKey);
      return;
    }
    const nextEntry: ISliderCaptchaCacheEntry = {
      ...cacheEntry,
      remainingRetries: cacheEntry.remainingRetries - 1,
    };
    const remainingTtl = await this._cacheService.getTTL(cacheKey);
    await this._cacheService.set(
      cacheKey,
      nextEntry,
      remainingTtl > 0 ? remainingTtl : 1,
    );
  }

  /**
   * 计算 binding 摘要
   *
   * 如果配置了 bindingSecret，使用 HMAC-SHA256 做摘要，避免明文存储绑定键。
   */
  private _buildBindingDigest(bindingKey?: string): string | undefined {
    if (!bindingKey) {
      return undefined;
    }
    const secret = this._options.bindingSecret;
    if (!secret) {
      return bindingKey;
    }
    return createHmac('sha256', secret).update(bindingKey).digest('hex');
  }

  /**
   * 校验 binding 是否一致
   */
  private _isBindingValid(
    cacheEntry: ISliderCaptchaCacheEntry,
    bindingKey?: string,
  ): boolean {
    if (!cacheEntry.bindingDigest) {
      return true;
    }
    const requestDigest = this._buildBindingDigest(bindingKey);
    if (!requestDigest) {
      return false;
    }
    const leftBuffer = Buffer.from(requestDigest, 'utf8');
    const rightBuffer = Buffer.from(cacheEntry.bindingDigest, 'utf8');
    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }
    return timingSafeEqual(leftBuffer, rightBuffer);
  }

  /**
   * 生成并写入 pass token
   *
   * 注意：passToken 与 captcha challenge 分离存储，便于一次性消费与权限边界控制。
   */
  private async _issuePassToken(
    captchaId: string,
    ttlSeconds: number,
  ): Promise<string> {
    const passToken = randomBytes(24).toString('hex');
    await this._cacheService.set(
      this._buildPassCacheKey(passToken),
      { captchaId, verifiedAt: Date.now() },
      ttlSeconds,
    );
    return passToken;
  }

  /**
   * 生成挑战 ID
   */
  private _generateCaptchaId(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * 构建挑战缓存键
   */
  private _buildCaptchaCacheKey(captchaId: string): string {
    return `${SliderCaptchaConstants.CAPTCHA_CACHE_PREFIX}:${captchaId}`;
  }

  /**
   * 构建 pass 缓存键
   */
  private _buildPassCacheKey(passToken: string): string {
    return `${SliderCaptchaConstants.PASS_CACHE_PREFIX}:${passToken}`;
  }
}
