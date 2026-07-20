# I18nModule

封装 [nestjs-i18n](https://nestjs-i18n.com/)，提供开箱即用的国际化翻译能力。

## 功能特性

- 全局 `I18nService` 注入，支持在任意服务/控制器中进行翻译
- 多语言解析器：Query 参数 `?lang=`、`Accept-Language` 请求头、`x-lang` 自定义请求头
- 开发环境自动 watch 翻译文件变更（热更新）
- 完整的 TypeScript 类型安全（翻译键自动补全）

> **注意**：DTO 校验已迁移至 zod（全局 `I18nZodValidationPipe`，见 `AppModule` 与 `src/app/pipes/i18n-zod-validation.pipe.ts`）。本模块不再提供 `I18nValidationPipe` / `I18nValidationExceptionFilter`，只负责业务文案翻译。校验错误消息仍按请求语言本地化：`I18nZodValidationPipe` 读取 `I18nContext` 解析出的语言（Query `?lang=` / Accept-Language / x-lang），选用 zod 官方 locale 渲染（中文 `zhCN`，默认英文）；schema 中显式书写的自定义消息优先。

## 依赖

| 包 | 用途 |
| --- | --- |
| `nestjs-i18n` | NestJS 国际化核心库 |
| `@nestjs/config` | 配置管理 |

## 环境变量

在 `.env` 中配置（均可选，有默认值）：

```env
# 回退语言，默认 en
I18N_FALLBACK_LANGUAGE=en
```

> **注意**：翻译文件路径固定为 `src/i18n`，不可通过环境变量修改，因为 `nest-cli.json` 的 `assets` 规则与此路径绑定，修改路径会导致编译时翻译文件无法被正确复制到产物目录。

## 快速开始

### 1. 在 AppModule 中导入

只需在 `AppModule` 中导入一次，全局生效：

```typescript
import { I18nModule } from '@/common/modules/i18n/i18n.module';

@Module({
  imports: [I18nModule],
})
export class AppModule {}
```

> **全局性说明**：`NestI18nModule.forRootAsync()` 内部已标记 `@Global()`，因此 `I18nService` 在整个应用中全局可用，业务模块无需重复导入 `I18nModule`。

### 2. 翻译文件结构

```
src/i18n/
├── en/
│   ├── common.json
│   ├── validation.json
│   └── error.json
└── zh-CN/
    ├── common.json
    ├── validation.json
    └── error.json
```

每个语言目录下的 JSON 文件即为一个命名空间，通过 `namespace.key` 访问翻译值。

### 3. 在控制器中使用翻译

```typescript
import { Controller, Get } from '@nestjs/common';
import { I18nContext, I18nService } from 'nestjs-i18n';

@Controller()
export class HelloController {
  constructor(private readonly _i18n: I18nService) {}

  @Get('/hello')
  hello() {
    const lang = I18nContext.current()?.lang ?? 'zh-CN';
    const text = this._i18n.t('common.hello', {
      lang,
      args: { name: 'Alice' },
    });
    return { data: { text } };
  }
}
```

### 4. DTO 校验（已迁移至 zod）

DTO 校验不再由本模块处理：请求 DTO 统一用 `createZodDto`（zod，项目内工厂，见 `@/common/utils/zod/create-zod-dto`）定义，由 `AppModule` 全局注册的 `I18nZodValidationPipe`（`APP_PIPE`）自动校验，校验失败抛出的 `ZodValidationException`（`src/app/exceptions/`）自带统一的 HTTP 422 响应体：

```json
{
  "statusCode": 422,
  "message": "Validation Failed",
  "errors": [
    { "field": "email", "message": "Invalid email address" },
    { "field": "password", "message": "Too small: expected string to have >=6 characters" }
  ]
}
```

本模块只负责业务文案翻译（`I18nService.t()`），不参与校验流程。

## 类型安全

模块提供 `types/nestjs-i18n.d.ts` 类型声明文件，扩展 `I18nService` 和 `I18nContext` 的泛型参数。配置后可获得翻译键自动补全：

```typescript
type I18nTranslations = {
  common: typeof import('@/i18n/en/common.json');
  validation: typeof import('@/i18n/en/validation.json');
  error: typeof import('@/i18n/en/error.json');
};
```

需在 `tsconfig.json` 中开启 `resolveJsonModule`：

```json
{
  "compilerOptions": {
    "resolveJsonModule": true
  }
}
```

## 语言解析优先级

请求语言按以下顺序解析（先匹配先生效）：

1. Query 参数：`?lang=zh-CN`
2. `Accept-Language` 请求头
3. `x-lang` 自定义请求头
4. 回退到 `I18N_FALLBACK_LANGUAGE` 配置

## 架构设计

```
┌──────────────────────────────────────────────────────────┐
│                       I18nModule                         │
│                                                          │
│  ┌────────────────────┐   ┌───────────────────────────┐  │
│  │   ConfigModule     │   │     NestI18nModule         │  │
│  │  (i18n.config.ts)  │──▶│  .forRootAsync()           │  │
│  └────────────────────┘   │                             │  │
│                           │  ┌───────────────────────┐  │  │
│                           │  │ Language Resolvers     │  │  │
│                           │  │  - QueryResolver      │  │  │
│                           │  │  - AcceptLanguage      │  │  │
│                           │  │  - HeaderResolver      │  │  │
│                           │  └───────────────────────┘  │  │
│                           └───────────────────────────┘  │
│                                                          │
│  exports: [NestI18nModule]                               │
└──────────────────────────────────────────────────────────┘
```

> DTO 校验的全局 Pipe 不在本模块内：`I18nZodValidationPipe`（`APP_PIPE`）由 `AppModule` 注册；校验失败抛出的 `ZodValidationException` 自带 422 响应体，无需异常过滤器。
