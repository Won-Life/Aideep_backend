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
  Delete,
  Query,
  Headers
} from '@nestjs/common';
import { NodeService } from './node.service';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import {
  CreateMarkDownNodeBody,
  CreateProjectNodeBody,
  NodeCreateReponse
} from './dto/createNode.dto';
import {
  NodeMoveBody,
  NodeMoveResponse,
  NodeUpdateResponse,
  UpdateNodeMetaBody
} from './dto/updateNode.dto';
import { Node } from './node.model';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ApiSuccessResponse } from 'src/common/response/api-success-response.decorator';
import { NodeDetailDto } from './dto/nodeDetail.dto';
import { NodeSearchResponseDto } from './dto/nodeSearch.dto';
import {
  NodeContentOperationBody,
  NodeContentOperationResponse
} from './dto/nodeContentOperation.dto';

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
    summary: '프로젝트 노드 생성',
    description:
      '워크스페이스에 새 프로젝트 노드를 생성합니다. 생성된 노드 정보를 반환합니다(다른 사용자에게는 WS NODE_CREATE 이벤트로 전송).'
  })
  @ApiSuccessResponse(NodeCreateReponse, 201, '프로젝트 노드 생성 성공')
  async createProjectNode(
    @Param('workspaceId') workspaceId: string,
    @Body() body: CreateProjectNodeBody,
    @Request() req: any
  ): Promise<NodeCreateReponse> {
    const userId = req.user?.user_id;
    const node = Node.fromProjectDto(body, workspaceId, userId);

    return await this.nodeService.createProjectNode(node);
  }

  @Post('/md')
  @ApiOperation({
    summary: 'MD 노드 생성',
    description:
      '워크스페이스에 새 마크다운 노드를 생성합니다. 생성된 노드 정보를 반환합니다(다른 사용자에게는 WS NODE_CREATE 이벤트로 전송).'
  })
  @ApiSuccessResponse(NodeCreateReponse, 201, 'MD 노드 생성 성공')
  async createMarkdownNode(
    @Request() req: any,
    @Param('workspaceId') workspaceId: string,
    @Body() body: CreateMarkDownNodeBody
  ): Promise<NodeCreateReponse> {
    const userId = req.user?.user_id;
    const node = Node.fromMarkDownDto(body, workspaceId, userId);

    return await this.nodeService.createMarkdownNode(node);
  }

  @Get('search')
  @ApiOperation({
    summary: '노드 검색',
    description:
      '워크스페이스 내 노드를 title + content(JSON 전체 평탄화) 기준으로 substring + trigram similarity 검색합니다. FEATURE_FTS=true 시 GIN 인덱스 기반 가속 + ranking + snippet + cursor 페이지네이션.'
  })
  @ApiQuery({
    name: 'q',
    description: '검색어 (1~200자)',
    required: true,
    type: String
  })
  @ApiQuery({
    name: 'limit',
    description: '결과 수 (기본 50, 최대 100)',
    required: false,
    type: Number
  })
  @ApiQuery({
    name: 'cursor',
    description: '다음 페이지 cursor (이전 응답의 nextCursor)',
    required: false,
    type: String
  })
  @ApiSuccessResponse(NodeSearchResponseDto, 200, '노드 검색 성공')
  async searchNodes(
    @Param('workspaceId') workspaceId: string,
    @Query('q') query: string,
    @Request() req: any,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string
  ): Promise<NodeSearchResponseDto> {
    const userId = req.user?.user_id;
    return await this.nodeService.searchNodes(workspaceId, query, userId, {
      limit: limit !== undefined ? Number(limit) : undefined,
      cursor
    });
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
      '노드의 제목, 색깔(color/textColor), 타입(nodeType)을 수정합니다. MD 내용은 YJS로 편집하세요. propagateToChildren=true 이고 색상 변경이 있는 경우, 응답에 자식 노드별 patch가 descendants 배열로 포함됩니다(nodeType은 자식에게 전파되지 않습니다. 다른 사용자에게는 WS NODE_UPDATE 이벤트로 전송).'
  })
  @ApiParam({ name: 'nodeId', description: '노드 아이디' })
  @ApiSuccessResponse(NodeUpdateResponse, 200, '노드 메타 수정 성공')
  async updateNodeMeta(
    @Request() req: any,
    @Body() body: UpdateNodeMetaBody,
    @Param('nodeId') nodeId: string,
    @Param('workspaceId') workspaceId: string
  ): Promise<NodeUpdateResponse> {
    const userId = req.user?.user_id;
    return await this.nodeService.updateNodeMeta(
      userId,
      nodeId,
      workspaceId,
      body
    );
  }

  @Post('/:nodeId/content-operations')
  @ApiOperation({
    summary: '노드 본문 operation 실행',
    description:
      'Agent의 Markdown append 명령을 서버 측 Lexical/Yjs 트랜잭션으로 적용하고 실시간 편집자에게 전파합니다.'
  })
  @ApiParam({ name: 'nodeId', description: '노드 아이디' })
  @ApiSuccessResponse(
    NodeContentOperationResponse,
    200,
    '노드 본문 operation 성공'
  )
  async executeContentOperation(
    @Request() req: any,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: NodeContentOperationBody,
    @Param('nodeId') nodeId: string,
    @Param('workspaceId') workspaceId: string
  ): Promise<NodeContentOperationResponse> {
    return this.nodeService.executeContentOperation(
      req.user?.user_id,
      workspaceId,
      nodeId,
      idempotencyKey,
      body
    );
  }

  @Patch('/:nodeId/move')
  @ApiOperation({
    summary: '노드 이동',
    description:
      'Node의 position x,y 정보만 업데이트 합니다. 자손 노드는 동일 delta만큼 함께 이동합니다(다른 사용자에게는 WS NODE_MOVE 이벤트로 root 좌표만 전송, 자손은 delta로 계산).'
  })
  @ApiParam({
    name: 'nodeId',
    description: '노드 아이디'
  })
  @ApiSuccessResponse(NodeMoveResponse, 200, '노드 이동 성공')
  async moveNode(
    @Request() req: any,
    @Body() body: NodeMoveBody,
    @Param('nodeId') nodeId: string,
    @Param('workspaceId') workspaceId: string
  ): Promise<NodeMoveResponse> {
    const userId = req.user?.user_id;
    return await this.nodeService.updateNodePosition(
      body,
      userId,
      workspaceId,
      nodeId
    );
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
    description:
      '특정 노드를 삭제합니다(다른 사용자에게는 WS NODE_DELETE 이벤트로 전송).'
  })
  @ApiParam({ name: 'nodeId', description: '노드 ID' })
  @ApiSuccessResponse(
    { type: 'string', example: '노드 삭제' },
    200,
    '노드 삭제 성공'
  )
  async deleteNode(
    @Request() req: any,
    @Param('workspaceId') workspaceId: string,
    @Param('nodeId') nodeId: string
  ): Promise<string> {
    const userId = req.user?.user_id;
    return await this.nodeService.deleteNode(workspaceId, userId, nodeId);
  }
}
