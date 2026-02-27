import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class LoginBody {
  @IsEmail()
  @ApiProperty({
    default: 'seoki@naver.com',
  })
  email: string;

  @IsString()
  @ApiProperty({
    default: '1234',
  })
  password: string;
}
