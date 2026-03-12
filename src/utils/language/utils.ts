import { Question } from '../../types';

/**
 * Detect if text is Czech based on common Czech characters and patterns
 */
function isCzechText(text: string): boolean {
  if (!text) return false;
  const czechChars = /[ěščřžýáíéúůňóťďĚŠČŘŽÝÁÍÉÚŮŇÓŤĎ]/;
  return czechChars.test(text);
}

/**
 * Detect language of the question text
 */
export function detectQuestionLanguage(question: Question | undefined): 'CZ' | 'EN' | 'unknown' {
  if (!question) return 'unknown';
  
  // If text_cz exists, question was originally English (translated to Czech)
  if (question.text_cz && question.text_cz.trim() !== '') {
    return 'EN';
  }
  
  // Check if the main text is Czech
  if (isCzechText(question.text)) {
    return 'CZ';
  }
  
  // Default to English if no Czech characters found
  return 'EN';
}

/**
 * Get option keys for dynamic access to question options
 */
export function getOptionKeys(option: 'A' | 'B' | 'C' | 'D') {
  const optionKey = `option_${option.toLowerCase()}` as keyof Question;
  const optionCzKey = `${optionKey}_cz` as keyof Question;
  return { optionKey, optionCzKey };
}

/**
 * Check if question has Czech translation
 */
export function hasTranslation(question: Question | undefined): boolean {
  return question ? (question.text_cz && question.text_cz.trim() !== '') : false;
}

/**
 * Check if question is English (no Czech translation available)
 * Uses language detection on text content, not just checking text_cz field
 */
export function isEnglishQuestion(question: Question | undefined): boolean {
  if (!question) return false;
  
  // Check if text itself is Czech (for questions that are originally Czech)
  if (isCzechText(question.text)) {
    return false;
  }
  
  // If text_cz exists, it's an English question with translation
  // If text_cz doesn't exist and text is not Czech, it's an English question without translation
  return true;
}

/**
 * Check if question is Czech (originally Czech, no translation needed)
 */
export function isCzechQuestion(question: Question | undefined): boolean {
  if (!question) return false;
  return isCzechText(question.text);
}

/**
 * Get display text based on translation preference
 */
export function getDisplayText(
  question: Question, 
  field: 'text' | 'option_a' | 'option_b' | 'option_c' | 'option_d' | 'explanation',
  showTranslation: boolean = false
): string {
  const czField = `${field}_cz` as keyof Question;
  const enField = field as keyof Question;
  
  // If translation is preferred and available, use Czech
  if (showTranslation && question[czField]) {
    return question[czField] as string;
  }
  
  // Default to English with Czech fallback
  return (question[enField] as string) || (question[czField] as string) || '';
}

/**
 * Get option display text with translation support
 */
export function getOptionDisplayText(
  question: Question,
  option: 'A' | 'B' | 'C' | 'D',
  showTranslation: boolean = false
): string {
  const { optionKey, optionCzKey } = getOptionKeys(option);
  
  if (showTranslation && question[optionCzKey]) {
    return question[optionCzKey] as string;
  }
  
  return (question[optionKey] as string) || (question[optionCzKey] as string) || '';
}
