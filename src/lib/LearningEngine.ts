import { Question } from '../types';

export interface SessionResults {
  score: number;
  total: number;
  percentage: number;
  timeSpentSeconds: number;
}

export interface AnswerResult {
  isCorrect: boolean;
  correctOption: string;
  selectedOption: string;
}

/**
 * LearningEngine handles the core logic of a study session (Drill or Exam).
 * It manages question progression, scoring, and performance tracking.
 */
export class LearningEngine {
  private questions: Question[] = [];
  private currentIndex: number = 0;
  private answers: Record<number, string> = {};
  private startTime: number = 0;
  private endTime: number = 0;

  constructor(questions: Question[]) {
    this.questions = questions;
    this.startTime = Date.now();
  }

  /**
   * Returns the current question in the session.
   */
  getCurrentQuestion(): Question | null {
    if (this.questions.length === 0) return null;
    return this.questions[this.currentIndex];
  }

  /**
   * Submits an answer for the current question.
   */
  submitAnswer(option: string): AnswerResult {
    const question = this.getCurrentQuestion();
    if (!question) throw new Error("No active question");

    this.answers[question.id] = option;
    
    return {
      isCorrect: option === question.correct_option,
      correctOption: question.correct_option,
      selectedOption: option
    };
  }

  /**
   * Moves to the next question. Returns false if there are no more questions.
   */
  next(): boolean {
    if (this.currentIndex < this.questions.length - 1) {
      this.currentIndex++;
      return true;
    }
    this.endTime = Date.now();
    return false;
  }

  /**
   * Moves to the previous question.
   */
  previous(): boolean {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      return true;
    }
    return false;
  }

  /**
   * Jumps to a specific question index.
   */
  jumpTo(index: number): boolean {
    if (index >= 0 && index < this.questions.length) {
      this.currentIndex = index;
      return true;
    }
    return false;
  }

  /**
   * Returns the current progress.
   */
  getProgress() {
    return {
      current: this.currentIndex + 1,
      total: this.questions.length,
      answeredCount: Object.keys(this.answers).length
    };
  }

  /**
   * Returns the answer for a specific question ID if it exists.
   */
  getAnswerFor(questionId: number): string | null {
    return this.answers[questionId] || null;
  }

  /**
   * Bulk sets answers (useful for restoring state or calculating results from external state).
   */
  setAnswers(answers: Record<number, string>) {
    this.answers = { ...answers };
  }

  /**
   * Finalizes the session and returns the results.
   */
  getResults(): SessionResults {
    let score = 0;
    this.questions.forEach(q => {
      if (this.answers[q.id] === q.correct_option) {
        score++;
      }
    });

    const end = this.endTime || Date.now();
    const timeSpent = Math.floor((end - this.startTime) / 1000);

    return {
      score,
      total: this.questions.length,
      percentage: this.questions.length > 0 ? Math.round((score / this.questions.length) * 100) : 0,
      timeSpentSeconds: timeSpent
    };
  }

  /**
   * Static helper to shuffle an array (Fisher-Yates).
   */
  static shuffle<T>(array: T[]): T[] {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  }

  /**
   * Static helper to shuffle question answers.
   * Returns shuffled answers array and the new index of the correct answer.
   */
  static shuffleAnswers(question: Question): { shuffledAnswers: string[]; correctIndex: number; shuffleMap: number[] } {
    const answers = [question.option_a, question.option_b, question.option_c, question.option_d];
    const originalCorrectIndex = ['A', 'B', 'C', 'D'].indexOf(question.correct_option);
    
    // Generate shuffle map: [2, 0, 3, 1] means display A shows original answer[2], etc.
    const shuffleMap = this.shuffle([0, 1, 2, 3]);
    
    // Create shuffled answers using shuffle map
    const shuffledAnswers = shuffleMap.map(index => answers[index]);
    
    // Find new position of correct answer
    const correctIndex = shuffleMap.indexOf(originalCorrectIndex);
    
    return {
      shuffledAnswers,
      correctIndex,
      shuffleMap
    };
  }

  /**
   * Static helper to generate an exam set from a pool of questions.
   */
  static generateExamSet(pool: Question[], limit: number = 20): Question[] {
    return this.shuffle(pool).slice(0, limit);
  }
}
