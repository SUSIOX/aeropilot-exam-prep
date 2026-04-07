#!/usr/bin/env python3
# Read and analyze the error area

with open('src/App.tsx', 'r') as f:
    lines = f.readlines()

# Print lines 2955-2980
for i in range(2954, min(2980, len(lines))):
    marker = " >>>" if i == 2965 else ""
    print(f"{i+1}{marker}: {lines[i]}", end='')
