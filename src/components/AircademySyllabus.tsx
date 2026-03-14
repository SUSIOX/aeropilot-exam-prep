/**
 * Aircademy Syllabus Component
 * UI for accessing and managing Aircademy ECQB-PPL Detailed Syllabus
 */

import React, { useState, useEffect } from 'react';
import { BookOpen, Download, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react';
import { parseAircademyPDF, AircademySyllabusStructure } from '../services/aircademyService';
import { generateMissingLearningObjectives } from '../services/aiService';

interface AircademySyllabusProps {
  onLOGenerated?: (los: any[]) => void;
  subjectId?: number;
}

export const AircademySyllabus: React.FC<AircademySyllabusProps> = ({ 
  onLOGenerated, 
  subjectId 
}) => {
  const [syllabus, setSyllabus] = useState<AircademySyllabusStructure | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [pdfUrl] = useState("https://aircademy.com/downloads/ECQB-PPL-DetailedSyllabus.pdf");

  useEffect(() => {
    loadSyllabus();
  }, []);

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

  const handleDownloadPDF = () => {
    window.open(pdfUrl, '_blank');
  };

  const handleGenerateFromAircademy = async () => {
    if (!subjectId) {
      alert('Nejprve vyberte předmět pro generování LOs.');
      return;
    }

    setGenerating(true);
    
    try {
      // Get API key (same logic as other generators - direct localStorage read)
      const uid = 'guest'; // Simplified for Aircademy component
      let apiKey = localStorage.getItem(`${uid}:userApiKey`) || localStorage.getItem(`${uid}:claudeApiKey`) || localStorage.getItem('userApiKey') || localStorage.getItem('claudeApiKey');
      
      // For logged-in users, try to get from DB first
      const userMode = localStorage.getItem('userMode') || 'guest';
      const userId = localStorage.getItem('userId');
      if (userMode === 'logged-in' && userId && !apiKey) {
        try {
          // This would need dynamoDB import - for now use localStorage fallback
          console.log('Logged-in user detected, but DB access not available in this component');
        } catch (err) {
          console.error('Failed to load API keys from DB:', err);
        }
      }
      
      // Prompt for API key if missing (LO generation requires API key)
      let effectiveApiKey = apiKey;
      if (!effectiveApiKey) {
        const key = prompt('Pro generování LOs je vyžadován API klíč. Chcete jej vložit nyní?');
        if (key) {
          localStorage.setItem(`${uid}:userApiKey`, key);
          effectiveApiKey = key;
        } else {
          // Stop generation if no API key provided (LOs require API key)
          alert('Generování LOs vyžaduje API klíč. Zadejte ho prosím v nastavení.');
          setGenerating(false);
          return;
        }
      }

      // Use AI service to generate missing LOs with Aircademy insights
      const result = await generateMissingLearningObjectives(
        [], // existing LOs - will be fetched internally
        subjectId,
        'BOTH', // Generate for both PPL and SPL
        effectiveApiKey, // API key (required for LO generation)
        'gemini-flash-latest', // model
        'gemini', // provider
        undefined, // signal
        true, // Use Aircademy syllabus
        [] // Additional documents
      );
      
      if (result.success && result.los.length > 0) {
        onLOGenerated?.(result.los);
        console.log('🎯 Generated LOs from Aircademy:', result.los);
      } else {
        console.error('No LOs generated:', result.error);
        alert(result.error || 'Nepodařilo se vygenerovat žádné LOs z Aircademy syllabu.');
      }
    } catch (err) {
      console.error('Error generating LOs from Aircademy:', err);
      alert('Chyba při generování LOs z Aircademy syllabu.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 border border-[var(--line)] rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm">Loading Aircademy syllabus...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 border border-[var(--line)] rounded-2xl">
        <div className="flex items-start gap-3">
          <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-red-500">Aircademy Syllabus Error</h3>
            <p className="text-sm opacity-60 mt-1">{error}</p>
            <button 
              onClick={loadSyllabus}
              className="mt-3 px-4 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

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
            <p className="text-xs opacity-60">Detailed syllabus with practical examples</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadPDF}
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
      <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
        <CheckCircle size={20} className="text-green-500" />
        <div className="flex-1">
          <p className="text-sm font-medium text-green-500">Aircademy Syllabus Available</p>
          <p className="text-xs opacity-60">
            AI can now reference detailed Aircademy explanations for LO generation
          </p>
        </div>
      </div>

      {/* Integration Info */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-indigo-500 text-white rounded-full flex items-center justify-center text-xs font-bold">i</div>
          <div>
            <h4 className="font-medium text-sm">AI Integration</h4>
            <p className="text-xs opacity-60">
              The AI LO generator now automatically references Aircademy syllabus for enhanced context and practical examples
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">✓</div>
          <div>
            <h4 className="font-medium text-sm">Enhanced Prompts</h4>
            <p className="text-xs opacity-60">
              All LO generation prompts include Aircademy syllabus as secondary reference source
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center text-xs font-bold">📚</div>
          <div>
            <h4 className="font-medium text-sm">Detailed Explanations</h4>
            <p className="text-xs opacity-60">
              Generated LOs include practical insights from Aircademy's detailed syllabus
            </p>
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div className="pt-2">
        <button
          onClick={handleGenerateFromAircademy}
          disabled={generating || !subjectId}
          className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-medium hover:from-blue-600 hover:to-indigo-700 transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
        >
          {generating ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>Generuji LOs...</span>
            </div>
          ) : (
            'Generate LOs with Aircademy Insights'
          )}
        </button>
        <p className="text-xs opacity-40 text-center mt-2">
          Uses Aircademy syllabus as reference for detailed context
        </p>
      </div>

      {/* PDF Info */}
      <div className="text-xs opacity-40 border-t border-[var(--line)] pt-3">
        <p>
          Source: <span className="font-mono">{pdfUrl}</span>
        </p>
        <p className="mt-1">
          The Aircademy ECQB-PPL Detailed Syllabus provides comprehensive explanations and practical examples for all EASA Learning Objectives.
        </p>
      </div>
    </div>
  );
};
