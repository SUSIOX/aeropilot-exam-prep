#!/usr/bin/env python3
# Replace license filter with new component

with open('src/App.tsx', 'r') as f:
    lines = f.readlines()

# Find the line with "Licence" label
start_line = None
for i, line in enumerate(lines):
    if 'label className="col-header">Licence</label>' in line:
        start_line = i
        break

if start_line:
    # Find the end of this section (closing </div>)
    end_line = start_line
    depth = 1
    for j in range(start_line + 1, min(start_line + 50, len(lines))):
        if '<div' in lines[j]:
            depth += 1
        if '</div>' in lines[j]:
            depth -= 1
            if depth == 0:
                end_line = j
                break
    
    # Replace with new component
    new_component = '''                      <LicenseFilter
                        settings={drillSettings}
                        onUpdate={(newSettings) => setDrillSettings(prev => {
                          const updated = { ...prev, ...newSettings };
                          localStorage.setItem('drillSettings', JSON.stringify(updated));
                          return updated;
                        })}
                      />\n'''
    
    # Remove old lines and insert new component
    new_lines = lines[:start_line-1] + [new_component] + lines[end_line+1:]
    
    with open('src/App.tsx', 'w') as f:
        f.writelines(new_lines)
    print(f"Replaced lines {start_line-1} to {end_line+1} with LicenseFilter component")
else:
    print("Could not find license filter section")
