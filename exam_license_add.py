#!/usr/bin/env python3
# Add license selection to exam mode UI

with open('src/App.tsx', 'r') as f:
    content = f.read()

# License selector for exam mode
license_selector = '''
              {/* License Selection */}
              <div className="mb-6 p-4 bg-white/5 rounded-xl border border-[var(--line)]">
                <h3 className="text-sm font-bold uppercase tracking-wider mb-4">Licence pro zkoušku</h3>
                <div className="flex gap-3">
                  <button
                    onClick={() => setSelectedLicense('PPL')}
                    className={`flex-1 py-3 px-4 rounded-xl border transition-all ${
                      selectedLicense === 'PPL'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white/5 text-gray-300 border-[var(--line)] hover:border-blue-400'
                    }`}
                  >
                    <div className="font-bold">PPL(A)</div>
                    <div className="text-xs opacity-70">Letadla</div>
                  </button>
                  <button
                    onClick={() => setSelectedLicense('SPL')}
                    className={`flex-1 py-3 px-4 rounded-xl border transition-all ${
                      selectedLicense === 'SPL'
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-white/5 text-gray-300 border-[var(--line)] hover:border-purple-400'
                    }`}
                  >
                    <div className="font-bold">SPL</div>
                    <div className="text-xs opacity-70">Kluzáky</div>
                  </button>
                </div>
              </div>
'''

# Find exam section
import re
# Look for exam-related buttons or sections
patterns = [
    r'Zkouška',
    r'Zahájit',
    r'startExam',
    r'UCL'
]

for pattern in patterns:
    if pattern in content:
        print(f"Found: {pattern}")
