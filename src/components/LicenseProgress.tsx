import React from 'react';
import { motion } from 'framer-motion';
import { Plane, Cloud } from 'lucide-react';
import { Question } from '../types';

interface LicenseProgressProps {
  questions: Question[];
  answers: Record<string, { isCorrect: boolean; subjectId: number; timestamp: string }>;
  subjectId: number;
  showDetails?: boolean;
}

interface ProgressStats {
  ppl: {
    total: number;
    answered: number;
    correct: number;
  };
  spl: {
    total: number;
    answered: number;
    correct: number;
  };
}

export const LicenseProgress: React.FC<LicenseProgressProps> = ({
  questions,
  answers,
  subjectId,
  showDetails = true
}) => {
  // Calculate progress by license type
  const stats: ProgressStats = React.useMemo(() => {
    const result: ProgressStats = {
      ppl: { total: 0, answered: 0, correct: 0 },
      spl: { total: 0, answered: 0, correct: 0 }
    };

    questions.forEach(q => {
      const appliesTo = q.metadata?.applies_to || ['PPL', 'SPL'];
      const questionId = String(q.id);
      const answer = answers[questionId];

      if (appliesTo.includes('PPL')) {
        result.ppl.total++;
        if (answer) {
          result.ppl.answered++;
          if (answer.isCorrect) result.ppl.correct++;
        }
      }

      if (appliesTo.includes('SPL')) {
        result.spl.total++;
        if (answer) {
          result.spl.answered++;
          if (answer.isCorrect) result.spl.correct++;
        }
      }
    });

    return result;
  }, [questions, answers]);

  const pplSuccessRate = stats.ppl.answered > 0 ? stats.ppl.correct / stats.ppl.answered : 0;
  const pplCompletionRate = stats.ppl.total > 0 ? stats.ppl.answered / stats.ppl.total : 0;
  const splSuccessRate = stats.spl.answered > 0 ? stats.spl.correct / stats.spl.answered : 0;
  const splCompletionRate = stats.spl.total > 0 ? stats.spl.answered / stats.spl.total : 0;

  // Don't render if no questions
  if (stats.ppl.total === 0 && stats.spl.total === 0) return null;

  return (
    <div className="space-y-3">
      {/* PPL Progress */}
      {stats.ppl.total > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <Plane size={14} className="text-blue-400" />
              <span className="font-medium">PPL</span>
              <span className="text-gray-500">({stats.ppl.answered}/{stats.ppl.total})</span>
            </div>
            <span className={`font-mono ${pplSuccessRate > 0.75 ? 'text-emerald-500' : pplSuccessRate > 0.5 ? 'text-amber-500' : 'text-rose-500'}`}>
              {Math.round(pplSuccessRate * 100)}%
            </span>
          </div>
          <div className="h-2 bg-[var(--progress-bg)] rounded-sm overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pplCompletionRate * 100}%` }}
              className="h-full bg-blue-500/70 rounded-sm"
            />
          </div>
          {showDetails && (
            <div className="flex justify-between text-[10px] text-gray-500">
              <span>{stats.ppl.correct} správně</span>
              <span>{stats.ppl.answered - stats.ppl.correct} špatně</span>
            </div>
          )}
        </div>
      )}

      {/* SPL Progress */}
      {stats.spl.total > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <Cloud size={14} className="text-purple-400" />
              <span className="font-medium">SPL</span>
              <span className="text-gray-500">({stats.spl.answered}/{stats.spl.total})</span>
            </div>
            <span className={`font-mono ${splSuccessRate > 0.75 ? 'text-emerald-500' : splSuccessRate > 0.5 ? 'text-amber-500' : 'text-rose-500'}`}>
              {Math.round(splSuccessRate * 100)}%
            </span>
          </div>
          <div className="h-2 bg-[var(--progress-bg)] rounded-sm overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${splCompletionRate * 100}%` }}
              className="h-full bg-purple-500/70 rounded-sm"
            />
          </div>
          {showDetails && (
            <div className="flex justify-between text-[10px] text-gray-500">
              <span>{stats.spl.correct} správně</span>
              <span>{stats.spl.answered - stats.spl.correct} špatně</span>
            </div>
          )}
        </div>
      )}

      {/* Total Progress Summary */}
      <div className="pt-2 border-t border-[var(--line)]">
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Celkový postup</span>
          <span className="font-mono">
            {stats.ppl.answered + stats.spl.answered} / {stats.ppl.total + stats.spl.total}
          </span>
        </div>
      </div>
    </div>
  );
};

export default LicenseProgress;
