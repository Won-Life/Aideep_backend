import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SignUpBody } from 'src/auth/dtos/signUpBody.dto';

@Injectable()
export class UserRepository {
  constructor(
    @Inject()
    private readonly prisma: PrismaService
  ) {}

  async findByUserId(userId: string) {
    return await this.prisma.users.findFirst({
      where: { user_id: userId }
    });
  }

  async findByEmail(email: string) {
    return await this.prisma.users.findFirst({
      where: { email: email }
    });
  }

  async create(dto: SignUpBody) {
    return await this.prisma.users.create({
      data: {
        email: dto.email,
        password: dto.password,
        username: dto.name
      }
    });
  }

  async findUser(userId: string) {
    return await this.prisma.users.findFirst({
      where: { user_id: userId },
      select: {
        username: true,
        email: true
      }
    });
  }
}
