#!/usr/bin/env python3
import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Find handleGenerateLOs and replace entire function
start_marker = 'const handleGenerateLOs = async () => {'
start_idx = content.find(start_marker)

if start_idx != -1:
    # Find where function ends by looking for next major function/const
    search_start = start_idx + len(start_marker)
    end_markers = ['const handle', 'const [', 'const start', 'const toggle', 'const set', 'const load', 'useEffect', 'return (']
    
    end_idx = len(content)
    for marker in end_markers:
        idx = content.find(marker, search_start)
        if idx != -1 and idx < end_idx:
            end_idx = idx
    
    # Replace the function
    old_func = content[start_idx:end_idx]
    new_func = '''const handleGenerateLOs = async () => {
    console.warn('[handleGenerateLOs] DEPRECATED');
    setIsGeneratingLOs(false);
    return { success: false, los: [], error: 'DEPRECATED' };
  };

  '''
    
    content = content[:start_idx] + new_func + content[end_idx:]
    print(f"Fixed handleGenerateLOs (lines {start_idx}-{end_idx})")

# Also fix any broken generateMissingLearningObjectives references
content = re.sub(
    r'const result = await generateMissingLearningObjectives\([^)]+\);',
    'const result = { success: false, los: [], error: "DEPRECATED" };',
    content
)

content = re.sub(
    r'await generateMissingLearningObjectives\([^)]+\)',
    'null',
    content
)

with open('src/App.tsx', 'w') as f:
    f.write(content)

print("Done!")
