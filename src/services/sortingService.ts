import { Question } from '../types';
import { shuffle, ShuffleOptions } from '../utils/shuffle';

export type SortingType = 'default' | 'random' | 'hardest_first' | 'least_practiced' | 'weighted_learning' | 'id';

export interface SortingConfig {
  type: SortingType;
  weightedLearning?: {
    enabled: boolean;
    halflife_days?: number;
    difficulty_weight?: number;
    time_weight?: number;
  };
  shuffleHistory?: string[];
  shuffleHistorySize?: number;
  userId?: string;
}

export interface SortingOptions extends ShuffleOptions {
  config?: SortingConfig;
}

/**
 * Centralized sorting service for questions
 * Replaces all scattered sorting logic throughout the application
 */
export class SortingService {
  private static instance: SortingService;
  
  private constructor() {}
  
  public static getInstance(): SortingService {
    if (!SortingService.instance) {
      SortingService.instance = new SortingService();
    }
    return SortingService.instance;
  }

  /**
   * Main sorting method - handles all sorting types
   */
  public sortQuestions(questions: Question[], options: SortingOptions = {}): Question[] {
    const { config, ...shuffleOptions } = options;
    const sortingType = config?.type || 'default';
    
    console.log(`🔧 SortingService: Applying ${sortingType} sorting to ${questions.length} questions`);
    
    switch (sortingType) {
      case 'random':
        return this.sortRandom(questions, shuffleOptions);
      
      case 'hardest_first':
        return this.sortByDifficulty(questions);
      
      case 'least_practiced':
        return this.sortByLastPracticed(questions);
      
      case 'weighted_learning':
        return this.sortWeightedLearning(questions, config, shuffleOptions);
      
      case 'default':
      case 'id':
      default:
        return this.sortById(questions);
    }
  }

  /**
   * Random sorting using shuffle utility
   */
  private sortRandom(questions: Question[], options: ShuffleOptions): Question[] {
    return shuffle(questions, options);
  }

  /**
   * Sort by difficulty (hardest first)
   */
  private sortByDifficulty(questions: Question[]): Question[] {
    return [...questions].sort((a, b) => {
      const diffA = a.difficulty ?? 0;
      const diffB = b.difficulty ?? 0;
      if (diffB !== diffA) return diffB - diffA;
      return this.compareIds(a.id, b.id);
    });
  }

  /**
   * Sort by last practiced date (least practiced first)
   */
  private sortByLastPracticed(questions: Question[]): Question[] {
    return [...questions].sort((a, b) => {
      if (!a.last_practiced && !b.last_practiced) {
        return this.compareIds(a.id, b.id);
      }
      if (!a.last_practiced) return -1;
      if (!b.last_practiced) return 1;
      return new Date(a.last_practiced).getTime() - new Date(b.last_practiced).getTime();
    });
  }

  /**
   * Weighted learning sort using shuffle with weights
   */
  private sortWeightedLearning(
    questions: Question[], 
    config?: SortingConfig, 
    options: ShuffleOptions = {}
  ): Question[] {
    if (!config?.weightedLearning?.enabled) {
      console.warn('⚠️ Weighted learning not enabled, falling back to random');
      return this.sortRandom(questions, options);
    }

    const weights = this.computeWeights(questions, config.weightedLearning);
    const shuffleOptions: ShuffleOptions = {
      ...options,
      weights,
      seed: (config?.userId ? typeof config.userId === 'string' ? parseInt(config.userId) : config.userId : Date.now()) || Date.now(),
      history: config?.shuffleHistory
    };

    return shuffle(questions, shuffleOptions);
  }

  /**
   * Robust ID sorting - handles complex ID formats
   * Supports: simple numbers, 9_1, 9_10, subjectX_qY, etc.
   */
  private sortById(questions: Question[]): Question[] {
    return [...questions].sort((a, b) => this.compareIds(a.id, b.id));
  }

  /**
   * Robust ID comparison logic
   */
  private compareIds(idA: string | number, idB: string | number): number {
    const strA = String(idA);
    const strB = String(idB);
    
    // If both are simple numbers, compare numerically
    if (!strA.includes('_') && !strB.includes('_')) {
      const numA = parseInt(strA);
      const numB = parseInt(strB);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
    }
    
    // For complex IDs or mixed types, use hierarchical parsing
    const partsA = this.parseIdParts(strA);
    const partsB = this.parseIdParts(strB);
    
    // Hierarchical comparison
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const valA = partsA[i];
      const valB = partsB[i];
      
      if (valA === undefined) return -1;
      if (valB === undefined) return 1;
      
      if (valA !== valB) {
        // Numeric comparison if both are numbers
        if (typeof valA === 'number' && typeof valB === 'number') {
          return valA - valB;
        }
        // String comparison otherwise
        return String(valA).localeCompare(String(valB));
      }
    }
    return 0;
  }

  /**
   * Parse ID parts for hierarchical comparison
   */
  private parseIdParts(id: string): (string | number)[] {
    return id.split('_').map(part => {
      // If part looks like a number or 'q' followed by number, extract number
      const parsedNum = parseInt(part.startsWith('q') ? part.substring(1) : part);
      const num = isNaN(parsedNum) ? NaN : parsedNum;
      return isNaN(num) ? part : num;
    });
  }

  /**
   * Compute weights for weighted learning algorithm
   */
  private computeWeights(questions: Question[], config: SortingConfig['weightedLearning']): number[] {
    const halflifeDays = config?.halflife_days || 7;
    const difficultyWeight = config?.difficulty_weight || 0.3;
    const timeWeight = config?.time_weight || 0.7;
    
    return questions.map(q => {
      let difficultyScore = 1 - (q.difficulty || 0); // Higher weight for easier questions
      let timeScore = 1;
      
      if (q.last_practiced) {
        const daysSincePractice = (Date.now() - new Date(q.last_practiced).getTime()) / (1000 * 60 * 60 * 24);
        timeScore = 1 - Math.pow(0.5, daysSincePractice / halflifeDays);
      }
      
      return (difficultyScore * difficultyWeight) + (timeScore * timeWeight);
    });
  }

  /**
   * Update shuffle history for deduplication
   */
  public updateShuffleHistory(shuffledQuestions: Question[], config?: SortingConfig): string[] {
    if (!config || config.type !== 'weighted_learning') {
      return [];
    }

    const newHash = this.hashArray(shuffledQuestions.map(q => q.id));
    const currentHistory = config.shuffleHistory || [];
    const maxSize = config.shuffleHistorySize || 10;
    
    // Add new hash to history and maintain size limit
    return [newHash, ...currentHistory].slice(0, maxSize);
  }

  /**
   * Hash array for deduplication
   */
  private hashArray(arr: unknown[]): string {
    let hash = 0;
    const str = JSON.stringify(arr);
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return hash.toString(36);
  }
}

// Export singleton instance for easy usage
export const sortingService = SortingService.getInstance();

// Export convenience functions
export const sortQuestions = (questions: Question[], options?: SortingOptions) => 
  sortingService.sortQuestions(questions, options);

export const updateShuffleHistory = (shuffledQuestions: Question[], config?: SortingConfig) => 
  sortingService.updateShuffleHistory(shuffledQuestions, config);
