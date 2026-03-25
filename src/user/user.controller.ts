import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { UserService } from './user.service';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guards';
import { Request as ExRequest } from 'express';

@Controller('user')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // @Get('/:userId')
  // @ApiOperation({
  //   summary: '유저정보조회'
  // })
  // @ApiParam({
  //   name: 'userId',
  //   description: '유저아이디'
  // })
  // @ApiSuccessResponse(UserSuccessDataDto, 200, '유저 정보 조회')
  // @ApiInternalServerErrorResponse({ type: BasicError })
  // async getUserInfo(@Request() req, @Param('userId') userId: string) {
  //   console.log(req.user);
  //   return await this.userService.findUserInfo(userId);
  // }

  @Get('/me')
  @ApiOperation({
    summary: '내 정보 조회',
    deprecated: true // 이 옵션 추가
  })
  async getMe(@Request() req: ExRequest) {
    console.log(req.user);
  }
}
