export type LanguageMode = 'view' | 'generate';

export type Language = 'EN' | 'CZ';

export interface LanguageState {
  // View mode - for displaying existing questions
  showTranslation: boolean;
  isTranslating: boolean;
  
  // Generate mode - for AI generation
  generateLanguage: Language;
  
  // Current mode context
  mode: LanguageMode;
}

export interface LanguageActions {
  // View mode actions
  translateQuestion: () => Promise<void>;
  toggleTranslation: () => void;
  resetTranslation: () => void;
  
  // Generate mode actions
  setGenerateLanguage: (language: Language) => void;
  
  // Common actions
  setIsTranslating: (translating: boolean) => void;
}

export interface LanguageContextType extends LanguageState, LanguageActions {
  // Utility functions
  isEnglishQuestion: (question: any) => boolean;
  getDisplayText: (question: any, field: 'text' | 'option_a' | 'option_b' | 'option_c' | 'option_d' | 'explanation') => string;
  hasTranslation: (question: any) => boolean;
}
