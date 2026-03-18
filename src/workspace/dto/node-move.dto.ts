import { IsNumber, IsString, IsUUID } from 'class-validator';

export class NodeMoveDto {
  @IsUUID()
  nodeId: string;

  @IsString()
  roomId: string;

  @IsNumber()
  x: number;

  @IsNumber()
  y: number;
}
