import React from 'react';
import { User, LogIn, Sparkles, BarChart3, ShieldCheck } from 'lucide-react';

interface GuestModeBannerProps {
  userMode: 'guest' | 'logged-in';
  onSwitchToLogin: () => void;
  isLoggedIn: boolean;
}

export function GuestModeBanner({ userMode, onSwitchToLogin, isLoggedIn }: GuestModeBannerProps) {
  if (isLoggedIn) return null;

  return (
    <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-xl p-4 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
            <User className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold text-blue-400">Guest Mode</h3>
            <p className="text-sm text-blue-300/70">
              {userMode === 'guest' 
                ? 'Trénujete bez registrace. Pro uložení postupu se přihlaste.'
                : 'Přihlaste se pro přístup k pokročilým funkcím.'
              }
            </p>
          </div>
        </div>
        
        <button
          onClick={onSwitchToLogin}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
        >
          <LogIn className="w-4 h-4" />
          <span className="font-medium">Přihlásit se</span>
        </button>
      </div>
      
      {userMode === 'guest' && (
        <div className="mt-4 pt-4 border-t border-blue-500/20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="flex items-center gap-2 text-blue-300/70">
              <Sparkles className="w-4 h-4" />
              <span>Základní AI vysvětlení</span>
            </div>
            <div className="flex items-center gap-2 text-blue-300/70">
              <BarChart3 className="w-4 h-4" />
              <span>Session statistiky</span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <ShieldCheck className="w-4 h-4" />
              <span>Postup a synchronizace po přihlášení</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface FeatureComparisonProps {
  userMode: 'guest' | 'logged-in';
}

export function FeatureComparison({ userMode }: FeatureComparisonProps) {
  const features = [
    {
      name: 'Trénování otázek',
      guest: true,
      loggedIn: true,
      icon: '📚'
    },
    {
      name: 'Základní vysvětlení',
      guest: true,
      loggedIn: true,
      icon: '💡'
    },
    {
      name: 'AI vysvětlení (cache)',
      guest: true,
      loggedIn: true,
      icon: '🤖'
    },
    {
      name: 'Ukládání postupu',
      guest: false,
      loggedIn: true,
      icon: '📊'
    },
    {
      name: 'Statistiky a grafy',
      guest: false,
      loggedIn: true,
      icon: '📈'
    },
    {
      name: 'Procvičování chyb',
      guest: false,
      loggedIn: true,
      icon: '🎯'
    },
    {
      name: 'Synchronizace zařízení',
      guest: false,
      loggedIn: true,
      icon: '☁️'
    },
    {
      name: 'Personalizované učení',
      guest: false,
      loggedIn: true,
      icon: '🎓'
    }
  ];

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-6">
      <h3 className="text-lg font-semibold mb-4">Porovnání funkcí</h3>
      <div className="space-y-3">
        {features.map((feature, index) => (
          <div key={index} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
            <div className="flex items-center gap-3">
              <span className="text-xl">{feature.icon}</span>
              <span className="font-medium">{feature.name}</span>
            </div>
            <div className="flex items-center gap-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                userMode === 'guest' && feature.guest ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
              }`}>
                {userMode === 'guest' && feature.guest ? '✓' : '○'}
              </div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                userMode === 'logged-in' && feature.loggedIn ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
              }`}>
                {userMode === 'logged-in' && feature.loggedIn ? '✓' : '○'}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-white/10 flex justify-center gap-8 text-sm">
        <div className="text-center">
          <div className="font-semibold text-blue-400">Guest Mode</div>
          <div className="text-gray-400">Okamžitý start</div>
        </div>
        <div className="text-center">
          <div className="font-semibold text-green-400">Login Mode</div>
          <div className="text-gray-400">Plné funkce</div>
        </div>
      </div>
    </div>
  );
}
