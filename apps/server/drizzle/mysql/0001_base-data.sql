-- 基础数据迁移示例：默认/初始数据与表结构同样用 migration 维护
-- （生成方式：pnpm db:generate:mysql --custom --name=base-data）
INSERT INTO `demos` (`publicId`, `shortPublicId`, `name`, `parentId`, `type`)
VALUES ('demos0PublicId0000001', 'd0Short1', 'demos0', NULL, 'TYPE_1');
