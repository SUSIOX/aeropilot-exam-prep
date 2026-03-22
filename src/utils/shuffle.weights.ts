export interface ItemStats {
  difficulty: number;
  correct_count: number | null;
  incorrect_count: number | null;
  last_practiced: string | null;
}

export interface WeightConfig {
  w_performance?: number;   // default: 0.50
  w_decay?: number;          // default: 0.30
  w_difficulty?: number;     // default: 0.20
  epsilon?: number;         // default: 0.05
  halflife_days?: number;   // default: 7
  max_difficulty?: number;  // default: odvozeno z předaných dat
}

/**
 * Computes weights for items based on their performance statistics and difficulty.
 * Higher weights indicate items that should appear earlier in shuffled sequences.
 * 
 * @param items - Array of item statistics
 * @param config - Weight calculation configuration
 * @returns Array of weights (same length as items)
 * 
 * @example
 * ```ts
 * const questions = [
 *   { difficulty: 3, correct_count: 2, incorrect_count: 5, last_practiced: '2024-01-01' },
 *   { difficulty: 1, correct_count: 10, incorrect_count: 0, last_practiced: '2024-03-01' }
 * ];
 * const weights = computeWeights(questions, { halflife_days: 7 });
 * const shuffled = shuffle(questions, { weights, seed: userId });
 * ```
 */
export function computeWeights(items: ItemStats[], config: WeightConfig = {}): number[] {
  const {
    w_performance = 0.50,
    w_decay = 0.30,
    w_difficulty = 0.20,
    epsilon = 0.05,
    halflife_days = 7,
    max_difficulty
  } = config;
  
  // Validate inputs
  if (!Array.isArray(items)) {
    throw new Error('computeWeights: items must be an array');
  }
  
  if (items.length === 0) {
    return [];
  }
  
  // Calculate max difficulty if not provided
  const actualMaxDifficulty = max_difficulty !== undefined 
    ? max_difficulty 
    : Math.max(...items.map(i => i.difficulty || 1));
  
  const weights: number[] = [];
  
  for (const item of items) {
    // 1. Performance (error rate)
    const total = (item.correct_count || 0) + (item.incorrect_count || 0);
    const performance = total > 0
      ? (item.incorrect_count || 0) / total
      : 0.5; // never practiced → neutral
    
    // 2. Time decay (Ebbinghaus forgetting curve)
    let decay = 1.0; // never practiced → maximum priority
    if (item.last_practiced) {
      const daysSince = (Date.now() - Date.parse(item.last_practiced)) / 86_400_000;
      decay = 1 - Math.exp(-daysSince / halflife_days);
    }
    
    // 3. Normalized difficulty
    let diffNorm = 0.5; // all same difficulty → neutral
    if (actualMaxDifficulty > 1) {
      const difficulty = Math.max(1, item.difficulty || 1);
      diffNorm = (difficulty - 1) / (actualMaxDifficulty - 1);
    }
    
    // 4. Combined weight
    const weight = w_performance * performance
                 + w_decay * decay
                 + w_difficulty * diffNorm
                 + epsilon;
    
    weights.push(Math.max(epsilon, weight)); // Ensure minimum weight
  }
  
  return weights;
}
