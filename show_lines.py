#!/usr/bin/env python3
# Read file and show exact lines 2960-2970

with open('src/App.tsx', 'r') as f:
    lines = f.readlines()

print("Lines 2960-2970:")
for i in range(2959, min(2970, len(lines))):
    marker = ">>> " if i == 2965 else "    "
    line = lines[i].rstrip()
    print(f"{marker}{i+1}: {line[:100]}")

# Find the problematic pattern
print("\n\nSearching for patterns around line 2966...")
for i in range(2960, min(2975, len(lines))):
    line = lines[i]
    if 'result' in line or 'success' in line or 'setGeneratedLOs' in line:
        print(f"Line {i+1}: {line[:80]}")
