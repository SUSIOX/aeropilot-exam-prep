import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  BookOpen, 
  GraduationCap, 
  BarChart3, 
  Moon, 
  Sun, 
  ChevronLeft,
  ChevronRight, 
  CheckCircle2, 
  XCircle, 
  Flag, 
  Clock, 
  ArrowLeft,
  RotateCcw,
  Trophy,
  Settings,
  Upload,
  ShieldCheck,
  User,
  AlertCircle,
  Sparkles,
  Bot,
  HelpCircle,
  Cpu,
  Terminal,
  Binary,
  Languages,
  FileJson
} from 'lucide-react';
import { Subject, Question, Stats, ViewMode, DrillSettings } from './types';
import { LearningEngine } from './lib/LearningEngine';
import { mockLOs, generateBatchQuestions, getDetailedExplanation, getDetailedHumanExplanation, translateQuestion, EasaLO, SYLLABUS_SCOPE, verifyApiKey, AIProvider } from './services/aiService';

export default function App() {
  const [view, setView] = useState<ViewMode>('dashboard');
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [answered, setAnswered] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [language, setLanguage] = useState<'EN' | 'CZ'>('EN');
  const [isTranslating, setIsTranslating] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [aiDetectedObjective, setAiDetectedObjective] = useState<string | null>(null);
  const [detailedExplanation, setDetailedExplanation] = useState<string | null>(null);
  const [isGeneratingDetailedExplanation, setIsGeneratingDetailedExplanation] = useState(false);
  const [isGeneratingAiExplanation, setIsGeneratingAiExplanation] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [usingFirebaseCache, setUsingFirebaseCache] = useState(false);
  const [examResults, setExamResults] = useState<{ score: number; total: number } | null>(null);
  const [timer, setTimer] = useState(0);

  // Drill Settings
  const [drillSettings, setDrillSettings] = useState<DrillSettings>(() => {
    const saved = localStorage.getItem('drillSettings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Migration: Ensure we use 'ai' instead of 'easa' and have valid filters
        if (parsed.sourceFilters) {
          if (parsed.sourceFilters.includes('easa') && !parsed.sourceFilters.includes('ai')) {
            parsed.sourceFilters = parsed.sourceFilters.map((f: string) => f === 'easa' ? 'ai' : f);
          }
          if (parsed.sourceFilters.length === 0) {
            parsed.sourceFilters = ['user', 'ai'];
          }
        } else {
          parsed.sourceFilters = ['user', 'ai'];
        }
        return parsed;
      } catch (e) {
        console.error("Failed to parse drillSettings", e);
      }
    }
    return {
      sorting: 'default',
      immediateFeedback: true,
      showExplanationOnDemand: true,
      sourceFilters: ['user', 'ai']
    };
  });

  // AI Generation states
  const [selectedLO, setSelectedLO] = useState<EasaLO>(mockLOs[0]);
  const [batchResults, setBatchResults] = useState<{loId: string, questions: Partial<Question>[]}[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(true); // Always true for static
  const [batchSize, setBatchSize] = useState<number>(5);
  const [questionsPerLO, setQuestionsPerLO] = useState<number>(2);
  const [genLanguage, setGenLanguage] = useState<'EN' | 'CZ'>('EN');
  const [coveredLOs, setCoveredLOs] = useState<Set<string>>(new Set());

  // Import states
  const [importSubjectId, setImportSubjectId] = useState<number | null>(null);
  const [importJson, setImportJson] = useState('');
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [clearExisting, setClearExisting] = useState(false);
  const [userApiKey, setUserApiKey] = useState(() => {
    const saved = localStorage.getItem('userApiKey');
    return saved || '';
  });
  const [claudeApiKey, setClaudeApiKey] = useState(() => {
    const saved = localStorage.getItem('claudeApiKey');
    return saved || '';
  });
  const [aiProvider, setAiProvider] = useState<AIProvider>(() => {
    const saved = localStorage.getItem('aiProvider');
    return (saved === 'claude' ? 'claude' : 'gemini');
  });
  const [aiModel, setAiModel] = useState(() => {
    return localStorage.getItem('aiModel') || 'gemini-3-flash-preview';
  });
  const [isVerifyingKey, setIsVerifyingKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth State
  const [user, setUser] = useState<{id: number, username: string} | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ username: '', password: '' });
  const [authError, setAuthError] = useState<string | null>(null);

  // Engine instance (we use it for logic, but keep state in React for reactivity)
  const [examAnswers, setExamAnswers] = useState<Record<number, string>>({});

  // Authenticated Fetch Helper
  const authFetch = async (url: string, options: RequestInit = {}) => {
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    };
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401 || res.status === 403) {
      setToken(null);
      localStorage.removeItem('token');
      setUser(null);
      throw new Error('Unauthorized');
    }
    return res;
  };

  useEffect(() => {
    if (token) {
      fetchMe();
    }
  }, [token]);

  const fetchMe = async () => {
    try {
      const res = await authFetch('/api/auth/me');
      const data = await res.json();
      if (data.user) setUser(data.user);
    } catch (err) {
      setToken(null);
      localStorage.removeItem('token');
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      setToken(data.token);
      localStorage.setItem('token', data.token);
      setUser(data.user);
      setAuthForm({ username: '', password: '' });
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('token');
    setUser(null);
    setView('dashboard');
  };

  useEffect(() => {
    // Use static data loading for GitHub Pages deployment
    loadStaticSubjects();
    loadStaticStats();
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('userApiKey', userApiKey);
  }, [userApiKey]);

  useEffect(() => {
    localStorage.setItem('claudeApiKey', claudeApiKey);
  }, [claudeApiKey]);

  useEffect(() => {
    localStorage.setItem('aiProvider', aiProvider);
  }, [aiProvider]);

  useEffect(() => {
    localStorage.setItem('aiModel', aiModel);
  }, [aiModel]);

  useEffect(() => {
    // Reset model when provider changes
    if (aiProvider === 'gemini' && !aiModel.startsWith('gemini')) {
      setAiModel('gemini-3-flash-preview');
    } else if (aiProvider === 'claude' && !aiModel.startsWith('claude')) {
      setAiModel('claude-sonnet-4-6'); // Use newest Sonnet 4.6 as default
    }
  }, [aiProvider, aiModel]);

  // Sync provider with saved model on startup
  useEffect(() => {
    const savedModel = localStorage.getItem('aiModel');
    if (savedModel) {
      if (savedModel.startsWith('claude') && aiProvider !== 'claude') {
        setAiProvider('claude');
      } else if (savedModel.startsWith('gemini') && aiProvider !== 'gemini') {
        setAiProvider('gemini');
      }
    }
  }, []); // Run only on mount

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleVerifyKey = async () => {
    const currentApiKey = aiProvider === 'gemini' ? userApiKey : claudeApiKey;
    if (!currentApiKey) return;
    setIsVerifyingKey(true);
    setKeyStatus('idle');
    try {
      const isValid = await verifyApiKey(currentApiKey, aiProvider);
      setKeyStatus(isValid ? 'valid' : 'invalid');
      if (isValid) {
        alert(`API klíč pro ${aiProvider === 'gemini' ? 'Gemini' : 'Claude'} je platný a byl uložen.`);
      } else {
        alert(`Vložený ${aiProvider === 'gemini' ? 'Gemini' : 'Claude'} API klíč není platný.`);
      }
    } catch (err: any) {
      console.error(err);
      setKeyStatus('invalid');
      alert('Chyba při ověřování API klíče.');
    } finally {
      setIsVerifyingKey(false);
    }
  };

  useEffect(() => {
    localStorage.setItem('drillSettings', JSON.stringify(drillSettings));
  }, [drillSettings]);

  // Static data loading for GitHub Pages deployment
  const loadStaticSubjects = () => {
    const staticSubjects: Subject[] = [
      { id: 1, name: "Air Law", description: "Pravidla letectví", question_count: 0, success_rate: 0.75 },
      { id: 2, name: "Human Performance", description: "Lidská výkonnost", question_count: 0, success_rate: 0.75 },
      { id: 3, name: "Meteorology", description: "Meteorologie", question_count: 0, success_rate: 0.75 },
      { id: 4, name: "Communications", description: "Komunikace", question_count: 0, success_rate: 0.75 },
      { id: 5, name: "Principles of Flight", description: "Principy letu", question_count: 0, success_rate: 0.75 },
      { id: 6, name: "Operational Procedures", description: "Provozní postupy", question_count: 0, success_rate: 0.75 },
      { id: 7, name: "Flight Performance", description: "Výkony letadla", question_count: 0, success_rate: 0.75 },
      { id: 8, name: "Aircraft General", description: "Všeobecně o letadlech", question_count: 0, success_rate: 0.75 },
      { id: 9, name: "Navigation", description: "Navigace", question_count: 0, success_rate: 0.75 }
    ];
    setSubjects(staticSubjects);
    if (staticSubjects.length > 0 && !importSubjectId) {
      setImportSubjectId(staticSubjects[0].id);
    }
  };

  const loadStaticQuestions = async (subjectId: number) => {
    try {
      const response = await fetch(`/subject_${subjectId}.json`);
      if (!response.ok) throw new Error('Failed to load questions');
      const jsonQuestions = await response.json();
      
      // Transform JSON structure to Question interface
      const questions: Question[] = jsonQuestions.map((q: any) => ({
        id: q.id,
        subject_id: subjectId,
        text: q.question,
        text_cz: q.question_cz || undefined,
        option_a: q.answers[0],
        option_a_cz: q.answers_cz?.[0] || undefined,
        option_b: q.answers[1],
        option_b_cz: q.answers_cz?.[1] || undefined,
        option_c: q.answers[2],
        option_c_cz: q.answers_cz?.[2] || undefined,
        option_d: q.answers[3],
        option_d_cz: q.answers_cz?.[3] || undefined,
        correct_option: ['A', 'B', 'C', 'D'][q.correct],
        explanation: q.explanation || undefined,
        explanation_cz: q.explanation_cz || undefined,
        lo_id: q.lo_id || undefined,
        is_ai: 1, // Mark as AI questions
        source: 'ai', // Mark as AI questions to match filter
        difficulty: q.difficulty || 1,
        ai_explanation: undefined,
        ai_explanation_provider: undefined,
        ai_explanation_model: undefined,
        ai_detailed_explanation: undefined,
        is_flagged: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));
      
      return questions;
    } catch (error) {
      console.error('Error loading static questions:', error);
      return [];
    }
  };

  const loadStaticStats = () => {
    // Mock stats for static deployment
    setStats({
      overallSuccess: 0.75,
      userQuestions: 0,
      aiQuestions: 1000,
      practicedQuestions: 0,
      totalQuestions: 1000
    });
  };

  const fetchSubjects = async () => {
    try {
      const res = await authFetch('/api/subjects');
      const data = await res.json();
      setSubjects(data);
      if (data.length > 0 && !importSubjectId) {
        setImportSubjectId(data[0].id);
      }
    } catch (err) {}
  };

  const fetchStats = async () => {
    try {
      const res = await authFetch('/api/stats');
      const data = await res.json();
      setStats(data);
    } catch (err) {}
  };

  const toggleSourceFilter = (source: 'user' | 'ai') => {
    if (source === 'ai') {
      const currentApiKey = aiProvider === 'gemini' ? userApiKey : claudeApiKey;
      if (!currentApiKey) {
        const key = prompt(`Pro použití AI funkcí (EASA databáze, vysvětlení, překlady) je doporučeno vložit vlastní ${aiProvider === 'gemini' ? 'Gemini' : 'Claude'} API klíč. Chcete jej vložit nyní?`);
        if (key) {
          if (aiProvider === 'gemini') {
            setUserApiKey(key);
          } else {
            setClaudeApiKey(key);
          }
        }
      }
    }

    setDrillSettings(prev => {
      const filters = [...prev.sourceFilters];
      const index = filters.indexOf(source);
      
      if (index > -1) {
        // Don't allow removing the last filter
        if (filters.length > 1) {
          filters.splice(index, 1);
        } else {
          // If it's the last one, toggle the other one on
          return { ...prev, sourceFilters: source === 'user' ? ['ai'] : ['user'] };
        }
      } else {
        filters.push(source);
      }
      
      return { ...prev, sourceFilters: filters };
    });
  };

  const startDrill = async (subject: Subject) => {
    try {
      setSelectedSubject(subject);
      // Use static questions loading for GitHub Pages deployment
      const data: Question[] = await loadStaticQuestions(subject.id);
      
      let processedQuestions = data.filter(q => {
        const isAi = Number(q.is_ai) === 1 || q.source === 'ai' || q.source === 'easa';
        if (isAi) return drillSettings.sourceFilters.includes('ai');
        return drillSettings.sourceFilters.includes('user');
      });
      
      if (drillSettings.sorting === 'random') {
        processedQuestions = LearningEngine.shuffle(processedQuestions);
      }

      if (processedQuestions.length === 0) {
        alert('Pro tento předmět a vybrané filtry nebyly nalezeny žádné otázky.');
        return;
      }

      setQuestions(processedQuestions);
      setCurrentQuestionIndex(0);
      setAnswered(null);
      setShowExplanation(false);
      setView('drill');
    } catch (err) {
      console.error("Failed to start drill:", err);
      alert('Nepodařilo se načíst otázky.');
    }
  };

  const startMix = async () => {
    try {
      setSelectedSubject({ id: 0, name: 'MIX - Náhodné otázky', question_count: 100, success_rate: 0 });
      const res = await authFetch('/api/questions/mix');
      const data: Question[] = await res.json();
      
      if (!Array.isArray(data)) {
        console.error("Server did not return an array for MIX:", data);
        alert('Chyba serveru: MIX nevrátil očekávaná data.');
        return;
      }

      let processedQuestions = data.filter(q => {
        // Handle both number and string for is_ai, and check source
        const isAi = Number(q.is_ai) === 1 || q.source === 'ai' || q.source === 'easa';
        if (isAi) return drillSettings.sourceFilters.includes('ai');
        return drillSettings.sourceFilters.includes('user');
      });

      if (processedQuestions.length === 0) {
        if (data.length > 0) {
          alert(`Všech ${data.length} načtených otázek bylo odfiltrováno. Zkontrolujte prosím nastavení zdrojů (Uživatel / AI).`);
        } else {
          alert('V databázi nebyly nalezeny žádné otázky pro MIX.');
        }
        return;
      }
      
      setQuestions(processedQuestions);
      setCurrentQuestionIndex(0);
      setAnswered(null);
      setShowExplanation(false);
      setView('drill');
    } catch (err) {
      console.error("Failed to start mix:", err);
      alert('Nepodařilo se načíst otázky pro MIX. Zkuste se prosím znovu přihlásit.');
    }
  };

  const startErrors = async () => {
    try {
      setSelectedSubject({ id: -1, name: 'Procvičit chyby', question_count: 100, success_rate: 0 });
      const res = await authFetch('/api/questions/errors');
      const data: Question[] = await res.json();
      
      if (data.length === 0) {
        alert('Nemáte žádné chyby k procvičení.');
        return;
      }

      setQuestions(data);
      setCurrentQuestionIndex(0);
      setAnswered(null);
      setShowExplanation(false);
      setView('drill');
    } catch (err) {
      console.error("Failed to start errors:", err);
      alert('Nepodařilo se načíst chyby.');
    }
  };

  const startExam = async () => {
    try {
      const allQuestions: Question[] = [];
      for (const s of subjects) {
        const res = await authFetch(`/api/questions/${s.id}`);
        const data: Question[] = await res.json();
        allQuestions.push(...data);
      }
      
      const filteredQuestions = allQuestions.filter(q => {
        const isAi = Number(q.is_ai) === 1 || q.source === 'ai' || q.source === 'easa';
        if (isAi) return drillSettings.sourceFilters.includes('ai');
        return drillSettings.sourceFilters.includes('user');
      });
      
      if (filteredQuestions.length < 20) {
        alert(`Nedostatek otázek pro simulaci zkoušky (nalezeno ${filteredQuestions.length}, potřeba 20). Vygenerujte nebo importujte více otázek.`);
        return;
      }

      // Use LearningEngine to generate the exam set
      const examSet = LearningEngine.generateExamSet(filteredQuestions, 20);
      
      setQuestions(examSet);
      setCurrentQuestionIndex(0);
      setAnswered(null);
      setExamAnswers({});
      setExamResults(null);
      setTimer(1800);
      setView('exam');
    } catch (err) {
      console.error("Failed to start exam:", err);
      alert('Nepodařilo se spustit simulaci zkoušky.');
    }
  };

  const handleAnswer = async (option: string) => {
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;

    if (view === 'drill') {
      if (answered) return;
      
      const isCorrect = option === currentQuestion.correct_option;
      setAnswered(option);
      
      await authFetch('/api/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: currentQuestion.id, isCorrect })
      });
      fetchStats();
      fetchSubjects();
    } else {
      // Exam mode - track answers
      setExamAnswers(prev => ({ ...prev, [currentQuestion.id]: option }));
      setAnswered(option);
    }
  };

  const jumpToRandomQuestion = () => {
    if (questions.length <= 1) return;
    let randomIndex = currentQuestionIndex;
    while (randomIndex === currentQuestionIndex) {
      randomIndex = Math.floor(Math.random() * questions.length);
    }
    setCurrentQuestionIndex(randomIndex);
    setAnswered(null);
    setShowExplanation(false);
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      const nextIdx = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIdx);
      
      // Check if already answered in exam mode
      if (view === 'exam') {
        const nextQ = questions[nextIdx];
        setAnswered(examAnswers[nextQ.id] || null);
      } else {
        setAnswered(null);
      }
      
      setShowExplanation(false);
      setAiExplanation(null);
      setAiDetectedObjective(null);
      setDetailedExplanation(null);
      setUsingFirebaseCache(false);
    } else if (view === 'exam') {
      finishExam();
    } else {
      setView('dashboard');
    }
  };

  // Auto-translate if language is CZ
  useEffect(() => {
    const q = questions[currentQuestionIndex];
    if (language === 'CZ' && q && !q.text_cz && !isTranslating) {
      const translate = async () => {
        setIsTranslating(true);
        try {
          const translation = await translateQuestion(q, aiProvider === 'gemini' ? userApiKey : claudeApiKey, aiModel, aiProvider);
          setQuestions(prev => prev.map(item => item.id === q.id ? { ...item, ...translation } : item));
        } catch (err) {
          console.error(err);
        } finally {
          setIsTranslating(false);
        }
      };
      translate();
    }
  }, [currentQuestionIndex, language, questions]);
  const handleToggleLanguage = async () => {
    if (language === 'EN') {
      const q = questions[currentQuestionIndex];
      if (!q.text_cz) {
        const currentApiKey = aiProvider === 'gemini' ? userApiKey : claudeApiKey;
      if (!currentApiKey) {
        const key = prompt(`Pro AI funkce je vyžadován vlastní ${aiProvider === 'gemini' ? 'Gemini' : 'Claude'} API klíč (${aiProvider === 'gemini' ? 'zdarma na ai.google.dev' : 'na console.anthropic.com'}). Vložte jej prosím nyní:`);
        if (key) {
          if (aiProvider === 'gemini') {
            setUserApiKey(key);
            localStorage.setItem('userApiKey', key);
          } else {
            setClaudeApiKey(key);
            localStorage.setItem('claudeApiKey', key);
          }
        } else {
          return;
        }
      }
        setIsTranslating(true);
        try {
          const translation = await translateQuestion(q, aiProvider === 'gemini' ? userApiKey : claudeApiKey, aiModel, aiProvider);
          setQuestions(prev => prev.map(item => item.id === q.id ? { ...item, ...translation } : item));
        } catch (error: any) {
          console.error("Translation failed:", error);
          if (error?.message === 'API_KEY_MISSING') {
            alert('Chybí API klíč. Vložte jej prosím v nastavení.');
          } else if (error?.message === 'API_KEY_INVALID') {
            alert('Vložený API klíč není platný.');
          } else if (error?.message?.toLowerCase().includes('429') || error?.message?.toLowerCase().includes('resource_exhausted') || error?.message?.toLowerCase().includes('rate exceeded')) {
            alert('Limit požadavků (Rate Limit) byl vyčerpán. Prosím počkejte minutu.');
          } else {
            alert('Překlad se nezdařilo vygenerovat.');
          }
        } finally {
          setIsTranslating(false);
        }
      }
      setLanguage('CZ');
    } else {
      setLanguage('EN');
    }
  };

  const handleFetchAiExplanation = async () => {
    const q = questions[currentQuestionIndex];
    if (!q) return;

    const currentApiKey = aiProvider === 'gemini' ? userApiKey : claudeApiKey;
    if (!currentApiKey) {
      const key = prompt(`Pro AI funkce je vyžadován vlastní ${aiProvider === 'gemini' ? 'Gemini' : 'Claude'} API klíč (${aiProvider === 'gemini' ? 'zdarma na ai.google.dev' : 'na console.anthropic.com'}). Vložte jej prosím nyní:`);
      if (key) {
        if (aiProvider === 'gemini') {
          setUserApiKey(key);
          localStorage.setItem('userApiKey', key);
        } else {
          setClaudeApiKey(key);
          localStorage.setItem('claudeApiKey', key);
        }
      } else {
        return;
      }
    }
    
    setIsGeneratingAiExplanation(true);
    try {
      console.log('Generating AI explanation with:', {
        provider: aiProvider,
        model: aiModel,
        hasKey: !!(aiProvider === 'gemini' ? userApiKey : claudeApiKey)
      });
      
      const lo = mockLOs.find(l => l.id === q.lo_id);
      
      // Check if we already have AI explanation in database (localStorage)
      if (q.ai_explanation && q.ai_explanation_provider === aiProvider) {
        console.log('Using cached AI explanation from database');
        setAiExplanation(q.ai_explanation);
        setDetailedExplanation(q.ai_detailed_explanation || null);
        setUsingFirebaseCache(false);
        setShowExplanation(true);
        return;
      }
      
      const result = await getDetailedExplanation(q, lo, aiProvider === 'gemini' ? userApiKey : claudeApiKey, aiModel, aiProvider);
      
      console.log('Explanation result:', result);
      
      // Save objective to database if detected
      if (result.objective && (!q.lo_id || q.source === 'user')) {
        try {
          await authFetch('/api/questions/objective', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              questionId: q.id,
              objective: result.objective
            })
          });
          console.log('Objective saved to database:', result.objective);
          // Update the question in local state
          setQuestions(prev => prev.map(question => 
            question.id === q.id ? { ...question, lo_id: result.objective } : question
          ));
        } catch (error) {
          console.error('Failed to save objective:', error);
        }
        // Also store for immediate display
        setAiDetectedObjective(result.objective);
      }
      
      setAiExplanation(result.explanation);
      setShowExplanation(true);
      setUsingFirebaseCache(false);
      
      // Save AI explanation to localStorage for reuse
      try {
        await authFetch('/api/questions/explanation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            questionId: q.id,
            explanation: result.explanation,
            detailedExplanation: null,
            provider: aiProvider,
            model: aiModel
          })
        });
        console.log('AI explanation saved to database');
        // Update local state to reflect saved data
        setQuestions(prev => prev.map(question => 
          question.id === q.id ? { 
            ...question, 
            ai_explanation: result.explanation,
            ai_explanation_provider: aiProvider,
            ai_explanation_model: aiModel
          } : question
        ));
      } catch (error) {
        console.error('Failed to save AI explanation:', error);
      }
    } catch (error: any) {
      console.error("Explanation failed:", error);
      console.error("Error details:", {
        message: error?.message,
        status: error?.status,
        stack: error?.stack
      });
      if (error?.message === 'API_KEY_MISSING') {
        alert('Chybí API klíč. Vložte jej prosím v nastavení.');
      } else if (error?.message === 'API_KEY_INVALID') {
        alert('Vložený API klíč není platný.');
      } else if (error?.message?.toLowerCase().includes('429') || error?.message?.toLowerCase().includes('resource_exhausted') || error?.message?.toLowerCase().includes('rate exceeded')) {
        alert('Limit požadavků (Rate Limit) byl vyčerpán. Prosím počkejte minutu.');
      } else {
        alert(`Vysvětlení se nepodařilo vygenerovat. Chyba: ${error?.message || 'Neznámá chyba'}`);
      }
    } finally {
      setIsGeneratingAiExplanation(false);
    }
  };

  const handleFetchDetailedExplanation = async () => {
    const q = questions[currentQuestionIndex];
    if (!q) return;

    const currentApiKey = aiProvider === 'gemini' ? userApiKey : claudeApiKey;
    if (!currentApiKey) {
      const key = prompt(`Pro AI funkce je vyžadován vlastní ${aiProvider === 'gemini' ? 'Gemini' : 'Claude'} API klíč (${aiProvider === 'gemini' ? 'zdarma na ai.google.dev' : 'na console.anthropic.com'}). Vložte jej prosím nyní:`);
      if (key) {
        if (aiProvider === 'gemini') {
          setUserApiKey(key);
          localStorage.setItem('userApiKey', key);
        } else {
          setClaudeApiKey(key);
          localStorage.setItem('claudeApiKey', key);
        }
      } else {
        return;
      }
    }
    
    setIsGeneratingDetailedExplanation(true);
    try {
      console.log('Generating detailed AI explanation with:', {
        provider: aiProvider,
        model: aiModel,
        hasKey: !!currentApiKey
      });
      
      const lo = mockLOs.find(l => l.id === q.lo_id);
      
      // Check if we already have detailed explanation in database
      if (q.ai_detailed_explanation) {
        console.log('Using cached detailed explanation from database');
        setDetailedExplanation(q.ai_detailed_explanation);
        setUsingFirebaseCache(false);
        return;
      }
      
      const detailedExplanationResult = await getDetailedHumanExplanation(q, lo, currentApiKey, aiModel, aiProvider);
      
      console.log('Detailed explanation result:', detailedExplanationResult);
      setDetailedExplanation(detailedExplanationResult);
      setUsingFirebaseCache(false);
      
      // Save detailed explanation to database
      try {
        await authFetch('/api/questions/explanation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            questionId: q.id,
            explanation: q.ai_explanation || aiExplanation || '',
            detailedExplanation: detailedExplanationResult,
            provider: aiProvider,
            model: aiModel
          })
        });
        console.log('Detailed explanation saved to database');
        // Update local state
        setQuestions(prev => prev.map(question => 
          question.id === q.id ? { 
            ...question, 
            ai_detailed_explanation: detailedExplanationResult
          } : question
        ));
      } catch (error) {
        console.error('Failed to save detailed explanation:', error);
      }
    } catch (error: any) {
      console.error("Detailed explanation failed:", error);
      console.error("Error details:", {
        message: error?.message,
        status: error?.status,
        stack: error?.stack
      });
      if (error?.message === 'API_KEY_MISSING') {
        alert('Chybí API klíč. Vložte jej prosím v nastavení.');
      } else if (error?.message === 'API_KEY_INVALID') {
        alert('Vložený API klíč není platný.');
      } else if (error?.message?.toLowerCase().includes('429') || error?.message?.toLowerCase().includes('resource_exhausted') || error?.message?.toLowerCase().includes('rate exceeded')) {
        alert('Limit požadavků (Rate Limit) byl vyčerpán. Prosím počkejte minutu.');
      } else {
        alert(`Podrobné vysvětlení se nepodařilo vygenerovat. Chyba: ${error?.message || 'Neznámá chyba'}`);
      }
    } finally {
      setIsGeneratingDetailedExplanation(false);
    }
  };

  const finishExam = () => {
    // Use the engine to calculate results
    const engine = new LearningEngine(questions);
    engine.setAnswers(examAnswers);
    
    const results = engine.getResults();
    setExamResults({ score: results.score, total: results.total });
  };

  const toggleFlag = async (questionId: number, currentFlag: boolean) => {
    await authFetch('/api/flag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId, isFlagged: !currentFlag })
    });
    setQuestions(prev => prev.map(q => q.id === questionId ? { ...q, is_flagged: !currentFlag } : q));
  };

  useEffect(() => {
    if (view === 'ai' && importSubjectId && token) {
      fetchCoverage(importSubjectId);
    }
  }, [view, importSubjectId, token]);

  const fetchCoverage = async (subjectId: number) => {
    try {
      const res = await authFetch(`/api/questions/${subjectId}?t=${Date.now()}`);
      if (!res.ok) throw new Error('Failed to fetch questions');
      const data: Question[] = await res.json();
      const covered = new Set(data.map(q => q.lo_id).filter(Boolean).map(id => id?.trim()) as string[]);
      console.log(`Fetched coverage for subject ${subjectId}: ${covered.size} LOs`);
      setCoveredLOs(covered);
    } catch (error) {
      console.error("Error fetching coverage:", error);
    }
  };

  const handleGenerateQuestions = async () => {
    const currentApiKey = aiProvider === 'gemini' ? userApiKey : claudeApiKey;
    if (!currentApiKey) {
      const key = prompt(`Pro hromadné generování otázek pomocí AI je vyžadován vlastní ${aiProvider === 'gemini' ? 'Gemini' : 'Claude'} API klíč (${aiProvider === 'gemini' ? 'zdarma na ai.google.dev' : 'na console.anthropic.com'}). Vložte jej prosím nyní:`);
      if (key) {
        if (aiProvider === 'gemini') {
          setUserApiKey(key);
          localStorage.setItem('userApiKey', key);
        } else {
          setClaudeApiKey(key);
          localStorage.setItem('claudeApiKey', key);
        }
      } else {
        return;
      }
    }

    setIsGenerating(true);
    setBatchResults([]);
    try {
      // Find LOs for the current subject
      const allSubjectLOs = mockLOs.filter(lo => lo.subject_id === importSubjectId);
      const missingLOs = allSubjectLOs.filter(lo => !coveredLOs.has(lo.id));
      
      // Prioritize missing LOs, then fill with already covered ones to reach batchSize
      let targets = missingLOs.slice(0, batchSize);
      if (targets.length < batchSize) {
        const alreadyCovered = allSubjectLOs.filter(lo => coveredLOs.has(lo.id));
        const additionalNeeded = batchSize - targets.length;
        targets = [...targets, ...alreadyCovered.slice(0, additionalNeeded)];
      }

      // If still empty (no LOs for this subject at all), we can't proceed
      if (targets.length === 0) {
        alert('Pro tento předmět nejsou v databázi osnovy žádná témata.');
        setIsGenerating(false);
        return;
      }
      
      // Process in chunks of 5 LOs to avoid hitting output token limits
      const CHUNK_SIZE = 5;
      const allResults: {loId: string, questions: Partial<Question>[]}[] = [];
      
      for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
        const chunk = targets.slice(i, i + CHUNK_SIZE);
        const chunkResults = await generateBatchQuestions(chunk, questionsPerLO, genLanguage, aiProvider === 'gemini' ? userApiKey : claudeApiKey, aiModel, aiProvider);
        allResults.push(...chunkResults);
        setBatchResults([...allResults]); // Update UI incrementally
      }
      
      setBatchResults(allResults);
    } catch (error: any) {
      console.error("Generation failed:", error);
      if (error?.message === 'API_KEY_MISSING') {
        alert('Chybí API klíč. Vložte jej prosím v nastavení.');
      } else if (error?.message === 'API_KEY_INVALID') {
        alert('Vložený API klíč není platný.');
      } else if (error?.message?.toLowerCase().includes('429') || error?.message?.toLowerCase().includes('resource_exhausted') || error?.message?.toLowerCase().includes('rate exceeded')) {
        alert('Limit požadavků (Rate Limit) byl vyčerpán. Prosím počkejte minutu.');
      } else {
        alert('Generování otázek se nezdařilo.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const saveGeneratedQuestions = async () => {
    if (batchResults.length === 0 || !importSubjectId) return;
    
    try {
      const allQuestionsToImport = batchResults.flatMap(result => 
        result.questions.map((q: any) => ({
          id: Date.now() + Math.random(),
          question: q.text || q.text_cz || "Bez textu",
          answers: [
            q.option_a || q.option_a_cz || "Možnost A", 
            q.option_b || q.option_b_cz || "Možnost B", 
            q.option_c || q.option_c_cz || "Možnost C", 
            q.option_d || q.option_d_cz || "Možnost D"
          ],
          correct: ['A', 'B', 'C', 'D'].indexOf(q.correct_option || 'A'),
          explanation: q.explanation || q.explanation_cz || "",
          image: null,
          lo_id: result.loId,
          source: 'ai'
        }))
      );

      const res = await authFetch('/api/import-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectId: importSubjectId,
          questions: allQuestionsToImport,
          clearExisting: false
        })
      });

      const data = await res.json();
      if (data.success) {
        setImportStatus({ type: 'success', message: `Úspěšně uloženo ${data.count} AI otázek pro ${batchResults.length} témat.` });
        setBatchResults([]);
        await Promise.all([
          fetchSubjects(),
          fetchStats(),
          fetchCoverage(importSubjectId)
        ]);
      }
    } catch (error) {
      console.error("Saving failed:", error);
    }
  };

  const handleResetProgress = async () => {
    if (!confirm('Opravdu chcete smazat veškerý váš postup a historii testů? Tato akce je nevratná.')) return;
    
    try {
      const res = await authFetch('/api/reset-progress', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert('Postup byl úspěšně smazán.');
        fetchStats();
        if (view === 'dashboard') fetchSubjects();
      }
    } catch (error) {
      console.error("Reset failed:", error);
      alert('Chyba při mazání postupu.');
    }
  };
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setImportJson(content);
      setImportStatus({ type: 'success', message: `Soubor '${file.name}' byl úspěšně načten.` });
    };
    reader.onerror = () => {
      setImportStatus({ type: 'error', message: 'Chyba při čtení souboru.' });
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!importSubjectId || !importJson) {
      setImportStatus({ type: 'error', message: 'Vyberte předmět a vložte JSON.' });
      return;
    }

    try {
      const parsed = JSON.parse(importJson);
      const questionsWithSource = Array.isArray(parsed) 
        ? parsed.map(q => ({ ...q, source: q.source || 'user' }))
        : parsed;

      const res = await authFetch('/api/import-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectId: importSubjectId,
          questions: questionsWithSource,
          clearExisting
        })
      });

      const data = await res.json();
      if (data.success) {
        setImportStatus({ type: 'success', message: `Úspěšně importováno ${data.count} otázek.` });
        setImportJson('');
        fetchSubjects();
        fetchStats();
      } else {
        setImportStatus({ type: 'error', message: data.error || 'Import selhal.' });
      }
    } catch (err) {
      setImportStatus({ type: 'error', message: 'Neplatný formát JSON.' });
    }
  };

  // Skip authentication check for static deployment
  /*
  if (!token || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg)]">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md p-8 glass-panel rounded-3xl space-y-8 border border-[var(--line)]"
        >
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-[var(--ink)] text-[var(--ink-text)] flex items-center justify-center rounded-2xl font-bold text-3xl mx-auto">
              A
            </div>
            <h1 className="text-2xl font-bold tracking-tight">AeroPilot</h1>
            <p className="text-xs uppercase tracking-widest opacity-50 font-mono">EASA ECQB PREP</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-2">
              <label className="col-header">Uživatelské jméno</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" size={16} />
                <input 
                  type="text"
                  required
                  value={authForm.username}
                  onChange={e => setAuthForm(prev => ({ ...prev, username: e.target.value }))}
                  className="w-full pl-10 pr-4 py-3 bg-transparent border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--ink)]"
                  placeholder="pilot123"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="col-header">Heslo</label>
              <div className="relative">
                <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" size={16} />
                <input 
                  type="password"
                  required
                  value={authForm.password}
                  onChange={e => setAuthForm(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full pl-10 pr-4 py-3 bg-transparent border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--ink)]"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {authError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-500 text-xs flex items-center gap-2">
                <AlertCircle size={14} />
                {authError}
              </div>
            )}

            <button 
              type="submit"
              className="w-full py-4 bg-[var(--ink)] text-[var(--ink-text)] rounded-xl font-bold uppercase tracking-widest text-xs hover:scale-[1.02] transition-transform"
            >
              {authMode === 'login' ? 'Přihlásit se' : 'Zaregistrovat se'}
            </button>
          </form>

          <div className="text-center">
            <button 
              onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
              className="text-[10px] font-bold uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity"
            >
              {authMode === 'login' ? 'Nemáte účet? Zaregistrujte se' : 'Již máte účet? Přihlaste se'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }
  */

  return (
    <div className="min-h-screen transition-colors duration-300">
      {/* Header */}
      <header className="border-b border-[var(--line)] p-4 flex justify-between items-center sticky top-0 bg-[var(--bg)] z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[var(--ink)] text-[var(--ink-text)] flex items-center justify-center rounded-lg font-bold text-xl">
            A
          </div>
          <div>
            <h1 className="font-bold text-lg">Aeropilot Exam Prep</h1>
            <div className="flex items-center gap-2 text-xs opacity-60">
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span>{isOnline ? 'Online' : 'Offline'}</span>
            </div>
          </div>
        </div>

        <nav className="hidden md:flex gap-8">
          <button onClick={() => setView('dashboard')} className={`text-xs uppercase tracking-widest font-semibold flex items-center gap-2 ${view === 'dashboard' ? 'opacity-100' : 'opacity-40 hover:opacity-100'}`}>
            <LayoutDashboard size={14} /> Dashboard
          </button>
          <button onClick={() => setView('stats')} className={`text-xs uppercase tracking-widest font-semibold flex items-center gap-2 ${view === 'stats' ? 'opacity-100' : 'opacity-40 hover:opacity-100'}`}>
            <BarChart3 size={14} /> Statistiky
          </button>
        </nav>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[var(--line)] rounded-full">
            <User size={12} className="opacity-50" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white">{user?.username}</span>
            <button 
              onClick={handleLogout}
              className="ml-2 p-1 hover:text-rose-500 transition-colors"
              title="Odhlásit se"
            >
              <XCircle size={12} />
            </button>
          </div>
          {!userApiKey && (
            <div 
              onClick={() => setView('settings')}
              className="hidden lg:flex items-center gap-2 px-3 py-1 bg-red-500/10 text-red-600 rounded-full text-[10px] font-bold border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors"
            >
              <AlertCircle size={12} />
              AI VYPNUTO
            </div>
          )}
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-full hover:bg-[var(--ink)] hover:text-[var(--ink-text)] transition-colors"
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button 
            onClick={() => setView('settings')}
            className={`p-2 rounded-full transition-colors ${view === 'settings' ? 'bg-[var(--ink)] text-[var(--ink-text)]' : 'hover:bg-[var(--ink)] hover:text-[var(--ink-text)]'}`}
          >
            <Settings size={18} />
          </button>
          <button 
            onClick={() => setView('ai')}
            className={`bg-indigo-600 text-white px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest hover:scale-105 transition-transform flex items-center gap-2 ${view === 'ai' ? 'ring-2 ring-indigo-400 ring-offset-2 dark:ring-offset-black' : ''}`}
          >
            <Sparkles size={14} /> AI - EASA LOs
          </button>
          <button 
            onClick={startExam}
            className="bg-[var(--ink)] text-[var(--ink-text)] px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest hover:scale-105 transition-transform"
          >
            Simulace zkoušky
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        <AnimatePresence mode="wait">
          {view === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Stats Overview */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 border border-[var(--line)] rounded-2xl space-y-2">
                  <p className="col-header">Celková úspěšnost</p>
                  <div className="flex items-end gap-2">
                    <span className="text-4xl font-mono font-bold">
                      {stats ? Math.round(stats.overallSuccess * 100) : 0}%
                    </span>
                    <div className="h-2 flex-1 bg-[var(--line)] rounded-full overflow-hidden mb-2">
                      <div 
                        className="h-full bg-[var(--ink)] transition-all duration-1000" 
                        style={{ width: `${stats ? stats.overallSuccess * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="p-6 border border-[var(--line)] rounded-2xl space-y-2">
                  <p className="col-header">Databáze otázek</p>
                  <p className="text-4xl font-mono font-bold">
                    {stats?.userQuestions || 0} <span className="text-sm opacity-40">/ {stats?.aiQuestions || 0}</span>
                  </p>
                  <p className="text-[10px] uppercase tracking-widest opacity-40 font-bold">Uživatel / AI</p>
                </div>
                <div className="p-6 border border-[var(--line)] rounded-2xl space-y-2">
                  <p className="col-header">Procvičeno otázek</p>
                  <p className="text-4xl font-mono font-bold">
                    {stats?.practicedQuestions} <span className="text-sm opacity-40">/ {stats?.totalQuestions}</span>
                  </p>
                </div>
                <div className="p-6 border border-[var(--line)] rounded-2xl space-y-2">
                  <p className="col-header">Aktuální licence</p>
                  <div className="flex gap-2">
                    <span className="px-3 py-1 bg-[var(--ink)] text-[var(--ink-text)] rounded-full text-[10px] font-bold">PPL(A)</span>
                    <span className="px-3 py-1 border border-[var(--line)] rounded-full text-[10px] font-bold opacity-50">SPL</span>
                  </div>
                </div>
              </div>

              {/* Subject List */}
              <section>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="font-bold text-2xl">Předměty EASA</h2>
                  <button 
                    onClick={startMix}
                    className="flex items-center gap-2 bg-[var(--ink)] text-[var(--ink-text)] px-8 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest hover:scale-105 transition-all shadow-lg"
                  >
                    <RotateCcw size={14} /> MIX
                  </button>
                </div>
                <div className="border-t border-[var(--line)]">
                  <div className="data-row opacity-40 uppercase text-[10px] tracking-widest font-bold cursor-default hover:bg-transparent hover:text-inherit border-b-0">
                    <div className="flex justify-center"></div>
                    <div className="flex items-center">Předmět</div>
                    <div className="flex justify-center">OTÁZKY</div>
                    <div className="flex justify-center">Úspěšnost</div>
                    <div className="flex justify-end">Akce</div>
                  </div>

                  {subjects.map((s) => (
                    <div 
                      key={s.id} 
                      onClick={() => startDrill(s)}
                      className="data-row group"
                    >
                      <div className="flex justify-center">
                        <BookOpen size={16} className="opacity-40 group-hover:opacity-100" />
                      </div>
                      <div className="font-medium flex items-center min-w-0 truncate">{s.name}</div>
                      <div className="font-mono text-xs flex justify-center opacity-60">
                        {s.user_count || 0} / {s.ai_count || 0}
                      </div>
                      <div className="font-mono text-sm flex justify-center">
                        {Math.round(s.success_rate * 100)}%
                      </div>
                      <div className="flex justify-end">
                        <ChevronRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  ))}

                  {/* Special Row: Procvičit chyby */}
                  <div 
                    onClick={startErrors}
                    className="data-row group bg-orange-500/5 hover:bg-orange-500 hover:text-white transition-colors border border-[var(--line)] rounded-xl mt-4"
                  >
                    <div className="flex justify-center">
                      <AlertCircle size={16} className="text-orange-500 group-hover:text-white" />
                    </div>
                    <div className="font-bold flex items-center">Procvičit chyby</div>
                    <div className="font-mono text-sm flex justify-center opacity-60">
                      {stats?.practicedQuestions && stats.overallSuccess < 1 ? 'Dostupné' : '-'}
                    </div>
                    <div className="font-mono text-sm flex justify-center">
                      {stats ? Math.round((1 - stats.overallSuccess) * 100) : 0}% chyb
                    </div>
                    <div className="flex justify-end">
                      <ChevronRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </div>
              </section>
            </motion.div>
          )}

          {view === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setView('dashboard')} className="p-2 rounded-full hover:bg-[var(--line)]">
                  <ArrowLeft size={20} />
                </button>
                <h2 className="font-bold text-3xl">Nastavení</h2>
              </div>

              <section className="p-8 border border-[var(--line)] rounded-3xl space-y-6">
                <div className="flex items-center gap-2">
                  <BookOpen size={20} className="opacity-50" />
                  <h3 className="font-bold uppercase tracking-widest text-sm">Drill Mode (Cvičení)</h3>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="col-header">Řazení otázek</label>
                    <select 
                      value={drillSettings.sorting} 
                      onChange={(e) => setDrillSettings(prev => ({ ...prev, sorting: e.target.value as any }))}
                      className="w-full p-3 bg-transparent border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--ink)]"
                    >
                      <option value="default">Výchozí (ID)</option>
                      <option value="random">Náhodné</option>
                      <option value="hardest_first">Nejtěžší nejdříve</option>
                      <option value="least_practiced">Nejméně procvičované</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between p-4 border border-[var(--line)] rounded-2xl">
                    <div>
                      <p className="text-sm font-bold">Okamžitá zpětná vazba</p>
                      <p className="text-[10px] opacity-50">Zobrazit správnou odpověď ihned po kliknutí</p>
                    </div>
                    <button 
                      onClick={() => setDrillSettings(prev => ({ ...prev, immediateFeedback: !prev.immediateFeedback }))}
                      className={`w-12 h-6 rounded-full transition-colors relative ${drillSettings.immediateFeedback ? 'bg-[var(--ink)]' : 'bg-[var(--line)]'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${drillSettings.immediateFeedback ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 border border-[var(--line)] rounded-2xl">
                    <div>
                      <p className="text-sm font-bold">Vysvětlení na vyžádání</p>
                      <p className="text-[10px] opacity-50">Možnost zobrazit vysvětlení u každé otázky</p>
                    </div>
                    <button 
                      onClick={() => setDrillSettings(prev => ({ ...prev, showExplanationOnDemand: !prev.showExplanationOnDemand }))}
                      className={`w-12 h-6 rounded-full transition-colors relative ${drillSettings.showExplanationOnDemand ? 'bg-[var(--ink)]' : 'bg-[var(--line)]'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${drillSettings.showExplanationOnDemand ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <label className="col-header">Zdroje otázek (Filtry)</label>
                    <div className="flex gap-3">
                      {[
                        { id: 'user', icon: User, label: 'Uživatel' },
                        { id: 'ai', icon: Bot, label: 'AI / EASA' }
                      ].map((src) => {
                        const isActive = drillSettings.sourceFilters.includes(src.id as any);
                        return (
                          <button
                            key={src.id}
                            onClick={() => toggleSourceFilter(src.id as any)}
                            className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                              isActive 
                                ? 'border-indigo-600 bg-indigo-600/5 text-indigo-600 scale-105 shadow-sm' 
                                : 'border-[var(--line)] opacity-40 grayscale hover:opacity-60'
                            }`}
                          >
                            <src.icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                            <span className="text-[10px] font-bold uppercase tracking-widest">{src.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>

              <section className="p-8 border border-[var(--line)] rounded-3xl space-y-6">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={20} className="opacity-50" />
                  <h3 className="font-bold uppercase tracking-widest text-sm">Systémová nastavení</h3>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="col-header">AI Provider</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setAiProvider('gemini')}
                        className={`p-3 rounded-xl border text-[10px] font-bold transition-all flex items-center justify-center gap-2 ${
                          aiProvider === 'gemini' 
                            ? 'border-blue-600 bg-blue-600/5 text-blue-600' 
                            : 'border-[var(--line)] opacity-40 hover:opacity-60'
                        }`}
                      >
                        <div className="w-4 h-4 bg-blue-600 rounded-full" />
                        Gemini
                      </button>
                      <button
                        onClick={() => setAiProvider('claude')}
                        className={`p-3 rounded-xl border text-[10px] font-bold transition-all flex items-center justify-center gap-2 ${
                          aiProvider === 'claude' 
                            ? 'border-orange-600 bg-orange-600/5 text-orange-600' 
                            : 'border-[var(--line)] opacity-40 hover:opacity-60'
                        }`}
                      >
                        <div className="w-4 h-4 bg-orange-600 rounded-full" />
                        Claude
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="col-header">
                      {aiProvider === 'gemini' ? 'Gemini' : 'Claude'} API Klíč
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input 
                          type="password"
                          value={aiProvider === 'gemini' ? userApiKey : claudeApiKey}
                          onChange={(e) => {
                            if (aiProvider === 'gemini') {
                              setUserApiKey(e.target.value);
                            } else {
                              setClaudeApiKey(e.target.value);
                            }
                            setKeyStatus('idle');
                          }}
                          placeholder={`Vložte váš ${aiProvider === 'gemini' ? 'Gemini' : 'Claude'} API klíč...`}
                          className={`w-full p-3 bg-transparent border rounded-xl focus:outline-none focus:border-[var(--ink)] pr-10 ${
                            keyStatus === 'valid' ? 'border-emerald-500/50' : keyStatus === 'invalid' ? 'border-red-500/50' : 'border-[var(--line)]'
                          }`}
                        />
                        {keyStatus === 'valid' && <CheckCircle2 size={16} className="absolute right-3 top-3.5 text-emerald-500" />}
                        {keyStatus === 'invalid' && <XCircle size={16} className="absolute right-3 top-3.5 text-red-500" />}
                        {keyStatus === 'idle' && <HelpCircle size={16} className="absolute right-3 top-3.5 opacity-30 cursor-help" title="Klíč bude uložen pouze ve vašem prohlížeči." />}
                      </div>
                      <button 
                        onClick={handleVerifyKey}
                        disabled={isVerifyingKey || !(aiProvider === 'gemini' ? userApiKey : claudeApiKey)}
                        className="px-6 bg-[var(--ink)] text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:scale-105 transition-transform disabled:opacity-50"
                      >
                        {isVerifyingKey ? <RotateCcw size={14} className="animate-spin" /> : 'Ověřit'}
                      </button>
                    </div>
                    <p className="text-[10px] opacity-40">
                      Klíč je uložen pouze lokálně ve vašem prohlížeči. 
                      {aiProvider === 'gemini' 
                        ? ' Získejte klíč zdarma na ai.google.dev.' 
                        : ' Získejte klíč na console.anthropic.com.'}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="col-header">AI Model</label>
                    <select 
                      value={aiModel}
                      onChange={(e) => setAiModel(e.target.value)}
                      className="w-full p-3 bg-transparent border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--ink)]"
                    >
                      {aiProvider === 'gemini' ? (
                        <>
                          <option value="gemini-3-flash-preview">Gemini 3 Flash (Rychlý, vysoké limity)</option>
                          <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Chytřejší, nižší limity)</option>
                          <option value="gemini-1.5-flash">Gemini 1.5 Flash (Starší)</option>
                        </>
                      ) : (
                        <>
                          <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (Nejnovější)</option>
                          <option value="claude-opus-4-6">Claude Opus 4.6 (Nejlepší)</option>
                          <option value="claude-sonnet-4-20250514">Claude Sonnet 4 (Stabilní)</option>
                          <option value="claude-opus-4-20250514">Claude Opus 4 (Výkonný)</option>
                          <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (Rychlý, levný)</option>
                        </>
                      )}
                    </select>
                    <p className="text-[10px] opacity-40">
                      {aiProvider === 'gemini' 
                        ? 'Flash modely jsou doporučeny pro běžné použití díky rychlosti.'
                        : 'Claude 4 Sonnet je nejnovější a nejvýkonnější model pro nejlepší výsledky.'}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-[var(--line)]">
                    <button 
                      onClick={handleResetProgress}
                      className="w-full p-4 rounded-2xl border border-red-500/20 text-red-500 hover:bg-red-500/5 transition-all flex items-center justify-center gap-2 font-bold uppercase tracking-widest text-[10px]"
                    >
                      <RotateCcw size={14} />
                      Smazat veškerý postup a historii
                    </button>
                  </div>
                </div>
              </section>

              <section className="p-8 border border-[var(--line)] rounded-3xl space-y-6">
                <div className="flex items-center gap-2">
                  <Upload size={20} className="opacity-50" />
                  <h3 className="font-bold uppercase tracking-widest text-sm">Import otázek (JSON)</h3>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="col-header">Vyberte předmět</label>
                    <select 
                      value={importSubjectId || ''} 
                      onChange={(e) => setImportSubjectId(Number(e.target.value))}
                      className="w-full p-3 bg-transparent border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--ink)]"
                    >
                      {subjects.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="col-header">JSON Data</label>
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-60 hover:opacity-100 transition-opacity"
                      >
                        <FileJson size={14} />
                        Nahrát soubor
                      </button>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        accept=".json" 
                        className="hidden" 
                      />
                    </div>
                    <textarea 
                      value={importJson}
                      onChange={(e) => setImportJson(e.target.value)}
                      placeholder='[{"id": 1, "question": "...", "answers": ["...", ...], "correct": 0}]'
                      className="w-full h-64 p-4 bg-transparent border border-[var(--line)] rounded-xl font-mono text-xs focus:outline-none focus:border-[var(--ink)] resize-none"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id="clearExisting" 
                      checked={clearExisting}
                      onChange={(e) => setClearExisting(e.target.checked)}
                      className="w-4 h-4 accent-[var(--ink)]"
                    />
                    <label htmlFor="clearExisting" className="text-xs font-medium opacity-70">
                      Smazat stávající otázky pro tento předmět před importem
                    </label>
                  </div>

                  {importStatus && (
                    <div className={`p-4 rounded-xl flex items-center gap-3 text-sm ${importStatus.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-600 border border-rose-500/20'}`}>
                      {importStatus.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                      {importStatus.message}
                    </div>
                  )}

                  <button 
                    onClick={handleImport}
                    className="w-full py-4 bg-[var(--ink)] text-[var(--bg)] rounded-full text-xs font-bold uppercase tracking-widest hover:scale-[1.01] transition-transform"
                  >
                    Importovat otázky
                  </button>
                </div>
              </section>

              <div className="p-6 bg-[var(--line)] rounded-2xl opacity-50">
                <p className="text-[10px] uppercase tracking-widest font-bold mb-2">Očekávaný formát JSON:</p>
                <pre className="text-[9px] font-mono whitespace-pre-wrap">
{`[
  {
    "id": 1,
    "question": "Text otázky",
    "answers": ["Možnost A", "Možnost B", "Možnost C", "Možnost D"],
    "correct": 0,
    "image": null
  }
]`}
                </pre>
              </div>
            </motion.div>
          )}

          {view === 'drill' && selectedSubject && (
            <motion.div 
              key="drill"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="max-w-3xl mx-auto space-y-8"
            >
              {questions.length === 0 ? (
                <div className="text-center py-20 space-y-6 glass-panel rounded-3xl border border-[var(--line)]">
                  <div className="w-20 h-20 bg-indigo-600/10 text-indigo-600 flex items-center justify-center rounded-full mx-auto">
                    <HelpCircle size={40} />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold">Žádné otázky</h2>
                    <p className="text-sm opacity-50 max-w-md mx-auto">
                      Pro tento výběr nebyly nalezeny žádné otázky. Zkuste změnit filtry v nastavení nebo vygenerovat nové otázky pomocí AI.
                    </p>
                  </div>
                  <button 
                    onClick={() => setView('dashboard')}
                    className="bg-[var(--ink)] text-[var(--bg)] px-8 py-3 rounded-full text-xs font-bold uppercase tracking-widest hover:scale-105 transition-transform"
                  >
                    Zpět na dashboard
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center">
                    <button onClick={() => setView('dashboard')} className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest opacity-50 hover:opacity-100">
                      <ArrowLeft size={14} /> Zpět na přehled
                    </button>
                <div className="text-center flex flex-col items-center">
                  <p className="col-header">{selectedSubject.name}</p>
                  <div className="flex items-center gap-4">
                    <button 
                      disabled={currentQuestionIndex === 0}
                      onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
                      className="p-1 hover:bg-[var(--line)] rounded-full disabled:opacity-20 transition-colors"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button 
                      onClick={jumpToRandomQuestion}
                      title="Skočit na náhodnou otázku"
                      className="font-mono text-xs opacity-50 hover:opacity-100 hover:text-white transition-all cursor-pointer px-2 py-1 rounded hover:bg-[var(--line)]"
                    >
                      {currentQuestionIndex + 1} / {questions.length}
                    </button>
                    <button 
                      disabled={currentQuestionIndex === questions.length - 1}
                      onClick={nextQuestion}
                      className="p-1 hover:bg-[var(--line)] rounded-full disabled:opacity-20 transition-colors"
                    >
                      <ChevronRight size={16} />
                    </button>
                    <div className="flex items-center gap-3 ml-2">
                      {[
                        { id: 'user', icon: User, label: 'Uživatel' },
                        { id: 'ai', icon: Bot, label: 'AI Generováno' }
                      ].map(src => {
                        const q = questions[currentQuestionIndex];
                        const isCurrentSource = (src.id === 'user' && q.is_ai !== 1) || 
                                               (src.id === 'ai' && q.is_ai === 1);
                        const isFilteringThis = drillSettings.sourceFilters.length === 1 && drillSettings.sourceFilters[0] === src.id;
                        
                        return (
                          <button 
                            key={src.id}
                            onClick={() => toggleSourceFilter(src.id as any)}
                            title={isFilteringThis ? `Zrušit filtr: ${src.label}` : `Filtrovat pouze: ${src.label}`}
                            className={`transition-all duration-300 flex items-center gap-1 relative ${
                              isCurrentSource ? 'opacity-100' : 'opacity-20 hover:opacity-40'
                            } ${isFilteringThis ? 'text-indigo-600' : 'text-[var(--ink)]'}`}
                          >
                            <src.icon size={16} strokeWidth={isCurrentSource ? 2.5 : 2} />
                            {isCurrentSource && (
                              <span className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-600 rounded-full border-2 border-[var(--bg)]" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleToggleLanguage}
                    disabled={isTranslating}
                    className={`px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-all flex items-center gap-2 ${language === 'CZ' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-[var(--line)] opacity-60 hover:opacity-100'}`}
                  >
                    {isTranslating ? <RotateCcw size={12} className="animate-spin" /> : <Languages size={12} />}
                    {language}
                  </button>
                  <button 
                    onClick={() => toggleFlag(questions[currentQuestionIndex].id, questions[currentQuestionIndex].is_flagged)}
                    className={`p-2 rounded-full transition-colors ${questions[currentQuestionIndex].is_flagged ? 'bg-orange-500 text-white' : 'hover:bg-[var(--line)]'}`}
                  >
                    <Flag size={18} />
                  </button>
                </div>
              </div>

              <div className="p-8 border border-[var(--line)] rounded-3xl space-y-8">
                {questions[currentQuestionIndex].image && (
                  <div className="w-full max-h-64 overflow-hidden rounded-xl border border-[var(--line)] flex items-center justify-center bg-white/5">
                    <img 
                      src={`/images/${questions[currentQuestionIndex].image}`} 
                      alt="Question illustration" 
                      className="max-w-full max-h-full object-contain"
                      referrerPolicy="no-referrer"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                  </div>
                )}
                <h3 className="text-xl font-medium leading-relaxed flex items-start gap-3">
                  {questions[currentQuestionIndex].is_ai === 1 && (
                    <div className="mt-1 flex-shrink-0" title="AI Generovaná otázka">
                      <Bot size={20} className="text-indigo-600 animate-pulse" />
                    </div>
                  )}
                  <span>
                    {language === 'CZ' ? questions[currentQuestionIndex].text_cz || questions[currentQuestionIndex].text : questions[currentQuestionIndex].text}
                  </span>
                </h3>

                <div className="grid gap-3">
                  {['A', 'B', 'C', 'D'].map((opt) => {
                    const optionKey = `option_${opt.toLowerCase()}` as keyof Question;
                    const optionCzKey = `${optionKey}_cz` as keyof Question;
                    const isCorrect = opt === questions[currentQuestionIndex].correct_option;
                    const isSelected = answered === opt;
                    
                    let bgClass = "border-[var(--line)] hover:border-[var(--ink)]";
                    if (answered && drillSettings.immediateFeedback) {
                      if (isCorrect) bgClass = "bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-400";
                      else if (isSelected) bgClass = "bg-rose-500/20 border-rose-500 text-rose-700 dark:text-rose-400";
                      else bgClass = "opacity-40 border-[var(--line)]";
                    } else if (isSelected) {
                      bgClass = "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]";
                    }

                    return (
                      <button
                        key={opt}
                        disabled={!!answered && drillSettings.immediateFeedback}
                        onClick={() => handleAnswer(opt)}
                        className={`p-4 rounded-xl border text-left transition-all flex items-center gap-4 ${bgClass}`}
                      >
                        <span className="w-8 h-8 flex items-center justify-center rounded-lg border border-current font-mono text-xs">
                          {opt}
                        </span>
                        <span className="flex-1">
                          {language === 'CZ' 
                            ? (questions[currentQuestionIndex][optionCzKey] as string) || (questions[currentQuestionIndex][optionKey] as string) 
                            : (questions[currentQuestionIndex][optionKey] as string)}
                        </span>
                        {answered && drillSettings.immediateFeedback && isCorrect && <CheckCircle2 size={20} className="text-emerald-500" />}
                        {answered && drillSettings.immediateFeedback && isSelected && !isCorrect && <XCircle size={20} className="text-rose-500" />}
                      </button>
                    );
                  })}
                </div>

                {(answered || !drillSettings.immediateFeedback) && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="pt-6 border-t border-[var(--line)] space-y-4"
                  >
                    <div className="flex justify-between items-center">
                      {drillSettings.showExplanationOnDemand && (
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => {
                              if (!showExplanation) {
                                setShowExplanation(true);
                                handleFetchAiExplanation();
                              } else {
                                setShowExplanation(false);
                              }
                            }}
                            className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest hover:opacity-70 transition-opacity"
                          >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${showExplanation ? 'bg-indigo-600 text-white' : 'bg-indigo-600/10 text-indigo-600'}`}>
                              {showExplanation ? <HelpCircle size={16} /> : (isGeneratingAiExplanation ? <RotateCcw size={16} className="animate-spin" /> : <HelpCircle size={16} />)}
                            </div>
                            <span className="underline underline-offset-4">
                              {isGeneratingAiExplanation ? 'Generuji...' : (showExplanation ? 'Skrýt vysvětlení' : 'Zobrazit vysvětlení')}
                            </span>
                          </button>
                          
                          {/* Model selector - only show when explanation is shown and exists */}
                          {showExplanation && aiExplanation && (
                            <div className="flex items-center gap-2">
                              <select 
                                value={aiModel}
                                onChange={(e) => {
                                  const selectedModel = e.target.value;
                                  // Switch provider if needed
                                  if (selectedModel.startsWith('claude') && aiProvider !== 'claude') {
                                    setAiProvider('claude');
                                  } else if (selectedModel.startsWith('gemini') && aiProvider !== 'gemini') {
                                    setAiProvider('gemini');
                                  }
                                  setAiModel(selectedModel);
                                  // Save to localStorage for persistence
                                  localStorage.setItem('aiModel', selectedModel);
                                  localStorage.setItem('aiProvider', selectedModel.startsWith('claude') ? 'claude' : 'gemini');
                                  // Immediately regenerate with new model
                                  setAiExplanation(null);
                                  setDetailedExplanation(null);
                                  handleFetchAiExplanation();
                                }}
                                className="text-xs px-2 py-1 bg-transparent border border-[var(--line)] rounded focus:outline-none focus:border-[var(--ink)]"
                                disabled={isGeneratingAiExplanation}
                              >
                                <optgroup label="Google Gemini">
                                  <option value="gemini-3-flash-preview">Gemini 3 Flash (Rychlý)</option>
                                  <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Chytřejší)</option>
                                  <option value="gemini-1.5-flash">Gemini 1.5 Flash (Starší)</option>
                                </optgroup>
                                <optgroup label="Anthropic Claude">
                                  <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (Nejnovější)</option>
                                  <option value="claude-opus-4-6">Claude Opus 4.6 (Nejlepší)</option>
                                  <option value="claude-sonnet-4-20250514">Claude Sonnet 4 (Stabilní)</option>
                                  <option value="claude-opus-4-20250514">Claude Opus 4 (Výkonný)</option>
                                  <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5 (Vyvážený)</option>
                                  <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (Rychlý)</option>
                                </optgroup>
                              </select>
                              <span className="text-xs text-orange-600 dark:text-orange-400 opacity-60">
                                Změnit model
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex-1" />
                      <button 
                        onClick={nextQuestion}
                        className="bg-[var(--ink)] text-[var(--bg)] px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-2"
                      >
                        Další otázka <ChevronRight size={14} />
                      </button>
                    </div>
                    
                    {showExplanation && drillSettings.showExplanationOnDemand && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                        {/* Learning Objective Section */}
                        <div className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl space-y-2">
                          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                            <GraduationCap size={14} />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Cíl učení (Learning Objective)</span>
                          </div>
                          <div className="flex items-start gap-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold mt-0.5 ${!questions[currentQuestionIndex].lo_id ? 'bg-orange-500/20 text-orange-600 border border-orange-500/30' : 'bg-indigo-600 text-white'}`}>
                              {aiDetectedObjective || questions[currentQuestionIndex].lo_id || 'User Import'}
                            </span>
                            <p className="text-xs font-medium opacity-80">
                              {aiDetectedObjective 
                                ? 'AI detekovaný cíl učení' 
                                : mockLOs.find(l => l.id === questions[currentQuestionIndex].lo_id)?.text || 'Obecné znalosti letectví.'
                              }
                            </p>
                          </div>
                        </div>

                        {/* Standard Explanation */}
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Základní vysvětlení</p>
                          <p className="text-base opacity-80 leading-relaxed font-medium">
                            {language === 'CZ' ? questions[currentQuestionIndex].explanation_cz || questions[currentQuestionIndex].explanation : questions[currentQuestionIndex].explanation}
                          </p>
                        </div>

                        {/* AI Loading State */}
                        {isGeneratingAiExplanation && (
                          <div className="space-y-4">
                            <div className="p-6 bg-slate-900/50 border border-slate-800/50 rounded-xl space-y-4 relative overflow-hidden">
                              <div className="absolute top-0 right-0 p-4 opacity-5">
                                <Binary size={64} />
                              </div>
                              <div className="flex items-center gap-2 text-indigo-400">
                                <Terminal size={14} />
                                <span className="text-[10px] font-bold uppercase tracking-widest">AI_ENGINE_OUTPUT_LOG</span>
                              </div>
                              
                              {/* Skeleton Lines */}
                              <div className="space-y-2">
                                <div className="h-3 bg-slate-700 rounded animate-pulse"></div>
                                <div className="h-3 bg-slate-700 rounded animate-pulse w-4/5"></div>
                                <div className="h-3 bg-slate-700 rounded animate-pulse w-3/4"></div>
                                <div className="h-3 bg-slate-700 rounded animate-pulse w-5/6"></div>
                              </div>
                              
                              <div className="text-xs text-indigo-400 opacity-60 font-mono">
                                <span className="inline-block animate-pulse">▌</span> Generuji technickou analýzu...
                              </div>
                            </div>
                          </div>
                        )}

                        {/* AI Detailed Note */}
                        {aiExplanation && !isGeneratingAiExplanation && (
                          <div className="space-y-4">
                            <div className="p-6 bg-slate-900 text-slate-300 border border-slate-800 rounded-xl space-y-4 relative overflow-hidden font-mono">
                              <div className="absolute top-0 right-0 p-4 opacity-5">
                                <Binary size={64} />
                              </div>
                              <div className="flex items-center gap-2 text-indigo-400">
                                <Terminal size={14} />
                                <span className="text-[10px] font-bold uppercase tracking-widest">AI_ENGINE_OUTPUT_LOG</span>
                              </div>
                              <div className="text-xs leading-relaxed opacity-90 max-w-none border-l border-indigo-500/30 pl-4">
                                {aiExplanation.split('\n').map((line, i) => (
                                  <p key={i} className="mb-1">{line}</p>
                                ))}
                              </div>
                            </div>

                            {/* Detailed Explanation Button */}
                            {!detailedExplanation && (
                              <button 
                                onClick={handleFetchDetailedExplanation}
                                disabled={isGeneratingDetailedExplanation}
                                className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 hover:opacity-80 transition-opacity"
                              >
                                <div className="w-8 h-8 rounded-full bg-emerald-600/10 flex items-center justify-center">
                                  {isGeneratingDetailedExplanation ? <RotateCcw size={14} className="animate-spin" /> : <BookOpen size={14} />}
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-widest">Podrobněji (Lidské vysvětlení)</span>
                              </button>
                            )}

                            {/* Detailed Explanation Loading State */}
                            {isGeneratingDetailedExplanation && (
                              <div className="p-6 bg-emerald-900/5 border border-emerald-600/10 rounded-xl space-y-4">
                                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                                  <BookOpen size={14} />
                                  <span className="text-[10px] font-bold uppercase tracking-widest">Podrobné vysvětlení pro studenty</span>
                                </div>
                                
                                {/* Skeleton Lines */}
                                <div className="space-y-3">
                                  <div className="h-4 bg-emerald-800/20 rounded animate-pulse"></div>
                                  <div className="h-4 bg-emerald-800/20 rounded animate-pulse w-5/6"></div>
                                  <div className="h-4 bg-emerald-800/20 rounded animate-pulse w-4/5"></div>
                                  <div className="h-4 bg-emerald-800/20 rounded animate-pulse w-6/7"></div>
                                </div>
                                
                                <div className="text-sm text-emerald-600 opacity-60">
                                  <span className="inline-block animate-pulse">▌</span> Připravuji podrobné vysvětlení...
                                </div>
                              </div>
                            )}

                            {/* Detailed Explanation Display */}
                            {detailedExplanation && !isGeneratingDetailedExplanation && (
                              <div className="p-6 bg-emerald-900/10 border border-emerald-600/20 rounded-xl space-y-4">
                                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                                  <BookOpen size={14} />
                                  <span className="text-[10px] font-bold uppercase tracking-widest">Podrobné vysvětlení pro studenty</span>
                                </div>
                                <div className="text-sm leading-relaxed opacity-90">
                                  {detailedExplanation.split('\n').map((line, i) => (
                                    <p key={i} className="mb-2">{line}</p>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            </>
          )}
        </motion.div>
      )}

          {view === 'exam' && questions.length > 0 && (
            <motion.div 
              key="exam"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-4xl mx-auto space-y-8"
            >
              <div className="flex justify-between items-center p-4 glass-panel rounded-2xl">
                <div className="flex items-center gap-4">
                  <GraduationCap size={24} />
                  <div>
                    <h2 className="font-bold text-sm uppercase tracking-widest">Simulace zkoušky ÚCL</h2>
                    <p className="text-[10px] opacity-50">20 otázek • 30 minut</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={handleToggleLanguage}
                    disabled={isTranslating}
                    className={`px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-all flex items-center gap-2 ${language === 'CZ' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-[var(--line)] opacity-60 hover:opacity-100'}`}
                  >
                    {isTranslating ? <RotateCcw size={12} className="animate-spin" /> : <Languages size={12} />}
                    {language}
                  </button>
                  <div className="flex items-center gap-2 font-mono text-xl font-bold">
                    <Clock size={20} className="opacity-50" />
                    {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}
                  </div>
                </div>
                <button 
                  onClick={() => setView('dashboard')}
                  className="px-4 py-2 border border-rose-500/50 text-rose-500 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all"
                >
                  Ukončit test
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {examResults ? (
                  <div className="lg:col-span-4 flex flex-col items-center justify-center py-12 space-y-8">
                    <div className="w-32 h-32 bg-[var(--ink)] text-[var(--bg)] rounded-full flex items-center justify-center">
                      <Trophy size={64} />
                    </div>
                    <div className="text-center">
                      <h2 className="text-4xl font-bold">Výsledky zkoušky</h2>
                      <p className="text-6xl font-mono font-bold mt-4">
                        {Math.round((examResults.score / examResults.total) * 100)}%
                      </p>
                      <p className="text-sm opacity-50 mt-2">
                        Správně: {examResults.score} z {examResults.total}
                      </p>
                    </div>
                    <div className="flex gap-4">
                      <button 
                        onClick={() => setView('dashboard')}
                        className="px-8 py-4 border border-[var(--line)] rounded-full text-xs font-bold uppercase tracking-widest"
                      >
                        Zpět na dashboard
                      </button>
                      <button 
                        onClick={startExam}
                        className="px-8 py-4 bg-[var(--ink)] text-[var(--bg)] rounded-full text-xs font-bold uppercase tracking-widest"
                      >
                        Zkusit znovu
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                <div className="lg:col-span-3 p-8 border border-[var(--line)] rounded-3xl space-y-8">
                      {questions[currentQuestionIndex].image && (
                        <div className="w-full max-h-64 overflow-hidden rounded-xl border border-[var(--line)] flex items-center justify-center bg-white/5">
                          <img 
                            src={`/images/${questions[currentQuestionIndex].image}`} 
                            alt="Question illustration" 
                            className="max-w-full max-h-full object-contain"
                            referrerPolicy="no-referrer"
                            onError={(e) => (e.currentTarget.style.display = 'none')}
                          />
                        </div>
                      )}
                      <div className="flex items-center gap-4 mb-2">
                        {[
                          { id: 'user', icon: User, label: 'Uživatel' },
                          { id: 'ai', icon: Bot, label: 'AI Engine / EASA' }
                        ].map(src => {
                          const isCurrentSource = (src.id === 'user' && questions[currentQuestionIndex].source === 'user') || (src.id === 'ai' && (questions[currentQuestionIndex].source === 'ai' || questions[currentQuestionIndex].source === 'easa' || !questions[currentQuestionIndex].source));
                          const isFilteringThis = drillSettings.sourceFilters.length === 1 && drillSettings.sourceFilters[0] === src.id;
                          
                          return (
                            <button 
                              key={src.id}
                              onClick={() => toggleSourceFilter(src.id as any)}
                              className={`flex items-center gap-2 transition-all duration-300 ${
                                isCurrentSource ? 'opacity-100' : 'opacity-20 hover:opacity-40'
                              } ${isFilteringThis ? 'text-indigo-600' : 'text-[var(--ink)]'}`}
                            >
                              <src.icon size={14} strokeWidth={isCurrentSource ? 2.5 : 2} />
                              <span className="text-[10px] font-bold uppercase tracking-widest">
                                {src.label}
                              </span>
                              {isCurrentSource && (
                                <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <h3 className="text-xl font-medium leading-relaxed">
                        {language === 'CZ' ? questions[currentQuestionIndex].text_cz || questions[currentQuestionIndex].text : questions[currentQuestionIndex].text}
                      </h3>
                      <div className="grid gap-3">
                        {['A', 'B', 'C', 'D'].map((opt) => {
                          const optionKey = `option_${opt.toLowerCase()}` as keyof Question;
                          const optionCzKey = `${optionKey}_cz` as keyof Question;
                          const isSelected = answered === opt;
                          return (
                            <button
                              key={opt}
                              onClick={() => handleAnswer(opt)}
                              className={`p-4 rounded-xl border text-left transition-all flex items-center gap-4 ${isSelected ? 'bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]' : 'border-[var(--line)] hover:border-[var(--ink)]'}`}
                            >
                              <span className="w-8 h-8 flex items-center justify-center rounded-lg border border-current font-mono text-xs">
                                {opt}
                              </span>
                              <span className="flex-1">
                                {language === 'CZ' 
                                  ? (questions[currentQuestionIndex][optionCzKey] as string) || (questions[currentQuestionIndex][optionKey] as string) 
                                  : (questions[currentQuestionIndex][optionKey] as string)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex justify-between">
                        <button 
                          disabled={currentQuestionIndex === 0}
                          onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
                          className="px-6 py-3 border border-[var(--line)] rounded-full text-xs font-bold uppercase tracking-widest disabled:opacity-20"
                        >
                          Předchozí
                        </button>
                        <button 
                          onClick={nextQuestion}
                          className="bg-[var(--ink)] text-[var(--bg)] px-8 py-3 rounded-full text-xs font-bold uppercase tracking-widest"
                        >
                          {currentQuestionIndex === questions.length - 1 ? 'Odevzdat test' : 'Další'}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <p className="col-header">Navigace otázek</p>
                      <div className="grid grid-cols-5 gap-2">
                        {questions.map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => setCurrentQuestionIndex(idx)}
                            className={`w-full aspect-square flex items-center justify-center rounded-lg text-[10px] font-mono border transition-all ${currentQuestionIndex === idx ? 'bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]' : 'border-[var(--line)] opacity-50'}`}
                          >
                            {(idx + 1).toString().padStart(2, '0')}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}

          {view === 'ai' && (
            <motion.div 
              key="ai"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-4xl mx-auto space-y-8"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setView('dashboard')} className="p-2 rounded-full hover:bg-[var(--line)]">
                  <ArrowLeft size={20} />
                </button>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center">
                    <GraduationCap size={28} />
                  </div>
                  <div>
                    <h2 className="font-bold text-3xl">AI - EASA LOs</h2>
                    <p className="opacity-70 text-sm">Generování otázek na základě Learning Objectives (AMC/GM Part-FCL).</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="md:col-span-3 space-y-6">
                  {/* Step 1: Syllabus Management */}
                  <section className="p-8 border border-[var(--line)] rounded-3xl space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[var(--ink)] text-[var(--bg)] rounded-lg flex items-center justify-center font-bold text-xs">1</div>
                        <h3 className="text-xl font-bold">Osnovy & Learning Objectives</h3>
                      </div>
                      <span className="px-3 py-1 bg-emerald-500/10 text-emerald-600 text-[10px] font-bold rounded-full border border-emerald-500/20">XML eRules Ready</span>
                    </div>
                    <p className="text-sm opacity-60">
                      Importujte hierarchii LOs z platformy eRules (Regulation EU No 1178/2011). 
                      AI využije strukturu Subject → Topic → Subtopic pro přesný kontext.
                    </p>
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <button className="p-4 border border-[var(--line)] rounded-2xl text-left hover:bg-[var(--line)] transition-colors">
                        <p className="text-[10px] uppercase tracking-widest font-bold opacity-50 mb-1">Zdroj dat</p>
                        <p className="text-sm font-bold">Easy Access Rules XML</p>
                      </button>
                      <button className="p-4 border border-[var(--line)] rounded-2xl text-left hover:bg-[var(--line)] transition-colors">
                        <p className="text-[10px] uppercase tracking-widest font-bold opacity-50 mb-1">Stav</p>
                        <p className="text-sm font-bold">AMC/GM Part-FCL Načteno</p>
                      </button>
                    </div>
                  </section>

                  {/* Step 2: Few-Shot Patterns */}
                  <section className="p-8 border border-[var(--line)] rounded-3xl space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-[var(--ink)] text-[var(--bg)] rounded-lg flex items-center justify-center font-bold text-xs">2</div>
                      <h3 className="text-xl font-bold">Vzory ECQB (Few-Shot)</h3>
                    </div>
                    <p className="text-sm opacity-60">
                      AI používá ECQB Sample Annexes jako vzory pro generování otázek ve správném formátu (4 možnosti, jedna správná).
                    </p>
                    <div className="flex gap-2">
                      <span className="px-3 py-1 border border-[var(--line)] rounded-full text-[10px] font-bold opacity-50">PPL(A) Pattern</span>
                      <span className="px-3 py-1 border border-[var(--line)] rounded-full text-[10px] font-bold opacity-50">SPL Pattern</span>
                      <span className="px-3 py-1 border border-[var(--line)] rounded-full text-[10px] font-bold opacity-50">Multiple Choice 4-way</span>
                    </div>
                  </section>

                  {/* Step 3: Generation Interface */}
                  <section className="p-8 border border-indigo-600/30 bg-indigo-600/5 rounded-3xl space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center font-bold text-xs">3</div>
                      <h3 className="text-xl font-bold">Hromadný Generátor (Batch Fill)</h3>
                    </div>
                    
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="col-header">Cílový předmět (Syllabus Scope)</label>
                          <select 
                            value={importSubjectId || ''} 
                            onChange={(e) => setImportSubjectId(Number(e.target.value))}
                            className="w-full p-3 bg-transparent border border-[var(--line)] rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-600"
                          >
                            {subjects.map(s => (
                              <option key={s.id} value={s.id}>{s.name} (Scope: {SYLLABUS_SCOPE[s.id] || 0} LOs)</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="col-header">Počet témat v dávce (Batch Size)</label>
                          <div className="flex gap-2">
                            {[1, 5, 10, 50].map(n => (
                              <button
                                key={n}
                                onClick={() => setBatchSize(n)}
                                className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all ${batchSize === n ? 'bg-indigo-600 text-white border-indigo-600' : 'border-[var(--line)] opacity-60 hover:opacity-100'}`}
                              >
                                {n} {n === 1 ? 'LO' : 'LOs'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="col-header">Otázek na jedno téma (Density)</label>
                          <div className="flex gap-2">
                            {[1, 2, 3, 5].map(n => (
                              <button
                                key={n}
                                onClick={() => setQuestionsPerLO(n)}
                                className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all ${questionsPerLO === n ? 'bg-indigo-600 text-white border-indigo-600' : 'border-[var(--line)] opacity-60 hover:opacity-100'}`}
                              >
                                {n} Qs
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="col-header">Jazyk generování (Target Language)</label>
                          <div className="flex gap-2">
                            {['EN', 'CZ'].map(lang => (
                              <button
                                key={lang}
                                onClick={() => setGenLanguage(lang as 'EN' | 'CZ')}
                                className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all ${genLanguage === lang ? 'bg-indigo-600 text-white border-indigo-600' : 'border-[var(--line)] opacity-60 hover:opacity-100'}`}
                              >
                                {lang === 'EN' ? 'English' : 'Czech'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="p-6 border border-[var(--line)] rounded-2xl bg-white/5 space-y-4">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-bold uppercase tracking-widest opacity-50">Analýza rozsahu předmětu</h4>
                          <span className="text-[10px] font-mono opacity-50">AMC1 FCL.310 Compliance</span>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <p className="text-[10px] opacity-50">Celkem v EASA</p>
                            <p className="text-lg font-bold">{SYLLABUS_SCOPE[importSubjectId || 0] || 0}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[10px] opacity-50">Pokryto v DB</p>
                            <p className="text-lg font-bold text-emerald-600">{coveredLOs.size}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[10px] opacity-50">Zbývá doplnit</p>
                            <p className="text-lg font-bold text-amber-600">{Math.max(0, (SYLLABUS_SCOPE[importSubjectId || 0] || 0) - coveredLOs.size)}</p>
                          </div>
                        </div>

                        <div className="space-y-1 pt-2">
                          <div className="flex justify-between text-[10px] font-bold">
                            <span>Celková naplněnost předmětu</span>
                            <span>{Math.round((coveredLOs.size / (SYLLABUS_SCOPE[importSubjectId || 0] || 1)) * 100)}%</span>
                          </div>
                          <div className="h-1.5 bg-[var(--line)] rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-emerald-500 transition-all duration-1000" 
                              style={{ width: `${(coveredLOs.size / (SYLLABUS_SCOPE[importSubjectId || 0] || 1)) * 100}%` }} 
                            />
                          </div>
                          <div className="mt-3 p-2 bg-slate-50 rounded border border-slate-200">
                            <p className="text-[9px] text-slate-600 leading-relaxed">
                              <strong>Kompletní osnova:</strong> Nyní vidíte progres vůči celému oficiálnímu rozsahu EASA. 
                              Při generování AI automaticky identifikuje chybějící témata a doplňuje je do vaší databáze, dokud nedosáhnete 100%.
                            </p>
                          </div>
                        </div>
                      </div>

                      <button 
                        onClick={handleGenerateQuestions}
                        disabled={isGenerating}
                        className="w-full py-4 bg-indigo-600 text-white rounded-full text-xs font-bold uppercase tracking-widest hover:scale-[1.01] transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isGenerating ? <RotateCcw size={16} className="animate-spin" /> : <Sparkles size={16} />}
                        {isGenerating ? 'Generuji hromadně...' : `Spustit generování (${batchSize} témat)`}
                      </button>
                    </div>

                    {batchResults.length > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6 pt-6 border-t border-indigo-600/20"
                      >
                        <div className="flex justify-between items-center">
                          <h4 className="font-bold text-sm uppercase tracking-widest">Výsledek generování ({batchResults.length} témat)</h4>
                          <button 
                            onClick={saveGeneratedQuestions}
                            className="px-6 py-2 bg-emerald-600 text-white rounded-full text-[10px] font-bold uppercase tracking-widest hover:scale-105 transition-transform"
                          >
                            Uložit vše do databáze
                          </button>
                        </div>

                        <div className="space-y-8">
                          {batchResults.map((result, i) => (
                            <div key={i} className="space-y-3">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 bg-indigo-600 text-white rounded text-[10px] font-bold">{result.loId}</span>
                                <span className="text-xs font-bold opacity-70">{mockLOs.find(l => l.id === result.loId)?.text}</span>
                              </div>
                              <div className="grid grid-cols-1 gap-3 pl-4 border-l-2 border-indigo-600/20">
                                {result.questions.map((q, j) => (
                                  <div key={j} className="p-4 border border-[var(--line)] rounded-2xl space-y-3 bg-white/5">
                                    <p className="text-sm font-bold">{q.text}</p>
                                    <div className="grid grid-cols-2 gap-2">
                                      {['A', 'B', 'C', 'D'].map(opt => {
                                        const key = `option_${opt.toLowerCase()}` as keyof typeof q;
                                        const isCorrect = q.correct_option === opt;
                                        return (
                                          <div key={opt} className={`p-2 rounded-lg border text-[10px] ${isCorrect ? 'border-emerald-500 bg-emerald-500/10' : 'border-[var(--line)] opacity-60'}`}>
                                            <span className="font-bold mr-2">{opt}:</span> {q[key] as string}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </section>
                </div>

                <div className="space-y-6">
                  <div className="p-6 border border-[var(--line)] rounded-2xl space-y-4">
                    <h4 className="col-header">Analýza kapacity</h4>
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-bold">
                          <span>Pokrytí témat (LOs)</span>
                          <span>{Math.round((coveredLOs.size / mockLOs.length) * 100)}%</span>
                        </div>
                        <div className="h-2 bg-[var(--line)] rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-600 transition-all duration-500" style={{ width: `${(coveredLOs.size / mockLOs.length) * 100}%` }} />
                        </div>
                      </div>
                      <p className="text-[10px] opacity-50 leading-relaxed">
                        Aktuálně máte pokryto {coveredLOs.size} z {mockLOs.length} definovaných cílů učení. 
                        Hromadný generátor vám pomůže rychle doplnit chybějící oblasti.
                      </p>
                    </div>
                  </div>

                  <div className="p-6 bg-[var(--ink)] text-[var(--bg)] rounded-2xl space-y-4">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={16} className="text-indigo-400" />
                      <h4 className="text-xs font-bold uppercase tracking-widest">Metodika</h4>
                    </div>
                    <p className="text-[10px] leading-relaxed opacity-70">
                      AI generuje otázky na základě AMC/GM k nařízení (EU) č. 1178/2011. Každá otázka je validována proti textu zákona.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'stats' && (
            <motion.div 
              key="stats"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-12"
            >
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="font-bold text-4xl">Analýza výkonu</h2>
                  <p className="opacity-70 text-base mt-2">Detailní přehled vašich slabých a silných stránek.</p>
                </div>
                <div className="text-right">
                  <p className="col-header">Celkové skóre</p>
                  <p className="text-5xl font-mono font-bold">{stats ? Math.round(stats.overallSuccess * 100) : 0}%</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <section className="space-y-6">
                  <h3 className="uppercase tracking-widest text-xs font-bold opacity-40">Heatmapa témat</h3>
                  <div className="space-y-4">
                    {stats?.subjectStats.map((s, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                          <span>{s.name}</span>
                          <span className="font-mono">{Math.round(s.rate * 100)}%</span>
                        </div>
                        <div className="h-4 bg-[var(--line)] rounded-sm overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${s.rate * 100}%` }}
                            className={`h-full ${s.rate > 0.75 ? 'bg-emerald-500' : s.rate > 0.5 ? 'bg-amber-500' : 'bg-rose-500'}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="p-8 border border-[var(--line)] rounded-3xl flex flex-col items-center justify-center text-center space-y-6">
                  <div className="w-24 h-24 bg-[var(--ink)] text-[var(--bg)] rounded-full flex items-center justify-center">
                    <Trophy size={40} />
                  </div>
                  <div>
                    <h3 className="text-xl font-medium">Jste připraveni?</h3>
                    <p className="text-sm opacity-60 mt-2 leading-relaxed">
                      Vaše průměrná úspěšnost je {stats ? Math.round(stats.overallSuccess * 100) : 0}%. 
                      Pro úspěšné složení zkoušky na ÚCL potřebujete alespoň 75% v každém předmětu.
                    </p>
                  </div>
                  <button 
                    onClick={startExam}
                    className="w-full py-4 bg-[var(--ink)] text-[var(--bg)] rounded-full text-xs font-bold uppercase tracking-widest hover:scale-[1.02] transition-transform"
                  >
                    Spustit ostrou simulaci
                  </button>
                </section>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="p-8 border-t border-[var(--line)] mt-12 opacity-30 text-[10px] uppercase tracking-[0.2em] text-center">
        AeroPilot Exam Prep &copy; 2026 • EASA ECQB Standard • Czech Republic
      </footer>
    </div>
  );
}
