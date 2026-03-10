import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, LogIn, BarChart3, Target, Sparkles, ShieldCheck } from 'lucide-react';

interface LoginPromptProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: () => void;
  feature: 'stats' | 'errors' | 'ai' | 'admin';
}

export function LoginPrompt({ isOpen, onClose, onLogin, feature }: LoginPromptProps) {
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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="w-full max-w-md bg-[var(--bg)] border border-[var(--line)] rounded-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                  <FeatureIcon className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-blue-400">Vyžadováno přihlášení</h3>
                  <p className="text-sm text-blue-300/70">Pro přístup k této funkci</p>
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
                <p className="text-sm opacity-70">{description}</p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest opacity-50">S přihlášením získáte:</p>
                <div className="space-y-2">
                  {benefits.map((benefit, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                      <span>{benefit}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onLogin}
                className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                <span>Přihlásit se</span>
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-3 border border-[var(--line)] hover:bg-[var(--line)] rounded-lg font-medium transition-colors"
              >
                Zpět
              </button>
            </div>

            {/* Footer */}
            <div className="mt-4 pt-4 border-t border-[var(--line)] text-center">
              <p className="text-xs opacity-50">
                Ještě nemáte účet? <span className="text-blue-400 cursor-pointer hover:underline">Zaregistrujte se</span>
              </p>
            </div>
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
