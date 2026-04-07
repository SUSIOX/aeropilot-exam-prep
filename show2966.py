#!/usr/bin/env python3
# Show line 2966 and context

with open('src/App.tsx', 'r') as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")
print(f"\nLines 2960-2970:")
for i in range(2959, min(2970, len(lines))):
    marker = ">>> " if i == 2965 else "    "
    content = lines[i].rstrip()
    print(f"{marker}{i+1}: {content[:100]}")
