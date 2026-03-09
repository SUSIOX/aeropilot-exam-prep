// AWS DynamoDB Usage Monitor
export interface UsageStats {
  reads: number;
  writes: number;
  storage: number;
  lastReset: string;
}

export interface UsageLimits {
  READS_PER_MONTH: number;
  WRITES_PER_MONTH: number;
  STORAGE_GB: number;
}

export interface UsageStatus {
  reads: { current: number; limit: number; percentage: string };
  writes: { current: number; limit: number; percentage: string };
  storage: { current: number; limit: number; percentage: string };
}

export type ThrottleLevel = 'NORMAL' | 'GENTLE_THROTTLE' | 'HARD_THROTTLE' | 'EMERGENCY';

export class DynamoDBMonitor {
  private usage: UsageStats = {
    reads: 0,
    writes: 0,
    storage: 0,
    lastReset: new Date().toISOString()
  };

  private readonly FREE_LIMITS: UsageLimits = {
    READS_PER_MONTH: 200_000_000, // 200M
    WRITES_PER_MONTH: 200_000_000, // 200M
    STORAGE_GB: 25
  };

  constructor() {
    this.usage = this.loadUsage();
    this.checkMonthlyReset();
  }

  // Načtení usage z localStorage
  private loadUsage(): UsageStats {
    const stored = localStorage.getItem('dynamodb_usage');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (error) {
        console.error('Error loading DynamoDB usage:', error);
        return this.usage;
      }
    }
    return this.usage;
  }

  // Uložení usage do localStorage
  private saveUsage(): void {
    localStorage.setItem('dynamodb_usage', JSON.stringify(this.usage));
  }

  // Kontrola měsíčního resetu
  private checkMonthlyReset(): void {
    const lastReset = new Date(this.usage.lastReset);
    const now = new Date();
    
    // Reset první den v měsíci
    if (lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear()) {
      this.resetMonthly();
    }
  }

  // Měsíční reset
  private resetMonthly(): void {
    this.usage.reads = 0;
    this.usage.writes = 0;
    this.usage.lastReset = new Date().toISOString();
    this.saveUsage();
    
    // Povolit AI cache znovu
    localStorage.removeItem('ai_cache_disabled');
    
    this.showNotification(
      '✅ DynamoDB Reset',
      'Měsíční limity byly resetovány. AI cache je opět plně dostupná.',
      'success'
    );
  }

  // Zkontroluj limit před operací
  async checkLimits(operation: 'read' | 'write'): Promise<ThrottleLevel> {
    this.checkMonthlyReset();
    
    const currentUsage = this.usage[operation];
    const limit = this.FREE_LIMITS[operation === 'read' ? 'READS_PER_MONTH' : 'WRITES_PER_MONTH'];
    const percentage = (currentUsage / limit) * 100;

    // 95% hard stop
    if (percentage > 95) {
      this.showHardStop(operation);
      return 'EMERGENCY';
    }

    // 85% hard throttling
    if (percentage > 85) {
      this.showHardThrottle(operation, percentage);
      return 'HARD_THROTTLE';
    }

    // 70% gentle throttling
    if (percentage > 70) {
      this.showGentleThrottle(operation, percentage);
      return 'GENTLE_THROTTLE';
    }

    return 'NORMAL';
  }

  // Zvýšení počítadla
  incrementUsage(operation: 'read' | 'write'): void {
    this.usage[operation]++;
    this.saveUsage();
  }

  // Gentle throttling varování
  private showGentleThrottle(operation: string, percentage: number): void {
    this.showNotification(
      `⚡ Aplikace je vytížená`,
      `AI cache pracuje pomaleji (${percentage.toFixed(1)}% využití). Odpovědi mohou trvat déle.`,
      'warning'
    );
  }

  // Hard throttling varování
  private showHardThrottle(operation: string, percentage: number): void {
    this.showNotification(
      `🕐 AI cache je omezena`,
      `Dosáhli jsme ${percentage.toFixed(1)}% limitu. Čekejte prosím...`,
      'warning'
    );
  }

  // Hard stop - úplné zastavení
  private showHardStop(operation: string): void {
    this.showNotification(
      `🛑 AI cache dočasně nedostupná`,
      `Měsíční limit byl dosažen. AI cache obnoví se 1. ${new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleDateString('cs-CZ')}`,
      'error'
    );

    // Zakázat AI cache
    localStorage.setItem('ai_cache_disabled', 'true');
  }

  // UI notifikace
  private showNotification(title: string, message: string, type: 'success' | 'warning' | 'error'): void {
    // Vytvořit notifikaci v UI
    const notification = document.createElement('div');
    notification.className = `dynamodb-notification notification-${type}`;
    notification.innerHTML = `
      <div class="notification-content">
        <h4>${title}</h4>
        <p>${message}</p>
        <button class="notification-close">OK</button>
      </div>
    `;
    
    // Přidat styly
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      max-width: 400px;
      padding: 16px;
      border-radius: 8px;
      z-index: 9999;
      animation: slideIn 0.3s ease-out;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    `;

    // Barvy podle typu
    if (type === 'success') {
      notification.style.background = '#10b981';
      notification.style.color = 'white';
    } else if (type === 'warning') {
      notification.style.background = '#f59e0b';
      notification.style.color = 'white';
    } else {
      notification.style.background = '#ef4444';
      notification.style.color = 'white';
    }

    // Přidat do DOM
    document.body.appendChild(notification);
    
    // Close button
    const closeBtn = notification.querySelector('.notification-close');
    if (closeBtn) {
      (closeBtn as HTMLElement).style.cssText = `
        background: rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        cursor: pointer;
        margin-top: 8px;
      `;
      closeBtn.addEventListener('click', () => notification.remove());
    }
    
    // Auto remove po 10s
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 10000);
  }

  // Získání statistik pro UI
  getUsageStats(): UsageStatus {
    const limits = this.FREE_LIMITS;
    
    return {
      reads: {
        current: this.usage.reads,
        limit: limits.READS_PER_MONTH,
        percentage: ((this.usage.reads / limits.READS_PER_MONTH) * 100).toFixed(2)
      },
      writes: {
        current: this.usage.writes,
        limit: limits.WRITES_PER_MONTH,
        percentage: ((this.usage.writes / limits.WRITES_PER_MONTH) * 100).toFixed(2)
      },
      storage: {
        current: this.usage.storage,
        limit: limits.STORAGE_GB,
        percentage: ((this.usage.storage / limits.STORAGE_GB) * 100).toFixed(2)
      }
    };
  }

  // Predikce měsíčního usage
  getMonthlyProjection(): { projected: number; willExceed: boolean; daysRemaining: number } {
    const now = new Date();
    const daysPassed = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysRemaining = daysInMonth - daysPassed;
    
    const dailyAverage = this.usage.reads / daysPassed;
    const projected = dailyAverage * daysInMonth;
    
    return {
      projected,
      willExceed: projected > this.FREE_LIMITS.READS_PER_MONTH,
      daysRemaining
    };
  }

  // Kontrola zda je AI cache povolena
  isAICacheEnabled(): boolean {
    return localStorage.getItem('ai_cache_disabled') !== 'true';
  }

  // Odhad velikosti dat v GB
  estimateStorageSize(dataSize: number): void {
    // Přepočet bajtů na GB (přibližně)
    const gbSize = dataSize / (1024 * 1024 * 1024);
    this.usage.storage = Math.round(gbSize * 100) / 100; // 2 decimal places
    this.saveUsage();
  }
}

// Singleton instance
export const dynamoMonitor = new DynamoDBMonitor();
