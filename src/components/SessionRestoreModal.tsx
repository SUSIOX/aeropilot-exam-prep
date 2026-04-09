import { Play, RotateCcw, X } from 'lucide-react';
import { DrillSession } from '../types/session';

interface SessionRestoreModalProps {
  session: DrillSession;
  onContinue: () => void;
  onRestart: () => void;
  onDismiss: () => void;
}

export function SessionRestoreModal({ session, onContinue, onRestart, onDismiss }: SessionRestoreModalProps) {
  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('cs-CZ', { 
      day: 'numeric', 
      month: 'short', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const formatDuration = (startedAt: string) => {
    const start = new Date(startedAt);
    const now = new Date();
    const hours = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60));
    
    if (hours < 1) return 'dnes';
    if (hours < 24) return `před ${hours} h`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'včera';
    return `před ${days} dny`;
  };

  const isMix = session.type === 'mix';
  const progress = session.questionIds.length > 0 
    ? Math.round((session.currentIndex / session.questionIds.length) * 100) 
    : 0;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl max-w-md w-full p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-[var(--ink)]">
              Rozpracovaná lekce
            </h3>
            <p className="text-sm text-[var(--muted)] mt-1">
              {formatDuration(session.startedAt)} • {formatDate(session.startedAt)}
            </p>
          </div>
          <button
            onClick={onDismiss}
            className="p-2 hover:bg-[var(--line)] rounded-full transition-colors"
          >
            <X size={20} className="text-[var(--muted)]" />
          </button>
        </div>

        <div className="space-y-4 mb-6">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              isMix ? 'bg-purple-500/20 text-purple-600' : 'bg-blue-500/20 text-blue-600'
            }`}>
              <span className="text-xl font-bold">
                {isMix ? 'MIX' : session.subjectId}
              </span>
            </div>
            <div>
              <p className="font-medium text-[var(--ink)]">
                {isMix ? 'Mix otázek' : `Předmět ${session.subjectId}`}
              </p>
              <p className="text-sm text-[var(--muted)]">
                {session.currentIndex + 1} / {session.questionIds.length} otázek
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs text-[var(--muted)]">
              <span>Průběh</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 bg-[var(--line)] rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {Object.keys(session.answers).length > 0 && (
            <p className="text-sm text-[var(--muted)]">
              Zodpovězeno: {Object.keys(session.answers).length} otázek
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onContinue}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-[var(--ink)] text-[var(--bg)] rounded-xl font-medium hover:scale-[1.02] transition-transform"
          >
            <Play size={18} />
            Pokračovat
          </button>
          <button
            onClick={onRestart}
            className="flex-1 flex items-center justify-center gap-2 py-3 border border-[var(--line)] text-[var(--ink)] rounded-xl font-medium hover:bg-[var(--line)] transition-colors"
          >
            <RotateCcw size={18} />
            Začít znovu
          </button>
        </div>
      </div>
    </div>
  );
}
