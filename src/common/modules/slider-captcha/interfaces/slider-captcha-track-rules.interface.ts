/**
 * 滑动轨迹校验规则
 */
export interface ISliderCaptchaTrackRules {
  minTrackPoints?: number;
  maxTrackPoints?: number;
  minDragDurationMs?: number;
  maxDragDurationMs?: number;
  maxBackwardPx?: number;
  maxBackwardCount?: number;
  maxSegmentSpeedPxPerMs?: number;
  minAverageSpeedPxPerMs?: number;
  minSpeedVariance?: number;
  finalPointTolerancePx?: number;
}
