#!/usr/bin/env python3
# Add LicenseProgress component and helper functions to App.tsx

import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Add import for LicenseProgress
if 'LicenseProgress' not in content:
    # Find the import section and add LicenseProgress
    import_match = re.search(r"import \{ User \} from './components/User';", content)
    if import_match:
        insert_pos = import_match.end()
        content = content[:insert_pos] + "\nimport { LicenseProgress } from './components/LicenseProgress';" + content[insert_pos:]
        print("Added LicenseProgress import")

# Add helper functions for license-based progress calculation
helper_functions = '''
  // Helper: Get progress stats by license type
  const getLicenseProgressStats = (subjectId: number, questions: Question[], answers: Record<string, any>) => {
    const stats = {
      ppl: { total: 0, answered: 0, correct: 0 },
      spl: { total: 0, answered: 0, correct: 0 }
    };

    questions.forEach(q => {
      if (subjectId > 0 && q.subject_id !== subjectId) return;
      
      const appliesTo = q.metadata?.applies_to || ['PPL', 'SPL'];
      const questionId = String(q.id);
      const answer = answers[questionId];

      if (appliesTo.includes('PPL')) {
        stats.ppl.total++;
        if (answer) {
          stats.ppl.answered++;
          if (answer.isCorrect) stats.ppl.correct++;
        }
      }

      if (appliesTo.includes('SPL')) {
        stats.spl.total++;
        if (answer) {
          stats.spl.answered++;
          if (answer.isCorrect) stats.spl.correct++;
        }
      }
    });

    return stats;
  };

'''

# Find a good place to insert helper functions (after getFilteredCorrectCount)
insert_marker = 'const getFilteredCorrectCount'
if insert_marker in content and 'getLicenseProgressStats' not in content:
    # Find the end of getFilteredCorrectCount function
    match = re.search(r'const getFilteredCorrectCount[^{]*\{[^}]*\};', content, re.DOTALL)
    if match:
        insert_pos = match.end()
        content = content[:insert_pos] + '\n' + helper_functions + content[insert_pos:]
        print("Added getLicenseProgressStats helper function")

with open('src/App.tsx', 'w') as f:
    f.write(content)

print("Done!")
