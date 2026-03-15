import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  ChevronRight, 
  ChevronDown,
  AlertCircle, 
  CheckCircle2, 
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
  BarChart3,
  Sun,
  Moon,
  Menu,
  Trash2
} from 'lucide-react';
import { Subject, Question, Stats, ViewMode, DrillSettings } from './types';
import { LearningEngine } from './lib/LearningEngine';
import { mockLOs, getAllLOs, generateBatchQuestions, getDetailedExplanation, getDetailedHumanExplanation, EasaLO, SYLLABUS_SCOPE, SUBJECT_NAMES, buildSyllabusTree, verifyApiKey, AIProvider, generateMissingLearningObjectives, getDynamicSyllabusScope, getSubjectAnalysis } from './services/aiService';
import { checkSubjectDuplicates, checkAllDuplicates, findDuplicatesInQuestions } from './utils/duplicateChecker';
import { DynamoDBStatus } from './components/DynamoDBStatus';
import { AdminDashboard } from './components/AdminDashboard';
import { AircademySyllabus } from './components/AircademySyllabus';

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
  const originalCorrectIndex = ['A', 'B', 'C', 'D'].indexOf(shuffledQuestion.originalQuestion.correct_option);
  return originalIndex === originalCorrectIndex;
};
import { CognitoAuth } from './components/CognitoAuth';
import { useLanguage, LanguageButton, TranslatedText, TranslatedOption } from './utils/language';
import { markdownToHtml, sanitizeHtml } from './utils/markdown';
import { AICancellationManager, useAICancellation } from './utils/aiCancellation';
import { LandingPage } from './components/LandingPage';
import { dynamoCache } from './services/dynamoCache';
import { dynamoDBService } from './services/dynamoService';
import { initializeSecureCredentials, initializeAuthenticatedCredentials, initializeGuestCredentials } from './services/secureCredentials';
import { cognitoAuthService, UserRole } from './services/cognitoAuthService';
import { AccessDenied } from './components/AccessDenied';

export default function App() {
  // Loading state for auth
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  // True once AWS credentials (and identity ID) are ready for DynamoDB calls.
  // For guests this is immediately true; for authenticated users we wait for
  // initializeAuthenticatedCredentials() to resolve so user.id = identity_id.
  const [isCredentialsReady, setIsCredentialsReady] = useState(() => {
    if (!cognitoAuthService.isAuthenticated()) return true; // guests ready immediately
    return !!sessionStorage.getItem('identity_id'); // ready if identity_id already cached
  });
  
  // AI cleanup on unmount
  useAICancellation('App');

  // Guest/Login Mode Management
  const [userMode, setUserMode] = useState<'guest' | 'logged-in'>(() => {
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
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [originalQuestions, setOriginalQuestions] = useState<Question[]>([]); // Store unfiltered questions
  const [isEcqbPatternsOpen, setIsEcqbPatternsOpen] = useState(false); // ECQB patterns collapsible
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [answered, setAnswered] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [aiDetectedObjective, setAiDetectedObjective] = useState<string | null>(null);
  const [detailedExplanation, setDetailedExplanation] = useState<string | null>(null);
  const [isGeneratingDetailedExplanation, setIsGeneratingDetailedExplanation] = useState(false);
  const [isGeneratingAiExplanation, setIsGeneratingAiExplanation] = useState(false);
  const [isRegeneratingExplanation, setIsRegeneratingExplanation] = useState(false);
  const [isExpandedLO, setIsExpandedLO] = useState(false);
  const [expandedLOContent, setExpandedLOContent] = useState<{id: string, text: string, type: string, level?: number} | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
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
        // Failed to parse drillSettings
      }
    }
    return {
      sorting: 'default',
      immediateFeedback: true,
      showExplanationOnDemand: true,
      sourceFilters: ['user', 'ai'],
      shuffleAnswers: false
    };
  });

  // LOs loaded from DB (falls back to mockLOs)
  const [allLOs, setAllLOs] = useState<EasaLO[]>(mockLOs);
  const [losLoading, setLosLoading] = useState(false);

  // AI Generation states
  const [selectedLO, setSelectedLO] = useState<EasaLO>(mockLOs[0]);
  const [batchResults, setBatchResults] = useState<{loId: string, questions: Partial<Question>[]}[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(true); // Always true for static
  const [batchSize, setBatchSize] = useState<number>(5);
  
  // Shuffle answers state
  const [shuffledQuestion, setShuffledQuestion] = useState<ShuffledQuestion | null>(null);

  // Reshuffle when question changes or shuffle setting changes
  useEffect(() => {
    if (questions.length > 0 && currentQuestionIndex >= 0 && currentQuestionIndex < questions.length) {
      const currentQuestion = questions[currentQuestionIndex];
      if (drillSettings.shuffleAnswers) {
        setShuffledQuestion(shuffleAnswers(currentQuestion));
      } else {
        setShuffledQuestion(null);
      }
    }
  }, [currentQuestionIndex, questions, drillSettings.shuffleAnswers]);
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
  const [selectedLicense, setSelectedLicense] = useState<'PPL' | 'SPL'>(() => {
    return (localStorage.getItem('selectedLicense') as 'PPL' | 'SPL') || 'PPL';
  });

  // Syllabus Browser state
  const [syllabusOpen, setSyllabusOpen] = useState(false);
  const [focusedLOId, setFocusedLOId] = useState<string | null>(null);
  const [syllabusSelectedLO, setSyllabusSelectedLO] = useState<string | null>(null);
  const [syllabusExpandedSubjects, setSyllabusExpandedSubjects] = useState<Set<number>>(new Set());
  const [syllabusExpandedTopics, setSyllabusExpandedTopics] = useState<Set<string>>(new Set());
  const [syllabusExpandedSubtopics, setSyllabusExpandedSubtopics] = useState<Set<string>>(new Set());
  const [syllabusLicenseFilter, setSyllabusLicenseFilter] = useState<'ALL' | 'PPL' | 'SPL'>('ALL');
  const [syllabusSearch, setSyllabusSearch] = useState('');

  // Import states
  const [importSubjectId, setImportSubjectId] = useState<number | null>(null);
  const [importJson, setImportJson] = useState('');
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [clearExisting, setClearExisting] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [isImportSectionOpen, setIsImportSectionOpen] = useState(false);
  const [userApiKey, setUserApiKey] = useState('');
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [aiProvider, setAiProvider] = useState<AIProvider>(() => {
    const saved = localStorage.getItem('aiProvider');
    return (saved === 'claude' ? 'claude' : 'gemini');
  });
  const [aiModel, setAiModel] = useState(() => {
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
    
    return saved || 'gemini-flash-latest';
  });
  const [isVerifyingKey, setIsVerifyingKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth State - restore user from localStorage on init
  const [user, setUser] = useState<{id: string, username: string} | null>(() => {
    try {
      // Try Cognito auth first
      const cognitoUser = cognitoAuthService.getCurrentUser();
      if (cognitoUser) {
        // Prefer Identity Pool identity ID (needed for DynamoDB LeadingKeys policy).
        // It's stored in sessionStorage after the first getAWSCredentials() call.
        const identityId = sessionStorage.getItem('identity_id') || cognitoUser.id;
        return { id: identityId, username: cognitoUser.username };
      }
      
      // Fallback to old system
      const saved = localStorage.getItem('user_data');
      if (saved) {
        const data = JSON.parse(saved);
        return { id: '1', username: data.username || data.id };
      }
    } catch (e) {}
    return null;
  });
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));

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
    setUserApiKey,
    setClaudeApiKey,
    setAiProvider,
    setQuestions
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
    if (msg.includes('401') || msg.includes('403') || msg.includes('API key')) {
      return 'Neplatný API klíč.';
    }
    if (msg.includes('cancelled') || msg.includes('cancel')) {
      return '';
    }
    return 'Nepodařilo se vygenerovat vysvětlení. Zkuste to znovu.';
  };

  const handleLogout = () => {
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
  const switchToGuestMode = (fromLanding = false) => {
    setUserMode('guest');
    setToken(null);
    localStorage.removeItem('token');
    const uid = user?.id || 'guest';
    localStorage.removeItem(`${uid}:user_progress`);
    localStorage.removeItem(`${uid}:user_stats`);
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

    // Use Identity Pool identity ID as userId (enables IAM fine-grained access)
    const identityId = cognitoAuthService.getIdentityId() || userData.id;

    // Set user state
    setUser({ id: identityId, username: userData.username });
    setUserMode('logged-in');
    setUserRole(cognitoAuthService.getUserRole());
    setView('dashboard');

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

  useEffect(() => {
    // Initialize credentials based on authentication status
    const initializeCredentials = async () => {
      if (cognitoAuthService.isAuthenticated()) {
        // User is authenticated, try authenticated credentials
        console.log('🔄 Initializing authenticated credentials...');
        const success = await initializeAuthenticatedCredentials();
        if (!success) {
          console.log('🔄 Falling back to guest credentials...');
          initializeGuestCredentials();
        } else {
          // After credentials are fetched, Identity Pool identity ID is now in sessionStorage.
          // Update user.id to use identity ID so DynamoDB LeadingKeys policy matches.
          const identityId = cognitoAuthService.getIdentityId();
          if (identityId) {
            setUser((prev: {id: string, username: string} | null) => prev ? { ...prev, id: identityId } : prev);
          }
          setIsCredentialsReady(true);
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
    fetchStats();    // Then fetch live question counts from DynamoDB (slow)
    // Load LOs from DB (with fallback to mockLOs)
    setLosLoading(true);
    
    // Set auth loading to false after initialization
    setIsAuthLoading(false);
    
    getAllLOs().then(los => {
      if (los && los.length > 0) setAllLOs(los);
    }).finally(() => setLosLoading(false));
    if (isGuestMode) {
      initializeGuestSession();
    }
  }, []);

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
    const guestStats = JSON.parse(localStorage.getItem(`${user?.id || 'guest'}:guest_stats`) || '{}');
    if (guestStats.totalAnswers > 0) {
      return {
        totalAnswers: guestStats.totalAnswers,
        correctAnswers: guestStats.correctAnswers,
        overallSuccess: guestStats.successRate,
        practicedQuestions: guestStats.totalAnswers,
        totalQuestions: guestStats.totalAnswers,
        subjectStats: []
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
    const uid = user?.id || 'guest';
    const savedGemini = localStorage.getItem(`${uid}:userApiKey`);
    const savedClaude = localStorage.getItem(`${uid}:claudeApiKey`);
    setUserApiKey(savedGemini || '');
    setClaudeApiKey(savedClaude || '');
    setKeyStatus('idle');
  }, [user]);

  useEffect(() => {
    if (userApiKey) {
      const uid = user?.id || 'guest';
      localStorage.setItem(`${uid}:userApiKey`, userApiKey);
    }
  }, [userApiKey, user]);

  useEffect(() => {
    if (claudeApiKey) {
      const uid = user?.id || 'guest';
      localStorage.setItem(`${uid}:claudeApiKey`, claudeApiKey);
    }
  }, [claudeApiKey, user]);

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

  useEffect(() => {
    // Reset model when provider changes
    if (aiProvider === 'gemini' && !aiModel.startsWith('gemini')) {
      setAiModel('gemini-flash-latest');
    } else if (aiProvider === 'claude' && !aiModel.startsWith('claude')) {
      setAiModel('claude-sonnet-4-6'); 
    }
  }, [aiProvider, aiModel]);

  // Sync provider with saved model on startup
  useEffect(() => {
    const savedModel = localStorage.getItem('aiModel');
    if (savedModel) {
      // Validate that saved model is still supported
      const supportedModels = [
        'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-3.1-flash-lite-preview', 'gemini-2.5-pro', 'gemini-3.1-pro-preview',
        'claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-6'
      ];
      
      if (!supportedModels.includes(savedModel)) {
        localStorage.setItem('aiModel', 'gemini-flash-latest');
        setAiModel('gemini-flash-latest');
        return;
      }
      
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
      const result = await verifyApiKey(currentApiKey, aiProvider);
      
      if (result.success) {
        setKeyStatus('valid');
        alert(`✅ API klíč pro ${aiProvider === 'gemini' ? 'Gemini' : 'Claude'} je platný a byl uložen.`);
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

  useEffect(() => {
    localStorage.setItem('drillSettings', JSON.stringify(drillSettings));
    
    // Sync to DynamoDB for authenticated users (not guests)
    if (user?.id && (userApiKey || claudeApiKey)) {
      dynamoDBService.saveUserSettings(String(user.id), {
        ...drillSettings,
        userApiKey,
        claudeApiKey,
        aiProvider,
        aiModel
      }).catch(() => {
        // Silent fail - localStorage is primary storage
      });
    }
  }, [drillSettings, user?.id, userApiKey, claudeApiKey, aiProvider, aiModel]);

  // Load user settings from DynamoDB on login
  useEffect(() => {
    if (user?.id && isCredentialsReady) {
      // Try to load settings from DynamoDB
      dynamoDBService.getUserSettings(String(user.id))
        .then(result => {
          if (result.success && result.settings) {
            // Merge with localStorage settings (DynamoDB takes precedence)
            setDrillSettings(prev => ({
              ...prev,
              ...result.settings
            }));
            
            // Restore API keys and AI settings from DB
            if (result.settings.userApiKey) setUserApiKey(result.settings.userApiKey);
            if (result.settings.claudeApiKey) setClaudeApiKey(result.settings.claudeApiKey);
            if (result.settings.aiProvider) setAiProvider(result.settings.aiProvider);
            if (result.settings.aiModel) setAiModel(result.settings.aiModel);
          }
        })
        .catch(() => {
          // Silent fail - use localStorage settings
        });
    }
  }, [user?.id, isCredentialsReady]);

  // Re-filter questions when source filters change in drill mode
  useEffect(() => {
    if (view === 'drill' && originalQuestions.length > 0 && selectedSubject) {
      // Re-apply filters to ORIGINAL questions, not already filtered ones
      const filtered = originalQuestions.filter(q => {
        const isAi = Number(q.is_ai) === 1 || q.source === 'ai' || q.source === 'easa';
        if (isAi) return drillSettings.sourceFilters.includes('ai');
        return drillSettings.sourceFilters.includes('user');
      });

      if (filtered.length === 0) {
        // No questions match current filters - go back to selection
        alert('Žádné otázky neodpovídají aktuálním filtrům. Změňte filtry nebo vyberte jiný předmět.');
        setView('dashboard');
        return;
      }

      // Update questions with filtered results
      setQuestions(filtered);
      setCurrentQuestionIndex(0); // Reset to first question
      setAnswered(null); // Clear answer
      setShowExplanation(false); // Hide explanation
    }
  }, [drillSettings.sourceFilters, view, originalQuestions.length, selectedSubject]);

  // Static data loading for GitHub Pages deployment
  const loadStaticSubjects = async () => {
    const subjectDefs = [
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

    // First set with 0 counts so UI loads immediately
    const staticSubjects: Subject[] = subjectDefs.map(s => ({
      ...s, question_count: 0, success_rate: 0.75
    }));
    setSubjects(staticSubjects);
    if (staticSubjects.length > 0 && !importSubjectId) {
      setImportSubjectId(staticSubjects[0].id);
    }

    // Then fetch real counts from DynamoDB async (single scan with source breakdown)
    try {
      const result = await dynamoDBService.getAllQuestionCounts();
      if (result.success && result.data) {
        const { total, user, ai } = result.data!;
        const withCounts: Subject[] = subjectDefs.map(s => ({
          ...s,
          question_count: total[s.id] || 0,
          user_count: user[s.id] || 0,
          ai_count: ai[s.id] || 0,
          success_rate: 0.75
        }));
        setSubjects(withCounts);
      }
    } catch (err) {
      // Silent fail - keep default counts
    }
  };

  const loadStaticQuestions = async (subjectId: number) => {
    try {
      // Try DynamoDB first
      const result = await dynamoDBService.getQuestionsBySubject(subjectId);
      if (result.success && result.data && result.data.length > 0) {
                const questions: Question[] = result.data.map((q: any) => ({
          id: q.originalId || q.questionId,
          subject_id: q.subjectId,
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
          correct_option: q.correctOption || ['A', 'B', 'C', 'D'][q.correct] || 'A',
          explanation: q.explanation || '',
          explanation_cz: q.explanation_cz || undefined,
          lo_id: q.loId || q.lo_id || undefined,
          is_ai: q.source === 'ai' ? 1 : 0,
          source: q.source || 'user',
          difficulty: q.difficulty || 1,
          image: null,
          correct_count: null,
          incorrect_count: null,
          is_flagged: false,
          last_practiced: null,
          created_at: q.createdAt || new Date().toISOString(),
          updated_at: q.createdAt || new Date().toISOString()
        }));
        return questions;
      }
    } catch (err) {
      // DynamoDB loading failed, fallback to JSON
    }

    // Fallback: load from JSON file
    try {
      const response = await fetch(`/subject_${subjectId}.json`);
      if (!response.ok) throw new Error('Failed to load questions');
      const jsonQuestions = await response.json();
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
        is_ai: 1,
        source: 'ai',
        difficulty: q.difficulty || 1,
        image: null,
        correct_count: null,
        incorrect_count: null,
        is_flagged: false,
        last_practiced: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));
      return questions;
    } catch (error) {
      return [];
    }
  };

  const loadStaticStats = () => {
    // Load persisted user stats from localStorage as initial values
    const savedStats = localStorage.getItem(`${user?.id || 'guest'}:user_stats`);
    if (savedStats) {
      try {
        setStats(JSON.parse(savedStats));
      } catch {}
    }
  };

  const fetchSubjects = async () => {
    // Reload counts from DynamoDB (don't use localStorage - it has stale counts)
    await loadStaticSubjects();
  };

  const fetchStats = async () => {
    try {
      if (isGuestMode) {
        const guestStats = loadGuestStats();
        if (guestStats) {
          // Guest has localStorage data, use it but also get DB counts for breakdown
          const countsResult = await dynamoDBService.getAllQuestionCounts();
          if (countsResult.success && countsResult.data) {
            const { total, user: userQuestions, ai } = countsResult.data;
            const totalQ = Object.values(total).reduce((a, b) => a + b, 0);
            const userQ = Object.values(userQuestions).reduce((a, b) => a + b, 0);
            const aiQ = Object.values(ai).reduce((a, b) => a + b, 0);
            
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
            setStats(guestStats);
          }
        } else {
          // First-time guest: load DB data as fallback
          const countsResult = await dynamoDBService.getAllQuestionCounts();
          if (countsResult.success && countsResult.data) {
            const { total, user: userQuestions, ai } = countsResult.data;
            const totalQ = Object.values(total).reduce((a, b) => a + b, 0);
            const userQ = Object.values(userQuestions).reduce((a, b) => a + b, 0);
            const aiQ = Object.values(ai).reduce((a, b) => a + b, 0);
            
            setStats({
              totalQuestions: totalQ,
              userQuestions: userQ,
              aiQuestions: aiQ,
              practicedQuestions: 0,
              overallSuccess: 0,
              subjectStats: []
            });
          }
        }
      } else {
        // Fetch question counts with source breakdown
        const countsResult = await dynamoDBService.getAllQuestionCounts();
        if (countsResult.success && countsResult.data) {
          const { total, user: userQuestions, ai } = countsResult.data;
          const totalQ = Object.values(total).reduce((a, b) => a + b, 0);
          const userQ = Object.values(userQuestions).reduce((a, b) => a + b, 0);
          const aiQ = Object.values(ai).reduce((a, b) => a + b, 0);

          const savedStats = localStorage.getItem(`${user?.id || 'guest'}:user_stats`);
          const baseStats = savedStats ? JSON.parse(savedStats) : {};
          setStats({
            ...baseStats,
            totalQuestions: totalQ,
            userQuestions: userQ,
            aiQuestions: aiQ,
            practicedQuestions: baseStats.practicedQuestions || 0,
            overallSuccess: baseStats.overallSuccess || 0,
            subjectStats: baseStats.subjectStats || []
          });
        } else {
          const savedStats = localStorage.getItem(`${user?.id || 'guest'}:user_stats`);
          if (savedStats) setStats(JSON.parse(savedStats));
        }
      }
    } catch (err) {}
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

  const startDrill = async (subject: Subject) => {
    try {
      setSelectedSubject(subject);
      // Save selected subject to localStorage for guest mode persistence
      if (isGuestMode) {
        localStorage.setItem(`${user?.id || 'guest'}:selectedSubject`, JSON.stringify(subject));
      }
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

      // Store original questions for dynamic filtering
      setOriginalQuestions(data);
      setQuestions(processedQuestions);
      setCurrentQuestionIndex(0);
      setAnswered(null);
      setShowExplanation(false);
      language.resetTranslation(); // Reset translation when starting new drill
      setView('drill');
    } catch (err) {
      alert('Nepodařilo se načíst otázky.');
    }
  };

  const startMix = async () => {
    try {
      setSelectedSubject({ id: 0, name: 'MIX - Náhodné otázky', question_count: 0, success_rate: 0 });

      // Load from all subjects via DynamoDB
      let allQuestions: Question[] = [];
      for (const subject of subjects) {
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

      // Apply source filters
      const filtered = allQuestions.filter(q => {
        const isAi = Number(q.is_ai) === 1 || q.source === 'ai';
        if (isAi) return drillSettings.sourceFilters.includes('ai');
        return drillSettings.sourceFilters.includes('user');
      });

      if (filtered.length === 0) {
        alert(`Všech ${allQuestions.length} otázek bylo odfiltrováno. Zkontrolujte nastavení zdrojů.`);
        return;
      }

      // Shuffle
      const shuffled = LearningEngine.shuffle(filtered);

      // Store original questions for dynamic filtering
      setOriginalQuestions(allQuestions);
      setSelectedSubject(prev => prev ? { ...prev, question_count: shuffled.length } : prev);
      setQuestions(shuffled);
      setCurrentQuestionIndex(0);
      setAnswered(null);
      setShowExplanation(false);
      language.resetTranslation(); // Reset translation when starting MIX
      setView('drill');
    } catch (err) {
      alert('Nepodařilo se načíst otázky pro MIX.');
    }
  };

  const startErrors = async () => {
    if (isGuestMode) {
      showAuthPrompt('errors');
      return;
    }
    
    try {
      // Get incorrectly answered question IDs from user-specific answers
      const allAnswers = JSON.parse(localStorage.getItem(`${user?.id || 'guest'}:answers`) || '{}');
      const incorrectIds = new Set(
        Object.entries(allAnswers)
          .filter(([_, a]: [string, any]) => !a.isCorrect)
          .map(([id]) => Number(id))
      );

      if (incorrectIds.size === 0) {
        alert('Nemáte žádné chyby k procvičení.');
        return;
      }

      // Load all questions from DynamoDB across all subjects
      let allQuestions: Question[] = [];
      for (const subject of subjects) {
        const qs = await loadStaticQuestions(subject.id);
        allQuestions.push(...qs);
      }

      // Filter to only incorrectly answered questions
      const errorQuestions = allQuestions.filter(q => incorrectIds.has(Number(q.id)));

      if (errorQuestions.length === 0) {
        alert('Nemáte žádné chyby k procvičení.');
        return;
      }

      setSelectedSubject({ id: -1, name: 'Procvičit chyby', question_count: errorQuestions.length, success_rate: 0 });
      setQuestions(errorQuestions);
      setCurrentQuestionIndex(0);
      setAnswered(null);
      setShowExplanation(false);
      language.resetTranslation(); // Reset translation when starting errors practice
      setView('drill');
    } catch (err) {
      alert('Nepodařilo se načíst chyby.');
    }
  };

  const startFlagged = async () => {
    if (isGuestMode) {
      showAuthPrompt('stats');
      return;
    }
    
    try {
      // Get flagged question IDs from localStorage
      const flags = JSON.parse(localStorage.getItem('question_flags') || '{}');
      const flaggedIds = new Set(
        Object.entries(flags)
          .filter(([_, isFlagged]: [string, boolean]) => isFlagged)
          .map(([id]) => Number(id))
      );

      if (flaggedIds.size === 0) {
        alert('Nemáte žádné označené otázky k procvičení.');
        return;
      }

      // Load all questions from DynamoDB across all subjects
      let allQuestions: Question[] = [];
      for (const subject of subjects) {
        const qs = await loadStaticQuestions(subject.id);
        allQuestions.push(...qs);
      }

      // Filter to only flagged questions
      const flaggedQuestions = allQuestions.filter(q => flaggedIds.has(Number(q.id)));

      if (flaggedQuestions.length === 0) {
        alert('Nemáte žádné označené otázky k procvičení.');
        return;
      }

      setSelectedSubject({ id: -2, name: 'Označené otázky', question_count: flaggedQuestions.length, success_rate: 0 });
      setQuestions(flaggedQuestions);
      setCurrentQuestionIndex(0);
      setAnswered(null);
      setShowExplanation(false);
      setView('drill');
    } catch (error) {
      alert('Nepodařilo se načíst označené otázky.');
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

  const handleAnswer = async (option: string) => {
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;

    if (view === 'drill') {
      if (answered) return;
      
      let isCorrect: boolean;
      
      // Use shuffle logic if shuffle is active
      if (drillSettings.shuffleAnswers && shuffledQuestion) {
        const userAnswerIndex = ['A', 'B', 'C', 'D'].indexOf(option);
        isCorrect = checkAnswer(shuffledQuestion, userAnswerIndex);
      } else {
        isCorrect = option === currentQuestion.correct_option;
      }
      
      setAnswered(option);
      
      // Save answer to localStorage + DynamoDB
      try {
        saveAnswerToLocalStorage(currentQuestion.id, isCorrect, currentQuestion.subject_id);
        updateUserStats(isCorrect);
        // Sync to DynamoDB only for authenticated users (not guests)
        if (user?.id) {
          dynamoDBService.saveUserProgress(String(user.id), String(currentQuestion.id), isCorrect).catch(() => {});
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
      setCurrentQuestionIndex(nextIdx);
      
      // Check if already answered in exam mode
      if (view === 'exam') {
        const nextQ = questions[nextIdx];
        if (nextQ && examAnswers[nextQ.id]) {
          setAnswered(examAnswers[nextQ.id]);
        } else {
          setAnswered(null);
        }
      } else {
        setAnswered(null);
      }
      
      setShowExplanation(false);
      setAiExplanation(null);
      setAiDetectedObjective(null);
      setDetailedExplanation(null);
      language.resetTranslation(); // Reset translation when changing question
    } else if (view === 'exam') {
      finishExam();
    } else {
      setView('dashboard');
    }
  };

  const handleFetchAiExplanation = async () => {
    const q = questions[currentQuestionIndex];
    if (!q) return;

    const currentApiKey = aiProvider === 'gemini' ? userApiKey : claudeApiKey;
    if (!currentApiKey) {
      const key = prompt(`⚠️ Pro použití AI je nutný API klíč
Vložte Gemini nebo Claude API klíč (aktuálně vybráno: ${aiProvider === 'gemini' ? 'Gemini' : 'Claude'}).

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
        } else if (key.startsWith('sk-ant-')) {
          // Claude klíč
          setClaudeApiKey(key);
          if (aiProvider !== 'claude') {
            setAiProvider('claude');
                      }
        } else {
          // Neznámý formát - uložit podle aktuálního provideru
          if (aiProvider === 'gemini') {
            setUserApiKey(key);
          } else {
            setClaudeApiKey(key);
          }
                  }
      } else {
        return;
      }
    }
    
    setIsGeneratingAiExplanation(true);
    try {
      // For guest mode, show login prompt for advanced AI features
      if (isGuestMode && !userApiKey && !claudeApiKey) {
        showAuthPrompt('ai');
        setIsGeneratingAiExplanation(false);
        return;
      }
      
      // Check DynamoDB cache first
      try {
        const cacheKey = `${q.subject_id}_${q.id}`;
        const cached = await dynamoDBService.getCachedExplanation(cacheKey, aiModel);
        if (cached.success && cached.data?.explanation) {
          setAiExplanation(cached.data.explanation);
          setDetailedExplanation(cached.data.detailedExplanation || null);
          setShowExplanation(true);
          setIsGeneratingAiExplanation(false);
          return;
        }
      } catch (error) {}
      
      // Check localStorage as fallback
      const localStorageKey = `ai_explanation_${q.subject_id}_${q.id}_${aiProvider}_${aiModel}`;
      const localStorageData = localStorage.getItem(localStorageKey);
      if (localStorageData) {
        try {
          const parsed = JSON.parse(localStorageData);
          if (parsed.explanation) {
            setAiExplanation(parsed.explanation);
            setDetailedExplanation(parsed.detailedExplanation || null);
            setShowExplanation(true);
            setIsGeneratingAiExplanation(false);
            // Backfill to DynamoDB if found only in localStorage
            const cacheKey = `${q.subject_id}_${q.id}`;
            dynamoDBService.saveExplanationWithObjective(
              cacheKey, 
              parsed.explanation, 
              parsed.detailedExplanation || null, 
              null, // No objective in localStorage data
              aiProvider as 'gemini' | 'claude', 
              aiModel
            ).catch(() => {});
            return;
          }
        } catch (error) {}
      }
      
      // Check question data cache
      if (q.ai_explanation && q.ai_explanation_provider === aiProvider) {
        setAiExplanation(q.ai_explanation);
        setDetailedExplanation(q.ai_detailed_explanation || null);
        setShowExplanation(true);
        setIsGeneratingAiExplanation(false);
        return;
      }
      
      const lo = allLOs.find(l => l.id === q.lo_id);
      
      const result = await getDetailedExplanation(q, lo, aiProvider === 'gemini' ? userApiKey : claudeApiKey, aiModel, aiProvider);
      
      
      // Save objective if detected
      if (result.objective) {
        // Always save to DynamoDB
        dynamoDBService.saveObjective(String(q.id), result.objective).catch(() => {});
        
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
      setShowExplanation(true);
      
      // Save AI explanation to DynamoDB
      try {
        const cacheKey = `${q.subject_id}_${q.id}`;
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
          dynamoDBService.updateQuestionLO(q.questionId || q.id, result.objective).catch(() => {});
        }
      } catch (error) {
        // Silent fail - localStorage fallback below
      }
      
      // Always save to localStorage as fallback
      try {
        const localStorageKey = `ai_explanation_${q.subject_id}_${q.id}_${aiProvider}_${aiModel}`;
        const explanationData = {
          questionId: q.id,
          explanation: result.explanation,
          detailedExplanation: null,
          provider: aiProvider,
          model: aiModel,
          createdAt: new Date().toISOString()
        };
        localStorage.setItem(localStorageKey, JSON.stringify(explanationData));
        
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
        // Failed to save AI explanation to localStorage
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

    setIsRegeneratingExplanation(true);
    try {
      // For guest mode, show login prompt for advanced AI features
      if (isGuestMode && !userApiKey && !claudeApiKey) {
        showAuthPrompt('ai');
        setIsRegeneratingExplanation(false);
        return;
      }

      const currentApiKey = aiProvider === 'gemini' ? userApiKey : claudeApiKey;
      if (!currentApiKey) {
        const key = prompt(`⚠️ Pro použití AI je nutný API klíč
Vložte Gemini nebo Claude API klíč (aktuálně vybráno: ${aiProvider === 'gemini' ? 'Gemini' : 'Claude'}).
Klíč bude uložen pouze ve vašem prohlížeči.`);
        if (key) {
          if (aiProvider === 'gemini') {
            setUserApiKey(key);
          } else {
            setClaudeApiKey(key);
          }
        } else {
          setIsRegeneratingExplanation(false);
          return;
        }
      }

      // Cancel any existing AI operations
      AICancellationManager.cancelAllOperations();

      const lo = allLOs.find(l => l.id === q.lo_id);
      const controller = AICancellationManager.createController('regenerate');
      
      const explanation = await getDetailedExplanation(
        q, 
        lo, 
        aiProvider === 'gemini' ? userApiKey : claudeApiKey, 
        aiModel, 
        aiProvider,
        controller.signal
      );
      
      setAiExplanation(explanation.explanation);
      setAiDetectedObjective(explanation.objective || null);
      
      // Clear detailed explanation when regenerating
      setDetailedExplanation(null);
      
      // Save to cache
      const cacheKey = `${q.subject_id}_${q.id}`;
      dynamoDBService.saveExplanationWithObjective(
        cacheKey, 
        explanation.explanation, 
        null, 
        explanation.objective || null, 
        aiProvider as 'gemini' | 'claude', 
        aiModel
      ).catch(() => {});
      
      // Also save the LO directly to the question if it's an AI-generated question
      if (q.source === 'ai' && explanation.objective) {
        dynamoDBService.updateQuestionLO(q.questionId || q.id, explanation.objective).catch(() => {});
      }
      
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
    const q = questions[currentQuestionIndex];
    if (!q) return;

    const currentApiKey = aiProvider === 'gemini' ? userApiKey : claudeApiKey;
    if (!currentApiKey) {
      const key = prompt(`⚠️ Pro použití AI je nutný API klíč
Vložte Gemini nebo Claude API klíč (aktuálně vybráno: ${aiProvider === 'gemini' ? 'Gemini' : 'Claude'}).

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
        } else if (key.startsWith('sk-ant-')) {
          // Claude klíč
          setClaudeApiKey(key);
          if (aiProvider !== 'claude') {
            setAiProvider('claude');
                      }
        } else {
          // Neznámý formát - uložit podle aktuálního provideru
          if (aiProvider === 'gemini') {
            setUserApiKey(key);
          } else {
            setClaudeApiKey(key);
          }
                  }
      } else {
        return;
      }
    }
    
    setIsGeneratingDetailedExplanation(true);
    try {
      
      const lo = allLOs.find(l => l.id === q.lo_id);
      
      // Check if we already have detailed explanation in database
      if (q.ai_detailed_explanation) {
        setDetailedExplanation(q.ai_detailed_explanation);
        return;
      }
      
      const detailedExplanationResult = await getDetailedHumanExplanation(q, lo, currentApiKey, aiModel, aiProvider);
      
      setDetailedExplanation(detailedExplanationResult);
      
      // Save detailed explanation to localStorage
      try {
        // For static deployment, save detailed explanation to localStorage
        const explanations = JSON.parse(localStorage.getItem('ai_explanations') || '{}');
        const explanationKey = `${q.subject_id}_${q.id}`;
        explanations[explanationKey] = {
          questionId: q.id,
          explanation: q.ai_explanation || aiExplanation || '',
          detailedExplanation: detailedExplanationResult,
          provider: aiProvider,
          model: aiModel,
          createdAt: new Date().toISOString()
        };
        localStorage.setItem('ai_explanations', JSON.stringify(explanations));
        // Update local state
        setQuestions(prev => prev.map(question => 
          question.id === q.id ? { 
            ...question, 
            ai_detailed_explanation: detailedExplanationResult
          } : question
        ));
      } catch (error) {
        // Failed to save detailed explanation
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

  const toggleFlag = async (questionId: number, currentFlag: boolean) => {
    const newFlag = !currentFlag;
    try {
      const flags = JSON.parse(localStorage.getItem('question_flags') || '{}');
      flags[questionId] = newFlag;
      localStorage.setItem('question_flags', JSON.stringify(flags));
      // Sync to DynamoDB
      dynamoDBService.toggleQuestionFlag(String(questionId), newFlag).catch(() => {});
    } catch (error) {
      // Silent fail
    }
    setQuestions(prev => prev.map(q => q.id === questionId ? { ...q, is_flagged: newFlag } : q));
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
        allQuestions.flat().map(q => q.lo_id).filter(Boolean) as string[]
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
      const covered = new Set(data.map(q => q.lo_id).filter(Boolean).map(id => id?.trim()) as string[]);
      setCoveredLOs(covered);
      
      // Calculate actual covered LOs like AI generator
      const allSubjectLOs = allLOs.filter(lo => lo.subject_id === subjectId);
      const losWithQuestions = new Set(data.map(q => q.lo_id).filter(Boolean));
      
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
      console.log('🔍 Duplicate Report:', report);
    } catch (error) {
      console.error('Error checking duplicates:', error);
    } finally {
      setIsCheckingDuplicates(false);
    }
  };

  const handleGenerateLOs = async () => {
    if (!importSubjectId) return;
    
    setIsGeneratingLOs(true);
    setGeneratedLOs([]);
    
    try {
      // Get existing LOs for the subject
      const existingLOs = allLOs.filter(lo => lo.subject_id === importSubjectId);
      
      // Get API key (same logic as other generators - direct localStorage read)
      const uid = user?.id || 'guest';
      let effectiveApiKey = localStorage.getItem(`${uid}:userApiKey`) || localStorage.getItem(`${uid}:claudeApiKey`) || userApiKey || claudeApiKey;
      
      // Check if user is logged in and has API keys in DB
      if (userMode === 'logged-in' && user) {
        // For logged-in users, API keys should be in DB/state
        if (!effectiveApiKey) {
          // Try to load from DB if not in state
          try {
            const userSettingsResult = await dynamoDBService.getUserSettings(user.id);
            if (userSettingsResult.success && userSettingsResult.settings) {
              const settings = userSettingsResult.settings;
              const dbApiKey = settings.userApiKey || settings.claudeApiKey;
              if (dbApiKey) {
                effectiveApiKey = dbApiKey;
                // Update state with DB key
                if (settings.userApiKey) setUserApiKey(settings.userApiKey);
                if (settings.claudeApiKey) setClaudeApiKey(settings.claudeApiKey);
              }
            }
          } catch (err) {
            console.error('Failed to load API keys from DB:', err);
          }
        }
      }
      
      // Only prompt for API key if user is guest or still no key found
      if (!effectiveApiKey && userMode === 'guest') {
        const key = prompt(`Pro generování Learning Objectives je vyžadován API klíč. Chcete jej vložit nyní?`);
        if (key) {
          if (aiProvider === 'gemini') {
            setUserApiKey(key);
            effectiveApiKey = key;
          } else {
            setClaudeApiKey(key);
            effectiveApiKey = key;
          }
        } else {
          // Stop generation if no API key provided (LOs require API key)
          alert('Generování LOs vyžaduje API klíč. Zadejte ho prosím v nastavení.');
          setIsGeneratingLOs(false);
          return;
        }
      }
      
      // If still no API key for logged-in user, show error (shouldn't happen with proper DB sync)
      if (!effectiveApiKey && userMode === 'logged-in') {
        alert('API klíč nenalezen v databázi. Přihlaste se znovu nebo kontaktujte administrátora.');
        setIsGeneratingLOs(false);
        return;
      }

      // Prepare additional context for AI
      let additionalContext = '';
      if (useAircademySyllabus) {
        additionalContext += '\nUSING AIRCADEMY SYLLABUS: Reference detailed explanations from Aircademy ECQB-PPL syllabus.\n';
      }
      if (additionalDocumentLinks.length > 0) {
        additionalContext += `\nADDITIONAL DOCUMENTS: Analyze these resources for insights:\n${additionalDocumentLinks.join('\n')}\n`;
      }
      
      const result = await generateMissingLearningObjectives(
        existingLOs,
        importSubjectId,
        loLicenseType,
        effectiveApiKey,
        aiModel,
        aiProvider,
        undefined, // signal
        useAircademySyllabus,
        additionalDocumentLinks
      );
      
      if (result.success) {
        setGeneratedLOs(result.los);
        console.log('🎯 Generated LOs:', result.los);
      } else {
        console.error('Error generating LOs:', result.error);
        alert(`Chyba při generování LOs: ${result.error}`);
      }
    } catch (error) {
      console.error('Error generating LOs:', error);
      alert('Chyba při generování Learning Objectives');
    } finally {
      setIsGeneratingLOs(false);
    }
  };

  const handleSaveGeneratedLOs = async () => {
    if (userRole !== 'admin') {
      alert('Nemáte dostatečné oprávnění. Tuto akci může provést pouze administrátor.');
      return;
    }
    if (generatedLOs.length === 0) return;
    
    try {
      // Check for duplicates before saving
      const existingLOs = allLOs.filter(lo => lo.subject_id === importSubjectId);
      const existingIds = new Set(existingLOs.map(lo => lo.id));
      
      // Filter out any duplicates
      const uniqueNewLOs = generatedLOs.filter(lo => !existingIds.has(lo.id));
      
      if (uniqueNewLOs.length === 0) {
        alert('Všechny vygenerované LOs již existují v databázi.');
        setGeneratedLOs([]);
        return;
      }
      
      console.log('💾 Saving LOs to DynamoDB:', uniqueNewLOs);
      
      // Save each LO to DynamoDB
      let successCount = 0;
      let failCount = 0;
      
      for (const lo of uniqueNewLOs) {
        try {
          const result = await dynamoDBService.saveLO({
            losid: lo.id,
            loId: lo.id, // Add loId for EasaObjective table
            text: lo.text,
            context: lo.context,
            subject_id: lo.subject_id,
            subjectId: lo.subject_id, // Add subjectId for EasaObjective
            applies_to: lo.applies_to,
            source: 'ai-generated'
          });
          
          if (result.success) {
            successCount++;
          } else {
            failCount++;
            console.error('Failed to save LO:', lo.id, result.error);
          }
        } catch (error) {
          failCount++;
          console.error('Error saving LO:', lo.id, error);
        }
      }
      
      // Update allLOs state
      const updatedLOs = [...allLOs, ...uniqueNewLOs];
      // Note: In a real implementation, you'd update the actual allLOs state
      // For now, we'll trigger a refresh of LOs from DB
      
      // Refresh LOs from database to get the updated state
      try {
        const freshLOs = await getAllLOs();
        if (freshLOs.length > 0) setAllLOs(freshLOs);
      } catch (error) {
        console.warn('Failed to refresh LOs from DB:', error);
      }
      
      // Refresh coverage calculations
      if (importSubjectId) {
        await fetchCoverage(importSubjectId);
      }
      
      // Show success message
      const message = successCount > 0 
        ? `✅ Úspěšně uloženo ${successCount} nových Learning Objectives!${failCount > 0 ? ` (${failCount} selhalo)` : ''}\n\nCelkem pro subject ${importSubjectId}: ${updatedLOs.filter(lo => lo.subject_id === importSubjectId).length} LOs`
        : `❌ Nepodařilo se uložit žádné LOs (${failCount} chyb)`;
      
      alert(message);
      
      // Clear generated LOs
      setGeneratedLOs([]);
      
      console.log('📊 Save summary:', {
        total: uniqueNewLOs.length,
        success: successCount,
        failed: failCount,
        updatedTotal: updatedLOs.filter(lo => lo.subject_id === importSubjectId).length
      });
      
    } catch (error) {
      console.error('Error saving LOs:', error);
      alert('Chyba při ukládání Learning Objectives');
    }
  };

  const openSyllabusAtLO = (loId: string | null | undefined) => {
    if (loId) {
      setFocusedLOId(loId);
      setSyllabusSelectedLO(loId);
      // Auto-expand the path to this LO
      const parts = loId.split('.');
      const lo = allLOs.find(l => l.id === loId);
      if (lo?.subject_id) {
        setSyllabusExpandedSubjects(prev => new Set([...prev, lo.subject_id!]));
      }
      if (parts.length >= 2) setSyllabusExpandedTopics(prev => new Set([...prev, parts.slice(0,2).join('.')]));
      if (parts.length >= 3) setSyllabusExpandedSubtopics(prev => new Set([...prev, parts.slice(0,3).join('.')]));
    }
    setSyllabusOpen(true);
  };

  const startDrillForLO = (loId: string) => {
    setSyllabusOpen(false);
    const loQuestions = questions.filter(q => q.lo_id === loId);
    if (loQuestions.length === 0) {
      alert(`Žádné otázky pro téma ${loId}. Nejprve vygenerujte otázky v AI modulu.`);
      return;
    }
    setQuestions(loQuestions);
    setCurrentQuestionIndex(0);
    setAnswered(null);
    setShowExplanation(false);
    language.resetTranslation(); // Reset translation when opening from syllabus
    setView('drill');
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
    let effectiveApiKey = aiProvider === 'gemini' ? userApiKey : claudeApiKey;
    
    if (!effectiveApiKey) {
      const key = prompt(`⚠️ Pro použití AI je nutný API klíč
Vložte Gemini nebo Claude API klíč (aktuálně vybráno: ${aiProvider === 'gemini' ? 'Gemini' : 'Claude'}).

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
        } else {
          // Neznámý formát - uložit podle aktuálního provideru
          if (aiProvider === 'gemini') {
            setUserApiKey(key);
          } else {
            setClaudeApiKey(key);
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
      console.log('🔍 Debug - LOs analysis:', {
        subjectId: importSubjectId,
        totalLOs: allSubjectLOs.length,
        loIds: allSubjectLOs.slice(0, 5).map(lo => ({ id: lo.id, title: lo.title })),
        questionsCount: existingQuestions.length,
        questionLoIds: existingQuestions.slice(0, 5).map(q => ({ lo_id: q.lo_id, question: q.text.substring(0, 50) })),
        losWithQuestions: Array.from(losWithQuestions).slice(0, 5),
        uniqueLosWithQuestionsCount: uniqueLosWithQuestions.size
      });
      
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

      console.log(`🎯 Selected ${targets.length} LOs for generation:`, targets.map(t => t.id));
      
      // Process in chunks of 5 LOs to avoid hitting output token limits
      const CHUNK_SIZE = 5;
      const allResults: {loId: string, questions: Partial<Question>[]}[] = [];
      
      for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
        const chunk = targets.slice(i, i + CHUNK_SIZE);
        const chunkResults = await generateBatchQuestions(chunk, questionsPerLO, language.generateLanguage, effectiveApiKey, aiModel, aiProvider, selectedLicense);
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
      await Promise.all([fetchSubjects(), fetchStats(), fetchCoverage(importSubjectId)]);
    } catch (error: any) {
      setImportStatus({ type: 'error', message: `❌ Uložení selhalo: ${error.message}` });
    }
  };

  const handleResetProgress = async () => {
    if (!confirm('Opravdu chcete smazat veškerý váš postup a historii testů? Tato akce je nevratná.')) return;
    
    try {
      // For static deployment, clear progress from localStorage (user-specific)
      const uid = user?.id || 'guest';
      localStorage.removeItem(`${uid}:user_progress`);
      localStorage.removeItem(`${uid}:user_stats`);
      localStorage.removeItem(`${uid}:answers`);
      localStorage.removeItem(`${uid}:guest_stats`);
      localStorage.removeItem(`${uid}:session_start`);
      // Clear API keys for current user only
      localStorage.removeItem(`${uid}:userApiKey`);
      localStorage.removeItem(`${uid}:claudeApiKey`);
      setUserApiKey('');
      setClaudeApiKey('');
      setKeyStatus('idle');

      // Reset stats to default
      setStats({
        totalAnswers: 0,
        correctAnswers: 0,
        overallSuccess: 0.75,
        userQuestions: 0,
        aiQuestions: 1000,
        practicedQuestions: 0,
        totalQuestions: 1000
      });
      
      alert('Váš postup byl úspěšně smazán.');
    } catch (err) {
      alert('Nepodařilo se spustit simulaci zkoušky.');
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
        await Promise.all([fetchSubjects(), fetchStats()]);
      } catch (error: any) {
        setImportStatus({ type: 'error', message: `❌ Uložení selhalo: ${error.message}` });
      }
    } catch (err) {
      setImportStatus({ type: 'error', message: 'Neplatný formát JSON.' });
    }
  };

  
  return (
    <div className="min-h-screen transition-colors duration-300">
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
            onClose={() => {}}
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
              className="hidden sm:flex items-center h-10 px-3 text-gray-600 dark:text-gray-300 rounded-full min-w-0 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <User size={12} className="opacity-50 flex-shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-widest truncate ml-1">Guest</span>
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
              onClick={startExam}
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
              className="hidden sm:flex items-center h-10 px-3 text-gray-600 dark:text-gray-300 rounded-full min-w-0 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
            >
              <User size={12} className="opacity-50 flex-shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-widest truncate ml-1">Guest</span>
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
                      className="w-full flex items-center gap-3 p-3 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      <User size={18} />
                      <span className="font-semibold">Guest - Přihlásit se</span>
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
                      startExam();
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

      <main className="max-w-7xl mx-auto p-6">
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
                  <p className="text-sm sm:text-lg md:text-4xl font-mono font-bold">
                    {(() => {
                      if (isGuestMode) {
                        // Guest: Use localStorage data, fallback to DB data
                        const guestStats = loadGuestStats();
                        if (guestStats && guestStats.totalAnswers > 0) {
                          return guestStats.totalAnswers;
                        } else {
                          // Fallback to DB data for first-time guests
                          return stats ? (stats.totalQuestions || 0) : 0;
                        }
                      } else {
                        // User: Use existing logic
                        return stats ? (stats.totalQuestions || 0) : 0;
                      }
                    })()}
                    {(() => {
                      if (!isGuestMode && stats) {
                        return (
                          <span className="text-sm sm:text-base md:text-lg opacity-60 ml-2">
                            {stats.userQuestions || 0}/{stats.aiQuestions || 0}
                          </span>
                        );
                      } else if (isGuestMode && stats) {
                        // Guest: Show DB breakdown if available
                        return (
                          <span className="text-sm sm:text-base md:text-lg opacity-60 ml-2">
                            {stats.userQuestions || 0}/{stats.aiQuestions || 0}
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </p>
                  <p className="text-[8px] sm:text-[10px] md:text-sm opacity-50">
                    {stats ? `otázek • uživatel/EASA` : 'otázek'}
                  </p>
                </div>
                <div className="p-1 sm:p-2 md:p-6 border border-[var(--line)] rounded sm:rounded-lg md:rounded-2xl space-y-0 sm:space-y-0.5 md:space-y-2">
                  <p className="col-header text-[8px] sm:text-[10px] md:text-sm">
                    Procvičeno otázek
                  </p>
                  <p className="text-sm sm:text-lg md:text-4xl font-mono font-bold">
                    {(() => {
                      if (isGuestMode) {
                        // Guest: Use localStorage data, fallback to DB data (0 for first-time)
                        const guestStats = loadGuestStats();
                        if (guestStats && guestStats.totalAnswers > 0) {
                          const practiced = guestStats.totalAnswers;
                          const total = stats ? (stats.totalQuestions || 0) : 0;
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
                        const practiced = stats ? (stats.practicedQuestions || 0) : 0;
                        const total = stats ? (stats.totalQuestions || 0) : 0;
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
                <div className="p-1 sm:p-2 md:p-6 border border-[var(--line)] rounded sm:rounded-lg md:rounded-2xl space-y-0 sm:space-y-0.5 md:space-y-2">
                  <p className="col-header text-[8px] sm:text-[10px] md:text-sm">
                    Aktuální licence
                  </p>
                  <p className="text-sm sm:text-lg md:text-4xl font-mono font-bold">
                    {(() => {
                      // Both User and Guest show the same license buttons
                      return (
                        <span className="flex gap-0.5 sm:gap-1 md:gap-2">
                          {(['PPL', 'SPL'] as const).map(lic => (
                            <button
                              key={lic}
                              onClick={() => { setSelectedLicense(lic); localStorage.setItem('selectedLicense', lic); }}
                              className={`w-[3rem] sm:w-[3.5rem] md:w-[4rem] px-1 sm:px-1.5 md:px-3 py-1 rounded-full text-[6px] sm:text-[8px] font-bold transition-all ${selectedLicense === lic ? 'bg-gray-600 dark:bg-gray-700 text-white' : 'border border-gray-400 dark:border-gray-600 text-gray-600 dark:text-gray-400 opacity-50 hover:opacity-80'}`}
                            >
                              {lic === 'PPL' ? 'PPL(A)' : 'SPL'}
                            </button>
                          ))}
                        </span>
                      );
                    })()}
                  </p>
                  <p className="text-[8px] sm:text-[10px] md:text-sm opacity-50">
                    Licence
                  </p>
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
                    <div className="flex justify-end gap-4 sm:gap-8">
                      <div className="flex justify-center">OTÁZKY</div>
                      <div className="flex justify-center">Úspěšnost</div>
                    </div>
                    <div className="hidden sm:flex justify-end w-8 flex-shrink-0">Akce</div>
                  </div>

                  {subjects.map((s) => (
                    <div 
                      key={s.id} 
                      onClick={() => startDrill(s)}
                      className="group flex items-center py-3 px-4 border-b border-[var(--line)] hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                    >
                      <div className="hidden sm:flex justify-center w-8 flex-shrink-0">
                        <BookOpen size={16} className="opacity-40 group-hover:opacity-100" />
                      </div>

                      <div className="flex items-center min-w-0 flex-1">
                        <span className="font-medium text-sm group-hover:text-gray-900 dark:group-hover:text-gray-100">{s.description}</span>
                        <span className="hidden sm:inline text-xs opacity-50 ml-2 truncate group-hover:opacity-100 group-hover:text-gray-700 dark:group-hover:text-gray-300">{s.name}</span>
                      </div>

                      <div className="flex justify-end gap-4">
                        <div className="font-mono text-xs flex justify-center">
                          {(s.ai_count || 0) > 0 ? (
                            <span className="opacity-60 group-hover:opacity-100 group-hover:text-gray-700 dark:group-hover:text-gray-300">{s.user_count || 0}/{s.ai_count}</span>
                          ) : (
                            <span className="opacity-60 group-hover:opacity-100 group-hover:text-gray-700 dark:group-hover:text-gray-300">{s.question_count || 0}</span>
                          )}
                        </div>
                        <div className="font-mono text-sm flex justify-center min-w-[3rem] group-hover:text-gray-900 dark:group-hover:text-gray-100">{Math.round(s.success_rate * 100)}%</div>
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
                        {isGuestMode ? '0%' : (stats ? Math.round((1 - stats.overallSuccess) * 100) : 0)}% chyb
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
                          const flaggedCount = Object.values(flags).filter(Boolean).length;
                          return flaggedCount > 0 ? `${flaggedCount} ks` : '0 ks';
                        })()}
                      </div>
                      <div className="font-mono text-sm flex justify-center min-w-[3rem]">
                        {isGuestMode ? '0%' : (() => {
                          const flags = JSON.parse(localStorage.getItem('question_flags') || '{}');
                          const flaggedCount = Object.values(flags).filter(Boolean).length;
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
                        onChange={(e) => setDrillSettings(prev => ({ ...prev, sorting: e.target.value as any }))}
                        className="w-full p-3 bg-transparent border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--ink)]"
                      >
                        <option value="default">Výchozí (ID)</option>
                        <option value="random">Náhodné</option>
                        <option value="hardest_first">Nejtěžší nejdříve</option>
                        <option value="least_practiced">Nejméně procvičované</option>
                      </select>
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-4 border border-[var(--line)] rounded-2xl">
                      <div>
                        <p className="text-sm font-bold">Vyhodnocení odpovědi</p>
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

                    <div className="flex items-center justify-between p-4 border border-[var(--line)] rounded-2xl">
                      <div>
                        <p className="text-sm font-bold">Míchat odpovědi</p>
                        <p className="text-[10px] opacity-50">Náhodné pořadí odpovědí pro lepší učení</p>
                      </div>
                      <button 
                        onClick={() => setDrillSettings(prev => ({ ...prev, shuffleAnswers: !prev.shuffleAnswers }))}
                        className={`w-12 h-6 rounded-full transition-colors relative ${drillSettings.shuffleAnswers ? 'bg-[var(--ink)]' : 'bg-[var(--line)]'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${drillSettings.shuffleAnswers ? 'left-7' : 'left-1'}`} />
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* 2. AI Konfigurace (Klíče) */}
              <section className="space-y-6">
                <div className="flex items-center gap-2 px-2">
                  <Cpu size={20} className="opacity-50" />
                  <h3 className="font-bold uppercase tracking-widest text-sm">Konfigurace AI (API Klíče)</h3>
                </div>

                <div className="p-8 border border-[var(--line)] rounded-3xl space-y-6 bg-white/5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                      <label className="col-header">AI Model</label>
                      <select 
                        value={aiModel}
                        onChange={(e) => setAiModel(e.target.value)}
                        className="w-full p-3 bg-transparent border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--ink)]"
                      >
                        {aiProvider === 'gemini' ? (
                          <>
                            <option value="gemini-2.5-flash">Gemini 2.5 Flash (Doporučeno)</option>
                            <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash-Lite (Nejrychlejší)</option>
                            <option value="gemini-2.5-pro">Gemini 2.5 Pro (Pokročilý)</option>
                            <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Nejsilnější)</option>
                          </>
                        ) : (
                          <>
                            <option value="claude-sonnet-4-6">Claude 4.6 Sonnet (Nejlepší)</option>
                            <option value="claude-haiku-4-5-20251001">Claude 4.5 Haiku (Nejrychlejší)</option>
                            <option value="claude-opus-4-6">Claude 4.6 Opus (Nejsilnější)</option>
                          </>
                        )}
                      </select>
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
                        {subjects.map(s => (
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
                    <div className="flex items-center gap-3 ml-2">
                      {[
                        { id: 'user', icon: User, label: 'Uživatel' },
                        { id: 'ai', icon: Bot, label: 'AI Generováno' }
                      ].map(src => {
                        const isActive = drillSettings.sourceFilters.includes(src.id as any);
                        return (
                          <button 
                            key={src.id}
                            onClick={() => toggleSourceFilter(src.id as any)}
                            className={`transition-all duration-300 flex items-center gap-1 relative ${
                              isActive 
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
                </div>
                <div className="flex items-center gap-2">
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
                  <TranslatedText 
                    question={questions[currentQuestionIndex]} 
                    field="text"
                    language={language}
                    className="flex-1"
                  />
                </h3>

                <div className="grid gap-3">
                  {['A', 'B', 'C', 'D'].map((opt, index) => {
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
                        <div className="flex-1">
                          {drillSettings.shuffleAnswers && shuffledQuestion ? (
                            <span>{answerText}</span>
                          ) : (
                            <TranslatedOption 
                              question={questions[currentQuestionIndex]}
                              option={opt as 'A' | 'B' | 'C' | 'D'}
                              language={language}
                              className="flex-1"
                            />
                          )}
                        </div>
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
                                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (Doporučeno)</option>
                                  <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash-Lite (Rychlý)</option>
                                  <option value="gemini-2.5-pro">Gemini 2.5 Pro (Silný)</option>
                                </optgroup>
                                <optgroup label="Anthropic Claude">
                                  <option value="claude-sonnet-4-6">Claude 4.6 Sonnet (Nejlepší)</option>
                                  <option value="claude-haiku-4-5-20251001">Claude 4.5 Haiku (Rychlý)</option>
                                  <option value="claude-opus-4-6">Claude 4.6 Opus (Silný)</option>
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
                        <div 
                          className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl space-y-2 cursor-pointer transition-all duration-300 hover:bg-indigo-500/10"
                          onClick={() => {
                            const lo = allLOs.find(l => l.id === questions[currentQuestionIndex].lo_id);
                            setExpandedLOContent({
                              id: aiDetectedObjective || questions[currentQuestionIndex].lo_id || 'Importovaná otázka',
                              text: lo?.text || 'Obecné znalosti letectví.',
                              type: aiDetectedObjective ? 'AI detekovaný' : 'Oficiální EASA',
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
                              {aiDetectedObjective || questions[currentQuestionIndex].lo_id || 'Importovaná otázka'}
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
                            className="text-base opacity-80 leading-relaxed font-medium"
                            as="p"
                          />
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
                                
                                {/* Regenerate Button */}
                                <button 
                                  onClick={handleRegenerateExplanation}
                                  disabled={isRegeneratingExplanation || isGeneratingDetailedExplanation}
                                  className="flex items-center gap-2 text-orange-600 dark:text-orange-400 hover:opacity-80 transition-opacity"
                                  title="Vygenerovat nové vysvětlení"
                                >
                                  <div className="w-8 h-8 rounded-full bg-orange-600/10 flex items-center justify-center">
                                    {isRegeneratingExplanation ? <RotateCcw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                  </div>
                                  <span className="text-[10px] font-bold uppercase tracking-widest">Regenerovat</span>
                                </button>
                              </div>
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
                                <div 
                                  className="text-sm leading-relaxed opacity-90 prose prose-sm max-w-none"
                                  dangerouslySetInnerHTML={{ 
                                    __html: sanitizeHtml(markdownToHtml(detailedExplanation)) 
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
                <div className="p-3 border border-[var(--line)] rounded-xl bg-gradient-to-r from-gray-500/5 to-blue-500/5">
                  <div className="flex flex-col">
                    <p className="text-xs font-bold">Progres v {selectedSubject.name}</p>
                    <div className="flex items-center gap-3">
                      <div className="text-left">
                        <p className="text-lg font-mono font-bold">
                          {(() => {
                            const subjectStats = stats?.subjectStats?.[selectedSubject.id];
                            if (!subjectStats) return '0%';
                            const percentage = Math.round((subjectStats.correctAnswers / subjectStats.totalAnswered) * 100);
                            return `${percentage}%`;
                          })()}
                        </p>
                        <p className="text-[10px] opacity-60">
                          {(() => {
                            const subjectStats = stats?.subjectStats?.[selectedSubject.id];
                            if (!subjectStats) return '0/0';
                            return (
                              <span>
                                {subjectStats.correctAnswers} OK / {subjectStats.totalAnswered - subjectStats.correctAnswers} Fail
                              </span>
                            );
                          })()}
                        </p>
                      </div>
                      <div className="flex-1 h-1.5 bg-gray-700 dark:bg-black rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-500"
                          style={{
                            width: `${(() => {
                              const subjectStats = stats?.subjectStats?.[selectedSubject.id];
                              if (!subjectStats) return '0%';
                              return Math.round((subjectStats.correctAnswers / subjectStats.totalAnswered) * 100);
                            })()}%`
                          }}
                        />
                      </div>
                    </div>
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
                          const isCurrentSource = getIsCurrentSource(src.id, questions[currentQuestionIndex]);
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
                      <TranslatedText 
                        question={questions[currentQuestionIndex]} 
                        field="text"
                        language={language}
                        className="text-xl font-medium leading-relaxed"
                        as="h3"
                      />
                      <div className="grid gap-3">
                        {['A', 'B', 'C', 'D'].map((opt, index) => {
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
                                {drillSettings.shuffleAnswers && shuffledQuestion && view === 'drill' ? (
                                  <span>{answerText}</span>
                                ) : (
                                  <TranslatedOption 
                                    question={questions[currentQuestionIndex]}
                                    option={opt as 'A' | 'B' | 'C' | 'D'}
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
                              onClick={handleGenerateLOs}
                              disabled={isGeneratingLOs || !importSubjectId}
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
                              {isGeneratingLOs ? 'Analyzuji EASA zdroje...' : '🔍 Najít chybějící LOs'}
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
                                <p className="text-sm font-bold">🎯 Nalezeno {generatedLOs.length} chybějících LOs</p>
                                
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
                            className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all cursor-pointer ${
                              selectedLicense === 'PPL' 
                                ? 'bg-indigo-600 text-white border border-indigo-600' 
                                : 'border border-[var(--line)] opacity-40 hover:opacity-60'
                            }`}
                          >
                            PPL(A) Pattern
                          </button>
                          <button 
                            onClick={() => setSelectedLicense('SPL')}
                            className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all cursor-pointer ${
                              selectedLicense === 'SPL' 
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
                        
                        <div className="grid grid-cols-3 gap-4">
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
                                      className={`h-full transition-all duration-500 ${
                                        sa.percentage >= 80 ? 'bg-green-600' : 
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
                      return (
                        <div key={subjectId} className="space-y-1">
                          <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                            <span>{subject.description || subject.name}</span>
                            <span className="font-mono">{Math.round(rate * 100)}%</span>
                          </div>
                          <div className="h-4 bg-[var(--line)] rounded-sm overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${rate * 100}%` }}
                              className={`h-full ${rate > 0.75 ? 'bg-emerald-500' : rate > 0.5 ? 'bg-amber-500' : 'bg-rose-500'}`}
                            />
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
        const selectedLOQuestionCount = syllabusSelectedLO ? questions.filter(q => q.lo_id === syllabusSelectedLO).length : 0;
        const selectedLOSubject = selectedLOData?.subject_id ? syllabusTree.find(s => s.subjectId === selectedLOData.subject_id) : null;
        const selectedLOTopic = selectedLOData ? selectedLOSubject?.topics.find(t => selectedLOData.id.startsWith(t.code + '.')) : null;
        const selectedLOSubtopic = selectedLOData ? selectedLOTopic?.subtopics.find(s => selectedLOData.id.startsWith(s.code + '.')) : null;

        return (
          <div className="fixed inset-0 z-[200] flex flex-col bg-[var(--bg)]" style={{ backdropFilter: 'blur(8px)' }}>
            {/* Modal Header */}
            <div className="border-b border-[var(--line)] px-6 py-4 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center">
                  <BookOpen size={20} />
                </div>
                <div>
                  <h2 className="font-bold text-xl">EASA Syllabus Browser</h2>
                  <p className="text-[10px] opacity-50 uppercase tracking-widest">AMC/GM Part-FCL — Learning Objectives</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* Search box */}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" />
                  <input
                    type="text"
                    placeholder="Hledat v sylabu..."
                    value={syllabusSearch}
                    onChange={(e) => setSyllabusSearch(e.target.value)}
                    className="pl-9 pr-4 py-1.5 bg-[var(--line)]/30 border border-[var(--line)] rounded-xl text-xs focus:outline-none focus:border-indigo-600 w-48 lg:w-64 transition-all"
                  />
                  {syllabusSearch && (
                    <button 
                      onClick={() => setSyllabusSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-[var(--line)] rounded-full opacity-50 hover:opacity-100"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>

                {/* License filter */}
                <div className="flex gap-1 border border-[var(--line)] rounded-xl p-1">
                  {(['ALL', 'PPL', 'SPL'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setSyllabusLicenseFilter(f)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${syllabusLicenseFilter === f ? 'bg-indigo-600 text-white' : 'opacity-50 hover:opacity-80'}`}
                    >
                      {f === 'ALL' ? 'Vše' : f === 'PPL' ? 'PPL(A)' : 'SPL'}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setSyllabusOpen(false)}
                  className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[var(--line)] transition-colors"
                >
                  <X size={20} />
                </button>
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
                    : subjectLOs.filter(n => (n.lo.applies_to || ['PPL','SPL']).includes(syllabusLicenseFilter));
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
                              : topicLOs.filter(n => (n.lo.applies_to || ['PPL','SPL']).includes(syllabusLicenseFilter));
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
                                        : subtopic.los.filter(n => (n.lo.applies_to || ['PPL','SPL']).includes(syllabusLicenseFilter));
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
                                                const qCount = questions.filter(q => q.lo_id === lo.id).length;

                                                return (
                                                  <div
                                                    key={lo.id}
                                                    className={`px-10 py-2.5 flex items-start justify-between gap-3 cursor-pointer transition-colors border-t border-[var(--line)]/20 ${isSelected ? 'bg-indigo-600/10 border-l-2 border-l-indigo-600' : isFocused ? 'bg-amber-500/10 border-l-2 border-l-amber-500' : 'hover:bg-[var(--line)]/20'}`}
                                                    onClick={() => { setSyllabusSelectedLO(lo.id); setFocusedLOId(null); }}
                                                  >
                                                    <div className="flex items-start gap-2 flex-1 min-w-0">
                                                      {/* License dot */}
                                                      <span
                                                        className={`mt-1 flex-shrink-0 w-2 h-2 rounded-full ${licenseType === 'BOTH' ? 'bg-gray-400' : licenseType === 'PPL' ? 'bg-indigo-500' : 'bg-emerald-500'}`}
                                                        title={licenseType === 'BOTH' ? 'PPL + SPL' : licenseType}
                                                      />
                                                      <div className="min-w-0">
                                                        <p className="text-[9px] font-mono opacity-50">{lo.id}</p>
                                                        <p className="text-[10px] leading-snug font-medium">{lo.text}</p>
                                                      </div>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                                      {isCovered && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Pokryto otázkami" />}
                                                      {qCount > 0 && <span className="text-[8px] font-mono opacity-40">{qCount}q</span>}
                                                      <button
                                                        onClick={(e) => { e.stopPropagation(); startDrillForLO(lo.id); }}
                                                        className="px-1.5 py-0.5 rounded border border-[var(--line)] text-[8px] font-bold uppercase tracking-widest hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all"
                                                      >
                                                        ▶
                                                      </button>
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
                        {(selectedLOData.applies_to || ['PPL','SPL']).map(lic => (
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
                    {(selectedLOData.applies_to || ['PPL','SPL']).length === 1 && (
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
                        <button
                          onClick={() => startDrillForLO(selectedLOData.id)}
                          className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                        >
                          <ChevronRight size={12} />
                          Procvičit toto téma ({selectedLOQuestionCount} otázek)
                        </button>
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
                        <div className="w-full py-2.5 border border-dashed border-indigo-300 text-indigo-400 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 opacity-60">
                          <Sparkles size={12} />
                          Generovat otázky (brzy)
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
                <div className="p-6 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl">
                  <p className="text-base leading-relaxed opacity-90 whitespace-pre-wrap font-mono">
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
      </AnimatePresence>
        </>
      )}
    </div>
  );
}
