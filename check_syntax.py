#!/usr/bin/env python3
with open('src/App.tsx', 'r') as f:
    lines = f.readlines()

# Print lines 2960-2970
for i in range(2959, min(2970, len(lines))):
    print(f"{i+1}: {lines[i].rstrip()[:80]}")

# Count braces and parentheses from line 2900 to 3000
open_parens = 0
close_parens = 0
open_braces = 0
close_braces = 0

for i in range(2900, min(3000, len(lines))):
    line = lines[i]
    open_parens += line.count('(')
    close_parens += line.count(')')
    open_braces += line.count('{')
    close_braces += line.count('}')

print(f"\nBalance check (lines 2900-3000):")
print(f"  Parentheses: {open_parens} open, {close_parens} close, diff: {open_parens - close_parens}")
print(f"  Braces: {open_braces} open, {close_braces} close, diff: {open_braces - close_braces}")
