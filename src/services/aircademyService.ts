/**
 * Aircademy Syllabus Service
 * Handles parsing and integration of Aircademy ECQB-PPL Detailed Syllabus PDF
 */

export interface AircademySyllabusItem {
  id: string;           // e.g. "010.01.01.01"
  subjectId: number;   // 1-9
  title: string;       // Learning Objective title
  description?: string; // Detailed description
  level: 1 | 2 | 3;    // Knowledge level
  appliesTo: string[]; // ["PPL(A)", "SPL", "BOTH"]
  source: "Aircademy"; // Source identifier
  page?: number;       // PDF page number
}

export interface AircademySyllabusStructure {
  subjects: {
    [subjectId: number]: {
      name: string;
      code: string;
      topics: {
        [topicCode: string]: {
          title: string;
          subtopics: {
            [subtopicCode: string]: {
              title: string;
              los: AircademySyllabusItem[];
            };
          };
        };
      };
    };
  };
}

/**
 * Parse Aircademy PDF content and extract Learning Objectives
 * This is a placeholder for PDF parsing implementation
 */
export async function parseAircademyPDF(pdfUrl: string): Promise<AircademySyllabusStructure> {
  try {
    // TODO: Implement actual PDF parsing
    // For now, return placeholder structure
    
    console.log(`Parsing Aircademy PDF from: ${pdfUrl}`);
    
    // Placeholder structure - would be filled by actual PDF parsing
    const structure: AircademySyllabusStructure = {
      subjects: {
        1: {
          name: "Air Law",
          code: "010",
          topics: {
            "010.01": {
              title: "International Agreements and Organisations",
              subtopics: {
                "010.01.01": {
                  title: "Chicago Convention",
                  los: [
                    {
                      id: "010.01.01.01",
                      subjectId: 1,
                      title: "Chicago Convention",
                      description: "Purpose and key provisions of the Chicago Convention",
                      level: 2,
                      appliesTo: ["PPL(A)", "SPL"],
                      source: "Aircademy",
                      page: 1
                    }
                  ]
                }
              }
            }
          }
        }
      }
    };
    
    return structure;
  } catch (error) {
    console.error('Error parsing Aircademy PDF:', error);
    throw new Error('Failed to parse Aircademy PDF');
  }
}

/**
 * Convert Aircademy LOs to EasaLO format
 */
export function convertAircademyToEasaLO(aircademyLos: AircademySyllabusItem[]): any[] {
  return aircademyLos.map(lo => ({
    id: lo.id,
    subject_id: lo.subjectId,
    text: lo.title,
    context: lo.description || lo.title,
    level: lo.level,
    applies_to: lo.appliesTo,
    source: lo.source,
    version: "Aircademy-2026",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));
}

/**
 * Merge Aircademy LOs with existing EasaLOs
 */
export function mergeAircademyWithEASA(existingLOs: any[], aircademyLOs: any[]): any[] {
  const merged = [...existingLOs];
  const existingIds = new Set(existingLOs.map(lo => lo.id));
  
  for (const airLo of aircademyLOs) {
    if (!existingIds.has(airLo.id)) {
      merged.push(airLo);
    } else {
      // Update existing LO with Aircademy context if missing
      const index = merged.findIndex(lo => lo.id === airLo.id);
      if (index !== -1 && !merged[index].context) {
        merged[index] = { ...merged[index], context: airLo.context };
      }
    }
  }
  
  return merged;
}

/**
 * Generate AI prompt with Aircademy syllabus reference
 */
export function generateAircademyPrompt(existingLOs: any[], subjectId: number, licenseType: 'PPL(A)' | 'SPL' | 'BOTH'): string {
  const aircademyReference = `
REFERENCE SOURCES:
1. EASA Official Learning Objectives Syllabus (primary)
2. Aircademy ECQB-PPL Detailed Syllabus (https://aircademy.com/downloads/ECQB-PPL-DetailedSyllabus.pdf)
3. EASA Acceptable Means of Compliance (AMC) & Guidance Material (GM)

AIRCADEMY SYLLABUS STRUCTURE:
The Aircademy syllabus provides detailed explanations and practical examples for each LO.
Use this as supplementary material to enhance understanding and question generation.

TASK:
Generate missing Learning Objectives for Subject ${subjectId} (${licenseType} license).

EXISTING LOs:
${existingLOs.slice(0, 20).map(lo => `- ${lo.id}: ${lo.text}`).join('\n')}

REQUIREMENTS:
1. Analyze gaps in existing LOs compared to official EASA syllabus
2. Use Aircademy syllabus for detailed context and examples
3. Generate LOs that fill identified gaps
4. Ensure proper EASA formatting and knowledge levels
5. Apply correct license classification (PPL(A)/SPL/BOTH)
6. Include practical aviation context

OUTPUT FORMAT:
Return JSON array:
{
  "los": [
    {
      "id": "XXX.XX.XX.XX",
      "subject_id": ${subjectId},
      "text": "Learning Objective title",
      "context": "Detailed description with Aircademy insights",
      "level": 1|2|3,
      "applies_to": ["PPL(A)", "SPL", "BOTH"],
      "source": "Generated with Aircademy reference"
    }
  ]
}
`;

  return aircademyReference;
}

/**
 * Download and cache Aircademy PDF
 */
export async function cacheAircademyPDF(): Promise<string> {
  const pdfUrl = "https://aircademy.com/downloads/ECQB-PPL-DetailedSyllabus.pdf";
  
  try {
    // TODO: Implement PDF download and caching
    // For now, return the URL
    console.log('Aircademy PDF URL:', pdfUrl);
    return pdfUrl;
  } catch (error) {
    console.error('Error caching Aircademy PDF:', error);
    throw new Error('Failed to cache Aircademy PDF');
  }
}

/**
 * Validate Aircademy LO format
 */
export function validateAircademyLO(lo: any): boolean {
  return (
    lo.id &&
    /^\d{3}\.\d{2}\.\d{2}\.\d{2}$/.test(lo.id) &&
    lo.subjectId &&
    lo.subjectId >= 1 &&
    lo.subjectId <= 9 &&
    lo.title &&
    lo.level &&
    [1, 2, 3].includes(lo.level) &&
    lo.appliesTo &&
    Array.isArray(lo.appliesTo) &&
    lo.source === "Aircademy"
  );
}
