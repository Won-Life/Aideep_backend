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
import { NodeMoveDto } from './dto/node-move.dto';
import { SseService } from '../sse/sse.service';
import { NodeCreateEvent, NodeMoveEvent } from 'src/sse/sse.event';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { createWorkspaceBody } from './dto/createWorkspace.dto';
import { WorkspaceService } from './workspace.service';
import { JoinWorkspaceBody } from './dto/joinWorkspace.dto';
import { ApiSuccessResponse } from 'src/common/response/api-success-response.decorator';
import { WorkspaceInfoDto } from './dto/workspaceInfo.dto';

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
    description: 'SSE 통신을 위해 처음 연결합니다.'
  })
  subscribe(
    @Query('workspaceId') workspaceId: string
  ): Observable<MessageEvent> {
    console.log(`[SSE] 구독 시작 - roomId: "${workspaceId}"`);
    return this.sseService.getStream(workspaceId);
  }

  @Post('/')
  @ApiOperation({
    summary: '새로운 workspace 생성',
    description: '본인 소유의 workspace를 생성합니다'
  })
  async createWorkspace(
    @Body() body: createWorkspaceBody,
    @Request() req: any
  ) {
    const userId = req.user?.user_id;
    return await this.workspaceService.createWorkspace(userId, body);
  }

  @Post('/invite')
  @ApiOperation({
    summary: '해당 워크스페이스 초대 링크를 생성합니다.'
  })
  async inviteWorkspace(@Request() req: any, @Body() body: JoinWorkspaceBody) {
    const userId = req.user?.user_id;
    return await this.workspaceService.inviteWorkspace(body, userId);
  }

  @Post('/join/:workspaceId')
  @ApiOperation({
    summary: '워크스페이스 참가',
    description: '초대 코드를 사용하여 워크스페이스에 참가합니다.'
  })
  async joinWorkspace(
    @Request() req: any,
    @Param('workspaceId') workspaceId: string,
    @Body() body: { code: string }
  ) {
    const userId = req.user?.user_id;
    return await this.workspaceService.joinWorkspace(
      body.code,
      userId,
      workspaceId
    );
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
