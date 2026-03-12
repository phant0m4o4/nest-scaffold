import { CacheModule } from '@/common/modules/cache/cache.module';
import { Module } from '@nestjs/common';
import { SvgCaptchaService } from './svg-captcha.service';

/**
 * SVG Captcha 模块
 *
 * 提供 SVG 格式的验证码生成和验证功能：
 * - 自动注册 CacheModule（Redis）用于验证码答案存储
 * - 所有验证码参数通过 generate() 运行时传入，无需环境变量配置
 * - 导出 SvgCaptchaService 供业务模块注入使用
 * @see README.md 查看完整使用示例与配置说明
 */
@Module({
  imports: [CacheModule],
  providers: [SvgCaptchaService],
  exports: [SvgCaptchaService],
})
export class SvgCaptchaModule {}
