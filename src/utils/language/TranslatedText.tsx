import React from 'react';
import { Question } from '../../types';
import { LanguageContextType } from './types';

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
  
  if (Component === 'span') {
    return <span className={className}>{displayText}</span>;
  } else if (Component === 'p') {
    return <p className={className}>{displayText}</p>;
  } else if (Component === 'div') {
    return <div className={className}>{displayText}</div>;
  } else if (Component === 'h1') {
    return <h1 className={className}>{displayText}</h1>;
  } else if (Component === 'h2') {
    return <h2 className={className}>{displayText}</h2>;
  } else if (Component === 'h3') {
    return <h3 className={className}>{displayText}</h3>;
  } else if (Component === 'h4') {
    return <h4 className={className}>{displayText}</h4>;
  } else if (Component === 'h5') {
    return <h5 className={className}>{displayText}</h5>;
  } else {
    return <h6 className={className}>{displayText}</h6>;
  }
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
  
  return (
    <span className={className}>
      {displayText}
    </span>
  );
}

// Helper function - should be moved to utils.ts but keeping here for now
function getOptionKeys(option: 'A' | 'B' | 'C' | 'D') {
  const optionKey = `option_${option.toLowerCase()}` as keyof Question;
  const optionCzKey = `${optionKey}_cz` as keyof Question;
  return { optionKey, optionCzKey };
}
