export type EmbeddingOp = 'UPSERT' | 'DELETE';

export interface EmbeddingMeta {
  workspaceId: string;
  op: EmbeddingOp;
  attempt?: number;
}
