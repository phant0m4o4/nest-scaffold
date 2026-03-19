# SvgCaptchaModule

纯后端 SVG 验证码模块，不依赖任何第三方图片库，生成带噪声干扰的 SVG 验证码图片，答案存储在 Redis 缓存中。

## 功能特性

- **纯 SVG 生成**：不依赖 canvas/sharp 等原生模块，无需额外系统依赖
- **噪声干扰**：支持干扰线、干扰点、字符旋转，提高识别难度
- **Redis 缓存**：验证码答案存储在 Redis 中，支持 TTL 自动过期
- **大小写策略可配**：默认不区分大小写（用户友好），可选区分大小写（更高安全性）
- **防暴力破解**：支持可配置重试次数（默认 0 次），耗尽后自动删除缓存
- **混淆字符集**：默认去除 `0/O`、`1/l/I` 等容易混淆的字符
- **运行时配置**：所有参数通过 `generate()` 调用时动态传入，按场景灵活定制
- **开发模式**：`NODE_ENV=development` 时自动返回答案，便于调试

## 依赖模块

- `CacheModule`（Redis）— 验证码答案存储

## 使用方式

### 1. 注册模块

在业务模块中导入 `SvgCaptchaModule`：

```typescript
import { SvgCaptchaModule } from '@/common/modules/svg-captcha/svg-captcha.module';

@Module({
  imports: [SvgCaptchaModule],
})
export class AuthModule {}
```

> `SvgCaptchaModule` 内部自动注册了 `CacheModule`，无需手动导入。

### 2. 在服务中注入

```typescript
import { SvgCaptchaService } from '@/common/modules/svg-captcha/svg-captcha.service';

@Injectable()
export class AuthService {
  constructor(private readonly _svgCaptchaService: SvgCaptchaService) {}

  /** 生成验证码 */
  async generateCaptcha(): Promise<ISvgCaptchaResult> {
    return await this._svgCaptchaService.generate({
      length: 4,
      ttlSeconds: 300,
    });
  }

  /** 验证验证码 */
  async verifyCaptcha(captchaId: string, answer: string): Promise<boolean> {
    return await this._svgCaptchaService.verify(captchaId, answer);
  }
}
```

### 3. 在控制器中使用

```typescript
@Controller('auth')
export class AuthController {
  constructor(private readonly _svgCaptchaService: SvgCaptchaService) {}

  @Get('captcha')
  async getCaptcha() {
    const result = await this._svgCaptchaService.generate();
    return { data: result };
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    const isValid = await this._svgCaptchaService.verify(
      dto.captchaId,
      dto.captchaAnswer,
    );
    if (!isValid) {
      throw new BadRequestException('验证码错误');
    }
    // ... 登录逻辑
  }
}
```

## SVG 转 PNG（可选：sharp）

本模块默认返回 **SVG 字符串**。若客户端或下游需要 **PNG**（如旧版邮件客户端、部分小程序），可在服务端用 [sharp](https://sharp.pixelplumbing.com/) 将 `result.svg` 栅格化。`sharp` 为可选依赖，需自行安装：

```bash
pnpm add sharp
```

### 示例：生成 PNG Buffer

```typescript
import sharp from 'sharp';

/**
 * 将 SvgCaptcha 返回的 SVG 转为 PNG Buffer。
 * @param svg - `ISvgCaptchaResult.svg`
 * @param options.density - 栅格密度（DPI），适当提高可减轻小尺寸验证码发糊
 */
async function svgCaptchaToPng(
  svg: string,
  options?: { density?: number },
): Promise<Buffer> {
  const density = options?.density ?? 144;
  return await sharp(Buffer.from(svg, 'utf-8'), { density })
    .png()
    .toBuffer();
}

// 使用
const result = await this._svgCaptchaService.generate({ width: 120, height: 40 });
const pngBuffer = await svgCaptchaToPng(result.svg);
// 例如：res.type('image/png').send(pngBuffer) 或写入对象存储
```

### 示例：固定输出宽高（与 generate 的 width/height 一致）

若 `generate()` 里改了 `width`/`height`，栅格化时可用 `resize` 与之一致，避免比例偏差：

```typescript
const width = 200;
const height = 60;
const result = await this._svgCaptchaService.generate({ width, height });
const pngBuffer = await sharp(Buffer.from(result.svg, 'utf-8'), { density: 144 })
  .resize(width, height)
  .png()
  .toBuffer();
```

> **说明**：`sharp` 依赖本机/容器内的 libvips；Docker 部署时需保证镜像内已安装 sharp 所需运行库，详见 sharp 官方安装文档。

## 运行时配置

`generate()` 方法接受可选的 `ISvgCaptchaConfig` 参数，未传入的字段使用默认值：

```typescript
const result = await svgCaptchaService.generate({
  length: 6,                          // 字符数
  ttlSeconds: 600,                    // 有效期 10 分钟
  width: 200,                         // SVG 宽度
  height: 60,                         // SVG 高度
  fontSizeRange: [24, 36],            // 字体大小范围
  colorRange: {                       // 字符颜色范围（RGB）
    min: [0, 0, 0],
    max: [150, 150, 150],
  },
  backgroundColor: [245, 245, 245],   // 背景色（RGB）
  noiseLines: true,                   // 启用干扰线
  noiseLinesCount: 5,                 // 干扰线数量
  noiseDots: true,                    // 启用干扰点
  noiseDotsCount: 30,                 // 干扰点数量
  rotationRange: [-20, 20],           // 字符旋转角度范围
  maxRetries: 2,                      // 允许失败后再尝试 2 次（共 3 次机会）
  caseSensitive: true,                // 区分大小写
});
```

不同业务场景可以传入不同参数：

```typescript
// 登录场景：4 位字符，5 分钟有效，不可重试
await svgCaptchaService.generate({ length: 4, ttlSeconds: 300 });

// 注册场景：6 位字符，10 分钟有效，允许重试 2 次
await svgCaptchaService.generate({ length: 6, ttlSeconds: 600, width: 200, height: 60, maxRetries: 2 });

// 高安全场景：区分大小写 + 更多噪声干扰
await svgCaptchaService.generate({ caseSensitive: true, noiseLinesCount: 8, noiseDotsCount: 50 });
```

## 验证流程

```
客户端              服务端                    Redis
  |                   |                       |
  |-- GET /captcha -->|                       |
  |                   |-- generate(config) -->|
  |                   |   生成文本 + SVG       |-- SET {answer, remainingRetries} (TTL) -->
  |<-- { svg, id } --|                       |
  |                   |                       |
  |-- POST /verify -->|                       |
  |   { id, answer }  |-- verify() --------->|-- GET svg-captcha:{id} ---------->|
  |                   |                       |
  |                   |   答案正确 → DEL       |-- DEL svg-captcha:{id} -------->|
  |                   |   答案错误:            |
  |                   |     retries > 0 → SET  |-- SET (retries-1, 保留TTL) ---->|
  |                   |     retries = 0 → DEL  |-- DEL svg-captcha:{id} -------->|
  |<-- { valid } -----|                       |
```

**安全设计**：
- `maxRetries=0`（默认）：验证一次即失效，答对答错都删除缓存
- `maxRetries=N`：允许 N 次失败重试（共 N+1 次机会），耗尽后删除缓存
- 重试更新缓存时保留原始 TTL，不会延长过期时间

## 默认配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `length` | `4` | 验证码字符数 |
| `charset` | 混淆安全字符集 | 去除 `0/O`、`1/l/I` 等易混淆字符 |
| `ttlSeconds` | `300` | 有效期 5 分钟 |
| `width` | `120` | SVG 宽度（px） |
| `height` | `40` | SVG 高度（px） |
| `fontSizeRange` | `[20, 30]` | 字体大小随机范围 |
| `colorRange` | `{min:[0,0,0], max:[100,100,100]}` | 字符颜色随机范围 |
| `backgroundColor` | `[255, 255, 255]` | 白色背景 |
| `noiseLines` | `true` | 启用干扰线 |
| `noiseLinesCount` | `3` | 干扰线数量 |
| `noiseDots` | `true` | 启用干扰点 |
| `noiseDotsCount` | `20` | 干扰点数量 |
| `rotationRange` | `[-15, 15]` | 字符旋转角度范围（度） |
| `maxRetries` | `0` | 允许的最大重试次数（0 = 一次性） |
| `caseSensitive` | `false` | 是否区分大小写 |

## 接口

### `ISvgCaptchaResult`

```typescript
interface ISvgCaptchaResult {
  svg: string;        // SVG 图片字符串
  captchaId: string;  // 验证码 ID（用于后续验证）
  answer?: string;    // 验证码答案（仅 development 环境返回）
}
```

### `ISvgCaptchaConfig`

所有字段均为可选，详见 `interfaces/svg-captcha-config.interface.ts`。

## 架构

```
SvgCaptchaModule
  ├── imports
  │     └── CacheModule.forRoot()   ← Redis 缓存
  ├── providers
  │     └── SvgCaptchaService
  │           ├── generate(config?) → 生成 SVG + 缓存答案
  │           ├── verify(id, answer) → 验证 + 删除缓存（一次性）
  │           └── delete(id)        → 手动清理缓存
  └── exports
        └── SvgCaptchaService
```
