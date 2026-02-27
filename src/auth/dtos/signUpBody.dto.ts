import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsPhoneNumber, IsString } from 'class-validator';

export class SignUpBody {
  @ApiProperty({
    default: 'seoki@naver.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    default: '1234',
  })
  @IsString()
  password: string;

  @ApiProperty({
    default: 'seoki',
  })
  @IsString()
  name: string;

  @ApiProperty({
    default: '01011111111',
  })
  @IsString()
  phone: string;
}
