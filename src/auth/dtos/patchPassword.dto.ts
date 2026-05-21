import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class PatchPasswordBody {
  @ApiPropertyOptional({ description: '현재 비밀번호 (이미 비밀번호가 설정된 경우 필수)' })
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @ApiProperty({ description: '새 비밀번호 (최소 4자)' })
  @IsString()
  @MinLength(4)
  newPassword: string;
}
