import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, LogIn, BarChart3, Target, Sparkles, ShieldCheck, UserPlus, Eye, EyeOff } from 'lucide-react';

interface LoginPromptProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (userData: { id: number; username: string }) => void;
  feature: 'stats' | 'errors' | 'ai' | 'admin';
}

export function LoginPrompt({ isOpen, onClose, onLoginSuccess, feature }: LoginPromptProps) {
  const [mode, setMode] = useState<'prompt' | 'login' | 'register'>('prompt');
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ username: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getFeatureInfo = () => {
    switch (feature) {
      case 'stats':
        return {
          icon: BarChart3,
          title: 'Statistiky a postup',
          description: 'Sledujte své pokroky, zobrazte detailní statistiky a sledujte vývoj vaší úspěšnosti.',
          benefits: ['Grafy a vizualizace', 'Historie odpovědí', 'Srovnání výkonu', 'Dlouhodobý postup']
        };
      case 'errors':
        return {
          icon: Target,
          title: 'Procvičování chyb',
          description: 'Zaměřte se na otázky, které vám dělají problémy, a zlepšete své slabiny.',
          benefits: ['Inteligentní výběr chyb', 'Adaptivní procvičování', 'Rychlé zlepšení', 'Personalizovaný plán']
        };
      case 'ai':
        return {
          icon: Sparkles,
          title: 'AI vysvětlení',
          description: 'Získejte podrobná AI vysvětlení otázek a učte se efektivněji.',
          benefits: ['Podrobné vysvětlení', 'Příklady z praxe', 'Interaktivní učení', 'Synchronizace zařízení']
        };
      case 'admin':
        return {
          icon: ShieldCheck,
          title: 'Admin funkce',
          description: 'Spravujte obsah, přidávejte otázky a monitorujte systém.',
          benefits: ['Správa obsahu', 'Import otázek', 'Monitorování', 'Pokročilé nastavení']
        };
      default:
        return {
          icon: LogIn,
          title: 'Pokročilé funkce',
          description: 'Odemkněte všechny funkce aplikace pro lepší výsledky.',
          benefits: ['Všechny funkce', 'Synchronizace', 'Statistiky', 'Podpora']
        };
    }
  };

  const { icon: FeatureIcon, title, description, benefits } = getFeatureInfo();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    // Simulate API call
    setTimeout(() => {
      if (form.username && form.password) {
        onLoginSuccess({ id: Date.now(), username: form.username });
        setMode('prompt');
        setForm({ username: '', password: '' });
      } else {
        setError('Vyplňte prosím všechna pole');
      }
      setIsLoading(false);
    }, 1000);
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    // Simulate API call
    setTimeout(() => {
      if (form.username && form.password) {
        onLoginSuccess({ id: Date.now(), username: form.username });
        setMode('prompt');
        setForm({ username: '', password: '' });
      } else {
        setError('Vyplňte prosím všechna pole');
      }
      setIsLoading(false);
    }, 1000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[250] flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="w-full max-w-md bg-[var(--bg)] border border-[var(--line)] rounded-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {mode === 'prompt' ? (
              <>
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center">
                      <FeatureIcon className="w-5 h-5 text-indigo-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-indigo-500">Vyžadováno přihlášení</h3>
                      <p className="text-[10px] opacity-50 uppercase tracking-widest">Pro přístup k této funkci</p>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2 hover:bg-[var(--line)] rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Feature Info */}
                <div className="space-y-4 mb-6">
                  <div>
                    <h4 className="font-semibold mb-2">{title}</h4>
                    <p className="text-sm opacity-70 leading-relaxed">{description}</p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest opacity-50">S přihlášením získáte:</p>
                    <div className="space-y-2">
                      {benefits.map((benefit, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm">
                          <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></div>
                          <span className="opacity-80">{benefit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => setMode('login')}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-2"
                  >
                    <LogIn className="w-4 h-4" />
                    Přihlásit se
                  </button>
                  <button
                    onClick={() => setMode('register')}
                    className="w-full py-3 border border-[var(--line)] hover:bg-[var(--line)] rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-2"
                  >
                    <UserPlus className="w-4 h-4" />
                    Vytvořit účet
                  </button>
                  <button
                    onClick={onClose}
                    className="w-full py-2 text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity"
                  >
                    Zpět k aplikaci
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setMode('prompt')}
                      className="p-2 hover:bg-[var(--line)] rounded-lg transition-colors"
                    >
                      <LogIn className="w-4 h-4" />
                    </button>
                    <h3 className="font-semibold text-xl">
                      {mode === 'login' ? 'Přihlášení' : 'Registrace'}
                    </h3>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2 hover:bg-[var(--line)] rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-50">Uživatelské jméno</label>
                    <input 
                      type="text"
                      required
                      value={form.username}
                      onChange={e => setForm(prev => ({ ...prev, username: e.target.value }))}
                      className="w-full px-4 py-3 bg-transparent border border-[var(--line)] rounded-xl focus:outline-none focus:border-indigo-600"
                      placeholder="pilot123"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-50">Heslo</label>
                    <div className="relative">
                      <input 
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={form.password}
                        onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
                        className="w-full px-4 py-3 bg-transparent border border-[var(--line)] rounded-xl focus:outline-none focus:border-indigo-600"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 opacity-40 hover:opacity-100 transition-opacity"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <p className="text-xs text-rose-500 font-medium">{error}</p>
                  )}

                  <button 
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold uppercase tracking-widest text-[10px] hover:scale-[1.02] transition-transform disabled:opacity-50"
                  >
                    {isLoading ? 'Zpracovávám...' : (mode === 'login' ? 'Přihlásit se' : 'Zaregistrovat se')}
                  </button>
                </form>

                <div className="text-center pt-2">
                  <button
                    onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                    className="text-[10px] font-bold uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity"
                  >
                    {mode === 'login' ? 'Nemáte účet? Zaregistrujte se' : 'Již máte účet? Přihlaste se'}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Hook for managing login prompts
export function useLoginPrompt() {
  const [promptState, setPromptState] = useState<{
    isOpen: boolean;
    feature: 'stats' | 'errors' | 'ai' | 'admin' | null;
  }>({
    isOpen: false,
    feature: null
  });

  const showLoginPrompt = (feature: 'stats' | 'errors' | 'ai' | 'admin') => {
    setPromptState({ isOpen: true, feature });
  };

  const closeLoginPrompt = () => {
    setPromptState({ isOpen: false, feature: null });
  };

  return {
    isOpen: promptState.isOpen,
    feature: promptState.feature,
    showLoginPrompt,
    closeLoginPrompt
  };
}
