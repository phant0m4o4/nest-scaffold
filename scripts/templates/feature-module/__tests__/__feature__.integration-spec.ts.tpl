import { describe, it } from 'vitest';

// 安全占位：隔离准备完成前不导入 AppModule，也不创建任何真实连接。
// 参考 docs/development/testing.md 和 Demo 的 demo-cursor.integration-spec.ts：
// 1. 用 Testcontainers 创建临时依赖，显式注入本次实例的连接配置并准备表结构。
// 2. 只装配当前测试边界需要的模块，mock 外部服务，不加载本地 .env。
// 3. HTTP 请求仅指向本次测试应用；失败清理也只处理本次创建的资源。
// 完成上述准备后，用真实行为断言替换此失败用例，不改为 skip/todo 或空断言。
describe('__Feature__ 集成测试', () => {
  it('应先完成隔离配置，再验证 /__features__ 的真实行为', () => {
    throw new Error(
      '__Feature__ 集成测试尚未完成隔离配置：请使用临时依赖和测试凭据，禁止连接真实业务环境。',
    );
  });
});
