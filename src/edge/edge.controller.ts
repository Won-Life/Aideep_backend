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
import { ConnectNodeDto } from './dto/connectNode.dto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { Edge } from './edge.model';
import { ApiSuccessResponse } from 'src/common/response/api-success-response.decorator';

@ApiTags('Edge')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
@ApiParam({ name: 'workspaceId', description: '워크스페이스 ID' })
@Controller('workspace/:workspaceId/edge')
export class EdgeController {
  constructor(private readonly edgeService: EdgeService) {}

  @Post('/')
  @ApiOperation({ summary: '두개의 노드를 연결합니다.' })
  @ApiSuccessResponse(
    {
      type: 'string',
      example: '연결 성공'
    },
    200
  )
  async connectNodes(
    @Param('workspaceId') workspaceId: string,
    @Body() body: ConnectNodeDto,
    @Request() req: any
  ) {
    const userId = req.user?.user_id;
    const dto = Edge.create(body, workspaceId, userId);
    return await this.edgeService.connectNodes(dto);
  }

  @Delete('/:edgeId')
  async deleteEdge(
    @Param('workspaceId') workspaceId: string,
    @Param('edgeId') edgeId: string,
    @Request() req: any
  ) {
    const userId = req.user?.user_id;
    return await this.edgeService.deleteEdge(workspaceId, userId, edgeId);
  }
}
