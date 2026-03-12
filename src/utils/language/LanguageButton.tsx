import React from 'react';
import { Languages, RotateCcw } from 'lucide-react';
import { Question } from '../../types';
import { LanguageContextType } from './types';
import { hasTranslation } from './utils';

interface LanguageButtonProps {
  question: Question | undefined;
  language: LanguageContextType;
  mode: 'mobile' | 'desktop';
  className?: string;
  style?: React.CSSProperties;
}

export function LanguageButton({ 
  question, 
  language, 
  mode, 
  className = '',
  style = {}
}: LanguageButtonProps) {
  
  if (!question) return null;

  const isEnglish = language.isEnglishQuestion(question);
  const hasCzechTranslation = hasTranslation(question);

  // English question without translation - show Translate button
  if (isEnglish && !hasCzechTranslation) {
    const baseClasses = mode === 'mobile' 
      ? 'md:hidden px-3 py-2 border border-[var(--line)] rounded-xl hover:bg-[var(--ink)] hover:text-[var(--ink-text)] transition-colors flex-shrink-0'
      : 'hidden md:flex px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-all items-center gap-2 border-[var(--line)] opacity-60 hover:opacity-100';
    
    return (
      <button
        onClick={language.translateQuestion}
        disabled={language.isTranslating}
        className={`${baseClasses} ${className}`}
        style={style}
        title="Přeložit otázku"
      >
        {language.isTranslating ? (
          mode === 'mobile' ? (
            <RotateCcw size={14} className="animate-spin" />
          ) : (
            <>
              <RotateCcw size={12} className="animate-spin" />
              Přeložit
            </>
          )
        ) : mode === 'mobile' ? (
          <span className="text-xs font-bold">Přeložit</span>
        ) : (
          <>
            <Languages size={12} />
            Přeložit
          </>
        )}
      </button>
    );
  }

  // English question with translation - show Toggle button
  if (isEnglish && hasCzechTranslation) {
    const baseClasses = mode === 'mobile'
      ? 'px-3 py-2 border border-[var(--line)] rounded-xl hover:bg-[var(--ink)] hover:text-[var(--ink-text)] transition-colors flex-shrink-0'
      : 'md:flex px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-all items-center gap-2 border-[var(--line)] opacity-60 hover:opacity-100';
    
    return (
      <button
        onClick={language.toggleTranslation}
        className={`${baseClasses} ${className}`}
        style={style}
        title={language.showTranslation ? "Zobrazit originál" : "Zobrazit překlad"}
      >
        {mode === 'mobile' ? (
          <span className="text-xs font-bold">
            {language.showTranslation ? "EN" : "CZ"}
          </span>
        ) : (
          <>
            <Languages size={12} />
            {language.showTranslation ? "EN" : "CZ"}
          </>
        )}
      </button>
    );
  }

  // Czech question - no button needed
  return null;
}
