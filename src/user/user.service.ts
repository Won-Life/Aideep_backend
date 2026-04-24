import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { UserInfoDto } from './dto/user.dto';

@Injectable()
export class UserService {
  constructor(private readonly userRespository: UserRepository) {}

  async findUserInfo(userId: string): Promise<UserInfoDto> {
    const user = await this.userRespository.findByUserId(userId);
    if (!user) throw new NotFoundException('존재하지 않는 유저입니다.');
    return {
      userId: user.user_id,
      username: user.username,
      email: user.email,
      createdAt: user.created_at
    };
  }
}
