import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  ChevronRight,
  ChevronDown,
  AlertCircle, CheckCircle2, ListTodo,
  XCircle,
  BookOpen,
  GraduationCap,
  Terminal,
  Binary,
  RotateCcw,
  RefreshCw,
  Flag,
  Clock,
  ArrowLeft,
  Trophy,
  Settings,
  Upload,
  Download,
  ShieldCheck,
  User,
  Sparkles,
  Bot,
  HelpCircle,
  Cpu,
  Languages,
  FileJson,
  X,
  ChevronLeft,
  Search,
  Maximize2,
  BarChart3,
  Sun,
  Moon,
  Menu,
  Trash2,
  Filter,
  Brain,
  Heart,
  Copy,
  Check,
  Pencil
} from 'lucide-react';
import { Subject, Question, Stats, ViewMode, DrillSettings } from './types';
import { Spinner } from './components/Spinner';
import { LicenseProgress } from './components/LicenseProgress';
import { LearningEngine } from './lib/LearningEngine';
import { sortQuestions, updateShuffleHistory, SortingConfig } from './services/sortingService';
import {
  getDetailedExplanation,
  getDetailedHumanExplanation,
  translateQuestion,
  verifyApiKey,
  checkDeepSeekBalance,
  checkDeepSeekBalanceProxy,
  generateBatchQuestions,
  EasaLO,
  mockLOs,
  getAllLOs,
  SYLLABUS_SCOPE,
  SUBJECT_NAMES,
  buildSyllabusTree,
  getDynamicSyllabusScope,
  
  getSubjectAnalysis
} from './services/aiService';
import type { AIProvider } from './services/aiService';
import { checkSubjectDuplicates, checkAllDuplicates, findDuplicatesInQuestions } from './utils/duplicateChecker';
import Fuse from 'fuse.js';
import { DynamoDBStatus } from './components/DynamoDBStatus';
import { AdminDashboard } from './components/AdminDashboard';
import { AircademySyllabus } from './components/AircademySyllabus';

// Helper to determine available answer options for a question (some have only A/B or A/B/C)
const getAvailableOptions = (question: Question): ('A' | 'B' | 'C' | 'D')[] => {
  if (question.option_d) return ['A', 'B', 'C', 'D'];
  if (question.option_c) return ['A', 'B', 'C'];
  return ['A', 'B'];
};

// Shuffle utility interfaces and functions
interface ShuffledQuestion {
  originalQuestion: Question;
  shuffleMap: number[]; // e.g. [2, 0, 3, 1]
  displayAnswers: string[];
  displayCorrect: number; // index in displayAnswers
}

const shuffleAnswers = (question: Question): ShuffledQuestion => {
  const result = LearningEngine.shuffleAnswers(question);

  return {
    originalQuestion: question,
    shuffleMap: result.shuffleMap,
    displayAnswers: result.shuffledAnswers,
    displayCorrect: result.correctIndex
  };
};

const checkAnswer = (shuffledQuestion: ShuffledQuestion, userAnswerIndex: number): boolean => {
  const originalIndex = shuffledQuestion.shuffleMap[userAnswerIndex];
  const labels = getAvailableOptions(shuffledQuestion.originalQuestion);
  const originalCorrectIndex = labels.indexOf(shuffledQuestion.originalQuestion.correct_option as any);
  return originalIndex === originalCorrectIndex;
};
import { CognitoAuth } from './components/CognitoAuth';
import { useLanguage, LanguageButton, TranslatedText, TranslatedOption } from './utils/language';
import { markdownToHtml, sanitizeHtml } from './utils/markdown';
import { computeWeights } from './utils/shuffle.weights';
import { AICancellationManager, useAICancellation } from './utils/aiCancellation';
import { LandingPage } from './components/LandingPage';
import { dynamoCache } from './services/dynamoCache';
import { dynamoDBService } from './services/dynamoService';
import { initializeSecureCredentials, initializeAuthenticatedCredentials, initializeGuestCredentials } from './services/secureCredentials';
import { cognitoAuthService, UserRole } from './services/cognitoAuthService';
import { AccessDenied } from './components/AccessDenied';
import { ModelButton, ProviderIcon } from './components/ModelButton';
import { sessionService } from './services/sessionService';
import { SessionRestoreModal } from './components/SessionRestoreModal';
import { DrillSession } from './types/session';


const SUBJECT_DEFS = [
  { id: 1, name: "Air Law", description: "Právní předpisy v oblasti letectví" },
  { id: 2, name: "Human Performance", description: "Lidská výkonnost" },
  { id: 3, name: "Meteorology", description: "Meteorologie" },
  { id: 4, name: "Communications", description: "Komunikace" },
  { id: 5, name: "Principles of Flight", description: "Letové zásady" },
  { id: 6, name: "Operational Procedures", description: "Provozní postupy" },
  { id: 7, name: "Flight Performance", description: "Provedení a plánování letu" },
  { id: 8, name: "Aircraft General", description: "Obecné znalosti o letadle" },
  { id: 9, name: "Navigation", description: "Navigace" }
];

export default function App() {
  // Loading state for auth
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  // True once AWS credentials (and identity ID) are ready for DynamoDB calls.
  // For guests this is immediately true; for authenticated users we wait for
  // initializeAuthenticatedCredentials() to resolve so user.id = identity_id.
  const [isCredentialsReady, setIsCredentialsReady] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    // If we're in the middle of a Cognito callback, we're not ready yet (waiting for exchange)
    if (urlParams.has('code') && (localStorage.getItem('cognito_state') || localStorage.getItem('auth_in_progress'))) {
      return false;
    }
    if (!cognitoAuthService.isAuthenticated()) return true; // guests ready immediately
    return !!sessionStorage.getItem('identity_id'); // ready if identity_id already cached
  });

  // AI cleanup on unmount
  useAICancellation('App');

  // Guest/Login Mode Management
  const [userMode, setUserMode] = useState<'guest' | 'logged-in'>(() => {
    // Zkontroluj, zda se náhodou zrovna nevracíme z Cognito s autentizačním kódem
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('code')) {
      if (localStorage.getItem('cognito_state') || localStorage.getItem('auth_in_progress')) {
        return 'logged-in'; // Zabraň pádu do Guest režimu během callback fáze
      }
    }

    // Check Cognito tokens first
    if (cognitoAuthService.isAuthenticated()) {
      return 'logged-in';
    }
    // Fallback to old token system for migration
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user_data');
    return token && userData ? 'logged-in' : 'guest';
  });

  // Role-based access control
  const [userRole, setUserRole] = useState<UserRole>(() => {
    const role = cognitoAuthService.getUserRole();
    return role;
  });

  // Landing Page Management
  const [showLandingPage, setShowLandingPage] = useState(() => {
    // Check if we're returning from Cognito (has code in URL)
    const urlParams = new URLSearchParams(window.location.search);
    const hasAuthCode = urlParams.has('code');
    const authInProgress = localStorage.getItem('auth_in_progress');

    // Don't show landing page if auth is in progress or we have auth code
    if (hasAuthCode || authInProgress) {
      return false;
    }

    // Show landing page only for first-time guests
    return userMode === 'guest' && !localStorage.getItem('landingPageShown');
  });

  // Cognito Auth Management
  const [isAuthPromptOpen, setIsAuthPromptOpen] = useState(false);
  const [authPromptFeature, setAuthPromptFeature] = useState<'stats' | 'errors' | 'ai' | 'admin'>('stats');

  const showAuthPrompt = (feature: 'stats' | 'errors' | 'ai' | 'admin') => {
    setAuthPromptFeature(feature);
    setIsAuthPromptOpen(true);
  };

  const closeAuthPrompt = () => {
    setIsAuthPromptOpen(false);
  };

  const [view, setView] = useState<ViewMode>('dashboard');
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  // Sync dark mode class to document element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isSettingQuestions, setIsSettingQuestions] = useState(false); // Prevent duplicate setQuestions calls

  // Wrap setQuestions to add debugging
  const debugSetQuestions = (newQuestions: Question[] | ((prev: Question[]) => Question[])) => {
    console.log(`🔧 setQuestions called, type: ${typeof newQuestions}`);
    if (typeof newQuestions === 'function') {
      setQuestions((prev) => {
        const result = newQuestions(prev);
        console.log(`🔧 setQuestions function result - first ID: ${result[0]?.id}, length: ${result.length}`);
        return result;
      });
    } else {
      console.log(`🔧 setQuestions array - first ID: ${newQuestions[0]?.id}, length: ${newQuestions.length}`);
      setQuestions(newQuestions);
    }
  };
  const [originalQuestions, setOriginalQuestions] = useState<Question[]>([]); // Store unfiltered questions
  const [isEcqbPatternsOpen, setIsEcqbPatternsOpen] = useState(false); // ECQB patterns collapsible
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const currentQuestionIndexRef = useRef(0);
  const questionsRef = useRef<Question[]>([]);

  // Keep refs in sync with state for stale-closure-safe async guards
  useEffect(() => { currentQuestionIndexRef.current = currentQuestionIndex; }, [currentQuestionIndex]);
  useEffect(() => { questionsRef.current = questions; }, [questions]);

  // Track when questions or currentQuestionIndex change
  useEffect(() => {
    // console.log(`📍 STATE DEBUG: currentQuestionIndex changed to: ${currentQuestionIndex}`);
  }, [currentQuestionIndex]);

  useEffect(() => {
    // console.log(`📍 STATE DEBUG: questions changed, first question ID: ${questions[0]?.id}, length: ${questions.length}`);
  }, [questions]);
  const [stats, setStats] = useState<Stats | null>(null);
const [isStatsLoading, setIsStatsLoading] = useState(false);

  // Sync actual success rates into subjects state when stats change
  useEffect(() => {
    if (stats?.subjectStats) {
      setSubjects(prev => {
        let hasChanges = false;
        const newSubjects = prev.map(s => {
          const subjectStat = stats.subjectStats[s.id];
          const newRate = subjectStat && subjectStat.totalAnswered > 0 
            ? subjectStat.correctAnswers / subjectStat.totalAnswered 
            : 0;
            
          if (Math.abs((s.success_rate || 0) - newRate) > 0.001) {
            hasChanges = true;
            return { ...s, success_rate: newRate };
          }
          return s;
        });
        return hasChanges ? newSubjects : prev;
      });
    }
  }, [stats]);
  const [answered, setAnswered] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [showQuestionId, setShowQuestionId] = useState(false);
  const [auditMenuOpen, setAuditMenuOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<null | {
    questionId: string;
    dbQuestionId: string;
    text_cz: string;
    options_cz: [string, string, string, string];
    correct_option: string;
    explanation_cz: string;
  }>(null);
  const [editSaving, setEditSaving] = useState(false);
  const auditMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAuditMenuOpen(false);
    setEditingQuestion(null);
  }, [currentQuestionIndex]);

  useEffect(() => {
    if (!auditMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (auditMenuRef.current && !auditMenuRef.current.contains(e.target as Node)) {
        setAuditMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [auditMenuOpen]);

  const [showRawProgressStats, setShowRawProgressStats] = useState(false);
  const [isProgressExpanded, setIsProgressExpanded] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [aiExplanationQuestionId, setAiExplanationQuestionId] = useState<string | number | null>(null);
  const [aiExplanationGeneratedBy, setAiExplanationGeneratedBy] = useState<{ provider: string; model: string } | null>(null);
  const [aiDetectedObjective, setAiDetectedObjective] = useState<string | null>(null);
  const [detailedExplanation, setDetailedExplanation] = useState<string | null>(null);
  const [isGeneratingDetailedExplanation, setIsGeneratingDetailedExplanation] = useState(false);
  const [isGeneratingAiExplanation, setIsGeneratingAiExplanation] = useState(false);
  const [isRegeneratingExplanation, setIsRegeneratingExplanation] = useState(false);
  const [isExpandedLO, setIsExpandedLO] = useState(false);
  const [expandedLOContent, setExpandedLOContent] = useState<{ id: string, text: string, type: string, level?: number } | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [examResults, setExamResults] = useState<{ score: number; total: number } | null>(null);
  const [timer, setTimer] = useState(0);
  const [showExamTypeSelection, setShowExamTypeSelection] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showThankYou, setShowThankYou] = useState(false);

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
        // Ensure excludeAnswered is set, default to false if not present
        if (parsed.excludeAnswered === undefined) {
          parsed.excludeAnswered = false;
        }
        // Ensure weightedLearning is set with defaults if not present
        if (!parsed.weightedLearning) {
          parsed.weightedLearning = {
            enabled: true,
            halflife_days: 7,
            w_performance: 0.50,
            w_decay: 0.30,
            w_difficulty: 0.20
          };
        } else if (parsed.weightedLearning.enabled === undefined) {
          parsed.weightedLearning.enabled = true;
        }
        return {
          ...parsed,
          showCorrectAnswerMode: parsed.showCorrectAnswerMode || false
        };
      } catch (e) {
        // Failed to parse drillSettings
      }
    }
    return {
      sorting: 'weighted_learning',
      immediateFeedback: true,
      showExplanationOnDemand: true,
      sourceFilters: ['user', 'ai'],
      shuffleAnswers: false,
      excludeAnswered: false,
      weightedLearning: {
        enabled: true,
        halflife_days: 7,
        w_performance: 0.50,
        w_decay: 0.30,
        w_difficulty: 0.20
      },
      shuffleHistory: [],
      shuffleHistorySize: 10,
      showCorrectAnswerMode: false
    };
  });

  // Track when drillSettings.sorting changes
  useEffect(() => {
    // console.log(`📍 SORTING DEBUG: drillSettings.sorting changed to: ${drillSettings.sorting}`);
  }, [drillSettings.sorting]);

  // Session Persistence State
  const [pendingSession, setPendingSession] = useState<DrillSession | null>(null);
  const [showSessionRestoreModal, setShowSessionRestoreModal] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(false);
  const sessionSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isRestoringSessionRef = useRef(false);

  // LOs loaded from DB (falls back to mockLOs)
  const [allLOs, setAllLOs] = useState<EasaLO[]>(mockLOs);
  const [losLoading, setLosLoading] = useState(false);

  // AI Generation states
  const [selectedLO, setSelectedLO] = useState<EasaLO>(mockLOs[0]);
  const [batchResults, setBatchResults] = useState<{ loId: string, questions: Partial<Question>[] }[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(true); // Always true for static
  const [batchSize, setBatchSize] = useState<number>(5);

  // Shuffle answers state
  const [shuffledQuestion, setShuffledQuestion] = useState<ShuffledQuestion | null>(null);

  // Reshuffle only when question ID changes or shuffle setting changes (not on questions array metadata updates)
  const currentQuestionId = questions[currentQuestionIndex]?.id;
  useEffect(() => {
    if (questions.length > 0 && currentQuestionIndex >= 0 && currentQuestionIndex < questions.length) {
      const currentQuestion = questions[currentQuestionIndex];
      if (drillSettings.shuffleAnswers) {
        setShuffledQuestion(shuffleAnswers(currentQuestion));
      } else {
        setShuffledQuestion(null);
      }
    }
  }, [currentQuestionIndex, currentQuestionId, drillSettings.shuffleAnswers]);
  const [questionsPerLO, setQuestionsPerLO] = useState<number>(2);
  const [coveredLOs, setCoveredLOs] = useState<Set<string>>(new Set());
  const [globalCoveredLOs, setGlobalCoveredLOs] = useState<Set<string>>(new Set());
  const [actualCoveredLOs, setActualCoveredLOs] = useState<number>(0);
  const [duplicateReport, setDuplicateReport] = useState<any>(null);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [isGeneratingLOs, setIsGeneratingLOs] = useState(false);
  const [loLicenseType, setLoLicenseType] = useState<'PPL(A)' | 'SPL' | 'BOTH'>('BOTH');
  const [generatedLOs, setGeneratedLOs] = useState<EasaLO[]>([]);
  const [useAircademySyllabus, setUseAircademySyllabus] = useState<boolean>(true);
  const [additionalDocumentLinks, setAdditionalDocumentLinks] = useState<string[]>([]);
  const [newDocumentLink, setNewDocumentLink] = useState<string>('');
  const [loControlsExpanded, setLoControlsExpanded] = useState<boolean>(true);
  const [isLOSectionOpen, setIsLOSectionOpen] = useState<boolean>(false);

  // Text Search State
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedLicense, setSelectedLicense] = useState<'PPL' | 'SPL' | 'BOTH' | 'KL'>(() => {
    return (localStorage.getItem('selectedLicense') as 'PPL' | 'SPL' | 'BOTH' | 'KL') || 'BOTH';
  });
  const [selectedLicenseSubtype, setSelectedLicenseSubtype] = useState<string>(() => {
    const stored = localStorage.getItem('selectedLicenseSubtype');
    const subcat = localStorage.getItem('selectedSubcategory');
    // Check for Medlánky first
    if (subcat === 'Medlánky' || stored === 'MEDLANKY') return 'MEDLANKY';
    if (stored && ['ALL', 'PPL(A)', 'LAPL(A)', 'PPL(H)', 'LAPL(H)', 'SPL', 'LAPL(S)', 'BPL', 'LAPL(B)', 'KL', 'MEDLANKY'].includes(stored)) return stored;
    // Fallback: if we only had 'PPL' or 'SPL' or nothing
    const broad = localStorage.getItem('selectedLicense');
    return broad === 'SPL' ? 'SPL' : 'PPL(A)';
  });
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>(() => {
    return localStorage.getItem('selectedSubcategory') || 'ALL';
  });

  // Force re-render of subject list when license changes (counts are computed in display logic)
  const [, forceSubjectRerender] = useState(0);
  useEffect(() => {
    forceSubjectRerender(v => v + 1);
  }, [selectedLicense, selectedLicenseSubtype]);

  // Syllabus Browser state
  const [syllabusOpen, setSyllabusOpen] = useState(false);
  const [focusedLOId, setFocusedLOId] = useState<string | null>(null);
  const [syllabusSelectedLO, setSyllabusSelectedLO] = useState<string | null>(null);
  const [syllabusLOQuestions, setSyllabusLOQuestions] = useState<any[]>([]);
  const [syllabusLOQuestionsLoading, setSyllabusLOQuestionsLoading] = useState(false);
  const [syllabusExpandedSubjects, setSyllabusExpandedSubjects] = useState<Set<number>>(new Set());
  const [syllabusExpandedTopics, setSyllabusExpandedTopics] = useState<Set<string>>(new Set());
  const [syllabusExpandedSubtopics, setSyllabusExpandedSubtopics] = useState<Set<string>>(new Set());
  const [syllabusLicenseFilter, setSyllabusLicenseFilter] = useState<'ALL' | 'PPL' | 'SPL'>('ALL');
  const [syllabusLicenseFilterSubtype, setSyllabusLicenseFilterSubtype] = useState<string>('ALL');
  const [syllabusSearch, setSyllabusSearch] = useState('');

  // Memoized list of LOs that match current syllabus filters (search + license)
  const activeSyllabusLOs = React.useMemo(() => {
    const term = syllabusSearch.toLowerCase();
    return allLOs.filter(lo => {
      // 1. Search term match
      if (term) {
        const matches = (lo.id || '').toLowerCase().includes(term) ||
          (lo.text || '').toLowerCase().includes(term) ||
          (lo.knowledgeContent || '').toLowerCase().includes(term) ||
          (lo.context || '').toLowerCase().includes(term);
        if (!matches) return false;
      }
      // 2. License filter match (matches logic in Syllabus view)
      if (syllabusLicenseFilter === 'ALL') return true;
      return (lo.applies_to || ['PPL', 'SPL']).includes(syllabusLicenseFilter);
    });
  }, [allLOs, syllabusSearch, syllabusLicenseFilter]);

  const [isNavigatingSyllabus, setIsNavigatingSyllabus] = useState(false);

  const handleNavigateSyllabus = async (direction: 'next' | 'prev') => {
    if (!expandedSyllabusQuestion || isNavigatingSyllabus) return;

    const qIndex = syllabusLOQuestions.findIndex(q => (q.questionId || q.id) === (expandedSyllabusQuestion.questionId || expandedSyllabusQuestion.id));

    // CASE 1: Still in same LO
    if (direction === 'next' && qIndex < syllabusLOQuestions.length - 1) {
      setExpandedSyllabusQuestion(syllabusLOQuestions[qIndex + 1]);
      return;
    }
    if (direction === 'prev' && qIndex > 0) {
      setExpandedSyllabusQuestion(syllabusLOQuestions[qIndex - 1]);
      return;
    }

    // CASE 2: Jump to another LO
    const currentLoId = expandedSyllabusQuestion.loId;
    const loIdx = activeSyllabusLOs.findIndex(l => l.id === currentLoId);

    if (loIdx === -1) return; // Should not happen

    setIsNavigatingSyllabus(true);
    try {
      let nextStep = direction === 'next' ? 1 : -1;
      let targetLoIdx = loIdx + nextStep;

      // Scan through LOs until we find one with questions
      while (targetLoIdx >= 0 && targetLoIdx < activeSyllabusLOs.length) {
        const nextLo = activeSyllabusLOs[targetLoIdx];
        const resp = await dynamoDBService.getQuestionsByLO(nextLo.id);

        if (resp.success && resp.data && resp.data.length > 0) {
          // Found matching questions!
          const q = direction === 'next' ? resp.data[0] : resp.data[resp.data.length - 1];
          const mapped = {
            ...q,
            id: q.questionId || q.id,
            text: q.question || q.text,
            answers: q.answers || q.options || [],
            correct_answer: q.correct !== undefined ? q.correct : (q.correct_answer ?? q.correctAnswer),
            _sourceLayoutId: `syllabus-q-${q.questionId || q.id}`
          };
          setSyllabusSelectedLO(nextLo.id);
          setExpandedSyllabusQuestion(mapped);
          setIsNavigatingSyllabus(false);
          return;
        }
        targetLoIdx += nextStep;
      }
    } catch (e) {
      console.error('Error in LO jump:', e);
    }
    setIsNavigatingSyllabus(false);
  };

  const [expandedSyllabusQuestion, setExpandedSyllabusQuestion] = useState<any | null>(null);
  const [syllabusGeneratingLO, setSyllabusGeneratingLO] = useState<string | null>(null);
  const [syllabusGeneratedQuestion, setSyllabusGeneratedQuestion] = useState<{ loId: string; question: Partial<Question> } | null>(null);

  useEffect(() => {
    if (!syllabusSelectedLO) { setSyllabusLOQuestions([]); return; }
    setSyllabusLOQuestionsLoading(true);
    dynamoDBService.getQuestionsByLO(syllabusSelectedLO)
      .then(r => {
        const mapped = (r.data || []).map((q: any) => ({
          ...q,
          id: q.questionId || q.id,
          text: q.question || q.text,
          answers: q.answers || q.options || [],
          correct_answer: q.correct !== undefined ? q.correct : (q.correct_answer ?? q.correctAnswer),
          _sourceLayoutId: `syllabus-q-${q.questionId || q.id}`
        }));
        setSyllabusLOQuestions(mapped);
      })
      .finally(() => setSyllabusLOQuestionsLoading(false));
  }, [syllabusSelectedLO]);

  // Keyboard navigation for Expanded Syllabus Question Modal
  useEffect(() => {
    if (!expandedSyllabusQuestion) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const qIndex = syllabusLOQuestions.findIndex(q => (q.questionId || q.id) === (expandedSyllabusQuestion.questionId || expandedSyllabusQuestion.id));
        if (qIndex === -1) return;

        if (e.key === 'ArrowLeft' && qIndex > 0) {
          setExpandedSyllabusQuestion(syllabusLOQuestions[qIndex - 1]);
        } else if (e.key === 'ArrowRight' && qIndex < syllabusLOQuestions.length - 1) {
          setExpandedSyllabusQuestion(syllabusLOQuestions[qIndex + 1]);
        }
      } else if (e.key === 'Escape') {
        setExpandedSyllabusQuestion(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expandedSyllabusQuestion, syllabusLOQuestions]);

  // Import states
  const [importSubjectId, setImportSubjectId] = useState<number | null>(null);
  const [importJson, setImportJson] = useState('');
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [clearExisting, setClearExisting] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [isImportSectionOpen, setIsImportSectionOpen] = useState(false);
  const [userApiKey, setUserApiKey] = useState(() => localStorage.getItem('userApiKey') || '');
  const [claudeApiKey, setClaudeApiKey] = useState(() => localStorage.getItem('claudeApiKey') || '');
  const [deepseekApiKey, setDeepseekApiKey] = useState(() => localStorage.getItem('deepseekApiKey') || '');

  // AI Proxy — used when user has no own DeepSeek key
  const AI_PROXY_URL = (import.meta as any).env?.VITE_AI_PROXY_URL as string | undefined;
  const getProxyParams = () => ({
    proxyUrl: AI_PROXY_URL,
    idToken: cognitoAuthService.getTokens()?.access_token,
  });
  const getProxyIdToken = async (): Promise<string | undefined> => {
    if (!cognitoAuthService.isTokenValid()) {
      await cognitoAuthService.refreshAccessToken();
    }
    return cognitoAuthService.getTokens()?.access_token;
  };
  // For authenticated users: always start with 'deepseek' default, DB will overwrite via syncUserData.
  // For guests: use localStorage value.
  const isAuthenticatedInit = cognitoAuthService.isAuthenticated();
  const [aiProvider, setAiProvider] = useState<AIProvider>(() => {
    if (isAuthenticatedInit) return 'deepseek'; // DB is source of truth, will be set by syncUserData
    const saved = localStorage.getItem('aiProvider');
    return (saved === 'gemini' ? 'gemini' : saved === 'claude' ? 'claude' : 'deepseek') as AIProvider;
  });
  const [aiModel, setAiModel] = useState(() => {
    if (isAuthenticatedInit) return 'deepseek-chat'; // DB is source of truth, will be set by syncUserData
    const saved = localStorage.getItem('aiModel');
    // Migrate old/invalid model names to current supported models
    const modelMap: Record<string, string> = {
      'gemini-3-flash-preview': 'gemini-3.1-flash-lite-preview',
      'gemini-3.1-pro-preview': 'gemini-3.1-pro-preview',
      'gemini-pro': 'gemini-2.5-pro',
      'gemini-1.5-flash': 'gemini-2.5-flash',
      'gemini-1.5-flash-latest': 'gemini-flash-latest',
      'gemini-2.0-flash-exp': 'gemini-2.5-flash',
      'gemini-2.0-flash': 'gemini-2.5-flash',
      'gemini-1.0-pro': 'gemini-2.5-pro',
      'claude-3-5-sonnet-20241022': 'claude-sonnet-4-6',
      'claude-3-5-haiku-20241022': 'claude-haiku-4-5-20251001',
      'claude-3-haiku-20240307': 'claude-haiku-4-5-20251001',
      'claude-3-opus-20240229': 'claude-opus-4-6',
      'claude-4-6-sonnet-20260217': 'claude-sonnet-4-6',
      'claude-4-5-haiku-20251015': 'claude-haiku-4-5-20251001',
      'claude-4-6-opus-20260205': 'claude-opus-4-6',
    };

    // Clean up old models and migrate
    if (saved && modelMap[saved]) {
      localStorage.setItem('aiModel', modelMap[saved]);
      return modelMap[saved];
    }

    return saved || 'deepseek-chat';
  });
  const [isVerifyingKey, setIsVerifyingKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth State - restore user from localStorage on init
  const [user, setUser] = useState<{ id: string, username: string } | null>(() => {
    try {
      // Try Cognito auth first
      const cognitoUser = cognitoAuthService.getCurrentUser();
      if (cognitoUser) {
        // Use cached identity_id from sessionStorage when available (set after first successful
        // credential init). This ensures syncUserData on refresh uses the correct DynamoDB PK
        // (USER#identityId) immediately, instead of the temporary Cognito sub which would
        // query the wrong partition and wipe localStorage stats with empty results.
        const cachedIdentityId = sessionStorage.getItem('identity_id');
        const id = cachedIdentityId || cognitoUser.id;
        return { id, username: cognitoUser.username };
      }

      // Fallback to old system
      const saved = localStorage.getItem('user_data');
      if (saved) {
        const data = JSON.parse(saved);
        return { id: '1', username: data.username || data.id };
      }
    } catch (e) { }
    return null;
  });
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));

  // Guard against duplicate syncUserData calls
  const isSyncingRef = useRef(false);

  // Engine instance (we use it for logic, but keep state in React for reactivity)
  const [examAnswers, setExamAnswers] = useState<Record<number, string>>({});

  // Language management with centralized hook
  const language = useLanguage(
    questions,
    currentQuestionIndex,
    aiProvider,
    aiModel,
    userApiKey,
    claudeApiKey,
    deepseekApiKey,
    setUserApiKey,
    setClaudeApiKey,
    setDeepseekApiKey,
    setAiProvider,
    setQuestions,
    AI_PROXY_URL,
    cognitoAuthService.getTokens()?.access_token
  );

  useEffect(() => {
    if (token) {
      fetchMe();
    }
  }, [token]);

  const fetchMe = async () => {
    try {
      const saved = localStorage.getItem('user_data');
      if (saved) {
        const data = JSON.parse(saved);
        setUser({ id: '1', username: data.username || data.id });
      }
    } catch (error) {
      setToken(null);
      localStorage.removeItem('token');
      localStorage.removeItem('user_data');
      setUser(null);
    }
  };


  const getAIErrorMessage = (error: any): string => {
    const msg: string = error?.message || '';
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
      return 'Překročen limit API požadavků. Zkuste to za chvíli.';
    }
    if (msg.includes('DEEPSEEK_INSUFFICIENT_BALANCE') || msg.includes('402')) {
      return 'DeepSeek účet nemá dostatečný kredit. Dobijte zůstatek na platform.deepseek.com.';
    }
    if (msg.includes('401') || msg.includes('403') || msg.includes('API key') || msg.includes('API_KEY_INVALID')) {
      return 'Neplatný API klíč.';
    }
    if (msg.includes('cancelled') || msg.includes('cancel')) {
      return '';
    }
    if (msg.includes('proxy error') || msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('405')) {
      return 'Proxy připojení selhalo. Zkouší se záložní AI provider.';
    }
    return 'Nepodařilo se vygenerovat vysvětlení. Zkuste to znovu.';
  };

  const handleLogout = async () => {
  const uid = user?.id || 'guest';
  await fullyResetUserProgress(uid, isGuestMode);

    // Clear old system
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user_data');
    setUser(null);
    setUserMode('guest');
    setView('dashboard');

    // Use Cognito logout
    cognitoAuthService.logout();

    // Reset landing page and role for next session
    localStorage.removeItem('landingPageShown');
    setShowLandingPage(true);
    setUserRole('guest');
  };

  // Guest mode functions
  const switchToGuestMode = async (fromLanding = false) => {
  const uid = user?.id || 'guest';
  await fullyResetUserProgress(uid, true);

  setUserMode('guest');
  setToken(null);
  localStorage.removeItem('token');
  setUser(null);
  if (fromLanding) {
    localStorage.setItem('landingPageShown', 'true');
    setShowLandingPage(false);
    setView('dashboard');
  }
};

  const handleLandingGuestMode = () => switchToGuestMode(true);

  const handleLandingAuthSuccess = async (userData: { id: string; username: string; email?: string }) => {
    // Mark landing page as shown
    localStorage.setItem('landingPageShown', 'true');
    setShowLandingPage(false);

    // Initialize authenticated credentials to get Identity Pool identity ID
    const success = await initializeAuthenticatedCredentials();
    if (!success) initializeGuestCredentials();
    dynamoDBService.reinitialize();
    setIsCredentialsReady(true); // Prevent double initialization

    // Use Identity Pool identity ID as userId (enables IAM fine-grained access)
    const identityId = cognitoAuthService.getIdentityId() || userData.id;

    // Set user state
    setUser({ id: identityId, username: userData.username });
    setUserMode('logged-in');
    setUserRole(cognitoAuthService.getUserRole());
    setView('dashboard');

    // Fetch data from DynamoDB now that we are authenticated
    syncUserData();
    setLosLoading(true);
    getAllLOs().then(los => {
      if (los && los.length > 0) setAllLOs(los);
    }).finally(() => setLosLoading(false));

    // Save user profile to DynamoDB
    await dynamoDBService.saveCognitoUserProfile({
      userId: identityId,
      username: userData.username,
      email: userData.email
    });
  };

  // Helper functions
  const isGuestMode = userMode === 'guest';
  const isLoggedIn = userMode === 'logged-in' && user;

  // Session Restore Handlers
  const handleContinueSession = async () => {
    if (!pendingSession) return;
    
    setIsRestoringSession(true);
    isRestoringSessionRef.current = true;
    setShowSessionRestoreModal(false);

    try {
      // Load questions based on session type
      let loadedQuestions: Question[] = [];
      
      if (pendingSession.type === 'drill' && pendingSession.subjectId) {
        loadedQuestions = await loadStaticQuestions(pendingSession.subjectId);
      } else if (pendingSession.type === 'mix') {
        // Load all questions for mix mode
        const splSubjects = [1, 2, 3, 4, 5, 9];
        const subjectsToLoad = pendingSession.license === 'SPL'
          ? subjects.filter(s => splSubjects.includes(s.id))
          : subjects;
        
        for (const subject of subjectsToLoad) {
          const qs = await loadStaticQuestions(subject.id);
          // Filter questions by license for KL
          if (pendingSession.license === 'KL') {
            const filtered = qs.filter(q => {
              const appliesTo = q.metadata?.applies_to || ['PPL', 'SPL'];
              return appliesTo.includes('KL');
            });
            loadedQuestions.push(...filtered);
          } else {
            loadedQuestions.push(...qs);
          }
        }
      }

      // Reorder questions to match stored order
      console.log('🔄 Session restore: storedIds sample:', pendingSession.questionIds.slice(0, 3));
      console.log('🔄 Session restore: loadedQuestions sample ids:', loadedQuestions.slice(0, 3).map(q => q.id));
      const orderedQuestions = pendingSession.questionIds.map(storedId => {
        // Support both legacy Q#XXXXX format and new compositeId format
        const legacyMatch = storedId.match(/^Q#(\d+)$/);
        if (legacyMatch) {
          const numId = parseInt(legacyMatch[1], 10);
          return loadedQuestions.find(q => String(q.id) === String(numId) || String(q.questionId) === String(numId));
        }
        // Also try stripping Q# prefix for composite IDs stored with prefix
        const strippedId = storedId.startsWith('Q#') ? storedId.slice(2) : storedId;
        return loadedQuestions.find(q => String(q.id) === storedId || String(q.questionId) === storedId
          || String(q.id) === strippedId || String(q.questionId) === strippedId);
      }).filter((q): q is Question => q !== undefined);
      console.log('🔄 Session restore: matched', orderedQuestions.length, '/', pendingSession.questionIds.length, 'questions');
      // Fallback: if no questions matched, use all loaded questions from session start
      const finalQuestions = orderedQuestions.length > 0 ? orderedQuestions : loadedQuestions;

      // Apply stored drill settings
      setDrillSettings(pendingSession.drillSettings);

      // Set up the session state
      setOriginalQuestions(finalQuestions);
      setQuestions(finalQuestions);
      setCurrentQuestionIndex(pendingSession.currentIndex);
      setSelectedSubject(pendingSession.type === 'drill' && pendingSession.subjectId
        ? subjects.find(s => s.id === pendingSession.subjectId) || { id: pendingSession.subjectId, name: 'Předmět', question_count: orderedQuestions.length, success_rate: 0 }
        : { id: 0, name: 'Mix', question_count: orderedQuestions.length, success_rate: 0 }
      );

      // Set current session ID
      sessionService.setCurrentSessionId(pendingSession.sessionId);

      // Clear pending session
      setPendingSession(null);
      
      // Show toast notification
      console.log('✅ Session restored from', pendingSession.lastActivity);

      // Navigate to drill view
      setView('drill');
    } catch (err) {
      console.error('Failed to restore session:', err);
      alert('Nepodařilo se obnovit relaci. Začínáme znovu.');
      setPendingSession(null);
    } finally {
      setIsRestoringSession(false);
      // Clear ref after a tick so the filter useEffect sees it and skips re-filtering
      setTimeout(() => { isRestoringSessionRef.current = false; }, 100);
    }
  };

  const handleRestartSession = async () => {
    if (!pendingSession) return;
    
    // Delete the session
    if (!isGuestMode && user?.id) {
      await sessionService.deleteSession(String(user.id), pendingSession.sessionId);
    }
    
    setPendingSession(null);
    setShowSessionRestoreModal(false);
    sessionService.setCurrentSessionId(null);
  };

  const handleDismissSessionModal = () => {
    setShowSessionRestoreModal(false);
    // Don't clear pendingSession - user can re-open modal later
  };

  useEffect(() => {
    // Initialize credentials based on authentication status
    const initializeCredentials = async () => {
      // Ignoruj standardní inicializaci, pokud zpracováváme autentizační kód v callbacku z Cognito
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('code')) {
        if (localStorage.getItem('cognito_state') || localStorage.getItem('auth_in_progress')) {
          console.log('🔄 Skipping standard credential init: Auth callback in progress...');
          return;
        } else {
          console.log('⚠️ Found stale auth code without active state. Cleaning URL and proceeding...');
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }

      if (cognitoAuthService.isAuthenticated()) {
        // Always initialize authenticated credentials (even on refresh) so DynamoDB client has valid credentials.
        // Only skip setIsCredentialsReady if already true to avoid re-triggering the effect.
        console.log('🔄 Initializing authenticated credentials...');

        // If access_token is missing/expired (e.g. new tab opened with only localStorage tokens),
        // refresh it via Lambda before initializing AWS credentials. This ensures id_token passed
        // to Cognito Identity Pool is fresh enough to get valid AWS credentials.
        if (!cognitoAuthService.isTokenValid()) {
          console.log('🔄 Access token expired/missing – refreshing via Lambda...');
          await cognitoAuthService.refreshAccessToken();
        }

        const success = await initializeAuthenticatedCredentials();
        if (!success) {
          console.log('🔄 Falling back to guest credentials...');
          initializeGuestCredentials();
          if (!isCredentialsReady) setIsCredentialsReady(true);
        } else {
          dynamoDBService.reinitialize();
          // Eagerly fetch credentials if identityId not cached yet
          if (!cognitoAuthService.getIdentityId()) {
            await cognitoAuthService.getAWSCredentials();
          }
          const identityId = cognitoAuthService.getIdentityId();
          if (identityId) {
            setUser((prev: { id: string, username: string } | null) => prev ? { ...prev, id: identityId } : null);
          }
          if (!isCredentialsReady) setIsCredentialsReady(true);
          else {
            // Force syncUserData with updated user ID
            setTimeout(() => syncUserData(), 100);
          }
        }
      } else {
        // User is not authenticated, use guest credentials
        console.log('🔄 Initializing guest credentials...');
        initializeGuestCredentials();
        setIsCredentialsReady(true);
      }
    };

    initializeCredentials();
  }, [userMode]); // Re-run when userMode changes

  useEffect(() => {
    loadStaticSubjects();
    loadStaticStats(); // Load persisted stats first (fast)

    // Set auth loading to false after initialization
    setIsAuthLoading(false);

    if (isGuestMode) {
      initializeGuestSession();
    }
  }, []);

  useEffect(() => {
    if (!isCredentialsReady) return;

    syncUserData();    // Then fetch live question counts and user progress from DynamoDB
    // Load LOs from DB (with fallback to mockLOs)
    setLosLoading(true);

    getAllLOs().then(los => {
      if (los && los.length > 0) setAllLOs(los);
    }).finally(() => setLosLoading(false));

    // Check for active session to restore (only for logged-in users)
    if (!isGuestMode && user?.id) {
      sessionService.checkForActiveSession(String(user.id)).then(session => {
        if (session && !sessionService.isExpired(session)) {
          setPendingSession(session);
          setShowSessionRestoreModal(true);
        }
      });
    }
  }, [isCredentialsReady]);

  // Load selected subject from localStorage for guest mode
  useEffect(() => {
    if (isGuestMode) {
      const savedSubject = localStorage.getItem(`${user?.id || 'guest'}:selectedSubject`);
      if (savedSubject) {
        try {
          const subject = JSON.parse(savedSubject);
          setSelectedSubject(subject);
        } catch (error) {
          console.error('Failed to parse saved subject:', error);
        }
      }
    }
  }, [isGuestMode, user?.id]);

  // Initialize guest session
  const initializeGuestSession = () => {
    const key = `${user?.id || 'guest'}:session_start`;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, new Date().toISOString());
    }
  };

  // Load guest stats
  const loadGuestStats = () => {
    const uid = user?.id || 'guest';
    const guestStats = JSON.parse(localStorage.getItem(`${uid}:guest_stats`) || '{}');
    const userStats = JSON.parse(localStorage.getItem(`${uid}:user_stats`) || '{}');
    if (guestStats.totalAnswers > 0) {
      return {
        totalAnswers: guestStats.totalAnswers,
        correctAnswers: guestStats.correctAnswers,
        overallSuccess: guestStats.successRate,
        practicedQuestions: guestStats.totalAnswers,
        totalQuestions: guestStats.totalAnswers,
        subjectStats: userStats.subjectStats || {}
      };
    }
    return null;
  };

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  useEffect(() => {
    // Load API keys from localStorage as backup only (DynamoDB is primary storage)
    const uid = user?.id || 'guest';
    const savedGemini = localStorage.getItem(`${uid}:userApiKey`);
    const savedClaude = localStorage.getItem(`${uid}:claudeApiKey`);
    const savedDeepseek = localStorage.getItem(`${uid}:deepseekApiKey`);

    // Only use localStorage if DynamoDB hasn't loaded keys yet (fallback)
    if (!userApiKey && savedGemini) setUserApiKey(savedGemini);
    if (!claudeApiKey && savedClaude) setClaudeApiKey(savedClaude);
    if (!deepseekApiKey && savedDeepseek) setDeepseekApiKey(savedDeepseek);

    setKeyStatus('idle');
  }, [user]);

  useEffect(() => {
    localStorage.setItem('aiProvider', aiProvider);
  }, [aiProvider]);

  useEffect(() => {
    localStorage.setItem('aiModel', aiModel);
  }, [aiModel]);

  // Admin function to refresh explanation cache
  const handleRefreshExplanation = async (questionId: string, subjectId: number) => {
    if (userRole !== 'admin') {
      alert('Tato funkce je jen pro adminy');
      return;
    }

    if (!confirm(`Opravdu chcete smazat cache pro otázku ${questionId}? Tím se přegeneruje vysvětlení.`)) {
      return;
    }

    try {
      const cacheKey = `${subjectId}_${questionId}`;
      const result = await dynamoDBService.refreshExplanation(cacheKey, aiModel);

      if (result.success) {
        alert(`✅ Cache smazána. Vysvětlení se přegeneruje při dalším načtení.`);
        // Clear local state to force regeneration
        setAiExplanation('');
        setDetailedExplanation('');
      } else {
        alert(`❌ Cache refresh selhal: ${result.error}`);
      }
    } catch (error) {
      alert('Cache refresh selhal. Zkontrolujte konzoli.');
    }
  };

  // Credentials are now initialized in the main startup useEffect above

  // Settings Ready Flag ensures we only write to DynamoDB after reading
  const [settingsLoadedUserId, setSettingsLoadedUserId] = useState<string | null>(null);

  useEffect(() => {
    // Reset model when provider changes — but only after DB settings are loaded
    // (for authenticated users) to avoid overwriting DB values during init
    if (!isGuestMode && !settingsLoadedUserId) return;
    if (aiProvider === 'gemini' && !aiModel.startsWith('gemini')) {
      setAiModel('gemini-flash-latest');
    } else if (aiProvider === 'claude' && !aiModel.startsWith('claude')) {
      setAiModel('claude-sonnet-4-6');
    } else if (aiProvider === 'deepseek' && !aiModel.startsWith('deepseek')) {
      setAiModel('deepseek-chat');
    }
  }, [aiProvider, aiModel, isGuestMode, settingsLoadedUserId]);

  // Model validation and migration is handled in useState init (line ~600).

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
    // For DeepSeek with proxy, we don't need a key
    if (aiProvider === 'deepseek' && !deepseekApiKey && getProxyParams().idToken) {
      setIsVerifyingKey(true);
      setKeyStatus('idle');
      try {
        // Test proxy connection
        const proxyParams = getProxyParams();
        const testResult = await dynamoDBService.testProxyConnection(proxyParams.proxyUrl!, proxyParams.idToken!);

        if (testResult.success) {
          setKeyStatus('valid');

          // Check proxy balance
          try {
            const balanceResult = await checkDeepSeekBalanceProxy(proxyParams.proxyUrl!, proxyParams.idToken!);
            if (balanceResult.success) {
              alert(`✅ Proxy připojení je funkční.\n💰 Zůstatek proxy klíče: ${balanceResult.balance}\n(Používá se testovací klíč)`);
            } else {
              alert(`✅ Proxy připojení je funkční.\n⚠️ Nepodařilo se zjistit zůstatek: ${balanceResult.error}\n(Používá se testovací klíč)`);
            }
          } catch (balanceError: any) {
            console.warn('Balance check failed:', balanceError);
            alert('✅ Proxy připojení je funkční. Používá se testovací klíč.');
          }
        } else {
          setKeyStatus('invalid');
          alert(`❌ Proxy připojení selhalo: ${testResult.error}`);
        }
      } catch (error: any) {
        setKeyStatus('invalid');
        alert('Chyba při ověřování proxy připojení. Zkuste to prosím později.');
      } finally {
        setIsVerifyingKey(false);
      }
      return;
    }

    // For DeepSeek with own key, verify key first, then show balance as info
    if (aiProvider === 'deepseek' && deepseekApiKey) {
      setIsVerifyingKey(true);
      setKeyStatus('idle');
      try {
        // First verify the key is valid via /models endpoint
        const verifyResult = await verifyApiKey(deepseekApiKey, 'deepseek');

        if (verifyResult.success) {
          setKeyStatus('valid');
          // Then try to get balance as bonus info (non-blocking)
          try {
            const balanceResult = await checkDeepSeekBalance(deepseekApiKey);
            if (balanceResult.success) {
              alert(`✅ DeepSeek API klíč je platný.\n💰 Zůstatek: ${balanceResult.balance}\nKlíč byl uložen.`);
            } else {
              alert(`✅ DeepSeek API klíč je platný.\n⚠️ Zůstatek: ${balanceResult.error}\nKlíč byl uložen.`);
            }
          } catch {
            alert('✅ DeepSeek API klíč je platný.\nKlíč byl uložen.');
          }
        } else {
          setKeyStatus('invalid');
          alert(`❌ API klíč není platný: ${verifyResult.error}`);
        }
      } catch (error: any) {
        setKeyStatus('invalid');
        alert('Chyba při ověřování DeepSeek API klíče. Zkuste to prosím později.');
      } finally {
        setIsVerifyingKey(false);
      }
      return;
    }

    // Original logic for Gemini and Claude - keep unchanged
    const currentApiKey = aiProvider === 'gemini' ? userApiKey : aiProvider === 'claude' ? claudeApiKey : undefined;
    if (!currentApiKey) return;
    setIsVerifyingKey(true);
    setKeyStatus('idle');
    try {
      const result = await verifyApiKey(currentApiKey, aiProvider);

      if (result.success) {
        setKeyStatus('valid');
        const providerName = aiProvider === 'gemini' ? 'Gemini' : 'Claude';
        alert(`✅ API klíč pro ${providerName} je platný a byl uložen.`);
      } else {
        setKeyStatus('invalid');
        alert(`❌ ${result.error || 'Vložený API klíč není platný.'}`);
      }
    } catch (err: any) {
      setKeyStatus('invalid');
      alert('Chyba při ověřování API klíče. Zkuste to prosím později.');
    } finally {
      setIsVerifyingKey(false);
    }
  };


  // Immediately save all settings to DB (used when user explicitly changes settings)
  const saveSettingsImmediate = useCallback((updates: Partial<{ aiProvider: AIProvider; aiModel: string; drillSettings: DrillSettings }>) => {
    if (!isGuestMode && user?.id) {
      const settingsToSave = {
        userApiKey,
        claudeApiKey,
        deepseekApiKey,
        aiProvider: updates.aiProvider ?? aiProvider,
        aiModel: updates.aiModel ?? aiModel,
        ...(updates.drillSettings ?? drillSettings)
      };
      dynamoDBService.saveApiKeys(String(user.id), settingsToSave).catch(() => { /* silent fail */ });
    }
  }, [isGuestMode, user?.id, userApiKey, claudeApiKey, deepseekApiKey, aiProvider, aiModel, drillSettings]);

  // Persist settings to localStorage and DynamoDB
  // For authenticated users, only write AFTER DB settings have been loaded (settingsLoadedUserId)
  // to prevent stale localStorage values from overwriting the DB source of truth.
  useEffect(() => {
    const isSettingsReady = isGuestMode || settingsLoadedUserId === String(user?.id || '');
    if (!isSettingsReady) return;

    // Persist to localStorage
    localStorage.setItem('drillSettings', JSON.stringify(drillSettings));
    if (aiProvider) localStorage.setItem('aiProvider', aiProvider);
    if (aiModel) localStorage.setItem('aiModel', aiModel);
    if (userApiKey) localStorage.setItem('userApiKey', userApiKey);
    if (claudeApiKey) localStorage.setItem('claudeApiKey', claudeApiKey);
    if (deepseekApiKey) localStorage.setItem('deepseekApiKey', deepseekApiKey);

    // Sync to DynamoDB for authenticated users
    if (!isGuestMode && user?.id) {
      dynamoDBService.saveApiKeys(String(user.id), {
        userApiKey,
        claudeApiKey,
        deepseekApiKey,
        aiProvider,
        aiModel,
        ...drillSettings
      }).catch(() => { /* silent fail */ });
    }
  }, [drillSettings, user?.id, userApiKey, claudeApiKey, deepseekApiKey, aiProvider, aiModel, isGuestMode, settingsLoadedUserId]);


  // Settings loading is handled in syncUserData() which already reads the full user profile
  // and hydrates aiProvider, aiModel, API keys, and drillSettings from DB.

  // Fetch cloud data on login
  useEffect(() => {
    if (!isGuestMode && user?.id && isCredentialsReady) {
      console.log('🔄 Fetching user data from cloud...');
      const userId = String(user.id);

      // 1. Fetch Flags
      dynamoDBService.getQuestionFlags(userId).then(response => {
        const localFlags: Record<string, any> = JSON.parse(localStorage.getItem('question_flags') || '{}');
        const dbFlags: Record<string, any> = (response.success && response.data?.flags) ? response.data.flags : {};

        if (response.success) {
          console.log(`✅ Loaded ${Object.keys(dbFlags).length} flags from cloud`);
        }

        // Push any locally flagged questions missing in DynamoDB (catch-up)
        for (const [qid, flagData] of Object.entries(localFlags)) {
          const isFlagged = typeof flagData === 'object' && flagData !== null ? !!flagData.isFlagged : !!flagData;
          if (isFlagged && !dbFlags[qid]) {
            console.log(`🔄 Flag catch-up: pushing flag for ${qid}`);
            dynamoDBService.toggleQuestionFlag(userId, qid, true).catch(() => {});
          }
        }

        // Merge: DB wins for items present in both
        const mergedFlags = { ...localFlags, ...dbFlags };
        localStorage.setItem('question_flags', JSON.stringify(mergedFlags));
      }).catch(() => { });


    }
  }, [user?.id, isGuestMode, isCredentialsReady]);

  // Re-filter questions when source filters change in drill mode
  useEffect(() => {
    // Only re-filter during standard subject drill (id > 0)
    // Modes like 'Review Errors' (id: -1) and 'Flagged' (id: -2) manage their own filtering
    if (isRestoringSessionRef.current) return; // Skip re-filter during session restore
    if (view === 'drill' && originalQuestions.length > 0 && selectedSubject && selectedSubject.id > 0) {
      // Re-apply filters to ORIGINAL questions, not already filtered ones
      const answers = JSON.parse(localStorage.getItem(userKey('answers')) || '{}');
      const flags = JSON.parse(localStorage.getItem('question_flags') || '{}');
      const filtered = originalQuestions.filter(q => {
        const isAi = Number(q.is_ai) === 1 || q.source === 'ai' || q.source === 'easa';
        const sourceMatch = isAi ? drillSettings.sourceFilters.includes('ai') : drillSettings.sourceFilters.includes('user');
        if (!sourceMatch) return false;

        // License filter - use global selectedLicenseSubtype
        if (selectedLicenseSubtype !== 'ALL') {
          const appliesTo = q.metadata?.applies_to || ['PPL', 'SPL'];
          
          // Map selectedLicenseSubtype to internal metadata tags
          let isMatch = false;
          if (selectedLicenseSubtype === 'PPL(A)') isMatch = appliesTo.includes('PPL');
          else if (selectedLicenseSubtype === 'LAPL(A)') isMatch = appliesTo.includes('LAPL');
          else if (selectedLicenseSubtype === 'PPL(H)') isMatch = appliesTo.includes('PPL');
          else if (selectedLicenseSubtype === 'LAPL(H)') isMatch = appliesTo.includes('LAPL');
          else if (selectedLicenseSubtype === 'SPL') isMatch = appliesTo.includes('SPL');
          else if (selectedLicenseSubtype === 'LAPL(S)') isMatch = appliesTo.includes('SPL') || appliesTo.includes('LAPL');
          else if (selectedLicenseSubtype === 'BPL') isMatch = appliesTo.includes('BPL');
          else if (selectedLicenseSubtype === 'LAPL(B)') isMatch = appliesTo.includes('BPL') || appliesTo.includes('LAPL');
          else if (selectedLicenseSubtype === 'KL') isMatch = appliesTo.includes('KL');
          else if (selectedLicenseSubtype === 'MEDLANKY') isMatch = appliesTo.includes('KL');
          
          if (!isMatch) return false;
        }

        // Filter by subcategory - for Medlánky
        if (selectedSubcategory === 'Medlánky' || selectedLicenseSubtype === 'MEDLANKY') {
          if (q.subcategory !== 'Medlánky') return false;
        }

        if (selectedSubject.id === -1) {
          // Error review filtering
          const answer = answers[String(q.id)];
          const isError = answer && !answer.isCorrect;
          if (!isError) return false;
        } else if (selectedSubject.id === -2) {
          // Flagged review filtering - with legacy bridge
          const compositeId = String(q.id);
          const rawId = compositeId.includes('_') ? compositeId.split('_')[1] : compositeId;
          const flag = flags[compositeId] || flags[rawId] || flags[String(rawId)];

          let isFlagged = false;
          if (typeof flag === 'object' && flag !== null) isFlagged = !!flag.isFlagged;
          else isFlagged = !!flag;

          if (!isFlagged) return false;
        } else if (drillSettings.excludeAnswered) {
          // Standard subject filtering
          const answer = answers[String(q.id)];
          if (answer && answer.isCorrect) return false;
        }

        return true;
      });

      // Apply flag status to the resulting questions so UI reflects correctly
      const mapped = filtered.map(q => {
        const compositeId = String(q.id);
        const rawId = compositeId.includes('_') ? compositeId.split('_')[1] : compositeId;
        const flag = flags[compositeId] || flags[rawId] || flags[String(rawId)];
        const isF = (typeof flag === 'object' && flag !== null) ? !!flag.isFlagged : !!flag;
        return { ...q, is_flagged: isF };
      });

      if (filtered.length === 0) {
        // No questions match current filters - go back to selection
        alert('Žádné otázky neodpovídají aktuálním filtrům. Změňte filtry nebo vyberte jiný předmět.');
        setView('dashboard');
        return;
      }

      // Update questions with filtered, mapped, and sorted results
      const sorted = applySorting(mapped, drillSettings.sorting);
      setQuestions(sorted);
      // Preserve position: find current question in new list, only reset if it was filtered out
      const currentQ = questions[currentQuestionIndex];
      const newIdx = currentQ ? sorted.findIndex(q => String(q.id) === String(currentQ.id)) : -1;
      if (newIdx >= 0) {
        setCurrentQuestionIndex(newIdx);
      } else {
        setCurrentQuestionIndex(0); // Current question filtered out, go to first
        setAnswered(null); // Clear answer
        setShowExplanation(false); // Hide explanation
      }

      // Update shuffle history if using weighted learning
      if (drillSettings.sorting === 'weighted_learning') {
        updateShuffleHistoryLocal(mapped);
      }
    }
  }, [drillSettings.sourceFilters, drillSettings.excludeAnswered, drillSettings.sorting, view, originalQuestions.length, selectedSubject, selectedLicense, selectedLicenseSubtype, selectedSubcategory]);

  // Force re-render of progress bars when filters change
  useEffect(() => {
    // This effect ensures progress bars re-calculate when source filters change
    // The dependency array includes all variables used in progress bar calculations
  }, [drillSettings.sourceFilters, selectedSubject, questions, stats, selectedLicense]);

  // Static data loading for GitHub Pages deployment
  const loadStaticSubjects = async () => {
    const subjectDefs = SUBJECT_DEFS;

    // First set with 0 counts so UI loads immediately
    const staticSubjects: Subject[] = subjectDefs.map(s => ({
      ...s, question_count: 0, success_rate: 0
    }));
    setSubjects(staticSubjects);
    if (staticSubjects.length > 0 && !importSubjectId) {
      setImportSubjectId(staticSubjects[0].id);
    }

    // Then fetch real counts from DynamoDB async (single scan with source breakdown)
    try {
      const result = await dynamoDBService.getAllQuestionCounts();
      if (result.success && result.data) {
        const { total = {}, user = {}, ai = {}, kl = {}, medlanky = {} } = result.data!;
        const withCounts: Subject[] = subjectDefs.map(s => ({
          ...s,
          question_count: total[s.id] || 0,
          user_count: user[s.id] || 0,
          ai_count: ai[s.id] || 0,
          kl_count: kl[s.id] || 0,
          medlanky_count: medlanky[s.id] || 0,
          success_rate: 0
        }));
        setSubjects(withCounts);
      }
    } catch (err) {
      // Silent fail - keep default counts
    }
  };

  const loadStaticQuestions = async (subjectId: number) => {
    try {
      const result = await dynamoDBService.getQuestionsBySubject(subjectId);
      if (result.success && result.data && result.data.length > 0) {
        const answers = JSON.parse(localStorage.getItem(`${user?.id || 'guest'}:answers`) || '{}');
        const questions: Question[] = result.data.map((q: any) => {
          const rawId = q.originalId || q.questionId;
          const isNumericId = !isNaN(Number(rawId)) && !String(rawId).startsWith('ai_');
          // DŮLEŽITÉ: compositeId = DynamoDB questionId klíč (subjectN_qID pro PDF otázky, ai_hash pro AI)
          const compositeId = isNumericId ? `subject${subjectId}_q${rawId}` : String(rawId);
          // _dbQuestionId = skutečný primární klíč v DynamoDB (nikdy numeric originalId)
          const dbQuestionId = String(q.questionId);
          const answer = answers[compositeId];

          // Helper function to extract value from DynamoDB attribute format
          const extractDynamoValue = (attr: any) => {
            if (!attr) return null;
            if (attr.S) return attr.S;
            if (attr.NULL) return null;
            if (attr.N) return Number(attr.N);
            return attr;
          };

          return {
            id: compositeId,
            questionId: compositeId,
            _dbQuestionId: dbQuestionId,
            subject_id: subjectId,
            text: q.question,
            text_cz: q.question_cz || undefined,
            option_a: q.answers[0],
            option_a_cz: q.answers_cz?.[0] || undefined,
            option_b: q.answers[1],
            option_b_cz: q.answers_cz?.[1] || undefined,
            option_c: q.answers[2],
            option_c_cz: q.answers_cz?.[2] || undefined,
            option_d: q.answers[3] || '',
            option_d_cz: q.answers_cz?.[3] || undefined,
            correct_option: q.correctOption || ['A', 'B', 'C', 'D'][q.correct] || 'A',
            explanation: q.explanation || '',
            explanation_cz: q.explanation_cz || undefined,
            lo_id: q.loId || q.lo_id || undefined,
            is_ai: (q.source === 'ai' || Number(q.is_ai) === 1) ? 1 : 0,
            source: q.source || 'user',
            difficulty: q.difficulty || 1,
            image: extractDynamoValue(q.image),
            correct_count: answer?.attempts !== undefined ? (answer.isCorrect ? 1 : 0) : null,
            incorrect_count: answer?.attempts !== undefined ? (answer.isCorrect ? 0 : 1) : null,
            is_flagged: false,
            last_practiced: answer?.answerTimestamp || null,
            created_at: q.createdAt || new Date().toISOString(),
            updated_at: q.createdAt || new Date().toISOString(),
            approved: q.approved || false,
            approvedBy: q.approvedBy || undefined,
            approvedAt: q.approvedAt || undefined,
            editedBy: q.editedBy || undefined,
            editedAt: q.editedAt || undefined,
            metadata: q.metadata || { applies_to: ['PPL', 'SPL'] },
            subcategory: q.subcategory || undefined
          };
        });
        return questions;
      }
    } catch (err) {
      console.error(`Failed to load questions for subject ${subjectId}:`, err);
      // No fallback - return empty array if DynamoDB fails
      return [];
    }
  };

  const loadStaticStats = () => {
    // Load persisted user stats from localStorage as initial values
    const savedStats = localStorage.getItem(`${user?.id || 'guest'}:user_stats`);
    if (savedStats) {
      try {
        setStats(JSON.parse(savedStats));
      } catch { }
    }
  };

  const fetchSubjects = async () => {
    // Reload counts from DynamoDB (don't use localStorage - it has stale counts)
    await loadStaticSubjects();
  };

  /**
   * Comprehensive sync of counts and user progress from DynamoDB.
   * Hydrates localStorage and application state.
   */
  const syncUserData = async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsStatsLoading(true);
    try {
      if (isGuestMode) {
        const guestStats = loadGuestStats();
        const countsResult = await dynamoDBService.getAllQuestionCounts();

        let total: Record<number, number> = {};
        let userQuestions: Record<number, number> = {};
        let ai: Record<number, number> = {};
        let klCounts: Record<number, number> = {};
        let medlankyCounts: Record<number, number> = {};

        if (countsResult.success && countsResult.data) {
          ({ total, user: userQuestions, ai, kl: klCounts, medlanky: medlankyCounts } = countsResult.data);
          total = total || {};
          userQuestions = userQuestions || {};
          ai = ai || {};
          klCounts = klCounts || {};
          medlankyCounts = medlankyCounts || {};
          const totalQ = Object.values(total).reduce((a, b) => a + b, 0);
          const userQ = Object.values(userQuestions).reduce((a, b) => a + b, 0);
          const aiQ = Object.values(ai).reduce((a, b) => a + b, 0);

          if (guestStats) {
            setStats({
              ...guestStats,
              totalQuestions: totalQ,
              userQuestions: userQ,
              aiQuestions: aiQ,
              practicedQuestions: guestStats.totalAnswers,
              overallSuccess: guestStats.overallSuccess || 0,
              subjectStats: guestStats.subjectStats || []
            });
          } else {
            setStats({
              totalQuestions: totalQ,
              userQuestions: userQ,
              aiQuestions: aiQ,
              practicedQuestions: 0,
              overallSuccess: 0,
              subjectStats: []
            });
          }
        } else if (guestStats) {
          setStats(guestStats);
        }

        // ALWAYS update subjects row counts
        setSubjects(prev => {
          return SUBJECT_DEFS.map(s => {
            const existing = prev.find(p => p.id === s.id);
            return {
              ...s,
              question_count: total[s.id] ?? existing?.question_count ?? 0,
              user_count: userQuestions[s.id] ?? existing?.user_count ?? 0,
              ai_count: ai[s.id] ?? existing?.ai_count ?? 0,
              kl_count: klCounts[s.id] ?? existing?.kl_count ?? 0,
              medlanky_count: medlankyCounts[s.id] ?? existing?.medlanky_count ?? 0,
              success_rate: existing?.success_rate ?? 0
                            };
                          });
                        });
                      } else {
                        // AUTHENTICATED MODE SYNC
                        const uid = user?.id;
                        if (!uid) return;
                
                        console.log(`📡 Starting data sync for user ${uid}...`);
                
                        // 1. Fetch Question Counts
                        const countsResult = await dynamoDBService.getAllQuestionCounts();
                        let total: Record<number, number> = {};
                        let userQuestions: Record<number, number> = {};
                        let ai: Record<number, number> = {};
                        let klCounts: Record<number, number> = {};
                        let medlankyCounts: Record<number, number> = {};
                
                        if (countsResult.success && countsResult.data) {
                          ({ total, user: userQuestions, ai, kl: klCounts, medlanky: medlankyCounts } = countsResult.data);
                          total = total || {};
                          userQuestions = userQuestions || {};
                          ai = ai || {};
                          klCounts = klCounts || {};
                          medlankyCounts = medlankyCounts || {};
                        }
                
                        // 2. Fetch User Profile (Settings)
                        const profileResult = await dynamoDBService.getUserProfileWithProgress(uid);
                
                        // 2b. Fetch User Progress (New Single-Table Design)
                        const progressResult = await dynamoDBService.getUserProgress(uid);
                
                        // Reconstruct allAnswers from USER_PROGRESS table — always, independent of USERS profile
                        const allAnswers: any = {};
                        if (progressResult.success && progressResult.data) {
                          for (const item of progressResult.data) {
                            if (item.SK && item.SK.startsWith('Q#')) {
                              const rawSk = item.SK.substring(2);
                              const qid = !isNaN(Number(rawSk)) && String(rawSk).trim() !== '' ? String(Number(rawSk)) : rawSk;
                              allAnswers[qid] = {
                                isCorrect: item.correct,
                                subjectId: item.subjectId !== -1 ? item.subjectId : undefined,
                                answerTimestamp: item.updated_at,
                                attempts: item.attempts
                              };
                            }
                          }
                        }

                        // Catch-up sync: find localStorage answers missing in DynamoDB and push them
                        const localAnswers: any = JSON.parse(localStorage.getItem(`${uid}:answers`) || '{}');
                        const missingInDB: Array<{ questionId: string; isCorrect: boolean; subjectId?: number; timestamp?: string }> = [];
                        for (const [qid, localAns] of Object.entries(localAnswers) as [string, any][]) {
                          if (!allAnswers[qid]) {
                            missingInDB.push({
                              questionId: qid,
                              isCorrect: !!localAns.isCorrect,
                              subjectId: localAns.subjectId,
                              timestamp: localAns.timestamp || localAns.answerTimestamp
                            });
                            // Include in stats immediately
                            allAnswers[qid] = { isCorrect: localAns.isCorrect, subjectId: localAns.subjectId, answerTimestamp: localAns.timestamp || localAns.answerTimestamp };
                          }
                        }
                        if (missingInDB.length > 0) {
                          console.log(`🔄 Catch-up sync: pushing ${missingInDB.length} missing answers to DynamoDB`);
                          dynamoDBService.pushMissingProgress(uid, missingInDB).catch(err => console.error('❌ catch-up sync failed:', err));
                        }

                        // Hydrate Answers Map
                        localStorage.setItem(`${uid}:answers`, JSON.stringify(allAnswers));

                        // Hydrate Settings — only if USERS profile record exists
                        if (profileResult.success && profileResult.data) {
                          const profile = profileResult.data;
                          if (profile.settings) {
                            setDrillSettings(prev => {
                              const newSettings = {
                                ...prev,
                                ...profile.settings,
                                weightedLearning: {
                                  ...prev.weightedLearning,
                                  ...profile.settings.weightedLearning
                                }
                              };
                              // Don't overwrite if already in an active drill - avoid triggering
                              // the re-filter useEffect which resets currentQuestionIndex to 0
                              if (sessionService.getCurrentSessionId()) {
                                return prev;
                              }
                              localStorage.setItem('drillSettings', JSON.stringify(newSettings));
                              return newSettings;
                            });
                            if (profile.settings.userApiKey) setUserApiKey(profile.settings.userApiKey);
                            if (profile.settings.claudeApiKey) setClaudeApiKey(profile.settings.claudeApiKey);
                            if (profile.settings.deepseekApiKey) setDeepseekApiKey(profile.settings.deepseekApiKey);
                            console.log('🔑 syncUserData settings from DB:', { aiProvider: profile.settings.aiProvider, aiModel: profile.settings.aiModel });
                            if (profile.settings.aiProvider) setAiProvider(profile.settings.aiProvider);
                            if (profile.settings.aiModel) setAiModel(profile.settings.aiModel);
                          }
                        }
                        // Always mark settings as loaded (even if no profile) so save effect can run
                        setSettingsLoadedUserId(uid);

                        // Compute Statistics — always, regardless of whether USERS profile exists
                        const practicedCount = Object.keys(allAnswers).length;
                        const correctCount = Object.values(allAnswers).filter((a: any) => a.isCorrect).length;
                        const successRate = practicedCount > 0 ? correctCount / practicedCount : 0;

                        const perSubject: Record<number, { correct: number; total: number }> = {};
                        for (const a of Object.values(allAnswers) as any[]) {
                          const sid = Number(a.subjectId);
                          if (!sid) continue;
                          if (!perSubject[sid]) perSubject[sid] = { correct: 0, total: 0 };
                          perSubject[sid].total++;
                          if (a.isCorrect) perSubject[sid].correct++;
                        }

                        const subjectStats: { [subjectId: number]: { correctAnswers: number; totalAnswered: number } } = {};
                        SUBJECT_DEFS.forEach(s => {
                          subjectStats[s.id] = {
                            correctAnswers: perSubject[s.id] ? perSubject[s.id].correct : 0,
                            totalAnswered: perSubject[s.id] ? perSubject[s.id].total : 0
                          };
                        });

                        const totalQ = Object.values(total).reduce((a, b) => a + b, 0);
                        const userQ = Object.values(userQuestions).reduce((a, b) => a + b, 0);
                        const aiQ = Object.values(ai).reduce((a, b) => a + b, 0);

                        const newStats = {
                          totalQuestions: totalQ,
                          userQuestions: userQ,
                          aiQuestions: aiQ,
                          practicedQuestions: practicedCount,
                          overallSuccess: successRate,
                          subjectStats
                        };

                        setStats(newStats);
                        localStorage.setItem(`${uid}:user_stats`, JSON.stringify(newStats));
                
                        // 3. Update Subjects Row Counts
                        setSubjects(prev => {
                          return SUBJECT_DEFS.map(s => {
                            const existing = prev.find(p => p.id === s.id);
                            return {
                              ...s,
                              question_count: total[s.id] ?? existing?.question_count ?? 0,
                              user_count: userQuestions[s.id] ?? existing?.user_count ?? 0,
                              ai_count: ai[s.id] ?? existing?.ai_count ?? 0,
                              kl_count: klCounts[s.id] ?? existing?.kl_count ?? 0,
                              medlanky_count: medlankyCounts[s.id] ?? existing?.medlanky_count ?? 0,
                              success_rate: existing?.success_rate ?? 0
                            };
          });
        });

        console.log(`✅ Data sync complete for ${uid}`);
      }
    } catch (err) {
      console.error('❌ syncUserData failed:', err);
    } finally {
      isSyncingRef.current = false;
      setIsStatsLoading(false);
    }
  };

  const toggleSourceFilter = (source: 'user' | 'ai') => {
    // Toggle the filter - no API key needed for filtering existing questions
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

  // Helper functions for filtered progress calculations
  const getQuestionType = (questionId: string, allQuestions: Question[]): 'user' | 'ai' => {
    const question = allQuestions.find(q => String(q.id) === questionId);
    const isAi = question && (Number(question.is_ai) === 1 || question.source === 'ai' || question.source === 'easa');
    return isAi ? 'ai' : 'user';
  };

  const getFilteredQuestionCount = (subject: Subject, sourceFilters: ('user' | 'ai')[]) => {
    if (subject.id <= 0) return subject.question_count || 0;

    // For KL/MEDLANKY, return stored counts directly
    if (selectedLicenseSubtype === 'MEDLANKY') return subject.medlanky_count || 0;
    if (selectedLicenseSubtype === 'KL') return subject.kl_count || 0;

    let count = 0;
    if (sourceFilters.includes('user')) count += subject.user_count || 0;
    if (sourceFilters.includes('ai')) count += subject.ai_count || 0;
    
    // Filter by license - estimate based on subject relevance to selected license
    // This is a rough estimate since we don't have per-subject license breakdown
    if (selectedLicense === 'SPL') {
      // SPL only has subjects 1,2,3,4,5,9 (excludes 6,7,8)
      if ([6, 7, 8].includes(subject.id)) return 0;
    }
    
    return count;
  };

  const getFilteredAnsweredCount = (subjectId: number, sourceFilters: ('user' | 'ai')[], drillQuestions: Question[]) => {
    const answers = JSON.parse(localStorage.getItem(userKey('answers')) || '{}');

    if (subjectId < 0) {
      return drillQuestions.filter(q => {
        const ans = answers[String(q.id)];
        return ans && ans.isCorrect;
      }).length;
    }

    return Object.keys(answers).filter(questionId => {
      const answer = answers[questionId] as { isCorrect: boolean; subjectId: number; timestamp: string };
      if (subjectId > 0 && answer.subjectId !== subjectId) return false;

      const questionType = getQuestionType(questionId, drillQuestions);
      return sourceFilters.includes(questionType);
    }).length;
  };

  const getFilteredCorrectCount = (subjectId: number, sourceFilters: ('user' | 'ai')[], drillQuestions: Question[]) => {
    const answers = JSON.parse(localStorage.getItem(userKey('answers')) || '{}');

    if (subjectId < 0) {
      return drillQuestions.filter(q => {
        const ans = answers[String(q.id)];
        return ans && ans.isCorrect;
      }).length;
    }

    return Object.entries(answers).filter(([questionId, answer]) => {
      const typedAnswer = answer as { isCorrect: boolean; subjectId: number; timestamp: string };
      if (subjectId > 0 && typedAnswer.subjectId !== subjectId) return false;

      const questionType = getQuestionType(questionId, drillQuestions);
      return sourceFilters.includes(questionType) && typedAnswer.isCorrect;
    }).length;
  };

  const startDrill = async (subject: Subject) => {
    console.log(`🚀 startDrill called for subject: ${subject.name} (ID: ${subject.id})`);
    try {
      setSelectedSubject(subject);
      // Save selected subject to localStorage for guest mode persistence
      if (isGuestMode) {
        localStorage.setItem(`${user?.id || 'guest'}:selectedSubject`, JSON.stringify(subject));
      }
      // Use static questions loading for GitHub Pages deployment
      const data: Question[] = await loadStaticQuestions(subject.id);

      // Store original questions for dynamic filtering
      setOriginalQuestions(data);

      const answers = JSON.parse(localStorage.getItem(userKey('answers')) || '{}');
      let processedQuestions = data.filter(q => {
        const isAi = Number(q.is_ai) === 1 || q.source === 'ai' || q.source === 'easa';
        const sourceMatch = isAi ? drillSettings.sourceFilters.includes('ai') : drillSettings.sourceFilters.includes('user');
        if (!sourceMatch) return false;

        // Filter by license - for KL, show only club questions
        if (selectedLicense === 'KL') {
          const appliesTo = q.metadata?.applies_to || ['PPL', 'SPL'];
          if (!appliesTo.includes('KL')) return false;
        }

        // Filter by subcategory - for Medlánky
        if (selectedSubcategory === 'Medlánky') {
          if (q.subcategory !== 'Medlánky') return false;
        }

        if (drillSettings.excludeAnswered) {
          const answer = answers[String(q.questionId || q.id)];
          return !answer || !answer.isCorrect;
        }
        return true;
      });

      // Apply sorting to questions
      processedQuestions = applySorting(processedQuestions, drillSettings.sorting);

      if (processedQuestions.length === 0) {
        alert('Pro tento předmět a vybrané filtry nebyly nalezeny žádné otázky.');
        return;
      }

      setQuestions(processedQuestions);
      setCurrentQuestionIndex(0);
      setAnswered(null);
      setShowExplanation(false);

      // Update shuffle history if using weighted learning
      if (drillSettings.sorting === 'weighted_learning') {
        updateShuffleHistoryLocal(processedQuestions);
      }

      // Start session for persistence (only for logged-in users)
      if (!isGuestMode && user?.id) {
        const questionIds = processedQuestions.map(q => String(q.id));
        sessionService.startSession(
          String(user.id),
          'drill',
          subject.id,
          selectedLicense,
          questionIds,
          drillSettings
        );
      }

      language.resetTranslation(); // Reset translation when starting new drill
      setView('drill');
    } catch (err) {
      alert('Nepodařilo se načíst otázky.');
    }
  };

  // Helper function to apply sorting to questions (using centralized sorting service)
  const applySorting = (questions: Question[], sorting: string): Question[] => {
    const config: SortingConfig = {
      type: sorting as any,
      weightedLearning: drillSettings.weightedLearning ? {
        enabled: drillSettings.weightedLearning.enabled,
        halflife_days: drillSettings.weightedLearning.halflife_days,
        w_difficulty: drillSettings.weightedLearning.w_difficulty,
        w_performance: drillSettings.weightedLearning.w_performance,
        w_decay: drillSettings.weightedLearning.w_decay
      } : undefined,
      shuffleHistory: drillSettings.shuffleHistory,
      shuffleHistorySize: drillSettings.shuffleHistorySize,
      userId: user?.id
    };

    return sortQuestions(questions, { config });
  };

  // Function to update shuffle history (using centralized sorting service)
  const updateShuffleHistoryLocal = (shuffledQuestions: Question[]) => {
    const config: SortingConfig = {
      type: drillSettings.sorting as any,
      weightedLearning: drillSettings.weightedLearning ? {
        enabled: drillSettings.weightedLearning.enabled,
        halflife_days: drillSettings.weightedLearning.halflife_days,
        w_difficulty: drillSettings.weightedLearning.w_difficulty,
        w_performance: drillSettings.weightedLearning.w_performance,
        w_decay: drillSettings.weightedLearning.w_decay
      } : undefined,
      shuffleHistory: drillSettings.shuffleHistory,
      shuffleHistorySize: drillSettings.shuffleHistorySize,
      userId: user?.id
    };

    const updatedHistory = updateShuffleHistory(shuffledQuestions, config);

    if (updatedHistory.length > 0) {
      setDrillSettings(prev => ({
        ...prev,
        shuffleHistory: updatedHistory
      }));
    }
  };

  // Function to reshuffle current questions during drill (using centralized sorting service)
  const reshuffleQuestions = () => {
    console.log(`🔄 reshuffleQuestions called! Current sorting: ${drillSettings.sorting}`);

    const config: SortingConfig = {
      type: drillSettings.sorting as any,
      weightedLearning: drillSettings.weightedLearning ? {
        enabled: drillSettings.weightedLearning.enabled,
        halflife_days: drillSettings.weightedLearning.halflife_days,
        w_difficulty: drillSettings.weightedLearning.w_difficulty,
        w_performance: drillSettings.weightedLearning.w_performance,
        w_decay: drillSettings.weightedLearning.w_decay
      } : undefined,
      shuffleHistory: drillSettings.shuffleHistory,
      shuffleHistorySize: drillSettings.shuffleHistorySize,
      userId: user?.id
    };

    const shuffled = sortQuestions(questions, { config });

    setQuestions(shuffled);
    setCurrentQuestionIndex(0);
    setAnswered(null);
    setShowExplanation(false);

    // Update shuffle history
    updateShuffleHistoryLocal(shuffled);
  };

  const startMix = async () => {
    try {
      setSelectedSubject({ id: 0, name: 'Mix', question_count: 0, success_rate: 0 });

      // Load from all subjects via DynamoDB
      // For SPL, only load subjects 1,2,3,4,5,9 (exclude 6,7,8)
      const splSubjects = [1, 2, 3, 4, 5, 9];
      const subjectsToLoad = selectedLicense === 'SPL'
        ? subjects.filter(s => splSubjects.includes(s.id))
        : subjects;

      let allQuestions: Question[] = [];
      for (const subject of subjectsToLoad) {
        const qs = await loadStaticQuestions(subject.id);
        allQuestions.push(...qs);
      }

      // Fallback to localStorage if DynamoDB returned nothing
      if (allQuestions.length === 0) {
        const saved = localStorage.getItem('questions');
        if (saved) allQuestions = JSON.parse(saved);
      }

      if (allQuestions.length === 0) {
        alert('Žádné dostupné otázky pro MIX.');
        return;
      }

      // Debug: zobrazit source filtry
      console.log('🔍 MIX: Source filtry:', drillSettings.sourceFilters);
      console.log('🔍 MIX: Celkem otázek:', allQuestions.length);
      console.log('🔍 MIX: Prvních 5 otázek - source:', allQuestions.slice(0, 5).map(q => ({ id: q.id, source: q.source, is_ai: q.is_ai })));

      // Apply source filters
      const sourceFiltered = allQuestions.filter(q => {
        const isAi = Number(q.is_ai) === 1 || q.source === 'ai' || q.source === 'easa';
        if (isAi) return drillSettings.sourceFilters.includes('ai');
        return drillSettings.sourceFilters.includes('user');
      });

      // Apply license filter - show only questions applicable to selected license
      let filtered = sourceFiltered.filter(q => {
        if (selectedLicense === 'BOTH') return true;
        const appliesTo = q.metadata?.applies_to || ['PPL', 'SPL'];
        // For KL, show only club questions (with KL in applies_to)
        if (selectedLicense === 'KL') {
          return appliesTo.includes('KL');
        }
        return appliesTo.includes(selectedLicense);
      });

      // Apply subcategory filter
      if (selectedSubcategory === 'Medlánky') {
        filtered = filtered.filter(q => q.subcategory === 'Medlánky');
      }

      console.log('🔍 MIX: Po source filtru:', sourceFiltered.length, 'otázek');
      console.log('🔍 MIX: Po licenčním filtru:', filtered.length, 'otázek');
      console.log('🔍 MIX: Licence:', selectedLicense);

      if (filtered.length === 0) {
        alert(`Všech ${allQuestions.length} otázek bylo odfiltrováno. Zkontrolujte nastavení zdrojů.`);
        return;
      }

      // Apply sorting based on drillSettings
      let sortedQuestions = applySorting(filtered, drillSettings.sorting);

      // Store original questions for dynamic filtering
      setOriginalQuestions(allQuestions);
      setSelectedSubject(prev => prev ? { ...prev, question_count: sortedQuestions.length } : prev);
      setQuestions(sortedQuestions);
      setCurrentQuestionIndex(0);
      setAnswered(null);
      setShowExplanation(false);

      // Update shuffle history if using weighted learning
      if (drillSettings.sorting === 'weighted_learning') {
        updateShuffleHistoryLocal(sortedQuestions);
      }

      // Start session for persistence (only for logged-in users)
      if (!isGuestMode && user?.id) {
        const questionIds = sortedQuestions.map(q => String(q.id));
        sessionService.startSession(
          String(user.id),
          'mix',
          null, // No specific subject for mix
          selectedLicense,
          questionIds,
          drillSettings
        );
      }

      language.resetTranslation(); // Reset translation when starting MIX
      setView('drill');
    } catch (err) {
      alert('Nepodařilo se načíst otázky pro MIX.');
    }
  };

  const loadAllQuestionsAcrossSubjects = async (): Promise<Question[]> => {
    // For SPL, only load subjects 1,2,3,4,5,9 (exclude 6,7,8)
    const splSubjects = [1, 2, 3, 4, 5, 9];
    const subjectsToLoad = selectedLicense === 'SPL'
      ? subjects.filter(s => splSubjects.includes(s.id))
      : subjects;

    let all: Question[] = [];
    for (const subject of subjectsToLoad) {
      const qs = await loadStaticQuestions(subject.id);
      all.push(...qs);
    }

    // Filter by selected license
    let filtered = all.filter(q => {
      if (selectedLicense === 'BOTH') return true;
      const appliesTo = q.metadata?.applies_to || ['PPL', 'SPL'];
      return appliesTo.includes(selectedLicense);
    });

    // Filter by subcategory
    if (selectedSubcategory === 'Medlánky') {
      filtered = filtered.filter(q => q.subcategory === 'Medlánky');
    }

    return filtered;
  };

  const startErrors = async () => {
    if (isGuestMode) {
      showAuthPrompt('errors');
      return;
    }

    try {
      const allAnswers = JSON.parse(localStorage.getItem(`${user?.id || 'guest'}:answers`) || '{}');
      const incorrectIds = new Set(
        Object.entries(allAnswers)
          .filter(([_, a]: [string, any]) => !a.isCorrect)
          .map(([id]) => String(id))
      );

      if (incorrectIds.size === 0) {
        alert('Nemáte žádné chyby k procvičení.');
        return;
      }

      const allQuestions = await loadAllQuestionsAcrossSubjects();
      const errorQuestions = allQuestions.filter(q => {
        const isAi = Number(q.is_ai) === 1 || q.source === 'ai' || q.source === 'easa';
        const sourceMatch = isAi ? drillSettings.sourceFilters.includes('ai') : drillSettings.sourceFilters.includes('user');
        if (!sourceMatch) return false;

        const compositeId = String(q.id);
        const answer = allAnswers[compositeId];
        return answer && !answer.isCorrect;
      });

      if (errorQuestions.length === 0) {
        alert('Nemáte žádné chyby k procvičení (v rámci vybraných filtrů).');
        return;
      }

      setOriginalQuestions(allQuestions);
      let sortedQuestions = applySorting(errorQuestions, drillSettings.sorting);
      setSelectedSubject({ id: -1, name: 'Procvičit chyby', question_count: sortedQuestions.length, success_rate: 0 });
      setQuestions(sortedQuestions);
      setCurrentQuestionIndex(0);
      setAnswered(null);
      setShowExplanation(false);

      // Update shuffle history if using weighted learning
      if (drillSettings.sorting === 'weighted_learning') {
        updateShuffleHistoryLocal(sortedQuestions);
      }
      language.resetTranslation();
      setView('drill');
    } catch (error) {
      alert('Nepodařilo se načíst chyby.');
    }
  };

  const startFlagged = async () => {
    if (isGuestMode) {
      showAuthPrompt('stats');
      return;
    }

    try {
      const flags = JSON.parse(localStorage.getItem('question_flags') || '{}');
      const allQuestions = await loadAllQuestionsAcrossSubjects();
      const flaggedQuestions = allQuestions
        .filter(q => {
          const isAi = Number(q.is_ai) === 1 || q.source === 'ai' || q.source === 'easa';
          const sourceMatch = isAi ? drillSettings.sourceFilters.includes('ai') : drillSettings.sourceFilters.includes('user');
          if (!sourceMatch) return false;

          const compositeId = String(q.id);
          const rawId = compositeId.includes('_') ? compositeId.split('_')[1] : compositeId;

          // Legacy support: match by compositeId (preferred) or old raw numeric ID
          const flag = flags[compositeId] || flags[rawId] || flags[String(rawId)];

          if (typeof flag === 'object' && flag !== null) return !!flag.isFlagged;
          return !!flag;
        })
        .map(q => ({ ...q, is_flagged: true }));

      if (flaggedQuestions.length === 0) {
        alert('Nemáte žádné označené otázky k procvičení (v rámci vybraných filtrů).');
        return;
      }

      setOriginalQuestions(allQuestions);
      let sortedQuestions = applySorting(flaggedQuestions, drillSettings.sorting);
      setSelectedSubject({ id: -2, name: 'Označené otázky', question_count: sortedQuestions.length, success_rate: 0 });
      setQuestions(sortedQuestions);
      setCurrentQuestionIndex(0);
      setAnswered(null);
      setShowExplanation(false);

      // Update shuffle history if using weighted learning
      if (drillSettings.sorting === 'weighted_learning') {
        updateShuffleHistoryLocal(sortedQuestions);
      }
      setView('drill');
    } catch (error) {
      alert('Nepodařilo se načíst označené otázky.');
    }
  };

  const startTextSearchDrill = async (query: string) => {
    if (!query || query.length < 2) {
      alert('Zadejte alespoň 2 znaky pro vyhledávání.');
      return;
    }

    try {
      setIsSearching(true);
      const allQuestions = await loadAllQuestionsAcrossSubjects();

      // Check if query looks like an ID (contains underscore, starts with subject/ai, or starts with "ID:")
      const cleanQuery = query.trim();
      const hasIdPrefix = cleanQuery.toLowerCase().startsWith('id:');
      const queryWithoutPrefix = hasIdPrefix ? cleanQuery.slice(3).trim() : cleanQuery;
      const isIdQuery = queryWithoutPrefix.includes('_') || 
                        queryWithoutPrefix.toLowerCase().startsWith('subject') || 
                        queryWithoutPrefix.toLowerCase().startsWith('ai_');

      let matchedQuestions: Question[];

      if (isIdQuery) {
        // Exact ID match (case insensitive) - find exactly one question
        const searchTerm = queryWithoutPrefix.toLowerCase();
        matchedQuestions = allQuestions.filter(q => {
          const id = String(q.id).toLowerCase();
          const questionId = q.questionId ? String(q.questionId).toLowerCase() : '';
          return id === searchTerm || questionId === searchTerm;
        });
      } else {
        // Use Fuse.js for fuzzy text search
        const fuseOptions = {
          keys: ['text', 'text_cz', 'id', 'questionId'],
          threshold: 0.4,
          ignoreLocation: true,
          minMatchCharLength: 2
        };

        const fuse = new Fuse(allQuestions, fuseOptions);
        const results = fuse.search(query);
        matchedQuestions = results.map(r => r.item);
      }

      if (matchedQuestions.length === 0) {
        alert(`Pro hledaný výraz "${query}" nebyly nalezeny žádné otázky.`);
        setIsSearching(false);
        return;
      }

      // Apply source filters
      const filtered = matchedQuestions.filter(q => {
        const isAi = Number(q.is_ai) === 1 || q.source === 'ai' || q.source === 'easa';
        const sourceMatch = isAi ? drillSettings.sourceFilters.includes('ai') : drillSettings.sourceFilters.includes('user');
        return sourceMatch;
      });

      if (filtered.length === 0) {
        alert(`Nalezeno ${matchedQuestions.length} otázek, ale žádná neodpovídá aktuálním filtrům zdroje.`);
        setIsSearching(false);
        return;
      }

      setOriginalQuestions(allQuestions);
      let sortedQuestions = applySorting(filtered, drillSettings.sorting);
      setSelectedSubject({ id: -3, name: `Vyhledávání: "${query}"`, question_count: sortedQuestions.length, success_rate: 0 });
      setQuestions(sortedQuestions);
      setCurrentQuestionIndex(0);
      setAnswered(null);
      setShowExplanation(false);
      setIsSearchOpen(false);

      if (drillSettings.sorting === 'weighted_learning') {
        updateShuffleHistoryLocal(sortedQuestions);
      }

      language.resetTranslation();
      setIsSearching(false);
      setView('drill');
    } catch (error) {
      console.error('Search error:', error);
      alert('Nepodařilo se provést vyhledávání.');
      setIsSearching(false);
    }
  };

  const startExam = async () => {
    try {
      const allQuestions: Question[] = [];

      // For static deployment, get questions from localStorage
      const savedQuestions = localStorage.getItem('questions');
      if (savedQuestions) {
        const data = JSON.parse(savedQuestions);
        allQuestions.push(...data);
      } else {
        // Fallback to current questions state
        allQuestions.push(...questions);
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
      language.resetTranslation(); // Reset translation when starting exam
      setView('exam');
    } catch (err) {
      alert('Nepodařilo se spustit simulaci zkoušky.');
    }
  };

  const startUCLExam = async () => {
    try {
      // Load all questions from all subjects dynamically
      const allQuestions: Question[] = await loadAllQuestionsAcrossSubjects();

      // EASA PPL category distribution - official specification
      // Based on EASA standards: 12 questions for basic subjects (20-30 min), 16 for complex subjects (35-50 min)
      const categoryDistribution = {
        1: 12, // Air Law - 20 min
        2: 12, // Human Performance - 20 min
        3: 16, // Meteorology - 35 min (complex subject with calculations)
        4: 12, // Communications - 25 min
        5: 12, // Principles of Flight - 25 min
        6: 12, // Operational Procedures - 25 min
        7: 16, // Flight Performance and Planning - 35 min (complex subject with calculations)
        8: 16, // Aircraft General Knowledge - 35 min (complex technical subject)
        9: 16, // Navigation - 50 min (complex subject with chart calculations)
      };

      // Filter for UCL test - prefer user questions but include AI if needed
      const userQuestions = allQuestions.filter(q =>
        (Number(q.is_ai) !== 1 && q.source !== 'ai' && q.source !== 'easa')
      );

      const aiQuestions = allQuestions.filter(q =>
        Number(q.is_ai) === 1 || q.source === 'ai' || q.source === 'easa'
      );

      // Build exam set according to ÚCL category distribution
      const examSet: Question[] = [];
      const availableQuestions = [...userQuestions, ...aiQuestions];

      // Try to get questions for each category according to distribution
      for (const [categoryId, count] of Object.entries(categoryDistribution)) {
        const categoryQuestions = availableQuestions.filter(q =>
          q.subject_id === parseInt(categoryId)
        );

        if (categoryQuestions.length >= count) {
          // We have enough questions for this category
          const selected = LearningEngine.generateExamSet(categoryQuestions, count);
          examSet.push(...selected);
        } else {
          // Not enough questions, take what we have
          examSet.push(...categoryQuestions);
          console.warn(`Nedostatek otázek pro kategorii ${categoryId}: potřebuje ${count}, k dispozici ${categoryQuestions.length}`);
        }
      }

      // If we still don't have 120 questions, fill with remaining questions
      if (examSet.length < 120) {
        const needed = 120 - examSet.length;
        const remainingQuestions = availableQuestions.filter(q =>
          !examSet.includes(q)
        );
        examSet.push(...remainingQuestions.slice(0, needed));
      }

      if (examSet.length < 120) {
        alert(`Nedostatek otázek pro ÚCL test (nalezeno ${examSet.length}, potřeba 120). Vygenerujte nebo importujte více otázek.`);
        return;
      }

      // Shuffle the final exam set
      const shuffledExamSet = LearningEngine.generateExamSet(examSet, 120);

      setQuestions(shuffledExamSet);
      setCurrentQuestionIndex(0);
      setAnswered(null);
      setExamAnswers({});
      setExamResults(null);
      setTimer(14400); // 4 hours = 14400 seconds
      language.resetTranslation();
      setView('exam');
      setShowExamTypeSelection(false);
    } catch (err) {
      alert('Nepodařilo se spustit ÚCL test.');
    }
  };

  const startEASAExam = async () => {
    try {
      const allQuestions: Question[] = [];

      // For static deployment, get questions from localStorage
      const savedQuestions = localStorage.getItem('questions');
      if (savedQuestions) {
        const data = JSON.parse(savedQuestions);
        allQuestions.push(...data);
      } else {
        // Fallback to current questions state
        allQuestions.push(...questions);
      }

      // Filter for EASA test - prefer AI questions but include user if needed
      const aiQuestions = allQuestions.filter(q =>
        Number(q.is_ai) === 1 || q.source === 'ai' || q.source === 'easa'
      );

      const userQuestions = allQuestions.filter(q =>
        (Number(q.is_ai) !== 1 && q.source !== 'ai' && q.source !== 'easa')
      );

      // Priority: AI questions first, then user questions to fill gaps
      let filteredQuestions = [...aiQuestions];
      if (filteredQuestions.length < 136) {
        const needed = 136 - filteredQuestions.length;
        filteredQuestions.push(...userQuestions.slice(0, needed));
      }

      if (filteredQuestions.length < 136) {
        alert(`Nedostatek otázek pro EASA test (nalezeno ${filteredQuestions.length}, potřeba 136). Vygenerujte nebo importujte více otázek.`);
        return;
      }

      // Use LearningEngine to generate the exam set
      const examSet = LearningEngine.generateExamSet(filteredQuestions, 136);

      setQuestions(examSet);
      setCurrentQuestionIndex(0);
      setAnswered(null);
      setExamAnswers({});
      setExamResults(null);
      setTimer(3300); // 55 minutes = 3300 seconds
      language.resetTranslation();
      setView('exam');
      setShowExamTypeSelection(false);
    } catch (err) {
      alert('Nepodařilo se spustit EASA test.');
    }
  };

  const startSPLEXam = async () => {
    try {
      // Load all questions from all subjects dynamically
      const allQuestions: Question[] = await loadAllQuestionsAcrossSubjects();

      // SPL (Sailplane Pilot Licence) category distribution - official specification
      // SPL has fewer subjects than PPL: 6 subjects instead of 9
      // Based on EASA standards for glider pilots
      const categoryDistribution = {
        1: 12, // Air Law - 20 min
        2: 12, // Human Performance - 20 min
        3: 16, // Meteorology - 35 min (critical for glider operations)
        4: 12, // Communications - 25 min
        5: 12, // Principles of Flight - 25 min (essential for gliders)
        9: 16, // Navigation - 50 min (critical for cross-country gliding)
        // SPL excludes: Operational Procedures (6), Flight Performance (7), Aircraft General (8)
      };

      // Filter for SPL test - prefer user questions but include AI if needed
      const userQuestions = allQuestions.filter(q =>
        (Number(q.is_ai) !== 1 && q.source !== 'ai' && q.source !== 'easa')
      );

      const aiQuestions = allQuestions.filter(q =>
        Number(q.is_ai) === 1 || q.source === 'ai' || q.source === 'easa'
      );

      // Build exam set according to SPL category distribution
      const examSet: Question[] = [];
      const availableQuestions = [...userQuestions, ...aiQuestions];

      // Try to get questions for each SPL category according to distribution
      for (const [categoryId, count] of Object.entries(categoryDistribution)) {
        const categoryQuestions = availableQuestions.filter(q =>
          q.subject_id === parseInt(categoryId)
        );

        if (categoryQuestions.length >= count) {
          // Shuffle and take required number using centralized sorting service
          const shuffled = sortQuestions(categoryQuestions, {
            config: { type: 'random', userId: user?.id }
          });
          examSet.push(...shuffled.slice(0, count));
        } else {
          // Not enough questions, take all available
          examSet.push(...categoryQuestions);
          console.warn(`Not enough questions for SPL category ${categoryId}. Available: ${categoryQuestions.length}, Required: ${count}`);
        }
      }

      // Shuffle the final exam set
      const shuffledExamSet = LearningEngine.generateExamSet(examSet, 80); // 80 questions total for SPL

      setQuestions(shuffledExamSet);
      setCurrentQuestionIndex(0);
      setView('exam');
      setExamAnswers({});
      setExamResults(null);
      setTimer(2400); // 40 minutes for SPL exam (shorter than PPL)
      language.resetTranslation(); // Reset translation when starting exam
    } catch (err) {
      alert('Nepodařilo se spustit simulaci SPL zkoušky.');
    }
  };

  const handleShowExamTypeSelection = () => {
    setShowExamTypeSelection(true);
  };

  const handleAnswer = async (option: string) => {
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;

    if (view === 'drill') {
      if (answered) return;

      let isCorrect: boolean;

      // Use shuffle logic if shuffle is active
      if (drillSettings.shuffleAnswers && shuffledQuestion) {
        const labels = getAvailableOptions(currentQuestion);
        const userAnswerIndex = labels.indexOf(option as any);
        isCorrect = checkAnswer(shuffledQuestion, userAnswerIndex);
      } else {
        isCorrect = option === currentQuestion.correct_option;
      }

      setAnswered(option);

      // Save answer to localStorage + DynamoDB
      try {
        const answersKey = userKey('answers');
        const guestAnswers = JSON.parse(localStorage.getItem(answersKey) || '{}');
        const isFirstAttempt = !(currentQuestion.id in guestAnswers);

        saveAnswerToLocalStorage(currentQuestion.id, isCorrect, currentQuestion.subject_id);
        updateUserStats(isCorrect);
        // Sync to DynamoDB only for authenticated users (not guests)
        console.log('🔍 DB save check:', { isGuestMode, userId: user?.id, isCredentialsReady });
        if (!isGuestMode && user?.id && isCredentialsReady) {
          dynamoDBService.saveUserProgress(String(user.id), String(currentQuestion.id), isCorrect, isFirstAttempt, currentQuestion.subject_id).catch(() => { });
        }
      } catch (error) {
        // Silent fail
      }
    } else {
      // Exam mode - track answers
      setExamAnswers(prev => ({ ...prev, [currentQuestion.id]: option }));
      setAnswered(option);
    }
  };

  // User-specific localStorage key helper
  const userKey = (key: string) => {
    const userId = user?.id || 'guest';
    return `${userId}:${key}`;
  };

  // Helper functions for guest mode
  const saveAnswerToLocalStorage = (questionId: number, isCorrect: boolean, subjectId?: number) => {
    const answersKey = userKey('answers');
    const guestAnswers = JSON.parse(localStorage.getItem(answersKey) || '{}');
    guestAnswers[questionId] = { isCorrect, subjectId, timestamp: new Date().toISOString() };
    localStorage.setItem(answersKey, JSON.stringify(guestAnswers));
  };

  const updateUserStats = (isCorrect: boolean) => {
    // Read AFTER saveAnswerToLocalStorage has already written
    const allAnswers = JSON.parse(localStorage.getItem(userKey('answers')) || '{}');
    const practicedCount = Object.keys(allAnswers).length;
    const correctCount = Object.values(allAnswers).filter((a: any) => a.isCorrect).length;
    const successRate = practicedCount > 0 ? correctCount / practicedCount : 0;

    // Compute per-subject stats for heatmap
    const perSubject: Record<number, { correct: number; total: number }> = {};
    for (const a of Object.values(allAnswers) as any[]) {
      const sid = a.subjectId;
      if (!sid) continue;
      if (!perSubject[sid]) perSubject[sid] = { correct: 0, total: 0 };
      perSubject[sid].total++;
      if (a.isCorrect) perSubject[sid].correct++;
    }
    const subjectStats: { [subjectId: number]: { correctAnswers: number; totalAnswered: number } } = {};
    subjects.forEach(s => {
      subjectStats[s.id] = {
        correctAnswers: perSubject[s.id] ? perSubject[s.id].correct : 0,
        totalAnswered: perSubject[s.id] ? perSubject[s.id].total : 0
      };
    });

    // guest_stats (for guest mode display)
    localStorage.setItem(userKey('guest_stats'), JSON.stringify({
      totalAnswers: practicedCount,
      correctAnswers: correctCount,
      successRate,
      sessionStart: localStorage.getItem(userKey('session_start')) || new Date().toISOString()
    }));

    // user_stats (for logged-in mode display, persists across sessions)
    const savedStats = JSON.parse(localStorage.getItem(userKey('user_stats')) || '{}');
    localStorage.setItem(userKey('user_stats'), JSON.stringify({
      ...savedStats,
      practicedQuestions: practicedCount,
      overallSuccess: successRate,
      subjectStats
    }));

    // Update React state immediately so dashboard reflects change without refresh
    setStats(prev => prev ? {
      ...prev,
      practicedQuestions: practicedCount,
      overallSuccess: successRate,
      subjectStats
    } : null);
  };

  const getIsCurrentSource = (srcId: string, q: { is_ai?: number | boolean; source?: string }): boolean => {
    const isAi = Number(q.is_ai) === 1 || q.source === 'ai' || q.source === 'easa';
    return srcId === 'ai' ? isAi : !isAi;
  };

  const jumpToRandomQuestion = () => {
    if (questions.length === 0) return;

    let randomIndex = Math.floor(Math.random() * questions.length);
    while (randomIndex === currentQuestionIndex) {
      randomIndex = Math.floor(Math.random() * questions.length);
    }
    setCurrentQuestionIndex(randomIndex);
    setAnswered(null);
    setShowExplanation(false);
    language.resetTranslation(); // Reset translation when changing question
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      const nextIdx = currentQuestionIndex + 1;
      
      // Reset explanation states FIRST before changing question
      setShowExplanation(false);
      setAiExplanation(null);
      setAiExplanationQuestionId(null);
      setAiExplanationGeneratedBy(null);
      setAiDetectedObjective(null);
      setDetailedExplanation(null);
      setAnswered(null); // Reset answered state to prevent showing correct answer from previous question
      language.resetTranslation(); // Reset translation when changing question

      setCurrentQuestionIndex(nextIdx);

      // Auto-save session progress (debounced)
      if (!isGuestMode && user?.id && view === 'drill') {
        const sessionId = sessionService.getCurrentSessionId();
        if (sessionId) {
          // Clear existing timeout
          if (sessionSaveTimeoutRef.current) {
            clearTimeout(sessionSaveTimeoutRef.current);
          }
          // Debounce save for 2 seconds
          sessionSaveTimeoutRef.current = setTimeout(() => {
            sessionService.updateProgress(String(user.id), sessionId, {
              currentIndex: nextIdx,
              answers: {} // Answers are tracked separately
            });
          }, 2000);
        }
      }
    } else if (view === 'exam') {
      finishExam();
    } else {
      // Session completed - clear it
      if (!isGuestMode && user?.id && view === 'drill') {
        const sessionId = sessionService.getCurrentSessionId();
        if (sessionId) {
          sessionService.completeSession(String(user.id), sessionId);
        }
      }
      setView('dashboard');
    }
  };

  const handleQuestionApprove = async () => {
    const q = questions[currentQuestionIndex];
    if (!q || !user) return;

    const isApproved = !q.approved;

    try {
      const dbKey = (q as any)._dbQuestionId || String(q.id);
      const response = await dynamoDBService.approveQuestion(dbKey, isApproved, user.username);
      if (response.success) {
        setQuestions(prev => prev.map(question =>
          question.id === q.id ? {
            ...question,
            approved: isApproved,
            approvedBy: isApproved ? user.username : undefined,
            approvedAt: isApproved ? new Date().toISOString() : undefined
          } : question
        ));
      } else {
        alert('Nepodařilo se schválit otázku: ' + response.error);
      }
    } catch (e: any) {
      alert('Chyba při schvalování otázky: ' + e.message);
    }
  };

  const handleQuestionDelete = async () => {
    const q = questions[currentQuestionIndex];
    if (!q) return;

    if (!confirm('Opravdu chcete tuto otázku trvale smazat?')) return;

    try {
      const dbKey = (q as any)._dbQuestionId || String(q.id);
      const response = await dynamoDBService.deleteQuestion(dbKey);
      if (response.success) {
        // Remove from current list
        setQuestions(prev => prev.filter(question => question.id !== q.id));

        // If it was the last question in the list
        if (questions.length <= 1) {
          setView('dashboard');
          return;
        }

        // Ensure index is valid after deletion
        if (currentQuestionIndex >= questions.length - 1) {
          setCurrentQuestionIndex(questions.length - 2);
        }

        setAnswered(null);
        setShowExplanation(false);
        setAiExplanation(null);
        setAiExplanationQuestionId(null);
        setDetailedExplanation(null);
      } else {
        alert('Nepodařilo se smazat otázku: ' + response.error);
      }
    } catch (e: any) {
      alert('Chyba při mazání otázky: ' + e.message);
    }
  };

  const handleQuestionEdit = () => {
    const q = questions[currentQuestionIndex];
    if (!q) return;
    setAuditMenuOpen(false);
    const compositeId = q.questionId || String(q.id);
    const dbKey = (q as any)._dbQuestionId || compositeId;
    setEditingQuestion({
      questionId: compositeId,
      dbQuestionId: dbKey,
      text_cz: q.text_cz || '',
      options_cz: [q.option_a_cz || '', q.option_b_cz || '', q.option_c_cz || '', q.option_d_cz || ''],
      correct_option: q.correct_option || 'A',
      explanation_cz: q.explanation_cz || '',
    });
  };

  const handleQuestionSave = async () => {
    if (!editingQuestion || !user) return;
    setEditSaving(true);
    try {
      const correctIdx = ['A', 'B', 'C', 'D'].indexOf(editingQuestion.correct_option);
      const now = new Date().toISOString();
      console.log('[handleQuestionSave] questionId:', editingQuestion.questionId, 'dbQuestionId:', editingQuestion.dbQuestionId, 'correctOption:', editingQuestion.correct_option, 'editedBy:', user.username);
      const response = await dynamoDBService.updateQuestionCZ(editingQuestion.dbQuestionId, {
        question_cz: editingQuestion.text_cz,
        answers_cz: editingQuestion.options_cz,
        explanation_cz: editingQuestion.explanation_cz,
        correct: correctIdx >= 0 ? correctIdx : 0,
        correctOption: editingQuestion.correct_option,
        editedBy: user.username,
        editedAt: now,
      });
      if (response.success) {
        setQuestions(prev => prev.map(q =>
          (q.questionId || String(q.id)) === editingQuestion.questionId ? {
            ...q,
            text_cz: editingQuestion.text_cz,
            option_a_cz: editingQuestion.options_cz[0],
            option_b_cz: editingQuestion.options_cz[1],
            option_c_cz: editingQuestion.options_cz[2],
            option_d_cz: editingQuestion.options_cz[3],
            correct_option: editingQuestion.correct_option,
            explanation_cz: editingQuestion.explanation_cz,
            editedBy: user.username,
            editedAt: now,
          } : q
        ));
        if (!language.showTranslation) language.toggleTranslation();
        setEditingQuestion(null);
      } else {
        alert('Nepodařilo se uložit otázku: ' + response.error);
      }
    } catch (e: any) {
      alert('Chyba při ukládání otázky: ' + e.message);
    } finally {
      setEditSaving(false);
    }
  };

  // Convert app compositeId (e.g. 'subject9_q42') to DynamoDB explanation cache key (e.g. '9_42')
  const toExplanationCacheKey = (id: string | number): string => {
    const s = String(id);
    const m = s.match(/^subject(\d+)_q(.+)$/);
    if (m) return `${m[1]}_${m[2]}`;
    return s;
  };

  const handleFetchAiExplanation = async () => {
    const q = questions[currentQuestionIndex];
    if (!q) return;
    const capturedQuestionId = q.id;

    const currentApiKey = aiProvider === 'gemini' ? userApiKey : aiProvider === 'claude' ? claudeApiKey : (deepseekApiKey || undefined);
    if (!currentApiKey && !(aiProvider === 'deepseek' && getProxyParams().idToken)) {
      const providerName = aiProvider === 'gemini' ? 'Gemini' : aiProvider === 'claude' ? 'Claude' : 'DeepSeek';
      const key = prompt(`⚠️ Pro použití AI je nutný API klíč
Vložte ${providerName} API klíč.

💡 Klíč se automaticky rozpozná.
V nastavení lze změnit defaultni model.`);
      if (key) {
        if (key.startsWith('AIza')) {
          setUserApiKey(key); if (aiProvider !== 'gemini') setAiProvider('gemini');
        } else if (key.startsWith('sk-ant-')) {
          setClaudeApiKey(key); if (aiProvider !== 'claude') setAiProvider('claude');
        } else if (key.startsWith('sk-')) {
          setDeepseekApiKey(key); if (aiProvider !== 'deepseek') setAiProvider('deepseek');
        } else {
          if (aiProvider === 'gemini') setUserApiKey(key);
          else if (aiProvider === 'claude') setClaudeApiKey(key);
          else setDeepseekApiKey(key);
        }
      } else {
        return;
      }
    }

    setIsGeneratingAiExplanation(true);
    setAiExplanation(null);
    setAiExplanationQuestionId(null);
    setDetailedExplanation(null);
    try {
      // Guest mode = žádný přístup k AI
      if (isGuestMode) {
        showAuthPrompt('ai');
        setIsGeneratingAiExplanation(false);
        return;
      }

      // Check DynamoDB cache first
      try {
        const cacheKey = toExplanationCacheKey(q.id);
        console.log(`[Cache] Checking DynamoDB for key: ${cacheKey}, model: ${aiModel}, provider: ${aiProvider}`);
        const cached = await dynamoDBService.getCachedExplanation(cacheKey, aiModel);
        console.log(`[Cache] DynamoDB result:`, cached);
        if (cached.success && cached.data?.explanation) {
          console.log(`[Cache] Found in DynamoDB, using cached explanation`);
          if (questionsRef.current[currentQuestionIndexRef.current]?.id !== capturedQuestionId) return;
          setAiExplanation(cached.data.explanation);
          setAiExplanationQuestionId(capturedQuestionId);
          setDetailedExplanation(cached.data.detailedExplanation || null);
          setAiExplanationGeneratedBy({ provider: cached.data.provider || 'unknown', model: cached.data.model || 'unknown' });
          setShowExplanation(true);
          setIsGeneratingAiExplanation(false);
          return;
        }
      } catch (error) {
        console.error('[Cache] DynamoDB error:', error);
      }

      // Check localStorage as fallback — klíč bez model názvu aby fungoval i po změně modelu
      const localStorageKey = `ai_explanation_${q.id}`;
      console.log(`[Cache] Checking localStorage for key: ${localStorageKey}`);
      const localStorageData = localStorage.getItem(localStorageKey);
      if (localStorageData) {
        try {
          const parsed = JSON.parse(localStorageData);
          console.log(`[Cache] localStorage data:`, parsed);
          if (parsed.explanation) {
            console.log(`[Cache] Found in localStorage, using cached explanation`);
            if (questionsRef.current[currentQuestionIndexRef.current]?.id !== capturedQuestionId) return;
            setAiExplanation(parsed.explanation);
            setAiExplanationQuestionId(capturedQuestionId);
            setDetailedExplanation(parsed.detailedExplanation || null);
            setAiExplanationGeneratedBy({ provider: parsed.provider || aiProvider, model: parsed.model || aiModel });
            setShowExplanation(true);
            setIsGeneratingAiExplanation(false);
            // Backfill to DynamoDB (only authenticated users)
            if (!isGuestMode && user?.id && isCredentialsReady) {
              const cacheKey = toExplanationCacheKey(q.id);
              dynamoDBService.saveExplanationWithObjective(
                cacheKey,
                parsed.explanation,
                parsed.detailedExplanation || null,
                null,
                (parsed.provider || aiProvider) as 'gemini' | 'claude',
                parsed.model || aiModel
              ).catch((err) => { console.error('[Explanation] ❌ DynamoDB backfill FAILED:', err); });
            }
            return;
          }
        } catch (error) {
          console.error('[Cache] localStorage parse error:', error);
        }
      }

      console.log(`[Cache] No cached explanation found, calling AI API for provider: ${aiProvider}`);

      const lo = allLOs.find(l => l.id === q.lo_id);

      const displayCorrectOption = (drillSettings.shuffleAnswers && shuffledQuestion && view === 'drill')
        ? getAvailableOptions(shuffledQuestion.originalQuestion)[shuffledQuestion.displayCorrect]
        : undefined;

      const result = await getDetailedExplanation(q, lo, aiProvider === 'gemini' ? userApiKey : aiProvider === 'claude' ? claudeApiKey : (deepseekApiKey || undefined), aiModel, aiProvider, undefined, displayCorrectOption, AI_PROXY_URL, await getProxyIdToken(), userApiKey, claudeApiKey, (chunk) => {
        if (questionsRef.current[currentQuestionIndexRef.current]?.id === capturedQuestionId) {
          setAiExplanationQuestionId(capturedQuestionId);
          setAiExplanation(prev => (prev || '') + chunk);
        }
      });


      // Guard: discard result if user navigated to a different question
      if (questionsRef.current[currentQuestionIndexRef.current]?.id !== capturedQuestionId) return;
      setAiExplanationQuestionId(capturedQuestionId);

      // Save objective if detected
      if (result.objective) {
        // Always save to DynamoDB
        dynamoDBService.saveObjective(String(q.id), result.objective).catch(() => { });

        // Update localStorage and local state if question doesn't have lo_id yet
        if (!q.lo_id || q.source === 'user') {
          try {
            const objectives = JSON.parse(localStorage.getItem('learning_objectives') || '{}');
            objectives[q.id] = result.objective;
            localStorage.setItem('learning_objectives', JSON.stringify(objectives));
            setQuestions(prev => prev.map(question =>
              question.id === q.id ? { ...question, lo_id: result.objective } : question
            ));
          } catch (error) {
            // Silent fail
          }
        }
        setAiDetectedObjective(result.objective);
      }

      setAiExplanation(result.explanation);
      setAiExplanationGeneratedBy({ provider: aiProvider, model: aiModel });
      setShowExplanation(true);

      // Save AI explanation to DynamoDB (only for authenticated users — guests nemají UpdateItem IAM)
      if (!isGuestMode && user?.id && isCredentialsReady) {
        try {
          const cacheKey = toExplanationCacheKey(q.id);
          await dynamoDBService.saveExplanationWithObjective(
            cacheKey,
            result.explanation,
            null,
            result.objective || null,
            aiProvider as 'gemini' | 'claude',
            aiModel
          );

          // Also save the LO directly to the question if it's an AI-generated question
          if (q.source === 'ai' && result.objective) {
            dynamoDBService.updateQuestionLO((q as any)._dbQuestionId || q.questionId || q.id, result.objective).catch(() => { });
          }
        } catch (error) {
          console.error('[Explanation] ❌ DynamoDB save FAILED:', error);
        }
      } else if (isGuestMode) {
        console.warn('[Explanation] Guest mode — explanation uložen pouze do localStorage (přihlas se pro cloud sync)');
      }

      // Uložit do localStorage jako fallback (offline / rychlý přístup)
      try {
        const localStorageKey = `ai_explanation_${q.id}`;
        localStorage.setItem(localStorageKey, JSON.stringify({
          questionId: q.id,
          explanation: result.explanation,
          detailedExplanation: null,
          provider: aiProvider,
          model: aiModel,
          createdAt: new Date().toISOString()
        }));
      } catch (error) {
        // Silent fail localStorage
      }
    } catch (error: any) {
      const msg = getAIErrorMessage(error); if (msg) alert(msg);
    } finally {
      setIsGeneratingAiExplanation(false);
    }
  };

  const handleRegenerateExplanation = async () => {
    const q = questions[currentQuestionIndex];
    if (!q) return;
    const capturedQuestionId = q.id;

    setIsRegeneratingExplanation(true);
    setAiExplanation(null);
    setAiExplanationQuestionId(null);
    try {
      // Guest mode = žádný přístup k AI
      if (isGuestMode) {
        showAuthPrompt('ai');
        setIsRegeneratingExplanation(false);
        return;
      }

      const currentApiKey = aiProvider === 'gemini' ? userApiKey : aiProvider === 'claude' ? claudeApiKey : (deepseekApiKey || undefined);
      if (!currentApiKey && !(aiProvider === 'deepseek' && getProxyParams().idToken)) {
        const providerName = aiProvider === 'gemini' ? 'Gemini' : aiProvider === 'claude' ? 'Claude' : 'DeepSeek';
        const key = prompt(`⚠️ Pro použití AI je nutný API klíč
Vložte ${providerName} API klíč.
Klíč bude uložen pouze ve vašem prohlížeči.`);
        if (key) {
          if (key.startsWith('AIza')) { setUserApiKey(key); if (aiProvider !== 'gemini') setAiProvider('gemini'); }
          else if (key.startsWith('sk-ant-')) { setClaudeApiKey(key); if (aiProvider !== 'claude') setAiProvider('claude'); }
          else if (key.startsWith('sk-')) { setDeepseekApiKey(key); if (aiProvider !== 'deepseek') setAiProvider('deepseek'); }
          else { if (aiProvider === 'gemini') setUserApiKey(key); else if (aiProvider === 'claude') setClaudeApiKey(key); else setDeepseekApiKey(key); }
        } else {
          setIsRegeneratingExplanation(false);
          return;
        }
      }

      // Cancel any existing AI operations
      AICancellationManager.cancelAllOperations();

      const lo = allLOs.find(l => l.id === q.lo_id);
      const controller = AICancellationManager.createController('regenerate');

      const displayCorrectOption = (drillSettings.shuffleAnswers && shuffledQuestion && view === 'drill')
        ? getAvailableOptions(shuffledQuestion.originalQuestion)[shuffledQuestion.displayCorrect]
        : undefined;

      const explanation = await getDetailedExplanation(
        q,
        lo,
        aiProvider === 'gemini' ? userApiKey : aiProvider === 'claude' ? claudeApiKey : (deepseekApiKey || undefined),
        aiModel,
        aiProvider,
        controller.signal,
        displayCorrectOption,
        AI_PROXY_URL,
        await getProxyIdToken(),
        userApiKey,
        claudeApiKey,
        (chunk) => {
          if (questionsRef.current[currentQuestionIndexRef.current]?.id === capturedQuestionId) {
            setAiExplanationQuestionId(capturedQuestionId);
            setAiExplanation(prev => (prev || '') + chunk);
          }
        }
      );

      if (questionsRef.current[currentQuestionIndexRef.current]?.id !== capturedQuestionId) return;
      setAiExplanation(explanation.explanation);
      setAiExplanationQuestionId(capturedQuestionId);
      setAiExplanationGeneratedBy({ provider: aiProvider, model: aiModel });
      setAiDetectedObjective(explanation.objective || null);
      setDetailedExplanation(null);

      // Uložit do DynamoDB (authenticated only)
      if (!isGuestMode && user?.id && isCredentialsReady) {
        const cacheKey = toExplanationCacheKey(q.id);
        dynamoDBService.saveExplanationWithObjective(
          cacheKey,
          explanation.explanation,
          null,
          explanation.objective || null,
          aiProvider as 'gemini' | 'claude',
          aiModel
        ).catch((err) => { console.error('[Explanation] ❌ DynamoDB regen-save FAILED:', err); });

        if (q.source === 'ai' && explanation.objective) {
          dynamoDBService.updateQuestionLO((q as any)._dbQuestionId || q.questionId || q.id, explanation.objective).catch(() => { });
        }
      }

      // Uložit do localStorage jako fallback
      try {
        localStorage.setItem(`ai_explanation_${q.id}`, JSON.stringify({
          questionId: q.id, explanation: explanation.explanation,
          provider: aiProvider, model: aiModel, createdAt: new Date().toISOString()
        }));
      } catch (_) { }

    } catch (error: any) {
      if (error?.message === 'Operation cancelled') {
        // Explanation regeneration cancelled
      } else {
        const msg = getAIErrorMessage(error); if (msg) alert(msg);
      }
    } finally {
      setIsRegeneratingExplanation(false);
      AICancellationManager.cleanupOperation('regenerate');
    }
  };

  const handleFetchDetailedExplanation = async () => {
    console.log('[Detailed] Starting detailed explanation fetch...');
    const q = questions[currentQuestionIndex];
    if (!q) {
      console.log('[Detailed] No question found');
      return;
    }

    // Guest mode = žádný přístup k AI
    if (isGuestMode) {
      showAuthPrompt('ai');
      return;
    }

    console.log('[Detailed] Question:', q.id);
    console.log('[Detailed] Provider:', aiProvider);

    const currentApiKey = aiProvider === 'gemini' ? userApiKey : aiProvider === 'claude' ? claudeApiKey : (deepseekApiKey || undefined);
    console.log('[Detailed] API Key exists:', !!currentApiKey);
    console.log('[Detailed] Proxy params available:', !!(aiProvider === 'deepseek' && getProxyParams().idToken));

    if (!currentApiKey && !(aiProvider === 'deepseek' && getProxyParams().idToken)) {
      console.log('[Detailed] No API key available, prompting...');
      const providerName = aiProvider === 'gemini' ? 'Gemini' : aiProvider === 'claude' ? 'Claude' : 'DeepSeek';
      const key = prompt(`⚠️ Pro použití AI je nutný API klíč
Vložte ${providerName} API klíč.

💡 Klíč se automaticky rozpozná.
V nastavení lze změnit defaultni model.`);
      if (key) {
        if (key.startsWith('AIza')) {
          setUserApiKey(key); if (aiProvider !== 'gemini') setAiProvider('gemini');
        } else if (key.startsWith('sk-ant-')) {
          setClaudeApiKey(key); if (aiProvider !== 'claude') setAiProvider('claude');
        } else if (key.startsWith('sk-')) {
          setDeepseekApiKey(key); if (aiProvider !== 'deepseek') setAiProvider('deepseek');
        } else {
          if (aiProvider === 'gemini') setUserApiKey(key);
          else if (aiProvider === 'claude') setClaudeApiKey(key);
          else setDeepseekApiKey(key);
        }
      } else {
        console.log('[Detailed] User cancelled API key prompt');
        return;
      }
    }

    setIsGeneratingDetailedExplanation(true);
    try {
      console.log('[Detailed] Starting AI call...');

      const lo = allLOs.find(l => l.id === q.lo_id);
      console.log('[Detailed] LO found:', !!lo);

      // Check if we already have detailed explanation in database
      if (q.ai_detailed_explanation) {
        console.log('[Detailed] Found cached detailed explanation');
        setDetailedExplanation(q.ai_detailed_explanation);
        return;
      }

      console.log('[Detailed] No cached explanation, calling AI...');
      const displayCorrectOption = (drillSettings.shuffleAnswers && shuffledQuestion && view === 'drill')
        ? getAvailableOptions(shuffledQuestion.originalQuestion)[shuffledQuestion.displayCorrect]
        : undefined;

      console.log('[Detailed] Calling getDetailedHumanExplanation...');
      let detailedExplanationResult: string;
      try {
        const proxyToken = await getProxyIdToken();
        console.log('[Detailed] Proxy token obtained:', !!proxyToken);

        detailedExplanationResult = await getDetailedHumanExplanation(
          q, lo,
          currentApiKey,
          aiModel, aiProvider, undefined, displayCorrectOption,
          AI_PROXY_URL, proxyToken, userApiKey, claudeApiKey,
          (chunk: string) => {
            setDetailedExplanation(prev => prev + chunk);
          }
        );

        console.log('[Detailed] AI call completed, result length:', detailedExplanationResult?.length);
        setDetailedExplanation(detailedExplanationResult);
      } catch (error) {
        console.error('[Detailed] Error in getDetailedHumanExplanation:', error);
        throw error;
      }

      // Save detailed explanation to DynamoDB + localStorage
      try {
        console.log('[Detailed] Starting save to DB...');
        const explanationKey = String(q.id);
        console.log('[Detailed] Explanation key:', explanationKey);
        console.log('[Detailed] Result to save:', detailedExplanationResult?.substring(0, 100) + '...');

        // Save to DynamoDB — only for authenticated users
        if (!isGuestMode && user?.id && isCredentialsReady) {
          dynamoDBService.saveExplanationWithObjective(
            explanationKey,
            q.ai_explanation || aiExplanation || '',
            detailedExplanationResult,
            null,
            aiProvider as 'gemini' | 'claude',
            aiModel
          ).then(() => {
            console.log('[Detailed] ✅ Saved to DynamoDB');
          }).catch((err) => {
            console.error('[Detailed] ❌ DynamoDB save failed:', err);
          });
        }

        // Save to localStorage — klíč bez model názvu
        const localKey = `ai_explanation_${String(q.id)}`;
        const existing = JSON.parse(localStorage.getItem(localKey) || '{}');
        localStorage.setItem(localKey, JSON.stringify({
          ...existing,
          questionId: q.id,
          detailedExplanation: detailedExplanationResult,
          provider: aiProvider,
          model: aiModel,
          createdAt: new Date().toISOString()
        }));
        console.log('[Detailed] ✅ Saved to localStorage');

        setQuestions(prev => prev.map(question =>
          question.id === q.id ? { ...question, ai_detailed_explanation: detailedExplanationResult } : question
        ));
        console.log('[Detailed] ✅ Updated local state');
      } catch (error) {
        console.error('[Detailed] ❌ Save failed:', error);
      }
    } catch (error: any) {
      const msg = getAIErrorMessage(error); if (msg) alert(msg);
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

  const handleResetFlags = async () => {
    if (!window.confirm('Opravdu chcete smazat všechny vlaječky? Tuto akci nelze vrátit.')) return;

    try {
      localStorage.removeItem('question_flags');
      if (!isGuestMode && user?.id) {
        await dynamoDBService.deleteAllQuestionFlags(String(user.id));
      }
      alert('Vlaječky byly úspěšně smazány.');
    } catch (error) {
      alert('Chyba při mazání vlaječek.');
    }
  };

  const toggleFlag = async (questionId: string | number, currentFlag: boolean) => {
    const newFlag = !currentFlag;
    const now = new Date().toISOString();
    const flagData = { isFlagged: newFlag, flaggedAt: now };

    try {
      const flags = JSON.parse(localStorage.getItem('question_flags') || '{}');
      flags[questionId] = flagData;
      localStorage.setItem('question_flags', JSON.stringify(flags));
      // Sync to DynamoDB only if not guest
      if (!isGuestMode && user && user.id) {
        dynamoDBService.toggleQuestionFlag(user.id, String(questionId), newFlag).catch(() => { });
      }
    } catch (error) {
      // Silent fail
    }
    // Update locally
    setQuestions(prev => {
      // In Flagged mode, if unflagging, remove the question from the list
      if (selectedSubject?.id === -2 && !newFlag) {
        return prev.filter(q => q.id !== questionId);
      }
      return prev.map(q => q.id === questionId ? { ...q, is_flagged: newFlag } : q);
    });

    // Handle index adjustment if the current question was removed
    if (selectedSubject?.id === -2 && !newFlag) {
      // If we removed more questions than are left, or if index was at the end
      setCurrentQuestionIndex(prev => {
        const remainingCount = questions.length - 1;
        if (remainingCount === 0) return 0; // Will show empty state
        return Math.min(prev, remainingCount - 1);
      });
      setAnswered(null);
      setShowExplanation(false);
    }
  };

  useEffect(() => {
    if ((view === 'settings' || view === 'ai') && importSubjectId) {
      fetchCoverage(importSubjectId);
    }
    if (view === 'ai') {
      fetchAllCoverage();
    }
  }, [view, importSubjectId]);

  const fetchAllCoverage = async () => {
    try {
      const subjectIds = Object.keys(getDynamicSyllabusScope(allLOs)).map(Number);
      const allQuestions = await Promise.all(subjectIds.map(id => loadStaticQuestions(id)));
      const global = new Set<string>(
        allQuestions.flat().map(q => q.loId || q.lo_id).filter(Boolean) as string[]
      );
      setGlobalCoveredLOs(global);
    } catch {
      // silent fail
    }
  };

  const fetchCoverage = async (subjectId: number) => {
    try {
      // Load questions from DynamoDB for the specific subject
      const data = await loadStaticQuestions(subjectId);
      const covered = new Set(data.map(q => q.loId || q.lo_id).filter(Boolean).map(id => id?.trim()) as string[]);
      setCoveredLOs(covered);

      // Calculate actual covered LOs like AI generator
      const allSubjectLOs = allLOs.filter(lo => lo.subject_id === subjectId);
      const losWithQuestions = new Set(data.map(q => q.loId || q.lo_id).filter(Boolean));

      const uniqueLosWithQuestions = new Set();
      allSubjectLOs.forEach(lo => {
        if (losWithQuestions.has(lo.id)) {
          uniqueLosWithQuestions.add(lo.id);
        }
      });

      setActualCoveredLOs(uniqueLosWithQuestions.size);
    } catch (error) {
      // Error fetching coverage
    }
  };

  const handleCheckDuplicates = async () => {
    if (!importSubjectId) return;

    setIsCheckingDuplicates(true);
    try {
      const report = await checkSubjectDuplicates(importSubjectId, loadStaticQuestions);
      setDuplicateReport(report);
      // console.log('🔍 Duplicate Report:', report);
    } catch (error) {
      console.error('Error checking duplicates:', error);
    } finally {
      setIsCheckingDuplicates(false);
    }
  };

  // DEPRECATED: LO generation removed
const handleGenerateLOs = async () => {
    console.warn('[handleGenerateLOs] DEPRECATED');
    setIsGeneratingLOs(false);
    return { success: false, los: [], error: 'DEPRECATED' };
  };

  const startDrillForLO = (loId: string) => {
    setSyllabusOpen(false);
    let loQuestions = questions.filter(q => q.lo_id === loId);
    if (loQuestions.length === 0) {
      alert(`Žádné otázky pro téma ${loId}. Nejprve vygenerujte otázky v AI modulu.`);
      return;
    }

    // Apply sorting using centralized sorting service
    loQuestions = applySorting(loQuestions, drillSettings.sorting);

    setQuestions(loQuestions);
    setCurrentQuestionIndex(0);
    setAnswered(null);
    setShowExplanation(false);

    // Update shuffle history if using weighted learning
    if (drillSettings.sorting === 'weighted_learning') {
      updateShuffleHistoryLocal(loQuestions);
    }
    language.resetTranslation(); // Reset translation when opening from syllabus
    setView('drill');
  };

  const handleGenerateQuestionForLO = async (loId: string) => {
    const lo = allLOs.find(l => l.id === loId);
    if (!lo) return;
    let effectiveApiKey = aiProvider === 'gemini' ? userApiKey : aiProvider === 'claude' ? claudeApiKey : (deepseekApiKey || undefined);
    if (!effectiveApiKey && !(aiProvider === 'deepseek' && getProxyParams().idToken)) {
      alert('Pro generování otázek je nutný API klíč. Nastavte ho v Nastavení.');
      return;
    }
    setSyllabusGeneratingLO(loId);
    setSyllabusGeneratedQuestion(null);
    try {
      const results = await generateBatchQuestions(
        [lo], 1, language.generateLanguage, effectiveApiKey, aiModel, aiProvider,
        selectedLicense, undefined, AI_PROXY_URL, await getProxyIdToken()
      );
      const q = results?.[0]?.questions?.[0];
      if (q) setSyllabusGeneratedQuestion({ loId, question: q });
    } catch (e: any) {
      const msg = getAIErrorMessage(e); if (msg) alert(msg);
    } finally {
      setSyllabusGeneratingLO(null);
    }
  };

  const handleSaveSyllabusQuestion = async () => {
    if (!syllabusGeneratedQuestion || userRole !== 'admin') return;
    const { loId, question } = syllabusGeneratedQuestion;
    const lo = allLOs.find(l => l.id === loId);
    
    // Zkusit získat subjectId z LO, nebo z prefixu LO ID (např. '010' -> 1)
    let subjectId = lo?.subject_id;
    if (!subjectId) {
      const prefix = loId.split('.')[0];
      const mapping: Record<string, number> = {
        '010': 1, '040': 2, '050': 3, '090': 4, '081': 5, '082': 5, 
        '070': 6, '033': 7, '030': 7, '021': 8, '022': 8, '061': 9, '062': 9
      };
      subjectId = mapping[prefix];
    }

    if (!subjectId) {
      alert(`Nepodařilo se určit předmět (subjectId) pro LO: ${loId}. Uložení přerušeno.`);
      return;
    }

    const q = {
      id: Date.now() + Math.random(),
      question: question.text || '',
      answers: [question.option_a || '', question.option_b || '', question.option_c || '', question.option_d || ''],
      correct: ['A', 'B', 'C', 'D'].indexOf(question.correct_option || 'A'),
      explanation: question.explanation || '',
      lo_id: loId,
      source: 'ai',
    };
    try {
      const result = await dynamoDBService.saveQuestion(subjectId, q);
      if (result.success) {
        setSyllabusGeneratedQuestion(null);
        
        // Vynutit nové načtení otázek pro tento LO v UI
        setSyllabusLOQuestionsLoading(true);
        dynamoDBService.getQuestionsByLO(loId)
          .then(r => {
            const mapped = (r.data || []).map((q: any) => ({
              ...q,
              id: q.questionId || q.id,
              text: q.question || q.text,
              answers: q.answers || q.options || [],
              correct_answer: q.correct !== undefined ? q.correct : (q.correct_answer ?? q.correctAnswer),
              _sourceLayoutId: `syllabus-q-${q.questionId || q.id}`
            }));
            setSyllabusLOQuestions(mapped);
          })
          .finally(() => {
            setSyllabusLOQuestionsLoading(false);
          });

        await syncUserData();
      } else {
        alert('Uložení selhalo: ' + result.error);
      }
    } catch (e: any) {
      alert('Chyba při ukládání: ' + e.message);
    }
  };

  const openSyllabusAtLO = (loId: string) => {
    setSyllabusOpen(true);
    setSyllabusSelectedLO(loId);
    
    // Auto-expand parents based on LO ID structure (e.g. 010.02.01)
    const parts = loId.split('.');
    if (parts.length >= 1) {
      setSyllabusExpandedSubjects(prev => new Set([...prev, parts[0]]));
    }
    if (parts.length >= 2) {
      setSyllabusExpandedTopics(prev => new Set([...prev, parts.slice(0, 2).join('.')]));
    }
    if (parts.length >= 3) {
      setSyllabusExpandedSubtopics(prev => new Set([...prev, parts.slice(0, 3).join('.')]));
    }
  };

  const handleSaveGeneratedLOs = async () => {
    if (userRole !== 'admin' || !generatedLOs.length) return;
    alert('Ukládání hromadně generovaných LO není v této verzi plně implementováno.');
  };

  const handlePreviewQuestionForLO = async (loId: string) => {
    try {
      const response = await dynamoDBService.getQuestionsByLO(loId);
      if (response.success && response.data && response.data.length > 0) {
        const q = response.data[0];
        const mapped = {
          ...q,
          id: q.questionId || q.id,
          text: q.question || q.text,
          answers: q.answers || q.options || [],
          correct_answer: q.correct !== undefined ? q.correct : (q.correct_answer ?? q.correctAnswer),
          _sourceLayoutId: `syllabus-tree-lo-${loId}`
        };
        setExpandedSyllabusQuestion(mapped);
      } else {
        alert(`Pro téma ${loId} nebyly nalezeny žádné otázky.`);
      }
    } catch (error) {
      console.error('Error fetching preview question:', error);
    }
  };

  const handleAddDocumentLink = () => {
    if (newDocumentLink.trim()) {
      setAdditionalDocumentLinks(prev => [...prev, newDocumentLink.trim()]);
      setNewDocumentLink('');
    }
  };

  const handleRemoveDocumentLink = (index: number) => {
    setAdditionalDocumentLinks(prev => prev.filter((_, i) => i !== index));
  };

  const handleGenerateQuestions = async () => {
    if (userRole === 'guest') {
      alert('Tato funkce je jen pro ověřené uživatele');
      return;
    }
    let effectiveApiKey = aiProvider === 'gemini' ? userApiKey : aiProvider === 'claude' ? claudeApiKey : (deepseekApiKey || undefined);

    if (!effectiveApiKey && !(aiProvider === 'deepseek' && getProxyParams().idToken)) {
      const providerName = aiProvider === 'gemini' ? 'Gemini' : aiProvider === 'claude' ? 'Claude' : 'DeepSeek';
      const key = prompt(`⚠️ Pro použití AI je nutný API klíč
Vložte Gemini, Claude nebo DeepSeek API klíč (aktuálně vybráno: ${providerName}).

💡 Klíč se automaticky rozpozná.
V nastavení lze změnit defaultni model.`);
      if (key) {
        // Inteligentní detekce typu klíče
        if (key.startsWith('AIza')) {
          // Gemini klíč
          setUserApiKey(key);
          if (aiProvider !== 'gemini') {
            setAiProvider('gemini');
          }
          effectiveApiKey = key;
        } else if (key.startsWith('sk-ant-')) {
          // Claude klíč
          setClaudeApiKey(key);
          if (aiProvider !== 'claude') {
            setAiProvider('claude');
          }
          effectiveApiKey = key;
        } else if (key.startsWith('sk-')) {
          // DeepSeek klíč
          setDeepseekApiKey(key);
          if (aiProvider !== 'deepseek') {
            setAiProvider('deepseek');
          }
          effectiveApiKey = key;
        } else {
          // Neznámý formát - uložit podle aktuálního provideru
          if (aiProvider === 'gemini') {
            setUserApiKey(key);
          } else if (aiProvider === 'claude') {
            setClaudeApiKey(key);
          } else {
            setDeepseekApiKey(key);
          }
        }
      } else {
        return;
      }
    }

    setIsGeneratingDetailedExplanation(true);
    setBatchResults([]);
    try {
      // Find LOs for the current subject
      const allSubjectLOs = allLOs.filter(lo => lo.subject_id === importSubjectId);

      // Load existing questions to check which LOs already have questions
      const existingQuestions = await loadStaticQuestions(importSubjectId);
      const losWithQuestions = new Set(existingQuestions.map(q => q.lo_id).filter(Boolean));

      // Count unique LOs that have questions (not total question LO IDs)
      const uniqueLosWithQuestions = new Set();
      allSubjectLOs.forEach(lo => {
        if (losWithQuestions.has(lo.id)) {
          uniqueLosWithQuestions.add(lo.id);
        }
      });

      // Update the actual coverage state
      setActualCoveredLOs(uniqueLosWithQuestions.size);

      // Debug: Show LO IDs and question LO IDs
      /* console.log('🔍 Debug - LOs analysis:', {
        subjectId: importSubjectId,
        totalLOs: allSubjectLOs.length,
        loIds: allSubjectLOs.slice(0, 5).map(lo => ({ id: lo.id, title: lo.title })),
        questionsCount: existingQuestions.length,
        questionLoIds: existingQuestions.slice(0, 5).map(q => ({ lo_id: q.lo_id, question: q.text.substring(0, 50) })),
        losWithQuestions: Array.from(losWithQuestions).slice(0, 5),
        uniqueLosWithQuestionsCount: uniqueLosWithQuestions.size
      }); */

      // Filter LOs that don't have questions yet
      const missingLOs = allSubjectLOs.filter(lo => !losWithQuestions.has(lo.id));

      console.log(`📊 LOs analysis:`, {
        total: allSubjectLOs.length,
        withQuestions: uniqueLosWithQuestions.size,
        missing: missingLOs.length,
        batchSize
      });

      // Only generate for LOs that don't have questions yet
      let targets = missingLOs.slice(0, batchSize);

      // If no missing LOs, all topics are already covered
      if (targets.length === 0) {
        alert('Všechna témata pro tento předmět už mají vygenerované otázky.');
        setIsGeneratingDetailedExplanation(false);
        return;
      }

      // console.log(`🎯 Selected ${targets.length} LOs for generation:`, targets.map(t => t.id));

      // Process in chunks of 5 LOs to avoid hitting output token limits
      const CHUNK_SIZE = 5;
      const allResults: { loId: string, questions: Partial<Question>[] }[] = [];

      for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
        const chunk = targets.slice(i, i + CHUNK_SIZE);
        const chunkResults = await generateBatchQuestions(chunk, questionsPerLO, language.generateLanguage, effectiveApiKey, aiModel, aiProvider, selectedLicense, undefined, AI_PROXY_URL, await getProxyIdToken());
        allResults.push(...chunkResults);
        setBatchResults([...allResults]); // Update UI incrementally
      }

      setBatchResults(allResults);
    } catch (error: any) {
      if (error?.message === 'API_KEY_MISSING') {
        alert('Chybí API klíč. Vložte prosím API klíč (Gemini nebo Claude).');
      } else if (error?.message === 'API_KEY_INVALID') {
        alert('Vložený API klíč není platný.');
      } else if (error?.message?.toLowerCase().includes('429') || error?.message?.toLowerCase().includes('resource_exhausted') || error?.message?.toLowerCase().includes('rate exceeded')) {
        alert('Limit požadavků (Rate Limit) byl vyčerpán. Prosím počkejte minutu.');
      } else {
        alert(`Generování otázek se nezdařilo.\n\nDetail: ${error?.message || String(error)}`);
      }
    } finally {
      setIsGeneratingDetailedExplanation(false);
    }
  };

  const saveGeneratedQuestions = async () => {
    if (userRole !== 'admin') {
      alert('Nemáte dostatečné oprávnění. Tuto akci může provést pouze administrátor.');
      return;
    }
    if (batchResults.length === 0 || !importSubjectId) return;

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
        explanation_cz: q.explanation_cz || undefined,
        text_cz: q.text_cz || undefined,
        option_a_cz: q.option_a_cz || undefined,
        option_b_cz: q.option_b_cz || undefined,
        option_c_cz: q.option_c_cz || undefined,
        option_d_cz: q.option_d_cz || undefined,
        image: null,
        lo_id: result.loId,
        source: 'ai'
      }))
    );

    try {
      // Save to DynamoDB
      const savePromises = allQuestionsToImport.map((q: any) =>
        dynamoDBService.saveQuestion(importSubjectId, q)
      );
      const results = await Promise.all(savePromises);
      const successful = results.filter(r => r.success).length;
      const failed = results.length - successful;

      // Also persist to localStorage as cache
      const cached = JSON.parse(localStorage.getItem('questions') || '[]');
      localStorage.setItem('questions', JSON.stringify([...cached, ...allQuestionsToImport]));

      setImportStatus({
        type: 'success',
        message: `✅ Uloženo ${successful} otázek do DB${failed > 0 ? ` (${failed} selhalo)` : ''} pro ${batchResults.length} témat.`
      });
      setBatchResults([]);
      await Promise.all([fetchSubjects(), syncUserData(), fetchCoverage(importSubjectId)]);
    } catch (error: any) {
      setImportStatus({ type: 'error', message: `❌ Uložení selhalo: ${error.message}` });
    }
  };

  const fullyResetUserProgress = async (userId: string, isGuestMode: boolean) => {
  // Smaž postup v databázi, pokud je uživatel přihlášen
  if (!isGuestMode && userId && dynamoDBService?.deleteAllUserProgress) {
    try {
      const result = await dynamoDBService.deleteAllUserProgress(String(userId));
      if (!result.success) {
        console.error('[Reset] Failed:', result.error);
        alert('Nepodařilo se smazat postup v databázi: ' + result.error);
      }
    } catch (err) {
      console.error('[Reset] Error při mazání v DB:', err);
    }
  }
  // Smaž všechny relevantní položky v localStorage
  const uid = userId || 'guest';
  localStorage.removeItem(`${uid}:user_progress`);
  localStorage.removeItem(`${uid}:user_stats`);
  localStorage.removeItem(`${uid}:answers`);
  localStorage.removeItem(`${uid}:guest_stats`);
  localStorage.removeItem(`${uid}:session_start`);
  localStorage.removeItem('question_flags');
  // Další případné položky k mazání lze doplnit zde
};

const handleResetProgress = async () => {
    if (!confirm('Opravdu chcete smazat veškerý váš postup a historii testů? Tato akce je nevratná.')) return;

    try {
      const uid = user?.id || 'guest';
      await fullyResetUserProgress(uid, isGuestMode);
      setStats({
        totalQuestions: 0,
        userQuestions: 0,
        aiQuestions: 0,
        practicedQuestions: 0,
        overallSuccess: 0,
        subjectStats: []
      });
      alert('Váš postup byl úspěšně smazán.');
      window.location.reload();
    } catch (err) {
      console.error('[Reset] Error:', err);
      alert('Nepodařilo se smazat postup.');
    }
  };
  
  // Reset progress for specific subject/category
  const handleResetSubjectProgress = async (subjectId: number, subjectName: string) => {
    if (!window.confirm(`Opravdu chcete smazat postup pro předmět "${subjectName}"? Tato akce je nevratná.`)) return;

    try {
      const uid = user?.id || 'guest';
      
      // Delete from DynamoDB first for authenticated users
      if (!isGuestMode && user?.id) {
        console.log(`[Reset Subject] Deleting subject ${subjectId} from DynamoDB...`);
        const result = await dynamoDBService.deleteSubjectProgress(String(user.id), subjectId);
        if (!result.success) {
          console.error('[Reset Subject] Failed to delete from DynamoDB:', result.error);
          alert('Nepodařilo se smazat postup v databázi: ' + result.error);
          return;
        }
        console.log('[Reset Subject] DynamoDB deletion successful');
      }
      
      const answersKey = `${uid}:answers`;
      const existingAnswers = JSON.parse(localStorage.getItem(answersKey) || '{}');
      
      // Filter out answers for this subject
      const filteredAnswers = Object.entries(existingAnswers).reduce((acc, [key, value]: [string, any]) => {
        if (value.subjectId !== subjectId) {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, any>);
      
      localStorage.setItem(answersKey, JSON.stringify(filteredAnswers));
      console.log('[Reset Subject] localStorage updated');

      // Recalculate stats locally from filtered answers - do NOT call syncUserData()
      // because getUserProgress uses eventually consistent reads and may return
      // the just-deleted items, overwriting the freshly cleaned localStorage.
      const practicedCount = Object.keys(filteredAnswers).length;
      const correctCount = Object.values(filteredAnswers).filter((a: any) => a.isCorrect).length;
      const successRate = practicedCount > 0 ? correctCount / practicedCount : 0;

      const perSubject: Record<number, { correct: number; total: number }> = {};
      for (const a of Object.values(filteredAnswers) as any[]) {
        const sid = Number(a.subjectId);
        if (!sid) continue;
        if (!perSubject[sid]) perSubject[sid] = { correct: 0, total: 0 };
        perSubject[sid].total++;
        if (a.isCorrect) perSubject[sid].correct++;
      }
      const newSubjectStats: { [id: number]: { correctAnswers: number; totalAnswered: number } } = {};
      subjects.forEach(sub => {
        newSubjectStats[sub.id] = {
          correctAnswers: perSubject[sub.id] ? perSubject[sub.id].correct : 0,
          totalAnswered: perSubject[sub.id] ? perSubject[sub.id].total : 0
        };
      });

      setStats(prev => prev ? {
        ...prev,
        practicedQuestions: practicedCount,
        overallSuccess: successRate,
        subjectStats: newSubjectStats
      } : prev);

      alert(`Postup pro předmět "${subjectName}" byl smazán.`);
    } catch (err) {
      alert('Nepodařilo se smazat postup.');
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

  const handleDownloadCategories = async () => {
    if (userRole !== 'admin') {
      alert('Toto oprávnění má jen administrátor');
      return;
    }

    try {
      const allCategories: any[] = [];

      // Get all subjects with their questions
      for (const subject of subjects) {
        const questions = await loadStaticQuestions(subject.id);
        const categoryData = {
          id: subject.id,
          name: subject.name,
          description: subject.description,
          question_count: questions.length,
          success_rate: subject.success_rate,
          user_count: subject.user_count,
          ai_count: subject.ai_count,
          questions: questions.map(q => ({
            id: q.id,
            question: q.text,
            answers: [q.option_a, q.option_b, q.option_c, q.option_d],
            correct: q.correct_option,
            subject_id: q.subject_id,
            source: q.source || 'user',
            lo_id: q.lo_id,
            explanation: q.explanation,
            explanation_cz: q.explanation_cz,
            difficulty: q.difficulty,
            is_flagged: q.is_flagged,
            correct_count: q.correct_count,
            incorrect_count: q.incorrect_count
          }))
        };
        allCategories.push(categoryData);
      }

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(allCategories, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aeropilot-categories-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      console.log(`✅ Staženo ${allCategories.length} kategorií s otázkami`);
    } catch (error) {
      alert('Nepodařilo se stáhnout kategorie z databáze.');
    }
  };

  const handleDownloadQuestions = async () => {
    if (userRole !== 'admin') {
      alert('Toto oprávnění má jen administrátor');
      return;
    }

    try {
      const result = await dynamoDBService.getAllQuestions();

      if (!result.success) {
        alert(`Chyba při stahování: ${result.error}`);
        return;
      }

      const questions = result.data || [];

      // Transform DynamoDB format to app format
      const formattedQuestions = questions.map((q: any) => ({
        id: q.questionId,
        question: q.question,
        answers: q.answers,
        correct: ['A', 'B', 'C', 'D'].indexOf(q.correctOption),
        explanation: q.explanation,
        lo_id: q.loId,
        source: q.source,
        subject_id: q.subjectId,
        created_at: q.createdAt,
        created_by: q.createdBy
      }));

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(formattedQuestions, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aeropilot-questions-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      // Removed console log here
    } catch (error) {
      alert('Nepodařilo se stáhnout otázky z databáze.');
    }
  };

  const handleImport = async () => {
    if (userRole !== 'admin') {
      setImportStatus({ type: 'error', message: 'Toto oprávnění má jen administrátor' });
      return;
    }
    if (!importSubjectId || !importJson.trim()) {
      setImportStatus({ type: 'error', message: 'Vložte JSON data nebo nahrajte soubor.' });
      return;
    }

    try {
      const parsed = JSON.parse(importJson);
      const questionsWithSource = Array.isArray(parsed)
        ? parsed.map(q => ({ ...q, source: q.source || 'user' }))
        : parsed;

      // Convert to proper Question format (matching saveGeneratedQuestions)
      const allQuestionsToImport = questionsWithSource.map((q: any) => ({
        id: q.id || Date.now() + Math.random(),
        question: q.question || q.text || "Bez textu",
        answers: [
          q.answers[0] || q.option_a || "Možnost A",
          q.answers[1] || q.option_b || "Možnost B",
          q.answers[2] || q.option_c || "Možnost C",
          q.answers[3] || q.option_d || "Možnost D"
        ],
        correct: typeof q.correct === 'string' ? ['A', 'B', 'C', 'D'].indexOf(q.correct) : q.correct,
        explanation: q.explanation || "",
        explanation_cz: q.explanation_cz || undefined,
        text_cz: q.text_cz || undefined,
        option_a_cz: q.option_a_cz || undefined,
        option_b_cz: q.option_b_cz || undefined,
        option_c_cz: q.option_c_cz || undefined,
        option_d_cz: q.option_d_cz || undefined,
        image: q.image || null,
        lo_id: q.lo_id || null,
        source: q.source || 'user'
      }));

      try {
        // If clearExisting is checked, first delete existing questions for this subject
        if (clearExisting) {
          try {
            await dynamoDBService.deleteQuestionsBySubject(importSubjectId!);
          } catch (error) {
            // Continue even if delete fails
          }
        }

        let importResults;

        if (updateExisting) {
          // Update logic: check for existing questions by ID and update or insert
          const existingQuestions = await dynamoDBService.getQuestionsBySubject(importSubjectId!);
          const existingMap = new Map();

          if (existingQuestions.success && existingQuestions.data) {
            existingQuestions.data.forEach((q: any) => {
              // Find original ID from question data
              const originalId = q.originalId || q.question?.split('_').pop();
              if (originalId) {
                existingMap.set(originalId, q);
              }
            });
          }

          importResults = await Promise.all(allQuestionsToImport.map(async (q: any) => {
            const existing = existingMap.get(String(q.id));

            if (existing) {
              // Update existing question
              const result = await dynamoDBService.updateQuestion(existing.questionId, q);
              return { ...result, action: 'updated', id: q.id };
            } else {
              // Insert new question
              const result = await dynamoDBService.saveQuestion(importSubjectId!, q);
              return { ...result, action: 'inserted', id: q.id };
            }
          }));
        } else {
          // Normal save logic
          importResults = await Promise.all(allQuestionsToImport.map((q: any) =>
            dynamoDBService.saveQuestion(importSubjectId!, q)
          ));
        }

        const successful = importResults.filter(r => r.success).length;
        const failed = importResults.length - successful;

        const updated = importResults.filter(r => r.action === 'updated' && r.success).length;
        const inserted = importResults.filter(r => r.action === 'inserted' && r.success).length;

        // Also persist to localStorage as cache
        if (clearExisting) {
          // Replace all questions for this subject
          const cached = JSON.parse(localStorage.getItem('questions') || '[]');
          const otherSubjectsQuestions = cached.filter((q: any) => q.subject_id !== importSubjectId);
          localStorage.setItem('questions', JSON.stringify([...otherSubjectsQuestions, ...allQuestionsToImport]));
        } else {
          // Add to existing
          const cached = JSON.parse(localStorage.getItem('questions') || '[]');
          localStorage.setItem('questions', JSON.stringify([...cached, ...allQuestionsToImport]));
        }

        setImportStatus({
          type: 'success',
          message: updateExisting
            ? `✅ Aktualizováno ${updated} otázek, přidáno ${inserted} nových${failed > 0 ? ` (${failed} selhalo)` : ''}.`
            : `✅ Uloženo ${successful} otázek do DB${failed > 0 ? ` (${failed} selhalo)` : ''}.`
        });
        setImportJson('');
        await Promise.all([fetchSubjects(), syncUserData()]);
      } catch (error: any) {
        setImportStatus({ type: 'error', message: `❌ Uložení selhalo: ${error.message}` });
      }
    } catch (err) {
      setImportStatus({ type: 'error', message: 'Neplatný formát JSON.' });
    }
  };


  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'dark' : ''}`}>
      {isGuestMode && <div className="demo-app-frame" />}
      {/* Loading State - Prevent landing page flash */}
      {isAuthLoading ? (
        <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-[var(--ink)] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-sm opacity-50">Loading...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Landing Page - Gatekeeper */}
          {showLandingPage && (
            <>
              <LandingPage
                onGuestMode={handleLandingGuestMode}
                onAuthSuccess={handleLandingAuthSuccess}
                onClose={() => { }}
              />
              {/* Render dashboard content in background for blur effect */}
              <div className="opacity-0">
                {/* Dashboard content for background blur */}
                <main className="p-4 pt-[80px]">
                  <div className="max-w-7xl mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                      {/* Stats cards for background */}
                      <div className="p-6 border border-[var(--line)] rounded-2xl space-y-2">
                        <p className="col-header">Total Questions</p>
                        <p className="text-4xl font-mono font-bold">1000</p>
                      </div>
                      <div className="p-6 border border-[var(--line)] rounded-2xl space-y-2">
                        <p className="col-header">Practiced</p>
                        <p className="text-4xl font-mono font-bold">0</p>
                      </div>
                      <div className="p-6 border border-[var(--line)] rounded-2xl space-y-2">
                        <p className="col-header">Success Rate</p>
                        <p className="text-4xl font-mono font-bold">75%</p>
                      </div>
                      <div className="p-6 border border-[var(--line)] rounded-2xl space-y-2">
                        <p className="col-header">Session Time</p>
                        <p className="text-4xl font-mono font-bold">0 min</p>
                      </div>
                    </div>
                  </div>
                </main>
              </div>
            </>
          )}

          {/* Header - Hide when landing page is shown */}
          {!showLandingPage && (
            <>
            <header className="border-b border-[var(--line)] px-4 py-3 flex justify-between items-center sticky top-0 bg-[var(--bg)] z-50 min-h-[60px]">
              {/* Left section - Logo and title (always visible) */}
              <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setView('dashboard')}>
                <div className="w-10 h-10 min-w-[40px] bg-gray-600 dark:bg-gray-700 text-white flex items-center justify-center rounded-lg font-bold text-xl flex-shrink-0 group-hover:scale-105 transition-transform">
                  A
                </div>
                <div className="min-w-0">
                  <h1 className="font-bold text-lg leading-tight group-hover:text-indigo-600 transition-colors">Aeropilot Exam Prep</h1>
                  <div className="flex items-center gap-2 text-xs opacity-60 leading-tight">
                    <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'} flex-shrink-0`}></span>
                    <span className="truncate">{isOnline ? 'Online' : 'Offline'}</span>
                  </div>
                </div>
              </div>

              {/* Desktop navigation - Hidden on mobile */}
              <nav className="hidden md:flex gap-4 lg:gap-6 items-center">
                <button onClick={() => setView('dashboard')} className={`text-xs uppercase tracking-widest font-semibold flex items-center gap-2 whitespace-nowrap transition-opacity ${view === 'dashboard' ? 'opacity-100' : 'opacity-40 hover:opacity-100'}`}>
                  <LayoutDashboard size={14} className="flex-shrink-0" />
                  <span className="hidden sm:inline">Dashboard</span>
                </button>
                <button
                  onClick={() => isGuestMode ? showAuthPrompt('stats') : setView('stats')}
                  className={`text-xs uppercase tracking-widest font-semibold flex items-center gap-2 whitespace-nowrap transition-opacity ${view === 'stats' ? 'opacity-100' : 'opacity-40 hover:opacity-100'}`}
                >
                  <BarChart3 size={14} className="flex-shrink-0" />
                  <span className="hidden sm:inline">Statistiky</span>
                </button>
                <button
                  onClick={() => setSyllabusOpen(true)}
                  className={`text-xs uppercase tracking-widest font-semibold flex items-center gap-2 whitespace-nowrap transition-opacity ${syllabusOpen ? 'opacity-100' : 'opacity-40 hover:opacity-100'}`}
                >
                  <BookOpen size={14} className="flex-shrink-0" />
                  <span className="hidden sm:inline">Osnovy</span>
                </button>
                {userApiKey && (
                  <button
                    onClick={() => isGuestMode ? showAuthPrompt('ai') : setView('ai')}
                    className={`text-xs uppercase tracking-widest font-semibold flex items-center gap-2 whitespace-nowrap transition-opacity ${view === 'ai' ? 'opacity-100' : 'opacity-40 hover:opacity-100'}`}
                  >
                    <Sparkles size={14} className="flex-shrink-0" />
                    <span className="hidden sm:inline">AI Generátor</span>
                  </button>
                )}

                {/* Text Search Button */}
                <button
                  onClick={() => setIsSearchOpen(!isSearchOpen)}
                  className={`text-xs uppercase tracking-widest font-semibold flex items-center gap-2 whitespace-nowrap transition-opacity ${isSearchOpen ? 'opacity-100' : 'opacity-40 hover:opacity-100'}`}
                  title="Hledat otázky"
                >
                  <Search size={14} className="flex-shrink-0" />
                  <span className="hidden sm:inline">Hledat</span>
                </button>
              </nav>

              {/* Right section - Desktop vs Mobile layout */}
              <div className="flex items-center gap-2 sm:gap-3">
                {/* Mobile translate button - Only visible for English questions */}
                <LanguageButton
                  question={questions[currentQuestionIndex]}
                  language={language}
                  mode="mobile"
                  className="opacity-50"
                />

                {/* Mobile menu button - Only visible on mobile */}
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="md:hidden w-10 h-10 flex items-center justify-center rounded-full hover:bg-[var(--ink)] hover:text-[var(--ink-text)] transition-colors flex-shrink-0"
                  title="Menu"
                >
                  <Menu size={18} />
                </button>

                {/* Fixed controls (hidden on mobile, visible on tablet+) */}
                {(view === 'drill' || view === 'exam') && questions[currentQuestionIndex]?.approved && (
                  <div
                    className="flex items-center justify-center bg-green-500 text-white w-9 h-9 rounded-full shadow-lg shadow-green-500/20 flex-shrink-0"
                    title="Otázka schválena auditorem"
                  >
                    <ShieldCheck size={18} strokeWidth={3} />
                  </div>
                )}
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className="hidden md:flex w-10 h-10 items-center justify-center rounded-full hover:bg-[var(--ink)] hover:text-[var(--ink-text)] transition-colors flex-shrink-0"
                  title="Přepnout tmavý režim"
                >
                  {darkMode ? <Sun size={18} /> : <Moon size={18} />}
                </button>

                <button
                  onClick={() => setView('settings')}
                  className={`hidden md:flex w-10 h-10 items-center justify-center rounded-full transition-colors flex-shrink-0 ${view === 'settings' ? 'bg-[var(--ink)] text-[var(--ink-text)]' : 'hover:bg-[var(--ink)] hover:text-[var(--ink-text)]'}`}
                  title="Nastavení"
                >
                  <Settings size={18} />
                </button>

                {/* Desktop layout - everything visible */}
                <div className="hidden xl:flex items-center gap-2">
                  {/* Guest/User status */}
                  {isGuestMode ? (
                    <button
                      onClick={() => showAuthPrompt('stats')}
                      className="hidden sm:flex items-center h-10 px-3 text-gray-600 dark:text-gray-300 rounded-full min-w-0 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors guest-button-blink"
                    >
                      <User size={12} className="opacity-50 flex-shrink-0" />
                      <span className="text-[10px] font-bold uppercase tracking-widest truncate ml-1">DEMO</span>
                    </button>
                  ) : (
                    <div className="hidden sm:flex items-center h-10 px-3 text-gray-600 dark:text-gray-300 rounded-full min-w-0">
                      <User size={12} className="opacity-50 flex-shrink-0" />
                      <span className="text-[10px] font-bold uppercase tracking-widest truncate ml-1" style={{ color: 'var(--gray-800, rgb(31 41 55))' }}>{user?.username}</span>
                      <button
                        onClick={handleLogout}
                        className="ml-2 p-1 hover:text-rose-500 transition-colors rounded flex-shrink-0"
                        title="Odhlásit se"
                      >
                        <XCircle size={12} style={{ color: 'var(--gray-700, rgb(55 65 81))' }} />
                      </button>
                    </div>
                  )}

                  {/* Exam simulation button */}
                  <button
                    onClick={handleShowExamTypeSelection}
                    className="bg-gray-600 dark:bg-gray-700 text-white px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest hover:scale-105 transition-transform"
                  >
                    Simulace zkoušky
                  </button>
                </div>

                {/* Tablet layout - scrollable overflow */}
                <div className="hidden md:flex xl:hidden items-center gap-2 overflow-x-auto scrollbar-hide max-w-[150px] lg:max-w-[200px]">
                  {/* Guest/User status - scrollable */}
                  {isGuestMode ? (
                    <button
                      onClick={() => showAuthPrompt('stats')}
                      className="hidden sm:flex items-center h-10 px-3 text-gray-600 dark:text-gray-300 rounded-full min-w-0 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0 guest-button-blink"
                    >
                      <User size={12} className="opacity-50 flex-shrink-0" />
                      <span className="text-[10px] font-bold uppercase tracking-widest truncate ml-1">DEMO</span>
                    </button>
                  ) : (
                    <div className="hidden sm:flex items-center h-10 px-3 text-gray-600 dark:text-gray-300 rounded-full min-w-0 flex-shrink-0">
                      <User size={12} className="opacity-50 flex-shrink-0" />
                      <span className="text-[10px] font-bold uppercase tracking-widest truncate ml-1" style={{ color: 'var(--gray-800, rgb(31 41 55))' }}>{user?.username}</span>
                      <button
                        onClick={handleLogout}
                        className="ml-2 p-1 hover:text-rose-500 transition-colors rounded flex-shrink-0"
                        title="Odhlásit se"
                      >
                        <XCircle size={12} style={{ color: 'var(--gray-700, rgb(55 65 81))' }} />
                      </button>
                    </div>
                  )}

                  {/* Exam simulation button - scrollable */}
                  <button
                    onClick={startExam}
                    className="bg-gray-600 dark:bg-gray-700 text-white px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest hover:scale-105 transition-transform flex-shrink-0"
                  >
                    Test
                  </button>
                </div>
              </div>
            </header>

            {/* Search Panel - Expandable under header */}
            <AnimatePresence>
              {isSearchOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  className="border-b border-[var(--line)] bg-[var(--bg)] overflow-hidden z-40 sticky top-[60px]"
                >
                  <div className="px-4 py-4 max-w-4xl mx-auto">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1 relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                        <input
                          type="text"
                          placeholder='Hledat otázky nebo ID...'
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && startTextSearchDrill(searchQuery)}
                          className="w-full pl-10 pr-4 py-2.5 bg-[var(--line)]/30 border border-[var(--line)] rounded-xl text-sm focus:outline-none focus:border-indigo-600 transition-all"
                          autoFocus
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => startTextSearchDrill(searchQuery)}
                          disabled={isSearching || searchQuery.length < 2}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                        >
                          {isSearching ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Hledám...
                            </>
                          ) : (
                            <>
                              <Search size={16} />
                              Vyhledat
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setIsSearchOpen(false);
                            setSearchQuery('');
                          }}
                          className="px-3 py-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                          title="Zavřít"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Text: fuzzy hledání | ID: přesná shoda (např. subject1_q123)
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            </>
          )}

          {/* Mobile Menu - Full screen overlay */}
          <AnimatePresence>
            {isMobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 md:hidden"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <motion.div
                  initial={{ y: -100, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -100, opacity: 0 }}
                  className="glass-panel border-b border-[var(--line)] p-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Mobile menu header */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-16 bg-gray-600 dark:bg-gray-700 text-white flex items-center justify-center rounded-2xl font-bold text-3xl mb-6">
                        A
                      </div>
                      <div>
                        <h2 className="font-bold text-lg">Aeropilot Exam Prep</h2>
                        <div className="flex items-center gap-2 text-xs opacity-60">
                          <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
                          <span>{isOnline ? 'Online' : 'Offline'}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[var(--ink)] hover:text-[var(--ink-text)] transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Mobile navigation */}
                  <nav className="space-y-2">
                    <button
                      onClick={() => {
                        setView('dashboard');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${view === 'dashboard' ? 'bg-[var(--ink)] text-[var(--ink-text)]' : 'hover:bg-[var(--ink)] hover:text-[var(--ink-text)]'}`}
                    >
                      <LayoutDashboard size={18} />
                      <span className="font-semibold">Dashboard</span>
                    </button>

                    <button
                      onClick={() => {
                        isGuestMode ? showAuthPrompt('stats') : setView('stats');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${view === 'stats' ? 'bg-[var(--ink)] text-[var(--ink-text)]' : 'hover:bg-[var(--ink)] hover:text-[var(--ink-text)]'}`}
                    >
                      <BarChart3 size={18} />
                      <span className="font-semibold">Statistiky</span>
                    </button>

                    <button
                      onClick={() => {
                        setSyllabusOpen(true);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${syllabusOpen ? 'bg-[var(--ink)] text-[var(--ink-text)]' : 'hover:bg-[var(--ink)] hover:text-[var(--ink-text)]'}`}
                    >
                      <BookOpen size={18} />
                      <span className="font-semibold">Osnovy</span>
                    </button>

                    <button
                      onClick={() => {
                        setIsSearchOpen(!isSearchOpen);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${isSearchOpen ? 'bg-[var(--ink)] text-[var(--ink-text)]' : 'hover:bg-[var(--ink)] hover:text-[var(--ink-text)]'}`}
                    >
                      <Search size={18} />
                      <span className="font-semibold">Hledat</span>
                    </button>

                    {userApiKey && (
                      <button
                        onClick={() => {
                          isGuestMode ? showAuthPrompt('ai') : setView('ai');
                          setIsMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${view === 'ai' ? 'bg-[var(--ink)] text-[var(--ink-text)]' : 'hover:bg-[var(--ink)] hover:text-[var(--ink-text)]'}`}
                      >
                        <Sparkles size={18} />
                        <span className="font-semibold">AI Generátor</span>
                      </button>
                    )}

                    <div className="border-t border-[var(--line)] pt-2 mt-2">
                      <button
                        onClick={() => {
                          setDarkMode(!darkMode);
                        }}
                        className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--ink)] hover:text-[var(--ink-text)] transition-colors"
                      >
                        {darkMode ? <Sun size={18} /> : <Moon size={18} />}
                        <span className="font-semibold">{darkMode ? 'Světlý režim' : 'Tmavý režim'}</span>
                      </button>

                      <button
                        onClick={() => {
                          setView('settings');
                          setIsMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${view === 'settings' ? 'bg-[var(--ink)] text-[var(--ink-text)]' : 'hover:bg-[var(--ink)] hover:text-[var(--ink-text)]'}`}
                      >
                        <Settings size={18} />
                        <span className="font-semibold">Nastavení</span>
                      </button>
                    </div>

                    {/* User status and exam button */}
                    <div className="border-t border-[var(--line)] pt-2 mt-2 space-y-2">
                      {isGuestMode ? (
                        <button
                          onClick={() => {
                            showAuthPrompt('stats');
                            setIsMobileMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-3 p-3 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors guest-button-blink"
                        >
                          <User size={18} />
                          <span className="font-semibold">DEMO - Přihlásit se</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-3 p-3 text-gray-600 dark:text-gray-300 rounded-lg">
                          <User size={18} />
                          <span className="font-semibold">{user?.username}</span>
                          <button
                            onClick={() => {
                              handleLogout();
                              setIsMobileMenuOpen(false);
                            }}
                            className="ml-auto p-2 hover:text-rose-500 transition-colors rounded"
                          >
                            <XCircle size={18} />
                          </button>
                        </div>
                      )}

                      <button
                        onClick={() => {
                          handleShowExamTypeSelection();
                          setIsMobileMenuOpen(false);
                        }}
                        className="w-full bg-gray-600 dark:bg-gray-700 text-white p-3 rounded-lg font-bold uppercase tracking-widest hover:scale-105 transition-transform"
                      >
                        Simulace zkoušky
                      </button>
                    </div>
                  </nav>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <main className={`max-w-7xl mx-auto p-6 transition-all ${isGuestMode ? 'demo-window-blink' : ''}`}>
            <AnimatePresence mode="wait">
              {view === 'dashboard' && (
                <motion.div
                  key="dashboard"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-4"
                >
                  {/* Stats Overview */}
                  <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-1 sm:gap-2 md:gap-4">
                    <div className="p-1 sm:p-2 md:p-6 border border-[var(--line)] rounded sm:rounded-lg md:rounded-2xl space-y-0 sm:space-y-0.5 md:space-y-2">
                      <p className="col-header text-[8px] sm:text-[10px] md:text-sm">
                        {isGuestMode ? 'Úspěšnost v session' : 'Celková úspěšnost'}
                      </p>
                      <div className="flex items-end gap-0 sm:gap-0.5 md:gap-2">
                        <span className="text-sm sm:text-lg md:text-4xl font-mono font-bold">
                          {(() => {
                            const currentStats = isGuestMode ? loadGuestStats() : stats;
                            return currentStats ? Math.round(currentStats.overallSuccess * 100) : 0;
                          })()}%
                        </span>
                        <div className="h-0.5 sm:h-0.5 md:h-2 flex-1 bg-[var(--line)] rounded-full overflow-hidden mb-0 sm:mb-0.5 md:mb-2">
                          <div
                            className="h-full bg-[var(--ink)] transition-all duration-1000"
                            style={{
                              width: `${(() => {
                                const currentStats = isGuestMode ? loadGuestStats() : stats;
                                return currentStats ? currentStats.overallSuccess * 100 : 0;
                              })()}%`
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="p-1 sm:p-2 md:p-6 border border-[var(--line)] rounded sm:rounded-lg md:rounded-2xl space-y-0 sm:space-y-0.5 md:space-y-2">
                      <p className="col-header text-[8px] sm:text-[10px] md:text-sm">
                        Databáze otázek
                      </p>
                      <p className="text-lg sm:text-xl md:text-2xl font-mono font-bold" title={`Celkový počet otázek pro ${selectedLicense === 'SPL' ? 'SPL (kluzáky)' : 'PPL (motorová letadla)'}${selectedLicense === 'SPL' ? ' - bez předmětů 6,7,8' : ''}`}>
                        {(() => {
                          let totalCount = 0;
                          
                          // For KL/MEDLANKY, sum from subjects
                          if (selectedLicenseSubtype === 'KL') {
                            totalCount = subjects.reduce((sum, s) => sum + (s.kl_count || 0), 0);
                          } else if (selectedLicenseSubtype === 'MEDLANKY') {
                            totalCount = subjects.reduce((sum, s) => sum + (s.medlanky_count || 0), 0);
                          } else {
                            // Both guest and user should see the total DB size
                            totalCount = stats ? (stats.totalQuestions || 0) : 0;
                            
                            // Filter by license
                            if (selectedLicense === 'SPL') {
                              // Estimate SPL count by excluding subjects 6,7,8 (roughly 1/3 of questions)
                              totalCount = Math.round(totalCount * 0.67);
                            }
                          }
                          
                          return totalCount > 0 ? totalCount.toLocaleString('cs-CZ').replace(/\s/g, '') : '0';
                        })()}
                        {(() => {
                          let userCount = 0;
                          let aiCount = 0;
                          
                          // For KL/MEDLANKY, no user/ai split
                          if (selectedLicenseSubtype === 'KL' || selectedLicenseSubtype === 'MEDLANKY') return null;
                          
                          if (stats) {
                            // Filter by license
                            if (selectedLicense === 'SPL') {
                              userCount = Math.round((stats.userQuestions || 0) * 0.67);
                              aiCount = Math.round((stats.aiQuestions || 0) * 0.67);
                            } else {
                              userCount = stats.userQuestions || 0;
                              aiCount = stats.aiQuestions || 0;
                            }
                            
                            return (
                              <span className="text-sm sm:text-base md:text-lg opacity-60 ml-2" title={`Uživatelské otázky: ${userCount.toLocaleString('cs-CZ')} | AI/EASA otázky: ${aiCount.toLocaleString('cs-CZ')}`}>
                                ({userCount.toLocaleString('cs-CZ').replace(/\s/g, '')}/{aiCount.toLocaleString('cs-CZ').replace(/\s/g, '')})
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </p>
                      <p className="text-[8px] sm:text-[10px] md:text-sm opacity-50">
                        {stats ? `otázek • UCL/EASA` : 'otázek'}
                        <span className="ml-2 opacity-80" title={`Learning Objectives - výukové cíle podle EASA syllabu${selectedLicense === 'SPL' ? ' (jen pro SPL)' : ''}`}>({(() => {
                          // Filter LOs by license
                          const relevantLOs = selectedLicense === 'SPL' 
                            ? allLOs.filter(lo => {
                                // SPL excludes subjects 6,7,8
                                return ![6, 7, 8].includes(lo.subject_id || 0);
                              }).length
                            : allLOs.length;
                          return relevantLOs;
                        })()} LOs)</span>
                      </p>
                    </div>
                    <div className="p-1 sm:p-2 md:p-6 border border-[var(--line)] rounded sm:rounded-lg md:rounded-2xl space-y-0 sm:space-y-0.5 md:space-y-2">
                      <p className="col-header text-[8px] sm:text-[10px] md:text-sm">
                        Procvičeno otázek
                      </p>
                      <p className="text-sm sm:text-lg md:text-4xl font-mono font-bold">
                        {(() => {
                          let practiced = 0;
                          let total = 0;
                          
                          if (isGuestMode) {
                            // Guest: Use localStorage data, fallback to DB data (0 for first-time)
                            const guestStats = loadGuestStats();
                            if (guestStats && guestStats.totalAnswers > 0) {
                              practiced = guestStats.totalAnswers;
                              total = stats ? (stats.totalQuestions || 0) : 0;
                              
                              // Filter by license
                              if (selectedLicense === 'SPL') {
                                practiced = Math.round(practiced * 0.67);
                                total = Math.round(total * 0.67);
                              }
                              
                              const percentage = total > 0 ? Math.round((practiced / total) * 100) : 0;
                              return (
                                <>
                                  {practiced.toLocaleString()}
                                  {total > 0 && (
                                    <span className="text-sm sm:text-base md:text-lg opacity-60 ml-2">
                                      {percentage}%
                                    </span>
                                  )}
                                </>
                              );
                            } else {
                              // First-time guest: show 0
                              return 0;
                            }
                          } else {
                            // User: Use existing logic
                            practiced = stats ? (stats.practicedQuestions || 0) : 0;
                            total = stats ? (stats.totalQuestions || 0) : 0;
                            
                            // Filter by license
                            if (selectedLicense === 'SPL') {
                              practiced = Math.round(practiced * 0.67);
                              total = Math.round(total * 0.67);
                            }
                            
                            const percentage = total > 0 ? Math.round((practiced / total) * 100) : 0;
                            return (
                              <>
                                {practiced.toLocaleString()}
                                {total > 0 && (
                                  <span className="text-sm sm:text-base md:text-lg opacity-60 ml-2">
                                    {percentage}%
                                  </span>
                                )}
                              </>
                            );
                          }
                        })()}
                      </p>
                      <p className="text-[8px] sm:text-[10px] md:text-sm opacity-50">
                        {stats && stats.overallSuccess < 1 ? 'Dostupné' : ''}
                      </p>
                    </div>
                    {/* Aktuální licence */}
                    <div className="p-1 sm:p-2 md:p-6 border border-[var(--line)] rounded sm:rounded-lg md:rounded-2xl flex flex-col items-start lg:flex-row lg:items-center justify-between gap-1 lg:gap-2 h-full">
                       <p className="col-header text-[8px] sm:text-[10px] md:text-sm font-bold uppercase tracking-wider text-black dark:text-white/60 m-0 mb-0.5 lg:mb-0 leading-tight">
                         Licence
                       </p>
                       <div className="flex items-center">
                         <div className="relative group overflow-hidden rounded-lg bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 hover:border-indigo-500/50 transition-all px-2 py-0.5">
                           <select
                             value={selectedLicenseSubtype}
                             onChange={(e: any) => {
                               const v = e.target.value;
                               setSelectedLicenseSubtype(v);
                               localStorage.setItem('selectedLicenseSubtype', v);
                               // Update the broad category for global filtering/syllabus
                               if (v === 'ALL') {
                                 setSelectedLicense('BOTH');
                                 localStorage.setItem('selectedLicense', 'BOTH');
                               } else if (v === 'KL') {
                                 setSelectedLicense('KL');
                                 setSelectedSubcategory('ALL');
                                 localStorage.setItem('selectedLicense', 'KL');
                                 localStorage.setItem('selectedSubcategory', 'ALL');
                               } else if (v === 'MEDLANKY') {
                                 setSelectedLicense('KL');
                                 setSelectedSubcategory('Medlánky');
                                 localStorage.setItem('selectedLicense', 'KL');
                                 localStorage.setItem('selectedSubcategory', 'Medlánky');
                               } else {
                                 const broad = ['SPL', 'LAPL(S)', 'BPL', 'LAPL(B)'].includes(v) ? 'SPL' : 'PPL';
                                 setSelectedLicense(broad);
                                 localStorage.setItem('selectedLicense', broad);
                               }
                             }}
                             className="appearance-none bg-transparent border-none outline-none focus:ring-0 cursor-pointer text-black dark:text-white font-bold text-xs sm:text-sm md:text-base leading-tight pr-5 pl-1 py-0.5"
                           >
                             <option value="ALL">Všechny (All)</option>
                             <optgroup label="Letadla (A)" className="bg-white dark:bg-gray-900 text-black dark:text-white">
                               <option value="PPL(A)">PPL(A)</option>
                               <option value="LAPL(A)">LAPL(A)</option>
                             </optgroup>
                             <optgroup label="Vrtulníky (H)" className="bg-white dark:bg-gray-900 text-black dark:text-white">
                               <option value="PPL(H)">PPL(H)</option>
                               <option value="LAPL(H)">LAPL(H)</option>
                             </optgroup>
                             <optgroup label="Kluzáky (S)" className="bg-white dark:bg-gray-900 text-black dark:text-white">
                               <option value="SPL">SPL</option>
                               <option value="LAPL(S)">LAPL(S)</option>
                             </optgroup>
                             <optgroup label="Balóny (B)" className="bg-white dark:bg-gray-900 text-black dark:text-white">
                               <option value="BPL">BPL</option>
                               <option value="LAPL(B)">LAPL(B)</option>
                             </optgroup>
                             <optgroup label="Klubové" className="bg-white dark:bg-gray-900 text-black dark:text-white">
                               <option value="KL">SAK</option>
                               <option value="MEDLANKY">Medlánky</option>
                             </optgroup>
                           </select>
                           <div className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500">
                             <ChevronDown size={14} />
                           </div>
                         </div>
                       </div>
                    </div>
                  </div>

                  {/* Subject List */}
                  <section>
                    <div className="flex justify-between items-center mb-6">
                      <h2 className="font-bold text-2xl">Předměty EASA</h2>
                      <button
                        onClick={startMix}
                        className="flex items-center gap-2 bg-gray-600 dark:bg-gray-700 text-white px-8 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest hover:scale-105 transition-all shadow-lg"
                      >
                        <RotateCcw size={14} /> MIX
                      </button>
                    </div>
                    <div className="border-t border-[var(--line)]">
                      <div className="flex items-center py-3 px-4 border-b border-[var(--line)] opacity-40 uppercase text-[10px] sm:text-xs tracking-widest font-bold cursor-default">
                        <div className="hidden sm:flex justify-center w-8 flex-shrink-0"></div>
                        <div className="flex items-center flex-1">Předmět</div>
                        <div className="flex justify-end items-center gap-4 sm:gap-8">
                          <div className="w-24 sm:w-32 text-center text-[9px] sm:text-[10px]">UŽIV./EASA</div>
                          <div className="w-16 sm:w-20 text-right">Postup</div>
                          <div className="w-16 sm:w-20 text-right">Úspěšnost</div>
                        </div>
                        <div className="hidden sm:flex justify-end w-8 flex-shrink-0"></div>
                      </div>

                      {subjects.filter((s) => {
                        // Filter subjects based on selected license
                        if (selectedLicense === 'SPL') {
                          // SPL only includes subjects 1,2,3,4,5,9
                          return [1, 2, 3, 4, 5, 9].includes(s.id);
                        }
                        // PPL and KL include all subjects 1-9
                        return true;
                      }).map((s) => (
                        <div
                          key={s.id}
                          onClick={() => startDrill(s)}
                          className="group flex items-center py-3 px-4 border-b border-[var(--line)] hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                        >
                          <div className="hidden sm:flex justify-center w-8 flex-shrink-0">
                            <BookOpen size={16} className="opacity-40 group-hover:opacity-100" />
                          </div>

                          <div className="flex items-center min-w-0 flex-[3] sm:flex-1">
                            <span className="font-medium text-sm group-hover:text-gray-900 dark:group-hover:text-gray-100 truncate">{s.description}</span>
                            <span className="hidden sm:inline text-xs opacity-50 ml-2 truncate group-hover:opacity-100 group-hover:text-gray-700 dark:group-hover:text-gray-300">{s.name}</span>
                          </div>

                          <div className="flex justify-end items-center gap-1 sm:gap-8 flex-shrink-0">
                            <div className="w-12 sm:w-32 font-mono text-[10px] sm:text-xs flex justify-center">
                              {(() => {
                                // For KL/MEDLANKY, show single count (no user/ai split)
                                if (selectedLicenseSubtype === 'MEDLANKY') return <span className="opacity-60 group-hover:opacity-100 group-hover:text-gray-700 dark:group-hover:text-gray-300">{s.medlanky_count || 0}</span>;
                                if (selectedLicenseSubtype === 'KL') return <span className="opacity-60 group-hover:opacity-100 group-hover:text-gray-700 dark:group-hover:text-gray-300">{s.kl_count || 0}</span>;
                                
                                if ((s.ai_count || 0) > 0) {
                                  const userCount = selectedLicense === 'SPL' && [6, 7, 8].includes(s.id) ? 0 : (s.user_count || 0);
                                  const aiCount = selectedLicense === 'SPL' && [6, 7, 8].includes(s.id) ? 0 : (s.ai_count || 0);
                                  return <span className="opacity-60 group-hover:opacity-100 group-hover:text-gray-700 dark:group-hover:text-gray-300">{`${userCount}/${aiCount}`}</span>;
                                }
                                const totalCount = selectedLicense === 'SPL' && [6, 7, 8].includes(s.id) ? 0 : (s.question_count || 0);
                                return <span className="opacity-60 group-hover:opacity-100 group-hover:text-gray-700 dark:group-hover:text-gray-300">{totalCount}</span>;
                              })()}
                            </div>
                            <div className="w-12 sm:w-20 font-mono text-[10px] sm:text-xs flex justify-end opacity-60 group-hover:opacity-100 group-hover:text-gray-700 dark:group-hover:text-gray-300">
                              {(() => {
                                const subStat = stats?.subjectStats?.[s.id];
                                const answered = subStat?.totalAnswered ?? 0;
                                const total = getFilteredQuestionCount(s, drillSettings.sourceFilters);
                                if (answered > 0 && total > 0) {
                                  return `${answered}/${total}`;
                                }
                                return '-';
                              })()}
                            </div>
                            <div className="w-10 sm:w-20 font-mono text-[10px] sm:text-sm flex justify-end group-hover:text-gray-900 dark:group-hover:text-gray-100">
                              {(() => {
                                const subStat = stats?.subjectStats?.[s.id];
                                if (subStat && subStat.totalAnswered > 0) {
                                  return `${Math.round((subStat.correctAnswers / subStat.totalAnswered) * 100)}%`;
                                }
                                return '-';
                              })()}
                            </div>
                          </div>

                          <div className="hidden sm:flex justify-end w-8 flex-shrink-0">
                            <ChevronRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      ))}

                      {/* Special Row: Procvičit chyby */}
                      <div
                        onClick={startErrors}
                        className="flex items-center py-3 px-4 border border-[var(--line)] rounded-xl mt-4 bg-orange-500/5 hover:bg-orange-500/10 dark:hover:bg-orange-500/20 transition-colors cursor-pointer"
                      >
                        <div className="hidden sm:flex justify-center w-8 flex-shrink-0">
                          <AlertCircle size={16} className="text-orange-500 group-hover:text-white" />
                        </div>

                        <div className="font-bold flex items-center gap-2 min-w-0 flex-1">
                          Procvičit chyby
                          {isGuestMode && (
                            <span className="hidden sm:inline px-2 py-1 bg-blue-500/20 text-blue-400 text-[10px] rounded-full font-medium">
                              Přihlášení
                            </span>
                          )}
                        </div>

                        <div className="flex justify-end gap-4">
                          <div className="font-mono text-sm flex justify-center opacity-60">
                            {isGuestMode ? '-' : (stats?.practicedQuestions && stats.overallSuccess < 1 ? 'Dostupné' : '-')}
                          </div>
                          <div className="font-mono text-sm flex justify-center min-w-[3rem]">
                            {isGuestMode ? '0' : (stats ? Math.round((1 - stats.overallSuccess) * 100) : 0)}% chyb
                          </div>
                        </div>

                        <div className="hidden sm:flex justify-end w-8 flex-shrink-0">
                          <ChevronRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>

                      {/* Special Row: Označené otázky */}
                      <div
                        onClick={startFlagged}
                        className="flex items-center py-3 px-4 border border-[var(--line)] rounded-xl mt-2 bg-blue-500/5 hover:bg-blue-500/10 dark:hover:bg-blue-500/20 transition-colors cursor-pointer"
                      >
                        <div className="hidden sm:flex justify-center w-8 flex-shrink-0">
                          <Flag size={16} className="text-blue-500 group-hover:text-white" />
                        </div>

                        <div className="font-bold flex items-center gap-2 min-w-0 flex-1">
                          Označené otázky
                          {isGuestMode && (
                            <span className="hidden sm:inline px-2 py-1 bg-blue-500/20 text-blue-400 text-[10px] rounded-full font-medium">
                              Přihlášení
                            </span>
                          )}
                        </div>

                        <div className="flex justify-end gap-4">
                          <div className="font-mono text-sm flex justify-center opacity-60">
                            {isGuestMode ? '-' : (() => {
                              const flags = JSON.parse(localStorage.getItem('question_flags') || '{}');
                              const flaggedCount = Object.values(flags).filter((f: any) => {
                                if (typeof f === 'object' && f !== null) return !!f.isFlagged;
                                return !!f;
                              }).length;
                              return flaggedCount > 0 ? `${flaggedCount} ks` : '0 ks';
                            })()}
                          </div>
                          <div className="font-mono text-sm flex justify-center min-w-[3rem]">
                            {isGuestMode ? '0%' : (() => {
                              const flags = JSON.parse(localStorage.getItem('question_flags') || '{}');
                              const flaggedCount = Object.values(flags).filter((f: any) => {
                                if (typeof f === 'object' && f !== null) return !!f.isFlagged;
                                return !!f;
                              }).length;
                              return flaggedCount > 0 ? `${flaggedCount}` : '0';
                            })()}
                          </div>
                        </div>

                        <div className="hidden sm:flex justify-end w-8 flex-shrink-0">
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
                  className="max-w-4xl mx-auto space-y-12 pb-20"
                >
                  <div className="flex items-center gap-4">
                    <button onClick={() => setView('dashboard')} className="p-2 rounded-full hover:bg-[var(--line)]">
                      <ArrowLeft size={20} />
                    </button>
                    <h2 className="font-bold text-3xl">Nastavení</h2>
                  </div>

                  {/* 0. Support / Donate */}
                  <section className="space-y-6">
                    <div className="flex items-center gap-2 px-2">
                      <Heart size={20} className="text-red-500" />
                      <h3 className="font-bold uppercase tracking-widest text-sm">Podpořit projekt</h3>
                    </div>

                    <div className="p-6 sm:p-8 border border-blue-500/20 rounded-3xl space-y-6 bg-gradient-to-br from-blue-500/5 to-purple-500/5">
                      <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8">
                        <div className="shrink-0 bg-white p-1 rounded-2xl shadow-sm border border-black/5">
                          <img src={`${import.meta.env.BASE_URL}images/donate-qr-cropped.png`} alt="QR Platba" className="w-32 h-32 md:w-40 md:h-40 object-contain" />
                        </div>
                        <div className="space-y-4 flex-1 text-center md:text-left">
                          <h4 className="text-lg md:text-xl font-bold">Líbí se vám Aeropilot?</h4>
                          <p className="opacity-80 text-sm md:text-base leading-relaxed">
                            Pokud se vám aplikace líbí a pomáhá vám v přípravě na zkoušky, přispějte mi na letové hodiny. Každá podpora se počítá a pomáhá udržet projekt při životě!
                          </p>
                          <div className="flex flex-col gap-4">
                            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 md:gap-4 pt-2">
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText("5157306043/0800");
                                  setCopySuccess(true);
                                  setShowThankYou(true);
                                  setTimeout(() => setCopySuccess(false), 2000);
                                }}
                                className="flex items-center gap-2 bg-[var(--ink)] text-[var(--bg)] px-5 md:px-6 py-2.5 md:py-3 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-widest hover:scale-[1.02] transition-all shadow-lg"
                              >
                                {copySuccess ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                                {copySuccess ? 'Číslo účtu zkopírováno' : 'Zkopírovat číslo účtu'}
                              </button>
                            </div>

                            <AnimatePresence>
                              {showThankYou && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0, y: -10 }}
                                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                                  exit={{ opacity: 0, height: 0, y: -10 }}
                                  className="overflow-hidden"
                                >
                                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-800 dark:text-emerald-200 text-sm mt-2 text-center md:text-left">
                                    <p className="font-bold mb-1">Děkuji vám! — Kristian H.</p>
                                    <p className="opacity-80">
                                      Kontaktovat mě můžete na adrese{' '}
                                      <a
                                        href={`mailto:${['boorgxx', 'gmail.com'].join('@')}`}
                                        className="font-medium underline hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                                      >
                                        <span>{'boorgxx'}</span>
                                        <span>{'@'}</span>
                                        <span>{'gmail.com'}</span>
                                      </a>
                                    </p>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* 1. Uživatelská nastavení (Obecná) */}
                  <section className="space-y-6">
                    <div className="flex items-center gap-2 px-2">
                      <User size={20} className="opacity-50" />
                      <h3 className="font-bold uppercase tracking-widest text-sm">Obecná nastavení</h3>
                    </div>

                    <div className="p-8 border border-[var(--line)] rounded-3xl space-y-8 bg-white/5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                          <label className="col-header">Řazení otázek</label>
                          <select
                            value={drillSettings.sorting}
                            onChange={(e) => {
                              const newSorting = e.target.value as any;
                              setDrillSettings(prev => {
                                const newSettings = { ...prev, sorting: newSorting };
                                localStorage.setItem('drillSettings', JSON.stringify(newSettings));
                                return newSettings;
                              });
                              setAnswered(null);
                              setShowExplanation(false);
                              setCurrentQuestionIndex(0);
                            }}
                            className="w-full p-3 bg-transparent border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--ink)]"
                          >
                            <option value="default">Výchozí (ID)</option>
                            <option value="random">Náhodné</option>
                            <option value="hardest_first">Nejtěžší nejdříve</option>
                            <option value="least_practiced">Nejméně procvičované</option>
                            <option value="weighted_learning">Učící algoritmus 🧠</option>
                          </select>
                        </div>

                        <div className="space-y-3">
                          <label className="col-header">Zdroje otázek (Filtry)</label>
                          <div className="flex gap-3">
                            {[
                              { id: 'user', icon: User, label: 'Uživatel', title: 'Zobrazit jen otázky importované uživatelem' },
                              { id: 'ai', icon: Bot, label: 'AI / EASA', title: 'Zobrazit jen otázky které sestavila AI na základě LearningObjectives' },
                              { id: 'spacer', icon: () => <div className="w-10" />, label: '', title: '' },
                              { id: 'excludeAnswered', icon: CheckCircle2, label: 'Vynechat', title: 'Nezobrazovat otázky, které jste již správně zodpověděli' }
                            ].map((src) => {
                              if (src.id === 'spacer') return <div key="spacer" className="w-4 md:w-8" />;

                              let isActive: boolean;
                              let onClick: () => void;

                              if (src.id === 'excludeAnswered') {
                                isActive = drillSettings.excludeAnswered;
                                onClick = () => setDrillSettings(prev => ({ ...prev, excludeAnswered: !prev.excludeAnswered }));
                              } else {
                                isActive = drillSettings.sourceFilters.includes(src.id as any);
                                onClick = () => toggleSourceFilter(src.id as any);
                              }

                              return (
                                <button
                                  key={src.id}
                                  onClick={onClick}
                                  title={src.title}
                                  className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${isActive
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

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex items-center justify-between p-4 border border-[var(--line)] rounded-2xl">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-600">
                              <CheckCircle2 size={20} />
                            </div>
                            <div>
                              <p className="text-sm font-bold">Vyhodnocení</p>
                              <p className="text-[10px] opacity-50">Správná odpověď ihned</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setDrillSettings(prev => ({ ...prev, immediateFeedback: !prev.immediateFeedback }))}
                            className={`w-12 h-6 rounded-full transition-colors relative ${drillSettings.immediateFeedback ? 'bg-[var(--toggle-active)]' : 'bg-[var(--line)]'}`}
                          >
                            <div className={`absolute top-1 w-4 h-4 bg-[var(--toggle-thumb)] rounded-full transition-all ${drillSettings.immediateFeedback ? 'left-7' : 'left-1'}`} />
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-4 border border-[var(--line)] rounded-2xl">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-600">
                              <HelpCircle size={20} />
                            </div>
                            <div>
                              <p className="text-sm font-bold">Vysvětlení</p>
                              <p className="text-[10px] opacity-50">Možnost UI vysvětlivek</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setDrillSettings(prev => ({ ...prev, showExplanationOnDemand: !prev.showExplanationOnDemand }))}
                            className={`w-12 h-6 rounded-full transition-colors relative ${drillSettings.showExplanationOnDemand ? 'bg-[var(--toggle-active)]' : 'bg-[var(--line)]'}`}
                          >
                            <div className={`absolute top-1 w-4 h-4 bg-[var(--toggle-thumb)] rounded-full transition-all ${drillSettings.showExplanationOnDemand ? 'left-7' : 'left-1'}`} />
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-4 border border-[var(--line)] rounded-2xl">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600">
                              <RotateCcw size={20} />
                            </div>
                            <div>
                              <p className="text-sm font-bold">Míchat</p>
                              <p className="text-[10px] opacity-50">Pořadí odpovědí</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setDrillSettings(prev => ({ ...prev, shuffleAnswers: !prev.shuffleAnswers }))}
                            className={`w-12 h-6 rounded-full transition-colors relative ${drillSettings.shuffleAnswers ? 'bg-[var(--toggle-active)]' : 'bg-[var(--line)]'}`}
                          >
                            <div className={`absolute top-1 w-4 h-4 bg-[var(--toggle-thumb)] rounded-full transition-all ${drillSettings.shuffleAnswers ? 'left-7' : 'left-1'}`} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* 2. Učící Algoritmus */}
                  <section className="space-y-6">
                    <div className="flex items-center gap-2 px-2">
                      <Brain size={20} className="opacity-50" />
                      <h3 className="font-bold uppercase tracking-widest text-sm">Učící Algoritmus</h3>
                    </div>

                    <div className="p-8 border border-[var(--line)] rounded-3xl space-y-6 bg-white/5">
                      <div className="flex items-center justify-between p-4 border border-[var(--line)] rounded-2xl">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-600">
                            <Brain size={20} />
                          </div>
                          <div>
                            <p className="text-sm font-bold">Adaptivní učení</p>
                            <p className="text-[10px] opacity-50">Prioritizuje obtížné a dlouho nepraktikované otázky</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setDrillSettings(prev => ({
                            ...prev,
                            weightedLearning: {
                              ...prev.weightedLearning!,
                              enabled: !prev.weightedLearning?.enabled
                            }
                          }))}
                          className={`w-12 h-6 rounded-full transition-colors relative ${drillSettings.weightedLearning?.enabled ? 'bg-[var(--toggle-active)]' : 'bg-[var(--line)]'}`}
                        >
                          <div className={`absolute top-1 w-4 h-4 bg-[var(--toggle-thumb)] rounded-full transition-all ${drillSettings.weightedLearning?.enabled ? 'left-7' : 'left-1'}`} />
                        </button>
                      </div>

                      {drillSettings.weightedLearning?.enabled && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-[var(--line)]">
                          <div className="space-y-2">
                            <label className="text-xs font-bold opacity-50">Poloviční doba zapomnění (dny)</label>
                            <input
                              type="number"
                              min="1"
                              max="30"
                              value={drillSettings.weightedLearning.halflife_days}
                              placeholder="7"
                              onChange={(e) => setDrillSettings(prev => ({
                                ...prev,
                                weightedLearning: {
                                  ...prev.weightedLearning!,
                                  halflife_days: parseInt(e.target.value) || 7
                                }
                              }))}
                              className="w-full p-2 bg-transparent border border-[var(--line)] rounded-lg text-sm"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold opacity-50">Velikost historie míchání</label>
                            <input
                              type="number"
                              min="1"
                              max="50"
                              value={drillSettings.shuffleHistorySize || 10}
                              onChange={(e) => setDrillSettings(prev => ({
                                ...prev,
                                shuffleHistorySize: parseInt(e.target.value) || 10
                              }))}
                              className="w-full p-2 bg-transparent border border-[var(--line)] rounded-lg text-sm"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* 3. AI Konfigurace (Klíče) */}
                  <section className="space-y-6">
                    <div className="flex items-center gap-2 px-2">
                      <Cpu size={20} className="opacity-50" />
                      <h3 className="font-bold uppercase tracking-widest text-sm">Konfigurace AI (API Klíče)</h3>
                    </div>

                    <div className="p-8 border border-[var(--line)] rounded-3xl space-y-6 bg-white/5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="col-header">AI Provider</label>
                          <div className="flex gap-2 flex-wrap">
                            {(['gemini', 'claude', 'deepseek'] as const).map(p => (
                              <React.Fragment key={p}>
                                <ModelButton
                                  provider={p}
                                  active={aiProvider === p}
                                  onClick={() => {
                                    setAiProvider(p);
                                    const defaultModel = p === 'gemini' ? 'gemini-flash-latest' : p === 'claude' ? 'claude-sonnet-4-6' : 'deepseek-chat';
                                    setAiModel(defaultModel);
                                    saveSettingsImmediate({ aiProvider: p, aiModel: defaultModel });
                                  }}
                                />
                              </React.Fragment>
                            ))}
                          </div>
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
                                <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash (Doporučeno)</option>
                                <option value="gemini-1.5-flash">Gemini 1.5 Flash (Nejrychlejší)</option>
                                <option value="gemini-1.5-pro">Gemini 1.5 Pro (Pokročilý)</option>
                              </>
                            ) : aiProvider === 'claude' ? (
                              <>
                                <option value="claude-3-5-sonnet-20240620">Claude 3.5 Sonnet (Nejlepší)</option>
                                <option value="claude-3-haiku-20240307">Claude 3 Haiku (Nejrychlejší)</option>
                                <option value="claude-3-opus-20240229">Claude 3 Opus (Nejsilnější)</option>
                              </>
                            ) : (
                              <>
                                <option value="deepseek-chat">DeepSeek V3 (Doporučeno)</option>
                                <option value="deepseek-reasoner">DeepSeek R1 (Reasoning)</option>
                              </>
                            )}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="col-header">
                          {aiProvider === 'gemini' ? 'Gemini' : aiProvider === 'claude' ? 'Claude' : 'DeepSeek'} API Klíč
                        </label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <input
                              type="password"
                              value={aiProvider === 'gemini' ? userApiKey : aiProvider === 'claude' ? claudeApiKey : (deepseekApiKey || undefined)}
                              onChange={(e) => {
                                if (aiProvider === 'gemini') {
                                  setUserApiKey(e.target.value);
                                } else if (aiProvider === 'claude') {
                                  setClaudeApiKey(e.target.value);
                                } else {
                                  setDeepseekApiKey(e.target.value);
                                }
                                setKeyStatus('idle');
                              }}
                              placeholder={
                                aiProvider === 'deepseek' && !deepseekApiKey && getProxyParams().idToken
                                  ? 'Používá se testovací klíč (proxy)'
                                  : `Vložte váš ${aiProvider === 'gemini' ? 'Gemini' : aiProvider === 'claude' ? 'Claude' : 'DeepSeek'} API klíč...`
                              }
                              className={`w-full p-3 bg-transparent border rounded-xl focus:outline-none focus:border-[var(--ink)] pr-10 ${keyStatus === 'valid' ? 'border-emerald-500/50' : keyStatus === 'invalid' ? 'border-red-500/50' : 'border-[var(--line)]'
                                }`}
                            />
                            {keyStatus === 'valid' && <CheckCircle2 size={16} className="absolute right-3 top-3.5 text-emerald-500" />}
                            {keyStatus === 'invalid' && <XCircle size={16} className="absolute right-3 top-3.5 text-red-500" />}
                            {keyStatus === 'idle' && <HelpCircle size={16} className="absolute right-3 top-3.5 opacity-30 cursor-help" title={
                              aiProvider === 'deepseek' && !deepseekApiKey && getProxyParams().idToken
                                ? 'Ověří proxy připojení k Lambda funkci'
                                : 'Ověří platnost API klíče'
                            } />}
                          </div>
                          <button
                            onClick={handleVerifyKey}
                            disabled={isVerifyingKey || !(aiProvider === 'gemini' ? userApiKey : aiProvider === 'claude' ? claudeApiKey : (deepseekApiKey || getProxyParams().idToken))}
                            className="px-6 bg-[var(--ink)] text-[var(--ink-text)] rounded-xl text-[10px] font-bold uppercase tracking-widest hover:scale-105 transition-transform disabled:opacity-50"
                          >
                            {isVerifyingKey ? <RotateCcw size={14} className="animate-spin" /> : 'Ověřit'}
                          </button>
                        </div>
                        <p className="text-[10px] opacity-40">
                          {aiProvider === 'deepseek' && !deepseekApiKey && getProxyParams().idToken
                            ? 'Používá se sdílený klíč přes Lambda proxy. Ověřte připojení.'
                            : 'Klíč je uložen pouze lokálně ve vašem prohlížeči.'
                          }
                          {aiProvider === 'gemini'
                            ? ' Získejte klíč zdarma na ai.google.dev.'
                            : aiProvider === 'claude'
                              ? ' Získejte klíč na console.anthropic.com.'
                              : ' Získejte klíč na platform.deepseek.com.'}
                        </p>

                      </div>
                    </div>
                  </section>

                  {/* 3. AI Generátor — odkaz */}
                  <section className="space-y-6">
                    <div className="flex items-center gap-2 px-2">
                      <Sparkles size={20} className="opacity-50" />
                      <h3 className="font-bold uppercase tracking-widest text-sm">AI Generátor otázek</h3>
                    </div>
                    <button
                      onClick={() => setView('ai')}
                      className="w-full p-6 border border-indigo-500/30 bg-indigo-500/5 rounded-3xl text-left hover:bg-indigo-500/10 transition-colors group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="font-bold">Hromadný Generátor (Batch Fill)</p>
                          <p className="text-xs opacity-60">Licence · ECQB vzory · Batch size · Jazyk · Pokrytí LOs</p>
                        </div>
                        <ChevronRight size={20} className="text-indigo-500 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </button>
                  </section>

                  {/* 4. Správa dat */}
                  <section className="space-y-6 pt-6 border-t border-[var(--line)]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-600 shadow-sm shadow-red-500/10">
                        <Trash2 size={22} />
                      </div>
                      <h3 className="section-header">Správa dat & Resetování</h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <button
                        onClick={handleResetFlags}
                        className="flex items-center justify-between p-4 border border-red-500/20 hover:bg-red-500/[0.03] active:bg-red-500/10 rounded-2xl transition-all group relative overflow-hidden active:scale-95"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500">
                            <Flag size={18} />
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-bold text-red-600">Smazat vlaječky</p>
                            <p className="text-[10px] text-red-500/60 font-medium">Odstraní všechna označení</p>
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-red-500 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1" />
                        <div className="absolute inset-0 bg-red-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                      </button>

                      <button
                        onClick={async () => {
                          if (window.confirm('Opravdu chcete smazat historii všech pokusů? Toto smaže všechny vaše odpovědi a úspěšnost.')) {
                            const uid = user?.id || 'guest';

                            if (!isGuestMode && user?.id) {
                              await dynamoDBService.deleteAllUserProgress(String(user.id));
                            }

                            // Remove all answers
                            localStorage.removeItem(userKey('answers'));
                            localStorage.removeItem(`${uid}:user_stats`);
                            localStorage.removeItem(`${uid}:guest_stats`);

                            alert('Historie pokusů byla vymazána.');
                            window.location.reload();
                          }
                        }}
                        className="flex items-center justify-between p-4 border border-red-500/20 hover:bg-red-500/[0.03] active:bg-red-500/10 rounded-2xl transition-all group relative overflow-hidden active:scale-95"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400">
                            <RotateCcw size={18} />
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-bold text-red-600">Restartovat historii</p>
                            <p className="text-[10px] text-red-500/60 font-medium">Smaže úspěšnost u všech otázek</p>
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-red-500 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1" />
                        <div className="absolute inset-0 bg-red-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                      </button>
                    </div>
                  </section>

                  {/* 4. Vlastní import (JSON) */}
                  <section className="space-y-6">
                    <div
                      className="flex items-center gap-2 px-2 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => setIsImportSectionOpen(!isImportSectionOpen)}
                    >
                      <Upload size={20} className="opacity-50" />
                      <h3 className="font-bold uppercase tracking-widest text-sm">Vlastní import (JSON)</h3>
                      <ChevronRight
                        size={16}
                        className={`ml-auto transition-transform duration-200 ${isImportSectionOpen ? 'rotate-90' : ''}`}
                      />
                    </div>

                    {isImportSectionOpen && (
                      <div className="p-8 border border-[var(--line)] rounded-3xl space-y-6 bg-white/5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="col-header">Cílový předmět</label>
                            <select
                              value={importSubjectId || ''}
                              onChange={(e) => setImportSubjectId(Number(e.target.value))}
                              className="w-full p-3 bg-transparent border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--ink)]"
                            >
                              {subjects.filter((s) => {
                                // Filter subjects based on selected license
                                if (selectedLicense === 'SPL') {
                                  // SPL only includes subjects 1,2,3,4,5,9
                                  return [1, 2, 3, 4, 5, 9].includes(s.id);
                                }
                                // PPL and KL include all subjects 1-9
                                return true;
                              }).map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="col-header">JSON Data</label>
                            <div className="flex gap-2">
                              <button
                                onClick={() => fileInputRef.current?.click()}
                                className="flex-1 py-3 bg-[var(--ink)] text-[var(--bg)] rounded-xl text-[10px] font-bold uppercase tracking-widest hover:scale-[1.01] transition-transform flex items-center justify-center gap-2"
                              >
                                <FileJson size={14} />
                                Nahrát soubor
                              </button>
                              <button
                                onClick={handleDownloadCategories}
                                className="flex-1 py-3 bg-[var(--ink)] text-[var(--bg)] rounded-xl text-[10px] font-bold uppercase tracking-widest hover:scale-[1.01] transition-transform flex items-center justify-center gap-2"
                              >
                                <Download size={14} />
                                Stáhnout kategorie
                              </button>
                              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".json" className="hidden" />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <textarea
                            value={importJson}
                            onChange={(e) => setImportJson(e.target.value)}
                            placeholder='[{"id": 1, "question": "...", "answers": ["...", ...], "correct": 0}]'
                            className="w-full h-48 p-4 bg-transparent border border-[var(--line)] rounded-xl font-mono text-[10px] focus:outline-none focus:border-[var(--ink)] resize-y overflow-y-auto"
                          />
                        </div>

                        <div className="flex items-center gap-4">
                          {userRole === 'admin' && (
                            <>
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id="clearExisting"
                                  checked={clearExisting}
                                  onChange={(e) => {
                                    setClearExisting(e.target.checked);
                                    if (e.target.checked) setUpdateExisting(false);
                                  }}
                                  className="w-4 h-4 accent-[var(--ink)]"
                                />
                                <label htmlFor="clearExisting" className="text-xs font-medium opacity-70">
                                  Smazat stávající
                                </label>
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id="updateExisting"
                                  checked={updateExisting}
                                  onChange={(e) => {
                                    setUpdateExisting(e.target.checked);
                                    if (e.target.checked) setClearExisting(false);
                                  }}
                                  className="w-4 h-4 accent-[var(--ink)]"
                                  title="Pokud se najde shoda podle ID otázky, updatuje se text. Jinak se nahraje jako nová."
                                />
                                <label htmlFor="updateExisting" className="text-xs font-medium opacity-70" title="Pokud se najde shoda podle ID otázky, updatuje se text. Jinak se nahraje jako nová.">
                                  Update
                                </label>
                              </div>
                            </>
                          )}
                        </div>

                        {importStatus && (
                          <div className={`p-4 rounded-xl flex items-center gap-3 text-xs ${importStatus.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-600 border border-rose-500/20'}`}>
                            {importStatus.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                            {importStatus.message}
                          </div>
                        )}

                        {userRole === 'admin' && (
                          <button
                            onClick={handleImport}
                            className="w-full py-4 bg-[var(--ink)] text-[var(--bg)] rounded-2xl text-xs font-bold uppercase tracking-widest hover:scale-[1.01] transition-transform"
                          >
                            Importovat otázky
                          </button>
                        )}
                      </div>
                    )}
                  </section>

                  {/* Admin: Download Questions */}
                  {userRole === 'admin' && (
                    <section className="pt-12 border-t border-[var(--line)]">
                      <div className="p-6 border border-[var(--line)] rounded-3xl space-y-4 bg-white/5">
                        <h3 className="col-header">Admin: Správa databáze</h3>
                        <p className="text-xs opacity-60">
                          Stáhněte všechny uživatelské otázky z DynamoDB pro editaci a zálohu.
                        </p>

                        <button
                          onClick={handleDownloadQuestions}
                          className="w-full py-4 bg-blue-600 text-white rounded-2xl text-xs font-bold uppercase tracking-widest hover:scale-[1.01] transition-transform flex items-center justify-center gap-2"
                        >
                          <Download size={16} />
                          Stáhnout všechny otázky z DB
                        </button>

                        <p className="text-[10px] opacity-40 text-center">
                          Formát: JSON • Všechny předměty • Včetně metadat
                        </p>
                      </div>
                    </section>
                  )}

                  {/* Reset History */}
                  <section className="pt-12 border-t border-[var(--line)]">
                    <button
                      onClick={handleResetProgress}
                      className="w-full p-4 rounded-2xl border border-red-500/20 text-red-500 hover:bg-red-500/5 transition-all flex items-center justify-center gap-2 font-bold uppercase tracking-widest text-[10px]"
                    >
                      <RotateCcw size={14} />
                      Smazat veškerý postup a historii
                    </button>
                  </section>
                </motion.div>
              )}

              {view === 'drill' && selectedSubject && (
                <motion.div
                  key="drill"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  className="max-w-3xl mx-auto space-y-4 md:space-y-8"
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
                      <div className="flex flex-row justify-between items-center gap-2 w-full overflow-hidden">
                        <button onClick={() => setView('dashboard')} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-50 hover:opacity-100 shrink-0">
                          <ArrowLeft size={12} /> Zpět
                        </button>
                        <div className="text-center flex flex-col items-center min-w-0 shrink">
                          {selectedSubject.id < 0 && (
                            <span className="text-[8px] sm:text-[9px] px-2 py-0.5 bg-orange-500/10 text-orange-500 rounded-full border border-orange-500/20 mb-1 font-bold uppercase tracking-widest leading-none">
                              {subjects.find(s => s.id === questions[currentQuestionIndex]?.subject_id)?.name || 'Obecné'}
                            </span>
                          )}
                          <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1">
                            {selectedSubject.id === 0
                              ? `Mix- ${subjects.find(s => s.id === questions[currentQuestionIndex]?.subject_id)?.name || 'Neznámá kategorie'}`
                              : selectedSubject.name
                            }
                          </p>
                          <div className="flex items-center gap-2">
                            {/* Navigace vlevo */}
                            <div className="flex items-center gap-2">
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
                                className="font-mono text-xs sm:text-xs md:text-xs opacity-50 hover:opacity-100 hover:text-white transition-all cursor-pointer px-2 py-1 rounded hover:bg-[var(--line)] whitespace-nowrap"
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
                            </div>
                            {/* Filtry vpravo */}
                            <div className="flex items-center gap-2 ml-auto">
                              {[
                                { id: 'user', icon: User, label: 'Uživatel' },
                                { id: 'ai', icon: Bot, label: 'AI Generováno' },
                                { id: 'spacer', icon: () => <div className="w-4" />, label: '' },
                                { id: 'excludeAnswered', icon: CheckCircle2, label: 'Vynechat probrané' },
                                { id: 'showCorrectAnswerMode', icon: ListTodo, label: 'Správná odpověď (Čtecí mód)' }
                              ].map(src => {
                                if (src.id === 'spacer') return <div key="spacer" className="w-2" />;

                                let isActive: boolean;
                                let onClick: () => void;

                                if (src.id === 'excludeAnswered') {
                                  isActive = drillSettings.excludeAnswered;
                                  onClick = () => setDrillSettings(prev => ({ ...prev, excludeAnswered: !prev.excludeAnswered }));
                                } else if (src.id === 'showCorrectAnswerMode') {
                                  isActive = !!drillSettings.showCorrectAnswerMode;
                                  onClick = () => setDrillSettings(prev => ({ ...prev, showCorrectAnswerMode: !prev.showCorrectAnswerMode }));
                                } else {
                                  isActive = drillSettings.sourceFilters.includes(src.id as any);
                                  onClick = () => toggleSourceFilter(src.id as any);
                                }

                                return (
                                  <button
                                    key={src.id}
                                    onClick={onClick}
                                    title={src.label}
                                    className={`transition-all duration-300 flex items-center gap-1 relative ${isActive
                                      ? 'text-indigo-600 opacity-100'
                                      : 'text-[var(--ink)] opacity-40 hover:opacity-60'
                                      }`}
                                  >
                                    <src.icon size={16} strokeWidth={isActive ? 2.5 : 2} />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          {/* Filtry samostatně pod navigací - ODSTRANIT */}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {(userRole === 'admin' || userRole === 'auditor') && (
                            <div ref={auditMenuRef} className="hidden md:flex items-center relative">
                              <button
                                onClick={handleQuestionApprove}
                                className={`flex flex-row gap-2 items-center pl-3 pr-2 py-1.5 rounded-l-lg border-y border-l text-[10px] font-bold transition-all border-[var(--line)] ${questions[currentQuestionIndex].approved ? 'bg-green-500 text-white border-green-500' : 'opacity-60 hover:opacity-100 text-green-500'}`}
                                title={questions[currentQuestionIndex].approved ? "Zrušit schválení" : "Schválit otázku"}
                              >
                                <ShieldCheck size={12} />
                                {questions[currentQuestionIndex].approved ? 'Approved!' : 'Approve'}
                              </button>
                              <button
                                onClick={() => setAuditMenuOpen(v => !v)}
                                className={`flex items-center px-1.5 py-1.5 rounded-r-lg border text-[10px] font-bold transition-all border-[var(--line)] ${questions[currentQuestionIndex].approved ? 'bg-green-500 text-white border-green-500' : 'opacity-60 hover:opacity-100 text-green-500'}`}
                                title="Další akce"
                              >
                                <ChevronDown size={12} className={`transition-transform ${auditMenuOpen ? 'rotate-180' : ''}`} />
                              </button>
                              {auditMenuOpen && auditMenuRef.current && (() => {
                                const rect = auditMenuRef.current.getBoundingClientRect();
                                return (
                                  <div
                                    style={{ position: 'fixed', top: rect.bottom + 4, right: window.innerWidth - rect.right, zIndex: 9999 }}
                                    className="bg-[var(--bg)] border border-[var(--line)] rounded-xl shadow-xl overflow-hidden min-w-[130px]"
                                  >
                                    <button
                                      onClick={handleQuestionEdit}
                                      className="flex items-center gap-2 w-full px-3 py-2.5 text-[11px] font-bold hover:bg-[var(--line)] transition-colors text-left"
                                    >
                                      <Pencil size={12} />
                                      Edit CZ
                                    </button>
                                    <button
                                      onClick={() => { setAuditMenuOpen(false); handleQuestionDelete(); }}
                                      className="flex items-center gap-2 w-full px-3 py-2.5 text-[11px] font-bold hover:bg-rose-500 hover:text-white transition-colors text-rose-500 text-left"
                                    >
                                      <Trash2 size={12} />
                                      Delete
                                    </button>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                          <div className="hidden md:block">
                            <LanguageButton
                              question={questions[currentQuestionIndex]}
                              language={language}
                              mode="desktop"
                            />
                          </div>
                          <button
                            onClick={() => toggleFlag(questions[currentQuestionIndex].id, questions[currentQuestionIndex].is_flagged)}
                            className={`p-2 rounded-full transition-colors ${questions[currentQuestionIndex].is_flagged ? 'bg-orange-500 text-white' : 'hover:bg-[var(--line)]'}`}
                          >
                            <Flag size={18} />
                          </button>
                        </div>
                      </div>

                      {editingQuestion && (userRole === 'admin' || userRole === 'auditor') && (
                        <div className="border border-amber-500/30 rounded-2xl bg-amber-500/5 p-4 space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500 flex items-center gap-1.5">
                              <Pencil size={11} /> Editace CZ překladu
                            </span>
                            <button onClick={() => setEditingQuestion(null)} className="p-1 hover:bg-[var(--line)] rounded-full transition-colors opacity-60 hover:opacity-100">
                              <X size={14} />
                            </button>
                          </div>

                          <div className="space-y-2">
                            <div className="text-[9px] font-bold uppercase tracking-widest opacity-40">Otázka</div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="text-[11px] opacity-50 bg-[var(--line)]/30 rounded-lg p-2 leading-relaxed">{questions[currentQuestionIndex].text}</div>
                              <textarea
                                value={editingQuestion.text_cz}
                                onChange={e => setEditingQuestion(prev => prev ? { ...prev, text_cz: e.target.value } : prev)}
                                rows={3}
                                className="text-[11px] bg-[var(--bg)] border border-[var(--line)] rounded-lg p-2 resize-none focus:outline-none focus:border-amber-500/50 leading-relaxed"
                                placeholder="CZ překlad otázky..."
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="text-[9px] font-bold uppercase tracking-widest opacity-40">Odpovědi</div>
                            {(['A', 'B', 'C', 'D'] as const).map((label, idx) => (
                              <div key={label} className={`grid grid-cols-[18px_1fr_1fr] gap-2 items-center rounded-lg p-1.5 ${editingQuestion.correct_option === label ? 'bg-green-500/10' : ''}`}>
                                <input
                                  type="radio"
                                  name="correct_option_edit"
                                  checked={editingQuestion.correct_option === label}
                                  onChange={() => setEditingQuestion(prev => prev ? { ...prev, correct_option: label } : prev)}
                                  className="accent-green-500 w-3.5 h-3.5 cursor-pointer"
                                  title={`Označit ${label} jako správnou odpověď`}
                                />
                                <div className="text-[11px] opacity-50 bg-[var(--line)]/30 rounded-lg p-1.5 flex gap-1.5 items-start">
                                  <span className="font-bold opacity-60 shrink-0">{label}.</span>
                                  <span>{[questions[currentQuestionIndex].option_a, questions[currentQuestionIndex].option_b, questions[currentQuestionIndex].option_c, questions[currentQuestionIndex].option_d][idx]}</span>
                                </div>
                                <input
                                  type="text"
                                  value={editingQuestion.options_cz[idx]}
                                  onChange={e => {
                                    const newOpts = [...editingQuestion.options_cz] as [string, string, string, string];
                                    newOpts[idx] = e.target.value;
                                    setEditingQuestion(prev => prev ? { ...prev, options_cz: newOpts } : prev);
                                  }}
                                  className="text-[11px] bg-[var(--bg)] border border-[var(--line)] rounded-lg px-2 py-1.5 focus:outline-none focus:border-amber-500/50"
                                  placeholder={`CZ odpověď ${label}...`}
                                />
                              </div>
                            ))}
                          </div>

                          {questions[currentQuestionIndex].explanation && (
                            <div className="space-y-2">
                              <div className="text-[9px] font-bold uppercase tracking-widest opacity-40">Vysvětlení</div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="text-[11px] opacity-50 bg-[var(--line)]/30 rounded-lg p-2 leading-relaxed">{questions[currentQuestionIndex].explanation}</div>
                                <textarea
                                  value={editingQuestion.explanation_cz}
                                  onChange={e => setEditingQuestion(prev => prev ? { ...prev, explanation_cz: e.target.value } : prev)}
                                  rows={3}
                                  className="text-[11px] bg-[var(--bg)] border border-[var(--line)] rounded-lg p-2 resize-none focus:outline-none focus:border-amber-500/50 leading-relaxed"
                                  placeholder="CZ překlad vysvětlení..."
                                />
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={handleQuestionSave}
                              disabled={editSaving}
                              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-green-600 transition-colors disabled:opacity-50"
                            >
                              {editSaving ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />}
                              {editSaving ? 'Ukládám...' : 'Uložit'}
                            </button>
                            <button
                              onClick={() => setEditingQuestion(null)}
                              className="px-4 py-2 border border-[var(--line)] rounded-lg text-[10px] font-bold uppercase tracking-widest opacity-60 hover:opacity-100 transition-colors"
                            >
                              Zrušit
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="p-4 md:p-8 border border-[var(--line)] rounded-3xl space-y-6 md:space-y-8 bg-[var(--bg)]/50">
                        {questions[currentQuestionIndex].image && (
                          <div className="w-full p-4 rounded-xl border border-[var(--line)] flex items-center justify-center bg-white/5">
                            <img
                              src={`https://aeropilotexam.s3.eu-central-1.amazonaws.com/questions/${questions[currentQuestionIndex].image}`}
                              alt="Question illustration"
                              className="max-w-full max-h-full object-contain"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const parent = e.currentTarget.parentElement;
                                if (parent) parent.style.display = 'none';
                              }}
                            />
                          </div>
                        )}
                        <h3 className="text-lg md:text-xl font-medium leading-relaxed flex flex-col gap-2 md:gap-3">
                          <div className="flex items-start gap-2 md:gap-3">
                            {(() => {
                              const q = questions[currentQuestionIndex];
                              const answers = JSON.parse(localStorage.getItem(userKey('answers')) || '{}');
                              const isAlreadyCorrect = answers[String(q.questionId || q.id)]?.isCorrect;

                              return (
                                <div className="mt-1 flex-shrink-0 flex gap-2 rotate-0 items-center">
                                  <div
                                    onClick={() => setShowQuestionId(!showQuestionId)}
                                    className="cursor-pointer hover:opacity-80 transition-opacity"
                                    title="Klikněte pro zobrazení ID otázky"
                                  >
                                    {q.is_ai === 1 || q.source === 'ai' ? (
                                      <Bot size={18} className="text-indigo-600 opacity-60" title="AI Generovaná" />
                                    ) : (
                                      <User size={18} className="text-blue-600 opacity-60" title="Uživatelská" />
                                    )}
                                  </div>
                                  {isAlreadyCorrect && (
                                    <CheckCircle2 size={16} className="text-green-500" title="Již zodpovězeno správně" />
                                  )}
                                </div>
                              );
                            })()}
                            {showQuestionId && (
                              <div className="text-[10px] opacity-60 space-y-0.5">
                                <span
                                  className="font-mono cursor-pointer hover:opacity-80 underline underline-offset-2 block"
                                  onClick={() => {
                                    const q = questions[currentQuestionIndex];
                                    if (q.lo_id) {
                                      openSyllabusAtLO(q.lo_id);
                                    } else {
                                      alert('Otázka nemá přiřazeno žádné LO (Learning Objective)');
                                    }
                                  }}
                                  title="Klikněte pro otevření v osnovách"
                                >
                                  ID: {questions[currentQuestionIndex].questionId || questions[currentQuestionIndex].id}
                                </span>
                                {questions[currentQuestionIndex].editedBy && (
                                  <span className="flex items-center gap-1 text-amber-500 font-mono">
                                    <Pencil size={9} />
                                    {questions[currentQuestionIndex].editedBy!.slice(0, 8)} · {(() => {
                                      const d = new Date(questions[currentQuestionIndex].editedAt!);
                                      return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                                    })()}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex-1">
                            {/* console.log(`🎯 RENDER DEBUG: Rendering question at index ${currentQuestionIndex}, ID: ${questions[currentQuestionIndex]?.id}`) */}
                            <TranslatedText
                              question={questions[currentQuestionIndex]}
                              field="text"
                              language={language}
                              className=""
                            />
                          </div>
                        </h3>

                        <div className="grid gap-3">
                          {getAvailableOptions(questions[currentQuestionIndex]).map((opt, index) => {
                            // Use shuffle logic if shuffle is active
                            let isCorrect: boolean;
                            let answerText: string;

                            if (drillSettings.shuffleAnswers && shuffledQuestion) {
                              isCorrect = index === shuffledQuestion.displayCorrect;
                              answerText = shuffledQuestion.displayAnswers[index];
                            } else {
                              isCorrect = opt === questions[currentQuestionIndex].correct_option;
                              // Use original answer text based on option
                              const optionKey = `option_${opt.toLowerCase()}` as 'option_a' | 'option_b' | 'option_c' | 'option_d';
                              answerText = questions[currentQuestionIndex][optionKey];
                            }

                            const isSelected = answered === opt;

                            let bgClass = "border-[var(--line)] hover:border-[var(--ink)]";
                            if (drillSettings.showCorrectAnswerMode) {
                              if (isCorrect) bgClass = "bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-400 cursor-pointer";
                              else bgClass = "opacity-30 border-[var(--line)] cursor-default hover:border-[var(--line)]";
                            } else if (answered && drillSettings.immediateFeedback) {
                              if (isCorrect) bgClass = "bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-400";
                              else if (isSelected) bgClass = "bg-rose-500/20 border-rose-500 text-rose-700 dark:text-rose-400";
                              else bgClass = "opacity-40 border-[var(--line)]";
                            } else if (!answered && showExplanation && isCorrect) {
                              // Explanation shown without answering — highlight only correct, no wrong feedback
                              bgClass = "bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-400";
                            } else if (isSelected) {
                              bgClass = "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]";
                            }

                            return (
                              <button
                                key={opt}
                                disabled={
                                  (drillSettings.showCorrectAnswerMode && !isCorrect) ||
                                  (!!answered && drillSettings.immediateFeedback && !drillSettings.showCorrectAnswerMode && !isCorrect)
                                }
                                onClick={() => {
                                  if (drillSettings.showCorrectAnswerMode && isCorrect) {
                                    nextQuestion();
                                  } else if (answered && isCorrect) {
                                    // Běžný drill mód - druhé kliknutí na správnou odpověď posune dál
                                    nextQuestion();
                                  } else {
                                    handleAnswer(opt);
                                  }
                                }}
                                className={`p-3 md:p-4 rounded-xl border text-left transition-all flex items-center gap-3 md:gap-4 ${bgClass} text-sm md:text-base`}
                              >
                                <span className="w-6 h-6 md:w-8 md:h-8 flex-shrink-0 flex items-center justify-center rounded-lg border border-current font-mono text-[10px] md:text-xs">
                                  {opt}
                                </span>
                                <div className="flex-1">
                                  {drillSettings.shuffleAnswers && shuffledQuestion && shuffledQuestion.shuffleMap.length === getAvailableOptions(questions[currentQuestionIndex]).length ? (
                                    <TranslatedOption
                                      question={questions[currentQuestionIndex]}
                                      option={(getAvailableOptions(questions[currentQuestionIndex])[shuffledQuestion.shuffleMap[index]] as 'A' | 'B' | 'C' | 'D')}
                                      language={language}
                                      className="flex-1"
                                    />
                                  ) : (
                                    <TranslatedOption
                                      question={questions[currentQuestionIndex]}
                                      option={opt}
                                      language={language}
                                      className="flex-1"
                                    />
                                  )}
                                </div>
                                {(answered && drillSettings.immediateFeedback && isCorrect || !answered && showExplanation && isCorrect || drillSettings.showCorrectAnswerMode && isCorrect) && <CheckCircle2 size={20} className="text-emerald-500" />}
                                {answered && drillSettings.immediateFeedback && isSelected && !isCorrect && !drillSettings.showCorrectAnswerMode && <XCircle size={20} className="text-rose-500" />}
                              </button>
                            );
                          })}
                        </div>

                        {(answered || drillSettings.showExplanationOnDemand || selectedSubject.id === -2 || (drillSettings.showCorrectAnswerMode && showExplanation)) && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="pt-6 border-t border-[var(--line)] space-y-4"
                          >
                            <div className="flex flex-col gap-3">
                              {/* Top row: Explanation button + Next Question */}
                              <div className="flex flex-wrap justify-between items-center gap-2">
                                {(drillSettings.showExplanationOnDemand || selectedSubject.id === -2 || drillSettings.showCorrectAnswerMode) && (
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
                                      {isGeneratingAiExplanation ? 'Generuji...' : (showExplanation ? 'Skrýt' : 'Vysvětlení')}
                                    </span>
                                  </button>
                                )}
                                <div className="flex-1" />
                                {showExplanation && (
                                  <button
                                    onClick={nextQuestion}
                                    className="bg-[var(--ink)] text-[var(--bg)] px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-2"
                                  >
                                    Další otázka <ChevronRight size={14} />
                                  </button>
                                )}
                              </div>

                              {/* Model selector row - only visible when explanation shown */}
                              {showExplanation && aiExplanation && (
                                <div className="flex flex-wrap items-center gap-2">
                                  <select
                                    value={aiModel}
                                    onChange={(e) => {
                                      const selectedModel = e.target.value;
                                      const newProvider = selectedModel.startsWith('claude') ? 'claude' : selectedModel.startsWith('deepseek') ? 'deepseek' : 'gemini';
                                      if (newProvider !== aiProvider) setAiProvider(newProvider);
                                      setAiModel(selectedModel);
                                      localStorage.setItem('aiModel', selectedModel);
                                      localStorage.setItem('aiProvider', newProvider);
                                      // Save to DB immediately
                                      saveSettingsImmediate({ aiProvider: newProvider, aiModel: selectedModel });
                                      setAiExplanation(null);
                                      setAiExplanationQuestionId(null);
                                      setDetailedExplanation(null);
                                      handleFetchAiExplanation();
                                    }}
                                    className="text-xs px-2 py-1 bg-transparent border border-[var(--line)] rounded focus:outline-none focus:border-[var(--ink)]"
                                    disabled={isGeneratingAiExplanation}
                                  >
                                    <optgroup label="Google Gemini">
                                      <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash (Doporučeno)</option>
                                      <option value="gemini-1.5-flash">Gemini 1.5 Flash (Nejrychlejší)</option>
                                      <option value="gemini-1.5-pro">Gemini 1.5 Pro (Pokročilý)</option>
                                    </optgroup>
                                    <optgroup label="Anthropic Claude">
                                      <option value="claude-3-5-sonnet-20240620">Claude 3.5 Sonnet (Nejlepší)</option>
                                      <option value="claude-3-haiku-20240307">Claude 3 Haiku (Nejrychlejší)</option>
                                      <option value="claude-3-opus-20240229">Claude 3 Opus (Nejsilnější)</option>
                                    </optgroup>
                                    <optgroup label="DeepSeek">
                                      <option value="deepseek-chat">DeepSeek V3 (Doporučeno)</option>
                                      <option value="deepseek-reasoner">DeepSeek R1 (Reasoning)</option>
                                    </optgroup>
                                  </select>
                                  <button
                                    onClick={handleRegenerateExplanation}
                                    disabled={isRegeneratingExplanation || isGeneratingDetailedExplanation}
                                    className="flex items-center gap-1.5 text-xs text-orange-600 dark:text-orange-400 opacity-60 hover:opacity-80 transition-opacity"
                                    title="Vygenerovat nové vysvětlení"
                                  >
                                    {isRegeneratingExplanation ? <RotateCcw size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Regenerovat</span>
                                  </button>
                                </div>
                              )}
                            </div>

                            {showExplanation && drillSettings.showExplanationOnDemand && (
                              <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                                {/* Learning Objective Section */}
                                <div
                                  className="p-3 md:p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl space-y-2 cursor-pointer transition-all duration-300 hover:bg-indigo-500/10"
                                  onClick={() => {
                                    const q = questions[currentQuestionIndex];
                                    const lo = allLOs.find(l => l.id === (q.loId || q.lo_id));
                                    setExpandedLOContent({
                                      id: aiDetectedObjective || q.loId || q.lo_id || 'Importovaná otázka',
                                      text: lo?.text || 'Obecné znalosti letectví.',
                                      type: aiDetectedObjective
                                        ? 'AI detekovaný'
                                        : (q.source === 'ai' ? 'Generovaná AI'
                                          : (q.source === 'user' ? 'Uživatelská' : 'Oficiální EASA')),
                                      level: lo?.level
                                    });
                                    setIsExpandedLO(true);
                                  }}
                                >
                                  <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400">
                                    <div className="flex items-center gap-2">
                                      <GraduationCap size={14} />
                                      <span className="text-[10px] font-bold uppercase tracking-widest">
                                        Cíl učení (Learning Objective)
                                      </span>
                                      <div className="text-indigo-400 opacity-60">
                                        <ChevronRight size={14} />
                                      </div>
                                    </div>
                                    {(questions[currentQuestionIndex].lo_id || aiDetectedObjective) && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openSyllabusAtLO(aiDetectedObjective || questions[currentQuestionIndex].lo_id);
                                        }}
                                        className="flex items-center gap-1 px-2 py-0.5 rounded border border-indigo-500/30 text-[9px] font-bold uppercase tracking-widest hover:bg-indigo-500/10 transition-colors"
                                        title="Otevřít v osnově"
                                      >
                                        <BookOpen size={10} />
                                        Osnovy
                                      </button>
                                    )}
                                  </div>
                                  <div className="flex flex-col gap-3">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold mt-0.5 ${!questions[currentQuestionIndex].lo_id ? 'bg-orange-500/20 text-orange-600 border border-orange-500/30' : 'bg-indigo-600 text-white'}`}>
                                      {aiDetectedObjective || questions[currentQuestionIndex].loId || questions[currentQuestionIndex].lo_id || 'Importovaná otázka'}
                                    </span>
                                    <div className="flex-1">
                                      <p className="text-xs font-medium opacity-80">
                                        {allLOs.find(l => l.id === questions[currentQuestionIndex].lo_id)?.text || 'Obecné znalosti letectví.'}
                                      </p>
                                      {aiDetectedObjective && (
                                        <p className="text-xs font-medium opacity-60 italic mt-1">
                                          AI detekovaný cíl učení
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Standard Explanation */}
                                <div className="space-y-2">
                                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Základní vysvětlení</p>
                                  <TranslatedText
                                    question={questions[currentQuestionIndex]}
                                    field="explanation"
                                    language={language}
                                    className="text-sm md:text-base opacity-80 leading-relaxed font-medium"
                                    as="p"
                                  />
                                </div>

                                {/* AI Loading State — skeleton jen dokud nepřišel první chunk */}
                                {isGeneratingAiExplanation && !aiExplanation && (
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

                                {/* AI Detailed Note — zobrazuje se i během streamingu */}
                                {aiExplanation && aiExplanationQuestionId === questions[currentQuestionIndex]?.id && (
                                  <div className="space-y-4">
                                    <div className="p-6 bg-slate-900 text-slate-300 border border-slate-800 rounded-xl space-y-4 relative overflow-hidden font-mono">
                                      <div className="absolute top-0 right-0 p-4 opacity-5">
                                        <Binary size={64} />
                                      </div>
                                      <div className="flex items-center gap-2 text-indigo-400">
                                        <Terminal size={14} />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">AI_ENGINE_OUTPUT_LOG</span>
                                        {aiExplanationGeneratedBy && (
                                          <span className="flex items-center gap-1 opacity-70 ml-2" title={`Vygenerováno: ${aiExplanationGeneratedBy.model}`}>
                                            <ProviderIcon provider={aiExplanationGeneratedBy.provider} size={11} />
                                            <span className="text-[9px] font-bold" style={{ color: aiExplanationGeneratedBy.provider === 'gemini' ? '#4285F4' : aiExplanationGeneratedBy.provider === 'claude' ? '#cc785c' : '#4D6BFE' }}>
                                              {aiExplanationGeneratedBy.provider === 'gemini' ? 'Gemini' : aiExplanationGeneratedBy.provider === 'claude' ? 'Claude' : 'DeepSeek'}
                                            </span>
                                            <span className="text-[8px] opacity-50 font-mono">{aiExplanationGeneratedBy.model}</span>
                                          </span>
                                        )}
                                      </div>
                                      <div
                                        className="text-xs leading-relaxed opacity-90 max-w-none border-l border-indigo-500/30 pl-4 prose prose-sm prose-invert"
                                        dangerouslySetInnerHTML={{
                                          __html: sanitizeHtml(markdownToHtml(aiExplanation)) + (isGeneratingAiExplanation ? '<span class="inline-block animate-pulse ml-0.5">▌</span>' : '')
                                        }}
                                      />
                                    </div>

                                    {/* Detailed Explanation Button */}
                                    {!detailedExplanation && (
                                      <div className="flex items-center gap-4">
                                        <button
                                          onClick={handleFetchDetailedExplanation}
                                          disabled={isGeneratingDetailedExplanation || isRegeneratingExplanation}
                                          className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 hover:opacity-80 transition-opacity"
                                        >
                                          <div className="w-8 h-8 rounded-full bg-emerald-600/10 flex items-center justify-center">
                                            {isGeneratingDetailedExplanation ? <RotateCcw size={14} className="animate-spin" /> : <BookOpen size={14} />}
                                          </div>
                                          <span className="text-[10px] font-bold uppercase tracking-widest">Podrobněji (Lidské vysvětlení)</span>
                                        </button>
                                      </div>
                                    )}

                                    {/* Detailed Explanation Loading State */}
                                    {isGeneratingDetailedExplanation && !detailedExplanation && (
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
                                    {detailedExplanation && (
                                      <div className="p-6 bg-emerald-900/10 border border-emerald-600/20 rounded-xl space-y-4">
                                        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                                          <BookOpen size={14} />
                                          <span className="text-[10px] font-bold uppercase tracking-widest">Podrobné vysvětlení pro studenty</span>
                                        </div>
                                        <div
                                          className="text-sm leading-relaxed opacity-90 prose prose-sm max-w-none"
                                          dangerouslySetInnerHTML={{
                                            __html: sanitizeHtml(markdownToHtml(detailedExplanation)) + (isGeneratingDetailedExplanation ? '<span class="inline-block animate-pulse ml-0.5">▌</span>' : '')
                                          }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </motion.div>
                        )}
                      </div>

                      {/* Progress Banner */}
                      {selectedSubject && (
                        <div className="p-3 md:p-4 border border-[var(--line)] rounded-xl bg-gradient-to-r from-gray-500/5 to-blue-500/5 mt-auto">
                          <div className="space-y-4">
                            {(() => {
                              const filteredCorrect = getFilteredCorrectCount(selectedSubject.id, drillSettings.sourceFilters, questions);
                              const filteredAnswered = getFilteredAnsweredCount(selectedSubject.id, drillSettings.sourceFilters, questions);
                              const filteredTotal = getFilteredQuestionCount(selectedSubject, drillSettings.sourceFilters);

                              const successRate = filteredAnswered > 0 ? filteredCorrect / filteredAnswered : 0;
                              const completionRate = filteredTotal > 0 ? Math.min(1, filteredAnswered / filteredTotal) : 0;

                              return (
                                <div
                                  className={`cursor-pointer group transition-all duration-300 ${isProgressExpanded ? 'space-y-2' : ''}`}
                                  onClick={() => setIsProgressExpanded(prev => !prev)}
                                  title={isProgressExpanded ? "Klikněte pro sbalení postupu" : "Klikněte pro rozbalení postupu"}
                                >
                                  {isProgressExpanded && (
                                    <motion.div
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: 'auto' }}
                                      className="flex justify-between items-end mb-2"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold uppercase tracking-wider opacity-80 group-hover:text-blue-500 transition-colors">{selectedSubject.name}</span>
                                      </div>
                                      <div
                                        className="text-right leading-tight hover:opacity-80 transition-opacity"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setShowRawProgressStats(prev => !prev);
                                        }}
                                        title="Klikněte pro přepnutí zobrazení (procenta / čísla)"
                                      >
                                        {showRawProgressStats ? (
                                          <>
                                            <div className="font-mono font-bold text-emerald-500 dark:text-emerald-400">{filteredCorrect} ok / {filteredAnswered - filteredCorrect} fail</div>
                                            <div className="font-mono text-indigo-500 dark:text-indigo-400 opacity-70 text-[10px]">{filteredAnswered} / {filteredTotal} otázek</div>
                                          </>
                                        ) : (
                                          <>
                                            <div className="font-mono font-bold text-emerald-500 dark:text-emerald-400">{Math.round(successRate * 100)}% úspěšnost</div>
                                            <div className="font-mono text-indigo-500 dark:text-indigo-400 opacity-70 text-[10px]">{Math.round(completionRate * 100)}% hotovo</div>
                                          </>
                                        )}
                                      </div>
                                    </motion.div>
                                  )}

                                  <div className="space-y-1">
                                    {/* License-specific Progress for Mixed Questions */}
                                    {(selectedLicense === 'BOTH' || (selectedLicense === 'PPL' && (stats as any)?.spl?.total > 0) || (selectedLicense === 'SPL' && (stats as any)?.ppl?.total > 0)) && (
                                      <div className="mb-3 pb-3 border-b border-[var(--line)]/50">
                                        <LicenseProgress
                                          questions={questions}
                                          answers={JSON.parse(localStorage.getItem(userKey('answers')) || '{}')}
                                          subjectId={selectedSubject.id}
                                          showDetails={isProgressExpanded}
                                        />
                                        {/* Per-subject reset button */}
                                        <button
                                          onClick={() => handleResetSubjectProgress(selectedSubject.id, selectedSubject.name)}
                                          className="mt-2 text-[10px] text-red-500 hover:text-red-400 underline"
                                        >
                                          Resetovat postup pro tento předmět
                                        </button>
                                      </div>
                                    )}
                                    
                                    {/* Success Rate Bar */}
                                    <div className="h-2.5 bg-[var(--progress-bg)] rounded-sm overflow-hidden" title={`Úspěšnost: ${filteredCorrect} správně z ${filteredAnswered} zodpovězených`}>
                                      <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${successRate * 100}%` }}
                                        className={`h-full transition-colors duration-300 ${!isProgressExpanded ? 'bg-[var(--progress-fill)] opacity-60' : (successRate > 0.75 ? 'bg-emerald-500' : successRate > 0.5 ? 'bg-amber-500' : 'bg-rose-500')}`}
                                      />
                                    </div>
                                    {/* Completion Rate Bar */}
                                    <div className="h-1.5 bg-[var(--progress-bg)] rounded-sm overflow-hidden opacity-70" title={`Postup: ${filteredAnswered} zodpovězeno z ${filteredTotal} celkem`}>
                                      <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${completionRate * 100}%` }}
                                        className={`h-full transition-colors duration-300 ${!isProgressExpanded ? 'bg-[var(--progress-fill)] opacity-30' : 'bg-indigo-500'}`}
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      )}
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
                      <LanguageButton
                        question={questions[currentQuestionIndex]}
                        language={language}
                        mode="desktop"
                        className="hidden"
                        style={{ display: 'none' }}
                      />
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
                            <div className="w-full rounded-xl border border-[var(--line)] flex items-center justify-center bg-white/5 p-4">
                              <img
                                src={`https://aeropilotexam.s3.eu-central-1.amazonaws.com/questions/${questions[currentQuestionIndex].image}`}
                                alt="Question illustration"
                                className="max-w-full max-h-full object-contain"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  const parent = e.currentTarget.parentElement;
                                  if (parent) parent.style.display = 'none';
                                }}
                              />
                            </div>
                          )}
                          <div className="flex items-center gap-4 mb-2">
                            {[
                              { id: 'user', icon: User, label: 'Uživatel' },
                              { id: 'ai', icon: Bot, label: 'AI Engine / EASA' }
                            ].map(src => {
                              const isCurrentSource = getIsCurrentSource(src.id, questions[currentQuestionIndex]);
                              const isFilteringThis = drillSettings.sourceFilters.length === 1 && drillSettings.sourceFilters[0] === src.id;

                              return (
                                <button
                                  key={src.id}
                                  onClick={() => toggleSourceFilter(src.id as any)}
                                  className={`flex items-center gap-2 transition-all duration-300 ${isCurrentSource ? 'opacity-100' : 'opacity-20 hover:opacity-40'
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
                          <TranslatedText
                            question={questions[currentQuestionIndex]}
                            field="text"
                            language={language}
                            className="text-xl font-medium leading-relaxed"
                            as="h3"
                          />
                          <div className="grid gap-3">
                            {getAvailableOptions(questions[currentQuestionIndex]).map((opt, index) => {
                              const isSelected = answered === opt;

                              // Use shuffle logic if shuffle is active (but in exam mode, we don't shuffle for now)
                              // Exam mode keeps original order for consistency
                              let answerText: string;
                              if (drillSettings.shuffleAnswers && shuffledQuestion && view === 'drill') {
                                answerText = shuffledQuestion.displayAnswers[index];
                              } else {
                                const optionKey = `option_${opt.toLowerCase()}` as 'option_a' | 'option_b' | 'option_c' | 'option_d';
                                answerText = questions[currentQuestionIndex][optionKey];
                              }

                              return (
                                <button
                                  key={opt}
                                  onClick={() => handleAnswer(opt)}
                                  className={`p-4 rounded-xl border text-left transition-all flex items-center gap-4 ${isSelected ? 'bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]' : 'border-[var(--line)] hover:border-[var(--ink)]'}`}
                                >
                                  <span className="w-8 h-8 flex items-center justify-center rounded-lg border border-current font-mono text-xs">
                                    {opt}
                                  </span>
                                  <div className="flex-1">
                                    {drillSettings.shuffleAnswers && shuffledQuestion && view === 'drill' && shuffledQuestion.shuffleMap.length === getAvailableOptions(questions[currentQuestionIndex]).length ? (
                                      <TranslatedOption
                                        question={questions[currentQuestionIndex]}
                                        option={(getAvailableOptions(questions[currentQuestionIndex])[shuffledQuestion.shuffleMap[index]] as 'A' | 'B' | 'C' | 'D')}
                                        language={language}
                                        className="flex-1"
                                      />
                                    ) : (
                                      <TranslatedOption
                                        question={questions[currentQuestionIndex]}
                                        option={opt}
                                        language={language}
                                        className="flex-1"
                                      />
                                    )}
                                  </div>
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
                      {/* Step 1: Learning Objectives — collapsible */}
                      <section className="border border-[var(--line)] rounded-3xl overflow-hidden">
                        {/* Section header / toggle */}
                        <button
                          onClick={() => setIsLOSectionOpen(!isLOSectionOpen)}
                          className="w-full p-6 flex items-center justify-between hover:bg-[var(--line)]/30 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-[var(--ink)] text-[var(--bg)] rounded-lg flex items-center justify-center font-bold text-xs">1</div>
                            <div className="text-left">
                              <h3 className="text-xl font-bold">Learning Objectives</h3>
                              <p className="text-xs opacity-40">{allLOs.length} LOs {losLoading ? '(načítám...)' : '(načteno)'}</p>
                            </div>
                          </div>
                          <ChevronDown
                            size={20}
                            className={`transition-transform opacity-50 ${isLOSectionOpen ? 'rotate-180' : ''}`}
                          />
                        </button>

                        {isLOSectionOpen && (
                          <div className="p-8 pt-2 space-y-4 border-t border-[var(--line)]">

                            {/* Learning Objectives Controls - Collapsible Card */}
                            <div className="pt-4">
                              <div className="border border-[var(--line)] rounded-2xl overflow-hidden">
                                {/* Header */}
                                <button
                                  onClick={() => setLoControlsExpanded(!loControlsExpanded)}
                                  className="w-full p-4 border border-[var(--line)] rounded-2xl text-left transition-all opacity-60 hover:opacity-100"
                                  style={{
                                    backgroundColor: 'transparent',
                                    border: '1px solid var(--line)',
                                    padding: '16px',
                                    borderRadius: '16px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease-in-out',
                                    textAlign: 'left',
                                    width: '100%'
                                  }}
                                >
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="text-[10px] uppercase tracking-widest font-bold opacity-50 mb-1">Learning Objectives</p>
                                      <p className="text-sm font-bold">AI Generátor & Správa</p>
                                    </div>
                                    <ChevronRight
                                      size={20}
                                      className={`transition-transform ${loControlsExpanded ? 'rotate-90' : ''}`}
                                    />
                                  </div>
                                </button>

                                {/* Content */}
                                {loControlsExpanded && (
                                  <div className="p-4 space-y-4 border-t border-[var(--line)]">
                                    {/* Aircademy Syllabus Option */}
                                    <div
                                      className="p-4 border border-[var(--line)] rounded-2xl text-left transition-all opacity-60 hover:opacity-100"
                                      style={{
                                        backgroundColor: 'transparent',
                                        border: '1px solid var(--line)',
                                        padding: '16px',
                                        borderRadius: '16px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease-in-out',
                                        textAlign: 'left'
                                      }}
                                    >
                                      <div className="flex items-center gap-3">
                                        <input
                                          type="checkbox"
                                          id="useAircademy"
                                          checked={useAircademySyllabus}
                                          onChange={(e) => setUseAircademySyllabus(e.target.checked)}
                                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                        />
                                        <label htmlFor="useAircademy" className="flex-1 cursor-pointer">
                                          <div>
                                            <p className="text-[10px] uppercase tracking-widest font-bold opacity-50 mb-1">Zdroj dat</p>
                                            <p className="text-sm font-bold">Aircademy ECQB-PPL Syllabus</p>
                                          </div>
                                        </label>
                                      </div>
                                    </div>

                                    {/* Additional Document Links */}
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2">
                                        <label className="text-xs font-medium">Doplňující dokumenty:</label>
                                        <span className="text-xs opacity-50">(URL k prozkoumání)</span>
                                      </div>

                                      {/* Add new document link */}
                                      <div className="flex gap-2">
                                        <input
                                          type="url"
                                          value={newDocumentLink}
                                          onChange={(e) => setNewDocumentLink(e.target.value)}
                                          placeholder="https://example.com/document.pdf"
                                          className="flex-1 p-4 border border-[var(--line)] rounded-2xl text-left bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ink)]"
                                        />
                                        <button
                                          onClick={handleAddDocumentLink}
                                          disabled={!newDocumentLink.trim()}
                                          className="p-4 border border-[var(--line)] rounded-2xl text-left transition-all disabled:opacity-50 flex-1"
                                          style={{
                                            backgroundColor: !newDocumentLink.trim() ? 'transparent' : 'transparent',
                                            color: !newDocumentLink.trim() ? '#9ca3af' : 'inherit',
                                            border: '1px solid var(--line)',
                                            padding: '16px',
                                            borderRadius: '16px',
                                            cursor: !newDocumentLink.trim() ? 'not-allowed' : 'pointer',
                                            transition: 'all 0.2s ease-in-out',
                                            textAlign: 'left',
                                            opacity: !newDocumentLink.trim() ? 0.5 : 0.6
                                          }}
                                          onMouseEnter={(e) => {
                                            if (newDocumentLink.trim()) {
                                              e.currentTarget.style.opacity = '1';
                                            }
                                          }}
                                          onMouseLeave={(e) => {
                                            if (newDocumentLink.trim()) {
                                              e.currentTarget.style.opacity = '0.6';
                                            }
                                          }}
                                        >
                                          <p className="text-[10px] uppercase tracking-widest font-bold opacity-50 mb-1">Přidat dokument</p>
                                          <p className="text-sm font-bold">Nový zdroj dat</p>
                                        </button>
                                      </div>

                                      {/* Existing document links */}
                                      {additionalDocumentLinks.length > 0 && (
                                        <div className="space-y-2">
                                          {additionalDocumentLinks.map((link, index) => (
                                            <div
                                              key={index}
                                              className="p-4 border border-[var(--line)] rounded-2xl text-left transition-all opacity-60 hover:opacity-100"
                                              style={{
                                                backgroundColor: 'transparent',
                                                border: '1px solid var(--line)',
                                                padding: '16px',
                                                borderRadius: '16px',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s ease-in-out',
                                                textAlign: 'left'
                                              }}
                                            >
                                              <div className="flex items-center justify-between">
                                                <div className="flex-1 min-w-0">
                                                  <p className="text-[10px] uppercase tracking-widest font-bold opacity-50 mb-1">Dokument #{index + 1}</p>
                                                  <a
                                                    href={link}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-sm font-bold text-blue-600 hover:underline truncate block"
                                                  >
                                                    {link}
                                                  </a>
                                                </div>
                                                <button
                                                  onClick={() => handleRemoveDocumentLink(index)}
                                                  className="p-2 border border-red-500/30 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors ml-2"
                                                  title="Odstranit dokument"
                                                  style={{
                                                    backgroundColor: 'transparent',
                                                    color: '#ef4444',
                                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                                    padding: '8px',
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease-in-out'
                                                  }}
                                                  onMouseEnter={(e) => {
                                                    e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                                                  }}
                                                  onMouseLeave={(e) => {
                                                    e.currentTarget.style.backgroundColor = 'transparent';
                                                  }}
                                                >
                                                  <Trash2 size={14} />
                                                </button>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    {/* License Type Selection */}
                                    <div
                                      className="p-4 border border-[var(--line)] rounded-2xl text-left transition-all opacity-60 hover:opacity-100"
                                      style={{
                                        backgroundColor: 'transparent',
                                        border: '1px solid var(--line)',
                                        padding: '16px',
                                        borderRadius: '16px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease-in-out',
                                        textAlign: 'left'
                                      }}
                                    >
                                      <p className="text-[10px] uppercase tracking-widest font-bold opacity-50 mb-1">Typ licence</p>
                                      <select
                                        value={loLicenseType}
                                        onChange={(e) => setLoLicenseType(e.target.value as 'PPL(A)' | 'SPL' | 'BOTH')}
                                        className="w-full p-3 border border-[var(--line)] rounded-lg bg-white text-sm font-medium"
                                      >
                                        <option value="PPL(A)">PPL(A)</option>
                                        <option value="SPL">SPL</option>
                                        <option value="BOTH">OBĚ</option>
                                      </select>
                                    </div>

                                    {/* Generate Button */}
                                    <button
                                      disabled={true}
                                      className="w-full py-4 px-4 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white text-sm font-bold rounded-xl transition-colors"
                                      style={{
                                        backgroundColor: isGeneratingLOs || !importSubjectId ? '#9ca3af' : '#9333ea',
                                        color: '#ffffff',
                                        border: 'none',
                                        fontWeight: 'bold',
                                        fontSize: '14px',
                                        padding: '16px',
                                        borderRadius: '12px',
                                        cursor: isGeneratingLOs || !importSubjectId ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.2s ease-in-out'
                                      }}
                                      onMouseEnter={(e) => {
                                        if (!isGeneratingLOs && importSubjectId) {
                                          e.currentTarget.style.backgroundColor = '#7c3aed';
                                        }
                                      }}
                                      onMouseLeave={(e) => {
                                        if (!isGeneratingLOs && importSubjectId) {
                                          e.currentTarget.style.backgroundColor = '#9333ea';
                                        }
                                      }}
                                    >
                                      {isGeneratingLOs ? 'Analyzuji EASA zdroje...' : '⛔ LO Generování Zablokováno'}
                                    </button>

                                    {/* Generated LOs Results */}
                                    {generatedLOs.length > 0 && (
                                      <div
                                        className="p-4 border border-[var(--line)] rounded-2xl text-left transition-all opacity-60 hover:opacity-100"
                                        style={{
                                          backgroundColor: 'transparent',
                                          border: '1px solid var(--line)',
                                          padding: '16px',
                                          borderRadius: '16px',
                                          cursor: 'pointer',
                                          transition: 'all 0.2s ease-in-out',
                                          textAlign: 'left'
                                        }}
                                      >
                                        <p className="text-[10px] uppercase tracking-widest font-bold opacity-50 mb-1">Výsledky</p>
                                        <p className="text-sm font-bold">Nalezeno {generatedLOs.length} chybějících LOs</p>

                                        <div className="mt-3 max-h-32 overflow-y-auto space-y-2">
                                          {generatedLOs.slice(0, 5).map((lo, index) => (
                                            <div key={index} className="p-3 bg-white/5 border border-[var(--line)] rounded-lg">
                                              <p className="font-bold text-xs">{lo.id}</p>
                                              <p className="text-xs opacity-60 truncate">{lo.text}</p>
                                              <p className="text-xs opacity-40">Level: {lo.level} | Applies: {Array.isArray(lo.applies_to) ? lo.applies_to.join(', ') : lo.applies_to}</p>
                                            </div>
                                          ))}
                                          {generatedLOs.length > 5 && (
                                            <p className="text-xs text-center opacity-60">...a {generatedLOs.length - 5} dalších</p>
                                          )}
                                        </div>

                                        <div className="flex gap-2 mt-3">
                                          <button
                                            onClick={handleSaveGeneratedLOs}
                                            className="flex-1 py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded transition-colors"
                                            style={{
                                              backgroundColor: '#9333ea',
                                              color: '#ffffff',
                                              border: 'none',
                                              fontWeight: 'bold',
                                              fontSize: '12px',
                                              padding: '8px 16px',
                                              borderRadius: '8px',
                                              cursor: 'pointer',
                                              transition: 'all 0.2s ease-in-out'
                                            }}
                                            onMouseEnter={(e) => {
                                              e.currentTarget.style.backgroundColor = '#7c3aed';
                                            }}
                                            onMouseLeave={(e) => {
                                              e.currentTarget.style.backgroundColor = '#9333ea';
                                            }}
                                          >
                                            Uložit všechny LOs
                                          </button>
                                          <button
                                            onClick={() => setGeneratedLOs([])}
                                            className="py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold rounded transition-colors"
                                            style={{
                                              backgroundColor: '#e5e7eb',
                                              color: '#374151',
                                              border: 'none',
                                              fontWeight: 'bold',
                                              fontSize: '12px',
                                              padding: '8px 16px',
                                              borderRadius: '8px',
                                              cursor: 'pointer',
                                              transition: 'all 0.2s ease-in-out'
                                            }}
                                            onMouseEnter={(e) => {
                                              e.currentTarget.style.backgroundColor = '#d1d5db';
                                            }}
                                            onMouseLeave={(e) => {
                                              e.currentTarget.style.backgroundColor = '#e5e7eb';
                                            }}
                                          >
                                            Zavřít
                                          </button>
                                        </div>
                                      </div>
                                    )}

                                    {/* Aircademy Syllabus — manual PDF loader */}
                                    <AircademySyllabus
                                      subjectId={importSubjectId || undefined}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </section>

                      {/* Step 2: Few-Shot Patterns */}
                      <section className="p-8 border border-[var(--line)] rounded-3xl space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-[var(--ink)] text-[var(--bg)] rounded-lg flex items-center justify-center font-bold text-xs">2</div>
                            <h3 className="text-xl font-bold">Vzory ECQB (Few-Shot)</h3>
                          </div>
                          <button
                            onClick={() => setIsEcqbPatternsOpen(!isEcqbPatternsOpen)}
                            className="p-2 rounded-full hover:bg-[var(--line)] transition-colors"
                          >
                            <ChevronDown
                              size={20}
                              className={`transition-transform ${isEcqbPatternsOpen ? 'rotate-180' : ''}`}
                            />
                          </button>
                        </div>

                        {isEcqbPatternsOpen && (
                          <>
                            <p className="text-sm opacity-60">
                              AI používá ECQB Sample Annexes jako vzory pro generování otázek ve správném formátu (4 možnosti, jedna správná).
                            </p>
                            <div className="flex gap-2 flex-wrap">
                              <button
                                onClick={() => setSelectedLicense('PPL')}
                                className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all cursor-pointer ${selectedLicense === 'PPL'
                                  ? 'bg-indigo-600 text-white border border-indigo-600'
                                  : 'border border-[var(--line)] opacity-40 hover:opacity-60'
                                  }`}
                              >
                                PPL(A) Pattern
                              </button>
                              <button
                                onClick={() => setSelectedLicense('SPL')}
                                className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all cursor-pointer ${selectedLicense === 'SPL'
                                  ? 'bg-indigo-600 text-white border border-indigo-600'
                                  : 'border border-[var(--line)] opacity-40 hover:opacity-60'
                                  }`}
                              >
                                SPL Pattern
                              </button>
                              <span className="px-3 py-1 border border-[var(--line)] rounded-full text-[10px] font-bold opacity-50">Multiple Choice 4-way</span>
                            </div>
                          </>
                        )}
                      </section>

                      {/* Step 3: Generation Interface */}
                      <section className="p-8 border border-indigo-600/30 bg-indigo-600/5 rounded-3xl space-y-6">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center font-bold text-xs">3</div>
                          <h3 className="text-xl font-bold">Hromadný Generátor (Batch Fill)</h3>
                        </div>

                        <div className="space-y-6">
                          <div className="space-y-2">
                            <label className="col-header">Licence (Selected License)</label>
                            <div className="flex gap-3">
                              {(['PPL', 'SPL'] as const).map(lic => (
                                <button
                                  key={lic}
                                  onClick={() => { setSelectedLicense(lic); localStorage.setItem('selectedLicense', lic); }}
                                  className={`flex-1 py-3 rounded-xl border text-xs font-bold uppercase tracking-widest transition-all ${selectedLicense === lic ? 'bg-gray-600 dark:bg-gray-700 text-white border-gray-600 dark:border-gray-700' : 'border-gray-400 dark:border-gray-600 text-gray-600 dark:text-gray-400 opacity-60 hover:opacity-100'}`}
                                >
                                  {lic === 'PPL' ? 'PPL(A) — Motorový letoun' : 'SPL — Kluzák'}
                                </button>
                              ))}
                            </div>
                            <p className="text-[10px] opacity-50 leading-relaxed">
                              {selectedLicense === 'PPL'
                                ? 'AI prioritizuje: pístové motory, radionavigaci (VOR/DME/ILS), hmotnost & vyvážení s palivem.'
                                : 'AI prioritizuje: aerodynamiku kluzáků, meteorologii termiky, vzlety navijákem/vlekem, klouzavý výkon.'}
                            </p>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <label className="col-header">Cílový předmět (Syllabus Scope)</label>
                              <select
                                value={importSubjectId || ''}
                                onChange={(e) => setImportSubjectId(Number(e.target.value))}
                                className="w-full p-3 bg-transparent border border-[var(--line)] rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-600"
                              >
                                {subjects.filter((s) => {
                                  // Filter subjects based on selected license
                                  if (selectedLicense === 'SPL') {
                                    // SPL only includes subjects 1,2,3,4,5,9
                                    return [1, 2, 3, 4, 5, 9].includes(s.id);
                                  }
                                  // PPL includes all subjects
                                  return true;
                                }).map(s => (
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
                                    onClick={() => language.setGenerateLanguage(lang as 'EN' | 'CZ')}
                                    className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all ${language.generateLanguage === lang ? 'bg-indigo-600 text-white border-indigo-600' : 'border-[var(--line)] opacity-60 hover:opacity-100'}`}
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

                            <div className="p-3 bg-[var(--ink)]/10 rounded-xl border border-[var(--ink)]/20">
                              <p className="text-sm font-bold text-center">
                                V databázi: {subjects.find(s => s.id === importSubjectId)?.question_count || 0} otázek
                              </p>
                            </div>

                            <div className="flex justify-between gap-4">
                              <div className="space-y-1">
                                <p className="text-[10px] opacity-50">Learning Objectives</p>
                                <p className="text-lg font-bold">{allLOs.filter(lo => lo.subject_id === importSubjectId).length}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[10px] opacity-50">Pokryto v DB</p>
                                <p className="text-lg font-bold text-emerald-600">{actualCoveredLOs}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[10px] opacity-50">Zbývá doplnit</p>
                                <p className="text-lg font-bold text-amber-600">{Math.max(0, allLOs.filter(lo => lo.subject_id === importSubjectId).length - actualCoveredLOs)}</p>
                              </div>
                            </div>

                            <div className="space-y-1 pt-2">
                              <div className="flex justify-between text-[10px] font-bold">
                                <span>Celková naplněnost předmětu</span>
                                <span>{allLOs.filter(lo => lo.subject_id === importSubjectId).length > 0 ? Math.round((actualCoveredLOs / allLOs.filter(lo => lo.subject_id === importSubjectId).length) * 100) : 0}%</span>
                              </div>
                              <div className="h-1.5 bg-[var(--line)] rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500 transition-all duration-1000"
                                  style={{ width: `${allLOs.filter(lo => lo.subject_id === importSubjectId).length > 0 ? (actualCoveredLOs / allLOs.filter(lo => lo.subject_id === importSubjectId).length) * 100 : 0}%` }}
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

                          <div className="pt-2">
                            <button
                              onClick={handleCheckDuplicates}
                              disabled={isCheckingDuplicates || !importSubjectId}
                              className="w-full py-2 px-4 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 text-white text-sm font-bold rounded-xl transition-colors"
                              style={{
                                backgroundColor: isCheckingDuplicates || !importSubjectId ? '#9ca3af' : '#d97706',
                                color: '#ffffff',
                                border: 'none',
                                fontWeight: 'bold',
                                fontSize: '14px',
                                padding: '8px 16px',
                                borderRadius: '12px',
                                cursor: isCheckingDuplicates || !importSubjectId ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s ease-in-out'
                              }}
                              onMouseEnter={(e) => {
                                if (!isCheckingDuplicates && importSubjectId) {
                                  e.currentTarget.style.backgroundColor = '#b45309';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!isCheckingDuplicates && importSubjectId) {
                                  e.currentTarget.style.backgroundColor = '#d97706';
                                }
                              }}
                            >
                              {isCheckingDuplicates ? 'Kontroluji duplicity...' : '🔍 Kontrola duplicit v DB'}
                            </button>
                          </div>

                          {duplicateReport && (
                            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
                              <h5 className="font-bold text-sm text-amber-800">🔍 Výsledek kontroly duplicit</h5>

                              <div className="grid grid-cols-2 gap-4 text-xs">
                                <div>
                                  <p className="font-semibold text-amber-700">Celkem otázek:</p>
                                  <p className="text-lg font-bold">{duplicateReport.totalQuestions}</p>
                                </div>
                                <div>
                                  <p className="font-semibold text-amber-700">Unikátní LOs:</p>
                                  <p className="text-lg font-bold">{duplicateReport.uniqueQuestions}</p>
                                </div>
                                <div>
                                  <p className="font-semibold text-red-600">Duplicitní otázky:</p>
                                  <p className="text-lg font-bold text-red-600">{duplicateReport.duplicates}</p>
                                </div>
                                <div>
                                  <p className="font-semibold text-amber-700">LOs s duplicitami:</p>
                                  <p className="text-lg font-bold">{duplicateReport.duplicateGroups.length}</p>
                                </div>
                              </div>

                              {duplicateReport.duplicateGroups.length > 0 && (
                                <div className="space-y-2">
                                  <p className="font-semibold text-xs text-amber-700">LOs s nejvíce duplicitami:</p>
                                  {duplicateReport.duplicateGroups.slice(0, 3).map((group, index) => (
                                    <div key={group.loId} className="text-xs p-2 bg-white rounded border border-amber-200">
                                      <p className="font-bold">{group.loId}: {group.questionCount} otázek</p>
                                      <p className="text-gray-600 truncate">{group.questions[0]?.text.substring(0, 50)}...</p>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {duplicateReport.questionsWithoutLo.length > 0 && (
                                <div>
                                  <p className="font-semibold text-xs text-amber-700">Otázky bez LO:</p>
                                  <p className="text-xs">{duplicateReport.questionsWithoutLo.length}</p>
                                </div>
                              )}
                            </div>
                          )}

                          <button
                            onClick={() => {
                              handleGenerateQuestions();
                            }}
                            disabled={isGeneratingDetailedExplanation}
                            className="w-full py-4 bg-indigo-600 text-white rounded-full text-xs font-bold uppercase tracking-widest hover:scale-[1.01] transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
                            style={{
                              backgroundColor: isGeneratingDetailedExplanation ? '#9ca3af' : '#4f46e5',
                              color: '#ffffff',
                              border: 'none',
                              fontWeight: 'bold',
                              fontSize: '12px',
                              padding: '16px',
                              borderRadius: '9999px',
                              cursor: isGeneratingDetailedExplanation ? 'not-allowed' : 'pointer',
                              transition: 'all 0.2s ease-in-out',
                              textTransform: 'uppercase',
                              letterSpacing: '0.1em',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px'
                            }}
                            onMouseEnter={(e) => {
                              if (!isGeneratingDetailedExplanation) {
                                e.currentTarget.style.transform = 'scale(1.01)';
                                e.currentTarget.style.backgroundColor = '#4338ca';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isGeneratingDetailedExplanation) {
                                e.currentTarget.style.transform = 'scale(1)';
                                e.currentTarget.style.backgroundColor = '#4f46e5';
                              }
                            }}
                          >
                            {isGeneratingDetailedExplanation ? <RotateCcw size={16} className="animate-spin" /> : <Sparkles size={16} />}
                            {isGeneratingDetailedExplanation ? 'Generuji hromadně...' : `Spustit generování (${batchSize} témat)`}
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
                                disabled={userRole === 'guest'}
                                className="px-6 py-2 bg-emerald-600 text-white rounded-full text-[10px] font-bold uppercase tracking-widest hover:scale-105 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
                                title={userRole === 'guest' ? 'Přihlaste se pro uložení' : undefined}
                              >
                                Uložit vše do databáze
                              </button>
                            </div>
                            {importStatus && (
                              <div className={`p-3 rounded-xl flex items-center gap-2 text-xs ${importStatus.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-600 border border-rose-500/20'}`}>
                                {importStatus.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                                {importStatus.message}
                              </div>
                            )}

                            <div className="space-y-8">
                              {batchResults.map((result, i) => (
                                <div key={i} className="space-y-3">
                                  <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 bg-indigo-600 text-white rounded text-[10px] font-bold">{result.loId}</span>
                                    <span className="text-xs font-bold opacity-70">{allLOs.find(l => l.id === result.loId)?.text}</span>
                                  </div>
                                  <div className="grid grid-cols-1 gap-3 pl-4 border-l-2 border-indigo-600/20">
                                    {result.questions.map((q, j) => (
                                      <div key={j} className="p-4 border border-[var(--line)] rounded-2xl space-y-3 bg-white/5">
                                        <p className="text-sm font-bold">{q.text}</p>
                                        <div className="grid grid-cols-2 gap-2">
                                          {getAvailableOptions(q as Question).map(opt => {
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
                      {/* Capacity analysis */}
                      <div className="p-6 border border-[var(--line)] rounded-2xl space-y-4">
                        <h4 className="col-header">Analýza kapacity</h4>
                        {(() => {
                          // Calculate overall progress across ALL subjects
                          const dynamicScope = getDynamicSyllabusScope(allLOs);
                          const totalSubjects = Object.keys(dynamicScope).length;
                          const totalLOs = Object.values(dynamicScope).reduce((sum, count) => sum + count, 0);
                          const overallPct = totalLOs > 0 ? Math.round((globalCoveredLOs.size / totalLOs) * 100) : 0;

                          // Calculate per-subject analysis
                          const subjectAnalyses = Object.keys(dynamicScope).map(subjectId => {
                            const id = parseInt(subjectId);
                            return {
                              subjectId: id,
                              subjectName: SUBJECT_NAMES[id] || `Předmět ${id}`,
                              ...getSubjectAnalysis(allLOs, id, globalCoveredLOs)
                            };
                          });

                          const completedSubjects = subjectAnalyses.filter(sa => sa.percentage >= 80).length;

                          return (
                            <div className="space-y-4">
                              <div className="space-y-1">
                                <div className="flex justify-between text-[10px] font-bold">
                                  <span>Celkové pokrytí (všechny předměty)</span>
                                  <span>{overallPct}%</span>
                                </div>
                                <div className="h-2 bg-[var(--line)] rounded-full overflow-hidden">
                                  <div className="h-full bg-indigo-600 transition-all duration-500" style={{ width: `${overallPct}%` }} />
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4 text-[10px">
                                <div className="space-y-1">
                                  <div className="font-bold opacity-70">Přehled</div>
                                  <div className="space-y-0.5">
                                    <div>Předmětů: {totalSubjects}</div>
                                    <div>Celkem LOs: {totalLOs}</div>
                                    <div>Pokryto LOs: {globalCoveredLOs.size}</div>
                                    <div>Dokončeno: {completedSubjects}/{totalSubjects} předmětů</div>
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <div className="font-bold opacity-70">Stav</div>
                                  <div className={`font-bold ${overallPct >= 80 ? 'text-green-600' : overallPct >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                                    {overallPct >= 80 ? '✅ Dobré pokrytí' : overallPct >= 50 ? '⚠️ Částečné pokrytí' : '❌ Nízké pokrytí'}
                                  </div>
                                  <div className="opacity-70">
                                    {totalLOs - globalCoveredLOs.size} chybějících LOs
                                  </div>
                                </div>
                              </div>

                              {/* Subject breakdown */}
                              <div className="space-y-2">
                                <div className="font-bold text-[10px] opacity-70">Detail podle předmětů</div>
                                <div className="grid grid-cols-3 gap-2">
                                  {subjectAnalyses.map(sa => (
                                    <div key={sa.subjectId} className="p-2 border border-[var(--line)] rounded-lg space-y-1">
                                      <div className="font-bold text-[9px] truncate">{sa.subjectName}</div>
                                      <div className="flex justify-between items-center">
                                        <span className="text-[8px] opacity-70">{sa.covered}/{sa.total}</span>
                                        <span className={`text-[8px] font-bold ${sa.percentage >= 80 ? 'text-green-600' : sa.percentage >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                                          {sa.percentage}%
                                        </span>
                                      </div>
                                      <div className="h-1 bg-[var(--line)] rounded-full overflow-hidden">
                                        <div
                                          className={`h-full transition-all duration-500 ${sa.percentage >= 80 ? 'bg-green-600' :
                                            sa.percentage >= 50 ? 'bg-yellow-600' : 'bg-red-600'
                                            }`}
                                          style={{ width: `${sa.percentage}%` }}
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <p className="text-[10px] opacity-50 leading-relaxed">
                                Aktuálně máte pokryto {globalCoveredLOs.size} z {totalLOs} LOs napříč všemi {totalSubjects} předměty.
                                {completedSubjects > 0 && ` ${completedSubjects} předmětů má dobré pokrytí (80%+).`}
                                Hromadný generátor vám pomůže rychle doplnit chybějící oblasti.
                              </p>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Dynamic Info Panel — Syllabus breadcrumb */}
                      <div className="p-6 border border-indigo-500/30 bg-indigo-500/5 rounded-2xl space-y-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${selectedLicense === 'PPL' ? 'bg-indigo-500' : 'bg-emerald-500'}`} />
                          <h4 className="text-xs font-bold uppercase tracking-widest">Info Panel — {selectedLicense === 'PPL' ? 'PPL(A)' : 'SPL'} Syllabus</h4>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[9px] uppercase tracking-widest opacity-40 font-bold">Cesta v sylabu</p>
                          <p className="text-[10px] font-mono opacity-70">
                            {subjects.find(s => s.id === importSubjectId)?.name || 'Vyberte předmět'}
                            {' > '}
                            <span className={selectedLicense === 'PPL' ? 'text-indigo-400' : 'text-emerald-400'}>
                              {selectedLicense === 'PPL' ? 'Part-FCL (Aeroplane)' : 'Part-FCL (Sailplane)'}
                            </span>
                            {' > LOs'}
                          </p>
                        </div>
                        <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                          {(() => {
                            const subjectLOs = allLOs.filter(lo => lo.subject_id === importSubjectId);
                            const primaryLOs = subjectLOs.filter(lo => (lo.applies_to || []).includes(selectedLicense));
                            const suppLOs = subjectLOs.filter(lo => !(lo.applies_to || []).includes(selectedLicense));
                            return (
                              <>
                                {primaryLOs.map(lo => (
                                  <div key={lo.id} className="flex items-start gap-2 py-1 border-b border-[var(--line)]/30">
                                    <span className={`mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full ${coveredLOs.has(lo.id) ? 'bg-emerald-500' : 'bg-[var(--line)]'}`} />
                                    <div>
                                      <p className="text-[9px] font-mono opacity-60">{lo.id}</p>
                                      <p className="text-[9px] leading-tight">{lo.text}</p>
                                    </div>
                                  </div>
                                ))}
                                {suppLOs.length > 0 && (
                                  <div className="pt-2">
                                    <p className="text-[8px] uppercase tracking-widest opacity-40 font-bold mb-1">Doplňující ({suppLOs.length})</p>
                                    {suppLOs.map(lo => (
                                      <div key={lo.id} className="flex items-start gap-2 py-1 border-b border-[var(--line)]/20 opacity-50">
                                        <span className="mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" />
                                        <div>
                                          <p className="text-[9px] font-mono opacity-60">{lo.id}</p>
                                          <p className="text-[9px] leading-tight">{lo.text}</p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {subjectLOs.length === 0 && (
                                  <p className="text-[10px] opacity-40">Vyberte předmět pro zobrazení LOs.</p>
                                )}
                              </>
                            );
                          })()}
                        </div>
                        <div className="flex gap-3 text-[9px] font-bold pt-1">
                          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /> Pokryto</span>
                          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[var(--line)] inline-block" /> Chybí</span>
                          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" /> Doplňující</span>
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
  !isGuestMode && isStatsLoading ? (
    <div className="flex justify-center items-center h-64">
      <Spinner className="w-16 h-16" />
    </div>
  ) : (

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
                        {Object.entries(stats?.subjectStats || {}).map(([subjectId, s]: [string, { correctAnswers: number; totalAnswered: number }]) => {
                          const subject = subjects.find(sub => sub.id === Number(subjectId));
                          if (!subject || s.totalAnswered === 0) return null;
                          const rate = s.correctAnswers / s.totalAnswered;
                          // Completion rate (max 100%)
                          const completionRate = subject.question_count ? Math.min(1, s.totalAnswered / subject.question_count) : 0;

                          const handleReset = async (e: React.MouseEvent) => {
                            e.stopPropagation();
                            if (!window.confirm(`Opravdu chcete vymazat historii odpovědí pro předmět "${subject.description || subject.name}"? Tento krok nelze vzít zpět.`)) return;

                            // 1. Clear locally
                            const answersKey = `${user?.id || 'guest'}:answers`;
                            const allAnswers = JSON.parse(localStorage.getItem(answersKey) || '{}');
                            const newAnswers = { ...allAnswers };
                            Object.keys(newAnswers).forEach(key => {
                              if (newAnswers[key].subjectId === Number(subjectId)) {
                                delete newAnswers[key];
                              }
                            });
                            localStorage.setItem(answersKey, JSON.stringify(newAnswers));

                            // 2. Clear in DynamoDB if logged in
                            if (!isGuestMode && user?.id) {
                              try {
                                await dynamoDBService.deleteSubjectProgress(String(user.id), Number(subjectId));
                              } catch (err) {
                                console.error('Failed to delete remote subject progress', err);
                              }
                            }

                            // 3. Recalculate stats immediately
                            const practicedCount = Object.keys(newAnswers).length;
                            const correctCount = Object.values(newAnswers).filter((a: any) => a.isCorrect).length;
                            const successRate = practicedCount > 0 ? correctCount / practicedCount : 0;

                            const perSubject: Record<number, { correct: number; total: number }> = {};
                            for (const a of Object.values(newAnswers) as any[]) {
                              const sid = a.subjectId;
                              if (!sid) continue;
                              if (!perSubject[sid]) perSubject[sid] = { correct: 0, total: 0 };
                              perSubject[sid].total++;
                              if (a.isCorrect) perSubject[sid].correct++;
                            }
                            const newSubjectStats: { [id: number]: { correctAnswers: number; totalAnswered: number } } = {};
                            subjects.forEach(sub => {
                              newSubjectStats[sub.id] = {
                                correctAnswers: perSubject[sub.id] ? perSubject[sub.id].correct : 0,
                                totalAnswered: perSubject[sub.id] ? perSubject[sub.id].total : 0
                              };
                            });

                            setStats(prev => prev ? {
                              ...prev,
                              practicedQuestions: practicedCount,
                              overallSuccess: successRate,
                              subjectStats: newSubjectStats
                            } : prev);
                          };

                          return (
                            <div key={subjectId} className="space-y-1">
                              <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider group cursor-pointer" onClick={handleReset} title="Klikněte pro reset statistik">
                                <span className="flex items-center gap-2">
                                  <span>{subject.description || subject.name}</span>
                                  <span className="opacity-0 group-hover:opacity-100 text-rose-500 transition-opacity">
                                    [RESET]
                                  </span>
                                </span>
                                <div className="text-right leading-tight">
                                  <div className="font-mono text-emerald-400">{Math.round(rate * 100)}% úspěšnost</div>
                                  <div className="font-mono text-indigo-400 opacity-70 text-[8px]">{Math.round(completionRate * 100)}% hotovo</div>
                                </div>
                              </div>
                              <div className="space-y-0.5">
                                {/* Success Rate Bar */}
                                <div className="h-2.5 bg-[var(--progress-bg)] rounded-sm overflow-hidden" title="Úspěšnost odpovědí">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${rate * 100}%` }}
                                    className={`h-full ${rate > 0.75 ? 'bg-emerald-500' : rate > 0.5 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                  />
                                </div>
                                {/* Completion Rate Bar */}
                                <div className="h-1.5 bg-[var(--progress-bg)] rounded-sm overflow-hidden opacity-70" title="Postup (Zodpovězeno / Celkem v předmětu)">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${completionRate * 100}%` }}
                                    className="h-full bg-indigo-500"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        }).filter(Boolean)}
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
              )
            )}
            </AnimatePresence>
          </main>

          <footer className="p-8 sm:p-8 border-t border-[var(--line)] mt-1 opacity-30 text-[10px] uppercase tracking-[0.2em] text-center" style={{ paddingBottom: 'calc(var(--spacing) * 2)' }}>
            AeroPilot Exam Prep &copy; 2026 • EASA ECQB Standard • Czech Republic
          </footer>

          {/* ─── Syllabus Browser Modal ─── */}
          {syllabusOpen && (() => {
            const searchTerm = syllabusSearch.toLowerCase();

            // Filter allLOs (DB-loaded) if there's a search term
            const filteredLOs = searchTerm
              ? allLOs.filter(lo =>
                lo.id.toLowerCase().includes(searchTerm) ||
                lo.text.toLowerCase().includes(searchTerm) ||
                lo.knowledgeContent?.toLowerCase().includes(searchTerm) ||
                lo.context?.toLowerCase().includes(searchTerm)
              )
              : allLOs;

            const syllabusTree = buildSyllabusTree(filteredLOs);
            const selectedLOData = syllabusSelectedLO ? allLOs.find(l => l.id === syllabusSelectedLO) : null;
            const selectedLOQuestionCount = syllabusLOQuestions.length;
            const selectedLOSubject = selectedLOData?.subject_id ? syllabusTree.find(s => s.subjectId === selectedLOData.subject_id) : null;
            const selectedLOTopic = selectedLOData ? selectedLOSubject?.topics.find(t => selectedLOData.id.startsWith(t.code + '.')) : null;
            const selectedLOSubtopic = selectedLOData ? selectedLOTopic?.subtopics.find(s => selectedLOData.id.startsWith(s.code + '.')) : null;

            return (
              <div className="fixed inset-0 z-[200] flex flex-col bg-[var(--bg)]" style={{ backdropFilter: 'blur(8px)' }}>
                {/* Modal Header — row 1: title + close, row 2: search + filter */}
                <div className="border-b border-[var(--line)] flex-shrink-0">
                  {/* Row 1 */}
                  <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 bg-indigo-600 text-white rounded-xl flex items-center justify-center flex-shrink-0">
                        <BookOpen size={16} />
                      </div>
                      <div className="min-w-0">
                        <h2 className="font-bold text-sm leading-tight truncate">EASA Syllabus Browser</h2>
                        <p className="text-[9px] opacity-40 uppercase tracking-widest hidden sm:block">AMC/GM Part-FCL — Learning Objectives</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSyllabusOpen(false)}
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--line)] transition-colors flex-shrink-0"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Row 2: search + license filter */}
                  <div className="px-4 pb-3 flex items-center gap-2">
                    {/* Search box — full flex width */}
                    <div className="relative flex-1">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-30" />
                      <input
                        type="text"
                        placeholder="Hledat v sylabu..."
                        value={syllabusSearch}
                        onChange={(e) => setSyllabusSearch(e.target.value)}
                        className="w-full pl-8 pr-7 py-1.5 bg-[var(--line)]/30 border border-[var(--line)] rounded-xl text-xs focus:outline-none focus:border-indigo-600 transition-all"
                      />
                      {syllabusSearch && (
                        <button
                          onClick={() => setSyllabusSearch('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-[var(--line)] rounded-full opacity-50 hover:opacity-100"
                        >
                          <X size={10} />
                        </button>
                      )}
                    </div>

                    {/* License filter pills — compact (dropdown) */}
                    <div className="flex border border-[var(--line)] rounded-xl p-0.5 flex-shrink-0 relative bg-indigo-600/10">
                      <select
                        value={syllabusLicenseFilterSubtype}
                        onChange={(e: any) => {
                          const v = e.target.value;
                          setSyllabusLicenseFilterSubtype(v);
                          if (v === 'ALL') {
                            setSyllabusLicenseFilter('ALL');
                          } else if (['SPL', 'LAPL(S)', 'BPL', 'LAPL(B)'].includes(v)) {
                            setSyllabusLicenseFilter('SPL');
                          } else {
                            setSyllabusLicenseFilter('PPL');
                          }
                        }}
                        className="px-2 pr-4 py-1 rounded-lg text-xs font-bold uppercase tracking-wide transition-all bg-indigo-600 text-white outline-none cursor-pointer appearance-none text-center h-full min-w-[70px]"
                        style={{ WebkitAppearance: 'none', MozAppearance: 'none' }}
                      >
                        <option value="ALL">VŠE (ALL)</option>
                        <optgroup label="Letadla (A)">
                          <option value="PPL(A)">PPL(A)</option>
                          <option value="LAPL(A)">LAPL(A)</option>
                        </optgroup>
                        <optgroup label="Vrtulníky (H)">
                          <option value="PPL(H)">PPL(H)</option>
                          <option value="LAPL(H)">LAPL(H)</option>
                        </optgroup>
                        <optgroup label="Kluzáky (S)">
                          <option value="SPL">SPL</option>
                          <option value="LAPL(S)">LAPL(S)</option>
                        </optgroup>
                        <optgroup label="Balóny (B)">
                          <option value="BPL">BPL</option>
                          <option value="LAPL(B)">LAPL(B)</option>
                        </optgroup>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-1 flex items-center text-white">
                        <ChevronDown size={12} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Modal Body */}
                <div className="flex flex-1 overflow-hidden">
                  {/* Tree Panel */}
                  <div className="w-full md:w-3/5 overflow-y-auto border-r border-[var(--line)] p-4 space-y-1">
                    {syllabusTree.map(subject => {
                      const subjectExpanded = syllabusExpandedSubjects.has(subject.subjectId) || (syllabusSearch.length > 0);
                      const subjectLOs = subject.topics.flatMap(t => t.subtopics.flatMap(s => s.los));
                      const filteredSubjectLOs = syllabusLicenseFilter === 'ALL'
                        ? subjectLOs
                        : subjectLOs.filter(n => (n.lo.applies_to || ['PPL', 'SPL']).includes(syllabusLicenseFilter));
                      if (filteredSubjectLOs.length === 0) return null;

                      return (
                        <div key={subject.subjectId} className="border border-[var(--line)] rounded-2xl overflow-hidden">
                          {/* Subject row */}
                          <button
                            onClick={() => setSyllabusExpandedSubjects(prev => {
                              const next = new Set(prev);
                              next.has(subject.subjectId) ? next.delete(subject.subjectId) : next.add(subject.subjectId);
                              return next;
                            })}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--line)]/50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              {subjectExpanded ? <ChevronDown size={14} className="opacity-50 flex-shrink-0" /> : <ChevronRight size={14} className="opacity-50 flex-shrink-0" />}
                              <span className="text-xs font-bold">{subject.name}</span>
                            </div>
                            <span className="text-[9px] font-mono opacity-40">{filteredSubjectLOs.length} LOs</span>
                          </button>

                          {subjectExpanded && (
                            <div className="border-t border-[var(--line)]">
                              {subject.topics.map(topic => {
                                const topicExpanded = syllabusExpandedTopics.has(topic.code) || (syllabusSearch.length > 0);
                                const topicLOs = topic.subtopics.flatMap(s => s.los);
                                const filteredTopicLOs = syllabusLicenseFilter === 'ALL'
                                  ? topicLOs
                                  : topicLOs.filter(n => (n.lo.applies_to || ['PPL', 'SPL']).includes(syllabusLicenseFilter));
                                if (filteredTopicLOs.length === 0) return null;

                                return (
                                  <div key={topic.code} className="border-b border-[var(--line)]/50 last:border-b-0">
                                    {/* Topic row */}
                                    <button
                                      onClick={() => setSyllabusExpandedTopics(prev => {
                                        const next = new Set(prev);
                                        next.has(topic.code) ? next.delete(topic.code) : next.add(topic.code);
                                        return next;
                                      })}
                                      className="w-full flex items-center justify-between px-6 py-2.5 hover:bg-[var(--line)]/30 transition-colors"
                                    >
                                      <div className="flex items-center gap-2">
                                        {topicExpanded ? <ChevronDown size={12} className="opacity-40 flex-shrink-0" /> : <ChevronRight size={12} className="opacity-40 flex-shrink-0" />}
                                        <span className="text-[10px] font-mono opacity-40 w-16 flex-shrink-0">{topic.code}</span>
                                        <span className="text-[11px] font-semibold">{topic.label}</span>
                                      </div>
                                      <span className="text-[9px] font-mono opacity-30">{filteredTopicLOs.length}</span>
                                    </button>

                                    {topicExpanded && (
                                      <div>
                                        {topic.subtopics.map(subtopic => {
                                          const subtopicExpanded = syllabusExpandedSubtopics.has(subtopic.code) || (syllabusSearch.length > 0);
                                          const filteredSubtopicLOs = syllabusLicenseFilter === 'ALL'
                                            ? subtopic.los
                                            : subtopic.los.filter(n => (n.lo.applies_to || ['PPL', 'SPL']).includes(syllabusLicenseFilter));
                                          if (filteredSubtopicLOs.length === 0) return null;

                                          return (
                                            <div key={subtopic.code} className="border-t border-[var(--line)]/30">
                                              {/* Subtopic row */}
                                              <button
                                                onClick={() => setSyllabusExpandedSubtopics(prev => {
                                                  const next = new Set(prev);
                                                  next.has(subtopic.code) ? next.delete(subtopic.code) : next.add(subtopic.code);
                                                  return next;
                                                })}
                                                className="w-full flex items-center justify-between px-8 py-2 hover:bg-[var(--line)]/20 transition-colors"
                                              >
                                                <div className="flex items-center gap-2">
                                                  {subtopicExpanded ? <ChevronDown size={11} className="opacity-30 flex-shrink-0" /> : <ChevronRight size={11} className="opacity-30 flex-shrink-0" />}
                                                  <span className="text-[9px] font-mono opacity-30 w-20 flex-shrink-0">{subtopic.code}</span>
                                                  <span className="text-[10px] font-medium opacity-70">{subtopic.label}</span>
                                                </div>
                                                <span className="text-[9px] font-mono opacity-25">{filteredSubtopicLOs.length}</span>
                                              </button>

                                              {subtopicExpanded && (
                                                <div className="bg-[var(--line)]/10">
                                                  {filteredSubtopicLOs.map(({ lo, licenseType }) => {
                                                    const isFocused = focusedLOId === lo.id;
                                                    const isSelected = syllabusSelectedLO === lo.id;
                                                    const isCovered = coveredLOs.has(lo.id);
                                                    const qCount = isSelected ? syllabusLOQuestions.length : (isCovered ? 1 : 0);
                                                    const isGenerating = syllabusGeneratingLO === lo.id;

                                                    return (
                                                      <div
                                                        key={lo.id}
                                                        className={`px-10 py-2 flex items-center justify-between gap-3 cursor-pointer transition-colors border-t border-[var(--line)]/20 ${isSelected ? 'bg-indigo-600/10 border-l-2 border-l-indigo-600' : isFocused ? 'bg-amber-500/10 border-l-2 border-l-amber-500' : 'hover:bg-[var(--line)]/20'}`}
                                                        onClick={() => { setSyllabusSelectedLO(lo.id); setFocusedLOId(null); setSyllabusGeneratedQuestion(null); }}
                                                      >
                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                          <span
                                                            className={`flex-shrink-0 w-2 h-2 rounded-full ${licenseType === 'BOTH' ? 'bg-gray-400' : licenseType === 'PPL' ? 'bg-indigo-500' : 'bg-emerald-500'}`}
                                                            title={licenseType === 'BOTH' ? 'PPL + SPL' : licenseType}
                                                          />
                                                          <div className="min-w-0">
                                                            <p className="text-[9px] font-mono opacity-40">{lo.id}</p>
                                                            <p className="text-[10px] leading-snug font-medium">{lo.text}</p>
                                                          </div>
                                                        </div>
                                                        <div className="flex items-center gap-2 flex-shrink-0">
                                                          {isCovered ? (
                                                            <span title={`${qCount} otázek`} className="flex items-center gap-1 text-emerald-500">
                                                              <CheckCircle2 size={13} />
                                                              {qCount > 1 && <span className="text-[8px] font-mono">{qCount}</span>}
                                                            </span>
                                                          ) : (
                                                            <span className="w-3 h-3 rounded-full border border-[var(--line)] opacity-40" title="Bez otázky" />
                                                          )}
                                                          {!isCovered && userRole === 'admin' && (
                                                            <button
                                                              onClick={(e) => { e.stopPropagation(); handleGenerateQuestionForLO(lo.id); }}
                                                              disabled={!!syllabusGeneratingLO}
                                                              className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-indigo-500/40 text-indigo-500 text-[8px] font-bold uppercase tracking-widest hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all disabled:opacity-40"
                                                              title="Generovat otázku"
                                                            >
                                                              {isGenerating ? <RotateCcw size={9} className="animate-spin" /> : <Sparkles size={9} />}
                                                            </button>
                                                          )}
                                                          {isCovered && (
                                                            <motion.button
                                                              layoutId={`syllabus-tree-lo-${lo.id}`}
                                                              onClick={(e) => { e.stopPropagation(); handlePreviewQuestionForLO(lo.id); }}
                                                              className="px-1.5 py-0.5 rounded border border-[var(--line)] text-[8px] font-bold uppercase tracking-widest hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all"
                                                            >
                                                              ▶
                                                            </motion.button>
                                                          )}
                                                        </div>
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Info Panel */}
                  <div className="hidden md:flex md:w-2/5 flex-col overflow-y-auto p-6 space-y-6">
                    {selectedLOData ? (
                      <>
                        {/* Breadcrumb */}
                        <div className="space-y-1">
                          <p className="text-[9px] uppercase tracking-widest opacity-40 font-bold">Cesta v sylabu</p>
                          <p className="text-[10px] font-mono opacity-60 leading-relaxed">
                            {selectedLOSubject?.name}
                            {selectedLOTopic && <> <span className="opacity-40">›</span> {selectedLOTopic.label}</>}
                            {selectedLOSubtopic && <> <span className="opacity-40">›</span> {selectedLOSubtopic.label}</>}
                          </p>
                        </div>

                        {/* LO ID + license badges */}
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-[10px] font-mono font-bold">{selectedLOData.id}</span>
                            {(selectedLOData.applies_to || ['PPL', 'SPL']).map(lic => (
                              <span key={lic} className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${lic === 'PPL' ? 'border-indigo-500/40 text-indigo-600 bg-indigo-500/10' : 'border-emerald-500/40 text-emerald-600 bg-emerald-500/10'}`}>
                                {lic}
                              </span>
                            ))}
                          </div>
                          <h3 className="text-lg font-bold leading-snug">{selectedLOData.text}</h3>
                        </div>

                        {/* Context / What you need to know */}
                        {selectedLOData.context && (
                          <div className="p-4 bg-[var(--line)]/20 rounded-2xl space-y-1.5">
                            <p className="text-[9px] uppercase tracking-widest opacity-40 font-bold">Co potřebujete znát (eRules context)</p>
                            <p className="text-xs leading-relaxed opacity-80">{selectedLOData.context}</p>
                          </div>
                        )}

                        {/* License note */}
                        {(selectedLOData.applies_to || ['PPL', 'SPL']).length === 1 && (
                          <div className={`p-3 rounded-xl border text-[10px] leading-relaxed ${(selectedLOData.applies_to || [])[0] === 'PPL' ? 'border-indigo-500/30 bg-indigo-500/5 text-indigo-700' : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700'}`}>
                            Toto téma je specifické pouze pro <strong>{(selectedLOData.applies_to || [])[0]}</strong> licenci.
                            {selectedLicense !== (selectedLOData.applies_to || [])[0] && ' Pro vaši vybranou licenci jde o doplňující znalost.'}
                          </div>
                        )}

                        {/* Question stats */}
                        <div className="p-4 border border-[var(--line)] rounded-2xl space-y-3">
                          <p className="text-[9px] uppercase tracking-widest opacity-40 font-bold">Otázky v databázi</p>
                          <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-mono font-bold">{selectedLOQuestionCount}</span>
                            <span className="text-xs opacity-50">otázek</span>
                          </div>
                          {selectedLOQuestionCount > 0 ? (
                            <>
                              {syllabusLOQuestionsLoading ? (
                                <div className="text-[10px] opacity-40 text-center py-2">Načítám otázky...</div>
                              ) : (
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                  {syllabusLOQuestions.map((q) => (
                                    <motion.div
                                      key={q.questionId || q.id}
                                      layoutId={q._sourceLayoutId}
                                      onClick={() => setExpandedSyllabusQuestion(q)}
                                      className="group p-3 bg-indigo-500/5 hover:bg-indigo-500/10 rounded-xl border border-indigo-500/10 hover:border-indigo-500/30 space-y-2 cursor-pointer transition-all active:scale-[0.98] relative"
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="flex gap-2 min-w-0">
                                          {(() => {
                                            const answers = JSON.parse(localStorage.getItem(userKey('answers')) || '{}');
                                            if (answers[String(q.questionId || q.id)]) {
                                              return <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-gray-400 dark:text-gray-500" title="Již zodpovězeno" />;
                                            }
                                            return null;
                                          })()}
                                          <p className="text-xs leading-snug font-medium text-slate-700 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate-3-lines">
                                            {q.text}
                                          </p>
                                        </div>
                                        <Maximize2 size={12} className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-40 transition-opacity text-indigo-600" />
                                      </div>

                                      <div className="space-y-0.5 border-t border-indigo-500/5 pt-2">
                                        {(q.answers || q.options)?.map((a: string, ai: number) => (
                                          <p key={ai} className={`text-[10px] leading-snug pl-2 ${ai === (q.correct_answer ?? q.correctAnswer) ? 'text-emerald-600 font-bold opacity-100' : 'opacity-40'}`}>
                                            {String.fromCharCode(65 + ai)}. {a}
                                          </p>
                                        ))}
                                      </div>
                                    </motion.div>
                                  ))}
                                </div>
                              )}
                            </>
                          ) : (
                            // TODO: Implementovat později - generování otázek pro LO
                            /*
                            <button
                              onClick={() => {
                                setSyllabusOpen(false);
                                setImportSubjectId(selectedLOData.subject_id ?? null);
                                setView('ai');
                              }}
                              className="w-full py-2.5 border border-indigo-600 text-indigo-600 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-colors flex items-center justify-center gap-2"
                            >
                              <Sparkles size={12} />
                              Generovat otázky (AI)
                            </button>
                            */
                            <div className="space-y-3">
                              {syllabusGeneratedQuestion?.loId === syllabusSelectedLO ? (
                                <div className="space-y-3">
                                  <div className="p-3 bg-indigo-500/5 border border-indigo-500/20 rounded-xl space-y-2">
                                    <p className="text-[9px] uppercase tracking-widest opacity-40 font-bold">Vygenerovaná otázka — preview</p>
                                    <div className="text-xs font-medium leading-snug" dangerouslySetInnerHTML={{ __html: sanitizeHtml(markdownToHtml(syllabusGeneratedQuestion.question.text || '')) }} />
                                    <div className="space-y-1 pt-1">
                                      {(['option_a', 'option_b', 'option_c', 'option_d'] as const).map((opt, i) => (
                                        <div key={opt} className={`text-[10px] pl-2 ${syllabusGeneratedQuestion.question.correct_option === String.fromCharCode(65 + i) ? 'text-emerald-600 font-bold' : 'opacity-50'}`}>
                                          <span>{String.fromCharCode(65 + i)}. </span>
                                          <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(markdownToHtml(String(syllabusGeneratedQuestion.question[opt] || ''))) }} />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                  {userRole === 'admin' && (
                                    <div className="flex gap-2">
                                      <button
                                        onClick={handleSaveSyllabusQuestion}
                                        className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1"
                                      >
                                        <CheckCircle2 size={11} /> Uložit
                                      </button>
                                      <button
                                        onClick={() => handleGenerateQuestionForLO(syllabusSelectedLO!)}
                                        disabled={!!syllabusGeneratingLO}
                                        className="flex-1 py-2 border border-[var(--line)] rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-[var(--line)] transition-colors flex items-center justify-center gap-1 disabled:opacity-40"
                                      >
                                        <RefreshCw size={11} /> Znovu
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleGenerateQuestionForLO(syllabusSelectedLO!)}
                                  disabled={!!syllabusGeneratingLO}
                                  className="w-full py-2.5 border border-indigo-500/40 text-indigo-500 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
                                >
                                  {syllabusGeneratingLO === syllabusSelectedLO
                                    ? <><RotateCcw size={12} className="animate-spin" /> Generuji...</>
                                    : <><Sparkles size={12} /> Generovat otázku (AI)</>}
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* License icon legend */}
                        <div className="flex gap-4 text-[9px] font-bold opacity-50 pt-2">
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" /> PPL(A) only</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> SPL only</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400 inline-block" /> Both</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center flex-1 text-center space-y-4 opacity-40">
                        <BookOpen size={48} />
                        <div>
                          <p className="font-bold">Vyberte Learning Objective</p>
                          <p className="text-xs mt-1">Klikněte na LO v stromě vlevo pro zobrazení detailů.</p>
                        </div>
                        <div className="text-[9px] space-y-1 mt-4">
                          <p className="flex items-center gap-2 justify-center"><span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" /> Modrá = PPL(A) only</p>
                          <p className="flex items-center gap-2 justify-center"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Zelená = SPL only</p>
                          <p className="flex items-center gap-2 justify-center"><span className="w-2 h-2 rounded-full bg-gray-400 inline-block" /> Šedá = Obě licence</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* DynamoDB Status Component */}
          <DynamoDBStatus />

          {/* Admin Dashboard Component - admin only */}
          <AdminDashboard userRole={userRole} />

          {/* Cognito Auth Component */}
          <CognitoAuth
            isOpen={isAuthPromptOpen}
            onClose={closeAuthPrompt}
            onAuthSuccess={async (userData) => {
              try {
                // Switch to authenticated credentials BEFORE setting user state
                // to avoid race conditions in useEffects that depend on user
                console.log('🔄 Switching to authenticated credentials after login...');
                const success = await initializeAuthenticatedCredentials();
                if (!success) {
                  console.log('🔄 Falling back to guest credentials...');
                  initializeGuestCredentials();
                }
                dynamoDBService.reinitialize();

                // Eagerly fetch AWS credentials to populate identityId
                // (initializeAuthenticatedCredentials only sets up a lazy provider)
                await cognitoAuthService.getAWSCredentials();

                // Use Identity Pool identity ID as userId (enables IAM fine-grained access)
                const identityId = cognitoAuthService.getIdentityId() || userData.id;
                console.log('🆔 identityId:', identityId);

                // Set user state after credentials are ready
                setUser({ id: identityId, username: userData.username });
                setUserMode('logged-in');
                setUserRole(cognitoAuthService.getUserRole());
                setView('dashboard');

                // Save Cognito user profile to DynamoDB
                await dynamoDBService.saveCognitoUserProfile({
                  userId: identityId,
                  username: userData.username,
                  email: userData.email
                });

                // Mark credentials ready and fetch data
                setIsCredentialsReady(true);
                syncUserData();
                setLosLoading(true);
                getAllLOs().then(los => {
                  if (los && los.length > 0) setAllLOs(los);
                }).finally(() => setLosLoading(false));

                // User authenticated via Cognito
              } catch (error) {
                // Auth setup error
              }
            }}
            feature={authPromptFeature}
          />

          {/* Expanded Learning Objective Modal */}
          <AnimatePresence>
            {isExpandedLO && expandedLOContent && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={() => setIsExpandedLO(false)}
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="glass-panel rounded-3xl p-8 max-w-2xl w-full max-h-[80vh] overflow-y-auto border-2 border-indigo-500/30"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3 text-indigo-600 dark:text-indigo-400">
                      <GraduationCap size={24} />
                      <h2 className="text-xl font-bold uppercase tracking-widest">Cíl učení (Learning Objective)</h2>
                    </div>
                    <button
                      onClick={() => setIsExpandedLO(false)}
                      className="p-2 rounded-full bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20 transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="space-y-6">
                    {/* LO ID and Type */}
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="px-3 py-1.5 rounded-lg text-sm font-bold bg-indigo-600 text-white">
                          {expandedLOContent.id}
                        </span>
                        <div className="flex items-center gap-2 text-sm text-indigo-400 font-semibold">
                          <span>Typ:</span>
                          <span className="text-indigo-300 opacity-80">{expandedLOContent.type}</span>
                        </div>
                      </div>
                      {expandedLOContent.level !== undefined && (
                        <div className="flex items-center gap-2 text-sm text-indigo-400 font-semibold">
                          <span>Úroveň:</span>
                          <span className="text-indigo-300 opacity-80">
                            {expandedLOContent.level === 1 ? 'Povědomí' :
                              expandedLOContent.level === 2 ? 'Znalost' : 'Porozumění'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* LO Text */}
                    <div className="p-6 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl shadow-inner shadow-indigo-500/10">
                      <p className="text-base leading-relaxed text-white whitespace-pre-wrap font-mono font-medium">
                        {expandedLOContent.text}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-4 border-t border-indigo-500/20">
                      <button
                        onClick={() => {
                          openSyllabusAtLO(expandedLOContent.id);
                          setIsExpandedLO(false);
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-indigo-500/30 text-sm font-bold uppercase tracking-widest hover:bg-indigo-500/10 transition-colors text-indigo-600"
                      >
                        <BookOpen size={14} />
                        Otevřít v osnově
                      </button>

                      <button
                        onClick={() => setIsExpandedLO(false)}
                        className="px-4 py-2 rounded-lg bg-[var(--ink)] text-[var(--bg)] text-sm font-bold uppercase tracking-widest hover:opacity-80 transition-opacity"
                      >
                        Zavřít
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}

            {/* Expanded Syllabus Question Modal */}
            {expandedSyllabusQuestion && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[300] flex items-end sm:items-center justify-center"
                onClick={() => setExpandedSyllabusQuestion(null)}
              >
                <motion.div
                  layoutId={expandedSyllabusQuestion._sourceLayoutId}
                  initial={{ y: 40, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 40, opacity: 0 }}
                  transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                  className="glass-panel w-full sm:rounded-3xl rounded-t-3xl border border-indigo-500/20 shadow-2xl flex flex-col"
                  style={{ maxWidth: '375px', maxHeight: '667px', minHeight: '40vh' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Drag handle (mobile feel) */}
                  <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0">
                    <div className="w-10 h-1 rounded-full bg-slate-300/40" />
                  </div>

                  {/* Sticky header */}
                  {(() => {
                    const qIndex = expandedSyllabusQuestion ? syllabusLOQuestions.findIndex(q => (q.questionId || q.id) === (expandedSyllabusQuestion.questionId || expandedSyllabusQuestion.id)) : -1;

                    const currentLoId = expandedSyllabusQuestion?.loId;
                    const loIdx = activeSyllabusLOs.findIndex(l => l.id === currentLoId);

                    const canGoPrev = qIndex > 0 || (loIdx > 0 && loIdx !== -1);
                    const canGoNext = (qIndex !== -1 && qIndex < syllabusLOQuestions.length - 1) || (loIdx !== -1 && loIdx < activeSyllabusLOs.length - 1);

                    return (
                      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[var(--line)]/30 flex-shrink-0">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/20">
                            <GraduationCap size={16} className="text-white" />
                          </div>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Detail otázky</span>
                              <span className="text-[10px] font-mono opacity-30 mt-0.5">{currentLoId}</span>
                            </div>
                            {qIndex !== -1 && (
                              <span className="text-[9px] font-bold opacity-40 uppercase tracking-tighter">
                                {qIndex + 1} <span className="opacity-50 mx-0.5">/</span> {syllabusLOQuestions.length}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Navigation buttons */}
                        <div className="flex items-center gap-1.5 ml-auto mr-1.5 focus-within:z-10">
                          <button
                            disabled={!canGoPrev || isNavigatingSyllabus}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleNavigateSyllabus('prev');
                            }}
                            className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all ${canGoPrev
                              ? 'bg-indigo-500/10 text-indigo-600 hover:bg-indigo-600 hover:text-white active:scale-90'
                              : 'opacity-20 cursor-not-allowed bg-slate-500/5 text-slate-400'
                              }`}
                            title="Předchozí"
                          >
                            {isNavigatingSyllabus ? <RefreshCw size={16} className="animate-spin opacity-50" /> : <ChevronLeft size={18} />}
                          </button>
                          <button
                            disabled={!canGoNext || isNavigatingSyllabus}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleNavigateSyllabus('next');
                            }}
                            className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all ${canGoNext
                              ? 'bg-indigo-500/10 text-indigo-600 hover:bg-indigo-600 hover:text-white active:scale-90'
                              : 'opacity-20 cursor-not-allowed bg-slate-500/5 text-slate-400'
                              }`}
                            title="Další"
                          >
                            {isNavigatingSyllabus ? <RefreshCw size={16} className="animate-spin opacity-50" /> : <ChevronRight size={18} />}
                          </button>
                        </div>

                        <button
                          onClick={() => setExpandedSyllabusQuestion(null)}
                          className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-500/10 text-slate-500 hover:bg-red-500/10 hover:text-red-500 transition-all flex-shrink-0 active:scale-90"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    );
                  })()}

                  {/* Scrollable body */}
                  <div className="overflow-y-auto flex-1 px-4 py-4 space-y-4">

                    {/* Question text */}
                    <div className="p-4 bg-indigo-500/5 border border-indigo-500/15 rounded-2xl">
                      <p className="text-[11px] uppercase tracking-widest font-bold text-indigo-400 mb-2">Otázka</p>
                      <p className="text-[15px] font-semibold leading-relaxed text-slate-800 dark:text-slate-100">
                        {expandedSyllabusQuestion.text}
                      </p>
                    </div>

                    {/* Answers */}
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-widest font-bold opacity-35 px-1">Možnosti odpovědi</p>
                      {(expandedSyllabusQuestion.answers || expandedSyllabusQuestion.options)?.map((a: string, ai: number) => {
                        const isCorrect = ai === (expandedSyllabusQuestion.correct_answer ?? expandedSyllabusQuestion.correctAnswer);
                        return (
                          <div
                            key={ai}
                            className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${isCorrect
                              ? 'bg-emerald-500/10 border-emerald-500/30 ring-1 ring-emerald-500/20'
                              : 'bg-slate-500/5 border-slate-200/20 dark:border-slate-700/30 opacity-55'
                              }`}
                          >
                            {/* Letter badge */}
                            <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold leading-none shrink-0 mt-0.5 ${isCorrect ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>
                              {String.fromCharCode(65 + ai)}
                            </span>
                            <p className={`text-[13px] leading-snug font-medium flex-1 ${isCorrect ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>{a}</p>
                            {isCorrect && (
                              <CheckCircle2 size={15} className="text-emerald-500 shrink-0 mt-0.5" />
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* AI explanation */}
                    {expandedSyllabusQuestion.explanation && (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl space-y-1.5">
                        <p className="text-[10px] uppercase tracking-widest font-bold text-amber-600 flex items-center gap-1.5">
                          <Bot size={12} /> Vysvětlení AI
                        </p>
                        <p className="text-[12px] leading-relaxed text-amber-900 dark:text-amber-200 opacity-90">
                          {expandedSyllabusQuestion.explanation}
                        </p>
                      </div>
                    )}

                    {/* Spacer so button doesn't overlap last item */}
                    <div className="h-1" />
                  </div>


                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Exam Type Selection Modal */}
          <AnimatePresence>
            {showExamTypeSelection && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                onClick={() => setShowExamTypeSelection(false)}
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className={`bg-[var(--bg)] border border-[var(--line)] rounded-2xl p-6 max-w-md w-full shadow-2xl ${isGuestMode ? 'demo-window-blink' : ''}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold">Výběr typu testu</h2>
                    <button
                      onClick={() => setShowExamTypeSelection(false)}
                      className="p-2 hover:bg-[var(--line)] rounded-lg transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="space-y-4">
                    {/* UCL Test Option */}
                    <div className="border border-[var(--line)] rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-500 text-white rounded-lg flex items-center justify-center font-bold">
                          ÚCL
                        </div>
                        <div>
                          <h3 className="font-bold">ÚCL Test</h3>
                          <p className="text-sm opacity-60">Oficiální test ÚCL</p>
                        </div>
                      </div>
                      <p className="text-xs opacity-50">
                        120 otázek • 4 hodiny • Reálné ÚCL podmínky
                      </p>
                      <button
                        onClick={startUCLExam}
                        className="w-full bg-blue-500 text-white py-2 rounded-lg font-bold hover:bg-blue-600 transition-colors"
                      >
                        Spustit ÚCL Test
                      </button>
                    </div>

                    {/* EASA Test Option */}
                    <div className="border border-[var(--line)] rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-500 text-white rounded-lg flex items-center justify-center font-bold">
                          EASA
                        </div>
                        <div>
                          <h3 className="font-bold">EASA Test</h3>
                          <p className="text-sm opacity-60">Test dle EASA standardu</p>
                        </div>
                      </div>
                      <p className="text-xs opacity-50">
                        136 otázek • 55 minut • AI generované otázky
                      </p>
                      <button
                        onClick={startEASAExam}
                        className="w-full bg-green-500 text-white py-2 rounded-lg font-bold hover:bg-green-600 transition-colors"
                      >
                        Spustit EASA Test
                      </button>
                    </div>

                    {/* SPL Exam Card */}
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg">
                      <div className="flex items-center mb-2">
                        <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white font-bold mr-3">
                          SPL
                        </div>
                        <div>
                          <h3 className="font-bold text-sm">SPL Test</h3>
                          <p className="text-sm opacity-60">Pro piloty větroňů</p>
                        </div>
                      </div>
                      <p className="text-xs opacity-50">
                        80 otázek • 40 minut • 6 předmětů
                      </p>
                      <button
                        onClick={startSPLEXam}
                        className="w-full bg-purple-500 text-white py-2 rounded-lg font-bold hover:bg-purple-600 transition-colors"
                      >
                        Spustit SPL Test
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Session Restore Modal */}
          {showSessionRestoreModal && pendingSession && (
            <SessionRestoreModal
              session={pendingSession}
              onContinue={handleContinueSession}
              onRestart={handleRestartSession}
              onDismiss={handleDismissSessionModal}
            />
          )}
        </>
      )}
    </div>
  );
}
