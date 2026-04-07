#!/usr/bin/env python3
# Add license selector to exam mode UI

with open('src/App.tsx', 'r') as f:
    content = f.read()

# License selector UI for exam mode
license_selector = '''
                {/* License Selection for Exam */}
                <div className="mb-6 p-4 border border-[var(--line)] rounded-xl bg-white/5">
                  <label className="col-header block mb-3">Licence pro zkoušku</label>
                  <div className="flex gap-3">
                    {[
                      { id: 'PPL', label: 'PPL(A)', desc: 'Letadla' },
                      { id: 'SPL', label: 'SPL', desc: 'Kluzáky' }
                    ].map((lic) => (
                      <button
                        key={lic.id}
                        onClick={() => setSelectedLicense(lic.id)}
                        className={`flex-1 py-3 px-4 rounded-xl border transition-all ${
                          selectedLicense === lic.id
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white/5 text-gray-300 border-[var(--line)] hover:border-blue-400'
                        }`}
                      >
                        <div className="font-bold">{lic.label}</div>
                        <div className="text-xs opacity-70">{lic.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
'''

# Find exam mode section - look for "Zahájit zkoušku" or similar
# Find the start exam button
import re

# Pattern to find exam start button or section
patterns = [
    r'Zahájit zkoušku',
    r'startUCLExam',
    r'UCL.*PPL',
    r'Exam.*mode'
]

found = False
for pattern in patterns:
    if pattern in content:
        print(f"Found pattern: {pattern}")
        found = True
        break

if not found:
    print("No exam patterns found")
