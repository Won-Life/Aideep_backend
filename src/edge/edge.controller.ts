import {
  Body,
  Controller,
  Param,
  Post,
  UseGuards,
  Request,
  Delete
} from '@nestjs/common';
import { EdgeService } from './edge.service';
import { ConnectNodeDto, EdgeCreateResponse } from './dto/connectNode.dto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { Edge } from './edge.model';
import { ApiSuccessResponse } from 'src/common/response/api-success-response.decorator';
import { DeleteEdgeResponse } from './dto/deleteEdge.dto';

@ApiTags('Edge')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
@ApiParam({ name: 'workspaceId', description: '워크스페이스 ID' })
@Controller('workspace/:workspaceId/edge')
export class EdgeController {
  constructor(private readonly edgeService: EdgeService) {}

  @Post('/')
  @ApiOperation({
    summary: '두개의 노드를 연결',
    description:
      '두 노드를 연결하는 엣지를 생성하고 생성된 edgeId를 반환합니다(다른 사용자에게는 WS EDGE_CREATE 이벤트로 전송).'
  })
  @ApiSuccessResponse(EdgeCreateResponse, 200, '엣지 생성 성공')
  async connectNodes(
    @Param('workspaceId') workspaceId: string,
    @Body() body: ConnectNodeDto,
    @Request() req: any
  ): Promise<EdgeCreateResponse> {
    const userId = req.user?.user_id;
    const dto = Edge.create(body, workspaceId, userId);
    return await this.edgeService.connectNodes(dto);
  }

  @Delete('/:edgeId')
  @ApiOperation({
    summary: '엣지 삭제',
    description:
      '특정 엣지를 삭제합니다(다른 사용자에게는 WS EDGE_DELETED 이벤트로 전송).'
  })
  @ApiParam({ name: 'edgeId', description: '엣지 ID' })
  @ApiSuccessResponse(DeleteEdgeResponse, 200, '엣지 삭제 성공')
  async deleteEdge(
    @Param('workspaceId') workspaceId: string,
    @Param('edgeId') edgeId: string,
    @Request() req: any
  ): Promise<DeleteEdgeResponse> {
    const userId = req.user?.user_id;
    return await this.edgeService.deleteEdge(workspaceId, userId, edgeId);
  }
}
