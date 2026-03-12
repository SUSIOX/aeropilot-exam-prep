import { GoogleGenAI } from "@google/genai";
import { Anthropic } from "@anthropic-ai/sdk";
import { Question } from "../types";
import { LOItem } from "../types/aws";
import { dynamoDBService } from "./dynamoService";

export type AIProvider = 'gemini' | 'claude';

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
  subject_id: item.subject_id || item.subjectId,
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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
      
      if (isRateLimit && retries > 0) {
        console.log(`Claude rate limit hit, retrying in 2s... (${retries} left)`);
        await sleep(2000);
        return callWithRetry(fn, retries - 1, provider, signal);
      }
      
      if (isInvalidKey) {
        throw new Error('API_KEY_INVALID');
      }
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
    const sid = lo.subject_id ?? 0;
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
  signal?: AbortSignal
): Promise<{loId: string, questions: Partial<Question>[]}[]> {

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

  const splExamples = `
    EASA ECQB Official Sample Examples — SPL Pattern:

    Example 1 (SPL - Principles of Flight / Glider Aerodynamics):
    LO: 081.05.02.01 Climb and Glide Performance
    {
      "text": "A glider has a best glide ratio of 40:1. Flying at best glide speed from 1000 m AGL in still air, what is the maximum theoretical glide distance?",
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
      "option_a": "The glider reaches the maximum permitted angle of climb",
      "option_b": "The airspeed drops below the minimum safe towing speed",
      "option_c": "A break-off height of 150 ft AGL is reached",
      "option_d": "The release knob changes color",
      "correct_option": "B",
      "explanation": "A low-speed winch launch is critical — if airspeed drops below minimum safe towing speed, the pilot must immediately release to prevent a stall close to the ground.",
      "metadata": { "applies_to": ["SPL"], "license_note": null }
    }
  `;

  const examples = license === 'SPL' ? splExamples : pplExamples;

  const licenseContext = license === 'SPL'
    ? `Active License: SPL (Sailplane Pilot Licence). Prioritize learning objectives relevant to glider aerodynamics (laminar aerofoils, glide ratio, best L/D), soaring meteorology (thermals, wave, convergence, orographic lift), winch/aerotow launch procedures, and cross-country soaring planning. For shared LOs, adapt distractor terminology to glider operations.`
    : `Active License: PPL(A) (Private Pilot Licence — Aeroplane). Prioritize learning objectives relevant to piston-engine aircraft, four-stroke engine cycle, carburetor/fuel injection systems, VOR/DME/ILS radionavigation, weight & balance with fuel, IFR-adjacent procedures. For shared LOs, adapt distractor terminology to powered aeroplane operations.`;

  const loNoteInstruction = `For each LO below, check if its applies_to includes '${license}'. If the LO applies ONLY to the other license, set metadata.license_note to "Supplementary knowledge for ${license} pilots". Otherwise set it to null.`;

  const prompt = `
    You are a professional EASA ECQB Question Generator.
    Your task is to generate high-quality, technical multiple-choice questions for the following EASA Learning Objectives (LOs).

    ${licenseContext}

    IMPORTANT: Use the official EASA format and style as shown in the examples below.
    
    Target Language: ${targetLanguage === 'CZ' ? 'Czech (with technical terms preserved)' : 'English'}
    
    CRITICAL: Generate exactly ${questionsPerLO} question(s) for EACH Learning Objective below. No more, no less.
    
    Known/Priority Objectives:
    ${los.map(lo => {
      const levelLabel = lo.level === 1 ? 'Awareness' : lo.level === 2 ? 'Knowledge' : lo.level === 3 ? 'Understanding' : 'Knowledge';
      const content = lo.knowledgeContent || lo.context || 'Standard aviation knowledge';
      return `- ${lo.id}: ${lo.text} [applies_to: ${(lo.applies_to || ['PPL','SPL']).join(', ')}] [Level: ${levelLabel}]\n  Knowledge Content: ${content}`;
    }).join('\n')}

    ${loNoteInstruction}
    
    Strict Rules:
    1. 4 options (A, B, C, D), exactly one correct.
    2. EASA ECQB technical style. No ambiguity.
    3. Questions must be practical and scenario-based where appropriate.
    4. Use real aviation terminology matching the active license (${license}).
    5. Explanation: Strictly technical, max 2 sentences.
    6. If you propose a NEW LO, use a valid EASA ID format (e.g. 021.XX.XX.XX) and a precise name.
    7. If Target Language is Czech, provide translations in fields text_cz, option_a_cz, etc. 
       Always provide English fields (text, option_a, etc.) as the primary source.

    ${examples}
    
    Return JSON object:
    {
      "LO_ID": [ { 
        "text": "...", 
        "text_cz": "...", 
        "option_a": "...", 
        "option_a_cz": "...", 
        "option_b": "...", 
        "option_b_cz": "...", 
        "option_c": "...", 
        "option_c_z": "...", 
        "option_d": "...", 
        "option_d_cz": "...", 
        "correct_option": "A", 
        "explanation": "...",
        "explanation_cz": "...",
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
    }
    
    return [];
    
  } catch (error) {
    console.error("Error generating batch questions:", error);
    throw error;
  }
}

function processBatchResponse(data: any): {loId: string, questions: Partial<Question>[]}[] {
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

export async function getDetailedExplanation(question: Question, lo: EasaLO | undefined, apiKey?: string, model: string = "gemini-flash-latest", provider: AIProvider = 'gemini', signal?: AbortSignal): Promise<{explanation: string, objective?: string}> {
  console.log('getDetailedExplanation called with:', { provider, model, hasKey: !!apiKey });
  
  const isImport = question.source === 'user' || !question.lo_id;
  
  const prompt = `
    You are a technical EASA Aviation Knowledge Engine specializing in ATPL/PPL theoretical exam preparation.

    Your task: Explain ONLY why the correct answer is technically correct.

    Question: ${question.text}
    Correct Answer: ${question.correct_option}
    Correct Answer Text: ${question[`option_${question.correct_option.toLowerCase()}`]}
    LO: ${lo ? `${lo.id} - ${lo.text}` : "Neurčeno"}

    RULES:
    1. Explain ONLY why answer "${question.correct_option}" is correct. Never mention other options. Don't repeat the question.
    2. Base explanation on sources in this strict priority order:
       1st — EASA Learning Objectives Syllabus (primary source)
       2nd — EASA CS regulations (CS-23, CS-25, CS-ETSO, etc.)
       3rd — ÚCL / CAA Czech national documents
       4th — ICAO documents (Annexes, DOCs)
       5th — Physics / engineering principles (only if no regulatory source applies)
    3. Cite the source used (e.g., "Dle EASA LO 061.01.02.03:", "Dle CS-25.143:", "Dle ICAO Annex 2:").
    4. Maximum 3 sentences. Be precise and technical — no hedging words ("probably", "likely", "might").
    5. Respond in Czech language.

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

  try {
    if (provider === 'gemini') {
      console.log('Using Gemini provider');
      const ai = getAiInstance(apiKey);
      const response = await callWithRetry(() => ai.models.generateContent({
        model: model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }), 2, 'gemini', signal);
      
      const text = response.text || "Vysvětlení se nepodařilo vygenerovat.";
      return parseExplanation(text);
      
    } else if (provider === 'claude') {
      console.log('Using Claude provider with model:', model);
      const claude = getClaudeInstance(apiKey);
      const response = await callWithRetry(() => claude.messages.create({
        model: model,
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      }), 2, 'claude');
      
      console.log('Claude response:', response);
      const text = (response.content[0] as any)?.text || "";
      console.log('Claude text:', text);
      return parseExplanation(text);
    }
    
    return { explanation: "Vysvětlení se nepodařilo vygenerovat." };
    
  } catch (error) {
    console.error("Error generating detailed explanation:", error);
    throw error;
  }
}

function parseExplanation(text: string): {explanation: string, objective?: string} {
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

export async function getDetailedHumanExplanation(question: Question, lo: EasaLO | undefined, apiKey?: string, model: string = "gemini-flash-latest", provider: AIProvider = 'gemini', signal?: AbortSignal): Promise<string> {
  console.log('getDetailedHumanExplanation called with:', { provider, model, hasKey: !!apiKey });
  
  const prompt = `
    Jsi letecký instruktor specializovaný na technické vysvětlení leteckých konceptů.
    
    Otázka: ${question.text}
    Správná odpověď: ${question.correct_option}
    Text správné odpovědi: ${question[`option_${question.correct_option.toLowerCase()}`]}
    LO: ${lo ? `${lo.id} - ${lo.text}` : "Neurčeno"}
    
    DŮLEŽITÉ INSTRUKCE:
    1. MUSÍŠ vysvětlit PROČ je odpověď "${question.correct_option}" ("${question[`option_${question.correct_option.toLowerCase()}`]}") správná podle leteckých předpisů
    2. PRIORITNÍ VYHLEDÁVÁNÍ: Nejprve hledej v EASA dokumentaci (CS-23, CS-25, CS-VLA, AMC, GM, CAT.POL.MPA, CAT.GEN.MPA, NPA, UCL (Úřad civilního letectví), atd.)
    3. SEKUNDÁRNÍ VYHLEDÁVÁNÍ: Pouze pokud EASA dokumenty neobsahují relevantní informace, hledej v ICAO, FAA nebo jiných leteckých autoritách
    4. NEZMIŇUJ alternativní akce nebo intuitivní reakce
    5. ZAMĚŘ SE POUZE na technické odůvodnění dané správné odpovědi
    6. Odkazuj na konkrétní EASA předpisy, procedury nebo technické principy s přesnými referencemi (např. "Podle EASA CS-23.1309...")
    7. Pokud je správná odpověď kontra-intuitivní, vysvětli technický důvod pomocí EASA předpisů
    
    Pravidla:
    1. Jazyk: Česky
    2. Styl: Srozumitelný a odborný, ale bez jakýchkoliv oslovení (žádné "Ahoj", "Čau", "Pilote", atd.)
    3. POUŽÍVEJ MARKDOWN PRO PŘEHLEDNOST: **tučně**, *kurzíva*, nadpisy, odrážky
    4. Struktura:
       - **Krátký úvod** (co to je)
       - **Proč je odpověď ${question.correct_option} správná** (technické vysvětlení, neopakuj odpověď)
       - **Praktické použití** v letadle
       - **Paměťový tip**
    5. Použij krátké věty a odstavce
    6. Použij analogie a praktické příklady ze skutečného života pilota
    7. Délka: 200-300 slov
    
    Vysvětli to tak, aby to pochopil i začátečník v pilotním výcviku.
    ZAČNI PŘÍMO VYSVĚTLENÍM BEZ JAKÉHOKOLIV POZDRAVENÍ NEBO OSLOVENÍ.
    POUŽÍVEJ MARKDOWN PRO LEPSÍ FORMÁTOVÁNÍ.
    MUSÍŠ ODŮVODNIT PROČ JE ODPOVĚĎ "${question.correct_option}" SPRÁVNÁ.
  `;

  try {
    if (provider === 'gemini') {
      console.log('Using Gemini provider for detailed explanation');
      const ai = getAiInstance(apiKey);
      const response = await callWithRetry(() => ai.models.generateContent({
        model: model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }), 2, 'gemini', signal);
      
      const text = response.text || "Podrobné vysvětlení se nepodařilo vygenerovat.";
      
      // Clean up only greetings and informal addresses, KEEP markdown formatting
      const cleanedText = text
        .replace(/^(Ahoj|Čau|Dobrý den|Dobrý den|Pilote|Studente|Příteli|Kámo|Příteli)[,\s]*/gi, '')
        .replace(/^(Ahoj|Čau|Dobrý den|Dobrý den|Pilote|Studente|Příteli|Kámo|Příteli)[^\n]*\n/gi, '')
        .trim();
      
      return cleanedText;
      
    } else if (provider === 'claude') {
      console.log('Using Claude provider for detailed explanation');
      const claude = getClaudeInstance(apiKey);
      const response = await callWithRetry(() => claude.messages.create({
        model: model,
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      }), 2, 'claude');
      
      const text = (response.content[0] as any)?.text || "";
      
      // Clean up only greetings and informal addresses, KEEP markdown formatting
      const cleanedText = text
        .replace(/^(Ahoj|Čau|Dobrý den|Dobrý den|Pilote|Studente|Příteli|Kámo|Příteli)[,\s]*/gi, '')
        .replace(/^(Ahoj|Čau|Dobrý den|Dobrý den|Pilote|Studente|Příteli|Kámo|Příteli)[^\n]*\n/gi, '')
        .trim();
      
      return cleanedText || "Podrobné vysvětlení se nepodařilo vygenerovat.";
    }
    
    return "Podrobné vysvětlení se nepodařilo vygenerovat.";
    
  } catch (error) {
    console.error("Error generating detailed human explanation:", error);
    throw error;
  }
}

export async function translateQuestion(question: Question, apiKey?: string, model: string = "gemini-flash-latest", provider: AIProvider = 'gemini', signal?: AbortSignal): Promise<Partial<Question>> {
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
    }
    
    return {};
    
  } catch (error) {
    console.error("Error translating question:", error);
    throw error;
  }
}

export async function verifyApiKey(apiKey: string, provider: AIProvider = 'gemini'): Promise<{success: boolean, error?: string, quotaExceeded?: boolean}> {
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
