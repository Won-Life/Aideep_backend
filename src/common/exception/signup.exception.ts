import { ForbiddenException } from '@nestjs/common';

export class IdExistException extends ForbiddenException {
  constructor() {
    super('이미 존재하는 아이디 입니다.');
  }
}
