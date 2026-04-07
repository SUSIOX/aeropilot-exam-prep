#!/usr/bin/env python3
# Fix syntax error at line 2966

with open('src/App.tsx', 'r') as f:
    lines = f.readlines()

# Check the area around line 2966
print("Lines 2960-2970:")
for i in range(2959, min(2970, len(lines))):
    marker = ">>>" if i == 2965 else "   "
    print(f"{marker} {i+1}: {lines[i][:100]}")

# Look for the pattern that might be causing issues
for i in range(2950, min(2980, len(lines))):
    if 'AI_PROXY_URL' in lines[i] or 'getProxyIdToken' in lines[i]:
        print(f"\nFound at line {i+1}: {lines[i][:100]}")
        # Check if there's a syntax issue on this line or nearby
