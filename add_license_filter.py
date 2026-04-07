import re

# Read the file
with open('src/App.tsx', 'r') as f:
    content = f.read()

# Find the source filters section and add license filter after it
license_filter_ui = '''
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
                                onClick={() => setSelectedLicense(lic.id as any)}
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
                        </div>'''

# Find the closing div of the source filters section and insert after it
pattern = r"(\{ id: 'excludeAnswered'.*?\}\)\}\s*</div>)"
match = re.search(pattern, content, re.DOTALL)

if match:
    insert_pos = match.end()
    new_content = content[:insert_pos] + license_filter_ui + content[insert_pos:]
    with open('src/App.tsx', 'w') as f:
        f.write(new_content)
    print("License filter UI added successfully")
else:
    print("Could not find the right location to insert license filter")
