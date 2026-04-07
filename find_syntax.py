#!/usr/bin/env python3
with open('src/App.tsx') as f:
    lines = f.readlines()

# Check area around line 2966
for i in range(2960, min(2975, len(lines))):
    print(f"{i}: {repr(lines[i])}")
