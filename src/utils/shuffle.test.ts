// Simple smoke tests for shuffle utility
import { shuffle, hashArray } from './shuffle';

// Test data
const testArray = [1, 2, 3, 4, 5];
const emptyArray: number[] = [];
const singleArray = [42];

console.log('=== Shuffle Utility Tests ===');

// Test 1: Same length
console.log('\n1. Length preservation:');
const shuffled1 = shuffle(testArray);
console.log('Original length:', testArray.length);
console.log('Shuffled length:', shuffled1.length);
console.log('Length preserved:', testArray.length === shuffled1.length);

// Test 2: Same elements
console.log('\n2. Element preservation:');
const sortedOriginal = [...testArray].sort();
const sortedShuffled = [...shuffled1].sort();
console.log('Original sorted:', sortedOriginal);
console.log('Shuffled sorted:', sortedShuffled);
console.log('Elements preserved:', JSON.stringify(sortedOriginal) === JSON.stringify(sortedShuffled));

// Test 3: Different order (probabilistic test)
console.log('\n3. Order change:');
const shuffled2 = shuffle(testArray);
console.log('Original:', testArray);
console.log('Shuffled 1:', shuffled1);
console.log('Shuffled 2:', shuffled2);
console.log('Order changed:', JSON.stringify(testArray) !== JSON.stringify(shuffled1));

// Test 4: Same seed → same output
console.log('\n4. Deterministic seeding:');
const seeded1 = shuffle(testArray, { seed: 123 });
const seeded2 = shuffle(testArray, { seed: 123 });
console.log('Seeded 1:', seeded1);
console.log('Seeded 2:', seeded2);
console.log('Same seed → same output:', JSON.stringify(seeded1) === JSON.stringify(seeded2));

// Test 5: copy: true doesn't mutate original
console.log('\n5. Non-mutation (copy: true):');
const originalCopy = [...testArray];
const shuffled3 = shuffle(testArray, { copy: true });
console.log('Original before:', originalCopy);
console.log('Original after:', testArray);
console.log('Not mutated:', JSON.stringify(originalCopy) === JSON.stringify(testArray));

// Test 6: copy: false mutates original
console.log('\n6. Mutation (copy: false):');
const mutableArray = [...testArray];
const originalBefore = [...mutableArray];
shuffle(mutableArray, { copy: false });
console.log('Original before:', originalBefore);
console.log('Original after:', mutableArray);
console.log('Mutated:', JSON.stringify(originalBefore) !== JSON.stringify(mutableArray));

// Test 7: Empty array
console.log('\n7. Empty array:');
const emptyShuffled = shuffle(emptyArray);
console.log('Empty array result:', emptyShuffled);
console.log('Empty array handled:', emptyShuffled.length === 0);

// Test 8: Single element array
console.log('\n8. Single element array:');
const singleShuffled = shuffle(singleArray);
console.log('Single element result:', singleShuffled);
console.log('Single element handled:', singleShuffled.length === 1 && singleShuffled[0] === 42);

// Test 9: Hash function
console.log('\n9. Hash function:');
const hash1 = hashArray([1, 2, 3]);
const hash2 = hashArray([1, 2, 3]);
const hash3 = hashArray([1, 2, 4]);
console.log('Same array hash 1:', hash1);
console.log('Same array hash 2:', hash2);
console.log('Different array hash:', hash3);
console.log('Same array → same hash:', hash1 === hash2);
console.log('Different array → different hash:', hash1 !== hash3);

// Test 10: History deduplication
console.log('\n10. History deduplication:');
const history = [hashArray([1, 2, 3, 4, 5])];
const withHistory = shuffle(testArray, { history });
console.log('History hash:', history[0]);
console.log('Result hash:', hashArray(withHistory));
console.log('Different from history:', history[0] !== hashArray(withHistory));

console.log('\n=== All tests completed ===');
