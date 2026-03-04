import { Injectable } from '@nestjs/common';
import { NodeRespository } from './node.repository';
import { Transactional } from 'src/prisma/transactional.decorator';

@Injectable()
export class NodeService {
  constructor(private readonly nodeRespository: NodeRespository) {}

  async queryAllNode(workspaceId: string, userId: string) {}
}
