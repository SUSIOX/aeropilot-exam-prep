/**
 * Aircademy Syllabus Component
 * Manual PDF loader for Aircademy ECQB-PPL Detailed Syllabus
 */

import React, { useState } from 'react';
import { BookOpen, Download, ExternalLink, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { parseAircademyPDF, AircademySyllabusStructure } from '../services/aircademyService';

interface AircademySyllabusProps {
  subjectId?: number;
}

export const AircademySyllabus: React.FC<AircademySyllabusProps> = ({ subjectId: _subjectId }) => {
  const [syllabus, setSyllabus] = useState<AircademySyllabusStructure | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl] = useState("https://aircademy.com/downloads/ECQB-PPL-DetailedSyllabus.pdf");

  const loadSyllabus = async () => {
    setLoading(true);
    setError(null);
    try {
      const structure = await parseAircademyPDF(pdfUrl);
      setSyllabus(structure);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Aircademy syllabus');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 border border-[var(--line)] rounded-2xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
            <BookOpen size={20} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold">Aircademy ECQB-PPL Syllabus</h3>
            <p className="text-xs opacity-60">Manuální načtení PDF pro referenci AI</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.open(pdfUrl, '_blank')}
            className="flex items-center gap-2 px-3 py-2 border border-[var(--line)] rounded-lg text-sm hover:bg-[var(--ink)] transition-colors"
            title="Download Aircademy PDF"
          >
            <Download size={16} />
            <span className="hidden sm:inline">PDF</span>
          </button>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 border border-[var(--line)] rounded-lg text-sm hover:bg-[var(--ink)] transition-colors"
            title="Open Aircademy website"
          >
            <ExternalLink size={16} />
            <span className="hidden sm:inline">Aircademy</span>
          </a>
        </div>
      </div>

      {/* Status */}
      {syllabus ? (
        <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
          <CheckCircle size={18} className="text-green-500 flex-shrink-0" />
          <p className="text-sm text-green-500 font-medium flex-1">PDF načteno — AI může referovat Aircademy syllabus</p>
          <button onClick={loadSyllabus} className="text-xs opacity-50 hover:opacity-100 transition-opacity">
            <RefreshCw size={14} />
          </button>
        </div>
      ) : error ? (
        <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-500 font-medium">Nepodařilo se načíst PDF</p>
            <p className="text-xs opacity-60 mt-0.5">{error}</p>
          </div>
        </div>
      ) : (
        <p className="text-xs opacity-40">PDF není načteno. Klikněte na tlačítko níže pro parsování.</p>
      )}

      {/* Load button */}
      <button
        onClick={loadSyllabus}
        disabled={loading}
        className="w-full py-3 px-4 border border-[var(--line)] rounded-xl text-sm font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-[var(--line)]"
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Načítám PDF...
          </>
        ) : (
          <>
            <Download size={14} />
            {syllabus ? 'Znovu načíst PDF' : 'Načíst PDF'}
          </>
        )}
      </button>

      {/* PDF source info */}
      <p className="text-xs opacity-30 font-mono truncate">{pdfUrl}</p>
    </div>
  );
};
