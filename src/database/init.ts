import { DatabaseService } from '@/common/modules/database/database.service';
import { IInitInitializer } from '@/common/modules/database/interfaces/init-initializer.interface';
import { Injectable } from '@nestjs/common';
import inquirer from 'inquirer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { DemoTypeEnum } from './enums/demo-type.enum';
import { demosSchema } from './schemas';
import Sleep from '@/common/utils/sleep';
/**
 * 数据库初始化服务
 * 实现 IInitInitializer，用于执行初始化过程
 */
@Injectable()
export class InitService implements IInitInitializer {
  constructor(
    private readonly databaseService: DatabaseService,
    @InjectPinoLogger(InitService.name) private readonly logger: PinoLogger,
  ) {}
  async run() {
    // 等待2秒，让日志输出完成
    await Sleep(2000);
    const answer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continue',
        message: '即将初始化数据库, 是否继续?',
        default: false,
      },
    ]);
    if (!answer.continue) {
      this.logger.info('初始化数据库已取消');
      return;
    }
    this.logger.info('========== 初始化数据库 ==========');

    // 1. 添加demos0数据
    const demos0 = {
      name: 'demos0',
      parentId: null,
      type: DemoTypeEnum.TYPE_1,
    };
    await this.databaseService.db.insert(demosSchema).values(demos0);
    this.logger.info('添加demos0数据完成');

    this.logger.info('========== 初始化完成 ==========');
  }
}
