import { dynamoMonitor, ThrottleLevel } from './dynamoMonitor';
import { rateLimiter } from './rateLimiter';
import { dynamoDBService } from './dynamoService';

export interface CacheEntry {
  questionId: string;
  explanation?: string;
  detailedExplanation?: string;
  provider?: string;
  model?: string;
  createdAt: string;
  usageCount: number;
}

export class DynamoDBCacheService {
  private readonly CACHE_PREFIX = 'dynamodb_cache_';
  private readonly CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

  // Hlavní metoda pro získání cache
  async getCachedExplanation(
    questionId: string,
    provider?: string,
    model?: string
  ): Promise<CacheEntry | null> {
    try {
      // 1. Zkontrolovat zda je AI cache povolena
      if (!dynamoMonitor.isAICacheEnabled()) {
        console.log('AI cache is disabled');
        return null;
      }

      // 2. Zkusit localStorage first (rychlé)
      const localEntry = this.getFromLocalStorage(questionId);
      if (localEntry) {
        console.log('Cache hit: localStorage');
        return localEntry;
      }

      // 3. Zkontrolovat limity pro DynamoDB read
      const throttleLevel = await dynamoMonitor.checkLimits('read');
      
      // 4. Rate limiting
      const canProceed = await rateLimiter.request('read', throttleLevel);
      if (!canProceed) {
        console.log('Rate limit exceeded for read operation');
        return null;
      }

      // 5. Zkusit DynamoDB
      const dynamoEntry = await this.getFromDynamoDB(questionId, model);
      if (dynamoEntry) {
        // Uložit do localStorage pro budoucí použití
        this.saveToLocalStorage(dynamoEntry);
        
        // Zvýšit read counter
        dynamoMonitor.incrementUsage('read');
        
        return dynamoEntry;
      }

      console.log('Cache miss');
      return null;

    } catch (error) {
      console.error('Error getting cached explanation:', error);
      return null;
    }
  }

  // Uložení vysvětlení do cache
  async saveExplanation(
    questionId: string,
    explanation: string,
    provider: string,
    model: string,
    detailedExplanation?: string
  ): Promise<boolean> {
    try {
      // 1. Zkontrolovat limity pro write
      const throttleLevel = await dynamoMonitor.checkLimits('write');
      
      // 2. Rate limiting
      const canProceed = await rateLimiter.request('write', throttleLevel);
      if (!canProceed) {
        console.log('Rate limit exceeded for write operation');
        return false;
      }

      // 3. Vytvořit cache entry
      const entry: CacheEntry = {
        questionId,
        explanation,
        detailedExplanation,
        provider,
        model,
        createdAt: new Date().toISOString(),
        usageCount: 1
      };

      // 4. Uložit do localStorage (vždy)
      this.saveToLocalStorage(entry);

      // 5. Uložit do DynamoDB (jen pokud povoleno)
      if (throttleLevel !== 'EMERGENCY') {
        await this.saveToDynamoDB(entry);
        dynamoMonitor.incrementUsage('write');
        const dataSize = JSON.stringify(entry).length;
        dynamoMonitor.estimateStorageSize(dataSize);
      }

      return true;

    } catch (error) {
      console.error('Error saving explanation:', error);
      // Fallback - alespoň localStorage
      try {
        const entry: CacheEntry = {
          questionId,
          explanation,
          provider,
          model,
          createdAt: new Date().toISOString(),
          usageCount: 1
        };
        this.saveToLocalStorage(entry);
        return true;
      } catch (fallbackError) {
        console.error('Even localStorage fallback failed:', fallbackError);
        return false;
      }
    }
  }

  // localStorage operace
  private getFromLocalStorage(questionId: string): CacheEntry | null {
    try {
      const key = `${this.CACHE_PREFIX}${questionId}`;
      const stored = localStorage.getItem(key);
      
      if (!stored) return null;
      
      const entry = JSON.parse(stored) as CacheEntry;
      
      // Kontrola TTL
      const age = Date.now() - new Date(entry.createdAt).getTime();
      if (age > this.CACHE_TTL) {
        localStorage.removeItem(key);
        return null;
      }
      
      // Zvýšit usage count
      entry.usageCount++;
      this.saveToLocalStorage(entry);
      
      return entry;
    } catch (error) {
      console.error('Error reading from localStorage:', error);
      return null;
    }
  }

  private saveToLocalStorage(entry: CacheEntry): void {
    try {
      const key = `${this.CACHE_PREFIX}${entry.questionId}`;
      localStorage.setItem(key, JSON.stringify(entry));
    } catch (error) {
      console.error('Error writing to localStorage:', error);
    }
  }

  // DynamoDB operace (reálné)
  private async getFromDynamoDB(questionId: string, model?: string): Promise<CacheEntry | null> {
    try {
      if (!model) {
        console.warn('Model is required for DynamoDB cache lookup');
        return null;
      }

      const result = await dynamoDBService.getCachedExplanation(questionId, model);
      
      if (result.success && result.data) {
        const dynamoItem = result.data;
        
        // Transform DynamoDB item to CacheEntry format
        const cacheEntry: CacheEntry = {
          questionId: dynamoItem.questionId,
          explanation: dynamoItem.explanation,
          detailedExplanation: dynamoItem.detailedExplanation,
          provider: dynamoItem.provider,
          model: dynamoItem.model,
          createdAt: dynamoItem.createdAt,
          usageCount: dynamoItem.usageCount
        };
        
        console.log('Cache hit: DynamoDB');
        return cacheEntry;
      }
      
      console.log('Cache miss: DynamoDB');
      return null;
      
    } catch (error) {
      console.error('Error reading from DynamoDB:', error);
      return null;
    }
  }

  private async saveToDynamoDB(entry: CacheEntry): Promise<void> {
    try {
      if (!entry.provider || !entry.model) {
        return;
      }

      await dynamoDBService.saveExplanation(
        entry.questionId,
        entry.explanation || '',
        entry.detailedExplanation || null,
        entry.provider as 'gemini' | 'claude',
        entry.model
      );
      
    } catch (error) {
      console.error('❌ Error writing to DynamoDB:', error);
    }
  }

  // Vymazání cache
  clearCache(): void {
    try {
      // Vymazat localStorage cache
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(this.CACHE_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
      
      console.log('Local cache cleared');
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  // Získání statistik cache
  getCacheStats(): {
    totalEntries: number;
    totalSize: number;
    oldestEntry: string | null;
    newestEntry: string | null;
  } {
    try {
      const keys = Object.keys(localStorage).filter(key => 
        key.startsWith(this.CACHE_PREFIX)
      );
      
      let totalSize = 0;
      let oldestTime = Date.now();
      let newestTime = 0;
      let oldestEntry: string | null = null;
      let newestEntry: string | null = null;

      keys.forEach(key => {
        const stored = localStorage.getItem(key);
        if (stored) {
          totalSize += stored.length;
          
          try {
            const entry = JSON.parse(stored) as CacheEntry;
            const entryTime = new Date(entry.createdAt).getTime();
            
            if (entryTime < oldestTime) {
              oldestTime = entryTime;
              oldestEntry = entry.questionId;
            }
            
            if (entryTime > newestTime) {
              newestTime = entryTime;
              newestEntry = entry.questionId;
            }
          } catch (error) {
            // Invalid entry, ignore
          }
        }
      });

      return {
        totalEntries: keys.length,
        totalSize,
        oldestEntry,
        newestEntry
      };
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return {
        totalEntries: 0,
        totalSize: 0,
        oldestEntry: null,
        newestEntry: null
      };
    }
  }

  // Optimalizace cache (smazání starých položek)
  optimizeCache(): void {
    try {
      const keys = Object.keys(localStorage).filter(key => 
        key.startsWith(this.CACHE_PREFIX)
      );

      const now = Date.now();
      let removed = 0;

      keys.forEach(key => {
        const stored = localStorage.getItem(key);
        if (stored) {
          try {
            const entry = JSON.parse(stored) as CacheEntry;
            const age = now - new Date(entry.createdAt).getTime();
            
            // Smazat položky starší než 30 dní
            if (age > 30 * 24 * 60 * 60 * 1000) {
              localStorage.removeItem(key);
              removed++;
            }
          } catch (error) {
            // Invalid entry, remove it
            localStorage.removeItem(key);
            removed++;
          }
        }
      });

      console.log(`Cache optimization completed: ${removed} entries removed`);
    } catch (error) {
      console.error('Error optimizing cache:', error);
    }
  }
}

// Singleton instance
export const dynamoCache = new DynamoDBCacheService();
