import { BasicError } from 'src/common/error/basic-error';

export class AiBeUnavailableError extends BasicError {
  constructor(description = '') {
    super(502, 'AI-BE-502', 'AI 서비스를 사용할 수 없습니다.', description);
    this.name = 'AiBeUnavailableError';
  }
}

export class AiBeBadRequestError extends BasicError {
  constructor(status: number, description = '') {
    super(status, `AI-BE-${status}`, 'AI 서비스가 요청을 거부했습니다.', description);
    this.name = 'AiBeBadRequestError';
  }
}
