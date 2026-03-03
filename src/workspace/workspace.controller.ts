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
import { NodeMoveEvent, SseService } from './sse.service';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { createWorkspaceBody } from './dto/createWorkspace.dto';
import { WorkspaceService } from './workspace.service';

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
   * 클라이언트: const es = new EventSource('/collaboration/sse?roomId=xxx');
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
  async createWorkspace(
    @Body() body: createWorkspaceBody,
    @Request() req: any
  ) {
    const userId = req.user?.user_id;
    return await this.workspaceService.creteWorkspace(userId, body);
  }

  /**
   * 노드 이동 수신 엔드포인트
   * DB 업데이트 후 같은 room의 모든 SSE 구독자에게 브로드캐스트
   */
  @Patch('node-move')
  async moveNode(@Body() dto: NodeMoveDto, @Req() req: any) {
    // await this.prisma.nodes.update({
    //   where: { node_id: dto.nodeId },
    //   data: { position_x: dto.x, position_y: dto.y }
    // });

    const event: NodeMoveEvent = {
      roomId: dto.roomId,
      nodeId: dto.nodeId,
      x: dto.x,
      y: dto.y,
      userId: req.user.userId
    };
    this.sseService.emit(event);

    return { success: true };
  }
}
