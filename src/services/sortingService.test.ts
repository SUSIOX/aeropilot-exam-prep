import { describe, it, expect } from 'vitest';
import { sortQuestions, SortingConfig } from '../services/sortingService';
import { Question } from '../types';

describe('SortingService', () => {
  const mockQuestions: Question[] = [
    { id: '1', text: 'Question 1', subject_id: 1, correct_option: 'A', option_a: 'A1', option_b: 'B1', option_c: 'C1', option_d: 'D1', explanation: 'E1', difficulty: 0.5, image: null, correct_count: 0, incorrect_count: 0, is_flagged: false, last_practiced: null },
    { id: '2', text: 'Question 2', subject_id: 1, correct_option: 'B', option_a: 'A2', option_b: 'B2', option_c: 'C2', option_d: 'D2', explanation: 'E2', difficulty: 0.5, image: null, correct_count: 0, incorrect_count: 0, is_flagged: false, last_practiced: null },
    { id: '10', text: 'Question 10', subject_id: 1, correct_option: 'C', option_a: 'A10', option_b: 'B10', option_c: 'C10', option_d: 'D10', explanation: 'E10', difficulty: 0.5, image: null, correct_count: 0, incorrect_count: 0, is_flagged: false, last_practiced: null },
    { id: '9_1', text: 'Question 9_1', subject_id: 1, correct_option: 'D', option_a: 'A9_1', option_b: 'B9_1', option_c: 'C9_1', option_d: 'D9_1', explanation: 'E9_1', difficulty: 0.5, image: null, correct_count: 0, incorrect_count: 0, is_flagged: false, last_practiced: null },
    { id: '9_10', text: 'Question 9_10', subject_id: 1, correct_option: 'A', option_a: 'A9_10', option_b: 'B9_10', option_c: 'C9_10', option_d: 'D9_10', explanation: 'E9_10', difficulty: 0.5, image: null, correct_count: 0, incorrect_count: 0, is_flagged: false, last_practiced: null },
    { id: 'subject1_q1', text: 'Subject 1 Q1', subject_id: 1, correct_option: 'B', option_a: 'AS1Q1', option_b: 'BS1Q1', option_c: 'CS1Q1', option_d: 'DS1Q1', explanation: 'ES1Q1', difficulty: 0.5, image: null, correct_count: 0, incorrect_count: 0, is_flagged: false, last_practiced: null }
  ];

  it('should sort by ID correctly', () => {
    const sorted = sortQuestions(mockQuestions, { config: { type: 'default' } });
    const sortedIds = sorted.map(q => q.id);
    expect(sortedIds).toEqual(['1', '2', '9_1', '9_10', '10', 'subject1_q1']);
  });

  it('should sort by ID when type is "id"', () => {
    const sorted = sortQuestions(mockQuestions, { config: { type: 'id' } });
    const sortedIds = sorted.map(q => q.id);
    expect(sortedIds).toEqual(['1', '2', '9_1', '9_10', '10', 'subject1_q1']);
  });

  it('should shuffle questions when type is "random"', () => {
    const sorted1 = sortQuestions(mockQuestions, { config: { type: 'random' } });
    const sorted2 = sortQuestions(mockQuestions, { config: { type: 'random' } });
    
    // Should be different order (probabilistic test)
    expect(sorted1.map(q => q.id)).not.toEqual(sorted2.map(q => q.id));
  });

  it('should sort by difficulty hardest first', () => {
    const questionsWithDifficulty: Question[] = [
      { ...mockQuestions[0], difficulty: 0.2 },
      { ...mockQuestions[1], difficulty: 0.8 },
      { ...mockQuestions[2], difficulty: 0.5 }
    ];

    const sorted = sortQuestions(questionsWithDifficulty, { config: { type: 'hardest_first' } });
    expect(sorted[0].difficulty).toBe(0.8);
    expect(sorted[1].difficulty).toBe(0.5);
    expect(sorted[2].difficulty).toBe(0.2);
  });

  it('should sort by last practiced least practiced first', () => {
    const questionsWithPractice: Question[] = [
      { ...mockQuestions[0], last_practiced: '2024-01-01T00:00:00Z' },
      { ...mockQuestions[1], last_practiced: '2024-03-01T00:00:00Z' },
      { ...mockQuestions[2] } // never practiced
    ];

    const sorted = sortQuestions(questionsWithPractice, { config: { type: 'least_practiced' } });
    // Never practiced should come first
    expect(sorted[0].last_practiced).toBeUndefined();
    // Oldest practiced should come before newer
    expect(new Date(sorted[1].last_practiced!).getTime()).toBeLessThan(
      new Date(sorted[2].last_practiced!).getTime()
    );
  });

  it('should handle weighted learning with enabled config', () => {
    const config: SortingConfig = {
      type: 'weighted_learning',
      weightedLearning: {
        enabled: true,
        halflife_days: 7,
        difficulty_weight: 0.3,
        time_weight: 0.7
      },
      userId: 'test-user'
    };

    const sorted = sortQuestions(mockQuestions, { config });
    expect(sorted).toHaveLength(mockQuestions.length);
    // Should not throw error and should return all questions
  });

  it('should fallback to random for weighted learning when not enabled', () => {
    const config: SortingConfig = {
      type: 'weighted_learning',
      weightedLearning: {
        enabled: false
      }
    };

    const sorted = sortQuestions(mockQuestions, { config });
    expect(sorted).toHaveLength(mockQuestions.length);
  });
});
