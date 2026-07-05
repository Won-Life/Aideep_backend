import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery
} from '@nestjs/swagger';
import { ApiErrorResponse } from 'src/common/response/api-error-response.decorator';
import {
  CreateWorkspaceBody,
  CreateWorkspaceResponseDto
} from './dto/createWorkspace.dto';
import { WorkspaceService } from './workspace.service';
import {
  InviteWOrkspaceResponseDto,
  JoinWorkspaceBody
} from './dto/joinWorkspace.dto';
import { ApiSuccessResponse } from 'src/common/response/api-success-response.decorator';
import {
  UserWokrpaceInfoDto,
  WorkspaceInfoDto,
  WorkspaceMemberListDto
} from './dto/workspaceInfo.dto';
import {
  LeaveWorkspaceBody,
  LeaveWorkspaceResponseDto
} from './dto/leaveWorkspace.dto';
import { RenameWorkspaceBody } from './dto/renameWorkspace.dto';

@Controller('workspace')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get('/')
  @ApiOperation({
    summary: '워크스페이스 리스트'
  })
  @ApiSuccessResponse(UserWokrpaceInfoDto, 200)
  async workspaceList(@Request() req: any): Promise<UserWokrpaceInfoDto[]> {
    const userId = req.user?.user_id;
    return await this.workspaceService.userWorkspaceInfo(userId);
  }

  @Patch('/:workspaceId')
  @ApiOperation({
    summary: '워크스페이스 이름 변경',
    description: 'OWNER 유저가 워크스페이스의 title을 변경합니다.'
  })
  @ApiBody({ type: RenameWorkspaceBody })
  @ApiSuccessResponse(
    {
      type: 'string',
      example: '이름 변경 성공'
    },
    200
  )
  @ApiErrorResponse(404, '해당 유저의 워크스페이스가 존재하지 않습니다.')
  @ApiErrorResponse(403, 'OWNER만 워크스페이스 이름을 변경할 수 있습니다.')
  async renameWorkspace(
    @Request() req: any,
    @Param('workspaceId') workspaceId: string,
    @Body() body: RenameWorkspaceBody
  ) {
    const userId = req.user?.user_id;
    await this.workspaceService.renameWorkspace(userId, workspaceId, body);
    return '이름 변경 성공';
  }

  @Post('/')
  @ApiBody({
    type: CreateWorkspaceBody
  })
  @ApiOperation({
    summary: '새로운 workspace 생성',
    description: '본인 소유의 workspace를 생성합니다'
  })
  @ApiSuccessResponse(CreateWorkspaceResponseDto, 200)
  async createWorkspace(
    @Body() body: CreateWorkspaceBody,
    @Request() req: any
  ) {
    const userId = req.user?.user_id;
    return await this.workspaceService.createWorkspace(userId, body);
  }

  @Post('/invite')
  @ApiOperation({
    summary: '해당 워크스페이스 초대 링크를 생성합니다.'
  })
  @ApiSuccessResponse(InviteWOrkspaceResponseDto, 200)
  async inviteWorkspace(@Request() req: any, @Body() body: JoinWorkspaceBody) {
    const userId = req.user?.user_id;
    return await this.workspaceService.inviteWorkspace(body, userId);
  }

  @Delete('/leave')
  @ApiOperation({
    summary: '특정 워크스페이스를 떠납니다.',
    description:
      '현재 유저를 해당 워크스페이스에서 제거합니다. OWNER인 경우 다른 멤버가 남아 있으면 떠날 수 없으며, 마지막 OWNER가 떠나면 워크스페이스는 soft delete 됩니다.'
  })
  @ApiBody({ type: LeaveWorkspaceBody })
  @ApiSuccessResponse(LeaveWorkspaceResponseDto, 200)
  @ApiErrorResponse(404, '해당 유저의 워크스페이스가 존재하지 않습니다.')
  @ApiErrorResponse(
    400,
    'OWNER는 워크스페이스를 떠날 수 없습니다. 소유권을 이전하거나 워크스페이스를 삭제해주세요.'
  )
  async leaveWorkspace(@Request() req: any, @Body() body: LeaveWorkspaceBody) {
    const userId = req.user?.user_id;
    return await this.workspaceService.leaveWorkspace(body, userId);
  }

  @Post('/join/:workspaceId')
  @ApiOperation({
    summary: '워크스페이스 참가',
    description: '초대 코드를 사용하여 워크스페이스에 참가합니다.'
  })
  @ApiSuccessResponse(
    {
      type: 'string',
      example: '참가성공'
    },
    200
  )
  async joinWorkspace(
    @Request() req: any,
    @Param('workspaceId') workspaceId: string,
    @Body() body: { code: string }
  ) {
    const userId = req.user?.user_id;
    await this.workspaceService.joinWorkspace(body.code, userId, workspaceId);
    return '참가 성공';
  }

  @Delete('/:workspaceId')
  @ApiOperation({
    summary: '워크스페이스 삭제',
    description:
      'OWNER 유저가 워크스페이스를 soft-delete 합니다. 워크스페이스와 모든 멤버십 행이 함께 삭제됩니다.'
  })
  @ApiSuccessResponse(
    {
      type: 'string',
      example: '삭제 성공'
    },
    200
  )
  @ApiErrorResponse(404, '해당 유저의 워크스페이스가 존재하지 않습니다.')
  @ApiErrorResponse(
    403,
    'OWNER가 아닌 유저는 워크스페이스를 삭제할 수 없습니다.'
  )
  @ApiErrorResponse(400, '워크스페이스가 최소 한개는 남아있어야 합니다.')
  async deleteWorkspace(
    @Request() req: any,
    @Param('workspaceId') workspaceId: string
  ) {
    const userId = req.user.user_id;
    await this.workspaceService.deleteWorkspace(workspaceId, userId);
    return '삭제 성공';
  }

  @Get('sync')
  @ApiOperation({
    summary: 'workspace 화면 동기화',
    description:
      'workspace 첫 진입시 workspace의 모든 그래프 데이터를 받아 동기화 합니다.'
  })
  @ApiSuccessResponse(WorkspaceInfoDto, 200, '조회 성공')
  async syncWorkspace(
    @Query('workspaceId') workspaceId: string,
    @Request() req: any
  ) {
    const userId = req.user?.user_id;
    return await this.workspaceService.getWorkspaceInfo(userId, workspaceId);
  }

  @Get('members')
  @ApiOperation({
    summary: '워크스페이스 멤버 목록 조회',
    description:
      '해당 워크스페이스에 속한 멤버의 이름과 역할 목록을 반환합니다.'
  })
  @ApiQuery({ name: 'workspaceId', required: true })
  @ApiSuccessResponse(WorkspaceMemberListDto, 200, '조회 성공')
  @ApiErrorResponse(404, '해당 유저의 워크스페이스가 존재하지 않습니다.')
  async getWorkspaceMembers(
    @Query('workspaceId') workspaceId: string,
    @Request() req: any
  ): Promise<WorkspaceMemberListDto[]> {
    const userId = req.user?.user_id;
    return await this.workspaceService.getWorkspaceMemebers(
      userId,
      workspaceId
    );
  }
}
