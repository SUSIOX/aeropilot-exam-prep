#!/usr/bin/env python3
import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# The error is at line 2966, check what's around it
lines = content.split('\n')

print("Context around line 2966:")
for i in range(2960, min(2975, len(lines))):
    prefix = ">>> " if i == 2965 else "    "
    print(f"{prefix}{i+1}: {lines[i][:80]}")

# Look for the handleGenerateLOs function which is likely causing issues
if 'handleGenerateLOs' in content:
    # Find and fix the function
    pattern = r'const handleGenerateLOs = async \(\) => \{[^}]*\}'
    match = re.search(pattern, content, re.DOTALL)
    if match:
        old_func = match.group(0)
        new_func = '''const handleGenerateLOs = async () => {
    // DEPRECATED: LO generation is disabled
    console.warn('[handleGenerateLOs] LO generation is deprecated');
    setIsGeneratingLOs(false);
    return { success: false, error: 'DEPRECATED' };
  }'''
        content = content.replace(old_func, new_func)
        print("\nFixed handleGenerateLOs function")
    else:
        print("\nCould not find handleGenerateLOs pattern")
else:
    print("\nhandleGenerateLOs not found")

# Also check for broken function calls around line 2966
# Look for patterns like "await getProxyIdToken()" followed by unexpected tokens
broken_pattern = r'await getProxyIdToken\(\)\s*\)\s*;'
if re.search(broken_pattern, content):
    print("Found potentially broken getProxyIdToken call")

with open('src/App.tsx', 'w') as f:
    f.write(content)

print("Done!")
