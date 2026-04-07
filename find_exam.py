#!/usr/bin/env python3
# Find exam mode UI location

with open('src/App.tsx', 'r') as f:
    lines = f.readlines()

# Search for exam-related lines
for i, line in enumerate(lines):
    if 'startUCLExam' in line or 'UCL' in line and ('exam' in line.lower() or 'zkouška' in line.lower()):
        print(f"Line {i+1}: {line[:100]}")
