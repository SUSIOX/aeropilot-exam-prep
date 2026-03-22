export interface Subject {
  id: number;
  name: string;
  description?: string;
  question_count: number;
  user_count?: number;
  ai_count?: number;
  success_rate: number;
}

export interface Question {
  id: number | string;
  questionId?: string;
  subject_id: number;
  text: string;
  text_cz?: string;
  option_a: string;
  option_a_cz?: string;
  option_b: string;
  option_b_cz?: string;
  option_c: string;
  option_c_cz?: string;
  option_d: string;
  option_d_cz?: string;
  correct_option: string;
  explanation: string;
  explanation_cz?: string;
  difficulty: number;
  image: string | null;
  lo_id?: string;
  loId?: string;
  isVerified?: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
  correct_count: number | null;
  incorrect_count: number | null;
  is_flagged: boolean;
  last_practiced: string | null;
  source?: 'easa' | 'user' | 'ai';
  is_ai?: number;
  ai_explanation?: string;
  ai_detailed_explanation?: string;
  ai_explanation_provider?: string;
  ai_explanation_model?: string;
  ai_explanation_updated_at?: string;
  metadata?: { applies_to: string[]; license_note?: string | null };
  approved?: boolean;
  approvedBy?: string;
  approvedAt?: string;
}

export interface Stats {
  totalQuestions: number;
  userQuestions?: number;
  aiQuestions?: number;
  practicedQuestions: number;
  practicedUserQuestions?: number;
  practicedAiQuestions?: number;
  overallSuccess: number;
  subjectStats: { [subjectId: number]: { correctAnswers: number; totalAnswered: number } };
}

export type ViewMode = 'dashboard' | 'drill' | 'exam' | 'stats' | 'settings' | 'ai';

export interface DrillSettings {
  sorting: 'default' | 'random' | 'hardest_first' | 'least_practiced' | 'weighted_learning';
  immediateFeedback: boolean;
  showExplanationOnDemand: boolean;
  sourceFilters: ('user' | 'ai')[];
  shuffleAnswers: boolean;
  excludeAnswered: boolean;
  weightedLearning?: {
    enabled: boolean;
    halflife_days: number;
    w_performance: number;
    w_decay: number;
    w_difficulty: number;
  };
  shuffleHistory?: string[];
  shuffleHistorySize?: number;
}
