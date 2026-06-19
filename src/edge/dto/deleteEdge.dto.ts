import { ApiProperty } from '@nestjs/swagger';

export class DeleteEdgeResponse {
  @ApiProperty({ example: 'c8c9ea51-6ef6-46aa-849d-9b086855a39e' })
  edgeId: string;
}
