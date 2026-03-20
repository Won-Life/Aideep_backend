import { BadRequestException } from '@nestjs/common';
import {
  CreateMarkDownNodeBody,
  CreatePdfNodeBody,
  CreateProjectNodeBody
} from './dto/createNode.dto';
import { IsUUID } from 'class-validator';
import { MarkdownBodyDto } from './dto/updateNode.dto';

const MAX_TITLE_LENGTH = 500;
const MAX_BODY_LENGTH = 100_000;
const MAX_PDF_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_URL_ORIGINS = [process.env.S3_ORIGIN].filter(Boolean);

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
  // PDF 전용 검증
  // ──────────────────────────────────────────
  private static validatePdfFileName(fileName: string) {
    if (!fileName.toLowerCase().endsWith('.pdf'))
      throw new BadRequestException('PDF 파일명은 .pdf 확장자여야 합니다.');
  }

  private static validatePdfFileSize(fileSize: number) {
    if (fileSize <= 0)
      throw new BadRequestException('fileSize는 0보다 커야 합니다.');
    if (fileSize > MAX_PDF_SIZE)
      throw new BadRequestException(
        `fileSize는 ${MAX_PDF_SIZE / 1024 / 1024}MB를 초과할 수 없습니다.`
      );
  }

  private static validatePdfFileUrl(fileUrl: string) {
    let url: URL;
    try {
      url = new URL(fileUrl);
    } catch {
      throw new BadRequestException('fileUrl이 올바른 URL 형식이 아닙니다.');
    }
    if (url.protocol !== 'https:')
      throw new BadRequestException('fileUrl은 https여야 합니다.');
    if (
      ALLOWED_URL_ORIGINS.length > 0 &&
      !ALLOWED_URL_ORIGINS.includes(url.origin)
    )
      throw new BadRequestException('허용되지 않은 파일 URL입니다.');
  }

  private static validateMarkdown(body: MarkdownBodyDto) {
    const { jsonBody, markdownBody } = body;
    if (markdownBody.length >= MAX_BODY_LENGTH)
      throw new BadRequestException(
        `본문은 ${MAX_BODY_LENGTH}를 초과할 수 없습니다.`
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
    Node.validateMarkdown(dto.body);
    const { jsonBody, markdownBody } = dto.body;

    const node = new Node();
    node.workspaceId = workspaceId;
    node.userId = userId;
    node.title = dto.title.trim();
    node.nodeType = 'DATA';
    node.position = dto.position;
    node.data = {
      dataType: 'MARKDOWN',
      markdownBody: markdownBody,
      jsonBody: jsonBody,
      color: '#ffffff',
      textColor: '#000000'
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
