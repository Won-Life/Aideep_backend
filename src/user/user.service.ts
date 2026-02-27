import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { UserRepository } from './user.repository';
import { BasicError } from 'src/common/error';

@Injectable()
export class UserService {
  constructor(private readonly userRespository: UserRepository) {}
  async findUserInfo(userId: string) {
    const ans = await this.userRespository.findUser(userId);
    if (ans === null) {
      console.log('nasd');
    }
  }

  create(createUserDto: CreateUserDto) {
    return 'This action adds a new user';
  }
  findAll() {
    return `This action returns all user`;
  }
  findOne(id: number) {
    return `This action returns a #${id} user`;
  }

  update(id: number, updateUserDto: UpdateUserDto) {
    return `This action updates a #${id} user`;
  }

  remove(id: number) {
    return `This action removes a #${id} user`;
  }
}
