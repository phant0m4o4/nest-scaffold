# SliderCaptchaModule

`SliderCaptchaModule` 是一个后端滑块拼图验证码能力模块，面向 NestJS 服务端场景，核心目标是：

- 生成背景图和拼图块（base64）
- 在 Redis 中保存挑战状态并校验
- 通过轨迹规则过滤简单脚本行为
- 可选发放一次性 `passToken`，用于登录/注册等第二步接口

---

## 功能特性

- **底图预加载**：模块启动时读取底图数组并预处理到内存，避免请求时磁盘 IO
- **拼图蒙版**：支持 `maskSvgPaths` 数组随机选择，并随机 `0 / 90 / 180 / 270` 旋转
- **多层校验**：位置容差 + 轨迹校验 + 可选 `bindingKey`
- **防重放**：支持 `passToken` 一次性消费（`consumePassToken`）
- **运行时覆盖**：模块默认配置可被 `generate(runtimeConfig)` 局部覆盖

---

## 快速开始

### 1) 模块注册

```ts
import { Module } from '@nestjs/common';
import { join } from 'node:path';
import { SliderCaptchaModule } from '@/common/modules/slider-captcha/slider-captcha.module';

@Module({
  imports: [
    SliderCaptchaModule.forRoot({
      backgroundImagePaths: [
        join(process.cwd(), 'assets/slider-captcha/bg-1.png'),
        join(process.cwd(), 'assets/slider-captcha/bg-2.png'),
      ],
      // 可选：用于 bindingKey 摘要（推荐）
      bindingSecret: 'your-binding-secret',
      // 可选：全局默认配置
      defaultRuntimeConfig: {
        tolerancePx: 6,
        ttlSeconds: 300,
        maxRetries: 1,
        issuePassToken: true,
        passTtlSeconds: 180,
      },
      // 可选：蒙版数组（每次随机选一个）
      maskSvgPaths: [
        join(process.cwd(), 'assets/slider-captcha/mask-1.svg'),
        join(process.cwd(), 'assets/slider-captcha/mask-2.svg'),
      ],
    }),
  ],
})
export class AuthModule {}
```

### 2) 服务注入与调用

```ts
import { Injectable } from '@nestjs/common';
import { SliderCaptchaService } from '@/common/modules/slider-captcha/slider-captcha.service';

@Injectable()
export class AuthService {
  constructor(private readonly _sliderCaptchaService: SliderCaptchaService) {}

  async executeGenerateCaptcha(sessionId: string) {
    return await this._sliderCaptchaService.generate({
      bindingKey: sessionId,
      tolerancePx: 6,
      maxRetries: 1,
    });
  }

  async executeVerifyCaptcha(input: {
    captchaId: string;
    finalSlideX: number;
    track: Array<{ x: number; y: number; t: number }>;
    sessionId: string;
  }) {
    return await this._sliderCaptchaService.verify({
      captchaId: input.captchaId,
      finalSlideX: input.finalSlideX,
      track: input.track,
      bindingKey: input.sessionId,
    });
  }

  async executeConsumePassToken(passToken: string): Promise<boolean> {
    return await this._sliderCaptchaService.consumePassToken(passToken);
  }
}
```

---

## 核心流程

### generate

1. 合并默认配置 + 运行时配置
2. 从内存底图中随机选择一张
3. 随机拼图槽位坐标与蒙版旋转角
4. 生成背景图和拼图块
5. 将挑战数据写入 Redis（含重试次数、轨迹规则、可选 binding 摘要）

### verify

1. 读取挑战缓存，不存在则失败
2. 校验 `bindingKey`（若启用）
3. 校验轨迹规则（点数、时长、速度、回退等）
4. 校验 `finalSlideX` 与 `correctX` 容差
5. 成功则删除挑战，并按需签发 `passToken`
6. 失败则消耗重试次数，耗尽后删除挑战

### consumePassToken

- 删除并消费 `passToken`（一次性）
- 适合用于「验证码通过后」的下一跳接口校验

---

## 配置说明

### forRoot(options)

| 字段                   | 类型                          | 必填 | 说明                                   |
| ---------------------- | ----------------------------- | ---- | -------------------------------------- |
| `backgroundImagePaths` | `readonly string[]`           | 是   | 底图路径数组，至少 1 张                |
| `canvasWidthPx`        | `number`                      | 否   | 画布宽度，默认 `320`                   |
| `canvasHeightPx`       | `number`                      | 否   | 画布高度，默认 `160`                   |
| `maskSvgPaths`         | `readonly string[]`           | 否   | 拼图蒙版路径数组，存在时每次随机选一个 |
| `bindingSecret`        | `string`                      | 否   | `bindingKey` 摘要密钥（推荐）          |
| `defaultRuntimeConfig` | `ISliderCaptchaRuntimeConfig` | 否   | 运行时默认参数                         |

### generate(runtimeConfig)

| 字段             | 类型                       | 默认值     | 说明                           |
| ---------------- | -------------------------- | ---------- | ------------------------------ |
| `tolerancePx`    | `number`                   | `6`        | 最终 X 容差                    |
| `ttlSeconds`     | `number`                   | `300`      | 挑战缓存 TTL                   |
| `maxRetries`     | `number`                   | `0`        | 最大重试次数（0=一次性）       |
| `issuePassToken` | `boolean`                  | `true`     | 是否签发 passToken             |
| `passTtlSeconds` | `number`                   | `180`      | passToken TTL                  |
| `pieceSizePx`    | `number`                   | `48`       | 拼图块边长                     |
| `pieceMarginPx`  | `number`                   | `12`       | 拼图块安全边距                 |
| `bindingKey`     | `string`                   | `''`       | 绑定上下文（会话、设备摘要等） |
| `trackRules`     | `ISliderCaptchaTrackRules` | 内置默认值 | 轨迹阈值配置                   |

### trackRules（默认策略）

默认规则可在 `slider-captcha.constants.ts` 查看，包括：

- 最小/最大轨迹点数
- 最小/最大拖动时长
- X 方向最大回退像素与次数
- 最大分段速度、最小平均速度
- 速度方差下限（过滤“过于平滑”的脚本轨迹）
- 末点与 `finalSlideX` 的允许偏差

---

## 返回值说明

### `generate()` 返回

| 字段                    | 说明                       |
| ----------------------- | -------------------------- |
| `captchaId`             | 挑战 ID                    |
| `backgroundImageBase64` | 背景图（含缺口）           |
| `puzzleImageBase64`     | 拼图块图像                 |
| `slotY`                 | 拼图槽位 Y 坐标            |
| `maskRotationDegrees`   | 蒙版旋转角（0/90/180/270） |
| `correctX`              | 仅开发环境返回，用于调试   |

### `verify()` 返回

| 字段        | 说明                   |
| ----------- | ---------------------- |
| `isValid`   | 是否验证通过           |
| `reason`    | 失败原因枚举（失败时） |
| `passToken` | 通过后可选发放         |

---

## 关键字段详解

### `bindingKey`（上下文绑定键）

`bindingKey` 用于把一次滑块挑战绑定到某个业务上下文，避免“一个用户生成，另一个用户复用同一 `captchaId` 验证”。

- 建议来源：
  - 登录态：`sessionId`
  - 匿名态：设备指纹摘要 / 临时会话 ID
- 使用规则：
  - `generate({ bindingKey })` 与 `verify({ bindingKey })` 必须传入同一值
  - 若 `generate` 时传了 `bindingKey`，`verify` 时不传或不一致会失败
  - 若 `generate` 时未传 `bindingKey`，则不会做绑定校验
- 存储安全：
  - 推荐在 `forRoot` 中配置 `bindingSecret`
  - 配置后，服务端会存储绑定键摘要而非明文，降低 Redis 明文泄露风险

示例（推荐）：

```ts
// 生成挑战（绑定当前会话）
await this._sliderCaptchaService.generate({
  bindingKey: sessionId,
});
// 校验挑战（必须带同一会话）
await this._sliderCaptchaService.verify({
  captchaId,
  finalSlideX,
  track,
  bindingKey: sessionId,
});
```

### `passToken`（验证通过后的一次性令牌）

`passToken` 是“验证码已通过”的一次性凭证，适用于两步式流程：

1. 第一步：前端调用滑块验证接口，服务端返回 `passToken`
2. 第二步：前端调用真正业务接口（登录/注册/重置密码）时携带 `passToken`
3. 业务接口先调用 `consumePassToken(passToken)`，成功后再继续业务逻辑

关键语义：

- 一次性：同一个 `passToken` 只能消费一次，重复消费返回 `false`
- 有效期：由 `passTtlSeconds` 控制，超时后自动失效
- 可选签发：`issuePassToken=false` 时，`verify` 通过后不会返回 `passToken`
- 防重放：不要把“是否通过验证码”存在前端本地状态，应以后端消费结果为准

示例（第二步业务接口）：

```ts
const isCaptchaPassed: boolean =
  await this._sliderCaptchaService.consumePassToken(passToken);
if (!isCaptchaPassed) {
  throw new UnauthorizedException('captcha token invalid or expired');
}
// 再执行登录/注册等业务逻辑
```

---

## 前端接入建议

- `track` 的 `t` 建议使用相对起点时间（毫秒，递增）
- `finalSlideX` 与前端实际渲染坐标系保持一致
- 使用 `bindingKey` 绑定会话上下文（如 `sessionId`）
- 若使用 `passToken`，后续业务接口必须执行一次 `consumePassToken`

---

## 安全建议

- 生产环境不要把 `correctX` 暴露给客户端
- 配置 `bindingSecret`，避免明文绑定键直接存储
- `maxRetries` 建议不超过 2
- 对同 IP / 账号增加限流策略（模块外实现）
- 失败日志建议记录结构化摘要，不记录完整轨迹明文

---

## 路径与部署建议

- 推荐底图目录：`assets/slider-captcha/*.png`
- 推荐路径构建：`join(process.cwd(), ...)`
- 若运行 `dist`，请确保部署后仍能访问到底图与 `puzzle.svg`

---

## 常见问题（FAQ）

### 1. 启动时报“背景图路径不能为空”

- 检查 `forRoot({ backgroundImagePaths })` 是否传入且非空

### 2. 启动时报图片读取或解码错误

- 检查图片路径、文件权限、格式是否被 `sharp` 支持

### 3. 验证总是失败

- 检查 `finalSlideX` 是否和服务端坐标系一致
- 检查 `track.t` 是否递增
- 若使用 `bindingKey`，确认 generate/verify 传入同一值

### 4. passToken 立即失效

- 检查是否被重复消费
- 检查 `passTtlSeconds` 是否过短
- 检查是否在验证码接口中提前调用了 `consumePassToken`

---

## 许可与资源

- 模块内部拼图蒙版 `assets/puzzle.svg` 来自开源图标资源（MIT 风格许可）
- 如替换为其他图标，请确认许可证兼容项目分发方式
