-- 基础数据迁移示例：默认/初始数据与表结构同样用 migration 维护
-- （生成方式：pnpm db:generate:pgsql --custom --name=<name>）
INSERT INTO "demos" ("name", "parentId", "type") VALUES ('demos0', NULL, 'TYPE_1');
