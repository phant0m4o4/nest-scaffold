import { unique } from '../common/modules/database/common/utils/unique';
import { DatabaseService } from '@/common/modules/database/database.service';
import { ISeeder } from '@/common/modules/database/interfaces/seeder.interface';
import { Injectable } from '@nestjs/common';
import inquirer from 'inquirer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { demoTypes } from './enums/demo-type.enum';
import { demosSchema } from './schemas';
import { fakerZH_CN as faker } from '@faker-js/faker';
/**
 * 数据库种子数据服务
 * 实现 ISeeder，用于执行数据填充
 */
@Injectable()
export class SeedService implements ISeeder {
  constructor(
    private readonly databaseService: DatabaseService,
    @InjectPinoLogger(SeedService.name) private readonly logger: PinoLogger,
  ) {}
  async run() {
    this.logger.info('是否填充 Seed 数据?');
    // 是否填充假数据
    const answer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continue',
        message: '即将填充 Seed 数据, 是否继续?',
        default: false,
      },
    ]);
    if (!answer.continue) {
      this.logger.info('填充 Seed 数据已取消');
      return;
    }
    this.logger.info('========== 填充 Seed 数据 ==========');

    // 1. 批量添加demo数据
    const demos: (typeof demosSchema.$inferInsert)[] = [];
    for (let i = 0; i < 100; i++) {
      const name: string = await unique(() => faker.person.fullName(), 'demos');
      const type = faker.helpers.arrayElement(demoTypes);
      demos.push({
        name,
        parentId: 1,
        type,
      });
    }
    await this.databaseService.db.insert(demosSchema).values(demos);

    this.logger.info('========== 填充 Seed 数据完成 ==========');
  }
}
