import { Expose } from 'class-transformer';

export class OnlyIdEntity {
  /**
   * 主键
   */
  @Expose()
  id: number;
}
