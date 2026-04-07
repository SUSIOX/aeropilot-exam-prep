#!/usr/bin/env python3
# Direct analysis and fix

with open('src/App.tsx', 'r') as f:
    lines = f.readlines()

# Print exact lines around 2966
print(f"Total lines: {len(lines)}")
print("\n=== Lines 2960-2970 ===")
for i in range(2959, min(2970, len(lines))):
    marker = ">>> " if i == 2965 else "    "
    print(f"{marker}{i+1}: {lines[i].rstrip()[:100]}")

# Check for the specific error pattern
print("\n=== Checking for broken code ===")
for i in range(2900, min(3000, len(lines))):
    if 'result.success' in lines[i] and i > 0:
        # Check previous line for syntax issues
        prev = lines[i-1].strip()
        if prev.endswith(');'):
            print(f"Line {i}: Found result.success after ');'")
            print(f"  Previous: {prev}")
            print(f"  Current: {lines[i].strip()[:60]}")
