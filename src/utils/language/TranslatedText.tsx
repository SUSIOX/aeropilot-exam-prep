import React from 'react';
import { Question } from '../../types';
import { LanguageContextType } from './types';
import { markdownToHtml, sanitizeHtml } from '../markdown';

function renderMath(text: string) {
  if (!text || (!text.includes('$') && !text.includes('**') && !text.includes('*'))) return null;
  return sanitizeHtml(markdownToHtml(text));
}

interface TranslatedTextProps {
  question: Question;
  field: 'text' | 'option_a' | 'option_b' | 'option_c' | 'option_d' | 'explanation';
  language: LanguageContextType;
  className?: string;
  as?: 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'div';
}

export function TranslatedText({ 
  question, 
  field, 
  language, 
  className = '',
  as: Component = 'span'
}: TranslatedTextProps) {
  
  const displayText = language.getDisplayText(question, field);
  const html = renderMath(displayText);

  if (html) {
    const Tag = Component as any;
    return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  }

  const Tag = Component as any;
  return <Tag className={className}>{displayText}</Tag>;
}

interface TranslatedOptionProps {
  question: Question;
  option: 'A' | 'B' | 'C' | 'D';
  language: LanguageContextType;
  className?: string;
}

export function TranslatedOption({ 
  question, 
  option, 
  language, 
  className = ''
}: TranslatedOptionProps) {
  
  const { optionKey, optionCzKey } = getOptionKeys(option);
  
  let displayText: string;
  if (language.showTranslation && question[optionCzKey]) {
    displayText = question[optionCzKey] as string;
  } else {
    displayText = (question[optionKey] as string) || (question[optionCzKey] as string) || '';
  }
  
  const html = renderMath(displayText);
  if (html) return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  return <span className={className}>{displayText}</span>;
}

// Helper function - should be moved to utils.ts but keeping here for now
function getOptionKeys(option: 'A' | 'B' | 'C' | 'D') {
  const optionKey = `option_${option.toLowerCase()}` as keyof Question;
  const optionCzKey = `${optionKey}_cz` as keyof Question;
  return { optionKey, optionCzKey };
}
