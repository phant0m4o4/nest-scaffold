import { EnvironmentEnum } from '@/common/enums/environment.enum';
import { afterEach, describe, expect, it, vi } from 'vitest';

import appConfig, { getProductionCorsSecurityWarnings } from '../app.config';

/** 每个用例只声明自己关心的变量，其余由本函数补齐必填项 */
function stubEnvironment(overrides: Record<string, string | undefined>): void {
  vi.stubEnv('NODE_ENV', EnvironmentEnum.DEVELOPMENT);
  vi.stubEnv('APP_NAME', 'nest-scaffold');
  for (const [key, value] of Object.entries(overrides)) {
    vi.stubEnv(key, value);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('appConfig', () => {
  describe('trustProxy', () => {
    it('未设置时应为 false（默认不信任代理头，req.ip 取 TCP 对端地址）', () => {
      stubEnvironment({ APP_TRUST_PROXY: undefined });

      expect(appConfig().trustProxy).toBe(false);
    });

    it('空串与 false 应为 false', () => {
      stubEnvironment({ APP_TRUST_PROXY: '' });
      expect(appConfig().trustProxy).toBe(false);

      stubEnvironment({ APP_TRUST_PROXY: 'FALSE' });
      expect(appConfig().trustProxy).toBe(false);
    });

    it('true 应为布尔 true（大小写不敏感）', () => {
      stubEnvironment({ APP_TRUST_PROXY: 'True' });

      expect(appConfig().trustProxy).toBe(true);
    });

    it('非负整数应解析为代理层数（数字而非字符串）', () => {
      stubEnvironment({ APP_TRUST_PROXY: '2' });

      expect(appConfig().trustProxy).toBe(2);
    });

    it('其他字符串应原样透传给 Express（如 loopback、CIDR 列表）', () => {
      stubEnvironment({ APP_TRUST_PROXY: 'loopback' });
      expect(appConfig().trustProxy).toBe('loopback');

      stubEnvironment({ APP_TRUST_PROXY: '10.0.0.0/8,192.168.0.0/16' });
      expect(appConfig().trustProxy).toBe('10.0.0.0/8,192.168.0.0/16');
    });

    it('负数不应被当作层数，应原样透传（由 Express 启动时报错）', () => {
      stubEnvironment({ APP_TRUST_PROXY: '-1' });

      expect(appConfig().trustProxy).toBe('-1');
    });
  });

  describe('corsDomains', () => {
    it('未设置时应为空数组（非生产环境即允许任意来源）', () => {
      stubEnvironment({ APP_CORS_DOMAINS: undefined });

      expect(appConfig().corsDomains).toEqual([]);
    });

    it('应按逗号分隔并去除空白与空项', () => {
      stubEnvironment({
        APP_CORS_DOMAINS: ' https://a.example.com , ,https://b.example.com ',
      });

      expect(appConfig().corsDomains).toEqual([
        'https://a.example.com',
        'https://b.example.com',
      ]);
    });
  });

  describe('corsCredentials', () => {
    it('未设置时应为 true（本项目使用 Cookie Session）', () => {
      stubEnvironment({ APP_CORS_CREDENTIALS: undefined });

      expect(appConfig().corsCredentials).toBe(true);
    });

    it('空串与空白应视为未设置并回落 true（`${MISSING}` 展开为空串时）', () => {
      stubEnvironment({ APP_CORS_CREDENTIALS: '' });
      expect(appConfig().corsCredentials).toBe(true);

      stubEnvironment({ APP_CORS_CREDENTIALS: '   ' });
      expect(appConfig().corsCredentials).toBe(true);
    });

    it('显式设为 false 时应为 false', () => {
      stubEnvironment({ APP_CORS_CREDENTIALS: 'false' });

      expect(appConfig().corsCredentials).toBe(false);
    });

    it('非法值应校验失败', () => {
      stubEnvironment({ APP_CORS_CREDENTIALS: 'maybe' });

      expect(() => appConfig()).toThrow(/APP_CORS_CREDENTIALS/);
    });
  });

  describe('getProductionCorsSecurityWarnings', () => {
    it('非生产环境即使留空白名单也不告警', () => {
      const actual = getProductionCorsSecurityWarnings({
        isProduction: false,
        corsDomains: [],
        corsCredentials: true,
      });

      expect(actual).toEqual([]);
    });

    it('生产环境未配置白名单且允许凭证时应告警，并写明 credentials=true', () => {
      const actual = getProductionCorsSecurityWarnings({
        isProduction: true,
        corsDomains: [],
        corsCredentials: true,
      });

      expect(actual).toHaveLength(1);
      expect(actual[0]).toMatch(/APP_CORS_DOMAINS/);
      expect(actual[0]).toMatch(/APP_CORS_CREDENTIALS=true/);
      expect(actual[0]).toMatch(/API Gateway/);
    });

    it('生产环境未配置白名单但关闭凭证时仍告警，且不得误称允许携带 Cookie', () => {
      const actual = getProductionCorsSecurityWarnings({
        isProduction: true,
        corsDomains: [],
        corsCredentials: false,
      });

      expect(actual).toHaveLength(1);
      expect(actual[0]).toMatch(/APP_CORS_CREDENTIALS=false/);
      expect(actual[0]).not.toMatch(/允许携带 Cookie/);
    });

    it('生产环境白名单仅为空白解析结果时应告警', () => {
      stubEnvironment({ APP_CORS_DOMAINS: ' , , ' });
      const config = appConfig();

      const actual = getProductionCorsSecurityWarnings({
        isProduction: true,
        corsDomains: config.corsDomains,
        corsCredentials: config.corsCredentials,
      });

      expect(actual).toHaveLength(1);
      expect(actual[0]).toMatch(/APP_CORS_DOMAINS/);
    });

    it('生产环境 `*` + credentials=true 时应告警', () => {
      const actual = getProductionCorsSecurityWarnings({
        isProduction: true,
        corsDomains: ['*'],
        corsCredentials: true,
      });

      expect(actual).toHaveLength(1);
      expect(actual[0]).toMatch(/APP_CORS_CREDENTIALS=false/);
    });

    it('生产环境白名单混入 `*` 且携带凭证时应告警', () => {
      const actual = getProductionCorsSecurityWarnings({
        isProduction: true,
        corsDomains: ['https://a.example.com', '*'],
        corsCredentials: true,
      });

      expect(actual).toHaveLength(1);
    });

    it('生产环境 `*` 但关闭凭证时不应告警', () => {
      const actual = getProductionCorsSecurityWarnings({
        isProduction: true,
        corsDomains: ['*'],
        corsCredentials: false,
      });

      expect(actual).toEqual([]);
    });

    it('生产环境配置了具体白名单时不应告警', () => {
      const actual = getProductionCorsSecurityWarnings({
        isProduction: true,
        corsDomains: ['https://a.example.com'],
        corsCredentials: true,
      });

      expect(actual).toEqual([]);
    });

    it('生产环境宽松 CORS 仍允许启动（配置校验不 fail-fast）', () => {
      stubEnvironment({
        NODE_ENV: EnvironmentEnum.PRODUCTION,
        APP_CORS_DOMAINS: undefined,
      });

      expect(() => appConfig()).not.toThrow();
      expect(appConfig().corsDomains).toEqual([]);
    });
  });

  describe('port', () => {
    it('未设置时应回落到默认端口', () => {
      stubEnvironment({ APP_PORT: undefined });

      expect(appConfig().port).toBe(3000);
    });

    it('空串应视为未设置而非 0（`${...}` 引用缺失锚点时会展开成空串）', () => {
      stubEnvironment({ APP_PORT: '' });

      expect(appConfig().port).toBe(3000);
    });

    it('0 与负数应校验失败（端口最小为 1）', () => {
      stubEnvironment({ APP_PORT: '0' });
      expect(() => appConfig()).toThrow(/APP_PORT/);

      stubEnvironment({ APP_PORT: '-1' });
      expect(() => appConfig()).toThrow(/APP_PORT/);
    });
  });

  describe('baseUrl', () => {
    it('未设置时应由 address 与 port 拼出', () => {
      stubEnvironment({
        APP_ADDRESS: '127.0.0.1',
        APP_PORT: '4000',
        APP_BASE_URL: undefined,
      });

      expect(appConfig().baseUrl).toBe('http://127.0.0.1:4000');
    });

    it('显式设置时应优先使用', () => {
      stubEnvironment({ APP_BASE_URL: 'https://api.example.com' });

      expect(appConfig().baseUrl).toBe('https://api.example.com');
    });
  });
});
