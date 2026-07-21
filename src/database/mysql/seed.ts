import { unique } from '@/common/modules/database/common/utils/unique';
import { DatabaseService } from '@/common/modules/database/mysql/database.service';
import { ISeeder } from '@/common/modules/database/interfaces/seeder.interface';
import { Injectable } from '@nestjs/common';
import inquirer from 'inquirer';
import { demoTypes } from '../enums/demo-type.enum';
import { demosSchema } from './schemas';
import { fakerZH_CN as faker } from '@faker-js/faker';
/**
 * 数据库种子数据服务
 * 实现 ISeeder，用于执行数据填充
 */
@Injectable()
export class SeedService implements ISeeder {
  constructor(private readonly databaseService: DatabaseService) {}
  async run() {
    const answer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continue',
        message: '即将填充 Seed 数据, 是否继续?',
        default: false,
      },
    ]);
    if (!answer.continue) {
      console.log('填充 Seed 数据已取消');
      return;
    }
    console.log('========== 填充 Seed 数据 ==========');
    // 固定随机种子：同一批 seed 数据可复现，便于调试与测试对齐
    faker.seed(42);

    // 1. 批量添加demo数据
    const demos: (typeof demosSchema.$inferInsert)[] = [];
    for (let i = 0; i < 100; i++) {
      const name: string = await unique(() => faker.person.fullName(), 'demos');
      const type = faker.helpers.arrayElement(demoTypes);
      demos.push({
        name,
        // 依赖基础数据迁移(drizzle/mysql/0001_base-data.sql)插入的 demos0 行(id=1)
        parentId: 1,
        type,
      });
    }
    await this.databaseService.db.insert(demosSchema).values(demos);

    console.log('========== 填充 Seed 数据完成 ==========');
  }
}
