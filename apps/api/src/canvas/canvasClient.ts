export interface CanvasAssignment {
  canvasId: string;
  title: string;
  description: string | null;
  deadline: Date;
  pointsPossible: number | null;
}

export interface CanvasClient {
  connect(userId: string, canvasBaseUrl: string, apiToken: string): Promise<void>;
  disconnect(userId: string): Promise<void>;
  isConnected(userId: string): Promise<boolean>;
  listAssignments(userId: string): Promise<CanvasAssignment[]>;
  getAssignment(userId: string, canvasId: string): Promise<CanvasAssignment | null>;
}
