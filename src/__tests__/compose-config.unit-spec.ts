import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('本地 Compose 安全边界', () => {
  it('所有已发布的数据库、存储和管理界面端口都应只绑定宿主机回环地址', async () => {
    // 只读取模板文本，不执行 Compose，也不加载或插值任何 .env。
    const source = await readFile(resolve('docker-compose.yml'), 'utf8');
    const ports = [...source.matchAll(/^ {4}ports:\n((?: {6}- .+\n)+)/gm)]
      .flatMap((match) => match[1].trim().split('\n'))
      .map((line) => line.trim().replace(/^- ['"]?|['"]$/g, ''));

    expect(ports).toHaveLength(7);
    for (const port of ports) {
      expect(port).toMatch(/^127\.0\.0\.1:/);
    }
    expect(ports).toEqual(
      expect.arrayContaining([
        '127.0.0.1:${MYSQL_PORT:-3306}:3306',
        '127.0.0.1:${PGSQL_PORT:-5432}:5432',
        '127.0.0.1:${REDIS_PORT:-6379}:6379',
        '127.0.0.1:8333:8333',
        '127.0.0.1:8080:80',
        '127.0.0.1:8081:80',
        '127.0.0.1:8082:80',
      ]),
    );
  });
});
