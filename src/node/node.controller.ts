import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  Body,
  Req,
  Request
} from '@nestjs/common';
import { NodeService } from './node.service';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guards';
import {
  CreateMarkDownNodeBody,
  CreatePdfNodeBody,
  CreateProjectNodeBody
} from './dto/createNode.dto';

@ApiTags('Node')
@Controller('workspace/:workspaceId/node')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
@ApiParam({ name: 'workspaceId', description: '워크스페이스 ID' })
export class NodeController {
  constructor(private readonly nodeService: NodeService) {}

  @Post('/project')
  @ApiOperation({
    summary: '프로젝트 노드 생성 생성',
    description: '워크스페이스에 새 노드를 생성합니다.'
  })
  createProjectNode(
    @Param('workspaceId') workspaceId: string,
    @Body() body: CreateProjectNodeBody
  ) {}

  @Post('/md')
  @ApiOperation({
    summary: 'MD 노드 생성 생성',
    description: '워크스페이스에 새 노드를 생성합니다.'
  })
  createMarkdownNode(
    @Param('workspaceId') workspaceId: string,
    @Body() body: CreateMarkDownNodeBody
  ) {}

  @Post('pdf')
  @ApiOperation({
    summary: 'PDF 노드 생성',
    description: '워크스페이스에 새 노드를 생성합니다.'
  })
  createPdfNode(
    @Param('workspaceId') workspaceId: string,
    @Body() body: CreatePdfNodeBody
  ) {}

  @Get()
  @ApiOperation({
    summary: '노드 전체 조회',
    description: '워크스페이스의 모든 노드를 조회합니다.'
  })
  async queryAllNode(
    @Param('workspaceId') workspaceId: string,
    @Request() req: any
  ) {
    const userId = req.user?.user_id;
    return await this.nodeService.queryAllNode(workspaceId, userId);
  }

  @Get(':nodeId')
  @ApiOperation({
    summary: '노드 상세 조회',
    description: '특정 노드의 상세 정보를 조회합니다.'
  })
  @ApiParam({ name: 'nodeId', description: '노드 ID' })
  queryDetailNode(
    @Param('workspaceId') workspaceId: string,
    @Param('nodeId') nodeId: string
  ) {}

  @Patch(':nodeId')
  @ApiOperation({
    summary: '노드 수정',
    description: '특정 노드의 정보를 수정합니다.'
  })
  @ApiParam({ name: 'nodeId', description: '노드 ID' })
  editNode(
    @Param('workspaceId') workspaceId: string,
    @Param('nodeId') nodeId: string
  ) {}

  @Delete(':nodeId')
  @ApiOperation({
    summary: '노드 삭제',
    description: '특정 노드를 삭제합니다.'
  })
  @ApiParam({ name: 'nodeId', description: '노드 ID' })
  deleteNode(
    @Param('workspaceId') workspaceId: string,
    @Param('nodeId') nodeId: string
  ) {}
}
