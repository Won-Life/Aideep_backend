import { BadRequestException } from '@nestjs/common';
import {
  CreateMarkDownNodeBody,
  CreatePdfNodeBody,
  CreateProjectNodeBody
} from './dto/createNode.dto';
import { IsUUID } from 'class-validator';
import { json } from 'stream/consumers';

const MAX_TITLE_LENGTH = 500;

interface NodeDataBase {
  color: string;
  textColor: string;
}

type NodeData = MarkDownNodeData | PdfNodeData | ProjectNodeData;

export interface ProjectNodeData extends NodeDataBase {
  dataType: 'PROJECT';
}

interface MarkDownNodeData extends NodeDataBase {
  dataType: 'MARKDOWN';
  markdownBody: string;
  jsonBody: string;
}

interface PdfNodeData extends NodeDataBase {
  dataType: 'PDF';
  fileUrl: string;
  fileName: string;
  fileSize?: number;
}

export class Node {
  @IsUUID()
  id: string;

  @IsUUID()
  workspaceId: string;

  @IsUUID()
  userId: string;

  title: string;
  nodeType: 'DATA' | 'PROJECT' | 'RESOURCE' | 'ARCHIVE';
  position: { x: number; y: number };
  data: NodeData;

  // ──────────────────────────────────────────
  // 공통 검증
  // ──────────────────────────────────────────
  private static validateTitle(title: string) {
    if (title.length > MAX_TITLE_LENGTH)
      throw new BadRequestException(
        `title은 ${MAX_TITLE_LENGTH}자를 초과할 수 없습니다.`
      );
  }

  private static validatePosition(position: { x: number; y: number }) {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y))
      throw new BadRequestException(
        'position 값이 유효하지 않습니다. (NaN, Infinity 불가)'
      );
  }

  // ──────────────────────────────────────────
  // 팩토리 메서드
  // ──────────────────────────────────────────
  static fromProjectDto(
    dto: CreateProjectNodeBody,
    workspaceId: string,
    userId: string
  ): Node {
    Node.validateTitle(dto.title);
    Node.validatePosition(dto.position);

    const node = new Node();
    node.workspaceId = workspaceId;
    node.userId = userId;
    node.title = dto.title.trim() || '제목없음';
    node.nodeType = 'PROJECT';
    node.position = dto.position;
    node.data = { dataType: 'PROJECT', color: '#ffffff', textColor: '#000000' };
    return node;
  }

  static fromMarkDownDto(
    dto: CreateMarkDownNodeBody,
    workspaceId: string,
    userId: string
  ): Node {
    Node.validateTitle(dto.title);
    Node.validatePosition(dto.position);
    const { jsonBody, color, textColor } = dto.body;
    const node = new Node();
    node.workspaceId = workspaceId;
    node.userId = userId;
    node.title = dto.title.trim() || '제목없음';
    node.nodeType = 'DATA';
    node.position = dto.position;
    node.data = {
      dataType: 'MARKDOWN',
      markdownBody: '',
      jsonBody: jsonBody,
      color: color,
      textColor: textColor
    };
    return node;
  }

  // static fromPdfDto(
  //   dto: CreatePdfNodeBody,
  //   workspaceId: string,
  //   userId: string
  // ): Node {
  //   Node.validateTitle(dto.title);
  //   Node.validatePosition(dto.position);
  //   Node.validatePdfFileName(dto.data.fileName);
  //   Node.validatePdfFileSize(dto.data.fileSize);
  //   Node.validatePdfFileUrl(dto.data.fileUrl);

  //   const node = new Node();
  //   node.workspaceId = workspaceId;
  //   node.userId = userId;
  //   node.title = dto.title.trim();
  //   node.nodeType = 'RESOURCE';
  //   node.position = dto.position;
  //   node.data = {
  //     dataType: 'PDF',
  //     fileUrl: dto.data.fileUrl,
  //     fileName: dto.data.fileName,
  //     fileSize: dto.data.fileSize,
  //     color: '#ffffff',
  //     textColor: '#000000'
  //   };
  //   return node;
  // }
}
