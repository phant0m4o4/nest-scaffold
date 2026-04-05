import { Injectable } from '@nestjs/common';
import { ISliderCaptchaTrackRules } from './interfaces/slider-captcha-track-rules.interface';
import { ISliderCaptchaVerifyPayload } from './interfaces/slider-captcha-verify-payload.interface';
import { ISliderCaptchaVerifyResult } from './interfaces/slider-captcha-verify-result.interface';

/**
 * 轨迹校验器
 *
 * 安全目标：
 * - 过滤“瞬时提交”“完全直线匀速”等典型机器行为
 * - 在不过度影响真实用户体验的前提下提升自动化攻击成本
 */
@Injectable()
export class SliderCaptchaTrackValidator {
  /**
   * 校验轨迹是否符合规则
   *
   * 校验顺序由便宜到昂贵：
   * 1) 点数、时长
   * 2) X 单调与回退次数
   * 3) 末点一致性
   * 4) 速度统计
   */
  validate(
    payload: ISliderCaptchaVerifyPayload,
    rules: Required<ISliderCaptchaTrackRules>,
  ): ISliderCaptchaVerifyResult {
    const trackPoints = payload.track;
    if (trackPoints.length < rules.minTrackPoints) {
      return { isValid: false, reason: 'TRACK_POINTS_TOO_FEW' };
    }
    if (trackPoints.length > rules.maxTrackPoints) {
      return { isValid: false, reason: 'TRACK_POINTS_TOO_MANY' };
    }
    const durationMs = trackPoints[trackPoints.length - 1].t - trackPoints[0].t;
    if (durationMs < rules.minDragDurationMs) {
      return { isValid: false, reason: 'TRACK_DURATION_TOO_SHORT' };
    }
    if (durationMs > rules.maxDragDurationMs) {
      return { isValid: false, reason: 'TRACK_DURATION_TOO_LONG' };
    }
    const isMonotonicValid = this._validateMonotonicX(trackPoints, rules);
    if (!isMonotonicValid) {
      return { isValid: false, reason: 'TRACK_BACKWARD_EXCEEDED' };
    }
    const isFinalPointValid = this._validateFinalPoint(
      trackPoints,
      payload.finalSlideX,
      rules.finalPointTolerancePx,
    );
    if (!isFinalPointValid) {
      return { isValid: false, reason: 'TRACK_FINAL_POINT_MISMATCH' };
    }
    const speedMetrics = this._calculateSpeedMetrics(trackPoints);
    if (speedMetrics.maxSpeedPxPerMs > rules.maxSegmentSpeedPxPerMs) {
      return { isValid: false, reason: 'TRACK_MAX_SPEED_EXCEEDED' };
    }
    if (speedMetrics.avgSpeedPxPerMs < rules.minAverageSpeedPxPerMs) {
      return { isValid: false, reason: 'TRACK_AVG_SPEED_TOO_LOW' };
    }
    if (speedMetrics.speedVariance < rules.minSpeedVariance) {
      return { isValid: false, reason: 'TRACK_TOO_LINEAR' };
    }
    return { isValid: true };
  }

  /**
   * 校验 X 方向单调与允许回退
   *
   * 真实拖动允许少量回抖；超阈值视为可疑行为
   */
  private _validateMonotonicX(
    track: ISliderCaptchaVerifyPayload['track'],
    rules: Required<ISliderCaptchaTrackRules>,
  ): boolean {
    let backwardCount = 0;
    for (let index = 1; index < track.length; index++) {
      const deltaX = track[index].x - track[index - 1].x;
      if (deltaX >= 0) {
        continue;
      }
      if (Math.abs(deltaX) > rules.maxBackwardPx) {
        return false;
      }
      backwardCount += 1;
      if (backwardCount > rules.maxBackwardCount) {
        return false;
      }
    }
    return true;
  }

  /**
   * 校验末点与 finalSlideX 一致性
   *
   * 末点偏差过大通常意味着“轨迹与最终提交坐标并非同一次操作”
   */
  private _validateFinalPoint(
    track: ISliderCaptchaVerifyPayload['track'],
    finalSlideX: number,
    tolerancePx: number,
  ): boolean {
    const finalTrackPoint = track[track.length - 1];
    return Math.abs(finalTrackPoint.x - finalSlideX) <= tolerancePx;
  }

  /**
   * 计算速度统计
   *
   * 说明：
   * - maxSpeed 用于过滤瞬移点
   * - avgSpeed 用于过滤异常慢拖
   * - variance 用于过滤过于平滑的机器人轨迹
   */
  private _calculateSpeedMetrics(track: ISliderCaptchaVerifyPayload['track']): {
    maxSpeedPxPerMs: number;
    avgSpeedPxPerMs: number;
    speedVariance: number;
  } {
    const speedSamples: number[] = [];
    for (let index = 1; index < track.length; index++) {
      const deltaX = Math.abs(track[index].x - track[index - 1].x);
      const deltaT = track[index].t - track[index - 1].t;
      const safeDeltaT = deltaT <= 0 ? 1 : deltaT;
      speedSamples.push(deltaX / safeDeltaT);
    }
    const sumSpeed = speedSamples.reduce((sum, speed) => sum + speed, 0);
    const avgSpeed =
      speedSamples.length === 0 ? 0 : sumSpeed / speedSamples.length;
    const maxSpeed = speedSamples.length === 0 ? 0 : Math.max(...speedSamples);
    const variance =
      speedSamples.length === 0
        ? 0
        : speedSamples.reduce((sum, speed) => {
            const delta = speed - avgSpeed;
            return sum + delta * delta;
          }, 0) / speedSamples.length;
    return {
      maxSpeedPxPerMs: maxSpeed,
      avgSpeedPxPerMs: avgSpeed,
      speedVariance: variance,
    };
  }
}
