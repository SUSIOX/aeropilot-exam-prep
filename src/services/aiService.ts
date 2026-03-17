import { GoogleGenAI } from "@google/genai";
import { Anthropic } from "@anthropic-ai/sdk";
import { Question } from "../types";
import { LOItem } from "../types/aws";
import { dynamoDBService } from "./dynamoService";
import { cacheAircademyPDF, generateAircademyPrompt } from './aircademyService';

export type AIProvider = 'gemini' | 'claude' | 'deepseek';

// LO Cache for performance
const loCache = new Map<string, EasaLO[]>();
let cacheLoaded = false;

// Convert LOItem / EasaObjective to EasaLO
const loItemToEasaLO = (item: LOItem | any): EasaLO => ({
  id: item.losid || item.loId,
  text: item.text,
  knowledgeContent: item.knowledgeContent || item.context,
  level: item.level,
  context: item.context,
  subject_id: item.subject_id || item.subjectId || undefined,
  applies_to: item.applies_to || item.appliesTo
});

// Load all LOs from DB and cache them
function extractJSON(raw: string): string {
  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  // Fallback: find first { or [ and last } or ]
  const start = raw.search(/[{[]/);
  const end = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
  if (start !== -1 && end > start) return raw.slice(start, end + 1);
  return raw.trim();
}

async function loadLOsFromDB(): Promise<EasaLO[]> {
  if (cacheLoaded && loCache.has('all')) {
    return loCache.get('all')!;
  }

  try {
    const result = await dynamoDBService.getAllLOs();
    if (result.success && result.data) {
      const easaLOs = result.data.map(loItemToEasaLO);
      loCache.set('all', easaLOs);
      cacheLoaded = true;
      return easaLOs;
    }
  } catch (error) {
    console.error('Failed to load LOs from DB:', error);
  }

  // Fallback to mockLOs if DB fails
  console.warn('Using mockLOs as fallback');
  return mockLOs;
}

// Get LOs by subject (cached)
export async function getLOsBySubject(subjectId: number): Promise<EasaLO[]> {
  const cacheKey = `subject_${subjectId}`;

  if (loCache.has(cacheKey)) {
    return loCache.get(cacheKey)!;
  }

  const allLOs = await loadLOsFromDB();
  const subjectLOs = allLOs.filter(lo => lo.subject_id === subjectId);
  loCache.set(cacheKey, subjectLOs);

  return subjectLOs;
}

// Get LO by ID (cached)
export async function getLOById(losid: string): Promise<EasaLO | undefined> {
  const allLOs = await loadLOsFromDB();
  return allLOs.find(lo => lo.id === losid);
}

// Get all LOs (cached)
export async function getAllLOs(): Promise<EasaLO[]> {
  return loadLOsFromDB();
}

const getAiInstance = (apiKey?: string) => {
  if (!apiKey) {
    throw new Error('API_KEY_MISSING');
  }
  return new GoogleGenAI({ apiKey });
};

const getClaudeInstance = (apiKey?: string) => {
  if (!apiKey) {
    throw new Error('API_KEY_MISSING');
  }
  return new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true
  });
};

// Helper for streaming from AI proxy (OpenRouter via Lambda)
async function streamFromProxy(
  proxyUrl: string,
  idToken: string,
  model: string,
  prompt: string,
  maxTokens: number,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const resolvedModel = model.includes('/') ? model : (
    model.startsWith('gemini') ? `google/${model}` :
    model.startsWith('claude') ? `anthropic/${model}` :
    `deepseek/${model}`
  );

  const res = await fetch(`${proxyUrl}?stream=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
    body: JSON.stringify({
      model: resolvedModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      stream: true
    }),
    signal,
  });

  if (!res.ok || !res.body) throw new Error(`Proxy error: ${res.status}`);
  
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop()!; // keep incomplete last line
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') break;
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onChunk(full);
        }
      } catch { /* skip malformed */ }
    }
  }
  return full;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Proxy call — uses Lambda AI proxy (no client-side API key needed)
async function callProxy(proxyUrl: string, idToken: string, model: string, userMessage: string, maxTokens = 2000, jsonMode = false): Promise<string> {
  const body: any = {
    model: model.includes('/') ? model : `deepseek/${model}`,
    messages: [{ role: 'user', content: userMessage }],
    max_tokens: maxTokens,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  const res = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
  if (res.status === 401 || res.status === 403) throw new Error('API_KEY_INVALID');
  if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// DeepSeek uses OpenAI-compatible REST API — supports both api.deepseek.com and OpenRouter
async function callDeepSeek(apiKey: string, model: string, userMessage: string, maxTokens = 2000, jsonMode = false): Promise<string> {
  const isOpenRouter = apiKey.startsWith('sk-or-');
  const isReasoner = model === 'deepseek-reasoner' || model === 'deepseek/deepseek-r1';
  const baseUrl = isOpenRouter ? 'https://openrouter.ai/api/v1' : 'https://api.deepseek.com';
  const resolvedModel = isOpenRouter && !model.includes('/') ? `deepseek/${model}` : model;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    ...(isOpenRouter && { 'HTTP-Referer': 'https://susiox.github.io/aeropilot-exam-prep/', 'X-Title': 'Aeropilot Exam Prep' }),
  };
  const body: any = {
    model: resolvedModel,
    messages: [{ role: 'user', content: userMessage }],
    max_tokens: maxTokens,
  };
  // deepseek-reasoner nepodporuje JSON mode
  if (jsonMode && !isReasoner) body.response_format = { type: 'json_object' };

  const res = await fetch(`${baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (res.status === 401) throw new Error('API_KEY_INVALID');
  if (res.status === 402) throw new Error('DEEPSEEK_INSUFFICIENT_BALANCE');
  if (res.status === 429) throw new Error('DEEPSEEK_RATE_LIMIT');
  if (!res.ok) throw new Error(`DeepSeek API error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// Fallback: try providers in order until one succeeds
// Order: primary → deepseek proxy → gemini → claude
export async function callWithFallback<T>(
  primaryProvider: AIProvider,
  primaryFn: () => Promise<T>,
  fallbackFns: { provider: AIProvider; fn: () => Promise<T> }[],
  signal?: AbortSignal
): Promise<T> {
  const isFatal = (err: any) => {
    const msg = (err?.message || '').toLowerCase();
    // Only fallback on key/quota/balance errors, not on cancellation or parse errors
    return (
      msg.includes('api_key_invalid') ||
      msg.includes('api key not valid') ||
      msg.includes('invalid api key') ||
      msg.includes('api_key_missing') ||
      msg.includes('deepseek_insufficient_balance') ||
      msg.includes('credit balance is too low') ||
      msg.includes('quota') ||
      msg.includes('resource_exhausted') ||
      msg.includes('429') ||
      msg.includes('401') ||
      msg.includes('402') ||
      msg.includes('403')
    );
  };

  try {
    return await primaryFn();
  } catch (primaryErr: any) {
    if (signal?.aborted) throw primaryErr;
    if (!isFatal(primaryErr)) throw primaryErr;

    console.warn(`[Fallback] ${primaryProvider} failed (${primaryErr?.message}), trying fallbacks...`);

    let lastErr = primaryErr;
    for (const { provider, fn } of fallbackFns) {
      if (signal?.aborted) throw lastErr;
      try {
        console.log(`[Fallback] Trying ${provider}...`);
        const result = await fn();
        console.log(`[Fallback] ${provider} succeeded.`);
        return result;
      } catch (err: any) {
        console.warn(`[Fallback] ${provider} also failed: ${err?.message}`);
        lastErr = err;
      }
    }
    throw lastErr;
  }
}

async function callWithRetry<T>(fn: () => Promise<T>, retries = 2, provider: AIProvider = 'gemini', signal?: AbortSignal): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    // Check if operation was cancelled
    if (signal?.aborted) {
      throw new Error('Operation cancelled');
    }
    const errorMsg = error?.message?.toLowerCase() || "";

    if (provider === 'gemini') {
      const isRateLimit = errorMsg.includes('429') || errorMsg.includes('resource_exhausted') || errorMsg.includes('rate exceeded');
      const isInvalidKey = errorMsg.includes('api key not valid') || errorMsg.includes('invalid api key');

      if (isRateLimit && retries > 0) {
        console.log(`Gemini rate limit hit, retrying in 2s... (${retries} left)`);
        await sleep(2000);
        return callWithRetry(fn, retries - 1, provider, signal);
      }

      if (isInvalidKey) {
        throw new Error('API_KEY_INVALID');
      }
    } else if (provider === 'claude') {
      const isRateLimit = errorMsg.includes('rate_limit') || errorMsg.includes('too many requests') || errorMsg.includes('429');
      const isInvalidKey = errorMsg.includes('authentication') || errorMsg.includes('invalid api key') || errorMsg.includes('unauthorized');
      const isNoBalance = errorMsg.includes('credit balance is too low');

      if (isRateLimit && retries > 0) {
        console.log(`Claude rate limit hit, retrying in 2s... (${retries} left)`);
        await sleep(2000);
        return callWithRetry(fn, retries - 1, provider, signal);
      }

      if (isInvalidKey) throw new Error('API_KEY_INVALID');
      if (isNoBalance) throw new Error('CLAUDE_INSUFFICIENT_BALANCE');
    } else if (provider === 'deepseek') {
      const isRateLimit = errorMsg.includes('deepseek_rate_limit') || errorMsg.includes('rate limit') || errorMsg.includes('429');
      const isInvalidKey = errorMsg.includes('api_key_invalid') || errorMsg.includes('401');
      const isNoBalance = errorMsg.includes('deepseek_insufficient_balance') || errorMsg.includes('402');
      if (isRateLimit && retries > 0) {
        console.log(`DeepSeek rate limit hit, retrying in 3s... (${retries} left)`);
        await sleep(3000);
        return callWithRetry(fn, retries - 1, provider, signal);
      }
      if (isInvalidKey) throw new Error('API_KEY_INVALID');
      if (isNoBalance) throw new Error('DEEPSEEK_INSUFFICIENT_BALANCE');
    }

    throw error;
  }
}

export interface EasaLO {
  id: string;
  text: string;
  knowledgeContent?: string; // EASA AMC/GM text - obsah ze kterého AI tvoří otázky
  level?: 1 | 2 | 3;        // 1=Awareness, 2=Knowledge, 3=Understanding
  context?: string;          // Legacy pole
  subject_id?: number;
  applies_to?: string[];
}

// Simulated syllabus scope per subject
export const SYLLABUS_SCOPE: Record<number, number> = {
  1: 145, // Air Law
  2: 95,  // Human Performance
  3: 250, // Meteorology
  4: 45,  // Communications
  5: 160, // Principles of Flight
  6: 85,  // Operational Procedures
  7: 180, // Flight Performance and Planning
  8: 210, // Aircraft General Knowledge
  9: 120  // Navigation
};

// Dynamic syllabus scope calculation based on actual LOs
export const getDynamicSyllabusScope = (los: EasaLO[], subjectId?: number): Record<number, number> => {
  const scope: Record<number, number> = {};

  // Calculate actual LO count per subject
  const subjectCounts = los.reduce((acc, lo) => {
    if (!lo.subject_id) return acc; // skip LOs without valid subject_id
    acc[lo.subject_id] = (acc[lo.subject_id] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  // Use actual counts, fallback to static SYLLABUS_SCOPE if no data
  Object.keys(SYLLABUS_SCOPE).forEach(key => {
    const id = parseInt(key);
    scope[id] = subjectCounts[id] || SYLLABUS_SCOPE[id];
  });

  return scope;
};

// Get subject-specific analysis
export const getSubjectAnalysis = (los: EasaLO[], subjectId: number, coveredLOs: Set<string>) => {
  const subjectLOs = los.filter(lo => lo.subject_id === subjectId);
  const coveredSubjectLOs = subjectLOs.filter(lo => coveredLOs.has(lo.id));

  return {
    total: subjectLOs.length,
    covered: coveredSubjectLOs.length,
    percentage: subjectLOs.length > 0 ? Math.round((coveredSubjectLOs.length / subjectLOs.length) * 100) : 0,
    remaining: subjectLOs.length - coveredSubjectLOs.length,
    gaps: subjectLOs.filter(lo => !coveredLOs.has(lo.id))
  };
};

export const SUBJECT_NAMES: Record<number, string> = {
  1: 'Air Law (010)',
  2: 'Human Performance (040)',
  3: 'Meteorology (050)',
  4: 'Communications (090)',
  5: 'Principles of Flight (081)',
  6: 'Operational Procedures (070)',
  7: 'Flight Performance & Planning (033)',
  8: 'Aircraft General Knowledge (021)',
  9: 'Navigation (061)',
};

export interface SyllabusLONode {
  lo: EasaLO;
  licenseType: 'PPL' | 'SPL' | 'BOTH';
}

export interface SyllabusSubtopicNode {
  code: string; // e.g. "010.01.01"
  label: string;
  los: SyllabusLONode[];
}

export interface SyllabusTopicNode {
  code: string; // e.g. "010.01"
  label: string;
  subtopics: SyllabusSubtopicNode[];
}

export interface SyllabusSubjectNode {
  subjectId: number;
  name: string;
  topics: SyllabusTopicNode[];
  totalLOs: number;
  licenseLOs: number;
}

export function buildSyllabusTree(los: EasaLO[]): SyllabusSubjectNode[] {
  const subjectMap = new Map<number, Map<string, Map<string, SyllabusLONode[]>>>();

  for (const lo of los) {
    if (!lo.subject_id) continue; // skip LOs without valid subject_id
    const sid = lo.subject_id;
    const parts = lo.id.split('.');
    const topicCode = parts.slice(0, 2).join('.');
    const subtopicCode = parts.slice(0, 3).join('.');

    const appliesToPPL = (lo.applies_to || ['PPL', 'SPL']).includes('PPL');
    const appliesToSPL = (lo.applies_to || ['PPL', 'SPL']).includes('SPL');
    const licenseType: 'PPL' | 'SPL' | 'BOTH' =
      appliesToPPL && appliesToSPL ? 'BOTH' : appliesToPPL ? 'PPL' : 'SPL';

    if (!subjectMap.has(sid)) subjectMap.set(sid, new Map());
    const topicMap = subjectMap.get(sid)!;
    if (!topicMap.has(topicCode)) topicMap.set(topicCode, new Map());
    const subtopicMap = topicMap.get(topicCode)!;
    if (!subtopicMap.has(subtopicCode)) subtopicMap.set(subtopicCode, []);
    subtopicMap.get(subtopicCode)!.push({ lo, licenseType });
  }

  const result: SyllabusSubjectNode[] = [];
  for (const [sid, topicMap] of Array.from(subjectMap.entries()).sort((a, b) => a[0] - b[0])) {
    const topics: SyllabusTopicNode[] = [];
    for (const [topicCode, subtopicMap] of Array.from(topicMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      const subtopics: SyllabusSubtopicNode[] = [];
      for (const [subtopicCode, loNodes] of Array.from(subtopicMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
        subtopics.push({
          code: subtopicCode,
          label: loNodes[0]?.lo?.text?.split(':')[0].trim() || subtopicCode,
          los: loNodes,
        });
      }
      topics.push({
        code: topicCode,
        label: subtopics[0]?.los[0]?.lo?.text?.split(':')[0].trim() || topicCode,
        subtopics,
      });
    }
    const allLOs = topics.flatMap(t => t.subtopics.flatMap(s => s.los));
    result.push({
      subjectId: sid,
      name: SUBJECT_NAMES[sid] || `Subject ${sid}`,
      topics,
      totalLOs: allLOs.length,
      licenseLOs: allLOs.length,
    });
  }
  return result;
}

export const mockLOs: EasaLO[] = [
  // Subject 1: Air Law (010) — shared PPL+SPL
  { id: "010.01.01.01", text: "International Agreements and Organizations: ICAO", context: "The Convention on International Civil Aviation (Chicago Convention).", subject_id: 1, applies_to: ["PPL", "SPL"] },
  { id: "010.01.02.01", text: "Annex 2: Rules of the Air", context: "Visual Flight Rules (VFR) and Instrument Flight Rules (IFR).", subject_id: 1, applies_to: ["PPL", "SPL"] },
  { id: "010.01.03.01", text: "Annex 7: Aircraft Nationality and Registration Marks", context: "Registration of aircraft and display of marks.", subject_id: 1, applies_to: ["PPL", "SPL"] },
  { id: "010.01.04.01", text: "Annex 8: Airworthiness of Aircraft", context: "Certificate of Airworthiness and maintenance requirements.", subject_id: 1, applies_to: ["PPL", "SPL"] },
  { id: "010.02.01.01", text: "Personnel Licensing: Part-FCL", context: "Requirements for PPL, CPL, and ATPL licenses.", subject_id: 1, applies_to: ["PPL", "SPL"] },
  { id: "010.02.02.01", text: "Medical Requirements: Part-MED", context: "Medical certificates and fitness requirements.", subject_id: 1, applies_to: ["PPL", "SPL"] },
  { id: "010.03.01.01", text: "Rules of the Air: Right of Way", context: "Rules for avoiding collisions in the air and on the ground.", subject_id: 1, applies_to: ["PPL", "SPL"] },
  { id: "010.03.02.01", text: "VFR Flight Plan", context: "Requirements for filing and closing a flight plan.", subject_id: 1, applies_to: ["PPL", "SPL"] },
  { id: "010.04.01.01", text: "Air Traffic Services: Air Traffic Control", context: "Control areas, control zones, and advisory services.", subject_id: 1, applies_to: ["PPL", "SPL"] },
  { id: "010.04.02.01", text: "Altimeter Setting Procedures", context: "QNH, QFE, and Standard Altimeter Setting (1013.25 hPa).", subject_id: 1, applies_to: ["PPL", "SPL"] },
  { id: "010.05.01.01", text: "Aeronautical Information Service (AIS)", context: "NOTAMs, AICs, and AIP structure.", subject_id: 1, applies_to: ["PPL", "SPL"] },
  { id: "010.06.01.01", text: "Aerodromes: Markings and Lighting", context: "Runway and taxiway markings, PAPI, and approach lighting.", subject_id: 1, applies_to: ["PPL", "SPL"] },
  { id: "010.07.01.01", text: "Search and Rescue (SAR)", context: "Organization and procedures for SAR operations.", subject_id: 1, applies_to: ["PPL", "SPL"] },
  { id: "010.08.01.01", text: "Aircraft Accident Investigation", context: "Objective of investigation and reporting requirements.", subject_id: 1, applies_to: ["PPL", "SPL"] },
  { id: "010.09.01.01", text: "National Law: Aviation Act", context: "Specific national regulations and authorities.", subject_id: 1, applies_to: ["PPL", "SPL"] },
  { id: "010.10.01.01", text: "Security: Annex 17", context: "Measures to prevent unlawful interference.", subject_id: 1, applies_to: ["PPL", "SPL"] },
  { id: "010.11.01.01", text: "Customs and Immigration", context: "Procedures for international flights.", subject_id: 1, applies_to: ["PPL"] },
  { id: "010.12.01.01", text: "Airspace Classification", context: "Classes A through G and their requirements.", subject_id: 1, applies_to: ["PPL", "SPL"] },
  { id: "010.13.01.01", text: "Interception of Civil Aircraft", context: "Signals and procedures during interception.", subject_id: 1, applies_to: ["PPL"] },
  { id: "010.14.01.01", text: "Entry and Departure of Aircraft", context: "Documents required for international entry.", subject_id: 1, applies_to: ["PPL"] },

  // Subject 2: Human Performance (040) — shared PPL+SPL
  { id: "040.01.01.01", text: "Basic Physiology: The Atmosphere", context: "Composition of air and pressure changes with altitude.", subject_id: 2, applies_to: ["PPL", "SPL"] },
  { id: "040.01.02.01", text: "Respiratory System: Hypoxia", context: "Symptoms and effects of oxygen deficiency at altitude.", subject_id: 2, applies_to: ["PPL", "SPL"] },
  { id: "040.01.03.01", text: "Circulatory System: G-effects", context: "Effects of acceleration on blood flow and consciousness.", subject_id: 2, applies_to: ["PPL", "SPL"] },
  { id: "040.01.04.01", text: "The Eye: Visual Illusions", context: "Empty field myopia, autokinesis, and runway illusions.", subject_id: 2, applies_to: ["PPL", "SPL"] },
  { id: "040.01.05.01", text: "The Ear: Spatial Disorientation", context: "Vestibular system and illusions like 'the leans'.", subject_id: 2, applies_to: ["PPL", "SPL"] },
  { id: "040.02.01.01", text: "Basic Psychology: Information Processing", context: "Attention, memory, and decision-making models.", subject_id: 2, applies_to: ["PPL", "SPL"] },
  { id: "040.02.02.01", text: "Human Error and Reliability", context: "SHEL model and Reason's Swiss Cheese model.", subject_id: 2, applies_to: ["PPL", "SPL"] },
  { id: "040.02.03.01", text: "Stress and Fatigue Management", context: "Symptoms of stress and strategies for fatigue mitigation.", subject_id: 2, applies_to: ["PPL", "SPL"] },
  { id: "040.02.04.01", text: "Communication and Teamwork (CRM)", context: "Effective communication and leadership in the cockpit.", subject_id: 2, applies_to: ["PPL", "SPL"] },
  { id: "040.03.01.01", text: "Sleep and Circadian Rhythms", context: "Jet lag and the importance of sleep hygiene.", subject_id: 2, applies_to: ["PPL", "SPL"] },
  { id: "040.04.01.01", text: "Health and Hygiene: Diet and Exercise", context: "Maintaining physical fitness for flight duties.", subject_id: 2, applies_to: ["PPL", "SPL"] },
  { id: "040.04.02.01", text: "Drugs and Alcohol", context: "Effects of substances on performance and legal limits.", subject_id: 2, applies_to: ["PPL", "SPL"] },
  { id: "040.05.01.01", text: "Judgment and Decision Making", context: "The DECIDE model and cognitive biases.", subject_id: 2, applies_to: ["PPL", "SPL"] },
  { id: "040.06.01.01", text: "Situational Awareness", context: "Maintaining a mental model of the flight environment.", subject_id: 2, applies_to: ["PPL", "SPL"] },
  { id: "040.07.01.01", text: "Personality and Attitudes", context: "Hazardous attitudes (macho, impulsive, etc.) and their antidotes.", subject_id: 2, applies_to: ["PPL", "SPL"] },

  // Subject 3: Meteorology (050)
  { id: "050.01.01.01", text: "The Atmosphere: Composition and Structure", context: "Troposphere, tropopause, and temperature lapse rates.", subject_id: 3, applies_to: ["PPL", "SPL"] },
  { id: "050.01.02.01", text: "Air Pressure: Isobars and Gradients", context: "High and low pressure systems and wind direction.", subject_id: 3, applies_to: ["PPL", "SPL"] },
  { id: "050.01.03.01", text: "Air Density and Humidity", context: "Dew point, relative humidity, and density altitude.", subject_id: 3, applies_to: ["PPL", "SPL"] },
  { id: "050.02.01.01", text: "Wind: Coriolis Force and Friction", context: "Geostrophic wind and surface wind behavior.", subject_id: 3, applies_to: ["PPL", "SPL"] },
  { id: "050.02.02.01", text: "Local Winds: Sea Breeze and Anabatic Wind", context: "Diurnal wind changes in coastal and mountainous areas.", subject_id: 3, applies_to: ["PPL", "SPL"] },
  { id: "050.03.01.01", text: "Thermodynamics: Adiabatic Processes", context: "DALR and SALR lapse rates.", subject_id: 3, applies_to: ["PPL", "SPL"] },
  { id: "050.03.02.01", text: "Clouds and Precipitation", context: "Cloud classification and formation mechanisms.", subject_id: 3, applies_to: ["PPL", "SPL"] },
  { id: "050.04.01.01", text: "Air Masses and Fronts", context: "Cold, warm, and occluded fronts.", subject_id: 3, applies_to: ["PPL", "SPL"] },
  { id: "050.05.01.01", text: "Meteorological Hazards: Icing", context: "Rime ice, clear ice, and freezing rain.", subject_id: 3, applies_to: ["PPL", "SPL"] },
  { id: "050.05.02.01", text: "Thunderstorms and Turbulence", context: "Stages of a thunderstorm and microbursts.", subject_id: 3, applies_to: ["PPL", "SPL"] },
  { id: "050.06.01.01", text: "Meteorological Information: METAR and TAF", context: "Decoding weather reports and forecasts.", subject_id: 3, applies_to: ["PPL", "SPL"] },
  { id: "050.06.02.01", text: "Weather Charts: SWC and Upper Wind", context: "Significant Weather Charts and wind/temp charts.", subject_id: 3, applies_to: ["PPL"] },
  { id: "050.07.01.01", text: "Visibility: Fog and Mist", context: "Radiation fog, advection fog, and upslope fog.", subject_id: 3, applies_to: ["PPL", "SPL"] },
  { id: "050.08.01.01", text: "Jet Streams and CAT", context: "Clear Air Turbulence and high-altitude winds.", subject_id: 3, applies_to: ["PPL"] },
  { id: "050.09.01.01", text: "Tropical Meteorology", context: "Hurricanes, typhoons, and the ITCZ.", subject_id: 3, applies_to: ["PPL"] },
  { id: "050.10.01.01", text: "Mountain Waves and Foehn", context: "Orographic effects on weather and turbulence.", subject_id: 3, applies_to: ["PPL", "SPL"] },
  { id: "050.11.01.01", text: "Altimetry and Pressure Changes", context: "D-value and altimeter errors due to temperature.", subject_id: 3, applies_to: ["PPL", "SPL"] },

  // Subject 4: Communications (090) — shared PPL+SPL
  { id: "090.01.01.01", text: "VFR Communications: General Procedures", context: "Radio frequency bands and call signs.", subject_id: 4, applies_to: ["PPL", "SPL"] },
  { id: "090.01.02.01", text: "Standard Phraseology", context: "Standard words and phrases used in aviation.", subject_id: 4, applies_to: ["PPL", "SPL"] },
  { id: "090.01.03.01", text: "Departure and En-route Procedures", context: "Initial call, position reports, and frequency changes.", subject_id: 4, applies_to: ["PPL", "SPL"] },
  { id: "090.01.04.01", text: "Arrival and Circuit Procedures", context: "Joining the circuit and landing clearances.", subject_id: 4, applies_to: ["PPL", "SPL"] },
  { id: "090.01.05.01", text: "Distress and Urgency Procedures", context: "MAYDAY and PAN-PAN calls.", subject_id: 4, applies_to: ["PPL", "SPL"] },
  { id: "090.01.06.01", text: "Communication Failure Procedures", context: "Procedures when radio contact is lost.", subject_id: 4, applies_to: ["PPL", "SPL"] },
  { id: "090.01.07.01", text: "Meteorological Terms used in Radiotelephony", context: "CAVOK, NOSIG, and other weather terms.", subject_id: 4, applies_to: ["PPL", "SPL"] },
  { id: "090.01.08.01", text: "Transmission of Numbers and Time", context: "Phonetic alphabet and UTC time transmission.", subject_id: 4, applies_to: ["PPL", "SPL"] },
  { id: "090.01.09.01", text: "Test Procedures and Read-back Requirements", context: "Items that must be read back by the pilot.", subject_id: 4, applies_to: ["PPL", "SPL"] },
  { id: "090.01.10.01", text: "VHF Propagation and Range", context: "Line of sight propagation and factors affecting range.", subject_id: 4, applies_to: ["PPL", "SPL"] },
  { id: "090.02.01.01", text: "Relay of Messages", context: "Procedures for passing messages through other aircraft.", subject_id: 4, applies_to: ["PPL", "SPL"] },
  { id: "090.03.01.01", text: "Conditional Clearances", context: "Format and limitations of conditional instructions.", subject_id: 4, applies_to: ["PPL", "SPL"] },

  // Subject 5: Principles of Flight (081)
  { id: "081.01.01.01", text: "Subsonic Aerodynamics: Bernoulli's Principle", context: "Relationship between pressure and velocity in airflow.", subject_id: 5, applies_to: ["PPL", "SPL"] },
  { id: "081.01.02.01", text: "Lift and Drag: Angle of Attack", context: "The lift curve and the stall angle.", subject_id: 5, applies_to: ["PPL", "SPL"] },
  { id: "081.01.03.01", text: "Boundary Layer and Skin Friction", context: "Laminar and turbulent flow over the wing surface — especially relevant for laminar glider aerofoils.", subject_id: 5, applies_to: ["PPL", "SPL"] },
  { id: "081.02.01.01", text: "Stability: Static and Dynamic", context: "Longitudinal, lateral, and directional stability.", subject_id: 5, applies_to: ["PPL", "SPL"] },
  { id: "081.02.02.01", text: "Control: Ailerons, Elevator, Rudder", context: "Primary control surfaces and their axes of movement.", subject_id: 5, applies_to: ["PPL", "SPL"] },
  { id: "081.03.01.01", text: "High Lift Devices: Flaps and Slats", context: "Increasing lift coefficient for takeoff and landing.", subject_id: 5, applies_to: ["PPL"] },
  { id: "081.04.01.01", text: "The Stall: Symptoms and Recovery", context: "Airflow separation and loss of lift.", subject_id: 5, applies_to: ["PPL", "SPL"] },
  { id: "081.04.02.01", text: "Spin: Entry and Recovery", context: "Auto-rotation and standard recovery procedures.", subject_id: 5, applies_to: ["PPL", "SPL"] },
  { id: "081.05.01.01", text: "Flight Mechanics: Level Flight and Turns", context: "Forces in a steady turn and load factor.", subject_id: 5, applies_to: ["PPL", "SPL"] },
  { id: "081.05.02.01", text: "Climb and Glide Performance", context: "Best rate of climb (Vy) and best angle of climb (Vx); glide ratio and best L/D speed for SPL.", subject_id: 5, applies_to: ["PPL", "SPL"] },
  { id: "081.06.01.01", text: "Propellers: Torque and P-factor", context: "Asymmetric blade effect and gyroscopic precession.", subject_id: 5, applies_to: ["PPL"] },
  { id: "081.07.01.01", text: "Ground Effect", context: "Reduction in induced drag near the surface.", subject_id: 5, applies_to: ["PPL", "SPL"] },
  { id: "081.08.01.01", text: "Wing Tip Vortices and Induced Drag", context: "Formation of vortices and their impact on performance.", subject_id: 5, applies_to: ["PPL", "SPL"] },
  { id: "081.09.01.01", text: "Maneuvering Envelope: V-n Diagram", context: "Structural limits and load factor constraints.", subject_id: 5, applies_to: ["PPL", "SPL"] },
  { id: "081.10.01.01", text: "Asymmetric Flight", context: "Handling engine failure in multi-engine aircraft.", subject_id: 5, applies_to: ["PPL"] },

  // Subject 6: Operational Procedures (070)
  { id: "070.01.01.01", text: "General Requirements: Search and Rescue", context: "Emergency locator transmitters (ELT) and SAR signals.", subject_id: 6, applies_to: ["PPL", "SPL"] },
  { id: "070.01.02.01", text: "Special Operational Procedures: Icing", context: "De-icing and anti-icing on the ground and in flight.", subject_id: 6, applies_to: ["PPL", "SPL"] },
  { id: "070.01.03.01", text: "Bird Strike Risk and Avoidance", context: "Procedures for reporting and avoiding bird strikes.", subject_id: 6, applies_to: ["PPL", "SPL"] },
  { id: "070.01.04.01", text: "Noise Abatement Procedures", context: "Techniques to reduce noise impact on the ground.", subject_id: 6, applies_to: ["PPL", "SPL"] },
  { id: "070.01.05.01", text: "Fire and Smoke Procedures", context: "Use of fire extinguishers and emergency descents.", subject_id: 6, applies_to: ["PPL", "SPL"] },
  { id: "070.01.06.01", text: "Windshear and Microburst Avoidance", context: "Recognizing and recovering from windshear.", subject_id: 6, applies_to: ["PPL", "SPL"] },
  { id: "070.01.07.01", text: "Wake Turbulence Categories", context: "Separation minima for different aircraft weights.", subject_id: 6, applies_to: ["PPL"] },
  { id: "070.01.08.01", text: "Emergency Landing and Ditching", context: "Procedures for forced landings on land and water.", subject_id: 6, applies_to: ["PPL", "SPL"] },
  { id: "070.01.09.01", text: "Fuel Jettisoning and Emergency Fuel", context: "Procedures for fuel dumping and declaring fuel emergency.", subject_id: 6, applies_to: ["PPL"] },
  { id: "070.01.10.01", text: "Carriage of Dangerous Goods", context: "Regulations for transporting hazardous materials.", subject_id: 6, applies_to: ["PPL", "SPL"] },
  { id: "070.02.01.01", text: "Refuelling with Passengers Onboard", context: "Safety precautions and requirements.", subject_id: 6, applies_to: ["PPL"] },
  { id: "070.03.01.01", text: "Security Procedures: Unruly Passengers", context: "Managing disruptive behavior in flight.", subject_id: 6, applies_to: ["PPL"] },

  // Subject 7: Flight Performance and Planning (033)
  { id: "033.01.01.01", text: "Mass and Balance: Definitions", context: "Basic Empty Mass, Zero Fuel Mass, and MTOW.", subject_id: 7, applies_to: ["PPL", "SPL"] },
  { id: "033.01.02.01", text: "Center of Gravity (CG) Calculation", context: "Using the moment arm method to find the CG.", subject_id: 7, applies_to: ["PPL", "SPL"] },
  { id: "033.02.01.01", text: "Performance: Take-off and Landing", context: "Factors affecting takeoff distance (wind, slope, temp); for SPL includes winch and aerotow launch performance.", subject_id: 7, applies_to: ["PPL", "SPL"] },
  { id: "033.02.02.01", text: "Cruise Performance: Range and Endurance", context: "Fuel consumption and best range speed; for SPL this covers glide ratio and cross-country distance.", subject_id: 7, applies_to: ["PPL", "SPL"] },
  { id: "033.03.01.01", text: "Flight Planning: Fuel Requirements", context: "Trip fuel, contingency fuel, and final reserve.", subject_id: 7, applies_to: ["PPL"] },
  { id: "033.03.02.01", text: "Navigation Plan: Track and Groundspeed", context: "Calculating wind correction angle and ETE.", subject_id: 7, applies_to: ["PPL", "SPL"] },
  { id: "033.03.03.01", text: "ICAO Flight Plan Form", context: "Filling out the standard flight plan form.", subject_id: 7, applies_to: ["PPL"] },
  { id: "033.03.04.01", text: "NOTAM and AIS Briefing", context: "Interpreting NOTAMs for flight planning.", subject_id: 7, applies_to: ["PPL", "SPL"] },
  { id: "033.03.05.01", text: "Weather Briefing for Flight Planning", context: "Using METARs and TAFs to determine alternates.", subject_id: 7, applies_to: ["PPL", "SPL"] },
  { id: "033.03.06.01", text: "Point of Equal Time (PET)", context: "Calculating the point of equal time between two aerodromes.", subject_id: 7, applies_to: ["PPL"] },
  { id: "033.04.01.01", text: "VFR Navigation Log", context: "Maintaining a log of actual vs. planned times and fuel.", subject_id: 7, applies_to: ["PPL", "SPL"] },
  { id: "033.05.01.01", text: "Altimeter Setting in Flight Planning", context: "Determining transition altitude and levels.", subject_id: 7, applies_to: ["PPL", "SPL"] },

  // Subject 8: Aircraft General Knowledge (021)
  { id: "021.01.01.01", text: "Airframe: Fuselage and Wings", context: "Monocoque and semi-monocoque structures.", subject_id: 8, applies_to: ["PPL", "SPL"] },
  { id: "021.01.02.01", text: "Landing Gear: Brakes and Tires", context: "Tricycle vs. tailwheel configuration and shimmy; for SPL includes skid landing gear.", subject_id: 8, applies_to: ["PPL", "SPL"] },
  { id: "021.02.01.01", text: "Powerplant: Piston Engines", context: "The four-stroke cycle and carburetor icing.", subject_id: 8, applies_to: ["PPL"] },
  { id: "021.02.02.01", text: "Engine Systems: Ignition and Fuel", context: "Magnetos, spark plugs, and fuel injection.", subject_id: 8, applies_to: ["PPL"] },
  { id: "021.03.01.01", text: "Electrical System: Alternators and Batteries", context: "DC and AC systems, circuit breakers, and fuses.", subject_id: 8, applies_to: ["PPL", "SPL"] },
  { id: "021.04.01.01", text: "Instruments: Pitot-Static System", context: "Altimeter, Airspeed Indicator, and VSI.", subject_id: 8, applies_to: ["PPL", "SPL"] },
  { id: "021.04.02.01", text: "Gyroscopic Instruments", context: "Artificial Horizon, Directional Gyro, and Turn Coordinator.", subject_id: 8, applies_to: ["PPL"] },
  { id: "021.04.03.01", text: "Magnetic Compass", context: "Variation, deviation, and dip errors.", subject_id: 8, applies_to: ["PPL", "SPL"] },
  { id: "021.04.04.01", text: "Engine Instruments: Tachometer and Oil Pressure", context: "Monitoring engine health and performance.", subject_id: 8, applies_to: ["PPL"] },
  { id: "021.04.05.01", text: "Fuel Gauges and Flow Meters", context: "Measuring fuel quantity and consumption rate.", subject_id: 8, applies_to: ["PPL"] },
  { id: "021.05.01.01", text: "Hydraulic Systems", context: "Principles of Pascal's law and system components.", subject_id: 8, applies_to: ["PPL"] },
  { id: "021.06.01.01", text: "Pneumatic Systems", context: "Use of compressed air for various aircraft systems.", subject_id: 8, applies_to: ["PPL"] },
  { id: "021.07.01.01", text: "Heating and Ventilation", context: "Cabin environmental control systems.", subject_id: 8, applies_to: ["PPL"] },

  // Subject 1: Air Law (010) - Continued
  { id: "010.15.01.01", text: "Facilitation: Annex 9", context: "Simplification of formalities for entry and departure.", subject_id: 1, applies_to: ["PPL"] },
  { id: "010.16.01.01", text: "Air Traffic Services: Flight Information Service", context: "Provision of advice and information useful for the safe and efficient conduct of flights.", subject_id: 1, applies_to: ["PPL", "SPL"] },
  { id: "010.17.01.01", text: "Alerting Service", context: "Notification of organizations regarding aircraft in need of search and rescue aid.", subject_id: 1, applies_to: ["PPL", "SPL"] },
  { id: "010.18.01.01", text: "Visual Signals", context: "Signals for aerodrome traffic and marshalling signals.", subject_id: 1, applies_to: ["PPL", "SPL"] },
  { id: "010.19.01.01", text: "Unlawful Interference", context: "Procedures to be followed by pilots in case of hijacking.", subject_id: 1, applies_to: ["PPL"] },

  // Subject 2: Human Performance (040) - Continued
  { id: "040.08.01.01", text: "Cognitive Biases in Aviation", context: "Confirmation bias, availability heuristic, and overconfidence.", subject_id: 2, applies_to: ["PPL", "SPL"] },
  { id: "040.09.01.01", text: "Workload Management", context: "Prioritization of tasks during high-workload phases of flight.", subject_id: 2, applies_to: ["PPL", "SPL"] },
  { id: "040.10.01.01", text: "Automation and Human-Machine Interface", context: "Mode awareness and the dangers of automation complacency.", subject_id: 2, applies_to: ["PPL"] },
  { id: "040.11.01.01", text: "Toxicology: Carbon Monoxide", context: "Sources and symptoms of CO poisoning in the cockpit.", subject_id: 2, applies_to: ["PPL", "SPL"] },
  { id: "040.12.01.01", text: "Hyperventilation", context: "Causes, symptoms, and corrective actions for over-breathing.", subject_id: 2, applies_to: ["PPL", "SPL"] },

  // Subject 3: Meteorology (050) - Continued
  { id: "050.12.01.01", text: "Global Wind Patterns: Trade Winds", context: "The Hadley cell and prevailing wind systems.", subject_id: 3, applies_to: ["PPL"] },
  { id: "050.13.01.01", text: "Air Mass Thunderstorms vs. Frontal Thunderstorms", context: "Differentiation in formation and behavior.", subject_id: 3, applies_to: ["PPL", "SPL"] },
  { id: "050.14.01.01", text: "Squall Lines and Pre-frontal Weather", context: "Severe weather associated with fast-moving cold fronts.", subject_id: 3, applies_to: ["PPL", "SPL"] },
  { id: "050.15.01.01", text: "Upper Air Charts: 500 hPa and 300 hPa", context: "Interpreting constant pressure charts for high-altitude flight.", subject_id: 3, applies_to: ["PPL"] },
  { id: "050.16.01.01", text: "Volcanic Ash and Flight Safety", context: "Hazards of volcanic ash and reporting procedures.", subject_id: 3, applies_to: ["PPL"] },

  // Subject 4: Communications (090) - Continued
  { id: "090.04.01.01", text: "Radio Direction Finding (RDF)", context: "Principles of VDF and its use in navigation.", subject_id: 4, applies_to: ["PPL"] },
  { id: "090.05.01.01", text: "SELCAL and Data Link Communications", context: "Modern communication systems in commercial aviation.", subject_id: 4, applies_to: ["PPL"] },
  { id: "090.06.01.01", text: "Language Proficiency Requirements", context: "ICAO English levels and their importance.", subject_id: 4, applies_to: ["PPL", "SPL"] },
  { id: "090.07.01.01", text: "Blind Transmission Procedures", context: "Procedures when receiving but not transmitting.", subject_id: 4, applies_to: ["PPL", "SPL"] },

  // Subject 5: Principles of Flight (081) - Continued
  { id: "081.11.01.01", text: "Transonic Aerodynamics: Critical Mach Number", context: "Airflow behavior as it approaches the speed of sound.", subject_id: 5, applies_to: ["PPL"] },
  { id: "081.12.01.01", text: "Supersonic Flight: Shock Waves", context: "Formation of compression and expansion waves.", subject_id: 5, applies_to: ["PPL"] },
  { id: "081.13.01.01", text: "Wing Sweep and its Effects", context: "Advantages and disadvantages of swept-back wings.", subject_id: 5, applies_to: ["PPL"] },
  { id: "081.14.01.01", text: "Vortex Generators and Boundary Layer Control", context: "Devices used to delay airflow separation.", subject_id: 5, applies_to: ["PPL", "SPL"] },

  // Subject 6: Operational Procedures (070) - Continued
  { id: "070.04.01.01", text: "Minimum Equipment List (MEL)", context: "Operating with inoperative equipment.", subject_id: 6, applies_to: ["PPL"] },
  { id: "070.05.01.01", text: "Master Minimum Equipment List (MMEL)", context: "The basis for the operator's MEL.", subject_id: 6, applies_to: ["PPL"] },
  { id: "070.06.01.01", text: "Standard Operating Procedures (SOPs)", context: "Importance of standardized checklists and flows.", subject_id: 6, applies_to: ["PPL", "SPL"] },
  { id: "070.07.01.01", text: "Long Range Flights: ETOPS", context: "Extended-range Twin-engine Operational Performance Standards.", subject_id: 6, applies_to: ["PPL"] },

  // Subject 7: Flight Performance and Planning (033) - Continued
  { id: "033.06.01.01", text: "Runway Surface Conditions and Braking Action", context: "Impact of water, ice, and snow on landing distance.", subject_id: 7, applies_to: ["PPL", "SPL"] },
  { id: "033.07.01.01", text: "Climb Gradient vs. Rate of Climb", context: "Understanding the difference for obstacle clearance.", subject_id: 7, applies_to: ["PPL", "SPL"] },
  { id: "033.08.01.01", text: "Specific Range and Fuel Economy", context: "Optimizing flight parameters for minimum fuel burn.", subject_id: 7, applies_to: ["PPL"] },
  { id: "033.09.01.01", text: "Computerized Flight Plans (CFP)", context: "Interpreting automated flight planning outputs.", subject_id: 7, applies_to: ["PPL"] },

  // Subject 8: Aircraft General Knowledge (021) - Continued
  { id: "021.08.01.01", text: "Fire Detection and Extinguishing Systems", context: "Engine and cargo bay fire protection.", subject_id: 8, applies_to: ["PPL", "SPL"] },
  { id: "021.09.01.01", text: "Oxygen Systems: Crew and Passenger", context: "Diluter-demand vs. continuous flow systems.", subject_id: 8, applies_to: ["PPL"] },
  { id: "021.10.01.01", text: "Ice and Rain Protection Systems", context: "Anti-ice vs. de-ice and windshield wipers.", subject_id: 8, applies_to: ["PPL"] },
  { id: "021.11.01.01", text: "Auxiliary Power Unit (APU)", context: "Functions and operation of the onboard generator.", subject_id: 8, applies_to: ["PPL"] },
  { id: "021.12.01.01", text: "Fly-by-Wire Systems", context: "Electronic control of flight surfaces and flight envelope protection.", subject_id: 8, applies_to: ["PPL"] },

  // Subject 9: Navigation (061)
  { id: "061.01.01.01", text: "General Navigation: The Earth", context: "Latitude, longitude, and great circles.", subject_id: 9, applies_to: ["PPL", "SPL"] },
  { id: "061.01.02.01", text: "Aeronautical Charts: Lambert and Mercator", context: "Properties of different map projections.", subject_id: 9, applies_to: ["PPL", "SPL"] },
  { id: "061.02.01.01", text: "Dead Reckoning: The Triangle of Velocities", context: "Heading, track, wind, and airspeed relationship.", subject_id: 9, applies_to: ["PPL", "SPL"] },
  { id: "061.02.02.01", text: "Time and Distance Calculations", context: "Using the flight computer (E6B) for navigation.", subject_id: 9, applies_to: ["PPL", "SPL"] },
  { id: "061.03.01.01", text: "Radio Navigation: VOR and DME", context: "Using radial navigation and distance measuring equipment.", subject_id: 9, applies_to: ["PPL"] },
  { id: "061.03.02.01", text: "Global Navigation Satellite System (GNSS)", context: "GPS principles and RAIM.", subject_id: 9, applies_to: ["PPL", "SPL"] },
  { id: "061.03.03.01", text: "ADF and NDB Navigation", context: "Relative bearing and tracking to/from a station.", subject_id: 9, applies_to: ["PPL"] },
  { id: "061.03.04.01", text: "Radar Principles: Primary and Secondary", context: "How radar works and the use of transponders.", subject_id: 9, applies_to: ["PPL", "SPL"] },
  { id: "061.03.05.01", text: "Instrument Landing System (ILS)", context: "Localizer and glide path indications.", subject_id: 9, applies_to: ["PPL"] },
  { id: "061.03.06.01", text: "Area Navigation (RNAV)", context: "Principles of navigating between waypoints.", subject_id: 9, applies_to: ["PPL"] },
  { id: "061.04.01.01", text: "Solar System and Time", context: "Sunrise, sunset, and twilight definitions.", subject_id: 9, applies_to: ["PPL", "SPL"] },
  { id: "061.05.01.01", text: "Navigation during Climb and Descent", context: "Calculating average groundspeed and fuel.", subject_id: 9, applies_to: ["PPL", "SPL"] },

  // Subject 9: Navigation (061) - Continued
  { id: "061.06.01.01", text: "Inertial Navigation Systems (INS/IRS)", context: "Principles of accelerometers and gyroscopes.", subject_id: 9, applies_to: ["PPL"] },
  { id: "061.07.01.01", text: "Flight Management System (FMS)", context: "Integration of navigation, performance, and guidance.", subject_id: 9, applies_to: ["PPL"] },
  { id: "061.08.01.01", text: "Electronic Flight Instrument System (EFIS)", context: "Primary Flight Display (PFD) and Navigation Display (ND).", subject_id: 9, applies_to: ["PPL"] },
  { id: "061.09.01.01", text: "Performance Based Navigation (PBN)", context: "RNAV and RNP specifications.", subject_id: 9, applies_to: ["PPL"] },

  // Subject 8: Aircraft General Knowledge (021) - Batch 2
  { id: "021.13.01.01", text: "Fuel Systems: Tanks and Pumps", context: "Fuel storage, venting, and delivery to the engine.", subject_id: 8, applies_to: ["PPL"] },
  { id: "021.13.02.01", text: "Fuel Contamination and Testing", context: "Detecting water and sediment in fuel samples.", subject_id: 8, applies_to: ["PPL"] },
  { id: "021.14.01.01", text: "Propeller Pitch Control", context: "Fixed-pitch vs. constant-speed propellers and governors.", subject_id: 8, applies_to: ["PPL"] },
  { id: "021.15.01.01", text: "Engine Cooling Systems", context: "Air-cooled vs. liquid-cooled engines and cowl flaps.", subject_id: 8, applies_to: ["PPL"] },
  { id: "021.16.01.01", text: "Lubrication Systems", context: "Wet sump vs. dry sump and oil pressure regulation.", subject_id: 8, applies_to: ["PPL"] },
  { id: "021.17.01.01", text: "Turbocharging and Supercharging", context: "Maintaining engine power at high altitudes.", subject_id: 8, applies_to: ["PPL"] },
  { id: "021.18.01.01", text: "Gas Turbine Engines: Principles", context: "The Brayton cycle and thrust generation.", subject_id: 8, applies_to: ["PPL"] },
  { id: "021.18.02.01", text: "Turbofan vs. Turbojet", context: "Bypass ratio and efficiency considerations.", subject_id: 8, applies_to: ["PPL"] },
  { id: "021.19.01.01", text: "Engine Starting Systems", context: "Electric starters and pneumatic start procedures.", subject_id: 8, applies_to: ["PPL"] },
  { id: "021.20.01.01", text: "Thrust Reversers", context: "Aerodynamic and mechanical thrust reversal systems.", subject_id: 8, applies_to: ["PPL"] },
  { id: "021.21.01.01", text: "Glass Cockpit: Primary Flight Display (PFD)", context: "Integration of flight data on electronic displays.", subject_id: 8, applies_to: ["PPL"] },
  { id: "021.21.02.01", text: "Multi-Function Display (MFD)", context: "Engine monitoring and navigation data presentation.", subject_id: 8, applies_to: ["PPL"] },
  { id: "021.22.01.01", text: "Warning and Caution Systems", context: "Master caution, master warning, and aural alerts.", subject_id: 8, applies_to: ["PPL", "SPL"] },
  { id: "021.23.01.01", text: "Emergency Equipment: Life Rafts", context: "Requirements for overwater flights.", subject_id: 8, applies_to: ["PPL"] },
  { id: "021.24.01.01", text: "Emergency Lighting", context: "Floor path marking and exit lighting systems.", subject_id: 8, applies_to: ["PPL"] },

  // Subject 1: Air Law (010) - Batch 2
  { id: "010.20.01.01", text: "Airspace Restrictions: Prohibited Areas", context: "Definitions and flight restrictions in P-areas.", subject_id: 1, applies_to: ["PPL", "SPL"] },
  { id: "010.20.02.01", text: "Restricted and Danger Areas", context: "Flight procedures for R and D airspaces.", subject_id: 1, applies_to: ["PPL", "SPL"] },
  { id: "010.21.01.01", text: "Visual Meteorological Conditions (VMC)", context: "Minima for visibility and distance from clouds.", subject_id: 1, applies_to: ["PPL", "SPL"] },
  { id: "010.22.01.01", text: "Special VFR", context: "Requirements and limitations for SVFR flights.", subject_id: 1, applies_to: ["PPL", "SPL"] },
  { id: "010.23.01.01", text: "Night VFR Requirements", context: "Equipment and licensing for night operations.", subject_id: 1, applies_to: ["PPL", "SPL"] },

  // Subject 3: Meteorology (050) - Batch 2
  { id: "050.17.01.01", text: "Upper Air Winds: Thermal Wind", context: "Vertical wind shear and temperature gradients.", subject_id: 3, applies_to: ["PPL"] },
  { id: "050.18.01.01", text: "Stability: Conditional Instability", context: "Atmospheric conditions leading to convective activity — thermal forecasting critical for SPL cross-country.", subject_id: 3, applies_to: ["PPL", "SPL"] },
  { id: "050.19.01.01", text: "Inversions: Surface and Subsidence", context: "Impact on visibility and aircraft performance; inversion height affects soaring ceiling for SPL.", subject_id: 3, applies_to: ["PPL", "SPL"] },
  { id: "050.20.01.01", text: "Optical Phenomena: Halos and Glories", context: "Meteorological causes of light refraction/reflection.", subject_id: 3, applies_to: ["PPL", "SPL"] },

  // Subject 5: Principles of Flight (081) - Batch 2
  { id: "081.15.01.01", text: "Deep Stall (Superstall)", context: "Aerodynamic behavior of T-tail aircraft at high alpha.", subject_id: 5, applies_to: ["PPL"] },
  { id: "081.16.01.01", text: "Dutch Roll and Yaw Dampers", context: "Lateral-directional oscillation and its mitigation.", subject_id: 5, applies_to: ["PPL"] },
  { id: "081.17.01.01", text: "Mach Tuck", context: "Nose-down pitch tendency at high Mach numbers.", subject_id: 5, applies_to: ["PPL"] },
  { id: "081.18.01.01", text: "Buffet Margin", context: "The range between low-speed and high-speed buffet.", subject_id: 5, applies_to: ["PPL"] },

  // Subject 9: Navigation (061) - Batch 2
  { id: "061.10.01.01", text: "Great Circle vs. Rhumb Line", context: "Differences in distance and constant heading.", subject_id: 9, applies_to: ["PPL", "SPL"] },
  { id: "061.11.01.01", text: "Magnetic Variation and Isogonals", context: "Mapping the Earth's magnetic field.", subject_id: 9, applies_to: ["PPL", "SPL"] },
  { id: "061.12.01.01", text: "Grid Navigation in Polar Regions", context: "Navigating where magnetic compasses are unreliable.", subject_id: 9, applies_to: ["PPL"] }
];

export async function generateBatchQuestions(
  los: EasaLO[],
  questionsPerLO: number = 2,
  targetLanguage: 'EN' | 'CZ' = 'EN',
  apiKey?: string,
  model: string = "gemini-flash-latest",
  provider: AIProvider = 'gemini',
  license: 'PPL' | 'SPL' = 'PPL',
  signal?: AbortSignal,
  proxyUrl?: string,
  idToken?: string
): Promise<{ loId: string, questions: Partial<Question>[] }[]> {

  const pplExamples = `
    EASA ECQB Official Sample Examples — PPL(A) Pattern:

    Example 1 (PPL - Aircraft General Knowledge):
    LO: 021.02.01.01 Powerplant: Piston Engines
    {
      "text": "What is the primary cause of carburetor icing in a piston engine?",
      "option_a": "High ambient temperature and low humidity",
      "option_b": "Fuel vaporization causing temperature drop below dew point",
      "option_c": "Excessive mixture richness at cruise power",
      "option_d": "Magneto failure at low RPM",
      "correct_option": "B",
      "explanation": "Fuel vaporization in the carburetor venturi causes a temperature drop of up to 25°C, which can cause ice to form even at ambient temperatures up to +30°C.",
      "metadata": { "applies_to": ["PPL"], "license_note": null }
    }

    Example 2 (PPL - Navigation):
    LO: 061.03.01.01 Radio Navigation: VOR and DME
    {
      "text": "A pilot tracking inbound on the 090 radial of a VOR will fly a heading of approximately:",
      "option_a": "090°",
      "option_b": "270°",
      "option_c": "180°",
      "option_d": "360°",
      "correct_option": "B",
      "explanation": "Radials are defined FROM the VOR station. To track inbound on the 090 radial, the pilot flies TOWARD the station on a magnetic heading of 270°.",
      "metadata": { "applies_to": ["PPL"], "license_note": null }
    }

    Example 3 (PPL - Meteorology):
    LO: 050.05.01.01 Meteorological Hazards: Icing
    {
      "text": "Which type of aircraft icing produces the most hazardous aerodynamic effects?",
      "option_a": "Rime ice",
      "option_b": "Clear ice",
      "option_c": "Frost",
      "option_d": "Mixed ice",
      "correct_option": "B",
      "explanation": "Clear ice is the most hazardous because it is heavy, difficult to detect, and forms a smooth layer that significantly alters the wing's aerodynamic profile.",
      "metadata": { "applies_to": ["PPL", "SPL"], "license_note": null }
    }
  `;

  const pplExamplesCZ = `
    EASA ECQB Official Sample Examples — PPL(A) Pattern (Czech):

    Example 1 (PPL - Aircraft General Knowledge):
    LO: 021.02.01.01 Powerplant: Piston Engines
    {
      "text": "Jaká je hlavní příčina tvorby ledu v karburátoru pístového motoru?",
      "text_cz": "Jaká je hlavní příčina tvorby ledu v karburátoru pístového motoru?",
      "option_a": "Vysoká okolní teplota a nízká vlhkost",
      "option_a_cz": "Vysoká okolní teplota a nízká vlhkost",
      "option_b": "Vypařování paliva způsobující pokles teploty pod rosný bod",
      "option_b_cz": "Vypařování paliva způsobující pokles teploty pod rosný bod",
      "option_c": "Příliš bohatá směs při cestovním výkonu",
      "option_c_cz": "Příliš bohatá směs při cestovním výkonu",
      "option_d": "Selhání magnetka při nízkých otáčkách",
      "option_d_cz": "Selhání magnetka při nízkých otáčkách",
      "correct_option": "B",
      "explanation": "Vypařování paliva v karburátorovém Venturiho kanálu způsobí pokles teploty až o 25°C, což může způsobit vznik ledu i při okolních teplotách až +30°C.",
      "explanation_cz": "Vypařování paliva v karburátorovém Venturiho kanálu způsobí pokles teploty až o 25°C, což může způsobit vznik ledu i při okolních teplotách až +30°C.",
      "metadata": { "applies_to": ["PPL"], "license_note": null }
    }

    Example 2 (PPL - Navigation):
    LO: 061.03.01.01 Radio Navigation: VOR and DME
    {
      "text": "Pilot letící přímo na radiál 090 VORu bude letět přibližně kurzem:",
      "text_cz": "Pilot letící přímo na radiál 090 VORu bude letět přibližně kurzem:",
      "option_a": "090°",
      "option_a_cz": "090°",
      "option_b": "270°",
      "option_b_cz": "270°",
      "option_c": "180°",
      "option_c_cz": "180°",
      "option_d": "360°",
      "option_d_cz": "360°",
      "correct_option": "B",
      "explanation": "Radiály jsou definovány OD VOR stanice. Pro let přímo na radiál 090 pilot letí K VOR stanici na magnetickém kurzu 270°.",
      "explanation_cz": "Radiály jsou definovány OD VOR stanice. Pro let přímo na radiál 090 pilot letí K VOR stanici na magnetickém kurzu 270°.",
      "metadata": { "applies_to": ["PPL"], "license_note": null }
    }
  `;

  const splExamples = `
    EASA ECQB Official Sample Examples — SPL Pattern:

    Example 1 (SPL - Principles of Flight / Glider Aerodynamics):
    LO: 081.05.02.01 Climb and Glide Performance
    {
      "text": "A kluzák has a best glide ratio of 40:1. Flying at best glide speed from 1000 m AGL in still air, what is the maximum theoretical glide distance?",
      "option_a": "20 km",
      "option_b": "40 km",
      "option_c": "80 km",
      "option_d": "4 km",
      "correct_option": "B",
      "explanation": "Glide distance = altitude × glide ratio = 1000 m × 40 = 40,000 m = 40 km, assuming no wind and best L/D speed maintained.",
      "metadata": { "applies_to": ["SPL"], "license_note": null }
    }

    Example 2 (SPL - Meteorology / Thermal Soaring):
    LO: 050.18.01.01 Stability: Conditional Instability
    {
      "text": "Which atmospheric condition is most favorable for strong thermal development for cross-country soaring?",
      "option_a": "Strong subsidence inversion below 1500 m",
      "option_b": "Conditionally unstable atmosphere with scattered cumulus",
      "option_c": "Stable stratified air with high dew point",
      "option_d": "Radiation fog burning off by noon",
      "correct_option": "B",
      "explanation": "Conditional instability allows rising thermals to trigger cumulus development. The presence of scattered Cu indicates active thermal streets suitable for cross-country soaring.",
      "metadata": { "applies_to": ["SPL"], "license_note": null }
    }

    Example 3 (SPL - Operations / Launch Methods):
    LO: 033.02.01.01 Performance: Take-off and Landing
    {
      "text": "During a winch launch, the pilot must release the cable immediately if:",
      "option_a": "The kluzák reaches the maximum permitted angle of climb",
      "option_b": "The airspeed drops below the minimum safe towing speed",
      "option_c": "A break-off height of 150 ft AGL is reached",
      "option_d": "The release knob changes color",
      "correct_option": "B",
      "explanation": "A low-speed winch launch is critical — if airspeed drops below minimum safe towing speed, the pilot must immediately release to prevent a stall close to the ground.",
      "metadata": { "applies_to": ["SPL"], "license_note": null }
    }
  `;

  const examples = license === 'SPL' ? splExamples : (targetLanguage === 'CZ' ? pplExamplesCZ : pplExamples);

  const licenseContext = license === 'SPL'
    ? `Active License: SPL (Sailplane Pilot Licence). Prioritize learning objectives relevant to kluzák aerodynamics (laminar aerofoils, glide ratio, best L/D), soaring meteorology (thermals, wave, convergence, orographic lift), winch/aerotow launch procedures, and cross-country soaring planning. For shared LOs, adapt distractor terminology to kluzák operations. Use "kluzák" NOT "plachetnice" or "plachťák".`
    : `Active License: PPL(A) (Private Pilot Licence — Aeroplane). Prioritize learning objectives relevant to piston-engine aircraft, four-stroke engine cycle, carburetor/fuel injection systems, VOR/DME/ILS radionavigation, weight & balance with fuel, IFR-adjacent procedures. For shared LOs, adapt distractor terminology to powered aeroplane operations.`;

  const loNoteInstruction = `For each LO below, check if its applies_to includes '${license}'. If the LO applies ONLY to the other license, set metadata.license_note to "Supplementary knowledge for ${license} pilots". Otherwise set it to null.`;

  const languageInstruction = targetLanguage === 'CZ'
    ? `CRITICAL - GENERATE IN CZECH LANGUAGE: 
       1. ALL primary fields (text, option_a, option_b, option_c, option_d, explanation) MUST be in Czech
       2. Technical aviation terms should remain in English where appropriate (e.g., VOR, ILS, CARBURETOR)
       3. Use Czech grammar and sentence structure
       4. The examples above show the expected Czech format
       5. DO NOT generate English questions - ALL output must be Czech
       6. CRITICAL TERMINOLOGY: Always use "kluzák" for glider (NOT "plachetnice" or "plachťák")`
    : `Generate in English language using standard aviation terminology.`;

  const prompt = `
    You are a professional EASA ECQB Question Generator.
    Your task is to generate high-quality, technical multiple-choice questions for the following EASA Learning Objectives (LOs).

    ${licenseContext}

    ${languageInstruction}
    
    CRITICAL: Generate exactly ${questionsPerLO} question(s) for EACH Learning Objective below. No more, no less.
    
    Known/Priority Objectives:
    ${los.map(lo => {
    const levelLabel = lo.level === 1 ? 'Awareness' : lo.level === 2 ? 'Knowledge' : lo.level === 3 ? 'Understanding' : 'Knowledge';
    const content = lo.knowledgeContent || lo.context || 'Standard aviation knowledge';
    return `- ${lo.id}: ${lo.text} [applies_to: ${(lo.applies_to || ['PPL', 'SPL']).join(', ')}] [Level: ${levelLabel}]\n  Knowledge Content: ${content}`;
  }).join('\n')}

    ${loNoteInstruction}
    
    Strict Rules:
    1. 4 options (A, B, C, D), exactly one correct.
    2. EASA ECQB technical style. No ambiguity.
    3. Questions must be practical and scenario-based where appropriate.
    4. Use real aviation terminology matching the active license (${license}).
    5. Explanation: Strictly technical, max 2 sentences.
    6. If you propose a NEW LO, use a valid EASA ID format (e.g. 021.XX.XX.XX) and a precise name.
    7. For all physical formulas or math, use standard LaTeX notation enclosed in $ for inline (e.g., $v^2$) and $$ for block equations. Do NOT use HTML tags for formatting formulas.
    8. ${targetLanguage === 'CZ'
      ? 'Generate ALL fields (text, option_a, option_b, option_c, option_d, explanation) in Czech. No separate _cz fields needed.'
      : 'If Target Language is Czech, provide translations in fields text_cz, option_a_cz, etc. Always provide English fields (text, option_a, etc.) as the primary source.'}

    ${examples}
    
    Return JSON object:
    {
      "LO_ID": [ { 
        "text": "...", 
        ${targetLanguage === 'CZ' ? '' : '"text_cz": "...", '}
        "option_a": "...", 
        ${targetLanguage === 'CZ' ? '' : '"option_a_cz": "...", '}
        "option_b": "...", 
        ${targetLanguage === 'CZ' ? '' : '"option_b_cz": "...", '}
        "option_c": "...", 
        ${targetLanguage === 'CZ' ? '' : '"option_c_z": "...", '}
        "option_d": "...", 
        ${targetLanguage === 'CZ' ? '' : '"option_d_cz": "...", '}
        "correct_option": "A", 
        "explanation": "...",
        ${targetLanguage === 'CZ' ? '' : '"explanation_cz": "...",'}
        "metadata": { "applies_to": ["PPL", "SPL"], "license_note": null }
      }, ... ]
    }
  `;

  try {
    let response: any;

    if (provider === 'gemini') {
      const ai = getAiInstance(apiKey);
      response = await callWithRetry(() => ai.models.generateContent({
        model: model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json"
        }
      }), 2, 'gemini', signal);

      const text = response.text;
      if (!text) return [];
      try {
        const data = JSON.parse(extractJSON(text));
        return processBatchResponse(data);
      } catch (parseError) {
        console.error("❌ JSON parse error (Gemini). Response length:", text.length, "Last 100 chars:", text.slice(-100));
        throw new Error(`AI vrátila neplatný JSON (${text.length} znaků). Zkuste menší dávku nebo méně otázek na téma.`);
      }

    } else if (provider === 'claude') {
      const claude = getClaudeInstance(apiKey);
      const estimatedTokens = Math.max(4000, los.length * questionsPerLO * 400 + 500);
      response = await callWithRetry(() => claude.messages.create({
        model: model,
        max_tokens: estimatedTokens,
        messages: [{ role: 'user', content: prompt }]
      }), 2, 'claude', signal);

      const text = (response.content[0] as any)?.text || "";
      if (!text) return [];
      try {
        const data = JSON.parse(extractJSON(text));
        return processBatchResponse(data);
      } catch (parseError) {
        console.error("❌ JSON parse error (Claude). Response length:", text.length, "Stop reason:", response.stop_reason, "Last 100 chars:", text.slice(-100));
        if (response.stop_reason === 'max_tokens') {
          throw new Error(`Claude odpověď oříznutá (max_tokens: ${estimatedTokens}). Zkuste menší dávku.`);
        }
        throw new Error(`AI vrátila neplatný JSON (${text.length} znaků). Zkuste menší dávku nebo méně otázek na téma.`);
      }
    } else if (provider === 'deepseek') {
      const estimatedTokens = Math.max(4000, los.length * questionsPerLO * 500 + 500);
      const text = proxyUrl && idToken && (!apiKey || apiKey === '')
        ? await callProxy(proxyUrl, idToken, model, prompt, estimatedTokens, true)
        : await callDeepSeek(apiKey!, model, prompt, estimatedTokens, true);
      if (!text) return [];
      try {
        const data = JSON.parse(extractJSON(text));
        return processBatchResponse(data);
      } catch (parseError) {
        console.error('❌ JSON parse error (DeepSeek). Length:', text.length);
        throw new Error(`AI vrátila neplatný JSON (${text.length} znaků). Zkuste menší dávku.`);
      }
    }

    return [];

  } catch (error) {
    console.error("Error generating batch questions:", error);
    throw error;
  }
}

function processBatchResponse(data: any): { loId: string, questions: Partial<Question>[] }[] {
  return Object.entries(data)
    .filter(([_, questions]) => Array.isArray(questions))
    .map(([loId, questions]) => ({
      loId,
      questions: (questions as any[]).map(q => ({
        ...q,
        source: 'ai',
        is_ai: 1,
        option_a: q.option_a || q.option_a_cz || "N/A",
        option_b: q.option_b || q.option_b_cz || "N/A",
        option_c: q.option_c || q.option_c_cz || "N/A",
        option_d: q.option_d || q.option_d_cz || "N/A"
      }))
    }));
}

export async function getDetailedExplanation(
  question: Question,
  lo: EasaLO | undefined,
  apiKey?: string,
  model: string = "gemini-flash-latest",
  provider: AIProvider = 'gemini',
  signal?: AbortSignal,
  displayCorrectOption?: string,
  proxyUrl?: string,
  idToken?: string,
  geminiKey?: string,
  claudeKey?: string,
  onChunk?: (chunk: string) => void
): Promise<{ explanation: string, objective?: string }> {

  const isImport = question.source === 'user' || !question.lo_id;

  const prompt = `
    You are a technical EASA Aviation Knowledge Engine specializing in ATPL/PPL theoretical exam preparation.

    Your task: Explain ONLY why the correct answer is technically correct.

    Question: ${question.text}
    Correct Answer Label: ${displayCorrectOption || question.correct_option}
    Correct Answer Text: ${question[`option_${question.correct_option.toLowerCase()}`]}
    LO: ${lo ? `${lo.id} - ${lo.text}` : "Neurčeno"}

    RULES:
    1. Base explanation on sources in this strict priority order:
       1st — EASA Learning Objectives Syllabus (primary source)
       2nd — EASA CS regulations (CS-23, CS-25, CS-ETSO, etc.)
       3rd — ÚCL / CAA Czech national documents
       4th — ICAO documents (Annexes, DOCs)
       5th — Physics / engineering principles (only if no regulatory source applies)
    2. Cite the source used (e.g., "Dle EASA LO 061.01.02.03:", "Dle CS-25.143:", "Dle ICAO Annex 2:").
    3. Maximum 3 sentences. Be precise and technical — no hedging words ("probably", "likely", "might").
    4. Respond in Czech language.
    5. CRITICAL: Explain ONLY the technical context. DO NOT confirm which answer is correct (NEVER start with "Odpověď B je správná" or similar). The user already knows it is correct. Start directly with the technical reasoning.
    6. For all physical formulas or math, use standard LaTeX notation enclosed in $ for inline (e.g., $v^2$) and $$ for block equations. Do NOT use HTML tags for formatting formulas.

    ${isImport
      ? `6. No LO ID is provided. Analyze the question content and identify the most likely EASA LO.
         Start with: "Pravděpodobně se jedná o objective [XXX.XX.XX.XX] - [Name]:"
         Then provide the technical explanation with source citation.`
      : `6. Use the provided LO ID as the bracket prefix.`
    }

    OUTPUT FORMAT (strict):
    [LO ID]: Dle [source]: [Technical explanation in Czech, max 3 sentences.]

    EXAMPLES:
    061.01.02.03: Dle EASA LO Syllabus: Přímočarý ustálený let nastane, když je výslednice všech sil nulová. Podmínkou je rovnováha tahu, odporu, vztlaku a tíhy.

    031.02.01.04: Dle CS-25.143: Letoun musí být ovladatelný při všech fázích letu bez nadměrného úsilí pilota. Tato podmínka zahrnuje i asymetrický tah při výpadku motoru.
  `;

  const geminiModel = model.startsWith('gemini') ? model : 'gemini-flash-latest';
  const claudeModel = model.startsWith('claude') ? model : 'claude-haiku-4-5-20251001';

  const callGemini = (key?: string) => async () => {
    if (proxyUrl && idToken && (!key || key === '')) {
      if (onChunk) {
        const text = await streamFromProxy(proxyUrl, idToken, geminiModel, prompt, 1000, t => onChunk(parseExplanation(t).explanation), signal);
        return parseExplanation(text);
      }
      const text = await callProxy(proxyUrl, idToken, geminiModel, prompt, 1000);
      return parseExplanation(text);
    }
    const ai = getAiInstance(key!);
    const response = await callWithRetry(() => ai.models.generateContent({
      model: geminiModel,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    }), 2, 'gemini', signal);
    return parseExplanation(response.text || 'Vysvětlení se nepodařilo vygenerovat.');
  };
  const callClaude = (key?: string) => async () => {
    if (proxyUrl && idToken && (!key || key === '')) {
      if (onChunk) {
        const text = await streamFromProxy(proxyUrl, idToken, claudeModel, prompt, 1000, t => onChunk(parseExplanation(t).explanation), signal);
        return parseExplanation(text);
      }
      const text = await callProxy(proxyUrl, idToken, claudeModel, prompt, 1000);
      return parseExplanation(text);
    }
    const claude = getClaudeInstance(key!);
    const response = await callWithRetry(() => claude.messages.create({
      model: claudeModel,
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    }), 2, 'claude', signal);
    return parseExplanation((response.content[0] as any)?.text || '');
  };
  const callDeepSeekFn = (key?: string) => async () => {
    if (proxyUrl && idToken && (!key || key === '')) {
      const dsModel = model.startsWith('deepseek') ? model : 'deepseek-chat';
      if (onChunk) {
        const text = await streamFromProxy(proxyUrl, idToken, dsModel, prompt, 1000, t => onChunk(parseExplanation(t).explanation), signal);
        return parseExplanation(text);
      }
      const text = await callProxy(proxyUrl, idToken, dsModel, prompt, 1000);
      return parseExplanation(text);
    }
    const text = await callDeepSeek(key!, model.startsWith('deepseek') ? model : 'deepseek-chat', prompt, 1000);
    return parseExplanation(text || 'Vysvětlení se nepodařilo vygenerovat.');
  };

  const buildFallbacks = (primary: AIProvider) => {
    const all: { provider: AIProvider; fn: () => Promise<{ explanation: string; objective?: string }> }[] = [];
    const dsKey = apiKey?.startsWith('sk-') && !apiKey.startsWith('sk-ant-') ? apiKey : undefined;
    if (primary !== 'deepseek' && (proxyUrl && idToken || dsKey)) all.push({ provider: 'deepseek', fn: callDeepSeekFn(dsKey) });
    if (primary !== 'gemini' && geminiKey) all.push({ provider: 'gemini', fn: callGemini(geminiKey) });
    if (primary !== 'claude' && claudeKey) all.push({ provider: 'claude', fn: callClaude(claudeKey) });
    return all;
  };

  try {
    if (provider === 'gemini') {
      return await callWithFallback('gemini', callGemini(apiKey), buildFallbacks('gemini'), signal);
    } else if (provider === 'claude') {
      return await callWithFallback('claude', callClaude(apiKey), buildFallbacks('claude'), signal);
    } else if (provider === 'deepseek') {
      return await callWithFallback('deepseek', callDeepSeekFn(apiKey), buildFallbacks('deepseek'), signal);
    }
    return { explanation: 'Vysvětlení se nepodařilo vygenerovat.' };
  } catch (error) {
    console.error('Error generating detailed explanation:', error);
    throw error;
  }
}

function parseExplanation(text: string): { explanation: string, objective?: string } {
  // Clean up markdown formatting
  const cleanText = text.replace(/\*\*/g, '').replace(/\*/g, '');

  // Check if text starts with objective identification
  const objectiveMatch = cleanText.match(/^Pravděpodobně se jedná o objective\s+([^-]+)-\s*([^.]+)\.\s*(.+)/);

  if (objectiveMatch) {
    const objective = `${objectiveMatch[1].trim()} - ${objectiveMatch[2].trim()}`;
    const explanation = objectiveMatch[3]?.trim() || "Vysvětlení se nepodařilo vygenerovat.";

    return {
      objective,
      explanation
    };
  }

  // For existing LOs, extract LO ID from the response
  const loMatch = cleanText.match(/^([0-9]{3}\.[0-9]{2}\.[0-9]{2}\.[0-9]{2}):\s*(.+)/);
  if (loMatch) {
    return {
      explanation: cleanText
    };
  }

  // Fallback: return the cleaned text
  return {
    explanation: cleanText
  };
}

export async function getDetailedHumanExplanation(
  question: Question,
  lo: EasaLO | undefined,
  apiKey?: string,
  model: string = "gemini-flash-latest",
  provider: AIProvider = 'gemini',
  signal?: AbortSignal,
  displayCorrectOption?: string,
  proxyUrl?: string,
  idToken?: string,
  geminiKey?: string,
  claudeKey?: string,
  onChunk?: (chunk: string) => void
): Promise<string> {

  const prompt = `
    Jsi letecký instruktor specializovaný na technické vysvětlení leteckých konceptů.
    
    Otázka: ${question.text}
    Označení správné odpovědi: ${displayCorrectOption || question.correct_option}
    Text správné odpovědi: ${question[`option_${question.correct_option.toLowerCase()}`]}
    LO: ${lo ? `${lo.id} - ${lo.text}` : "Neurčeno"}
    
    DŮLEŽITÉ INSTRUKCE:
    1. Technicky a odborně vysvětli letecký koncept v pozadí správné odpovědi.
    2. PRIORITNÍ VYHLEDÁVÁNÍ: Nejprve hledej v EASA dokumentaci (CS-23, CS-25, CS-VLA, AMC, GM, CAT.POL.MPA, CAT.GEN.MPA, NPA, UCL (Úřad civilního letectví), atd.)
    3. SEKUNDÁRNÍ VYHLEDÁVÁNÍ: Pouze pokud EASA dokumenty neobsahují relevantní informace, hledej v ICAO, FAA nebo jiných leteckých autoritách
    4. NEZMIŇUJ alternativní akce nebo intuitivní reakce.
    5. ZAMĚŘ SE POUZE na technické odůvodnění.
    6. Odkazuj na konkrétní EASA předpisy, procedury nebo technické principy s přesnými referencemi (např. "Podle EASA CS-23.1309...")
    7. Pokud je správná odpověď kontra-intuitivní, vysvětli technický důvod pomocí EASA předpisů.
    8. KRITICKÉ: NEOPAKUJ a NEPOTVRZUJ, že odpověď "${displayCorrectOption || question.correct_option}" je správná. Uživatel to už vidí před sebou. Nezačínej větami typu "Odpověď B je správná protože..." ani "Proč je odpověď B správná?". Začni ROVNOU technickým vysvětlením problému.
    
    Pravidla:
    1. Jazyk: Česky
    2. Styl: Srozumitelný a odborný, ale bez jakýchkoliv oslovení (žádné "Ahoj", "Čau", "Pilote", atd.)
    3. POUŽÍVEJ MARKDOWN PRO PŘEHLEDNOST: **tučně**, *kurzíva*, nadpisy, odrážky
    4. Cokoliv týkající se fyzikálních vzorců a matematiky zapisuj výhradně ve standardním LaTeX formátu s použitím $ pro inline (např. $v^2$) a $$ pro samostatný řádek.
    5. Struktura:
       - **Krátký úvod** (o jaký koncept se jedná)
       - **Technické odůvodnění** (vysvětlení principu, neopakuj odpověď ani její označení)
       - **Praktické použití** v letadle
       - **Paměťový tip**
    5. Použij krátké věty a odstavce
    6. Použij analogie a praktické příklady ze skutečného života pilota
    7. Délka: 200-300 slov
    
    Vysvětli to tak, aby to pochopil i začátečník v pilotním výcviku.
    ZAČNI PŘÍMO VYSVĚTLENÍM BEZ JAKÉHOKOLIV POZDRAVENÍ NEBO OSLOVENÍ.
    POUŽÍVEJ MARKDOWN PRO LEPŠÍ FORMÁTOVÁNÍ.
    NEOPAKUJ OZNAČENÍ SPRÁVNÉ ODPOVĚDI ("${displayCorrectOption || question.correct_option}").
  `;

  const clean = (t: string) => t
    .replace(/^(Ahoj|Čau|Dobrý den|Pilote|Studente|Příteli|Kámo)[,\s]*/gi, '')
    .replace(/^(Ahoj|Čau|Dobrý den|Pilote|Studente|Příteli|Kámo)[^\n]*\n/gi, '')
    .trim();

  const geminiModelH = model.startsWith('gemini') ? model : 'gemini-flash-latest';
  const claudeModelH = model.startsWith('claude') ? model : 'claude-haiku-4-5-20251001';

  const callGeminiH = (key?: string) => async () => {
    if (proxyUrl && idToken && (!key || key === '')) {
      if (onChunk) {
        const text = await streamFromProxy(proxyUrl, idToken, geminiModelH, prompt, 1500, onChunk, signal);
        return clean(text) || 'Podrobné vysvětlení se nepodařilo vygenerovat.';
      }
      const text = await callProxy(proxyUrl, idToken, geminiModelH, prompt, 1500);
      return clean(text) || 'Podrobné vysvětlení se nepodařilo vygenerovat.';
    }
    const ai = getAiInstance(key!);
    const response = await callWithRetry(() => ai.models.generateContent({
      model: geminiModelH,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    }), 2, 'gemini', signal);
    return clean(response.text || '') || 'Podrobné vysvětlení se nepodařilo vygenerovat.';
  };
  const callClaudeH = (key?: string) => async () => {
    if (proxyUrl && idToken && (!key || key === '')) {
      if (onChunk) {
        const text = await streamFromProxy(proxyUrl, idToken, claudeModelH, prompt, 1500, onChunk, signal);
        return clean(text) || 'Podrobné vysvětlení se nepodařilo vygenerovat.';
      }
      const text = await callProxy(proxyUrl, idToken, claudeModelH, prompt, 1500);
      return clean(text) || 'Podrobné vysvětlení se nepodařilo vygenerovat.';
    }
    const claude = getClaudeInstance(key!);
    const response = await callWithRetry(() => claude.messages.create({
      model: claudeModelH,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }]
    }), 2, 'claude', signal);
    return clean((response.content[0] as any)?.text || '') || 'Podrobné vysvětlení se nepodařilo vygenerovat.';
  };
  const callDeepSeekH = (key?: string) => async () => {
    if (proxyUrl && idToken && (!key || key === '')) {
      const dsModel = model.startsWith('deepseek') ? model : 'deepseek-chat';
      if (onChunk) {
        const text = await streamFromProxy(proxyUrl, idToken, dsModel, prompt, 1500, onChunk, signal);
        return clean(text) || 'Podrobné vysvětlení se nepodařilo vygenerovat.';
      }
      const text = await callProxy(proxyUrl, idToken, dsModel, prompt, 1500);
      return clean(text) || 'Podrobné vysvětlení se nepodařilo vygenerovat.';
    }
    const text = proxyUrl && idToken && (!key || key === '')
      ? await callProxy(proxyUrl, idToken, model.startsWith('deepseek') ? model : 'deepseek-chat', prompt, 1500)
      : await callDeepSeek(key!, model.startsWith('deepseek') ? model : 'deepseek-chat', prompt, 1500);
    return clean(text) || 'Podrobné vysvětlení se nepodařilo vygenerovat.';
  };

  const buildFallbacksH = (primary: AIProvider) => {
    const all: { provider: AIProvider; fn: () => Promise<string> }[] = [];
    const dsKey = apiKey?.startsWith('sk-') && !apiKey.startsWith('sk-ant-') ? apiKey : undefined;
    if (primary !== 'deepseek' && (proxyUrl && idToken || dsKey)) all.push({ provider: 'deepseek', fn: callDeepSeekH(dsKey) });
    if (primary !== 'gemini' && geminiKey) all.push({ provider: 'gemini', fn: callGeminiH(geminiKey) });
    if (primary !== 'claude' && claudeKey) all.push({ provider: 'claude', fn: callClaudeH(claudeKey) });
    return all;
  };

  try {
    if (provider === 'gemini') {
      return await callWithFallback('gemini', callGeminiH(apiKey), buildFallbacksH('gemini'), signal);
    } else if (provider === 'claude') {
      return await callWithFallback('claude', callClaudeH(apiKey), buildFallbacksH('claude'), signal);
    } else if (provider === 'deepseek') {
      return await callWithFallback('deepseek', callDeepSeekH(apiKey), buildFallbacksH('deepseek'), signal);
    }
    return 'Podrobné vysvětlení se nepodařilo vygenerovat.';
  } catch (error) {
    console.error('Error generating detailed human explanation:', error);
    throw error;
  }
}

export async function translateQuestion(question: Question, apiKey?: string, model: string = "gemini-flash-latest", provider: AIProvider = 'gemini', signal?: AbortSignal, proxyUrl?: string, idToken?: string): Promise<Partial<Question>> {
  const prompt = `
    You are a technical EASA Translation Engine.
    Translate the following aviation question and its options into Czech.
    Maintain strict technical terminology (e.g., maintain 'QNH', 'QFE', 'Bernoulli' where appropriate).
    
    Question: ${question.text}
    A: ${question.option_a}
    B: ${question.option_b}
    C: ${question.option_c}
    D: ${question.option_d}
    Explanation: ${question.explanation}
    
    Return JSON object:
    {
      "text_cz": "...",
      "option_a_cz": "...",
      "option_b_cz": "...",
      "option_c_cz": "...",
      "option_d_cz": "...",
      "explanation_cz": "..."
    }
  `;

  try {
    if (provider === 'gemini') {
      const ai = getAiInstance(apiKey);
      console.log(`[Gemini] Translating question with model: ${model}`);
      const response = await callWithRetry(() => ai.models.generateContent({
        model: model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
      }), 2, 'gemini');

      const text = response.text || "{}";

      try {
        return JSON.parse(text);
      } catch (parseError) {
        console.error('Gemini JSON parse error:', parseError, 'Raw text:', text);
        throw new Error('Gemini returned invalid JSON format');
      }

    } else if (provider === 'claude') {
      const claude = getClaudeInstance(apiKey);
      console.log(`[Claude] Translating question with model: ${model}`);
      const response = await callWithRetry(() => claude.messages.create({
        model: model,
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: prompt + "\n\nIMPORTANT: Return ONLY valid JSON object, no other text."
        }]
      }), 2, 'claude');

      const content = response.content[0];
      const text = content && 'text' in content ? content.text : "{}";

      // Extract JSON from Claude response (it might include extra text)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : text;

      try {
        return JSON.parse(jsonString);
      } catch (parseError) {
        console.error('Claude JSON parse error:', parseError, 'Raw text:', text);
        throw new Error('Claude returned invalid JSON format');
      }

    } else if (provider === 'deepseek') {
      console.log(`[DeepSeek] Translating question with model: ${model}`);
      const fullPrompt = prompt + '\n\nIMPORTANT: Return ONLY valid JSON object, no other text.';
      const text = proxyUrl && idToken && (!apiKey || apiKey === '')
        ? await callProxy(proxyUrl, idToken, model, fullPrompt, 2000, true)
        : await callDeepSeek(apiKey!, model, fullPrompt, 2000, true);
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        return JSON.parse(jsonMatch ? jsonMatch[0] : text);
      } catch (parseError) {
        console.error('DeepSeek JSON parse error:', parseError, 'Raw text:', text);
        throw new Error('DeepSeek returned invalid JSON format');
      }
    }

    return {};

  } catch (error) {
    console.error("Error translating question:", error);
    throw error;
  }
}

export async function verifyApiKey(apiKey: string, provider: AIProvider = 'gemini'): Promise<{ success: boolean, error?: string, quotaExceeded?: boolean }> {
  try {
    if (provider === 'gemini') {
      const ai = getAiInstance(apiKey);

      // Attempt discovery across common model aliases to find one that is both found (not 404) and has quota (not 429)
      const modelsToTry = ["gemini-flash-latest", "gemini-2.5-flash"];
      let lastError: any = null;

      for (const modelName of modelsToTry) {
        try {
          console.log(`[Gemini] Verifying key with model: ${modelName}`);
          await ai.models.generateContent({
            model: modelName,
            contents: [{ role: 'user', parts: [{ text: "ping" }] }],
          });
          console.log(`[Gemini] Model ${modelName} verification successful.`);
          return { success: true };
        } catch (err: any) {
          lastError = err;
          const msg = err?.message?.toLowerCase() || "";

          // If we hit a quota error (429), we stop here because it means the key is valid but quota is the issue
          if (msg.includes('429') || msg.includes('resource_exhausted') || msg.includes('quota')) {
            return { success: false, error: `Kvóta vyčerpána pro model ${modelName} (váš free-tier limit je pro tento model pravděpodobně nulový).`, quotaExceeded: true };
          }

          // If we hit an invalid key error (403/invalid), we stop immediately - no point trying other models
          if (msg.includes('api key not valid') || msg.includes('invalid api key') || msg.includes('403')) {
            return { success: false, error: 'Neplatný API klíč.' };
          }

          // If it's a 404, we continue to the next model in the list
          if (msg.includes('404') || msg.includes('not found')) {
            console.log(`Model ${modelName} nebyl nalezen, zkouším další...`);
            continue;
          }
        }
      }

      // If we exhausted all models and still have a 404 on the last one
      if (lastError?.message?.toLowerCase().includes('404')) {
        return { success: false, error: 'Model nebyl nalezen pro vaši verzi API. Zkuste prosím model gemini-flash-latest v nastavení.' };
      }

      return { success: false, error: lastError?.message || 'Neznámá chyba při ověřování.' };

    } else if (provider === 'claude') {
      const claude = getClaudeInstance(apiKey);
      console.log(`[Claude] Verifying key with model: claude-haiku-4-5-20251001`);
      await claude.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 10,
        messages: [{ role: 'user', content: "ping" }]
      });
      console.log(`[Claude] Verification successful.`);
      return { success: true };
    } else if (provider === 'deepseek') {
      try {
        const isOpenRouter = apiKey.startsWith('sk-or-');
        const verifyUrl = isOpenRouter ? 'https://openrouter.ai/api/v1/models' : 'https://api.deepseek.com/models';
        console.log(`[DeepSeek] Verifying key via ${isOpenRouter ? 'OpenRouter' : 'DeepSeek'} /models endpoint`);
        const res = await fetch(verifyUrl, {
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }
        });
        if (res.status === 401) return { success: false, error: `Neplatný API klíč ${isOpenRouter ? 'OpenRouter' : 'DeepSeek'}.` };
        if (res.status === 402) return { success: false, error: 'DeepSeek účet nemá dostatečný kredit. Dobijte zůstatek na platform.deepseek.com.', quotaExceeded: true };
        if (res.status === 429) return { success: false, error: 'DeepSeek kvóta vyčerpána nebo příliš mnoho požadavků.', quotaExceeded: true };
        if (!res.ok) return { success: false, error: `API error: ${res.status}` };
        console.log(`[DeepSeek${isOpenRouter ? '/OpenRouter' : ''}] Verification successful.`);
        return { success: true };
      } catch (err: any) {
        throw err;
      }
    }

    return { success: false, error: 'Nepodporovaný poskytovatel' };
  } catch (error: any) {
    console.error("Key verification error (catch-all):", error);
    return { success: false, error: error?.message || 'Kritická chyba při ověřování.' };
  }
}

// Import mockLOs to DynamoDB
export async function importMockLOsToDB(): Promise<{ success: boolean; imported: number; failed: number; errors: string[] }> {
  try {
    // Convert mockLOs to EasaObjective format
    const now = new Date().toISOString();
    const loItems = mockLOs.map(lo => ({
      loId: lo.id,
      text: lo.text,
      knowledgeContent: lo.knowledgeContent || lo.context || lo.text,
      level: lo.level || 2,
      subjectId: lo.subject_id,
      appliesTo: lo.applies_to || ['PPL', 'SPL'],
      version: '2021',
      context: lo.context,
      source: 'mock-import',
      createdAt: now,
      updatedAt: now
    }));

    // Import to DynamoDB
    const result = await dynamoDBService.batchImportLOs(loItems);

    if (result.success && result.data) {
      return {
        success: true,
        imported: result.data.imported,
        failed: result.data.failed,
        errors: result.data.errors
      };
    } else {
      return {
        success: false,
        imported: 0,
        failed: loItems.length,
        errors: [result.error || 'Unknown error']
      };
    }
  } catch (error) {
    console.error('Import mockLOs error:', error);
    return {
      success: false,
      imported: 0,
      failed: mockLOs.length,
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
}

export async function generateMissingLearningObjectives(
  existingLOs: EasaLO[],
  subjectId: number,
  licenseType: 'PPL(A)' | 'SPL' | 'BOTH',
  apiKey?: string,
  model: string = "gemini-flash-latest",
  provider: AIProvider = 'gemini',
  signal?: AbortSignal,
  useAircademy: boolean = true,
  additionalDocuments: string[] = [],
  proxyUrl?: string,
  idToken?: string
): Promise<{ success: boolean, los: EasaLO[], error?: string }> {

  if (!apiKey && !(provider === 'deepseek' && proxyUrl && idToken)) {
    return { success: false, los: [], error: 'API klíč je vyžadován pro generování LOs' };
  }

  try {
    // Cache Aircademy PDF for reference if enabled
    if (useAircademy) {
      await cacheAircademyPDF();
    }

    // Get subject name for context
    const subjectNames: Record<number, string> = {
      1: 'Air Law',
      2: 'Human Performance',
      3: 'Meteorology',
      4: 'Communications',
      5: 'Principles of Flight',
      6: 'Operational Procedures',
      7: 'Flight Performance & Planning',
      8: 'Aircraft General Knowledge',
      9: 'Navigation'
    };

    const subjectName = subjectNames[subjectId] || `Subject ${subjectId}`;

    // Calculate estimated tokens based on input size
    const estimatedTokens = Math.max(4000, existingLOs.length * 50 + 2000);

    // Create enhanced prompt with conditional references
    let prompt = '';

    if (provider === 'claude') {
      // Claude: Send only missing LOs (more efficient)
      const totalExpected = SYLLABUS_SCOPE[subjectId] || 100;
      const missingIds = findMissingLOIds(subjectId, existingLOs, totalExpected);

      if (missingIds.length === 0) {
        return { success: false, los: [], error: 'Všechny LOs pro tento předmět již existují.' };
      }

      // Take only first 10 missing IDs to avoid too large prompts
      const missingLOs = missingIds.slice(0, 10);

      prompt = `
Generate content for ${missingLOs.length} missing Learning Objectives for ${subjectName} (${licenseType} license).

MISSING LO IDs to complete:
${missingLOs.map(id => `- ${id}`).join('\n')}

REFERENCE SOURCES:
1. EASA Official Learning Objectives Syllabus (primary)
${useAircademy ? `2. Aircademy ECQB-PPL Detailed Syllabus (https://aircademy.com/downloads/ECQB-PPL-DetailedSyllabus.pdf)
3. EASA Acceptable Means of Compliance (AMC) & Guidance Material (GM)` : `2. EASA Acceptable Means of Compliance (AMC) & Guidance Material (GM)`}

${additionalDocuments.length > 0 ? `
ADDITIONAL DOCUMENTS:
Analyze these resources for additional insights:
${additionalDocuments.map((doc, index) => `${index + 1}. ${doc}`).join('\n')}
` : ''}

${useAircademy ? 'Use Aircademy syllabus insights for detailed context.' : 'Use official EASA materials for context.'}

Return JSON array:
[
  {"id": "XXX.XX.XX.XX", "text": "Learning objective content", "context": "Detailed explanation${useAircademy ? ' with Aircademy insights' : ''}", "level": 1, "subject_id": ${subjectId}, "applies_to": ["PPL(A)"]}
]
`;

    } else {
      // Gemini: Keep original logic for now
      prompt = `
Find 3-5 missing Learning Objectives for ${subjectName} (${licenseType} license).

REFERENCE SOURCES:
1. EASA Official Learning Objectives Syllabus (primary)
${useAircademy ? `2. Aircademy ECQB-PPL Detailed Syllabus (https://aircademy.com/downloads/ECQB-PPL-DetailedSyllabus.pdf)
3. EASA Acceptable Means of Compliance (AMC) & Guidance Material (GM)

AIRCADEMY SYLLABUS:
The Aircademy syllabus provides detailed explanations and practical examples for each LO.
Use this as supplementary material to enhance understanding and identify gaps.
` : `2. EASA Acceptable Means of Compliance (AMC) & Guidance Material (GM)`}

${additionalDocuments.length > 0 ? `
ADDITIONAL DOCUMENTS:
Analyze these resources for additional insights:
${additionalDocuments.map((doc, index) => `${index + 1}. ${doc}`).join('\n')}
` : ''}

EXISTING LOs (${existingLOs.length}):
${existingLOs.slice(0, 50).map(lo => `${lo.id}: ${lo.text}`).join('\n')}
${existingLOs.length > 50 ? `\n... and ${existingLOs.length - 50} more (showing first 50)` : ''}

IMPORTANT: Generate ONLY LOs that are NOT in the existing list above.
Focus on gaps in coverage for ${licenseType} requirements.
${useAircademy ? 'Use Aircademy syllabus insights for detailed context.' : 'Use official EASA materials for context.'}

Return JSON array:
[
  {"id": "XXX.XX.XX.XX", "text": "New objective not in existing list", "context": "Details${useAircademy ? ' with Aircademy insights' : ''}", "level": 1, "subject_id": ${subjectId}, "applies_to": ["PPL(A)"]}
]
`;
    }

    let response: string;

    if (!apiKey) {
      // Return empty results without API key (no mock LOs)
      return {
        success: false,
        los: [],
        error: 'API klíč je vyžadován pro generování LOs'
      };
    }

    if (provider === 'gemini') {
      const ai = getAiInstance(apiKey);
      const result = await callWithRetry(() => ai.models.generateContent({
        model: model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json"
        }
      }), 2, 'gemini', signal);

      const text = result.text;
      if (!text) {
        return { success: false, los: [], error: 'Empty response from AI' };
      }

      try {
        const missingLOs = JSON.parse(extractJSON(text)) as any[];

        // Validate and format LOs
        const validLOs = missingLOs.map(lo => ({
          id: lo.id || generateLOId(subjectId, existingLOs.length + 1),
          text: lo.text,
          context: lo.context || lo.text,
          level: (typeof lo.level === 'number' ? lo.level : lo.level === 'Recall' ? 1 : lo.level === 'State' ? 2 : lo.level === 'Explain' ? 3 : 1) as 1 | 2 | 3,
          subject_id: subjectId,
          applies_to: Array.isArray(lo.applies_to) ? lo.applies_to : [lo.applies_to || 'PPL(A)']
        }));

        return {
          success: true,
          los: validLOs
        };

      } catch (parseError) {
        console.error("❌ JSON parse error (LO Generator). Response length:", text.length, "Last 100 chars:", text.slice(-100));
        return { success: false, los: [], error: `Invalid JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}` };
      }
    } else if (provider === 'claude') {
      const claude = getClaudeInstance(apiKey);
      const claudeResponse = await callWithRetry(() => claude.messages.create({
        model: model,
        max_tokens: estimatedTokens,
        messages: [{ role: 'user', content: prompt }]
      }), 2, 'claude', signal);

      const text = (claudeResponse.content[0] as any)?.text || "";
      if (!text) {
        return { success: false, los: [], error: 'Empty response from Claude' };
      }

      console.log('🔍 Claude LO Generator Response:', text.slice(0, 200));

      try {
        const missingLOs = JSON.parse(extractJSON(text)) as any[];

        // Validate and format LOs
        const validLOs = missingLOs.map(lo => ({
          id: lo.id || generateLOId(subjectId, existingLOs.length + 1),
          text: lo.text,
          context: lo.context || lo.text,
          level: (typeof lo.level === 'number' ? lo.level : lo.level === 'Recall' ? 1 : lo.level === 'State' ? 2 : lo.level === 'Explain' ? 3 : 1) as 1 | 2 | 3,
          subject_id: subjectId,
          applies_to: Array.isArray(lo.applies_to) ? lo.applies_to : [lo.applies_to || 'PPL(A)']
        }));

        return {
          success: true,
          los: validLOs
        };

      } catch (parseError) {
        console.error("❌ JSON parse error (Claude LO Generator). Response length:", text.length, "Stop reason:", claudeResponse.stop_reason, "Last 100 chars:", text.slice(-100));
        if (claudeResponse.stop_reason === 'max_tokens') {
          return { success: false, los: [], error: `Claude response truncated (max_tokens: ${estimatedTokens}). Try smaller batch.` };
        }
        return { success: false, los: [], error: `Invalid JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}` };
      }
    } else if (provider === 'deepseek') {
      const text = proxyUrl && idToken && (!apiKey || apiKey === '')
        ? await callWithRetry(() => callProxy(proxyUrl, idToken, model, prompt, estimatedTokens, true), 2, 'deepseek', signal)
        : await callWithRetry(() => callDeepSeek(apiKey!, model, prompt, estimatedTokens, true), 2, 'deepseek', signal);
      if (!text) return { success: false, los: [], error: 'Empty response from DeepSeek' };
      try {
        const missingLOs = JSON.parse(extractJSON(text)) as any[];
        const validLOs = missingLOs.map(lo => ({
          id: lo.id || generateLOId(subjectId, existingLOs.length + 1),
          text: lo.text,
          context: lo.context || lo.text,
          level: (typeof lo.level === 'number' ? lo.level : lo.level === 'Recall' ? 1 : lo.level === 'State' ? 2 : lo.level === 'Explain' ? 3 : 1) as 1 | 2 | 3,
          subject_id: subjectId,
          applies_to: Array.isArray(lo.applies_to) ? lo.applies_to : [lo.applies_to || 'PPL(A)']
        }));
        return { success: true, los: validLOs };
      } catch (parseError) {
        console.error('❌ JSON parse error (DeepSeek LO Generator). Length:', text.length);
        return { success: false, los: [], error: `Invalid JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}` };
      }
    }

    return { success: false, los: [], error: 'Unsupported AI provider' };

  } catch (error) {
    console.error('Error generating missing LOs:', error);
    return {
      success: false,
      los: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Helper function to generate LO IDs
function generateLOId(subjectId: number, index: number): string {
  const subjectPrefixes: Record<number, string> = {
    1: '010', // Air Law
    2: '022', // Human Performance  
    3: '050', // Meteorology
    4: '090', // Communications
    5: '080', // Principles of Flight
    6: '020', // Operational Procedures
    7: '040', // Flight Performance
    8: '021', // Aircraft General (shared with Air Law)
    9: '061'  // Navigation
  };

  const prefix = subjectPrefixes[subjectId] || `${String(subjectId).padStart(3, '0')}`;
  return `${prefix}.${String(index).padStart(2, '0')}.01.01`;
}

// Helper function to generate all possible LO IDs for a subject
function generateAllPossibleIds(subjectId: number, totalCount: number): string[] {
  const ids: string[] = [];
  for (let i = 1; i <= totalCount; i++) {
    ids.push(generateLOId(subjectId, i));
  }
  return ids;
}

// Helper function to find actually missing LO IDs
function findMissingLOIds(subjectId: number, existingLOs: EasaLO[], totalCount: number): string[] {
  const existingIds = new Set(existingLOs.map(lo => lo.id));
  const allPossibleIds = generateAllPossibleIds(subjectId, totalCount);
  return allPossibleIds.filter(id => !existingIds.has(id));
}
