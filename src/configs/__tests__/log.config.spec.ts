import { afterEach, describe, expect, it, vi } from 'vitest';

import logConfig from '../log.config';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('logConfig', () => {
  it('启用文件日志时应要求配置日志目录', () => {
    vi.stubEnv('LOG_FILE_ENABLE', 'true');
    vi.stubEnv('LOG_FILE_DIR', undefined);
    vi.stubEnv('LOG_FILE_PATH', undefined);

    expect(() => logConfig()).toThrow(/LOG_FILE_DIR/);
  });

  it('应兼容旧 LOG_FILE_PATH 文件路径并取其父目录', () => {
    vi.stubEnv('LOG_FILE_ENABLE', 'true');
    vi.stubEnv('LOG_FILE_DIR', undefined);
    vi.stubEnv('LOG_FILE_PATH', './logs/app.log');

    expect(logConfig().logFileDir).toBe('./logs');
  });
});
