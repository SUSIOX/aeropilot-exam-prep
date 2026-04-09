import { DrillSettings } from './types';

export interface DrillSession {
  sessionId: string;
  type: 'drill' | 'mix';
  subjectId: number | null;
  license: 'PPL' | 'SPL' | 'BOTH';
  
  questionIds: string[];
  seed: number;
  
  currentIndex: number;
  answers: Record<string, string>;
  drillSettings: DrillSettings;
  
  startedAt: string;
  lastActivity: string;
  expiresAt: string;
  
  isCompleted?: boolean;
  completedAt?: string;
}

export interface SessionProgressUpdate {
  currentIndex?: number;
  answers?: Record<string, string>;
  lastActivity?: string;
}

export interface SessionRestoreResult {
  session: DrillSession;
  isStale: boolean;
}
