import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { WorkspaceService } from 'src/workspace/workspace.service';
import { ChatMessageBody } from './dto/chat.dto';

/**
 * 채팅 스트리밍 프록시.
 *
 * 사용자 채팅을 AI 서버(`POST {AI_SERVER_URL}/chat`)로 라우팅하고,
 * AI 서버가 흘려주는 SSE 청크를 변형 없이 그대로 클라이언트로 파이프한다.
 * 클라이언트가 연결을 끊으면 AbortController로 AI 서버 요청도 취소한다.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly aiServerUrl: string;
  private readonly aiApiKey?: string;

  constructor(
    private readonly config: ConfigService,
    private readonly workspaceService: WorkspaceService
  ) {
    this.aiServerUrl = this.config.get<string>('AI_SERVER_URL') ?? '';
    this.aiApiKey = this.config.get<string>('AI_SERVER_API_KEY');
  }

  async streamChat(
    userId: string,
    body: ChatMessageBody,
    req: Request,
    res: Response
  ): Promise<void> {
    // IDOR 방지: workspaceId가 AI 컨텍스트 조회에 쓰이므로, 포워딩 전에
    // 요청 유저가 해당 워크스페이스 멤버인지 검증한다(비멤버면 예외 → 전역 필터 처리).
    if (body.workspaceId) {
      await this.workspaceService.checkExist(userId, body.workspaceId);
    }

    if (!this.aiServerUrl) {
      res.status(503).json({ message: 'AI 서버가 설정되지 않았습니다.' });
      return;
    }

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    let aiRes: Awaited<ReturnType<typeof fetch>>;
    try {
      aiRes = await fetch(`${this.aiServerUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.aiApiKey ? { Authorization: `Bearer ${this.aiApiKey}` } : {})
        },
        body: JSON.stringify({ userId, ...body }),
        signal: controller.signal
      });
    } catch (e) {
      this.logger.error(`AI 서버 연결 실패: ${(e as Error).message}`);
      if (!res.headersSent) {
        res.status(502).json({ message: 'AI 서버 연결에 실패했습니다.' });
      }
      return;
    }

    if (!aiRes.ok || !aiRes.body) {
      this.logger.error(`AI 서버 응답 오류: ${aiRes.status}`);
      if (!res.headersSent) {
        res
          .status(502)
          .json({ message: `AI 서버 오류 (status=${aiRes.status})` });
      }
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const reader = aiRes.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) res.write(Buffer.from(value));
      }
      res.end();
    } catch (e) {
      // 클라이언트 중단(abort) 또는 스트림 오류 → 에러 이벤트 후 종료
      this.logger.warn(`채팅 스트림 중단: ${(e as Error).message}`);
      if (!res.writableEnded) {
        res.write(
          `event: error\ndata: ${JSON.stringify({ message: 'stream interrupted' })}\n\n`
        );
        res.end();
      }
    }
  }
}
