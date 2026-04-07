#!/usr/bin/env python3
# Add license selection to exam mode in App.tsx

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Find UCL exam section and add license selector before the start button
exam_license_ui = '''
                    {/* License Selection for Exam */}
                    <div className="mb-6">
                      <label className="col-header block mb-3">Licence pro zkoušku</label>
                      <div className="flex gap-3">
                        {[
                          { id: 'PPL', label: 'PPL(A)', desc: 'Letadla' },
                          { id: 'SPL', label: 'SPL', desc: 'Kluzáky' }
                        ].map((lic) => (
                          <button
                            key={lic.id}
                            onClick={() => setSelectedLicense(lic.id as 'PPL' | 'SPL')}
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

# Look for a pattern in the exam section - find "UCL" text and add before the start button
# Find "startUCLExam" and insert before it
if 'startUCLExam' in content:
    # Find the button that calls startUCLExam
    pattern = r'(<button[^>]*onClick=\{startUCLExam\}[^>]*>)'
    match = re.search(pattern, content)
    if match:
        insert_pos = match.start()
        new_content = content[:insert_pos] + exam_license_ui + content[insert_pos:]
        with open('src/App.tsx', 'w') as f:
            f.write(new_content)
        print("License selection added to exam mode")
    else:
        print("Could not find startUCLExam button")
else:
    print("startUCLExam not found in file")
