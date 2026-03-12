import { useState, useCallback } from 'react';
import { Question } from '../../types';
import { translateQuestion } from '../../services/aiService';
import { AIProvider } from '../../services/aiService';
import { LanguageState, LanguageActions, LanguageContextType, LanguageMode, Language } from './types';
import { TRANSLATION_ERROR_MESSAGES, TRANSLATION_PROMPT_API_KEY } from './constants';
import { isEnglishQuestion, getDisplayText, hasTranslation } from './utils';

export function useLanguage(
  questions: Question[],
  currentQuestionIndex: number,
  aiProvider: AIProvider,
  aiModel: string,
  userApiKey: string,
  claudeApiKey: string,
  setUserApiKey: (key: string) => void,
  setClaudeApiKey: (key: string) => void,
  setAiProvider: (provider: AIProvider) => void,
  setQuestions: (updater: (prev: Question[]) => Question[]) => void
): LanguageContextType {
  
  // View mode state
  const [showTranslation, setShowTranslation] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  
  // Generate mode state  
  const [generateLanguage, setGenerateLanguage] = useState<Language>('EN');
  
  // Current mode (can be extended in future)
  const [mode] = useState<LanguageMode>('view');

  // Get current question
  const currentQuestion = questions[currentQuestionIndex];

  // Translate current question
  const translateQuestionCallback = useCallback(async () => {
    const q = currentQuestion;
    if (!q || !isEnglishQuestion(q)) return;

    const currentApiKey = aiProvider === 'gemini' ? userApiKey : claudeApiKey;
    if (!currentApiKey) {
      const key = prompt(TRANSLATION_PROMPT_API_KEY(aiProvider === 'gemini' ? 'Gemini' : 'Claude'));
      if (key) {
        // Inteligentní detekce typu klíče
        if (key.startsWith('AIza')) {
          // Gemini klíč
          setUserApiKey(key);
          if (aiProvider !== 'gemini') {
            setAiProvider('gemini');
            console.log('🔄 Automaticky přepnuto na Gemini provider');
          }
        } else if (key.startsWith('sk-ant-')) {
          // Claude klíč
          setClaudeApiKey(key);
          if (aiProvider !== 'claude') {
            setAiProvider('claude');
            console.log('🔄 Automaticky přepnuto na Claude provider');
          }
        }
      } else {
        return;
      }
    }

    setIsTranslating(true);
    try {
      const translation = await translateQuestion(
        q, 
        aiProvider === 'gemini' ? userApiKey : claudeApiKey, 
        aiModel, 
        aiProvider
      );
      setQuestions(prev => prev.map(item => 
        item.id === q.id ? { ...item, ...translation } : item
      ));
      setShowTranslation(true); // Auto-show translation after successful translation
    } catch (error: any) {
      console.error('Translation failed:', error);
      if (error.message === 'API_KEY_MISSING') {
        alert(TRANSLATION_ERROR_MESSAGES.API_KEY_MISSING(aiProvider === 'gemini' ? 'Gemini' : 'Claude'));
      } else if (error.message?.includes('quota') || error.message?.includes('limit')) {
        alert(TRANSLATION_ERROR_MESSAGES.QUOTA_EXCEEDED(aiProvider === 'gemini' ? 'Gemini' : 'Claude'));
      } else {
        alert(TRANSLATION_ERROR_MESSAGES.TRANSLATION_FAILED);
      }
    } finally {
      setIsTranslating(false);
    }
  }, [
    currentQuestion, 
    aiProvider, 
    aiModel, 
    userApiKey, 
    claudeApiKey, 
    setUserApiKey, 
    setClaudeApiKey, 
    setAiProvider,
    setQuestions
  ]);

  // Toggle translation display
  const toggleTranslation = useCallback(() => {
    setShowTranslation(!showTranslation);
  }, [showTranslation]);

  // Reset translation state
  const resetTranslation = useCallback(() => {
    setIsTranslating(false);
    setShowTranslation(false);
  }, []);

  // Wrapper for display text
  const getDisplayTextCallback = useCallback((
    question: Question, 
    field: 'text' | 'option_a' | 'option_b' | 'option_c' | 'option_d' | 'explanation'
  ): string => {
    return getDisplayText(question, field, showTranslation);
  }, [showTranslation]);

  return {
    // State
    showTranslation,
    isTranslating,
    generateLanguage,
    mode,
    
    // Actions
    translateQuestion: translateQuestionCallback,
    toggleTranslation,
    resetTranslation,
    setGenerateLanguage,
    setIsTranslating,
    
    // Utilities
    isEnglishQuestion: (question: Question | undefined) => isEnglishQuestion(question),
    getDisplayText: getDisplayTextCallback,
    hasTranslation: (question: Question) => hasTranslation(question)
  };
}
