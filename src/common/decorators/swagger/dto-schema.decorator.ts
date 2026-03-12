/**
 * DtoSchema 装饰器
 * @param name - DTO 类的名称
 * @returns DTO 类的包装类
 * @example
 * @DtoSchema({ name: 'app.api.demo.dtos.create-demo-request.dto' })
 * export class CreateDemoRequestDto {
 *   @ApiProperty({ description: 'Demo Name' })
 *   name: string;
 *   @ApiProperty({ description: 'Demo Description' })
 *   description: string;
 *   @ApiProperty({ description: 'Demo Status' })
 *   status: string;
 *   @ApiProperty({ description: 'Demo Created At' })
 *   createdAt: Date;
 *   @ApiProperty({ description: 'Demo Updated At' })
 *   updatedAt: Date;
 * }
 */
export const DtoSchema = ({ name }: { name: string }) => {
  return <T extends new (...args: any[]) => any>(constructor: T) => {
    const wrapper = class extends constructor {};
    Object.defineProperty(wrapper, 'name', {
      value: name,
      writable: false,
    });
    return wrapper;
  };
};
