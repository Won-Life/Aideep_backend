import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  UseGuards,
  Body,
  Request,
  Inject,
  LoggerService,
  Delete
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
  CreateProjectNodeBody
} from './dto/createNode.dto';
import { NodeMoveBody, UpdateNodeMetaBody } from './dto/updateNode.dto';
import { Node } from './node.model';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ApiSuccessResponse } from 'src/common/response/api-success-response.decorator';
import { NodeDetailDto } from './dto/nodeDetail.dto';

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
  @ApiSuccessResponse({ type: 'string', example: '생성성공' }, 201)
  async createProjectNode(
    @Param('workspaceId') workspaceId: string,
    @Body() body: CreateProjectNodeBody,
    @Request() req: any
  ) {
    const userId = req.user?.user_id;
    const node = Node.fromProjectDto(body, workspaceId, userId);
    const nodeId = await this.nodeService.createProjectNode(node);
    return { nodeId };
  }

  @Post('/md')
  @ApiOperation({
    summary: 'MD 노드 생성 생성',
    description: '워크스페이스에 새 노드를 생성합니다.'
  })
  @ApiSuccessResponse(
    { type: 'string', example: '생성 성공' },
    201,
    'MD 노드 생성 성공'
  )
  async createMarkdownNode(
    @Request() req: any,
    @Param('workspaceId') workspaceId: string,
    @Body() body: CreateMarkDownNodeBody
  ) {
    const userId = req.user?.user_id;
    const node = Node.fromMarkDownDto(body, workspaceId, userId);
    console.log(node);
    const nodeId = await this.nodeService.createMarkdownNode(node);
    return { nodeId };
  }

  @Get(':nodeId')
  @ApiOperation({
    summary: '노드 상세 조회',
    description: '특정 노드의 상세 정보를 조회합니다.'
  })
  @ApiParam({ name: 'nodeId', description: '노드 ID' })
  @ApiSuccessResponse(NodeDetailDto, 200, '노드 상세 조회 성공')
  async queryDetailNode(
    @Param('workspaceId') workspaceId: string,
    @Param('nodeId') nodeId: string,
    @Request() req: any
  ) {
    const userId = req.user?.user_id;
    return await this.nodeService.queryDetailNode(workspaceId, nodeId, userId);
  }

  @Patch('/:nodeId')
  @ApiOperation({
    summary: '노드 메타 수정',
    description:
      '노드의 제목, 색깔(color/textColor)을 수정합니다. MD 내용은 YJS로 편집하세요.'
  })
  @ApiParam({ name: 'nodeId', description: '노드 아이디' })
  @ApiSuccessResponse(
    { type: 'string', example: '수정 성공' },
    200,
    '노드 메타 수정 성공'
  )
  async updateNodeMeta(
    @Request() req: any,
    @Body() body: UpdateNodeMetaBody,
    @Param('nodeId') nodeId: string,
    @Param('workspaceId') workspaceId: string
  ) {
    const userId = req.user?.user_id;
    await this.nodeService.updateNodeMeta(userId, nodeId, workspaceId, body);
    return '수정 성공';
  }

  @Patch('/:nodeId/move')
  @ApiOperation({
    summary: '노드 이동',
    description: 'Node의 position x,y 정보만 업데이트 합니다.'
  })
  @ApiParam({
    name: 'nodeId',
    description: '노드 아이디'
  })
  @ApiSuccessResponse(
    { type: 'string', example: '이동 성공' },
    200,
    '노드 이동 성공'
  )
  async moveNode(
    @Request() req: any,
    @Body() body: NodeMoveBody,
    @Param('nodeId') nodeId: string,
    @Param('workspaceId') workspaceId: string
  ) {
    const userId = req.user?.user_id;
    await this.nodeService.updateNodePosition(
      body,
      userId,
      workspaceId,
      nodeId
    );
    return '이동 성공';
  }

  // @Post('/pdf')
  // @ApiOperation({
  //   summary: 'PDF 노드 생성',
  //   description: '워크스페이스에 새 노드를 생성합니다.'
  // })
  // async createPdfNode(
  //   @Param('workspaceId') workspaceId: string,
  //   @Body() body: CreatePdfNodeBody,
  //   @Request() req: any
  // ) {
  //   const userId = req.user?.user_id;
  //   const node = Node.fromPdfDto(body, workspaceId, userId);
  //   await this.nodeService.createPdfNode(node);
  //   return '생성 성공';
  // }

  @Delete(':nodeId')
  @ApiOperation({
    summary: '노드 삭제',
    description: '특정 노드를 삭제합니다.'
  })
  @ApiParam({ name: 'nodeId', description: '노드 ID' })
    async deleteNode(
    @Request() req: any,
    @Param('workspaceId') workspaceId: string,
    @Param('nodeId') nodeId: string
  ): Promise<string> {
    const userId = req.user?.user_id;
    return await this.nodeService.deleteNode(workspaceId, userId, nodeId);
  }
}
