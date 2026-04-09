import { DrillSession } from '../types/session';
import { dynamoDBService } from './dynamoService';

const SESSION_STORAGE_KEY = 'drillSession';

export class SessionService {
  private currentSessionId: string | null = null;

  generateSessionId(type: 'drill' | 'mix'): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${type}-${timestamp}-${random}`;
  }

  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  setCurrentSessionId(sessionId: string | null): void {
    this.currentSessionId = sessionId;
  }

  /**
   * Start a new drill/mix session
   */
  async startSession(
    userId: string,
    type: 'drill' | 'mix',
    subjectId: number | null,
    license: 'PPL' | 'SPL' | 'BOTH',
    questionIds: string[],
    drillSettings: any
  ): Promise<DrillSession> {
    const sessionId = this.generateSessionId(type);
    const now = new Date().toISOString();
    
    const session: DrillSession = {
      sessionId,
      type,
      subjectId,
      license,
      questionIds,
      seed: Math.floor(Math.random() * 1000000),
      currentIndex: 0,
      answers: {},
      drillSettings,
      startedAt: now,
      lastActivity: now,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };

    // Save to localStorage for instant access
    this.saveToLocal(session);
    this.currentSessionId = sessionId;

    // Sync to DynamoDB (async, don't wait)
    if (userId && userId !== 'guest') {
      dynamoDBService.saveDrillSession(userId, session).catch(() => {
        // Silent fail - localStorage is primary
      });
    }

    return session;
  }

  /**
   * Update session progress
   */
  async updateProgress(
    userId: string,
    sessionId: string,
    updates: { currentIndex?: number; answers?: Record<string, string> }
  ): Promise<void> {
    // Update localStorage
    const session = this.loadFromLocal();
    if (session && session.sessionId === sessionId) {
      if (updates.currentIndex !== undefined) {
        session.currentIndex = updates.currentIndex;
      }
      if (updates.answers !== undefined) {
        session.answers = { ...session.answers, ...updates.answers };
      }
      session.lastActivity = new Date().toISOString();
      this.saveToLocal(session);
    }

    // Sync to DynamoDB
    if (userId && userId !== 'guest') {
      await dynamoDBService.updateSessionProgress(userId, sessionId, updates);
    }
  }

  /**
   * Mark session as completed
   */
  async completeSession(userId: string, sessionId: string): Promise<void> {
    this.clearLocal();
    this.currentSessionId = null;

    if (userId && userId !== 'guest') {
      await dynamoDBService.updateSessionProgress(userId, sessionId, { isCompleted: true });
    }
  }

  /**
   * Check for active session on mount
   */
  async checkForActiveSession(userId: string): Promise<DrillSession | null> {
    // 1. Try localStorage first (instant)
    const localSession = this.loadFromLocal();
    if (localSession && !this.isExpired(localSession) && !localSession.isCompleted) {
      this.currentSessionId = localSession.sessionId;
      return localSession;
    }

    // 2. If logged in, try DynamoDB
    if (userId && userId !== 'guest') {
      const result = await dynamoDBService.getActiveSession(userId);
      if (result.success && result.data) {
        const session = result.data as DrillSession;
        // Save to localStorage for next time
        this.saveToLocal(session);
        this.currentSessionId = session.sessionId;
        return session;
      }
    }

    return null;
  }

  /**
   * Delete/clear a session
   */
  async deleteSession(userId: string, sessionId: string): Promise<void> {
    this.clearLocal();
    this.currentSessionId = null;

    if (userId && userId !== 'guest') {
      await dynamoDBService.deleteSession(userId, sessionId);
    }
  }

  /**
   * Load session from localStorage
   */
  loadFromLocal(): DrillSession | null {
    try {
      const saved = localStorage.getItem(SESSION_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // Ignore parse errors
    }
    return null;
  }

  /**
   * Save session to localStorage
   */
  saveToLocal(session: DrillSession): void {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Ignore storage errors
    }
  }

  /**
   * Clear local session
   */
  clearLocal(): void {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }

  /**
   * Check if session is expired (> 24h of inactivity for drill, > 7 days absolute)
   */
  isExpired(session: DrillSession): boolean {
    const now = new Date();
    const expiresAt = new Date(session.expiresAt);
    
    // Check absolute expiration
    if (now > expiresAt) return true;
    
    // Check inactivity (24 hours)
    const lastActivity = new Date(session.lastActivity);
    const hoursInactive = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);
    
    return hoursInactive > 24;
  }

  /**
   * Check if session is stale (5+ minutes of inactivity)
   */
  isStale(session: DrillSession): boolean {
    const now = new Date();
    const lastActivity = new Date(session.lastActivity);
    const minutesInactive = (now.getTime() - lastActivity.getTime()) / (1000 * 60);
    
    return minutesInactive > 5;
  }
}

export const sessionService = new SessionService();
