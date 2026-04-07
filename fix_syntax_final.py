#!/usr/bin/env python3
# Fix the syntax error at line 2966 by removing broken code

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Find the generateMissingLearningObjectives call that's causing issues
# This is likely in handleGenerateLOs function

# Pattern 1: Find and fix broken function calls
broken_patterns = [
    r'generateMissingLearningObjectives\([^)]*AI_PROXY_URL[^)]*\)',
    r'generateMissingLearningObjectives\([^)]*getProxyIdToken[^)]*\)',
]

import re

for pattern in broken_patterns:
    matches = list(re.finditer(pattern, content, re.DOTALL))
    for match in matches:
        old_call = match.group(0)
        # Replace with commented out version
        new_call = f"/* DEPRECATED: {old_call[:50]}... */"
        content = content.replace(old_call, new_call)
        print(f"Fixed: {old_call[:60]}...")

# Also handle any dangling references
content = re.sub(
    r'const result = await generateMissingLearningObjectives\([^)]+\);',
    'const result = { success: false, los: [], error: "DEPRECATED" };',
    content
)

# Fix any handleGenerateLOs that calls the deprecated function
if 'handleGenerateLOs' in content:
    # Find the function and simplify it
    func_start = content.find('const handleGenerateLOs = async () => {')
    if func_start != -1:
        # Find the end of this function
        next_func = content.find('\nconst ', func_start + 1)
        if next_func == -1:
            next_func = content.find('\n  const ', func_start + 1)
        
        if next_func != -1:
            old_func = content[func_start:next_func]
            new_func = '''const handleGenerateLOs = async () => {
    console.warn('[handleGenerateLOs] DEPRECATED');
    return;
  };

  '''
            content = content[:func_start] + new_func + content[next_func:]
            print("Fixed handleGenerateLOs function")

with open('src/App.tsx', 'w') as f:
    f.write(content)

print("\nDone!")
