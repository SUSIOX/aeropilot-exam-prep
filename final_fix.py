#!/usr/bin/env python3
import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Fix: Find and replace broken handleGenerateLOs function
pattern = r'const handleGenerateLOs = async \(\) => \{[^}]*await generateMissingLearningObjectives[^}]*\}'
replacement = '''const handleGenerateLOs = async () => {
    console.warn('[handleGenerateLOs] DEPRECATED: LO generation is disabled');
    return { success: false, los: [], error: 'DEPRECATED' };
  }'''

if re.search(pattern, content, re.DOTALL):
    content = re.sub(pattern, replacement, content, flags=re.DOTALL)
    print("Fixed handleGenerateLOs")
else:
    print("Pattern not found, trying alternate fix...")
    # Try simpler pattern
    if 'handleGenerateLOs' in content:
        # Find the function and replace it entirely
        start = content.find('const handleGenerateLOs = async () => {')
        if start != -1:
            # Find next function definition
            next_func = content.find('\n  const ', start + 1)
            if next_func != -1:
                old = content[start:next_func]
                content = content[:start] + replacement + '\n\n  ' + content[next_func+4:]
                print("Fixed by replacement")

# Fix: Remove any dangling generateMissingLearningObjectives calls
content = re.sub(
    r'await generateMissingLearningObjectives\([^)]+\)',
    'null /* DEPRECATED */',
    content
)

# Fix: Replace result = await generateMissingLearningObjectives
content = re.sub(
    r'const result = await generateMissingLearningObjectives\([^)]+\);',
    'const result = { success: false, los: [], error: "DEPRECATED" };',
    content
)

with open('src/App.tsx', 'w') as f:
    f.write(content)

print("Done!")
