#!/usr/bin/env python3
# Update Progress Banner to use LicenseProgress for mixed questions

import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Find the Progress Banner section and add LicenseProgress before it
# Look for the pattern where Progress Banner starts
progress_banner_pattern = r'(\{selectedSubject && \(\s*<div className="p-3 md:p-4 border border-\[var\(--line\)\] rounded-xl bg-gradient-to-r from-gray-500/5 to-blue-500/5 mt-auto">)'

# Check if we need to add the answers retrieval for LicenseProgress
if 'const answers = JSON.parse(localStorage.getItem(userKey(' not in content:
    # Add answers retrieval near the progress calculation
    old_calc = 'const filteredCorrect = getFilteredCorrectCount(selectedSubject.id, drillSettings.sourceFilters, questions);'
    new_calc = '''const answers = JSON.parse(localStorage.getItem(userKey('answers')) || '{}');
                              const filteredCorrect = getFilteredCorrectCount(selectedSubject.id, drillSettings.sourceFilters, questions);'''
    content = content.replace(old_calc, new_calc)
    print("Added answers retrieval")

# Add LicenseProgress component inside the Progress Banner, before the existing progress bars
# Find the space-y-1 div that contains the progress bars
progress_bars_marker = '''<div className="space-y-1">
                                    {/* Success Rate Bar */}'''

license_progress_insert = '''<div className="space-y-1">
                                    {/* License-specific Progress for Mixed Questions */}
                                    {(selectedLicense === 'BOTH' || (selectedLicense === 'PPL' && stats.spl.total > 0) || (selectedLicense === 'SPL' && stats.ppl.total > 0)) && (
                                      <div className="mb-3 pb-3 border-b border-[var(--line)]/50">
                                        <LicenseProgress
                                          questions={questions}
                                          answers={answers}
                                          subjectId={selectedSubject.id}
                                          showDetails={isProgressExpanded}
                                        />
                                      </div>
                                    )}
                                    
                                    {/* Success Rate Bar */}'''

if progress_bars_marker in content and 'LicenseProgress' not in content:
    content = content.replace(progress_bars_marker, license_progress_insert)
    print("Added LicenseProgress to Progress Banner")

with open('src/App.tsx', 'w') as f:
    f.write(content)

print("Done!")
