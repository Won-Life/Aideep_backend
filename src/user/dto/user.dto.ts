import { ApiProperty } from '@nestjs/swagger';

export class UserSuccessDataDto {
  @ApiProperty({
    example: 'seoki',
  })
  name: string;
}
