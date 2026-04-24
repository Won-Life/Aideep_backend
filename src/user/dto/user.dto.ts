import { ApiProperty } from '@nestjs/swagger';

export class UserSuccessDataDto {
  @ApiProperty({
    example: 'seoki'
  })
  name: string;
}

export class UserInfoDto {
  @ApiProperty({ example: '188d705b-f07a-409a-9df6-4844d09f9260' })
  userId: string;
  @ApiProperty({ example: 'test' })
  username: string;
  @ApiProperty({ example: 'test@naver.com' })
  email: string;
  @ApiProperty({ example: new Date() })
  createdAt: Date;
}
