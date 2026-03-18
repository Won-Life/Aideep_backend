import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Delete,
  UseGuards,
  Body,
  Request,
  Inject,
  LoggerService
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
import { UpdateNodeBody } from './dto/updateNode.dto';
import { Node } from './node.model';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

@ApiTags('Node')
@Controller('workspace/:workspaceId/node')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
@ApiParam({ name: 'workspaceId', description: '워크스페이스 ID' })
export class NodeController {
  constructor(
    private readonly nodeService: NodeService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: LoggerService
  ) {}

  @Post('/project')
  @ApiOperation({
    summary: '프로젝트 노드 생성 생성',
    description: '워크스페이스에 새 노드를 생성합니다.'
  })
  async createProjectNode(
    @Param('workspaceId') workspaceId: string,
    @Body() body: CreateProjectNodeBody,
    @Request() req: any
  ) {
    const userId = req.user?.user_id;
    const node = Node.fromProjectDto(body, workspaceId, userId);
    await this.nodeService.createProjectNode(node);
    return '생성 성공';
  }

  @Post('/md')
  @ApiOperation({
    summary: 'MD 노드 생성 생성',
    description: '워크스페이스에 새 노드를 생성합니다.'
  })
  async createMarkdownNode(
    @Request() req: any,
    @Param('workspaceId') workspaceId: string,
    @Body() body: CreateMarkDownNodeBody
  ) {
    const userId = req.user?.user_id;
    const node = Node.fromMarkDownDto(body, workspaceId, userId);
    await this.nodeService.createMarkdownNode(node);
    return '생성 성공';
  }

  @Post('pdf')
  @ApiOperation({
    summary: 'PDF 노드 생성',
    description: '워크스페이스에 새 노드를 생성합니다.'
  })
  async createPdfNode(
    @Param('workspaceId') workspaceId: string,
    @Body() body: CreatePdfNodeBody,
    @Request() req: any
  ) {
    const userId = req.user?.user_id;
    const node = Node.fromPdfDto(body, workspaceId, userId);
    await this.nodeService.createPdfNode(node);
    return '생성 성공';
  }

  // @Get()
  // @ApiOperation({
  //   summary: '노드 전체 조회',
  //   description: '워크스페이스의 모든 노드를 조회합니다.'
  // })
  // async queryAllNode(
  //   @Param('workspaceId') workspaceId: string,
  //   @Request() req: any
  // ) {
  //   const userId = req.user?.user_id;
  //   // return await this.nodeService.queryAllNode(workspaceId, userId);
  // }

  @Get(':nodeId')
  @ApiOperation({
    summary: '노드 상세 조회',
    description: '특정 노드의 상세 정보를 조회합니다.'
  })
  @ApiParam({ name: 'nodeId', description: '노드 ID' })
  async queryDetailNode(
    @Param('workspaceId') workspaceId: string,
    @Param('nodeId') nodeId: string,
    @Request() req: any
  ) {
    const userId = req.user?.user_id;
    return await this.nodeService.queryDetailNode(workspaceId, nodeId, userId);
  }

  @Patch(':nodeId')
  @ApiOperation({
    summary: '노드 수정',
    description: '특정 노드의 정보를 수정합니다. 변경 사항은 SSE로 전파됩니다.'
  })
  @ApiParam({ name: 'nodeId', description: '노드 ID' })
  async editNode(
    @Param('workspaceId') workspaceId: string,
    @Param('nodeId') nodeId: string,
    @Body() body: UpdateNodeBody,
    @Request() req: any
  ) {
    const userId = req.user?.user_id;
    await this.nodeService.updateNode(workspaceId, nodeId, userId, body);
    return '수정 성공';
  }

  // @Delete(':nodeId')
  // @ApiOperation({
  //   summary: '노드 삭제',
  //   description: '특정 노드를 삭제합니다.'
  // })
  // @ApiParam({ name: 'nodeId', description: '노드 ID' })
  // deleteNode(
  //   @Request() req: any,
  //   @Param('workspaceId') workspaceId: string,
  //   @Param('nodeId') nodeId: string
  // ) {
  //   const userId = req.user?.user_id;
  //   await this.nodeService
  // }
}
