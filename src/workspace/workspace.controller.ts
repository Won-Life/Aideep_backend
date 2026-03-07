import {
  Body,
  Controller,
  MessageEvent,
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
  subscribe(@Query('roomId') roomId: string): Observable<MessageEvent> {
    console.log(`[SSE] 구독 시작 - roomId: "${roomId}"`);
    return this.sseService.getStream(roomId);
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
    return await this.workspaceService.creteWorkspace(userId, body);
  }

  //TODO: workspace 참여 방식에 대해 추후 논의 할것

  // @Post('/join')
  // @ApiOperation({
  //   summary : "workspace에 참여"
  // })
  // async joinWorkspace(@Request() req: any, @Body() body: JoinWorkspaceBody) {
  //   const userId = req.user?.user_id;
  //   return await this.workspaceService.joinWorkspace(userId);
  // }

  /**
   * 노드 이동 수신 엔드포인트
   * DB 업데이트 후 같은 room의 모든 SSE 구독자에게 브로드캐스트
   */
  @Patch('node-move')
  async moveNode(@Req() req: any) {
    // await this.prisma.nodes.update({
    //   where: { node_id: dto.nodeId },
    //   data: { position_x: dto.x, position_y: dto.y }
    // });

    this.sseService.emit({
      type: 'NODE_CREATE',
      nodeId: 'test,',
      workspaceId: 'test',
      userId: 'test'
    } as NodeCreateEvent);

    return { success: true };
  }
}
