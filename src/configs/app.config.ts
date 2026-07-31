import { EnvironmentEnum } from '@/common/enums/environment.enum';
import { registerEnvAsConfig } from '@/common/utils/register-env-as-config';
import { optionalEnvInt } from '@/common/utils/zod/optional-env-int';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';

/**
 * 解析 `APP_CORS_DOMAINS` 为允许的来源列表
 *
 * 英文逗号分隔，自动去除空白项。留空返回空数组，表示「未配置」。
 */
function parseCorsDomains(rawValue?: string): string[] {
  return (rawValue ?? '')
    .split(',')
    .map((domain) => domain.trim())
    .filter((domain) => domain.length > 0);
}

/**
 * 解析 `APP_TRUST_PROXY` 为 Express `trust proxy` 可接受的值
 *
 * **默认 false，即不信任任何代理头。** 此时 `req.ip` 取 TCP 连接的对端地址，客户端伪造不了。
 * 一旦开启，Express 会改从 `X-Forwarded-For`（客户端可随意伪造的请求头）推断来源 IP，
 * 若应用并未真的部署在反向代理之后，任何人都能伪造该头绕过限流、IP 黑白名单与审计日志。
 * 所以只有确实位于 CDN / Nginx / 负载均衡（LB，流量分发器）之后时才应开启。
 *
 * 取值：
 * - 未设置 / `false`：不信任任何代理（默认，最安全）
 * - 数字（如 `1`、`2`）：信任的代理层数，从 `X-Forwarded-For` 最右侧倒数第 N 跳取真实 IP。
 *   **反代场景下的推荐值**，层数写死后伪造的前缀条目会被跳过
 * - `true`：信任全部代理，取 `X-Forwarded-For` 最左侧条目 —— 该条目仍可被客户端伪造，
 *   仅建议在代理会强制覆写该头的可信环境下使用
 * - 其他字符串：原样交给 Express，支持 `loopback`、`uniquelocal`
 *   或 IP / CIDR 列表如 `10.0.0.0/8,192.168.0.0/16`；非法值会在启动时抛错
 *
 * @see https://expressjs.com/en/guide/behind-proxies.html
 */
function parseTrustProxy(rawValue?: string): boolean | number | string {
  const value = rawValue?.trim() ?? '';
  if (value === '' || value.toLowerCase() === 'false') return false;
  if (value.toLowerCase() === 'true') return true;
  const hopCount = Number(value);
  return Number.isInteger(hopCount) && hopCount >= 0 ? hopCount : value;
}

/**
 * 生产环境下 CORS 宽松配置的告警文案（不阻断启动）
 *
 * 很多部署把 CORS 放在 CDN / Nginx / API Gateway 上管，应用层留空或放宽是常见做法，
 * 因此这里只返回 warning，不 fail-fast。若本服务直接对外且依赖 Cookie Session，
 * 仍应在 `APP_CORS_DOMAINS` 配具体白名单。
 *
 * @returns 需要打出的告警文案列表；安全时返回空数组
 */
export function getProductionCorsSecurityWarnings(params: {
  isProduction: boolean;
  corsDomains: readonly string[];
  corsCredentials: boolean;
}): string[] {
  if (!params.isProduction) return [];
  const warnings: string[] = [];
  if (params.corsDomains.length === 0) {
    const credentialsHint = params.corsCredentials
      ? '且 APP_CORS_CREDENTIALS=true（允许携带 Cookie）'
      : '（当前 APP_CORS_CREDENTIALS=false，不携带 Cookie，风险相对较低）';
    warnings.push(
      `生产环境未配置 APP_CORS_DOMAINS：应用层将反射任意 Origin${credentialsHint}。` +
        '若本服务直接对外，请配置白名单；若 CORS 已由 CDN / Nginx / API Gateway 统一处理，可忽略本告警',
    );
    return warnings;
  }
  if (params.corsDomains.includes('*') && params.corsCredentials) {
    warnings.push(
      '生产环境 APP_CORS_DOMAINS 含 `*` 且 APP_CORS_CREDENTIALS=true：任意来源可携带 Cookie 读取响应。' +
        '请改为具体域名白名单，或确属公开只读接口时设置 APP_CORS_CREDENTIALS=false；' +
        '若 CORS 已由上游网关统一处理，可忽略本告警',
    );
  }
  return warnings;
}

/**
 * 应用基础配置
 *
 * .env 示例：
 * NODE_ENV=development
 * APP_NAME=sjhy_wallet_backend
 * APP_PORT=3000
 * APP_ADDRESS=127.0.0.1
 * APP_BASE_URL=http://127.0.0.1:3000
 * APP_CORS_DOMAINS=https://a.example.com,https://b.example.com
 * APP_CORS_CREDENTIALS=true
 * APP_TRUST_PROXY=false
 * APP_MASTER_KEY=...（64 位 hex；生成：openssl rand -hex 32）
 *
 * APP_MASTER_KEY 说明：
 * - AES-256-GCM 要求密钥正好 256 bit（32 字节）；本配置把 hex 解码后的 Buffer 直接当 key
 * - 不经口令 KDF（密钥派生），故 env 必须是 32 字节高熵材料（64 位 hex），而非任意短串
 * - 生成：openssl rand -hex 32（生产务必替换示例/占位值）
 *
 * CORS 说明：
 * - `APP_CORS_DOMAINS`：英文逗号分隔的允许来源白名单，精确匹配（协议 + 域名 + 端口需完全一致）
 * - `APP_CORS_CREDENTIALS`：是否允许跨域请求携带 Cookie，默认 true（本项目使用 Cookie Session）
 * - 留空或含 `*`：允许任意来源（反射请求 Origin）
 * - 生产环境若留空 / `*`+凭证，启动时仅打 warning，不阻断（常见于上游网关已管 CORS）
 */
const environmentSchema = z.object({
  NODE_ENV: z.enum(EnvironmentEnum),
  APP_NAME: z.string().min(1),
  APP_PORT: optionalEnvInt(1),
  APP_ADDRESS: z.string().min(1).optional(),
  APP_BASE_URL: z.string().min(1).optional(),
  APP_CORS_DOMAINS: z.string().optional(),
  // 空串/空白视为未设置：`${MISSING}` 展开为空串时不应让 z.stringbool() 校验失败
  APP_CORS_CREDENTIALS: z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.stringbool().optional(),
  ),
  APP_TRUST_PROXY: z.string().optional(),
  /**
   * 应用主密钥：64 位 hex = 32 字节，用于游标等 AES-256-GCM。
   * AES-256 固定要 32 字节 key；此处 hex 解码后直接使用，故必须正好 64 位高熵 hex。
   * 生成：openssl rand -hex 32
   */
  APP_MASTER_KEY: z
    .string()
    .regex(
      /^[0-9a-fA-F]{64}$/,
      'APP_MASTER_KEY 必须是 64 位十六进制（32 字节；生成：openssl rand -hex 32）',
    ),
});

const appConfig = registerEnvAsConfig('app', environmentSchema, (env) => {
  const port = env.APP_PORT ?? 3000;
  const address = env.APP_ADDRESS ?? '127.0.0.1';
  const baseUrl = env.APP_BASE_URL ?? `http://${address}:${port}`;
  return {
    name: env.APP_NAME,
    port,
    address,
    baseUrl,
    corsDomains: parseCorsDomains(env.APP_CORS_DOMAINS),
    // 默认 true：本项目使用 Cookie Session，跨域请求需要携带凭证
    corsCredentials: env.APP_CORS_CREDENTIALS ?? true,
    trustProxy: parseTrustProxy(env.APP_TRUST_PROXY),
    masterKey: Buffer.from(env.APP_MASTER_KEY, 'hex'),
  };
});
export type AppConfigType = ConfigType<typeof appConfig>;
export default appConfig;
