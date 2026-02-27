import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request
} from '@nestjs/common';
import { UserService } from './user.service';
import {
  ApiBearerAuth,
  ApiInternalServerErrorResponse,
  ApiOperation,
  ApiParam
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guards';
import { ApiSuccessResponse } from 'src/common/response/api-success-response.decorator';
import { UserSuccessDataDto } from './dto/user.dto';
import { BasicError } from 'src/common/error';
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
  async getMe(@Request() req: ExRequest) {
    console.log(req.user);
  }
}
