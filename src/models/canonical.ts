// Canonical Model - 统一的业务数据模型，独立于任何特定 EMR

export interface Task {
  id?: string;
  name: string;
  completed: boolean;
  notes?: string;
}

export interface VisitNote {
  // 业务标识
  visitId: string;
  patientId: string;
  caregiverId: string;
  
  // 时间信息
  visitDate: Date;
  startTime: string;
  endTime: string;
  
  // 内容
  note: string;
  tasks?: Task[];
  
  // 元数据
  metadata?: Record<string, any>;
}

