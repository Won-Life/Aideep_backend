import { Injectable } from '@nestjs/common';
import { WorkspaceRepository } from './workspace.repository';
import { createWorkspaceBody } from './dto/createWorkspace.dto';
import { Transactional } from 'src/prisma/transactional.decorator';

@Injectable()
export class WorkspaceService {
  constructor(private readonly workspaceRepository: WorkspaceRepository) {}

  @Transactional()
  async creteWorkspace(userId: string, body: createWorkspaceBody) {
    try {
      const workspace = await this.workspaceRepository.insertWorkspace(body);
      console.log(workspace);
    } catch (err) {
      console.error(err);
    }
  }
}
