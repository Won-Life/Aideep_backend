import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';

export class OAuthSignupCompleteBody {
  @ApiProperty({ description: 'Redis에서 발급된 signup ticket' })
  @IsString()
  ticket: string;

  @ApiProperty({ description: '사용할 사용자 이름 (2~100자)' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  username: string;

  @ApiProperty({ description: '약관 동의 여부 (반드시 true)', example: true })
  @Equals(true, { message: '약관 동의가 필요합니다.' })
  @IsBoolean()
  agreedToTerms: boolean;
}
