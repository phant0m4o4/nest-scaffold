# I18nModule

封装 [nestjs-i18n](https://nestjs-i18n.com/)，提供开箱即用的国际化与校验消息翻译能力。

## 功能特性

- 全局 `I18nService` 注入，支持在任意服务/控制器中进行翻译
- 多语言解析器：Query 参数 `?lang=`、`Accept-Language` 请求头、`x-lang` 自定义请求头
- 全局 `I18nValidationPipe`：DTO 校验消息自动走 i18n 翻译
- 全局 `I18nValidationExceptionFilter`：校验失败统一返回 HTTP 422 结构化错误
- 开发环境自动 watch 翻译文件变更（热更新）
- 完整的 TypeScript 类型安全（翻译键自动补全）

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

> **全局性说明**：`NestI18nModule.forRootAsync()` 内部已标记 `@Global()`，因此 `I18nService` 在整个应用中全局可用，业务模块无需重复导入 `I18nModule`。`APP_PIPE` / `APP_FILTER` 通过 NestJS 全局 token 注册，天然对所有路由生效。

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

### 4. DTO 校验消息国际化

在 DTO 装饰器上使用 `i18nValidationMessage` 绑定翻译键：

```typescript
import { IsEmail, MinLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

class CreateUserRequestDto {
  @IsEmail({}, { message: i18nValidationMessage('validation.isEmail') })
  email!: string;

  @MinLength(6, {
    message: i18nValidationMessage('validation.minLength'),
  })
  password!: string;
}
```

对应翻译文件 `validation.json`：

```json
// en/validation.json
{
  "isEmail": "Invalid email address",
  "minLength": "At least {constraints.0} characters"
}

// zh-CN/validation.json
{
  "isEmail": "邮箱格式不正确",
  "minLength": "至少 {constraints.0} 位字符"
}
```

### 5. 校验错误响应格式

模块已全局注册 `I18nValidationExceptionFilter`，校验失败时统一返回 HTTP 422：

```json
{
  "statusCode": 422,
  "message": "Validation Failed",
  "errors": {
    "email": { "rule": "isEmail", "message": "邮箱格式不正确" },
    "password": { "rule": "minLength", "message": "至少 6 位字符" }
  }
}
```

支持嵌套对象与数组的深层校验错误格式化：

```json
{
  "statusCode": 422,
  "message": "Validation Failed",
  "errors": {
    "school": {
      "students": [
        { "name": { "rule": "isNotEmpty", "message": "学生姓名不能为空" } }
      ]
    }
  }
}
```

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
│  ┌─────────────────────────────────────────────────────┐ │
│  │              Global Providers                        │ │
│  │  ┌────────────────────┐  ┌────────────────────────┐ │ │
│  │  │ I18nValidationPipe │  │ I18nValidationException│ │ │
│  │  │  (APP_PIPE)        │  │ Filter (APP_FILTER)    │ │ │
│  │  └────────────────────┘  └─────────┬──────────────┘ │ │
│  │                                    │                 │ │
│  │                          ┌─────────▼──────────────┐  │ │
│  │                          │ formatValidationErrors │  │ │
│  │                          └────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  exports: [NestI18nModule]                               │
└──────────────────────────────────────────────────────────┘
```

## 测试

```bash
# 单元测试 - formatValidationErrors
pnpm test src/common/modules/i18n/__tests__/format-validation-errors.spec.ts

# E2E 测试 - 翻译功能
pnpm test:e2e src/common/modules/i18n/__tests__/i18n-translate.e2e-spec.ts

# E2E 测试 - 校验错误国际化
pnpm test:e2e src/common/modules/i18n/__tests__/i18n-validation.e2e-spec.ts
```
