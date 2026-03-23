import {
  Body,
  Controller,
  Get,
  MessageEvent,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Request,
  Sse,
  UseGuards
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guards';
import { SkipTransform } from 'src/common/response/skip-transform.decorator';
import { SseService } from '../sse/sse.service';
import { NodeCreateEvent, NodeMoveEvent } from 'src/sse/sse.event';
import { ApiBearerAuth, ApiBody, ApiOperation } from '@nestjs/swagger';
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
import { UserWokrpaceInfoDto, WorkspaceInfoDto } from './dto/workspaceInfo.dto';

@Controller('workspace')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class WorkspaceController {
  constructor(
    private readonly sseService: SseService,
    private readonly workspaceService: WorkspaceService
  ) {}

  /**
   * SSE 구독 엔드포인트
   */
  @Sse('/stream')
  @SkipTransform()
  @ApiOperation({
    summary: 'SSE 통신 연결 엔드포인트',
    description:
      'SSE 통신을 위해 처음 연결합니다, 리턴되는 값은 없으며 POSTMAN 등에서 SSE 연결을 유지하여 구독상태를 확인합니다. '
  })
  subscribe(
    @Query('workspaceId') workspaceId: string
  ): Observable<MessageEvent> {
    return this.sseService.getStream(workspaceId);
  }

  @Get('/')
  @ApiOperation({
    summary: '워크스페이스 리스트'
  })
  @ApiSuccessResponse(UserWokrpaceInfoDto, 200)
  async workspaceList(@Request() req: any): Promise<UserWokrpaceInfoDto[]> {
    const userId = req.user?.user_id;
    return await this.workspaceService.userWorkspaceInfo(userId);
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
}
