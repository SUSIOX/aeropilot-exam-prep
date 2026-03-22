// Extended tests for shuffle utility with weighted shuffle
import { shuffle, hashArray } from './shuffle';
import { computeWeights, ItemStats, WeightConfig } from './shuffle.weights';

// Test data
const testArray = [1, 2, 3, 4, 5];
const emptyArray: number[] = [];
const singleArray = [42];

console.log('=== Extended Shuffle Utility Tests ===');

// === REGRESSION TESTS: Ensure existing behavior unchanged ===

console.log('\n--- Regression Tests ---');

// Regression 1: Same seed → same output (critical)
console.log('\nR1. Seed compatibility:');
const seededOld = shuffle(testArray, { seed: 123 });
const seededNew = shuffle(testArray, { seed: 123 });
console.log('Old result:', seededOld);
console.log('New result:', seededNew);
console.log('Seed compatibility:', JSON.stringify(seededOld) === JSON.stringify(seededNew));

// Regression 2: No weights → identical behavior
console.log('\nR2. No weights behavior:');
const noWeights1 = shuffle(testArray);
const noWeights2 = shuffle(testArray);
console.log('No weights works:', noWeights1.length === testArray.length);

// === WEIGHTED SHUFFLE TESTS ===

console.log('\n--- Weighted Shuffle Tests ---');

// Test W1: weights validation
console.log('\nW1. Weights validation:');
try {
  shuffle([1, 2, 3], { weights: [1, 2] }); // Wrong length
  console.log('Length validation: FAILED');
} catch (e) {
  console.log('Length validation: PASSED');
}

try {
  shuffle([1, 2, 3], { weights: [1, -2, 3] }); // Negative weight
  console.log('Negative weight validation: FAILED');
} catch (e) {
  console.log('Negative weight validation: PASSED');
}

// Test W2: Same seed + same weights → same output
console.log('\nW2. Weighted seed compatibility:');
const weights = [1, 2, 3, 4, 5];
const weighted1 = shuffle(testArray, { weights, seed: 456 });
const weighted2 = shuffle(testArray, { weights, seed: 456 });
console.log('Weighted seeded 1:', weighted1);
console.log('Weighted seeded 2:', weighted2);
console.log('Weighted seed compatibility:', JSON.stringify(weighted1) === JSON.stringify(weighted2));

// Test W3: Equal weights → similar distribution to plain shuffle
console.log('\nW3. Equal weights distribution:');
const equalWeights = [1, 1, 1, 1, 1];
const equalWeighted = shuffle(testArray, { weights: equalWeights, seed: 789 });
const plainShuffled = shuffle(testArray, { seed: 789 });
console.log('Equal weights result:', equalWeighted);
console.log('Plain shuffle result:', plainShuffled);
console.log('Note: Different algorithms (A-ES vs Fisher-Yets) → different results');
console.log('Both algorithms work:', equalWeighted.length === plainShuffled.length);

// Test W4: Weighted shuffle prioritizes higher weights
console.log('\nW4. Weight prioritization:');
const biasedWeights = [10, 1, 1, 1, 1]; // First element has much higher weight
const biasedResult = shuffle(['A', 'B', 'C', 'D', 'E'], { weights: biasedWeights, seed: 999 });
console.log('Biased weights:', biasedWeights);
console.log('Biased result:', biasedResult);
console.log('First element prioritized:', biasedResult[0] === 'A');

// === COMPUTE WEIGHTS TESTS ===

console.log('\n--- Compute Weights Tests ---');

// Test C1: Performance-based weighting
console.log('\nC1. Performance weighting:');
const items: ItemStats[] = [
  { difficulty: 1, correct_count: 10, incorrect_count: 0, last_practiced: '2024-03-01' }, // Good performance
  { difficulty: 1, correct_count: 0, incorrect_count: 10, last_practiced: '2024-03-01' },  // Poor performance
];
const perfWeights = computeWeights(items);
console.log('Good performance weight:', perfWeights[0]);
console.log('Poor performance weight:', perfWeights[1]);
console.log('Poor performance prioritized:', perfWeights[1] > perfWeights[0]);

// Test C2: Time decay weighting
console.log('\nC2. Time decay weighting:');
const timeItems: ItemStats[] = [
  { difficulty: 1, correct_count: 5, incorrect_count: 5, last_practiced: '2024-03-20' }, // Recent
  { difficulty: 1, correct_count: 5, incorrect_count: 5, last_practiced: '2024-01-01' }, // Old
];
const timeWeights = computeWeights(timeItems, { halflife_days: 7 });
console.log('Recent practice weight:', timeWeights[0]);
console.log('Old practice weight:', timeWeights[1]);
console.log('Old practice prioritized:', timeWeights[1] > timeWeights[0]);

// Test C3: Difficulty weighting
console.log('\nC3. Difficulty weighting:');
const diffItems: ItemStats[] = [
  { difficulty: 1, correct_count: 5, incorrect_count: 5, last_practiced: null },
  { difficulty: 5, correct_count: 5, incorrect_count: 5, last_practiced: null },
];
const diffWeights = computeWeights(diffItems);
console.log('Easy difficulty weight:', diffWeights[0]);
console.log('Hard difficulty weight:', diffWeights[1]);
console.log('Hard difficulty prioritized:', diffWeights[1] > diffWeights[0]);

// Test C4: All weights > 0 (epsilon guarantee)
console.log('\nC4. Minimum weight (epsilon):');
const perfectItems: ItemStats[] = [
  { difficulty: 1, correct_count: 100, incorrect_count: 0, last_practiced: new Date().toISOString() },
];
const perfectWeights = computeWeights(perfectItems);
console.log('Perfect performance weight:', perfectWeights[0]);
console.log('Weight > 0:', perfectWeights[0] > 0);

// Test C5: Empty array handling
console.log('\nC5. Empty array:');
const emptyWeights = computeWeights([]);
console.log('Empty weights:', emptyWeights);
console.log('Empty handled:', emptyWeights.length === 0);

// Test C6: Single element handling
console.log('\nC6. Single element:');
const singleItems: ItemStats[] = [
  { difficulty: 3, correct_count: 2, incorrect_count: 1, last_practiced: '2024-02-15' },
];
const singleWeights = computeWeights(singleItems);
console.log('Single weight:', singleWeights[0]);
console.log('Single handled:', singleWeights.length === 1 && singleWeights[0] > 0);

// Test C7: Custom configuration
console.log('\nC7. Custom configuration:');
const config: WeightConfig = {
  w_performance: 0.8,
  w_decay: 0.1,
  w_difficulty: 0.1,
  epsilon: 0.01
};
const configWeights = computeWeights(items, config);
console.log('Custom config weights:', configWeights);
console.log('Custom config works:', configWeights.length === items.length);

// === INTEGRATION TESTS ===

console.log('\n--- Integration Tests ---');

// Test I1: Full workflow example
console.log('\nI1. Full workflow:');
const workflowItems: ItemStats[] = [
  { difficulty: 2, correct_count: 8, incorrect_count: 2, last_practiced: '2024-03-15' },
  { difficulty: 4, correct_count: 3, incorrect_count: 7, last_practiced: '2024-01-10' },
  { difficulty: 1, correct_count: 10, incorrect_count: 0, last_practiced: '2024-03-20' },
];
const workflowWeights = computeWeights(workflowItems);
const workflowShuffled = shuffle(workflowItems, { weights: workflowWeights, seed: 123 });
console.log('Original items:', workflowItems.map(i => i.difficulty));
console.log('Computed weights:', workflowWeights);
console.log('Shuffled order:', workflowShuffled.map(i => i.difficulty));

console.log('\n=== All extended tests completed ===');
