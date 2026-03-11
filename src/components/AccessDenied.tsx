import React from 'react';
import { ShieldAlert, Lock } from 'lucide-react';

interface AccessDeniedProps {
  variant: 'guest' | 'user';
  className?: string;
}

export const AccessDenied: React.FC<AccessDeniedProps> = ({ variant, className = '' }) => {
  if (variant === 'guest') {
    return (
      <div className={`flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-600 dark:text-amber-400 text-xs ${className}`}>
        <Lock size={14} className="flex-shrink-0" />
        <span className="font-semibold uppercase tracking-widest">Tato funkce je jen pro ověřené uživatele</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-600 dark:text-rose-400 text-xs ${className}`}>
      <ShieldAlert size={14} className="flex-shrink-0" />
      <span className="font-semibold uppercase tracking-widest">Toto oprávnění má jen administrátor</span>
    </div>
  );
};

export const useAccessCheck = (role: 'admin' | 'user' | 'guest') => {
  const canAccess = (required: 'user' | 'admin'): boolean => {
    if (required === 'user') return role === 'user' || role === 'admin';
    if (required === 'admin') return role === 'admin';
    return false;
  };

  const getDeniedVariant = (required: 'user' | 'admin'): 'guest' | 'user' => {
    if (required === 'user') return 'guest';
    return 'user';
  };

  return { canAccess, getDeniedVariant };
};
