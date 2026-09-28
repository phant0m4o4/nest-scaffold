import { ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import pino from 'pino';
import pinoHttp, { type Options } from 'pino-http';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LoggerModule } from '../logger.module';

async function createMemoryLogger(environment: string, http = false) {
  vi.stubEnv('NODE_ENV', environment);
  const factorySpy = vi.spyOn(PinoLoggerModule, 'forRootAsync');
  LoggerModule.forRoot();
  const parameters = await factorySpy.mock.calls[0][0].useFactory(
    new ConfigService({ log: { logFileEnable: false, logFileDir: 'unused' } }),
  );
  const { transport, ...options } = parameters.pinoHttp as Options;
  expect(transport).toBeDefined();
  // 使用真实 Pino，只把输出 transport 替换为内存，不启动文件或服务。
  const lines: string[] = [];
  const stream = { write: (line: string) => lines.push(line) };
  return {
    logger: http ? pinoHttp(options, stream).logger : pino(options, stream),
    lines,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe.each(['development', 'test', 'production'])(
  '%s 日志安全边界',
  (environment) => {
    it.each(['error', 'err'])(
      '%s 应保留诊断字段而不输出命令、连接或任意附带字段',
      async (key) => {
        const { logger, lines } = await createMemoryLogger(environment);
        const cause = Object.assign(new Error('底层故障'), {
          code: 'CAUSE_CODE',
          token: 'unit-test-cause-secret',
        });
        const error = Object.assign(new Error('连接故障', { cause }), {
          code: 'ERR_TEST',
          command: { args: ['unit-test-command-secret'] },
          client: { password: 'unit-test-client-secret' },
          details: { token: 'unit-test-detail-secret' },
        });
        logger.error({ [key]: error }, '测试诊断');

        expect(JSON.parse(lines[0])).toMatchObject({
          [key]: {
            name: 'Error',
            message: '连接故障',
            stack: error.stack,
            code: 'ERR_TEST',
            cause: {
              message: '底层故障',
              code: 'CAUSE_CODE',
              stack: cause.stack,
            },
          },
        });
        expect(lines[0]).not.toContain('unit-test-');
      },
    );

    it('已知凭据字段应在写入任何 transport 前脱敏', async () => {
      const { logger, lines } = await createMemoryLogger(environment);
      logger.error(
        {
          req: {
            headers: {
              authorization: 'unit-test-auth-secret',
              cookie: 'unit-test-cookie-secret',
            },
          },
          res: {
            headersSent: true,
            statusCode: 200,
            getHeaders: () => ({ 'set-cookie': 'unit-test-response-secret' }),
          },
          password: 'unit-test-password-secret',
        },
        '测试脱敏',
      );
      expect(lines[0]).not.toContain('unit-test-');
      expect(JSON.parse(lines[0])).toMatchObject({
        req: {
          headers: { authorization: '[Redacted]', cookie: '[Redacted]' },
        },
        res: { headers: { 'set-cookie': '[Redacted]' } },
        password: '[Redacted]',
      });
    });

    it('HTTP 请求响应应保留标准投影与脱敏，不输出原始附带对象', async () => {
      const { logger, lines } = await createMemoryLogger(environment, true);
      const req = {
        id: 'test-request-id',
        method: 'POST',
        url: '/demo',
        headers: {
          authorization: 'unit-test-header-secret',
          cookie: 'unit-test-cookie-secret',
        },
        socket: { remoteAddress: '127.0.0.1', remotePort: 12345 },
        body: { password: 'unit-test-body-secret' },
        session: { token: 'unit-test-session-secret' },
      };
      const res = {
        headersSent: true,
        statusCode: 200,
        getHeaders: () => ({ 'set-cookie': 'unit-test-response-secret' }),
        locals: { token: 'unit-test-locals-secret' },
        req,
      };
      logger.error({ req, res }, '测试 HTTP 投影');

      expect(JSON.parse(lines[0])).toMatchObject({
        req: {
          id: 'test-request-id',
          method: 'POST',
          url: '/demo',
          headers: { authorization: '[Redacted]', cookie: '[Redacted]' },
          remoteAddress: '127.0.0.1',
          remotePort: 12345,
        },
        res: { statusCode: 200, headers: { 'set-cookie': '[Redacted]' } },
      });
      expect(lines[0]).not.toContain('unit-test-');
      expect(lines[0]).not.toContain('"raw"');
    });

    it('HTTP 日志包装也应保留安全原因链并终止循环', async () => {
      const { logger, lines } = await createMemoryLogger(environment, true);
      const error = Object.assign(new Error('循环错误'), {
        code: 'ERR_LOOP',
        token: 'unit-test-loop-secret',
      });
      error.cause = error;
      logger.error({ err: error }, '测试循环');

      expect(JSON.parse(lines[0])).toMatchObject({
        err: {
          name: 'Error',
          message: '循环错误',
          code: 'ERR_LOOP',
          cause: { message: '[循环原因]' },
        },
      });
      expect(lines[0]).not.toContain('unit-test-');
    });

    it('HTTP 错误 getter 抛错时日志仍应成功且不泄露异常内容', async () => {
      const { logger, lines } = await createMemoryLogger(environment, true);
      const error = {
        get message(): string {
          throw new Error('unit-test-http-getter-secret');
        },
      };
      expect(() =>
        logger.error({ err: error }, '测试 HTTP getter'),
      ).not.toThrow();
      expect(JSON.parse(lines[0])).toMatchObject({
        err: { message: '无法读取异常诊断信息' },
      });
      expect(lines[0]).not.toContain('unit-test-');
    });

    it('HTTP 日志应接受冻结的 Error 且不改写原始对象', async () => {
      const { logger, lines } = await createMemoryLogger(environment, true);
      const error = Object.freeze(new Error('冻结错误'));
      expect(() => logger.error({ err: error }, '测试冻结错误')).not.toThrow();
      expect(JSON.parse(lines[0])).toMatchObject({
        err: { name: 'Error', message: '冻结错误', stack: error.stack },
      });
      expect(Object.getOwnPropertySymbols(error)).toHaveLength(0);
    });

    it.each([false, true])(
      '非 Error 对象也应筛选字段且限制原因链深度（HTTP=%s）',
      async (http) => {
        const { logger, lines } = await createMemoryLogger(environment, http);
        const error = {
          message: '第一层',
          code: 500,
          token: 'unit-test-object-secret',
          cause: {
            message: '第二层',
            cause: { message: '第三层', cause: { message: '不应展开' } },
          },
        };
        logger.error({ err: error }, '测试对象');
        expect(JSON.parse(lines[0])).toMatchObject({
          err: {
            message: '第一层',
            code: 500,
            cause: {
              message: '第二层',
              cause: {
                message: '第三层',
                cause: { message: '[原因链已截断]' },
              },
            },
          },
        });
        expect(lines[0]).not.toContain('unit-test-');
        expect(lines[0]).not.toContain('不应展开');
      },
    );

    it('字符串异常应保留消息，异常 getter 不应让日志失败', async () => {
      const { logger, lines } = await createMemoryLogger(environment);
      logger.error({ error: '普通错误消息' }, '测试字符串');
      expect(JSON.parse(lines[0])).toMatchObject({
        error: { message: '普通错误消息' },
      });
      const error = {
        get message(): string {
          throw new Error('unit-test-getter-secret');
        },
      };
      expect(() => logger.error({ error }, '测试 getter')).not.toThrow();
      expect(JSON.parse(lines[1])).toMatchObject({
        error: { message: '无法读取异常诊断信息' },
      });
      expect(lines[1]).not.toContain('unit-test-');
    });
  },
);
