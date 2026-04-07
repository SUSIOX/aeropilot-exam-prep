#!/usr/bin/env python3
import re

# Read file
with open('src/App.tsx', 'r') as f:
    content = f.read()

original_len = len(content)

# Fix 1: Remove any dangling generateMissingLearningObjectives calls
content = re.sub(
    r'const result = await generateMissingLearningObjectives\([^)]+\);',
    'const result = { success: false, los: [], error: "DEPRECATED" };',
    content
)

# Fix 2: Comment out any remaining calls
content = re.sub(
    r'await generateMissingLearningObjectives\([^)]+\)',
    '/* DEPRECATED */ null',
    content
)

# Fix 3: Fix handleGenerateLOs function
func_pattern = r'const handleGenerateLOs = async \(\) => \{[^{}]*\}'
if re.search(func_pattern, content):
    content = re.sub(
        func_pattern,
        '''const handleGenerateLOs = async () => {
    console.warn('[handleGenerateLOs] DEPRECATED');
    return { success: false, los: [], error: 'DEPRECATED' };
  }''',
        content
    )

# Fix 4: Remove any import of generateMissingLearningObjectives
content = re.sub(
    r'import.*generateMissingLearningObjectives.*from.*\n',
    '',
    content
)

# Write back
with open('src/App.tsx', 'w') as f:
    f.write(content)

new_len = len(content)
print(f"Original: {original_len} chars, New: {new_len} chars")
print(f"Changed: {original_len - new_len} chars")
print("Done!")
