import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { UserService } from './user.service';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { ApiSuccessResponse } from 'src/common/response/api-success-response.decorator';
import { UserInfoDto } from './dto/user.dto';

@Controller('user')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('/me')
  @ApiOperation({
    summary: '내 정보 조회'
  })
  @ApiSuccessResponse(UserInfoDto)
  async getMe(@Request() req: any) {
    const userId = req.user.user_id;
    return await this.userService.findUserInfo(userId);
  }
}
