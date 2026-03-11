import React from 'react';
import { motion } from 'motion/react';
import { CognitoAuth } from './CognitoAuth';

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
      {/* Blurred background - will show dashboard content underneath */}
      <div className="absolute inset-0 backdrop-blur-[20px] bg-[var(--bg)]/80" />
      
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
        className="relative z-10 w-full max-w-md p-8 glass-panel rounded-3xl space-y-8 border border-[var(--line)]"
      >
        {/* Logo and Title */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-[var(--ink)] text-[var(--ink-text)] flex items-center justify-center rounded-2xl font-bold text-3xl mx-auto">
            A
          </div>
          <h1 className="text-2xl font-bold tracking-tight">AeroPilot</h1>
          <p className="text-xs uppercase tracking-widest opacity-50 font-mono">EASA ECQB PREP</p>
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
            className="w-full py-4 bg-[var(--ink)] text-[var(--ink-text)] rounded-xl font-bold uppercase tracking-widest text-xs hover:scale-[1.02] transition-transform"
          >
            SIGN IN
          </button>

          {/* Guest Mode Button */}
          <div className="text-center">
            <button 
              onClick={onGuestMode}
              className="text-[10px] font-bold uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity"
            >
              Pokračovat jako host
            </button>
          </div>

          <p className="text-center text-[10px] opacity-50">
            Guest mode provides limited access • Sign in for full features
          </p>
        </motion.div>

        {/* Commented out static auth form - was creating demo users */}
        {/*
        <AnimatePresence mode="wait">
          {!showAuthForm ? (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <button
                onClick={handleLoginClick}
                className="w-full py-4 bg-[var(--ink)] text-[var(--ink-text)] rounded-xl font-bold uppercase tracking-widest text-xs hover:scale-[1.02] transition-transform"
              >
                SIGN IN
              </button>

              <div className="text-center">
                <button 
                  onClick={onGuestMode}
                  className="text-[10px] font-bold uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity"
                >
                  Pokračovat jako host
                </button>
              </div>

              <p className="text-center text-[10px] opacity-50">
                Guest mode provides limited access • Sign in for full features
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="auth"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <button
                onClick={() => setShowAuthForm(false)}
                className="text-[10px] opacity-50 hover:opacity-100 transition-opacity mb-4"
              >
                ← Zpět
              </button>

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
                  Přihlásit se
                </button>
                <p className="text-center text-[10px] opacity-50">
                  Zadej své jméno — pokud účet neexistuje, automaticky se vytvoří
                </p>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
        */}
      </motion.div>
    </div>
  );
};
