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
  deepseekApiKey: string,
  setUserApiKey: (key: string) => void,
  setClaudeApiKey: (key: string) => void,
  setDeepseekApiKey: (key: string) => void,
  setAiProvider: (provider: AIProvider) => void,
  setQuestions: (updater: (prev: Question[]) => Question[]) => void,
  proxyUrl?: string,
  idToken?: string
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

    const currentApiKey = aiProvider === 'gemini' ? userApiKey : aiProvider === 'claude' ? claudeApiKey : (deepseekApiKey || undefined);
    if (!currentApiKey && !(aiProvider === 'deepseek' && idToken)) {
      const providerName = aiProvider === 'gemini' ? 'Gemini' : aiProvider === 'claude' ? 'Claude' : 'DeepSeek';
      const key = prompt(TRANSLATION_PROMPT_API_KEY(providerName));
      if (key) {
        if (key.startsWith('AIza')) {
          setUserApiKey(key);
          if (aiProvider !== 'gemini') { setAiProvider('gemini'); }
        } else if (key.startsWith('sk-ant-')) {
          setClaudeApiKey(key);
          if (aiProvider !== 'claude') { setAiProvider('claude'); }
        } else if (key.startsWith('sk-')) {
          setDeepseekApiKey(key);
          if (aiProvider !== 'deepseek') { setAiProvider('deepseek'); }
        }
      } else {
        return;
      }
    }

    setIsTranslating(true);
    try {
      const translation = await translateQuestion(
        q,
        currentApiKey,
        aiModel,
        aiProvider,
        undefined,
        proxyUrl,
        idToken
      );
      setQuestions(prev => prev.map(item => 
        item.id === q.id ? { ...item, ...translation } : item
      ));
      setShowTranslation(true); // Auto-show translation after successful translation
    } catch (error: any) {
      console.error('Translation failed:', error);
      if (error.message === 'API_KEY_MISSING') {
        const providerName = aiProvider === 'gemini' ? 'Gemini' : aiProvider === 'claude' ? 'Claude' : 'DeepSeek';
        alert(TRANSLATION_ERROR_MESSAGES.API_KEY_MISSING(providerName));
      } else if (error.message?.includes('quota') || error.message?.includes('limit')) {
        const providerName = aiProvider === 'gemini' ? 'Gemini' : aiProvider === 'claude' ? 'Claude' : 'DeepSeek';
        alert(TRANSLATION_ERROR_MESSAGES.QUOTA_EXCEEDED(providerName));
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
    deepseekApiKey,
    setUserApiKey, 
    setClaudeApiKey,
    setDeepseekApiKey,
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
