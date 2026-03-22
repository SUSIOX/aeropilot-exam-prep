export interface ShuffleOptions {
  seed?: number;
  copy?: boolean;
  history?: string[];
  weights?: number[];
}

/**
 * Shuffles an array using either Fisher-Yates (unweighted) or A-ES (weighted) algorithm.
 * 
 * @param array - The array to shuffle
 * @param options - Optional configuration options
 * @returns Shuffled array
 * 
 * @example
 * ```ts
 * // Plain shuffle (Fisher-Yates)
 * const shuffled = shuffle([1, 2, 3, 4, 5]);
 * 
 * // Deterministic shuffle with seed
 * const seeded = shuffle(questions, { seed: userId });
 * 
 * // Weighted shuffle for learning algorithm
 * const weights = computeWeights(questionStats, { halflife_days: 7 });
 * const learningShuffle = shuffle(questions, { weights, seed: userId });
 * 
 * // Shuffle with deduplication history
 * const history = getShuffleHistory();
 * const uniqueShuffle = shuffle(questions, { history, seed: userId });
 * ```
 */
export function shuffle<T>(array: T[], options?: ShuffleOptions): T[] {
  const { seed, copy = true, history, weights } = options || {};
  
  // Validate weights if provided
  if (weights !== undefined) {
    if (weights.length !== array.length) {
      throw new Error('shuffle: weights must have the same length as array');
    }
    if (weights.some(w => !isFinite(w) || w < 0)) {
      throw new Error('shuffle: all weights must be non-negative finite numbers');
    }
  }
  
  // Create copy if requested, otherwise use original for mutation
  const sourceArray = copy ? [...array] : array;
  
  // Use seeded PRNG if seed provided, otherwise Math.random
  const random = seed ? mulberry32(seed) : Math.random;
  
  // Choose algorithm based on weights
  let result: T[];
  if (weights) {
    // A-ES (Exponential Sort) for weighted shuffle
    result = weightedShuffle(sourceArray, weights, random);
  } else {
    // Fisher-Yates shuffle
    result = fisherYatesShuffle(sourceArray, random);
  }
  
  // For copy: false, we need to mutate the original array to match the result
  if (!copy) {
    array.length = 0; // Clear original
    array.push(...result); // Copy result back to original
    return array; // Return mutated original
  }
  
  // Check history for deduplication
  if (history && history.length > 0) {
    const resultHash = hashArray(result);
    let attempts = 0;
    
    while (history.includes(resultHash) && attempts < 100) {
      // Reshuffle using same algorithm
      if (weights) {
        result = weightedShuffle(sourceArray, weights, random);
      } else {
        result = fisherYatesShuffle(sourceArray, random);
      }
      attempts++;
    }
    
    if (attempts >= 100) {
      console.warn('shuffle: Could not generate unique result after 100 attempts');
    }
  }
  
  return result;
}

export function hashArray(arr: unknown[]): string {
  // Simple hash function for arrays
  let hash = 0;
  const str = JSON.stringify(arr);
  
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return hash.toString(36);
}

// Fisher-Yates shuffle helper
function fisherYatesShuffle<T>(array: T[], random: () => number): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// A-ES (Exponential Sort) weighted shuffle helper
function weightedShuffle<T>(array: T[], weights: number[], random: () => number): T[] {
  // Create array of {item, weight, score}
  const scored = array.map((item, index) => ({
    item,
    weight: weights[index],
    score: 0
  }));
  
  // Calculate scores: score_i = random() ^ (1 / weight_i)
  for (let i = 0; i < scored.length; i++) {
    const weight = scored[i].weight;
    const exponent = 1 / (weight || 1); // Avoid division by zero
    scored[i].score = Math.pow(random(), exponent);
  }
  
  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  
  // Return just the items in new order
  return scored.map(s => s.item);
}

// In-place Fisher-Yates shuffle for copy: false optimization
function fisherYatesShuffleInPlace<T>(array: T[], random: () => number): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Mulberry32 PRNG for seeded randomness
function mulberry32(seed: number): () => number {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
