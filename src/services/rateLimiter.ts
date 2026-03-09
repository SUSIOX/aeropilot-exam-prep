import { ThrottleLevel } from './dynamoMonitor';

export interface QueuedRequest {
  id: string;
  operation: 'read' | 'write';
  resolve: (value: boolean) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

export class RateLimiter {
  private lastRequestTime: number = 0;
  private queue: QueuedRequest[] = [];
  private isProcessing: boolean = false;
  private readonly maxQueueSize: number = 5;

  // Získání delay podle throttle level
  private getDelay(level: ThrottleLevel): number {
    switch (level) {
      case 'EMERGENCY':
        return -1; // Zakázáno
      case 'HARD_THROTTLE':
        return 10000; // 10 sekund
      case 'GENTLE_THROTTLE':
        return 3000; // 3 sekundy
      default:
        return 0; // Bez delay
    }
  }

  // Hlavní metoda pro rate limiting
  async request(operation: 'read' | 'write', level: ThrottleLevel): Promise<boolean> {
    const delay = this.getDelay(level);

    // Emergency - okamžité zamítnutí
    if (delay === -1) {
      return false;
    }

    // Normal - okamžité povolení
    if (delay === 0) {
      return true;
    }

    // Throttled - přidat do fronty nebo počkat
    return this.addToQueue(operation, delay);
  }

  // Přidání požadavku do fronty
  private async addToQueue(operation: 'read' | 'write', delay: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // Kontrola velikosti fronty
      if (this.queue.length >= this.maxQueueSize) {
        reject(new Error('Fronta je plná, zkuste to prosím později.'));
        return;
      }

      const request: QueuedRequest = {
        id: Math.random().toString(36).substr(2, 9),
        operation,
        resolve,
        reject,
        timestamp: Date.now()
      };

      this.queue.push(request);

      // Spustit zpracování fronty pokud neběží
      if (!this.isProcessing) {
        this.processQueue(delay);
      }
    });
  }

  // Zpracování fronty
  private async processQueue(delay: number): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const request = this.queue.shift();
      if (!request) continue;

      try {
        // Počkat na delay
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < delay) {
          const waitTime = delay - timeSinceLastRequest;
          await this.sleep(waitTime);
        }

        // Aktualizovat čas posledního požadavku
        this.lastRequestTime = Date.now();

        // Vyřídit požadavek
        request.resolve(true);

      } catch (error) {
        request.reject(error as Error);
      }
    }

    this.isProcessing = false;
  }

  // Sleep helper
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Získání stavu fronty
  getQueueStatus(): {
    size: number;
    maxSize: number;
    isProcessing: boolean;
    nextRequestIn: number;
  } {
    const nextRequestIn = this.isProcessing && this.queue.length > 0 
      ? Math.max(0, 3000 - (Date.now() - this.lastRequestTime))
      : 0;

    return {
      size: this.queue.length,
      maxSize: this.maxQueueSize,
      isProcessing: this.isProcessing,
      nextRequestIn
    };
  }

  // Vymazání fronty
  clearQueue(): void {
    this.queue.forEach(request => {
      request.reject(new Error('Fronta byla vymazána'));
    });
    this.queue = [];
    this.isProcessing = false;
  }

  // Získání odhadované čekací doby
  getEstimatedWaitTime(): number {
    if (this.queue.length === 0) {
      return 0;
    }

    const delay = this.getDelay('GENTLE_THROTTLE'); // Konzervativní odhad
    return this.queue.length * delay;
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();
