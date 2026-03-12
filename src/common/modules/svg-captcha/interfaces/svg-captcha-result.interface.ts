/**
 * SVG Captcha 生成结果接口
 */
export interface ISvgCaptchaResult {
  /**
   * SVG 图片内容（字符串）
   */
  svg: string;
  /**
   * 验证码 ID（用于后续验证）
   */
  captchaId: string;
  /**
   * 验证码答案（仅用于测试，生产环境不应返回）
   */
  answer?: string;
}
