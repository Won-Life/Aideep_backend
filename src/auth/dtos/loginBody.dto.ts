import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsUUID } from 'class-validator';

export class LoginBody {
  @IsEmail()
  @ApiProperty({
    default: 'seoki180@naver.com'
  })
  email: string;

  @IsString()
  @ApiProperty({
    default: '1234'
  })
  password: string;
}

export class IssueMasterBody {
  @IsUUID()
  @ApiProperty({
    default: '35f86ed0-c7ef-11eb-bf10-b42e99073dab'
  })
  userId: string;
}
