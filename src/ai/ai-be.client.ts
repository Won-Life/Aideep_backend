import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiBeBadRequestError, AiBeUnavailableError } from './ai-be.exception';

const TIMEOUT_MS = 15000;

@Injectable()
export class AiBeClient {
  private readonly logger = new Logger(AiBeClient.name);
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.getOrThrow<string>('AI_BE_URL');
  }

  async post<T>(path: string, payload: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch (err) {
      this.logger.error(
        `AI-BE ${path} 요청 실패`,
        err instanceof Error ? err.stack : String(err)
      );
      throw new AiBeUnavailableError(err instanceof Error ? err.message : String(err));
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (response.status >= 500) {
        throw new AiBeUnavailableError(`AI-BE ${path} ${response.status}: ${body}`);
      }
      throw new AiBeBadRequestError(response.status, `AI-BE ${path}: ${body}`);
    }

    return (await response.json()) as T;
  }
}
