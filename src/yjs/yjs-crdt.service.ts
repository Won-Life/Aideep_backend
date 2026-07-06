import { Injectable } from '@nestjs/common';
import * as Y from 'yjs';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from 'src/redis/redis.service';
import { REDIS_KEYS } from 'src/redis/redis.keys';
import { Transactional } from 'src/prisma/transactional.decorator';
import { FileAttachmentService } from 'src/file-attachment/file-attachment.service';

@Injectable()
export class YjsCrdtService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly fileAttachmentService: FileAttachmentService
  ) {}

  // ── Redis 계층 ──────────────────────────────────────────────

  async loadFromRedis(nodeId: string): Promise<Buffer | null> {
    const data = await this.redis
      .getClient()
      .get(REDIS_KEYS.YJS_DOC(nodeId))
      .catch(() => null);

    if (!data || typeof data !== 'string') return null;
    return Buffer.from(data, 'base64');
  }

  async saveToRedis(nodeId: string, state: Buffer): Promise<void> {
    await this.redis
      .getClient()
      .set(REDIS_KEYS.YJS_DOC(nodeId), state.toString('base64'), {
        EX: 86_400
      }); // 24h TTL
  }

  async deleteFromRedis(nodeId: string): Promise<void> {
    await this.redis.getClient().del(REDIS_KEYS.YJS_DOC(nodeId));
  }

  // ── DB 계층 ─────────────────────────────────────────────────

  async loadFromDb(
    nodeId: string
  ): Promise<{ state: Buffer | null; workspaceId: string } | null> {
    const node = await this.prisma.client.nodes.findUnique({
      where: { node_id: nodeId },
      select: { yjs_state: true, content: true, workspace_id: true }
    });
    if (!node) return null;

    // yjs_state가 있으면 그대로 반환
    if (node.yjs_state) {
      return {
        state: Buffer.from(node.yjs_state),
        workspaceId: node.workspace_id
      };
    }

    // yjs_state가 없으면 기존 content.markdownBody로 부트스트랩 (lazy migration)
    const content = node.content as Record<string, any> | null;
    const markdownBody = content?.markdownBody;

    if (markdownBody && typeof markdownBody === 'string') {
      const doc = new Y.Doc();
      const xmlText = doc.get('root', Y.XmlText);
      xmlText.insert(0, markdownBody);
      const state = Buffer.from(Y.encodeStateAsUpdate(doc));
      doc.destroy();
      return { state, workspaceId: node.workspace_id };
    }

    return { state: null, workspaceId: node.workspace_id };
  }

  @Transactional()
  async saveToDb(
    nodeId: string,
    state: Buffer,
    markdownText: string,
    workspaceId: string
  ): Promise<void> {
    // 현재 content를 읽어서 markdownBody만 업데이트
    const node = await this.prisma.client.nodes.findUnique({
      where: { node_id: nodeId },
      select: { content: true }
    });

    const currentContent = (node?.content as Record<string, any>) ?? {};
    const updatedContent = { ...currentContent, markdownBody: markdownText };

    await this.prisma.client.nodes.update({
      where: { node_id: nodeId },
      data: {
        yjs_state: new Uint8Array(state),
        content: updatedContent,
        version: { increment: 1 },
        updated_at: new Date()
      }
    });

    await this.fileAttachmentService.syncNodeAttachments(
      nodeId,
      workspaceId,
      updatedContent
    );

    // workspace sync 캐시 무효화
    await this.redis
      .getClient()
      .del(REDIS_KEYS.WORKSPACE_SYNC(workspaceId))
      .catch(() => {});
  }
}
