/**
 * EASA PPL(A) + SPL syllabus structure
 * Subjects 010–090, appliesTo per subject
 * Used as the "target" for completeness check
 */

export interface SyllabusSubject {
  id: number;
  code: string;
  name: string;
  appliesTo: string[];
  /** Expected approximate LO count from EASA syllabus */
  expectedLOs: number;
}

export const SYLLABUS: SyllabusSubject[] = [
  { id: 1,  code: '010', name: 'Air Law',                          appliesTo: ['PPL', 'SPL'], expectedLOs: 80  },
  { id: 2,  code: '020', name: 'Aircraft General Knowledge',       appliesTo: ['PPL', 'SPL'], expectedLOs: 120 },
  { id: 3,  code: '030', name: 'Flight Performance and Planning',  appliesTo: ['PPL', 'SPL'], expectedLOs: 80  },
  { id: 4,  code: '040', name: 'Human Performance',                appliesTo: ['PPL', 'SPL'], expectedLOs: 60  },
  { id: 5,  code: '050', name: 'Meteorology',                      appliesTo: ['PPL', 'SPL'], expectedLOs: 80  },
  { id: 6,  code: '060', name: 'Navigation',                       appliesTo: ['PPL', 'SPL'], expectedLOs: 80  },
  { id: 7,  code: '070', name: 'Operational Procedures',           appliesTo: ['PPL', 'SPL'], expectedLOs: 50  },
  { id: 8,  code: '080', name: 'Principles of Flight',             appliesTo: ['PPL', 'SPL'], expectedLOs: 60  },
  { id: 9,  code: '090', name: 'Communications',                   appliesTo: ['PPL', 'SPL'], expectedLOs: 40  },
];

export const TOTAL_EXPECTED = SYLLABUS.reduce((s, x) => s + x.expectedLOs, 0);
