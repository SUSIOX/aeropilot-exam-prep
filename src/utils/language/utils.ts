import { Question } from '../../types';

/**
 * Detect if text is Czech based on common Czech characters and patterns
 */
function isCzechText(text: string): boolean {
  if (!text) return false;
  const czechChars = /[ěščřžýáíéúůňóťďĚŠČŘŽÝÁÍÉÚŮŇÓŤĎ]/;
  if (czechChars.test(text)) return true;
  // Fallback: detect common Czech words for texts without diacritics
  const lower = text.toLowerCase();
  const czechWords = /\b(je|jsou|byl|bylo|byly|bude|nebo|ale|pro|pri|bez|nad|pod|jak|kde|kdo|co|se|na|ve|do|ze|po|za|od|ke|tato|tento|tyto|toto|jako|take|muze|mohou|pokud|kdyz|jestlize|otazka|odpoved|letadlo|pilot|let|vzduch|rychlost|vyska|tlak|teplota|vzdalenost)\b/;
  return czechWords.test(lower);
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
 * Only EASA-sourced questions are potentially English.
 */
export function isEnglishQuestion(question: Question | undefined): boolean {
  if (!question) return false;

  // Only EASA questions can be English
  if (question.source !== 'easa') return false;

  // Check if the text itself is already Czech (some EASA questions are CZ)
  if (isCzechText(question.text)) return false;

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
  let text = (question[enField] as string) || (question[czField] as string) || '';

  // User request: Remove "Viz obr." and similar patterns if image is present
  if (field === 'text' && question.image && text) {
    // Matches "Viz obr.", "viz obr.", optionally followed by "(PFP-009)" etc.
    const pattern = /[Vv]iz\s+obr\.?(\s+\([^)]+\))?/g;
    text = text.replace(pattern, '').trim();
    // Clean up double spaces or periods left behind
    text = text.replace(/\s{2,}/g, ' ').replace(/\.{2,}/g, '.');
  }

  return text;
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
