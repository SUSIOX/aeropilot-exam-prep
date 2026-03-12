import React from 'react';
import { motion } from 'motion/react';
import { CognitoAuth } from './CognitoAuth';
import { LayoutDashboard, BookOpen, BarChart3, Sparkles } from 'lucide-react';

interface LandingPageProps {
  onGuestMode: () => void;
  onAuthSuccess: (userData: { id: string; username: string; email?: string }) => void;
  onClose: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGuestMode, onAuthSuccess, onClose }) => {
  // Generate Cognito auth URL and redirect
  const handleLoginClick = () => {
    const domain = process.env.COGNITO_DOMAIN;
    const clientId = process.env.COGNITO_CLIENT_ID;
    const redirectUri = process.env.COGNITO_REDIRECT_URI;
    const state = Math.random().toString(36).substring(7); // Generate random state
    
    sessionStorage.setItem('cognito_state', state);
    
    const params = new URLSearchParams({
      client_id: clientId || '',
      response_type: 'code',
      scope: 'email openid profile',
      redirect_uri: redirectUri || window.location.origin,
      state: state
    });
    
    const authUrl = `https://${domain}/login?${params.toString()}`;
    window.location.href = authUrl;
  };

  // Static auth function (commented out - was creating demo users)
  /*
  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    
    // For demo - in real app this would call authentication
    if (authForm.username) {
      onAuthSuccess({ id: 'demo', username: authForm.username });
      onClose();
    } else {
      setAuthError('Zadejte uživatelské jméno');
    }
  };
  */

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Background image with overlay */}
      <div className="absolute inset-0">
        <img 
          src="/mrak_bckg.webp" 
          alt="Aviation background"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/40" />
      </div>
      
      {/* Background header (non-clickable, under glass) */}
      <div className="absolute top-0 left-0 right-0 z-0">
        <header className="border-b border-white/20 px-4 py-3 flex justify-between items-center bg-black/20 backdrop-blur-sm min-h-[60px] pointer-events-none">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 min-w-[40px] bg-white/10 backdrop-blur-sm text-white/60 flex items-center justify-center rounded-lg font-bold text-xl flex-shrink-0 border border-white/20">
              A
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-lg leading-tight text-white/80">Aeropilot Exam Prep</h1>
              <div className="flex items-center gap-2 text-xs opacity-60 leading-tight">
                <span className="w-2 h-2 rounded-full bg-green-500/60 flex-shrink-0"></span>
                <span className="truncate text-white/70">Online</span>
              </div>
            </div>
          </div>

          <nav className="hidden md:flex gap-6 lg:gap-8 items-center">
            <div className="text-xs uppercase tracking-widest font-semibold flex items-center gap-2 whitespace-nowrap text-white/60">
              <LayoutDashboard size={14} className="flex-shrink-0" /> 
              <span className="hidden sm:inline">Dashboard</span>
            </div>
            <div className="text-xs uppercase tracking-widest font-semibold flex items-center gap-2 whitespace-nowrap text-white/60">
              <BarChart3 size={14} className="flex-shrink-0" /> 
              <span className="hidden sm:inline">Statistiky</span>
            </div>
            <div className="text-xs uppercase tracking-widest font-semibold flex items-center gap-2 whitespace-nowrap text-white/60">
              <BookOpen size={14} className="flex-shrink-0" /> 
              <span className="hidden sm:inline">Osnovy</span>
            </div>
            <div className="text-xs uppercase tracking-widest font-semibold flex items-center gap-2 whitespace-nowrap text-white/60">
              <Sparkles size={14} className="flex-shrink-0" />
              <span className="hidden sm:inline">AI Generátor</span>
            </div>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3 opacity-60">
            <div className="hidden sm:flex items-center h-10 px-3 bg-white/10 rounded-full min-w-0 border border-white/20">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white truncate ml-1">Guest</span>
            </div>
            <div className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 border border-white/20">
              <div className="w-4 h-4 rounded-full bg-white/40"></div>
            </div>
            <div className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 border border-white/20">
              <div className="w-4 h-4 rounded-full bg-white/40"></div>
            </div>
            <div className="bg-white/20 backdrop-blur-sm text-white px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest border border-white/30">
              Simulace zkoušky
            </div>
          </div>
        </header>
      </div>
      
      {/* CognitoAuth must be rendered to handle callback redirect */}
      <CognitoAuth
        isOpen={false}
        onClose={onClose}
        onAuthSuccess={onAuthSuccess}
        feature={'stats'}
      />
      
      {/* Glassmorphism card with splash screen design */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 w-full max-w-md p-8 glass-panel rounded-3xl space-y-8 border border-white/20 bg-white/10 backdrop-blur-xl"
      >
        {/* Logo and Title */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-white/10 backdrop-blur-sm text-white/80 flex items-center justify-center rounded-2xl font-bold text-3xl mx-auto border border-white/20">
            A
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Aeropilot Exam Prep</h1>
          <p className="text-xs uppercase tracking-widest opacity-70 font-mono text-white">EASA ECQB PREP</p>
        </div>

        {/* Simple two-button interface */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Cognito Login Button */}
          <button
            onClick={handleLoginClick}
            className="w-full py-5 bg-white/20 backdrop-blur-sm text-white border border-white/30 rounded-xl font-bold uppercase tracking-widest text-sm hover:bg-white/30 hover:scale-[1.02] transition-all"
          >
            SIGN IN
          </button>

          {/* Guest Mode Button */}
          <div className="text-center">
            <button 
              onClick={onGuestMode}
              className="text-[12px] font-bold uppercase tracking-widest text-white/70 hover:text-white transition-colors"
            >
              Pokračovat jako DEMO host
            </button>
          </div>

          <p className="text-center text-[10px] text-white/60">
            Guest mode provides limited access • Sign in for full features
          </p>
        </motion.div>

      
      </motion.div>
    </div>
  );
};
