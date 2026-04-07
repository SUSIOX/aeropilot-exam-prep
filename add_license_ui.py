#!/usr/bin/env python3
# Add license filter UI to App.tsx

with open('src/App.tsx', 'r') as f:
    lines = f.readlines()

# Find the line with "Zdroje otázek (Filtry)"
target_line = None
for i, line in enumerate(lines):
    if 'Zdroje otázek (Filtry)' in line:
        # Find the closing </div> of this section (approximately 30 lines later)
        for j in range(i, min(i+50, len(lines))):
            if '</div>' in lines[j] and 'flex gap-3' not in lines[j]:
                target_line = j
                break
        break

if target_line:
    # Insert license filter UI after this line
    license_ui = '''
                        <div className="space-y-3 mt-6">
                          <label className="col-header">Licence</label>
                          <div className="flex gap-3">
                            {[
                              { id: 'PPL', label: 'PPL(A)', title: 'Pilot Private Licence - letadla' },
                              { id: 'SPL', label: 'SPL', title: 'Sailplane Pilot Licence - kluzáky' },
                              { id: 'BOTH', label: 'Obě', title: 'Zobrazit otázky pro obě licence' }
                            ].map((lic) => (
                              <button
                                key={lic.id}
                                onClick={() => setSelectedLicense(lic.id as 'PPL' | 'SPL' | 'BOTH')}
                                title={lic.title}
                                className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all border ${
                                  selectedLicense === lic.id
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white/5 text-gray-300 border-[var(--line)] hover:border-blue-400'
                                }`}
                              >
                                {lic.label}
                              </button>
                            ))}
                          </div>
                        </div>
'''
    lines.insert(target_line + 1, license_ui)
    
    with open('src/App.tsx', 'w') as f:
        f.writelines(lines)
    print(f"License filter added after line {target_line + 1}")
else:
    print("Could not find target location")
