// Integration test for weighted learning in App.tsx
import { computeWeights } from './src/utils/shuffle.weights';

// Mock data for testing
const mockQuestions = [
  {
    id: 1,
    difficulty: 1,
    correct_count: 10,
    incorrect_count: 0,
    last_practiced: '2024-03-20'
  },
  {
    id: 2,
    difficulty: 3,
    correct_count: 2,
    incorrect_count: 8,
    last_practiced: '2024-01-15'
  },
  {
    id: 3,
    difficulty: 2,
    correct_count: 5,
    incorrect_count: 5,
    last_practiced: null
  }
];

console.log('=== Weighted Learning Integration Test ===');

// Test computeWeights with default config
console.log('\n1. Default weight computation:');
const defaultWeights = computeWeights(mockQuestions);
console.log('Question 1 (easy, perfect):', defaultWeights[0].toFixed(3));
console.log('Question 2 (hard, poor):', defaultWeights[1].toFixed(3));
console.log('Question 3 (medium, never practiced):', defaultWeights[2].toFixed(3));

// Test computeWeights with custom config
console.log('\n2. Custom weight computation:');
const customConfig = {
  w_performance: 0.8,
  w_decay: 0.1,
  w_difficulty: 0.1,
  halflife_days: 14
};
const customWeights = computeWeights(mockQuestions, customConfig);
console.log('Custom config weights:', customWeights.map(w => w.toFixed(3)));

// Test DrillSettings structure
console.log('\n3. DrillSettings structure test:');
const mockDrillSettings = {
  sorting: 'weighted_learning' as const,
  immediateFeedback: true,
  showExplanationOnDemand: true,
  sourceFilters: ['user', 'ai'] as const,
  shuffleAnswers: false,
  excludeAnswered: false,
  weightedLearning: {
    enabled: true,
    halflife_days: 7,
    w_performance: 0.50,
    w_decay: 0.30,
    w_difficulty: 0.20
  },
  shuffleHistory: [],
  shuffleHistorySize: 10
};

console.log('DrillSettings structure:', JSON.stringify(mockDrillSettings, null, 2));

console.log('\n=== Integration test completed ===');
