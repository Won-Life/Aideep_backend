import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNumber } from 'class-validator';

export class VerifyEmailRequestBody {
  @ApiProperty({ example: 'seoki180@naver.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123123' })
  @IsNumber()
  code: number;
}
