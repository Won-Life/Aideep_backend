interface NodeDataBase {
  color: string;
  textColor: string;
}

type NodeData = MarkDownNodeData | PdfNodeData;

interface MarkDownNodeData extends NodeDataBase {
  dataType: 'MARKDOWN';
  body: string;
}

interface PdfNodeData extends NodeDataBase {
  dataType: 'PDF';
  fileUrl: string;
  fileName: string;
  fileSize?: number;
}

export class Node {
  id: string;
  workspaceId: string;
  userId: string;
  title: string;
  nodeType: 'DATA' | 'PROJECT' | 'RESOURCE' | 'ARCHIVE';
  position: {
    x: number;
    y: number;
  };
  data: NodeData;
}
