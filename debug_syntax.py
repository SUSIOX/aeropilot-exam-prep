#!/usr/bin/env python3
with open('src/App.tsx', 'r') as f:
    content = f.read()
    lines = content.split('\n')

# Print lines 2960-2970 with line numbers
for i in range(2959, min(2970, len(lines))):
    print(f"{i+1}: {lines[i]}")
