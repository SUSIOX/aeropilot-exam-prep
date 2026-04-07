#!/usr/bin/env python3
with open('src/App.tsx', 'r') as f:
    lines = f.readlines()

# Print context around line 2966 (0-indexed: 2965)
for i in range(2960, min(2975, len(lines))):
    prefix = ">>> " if i == 2965 else "    "
    print(f"{prefix}{i+1}: {lines[i].rstrip()[:80]}")
