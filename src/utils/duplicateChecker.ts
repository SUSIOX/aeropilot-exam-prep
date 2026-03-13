import { Question } from '../types';

interface DuplicateReport {
  totalQuestions: number;
  uniqueQuestions: number;
  duplicates: number;
  duplicateGroups: {
    loId: string;
    questionCount: number;
    questions: Question[];
  }[];
  questionsWithoutLo: Question[];
}

// This function should be called from App.tsx with the actual loadStaticQuestions function
export const findDuplicatesInQuestions = (questions: Question[]): DuplicateReport => {
  // Group questions by lo_id
  const questionsByLo = new Map<string, Question[]>();
  const questionsWithoutLo: Question[] = [];

  questions.forEach(question => {
    if (question.lo_id && question.lo_id.trim()) {
      const loId = question.lo_id.trim();
      if (!questionsByLo.has(loId)) {
        questionsByLo.set(loId, []);
      }
      questionsByLo.get(loId)!.push(question);
    } else {
      questionsWithoutLo.push(question);
    }
  });

  // Find LOs with multiple questions (potential duplicates)
  const duplicateGroups: DuplicateReport['duplicateGroups'] = [];
  
  questionsByLo.forEach((questions, loId) => {
    if (questions.length > 1) {
      duplicateGroups.push({
        loId,
        questionCount: questions.length,
        questions
      });
    }
  });

  // Sort by question count (highest first)
  duplicateGroups.sort((a, b) => b.questionCount - a.questionCount);

  const report: DuplicateReport = {
    totalQuestions: questions.length,
    uniqueQuestions: questionsByLo.size + questionsWithoutLo.length,
    duplicates: questions.length - (questionsByLo.size + questionsWithoutLo.length),
    duplicateGroups,
    questionsWithoutLo
  };

  return report;
};

// Function to check for duplicates in a specific subject
export const checkSubjectDuplicates = async (
  subjectId: number, 
  loadStaticQuestions: (subjectId: number) => Promise<Question[]>
): Promise<DuplicateReport> => {
  const questions = await loadStaticQuestions(subjectId);
  return findDuplicatesInQuestions(questions);
};

// Function to check for duplicates across all subjects
export const checkAllDuplicates = async (
  subjects: {id: number}[], 
  loadStaticQuestions: (subjectId: number) => Promise<Question[]>
): Promise<DuplicateReport> => {
  const allQuestions: Question[] = [];
  
  for (const subject of subjects) {
    const subjectQuestions = await loadStaticQuestions(subject.id);
    allQuestions.push(...subjectQuestions);
  }
  
  return findDuplicatesInQuestions(allQuestions);
};
