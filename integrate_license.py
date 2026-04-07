#!/usr/bin/env python3
# Integrate LicenseFilter component into App.tsx

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Add import for LicenseFilter
if 'LicenseFilter' not in content:
    # Find a good place to add import (after other component imports)
    import_section = content.find("import { User } from './components/User';")
    if import_section == -1:
        import_section = content.find("import { AuthModal }")
    
    if import_section != -1:
        # Find end of that line
        line_end = content.find('\n', import_section)
        new_import = "\nimport { LicenseFilter } from './components/LicenseFilter';"
        content = content[:line_end+1] + new_import + content[line_end+1:]
        print("Added LicenseFilter import")
    else:
        print("Could not find import section")
else:
    print("LicenseFilter import already exists")

# Replace the simple license filter with the new component
# Find the license filter section we added earlier
old_license_ui = '''<div className="space-y-3 mt-6">
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

new_license_ui = '''<LicenseFilter
                          settings={drillSettings}
                          onUpdate={(newSettings) => setDrillSettings(prev => ({ ...prev, ...newSettings }))}
                        />'''

if old_license_ui in content:
    content = content.replace(old_license_ui, new_license_ui)
    print("Replaced license filter UI with component")
else:
    print("Could not find old license UI to replace")

with open('src/App.tsx', 'w') as f:
    f.write(content)

print("Done!")
