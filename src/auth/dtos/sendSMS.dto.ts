import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsPhoneNumber } from 'class-validator';

export class SendMailRequestBody {
  @IsEmail()
  @ApiProperty({ example: 'seoki180@naver.com' })
  email: string;
}

export class SendSmsResponseDto {
  @ApiProperty({ example: 123123 })
  code: number;
}
