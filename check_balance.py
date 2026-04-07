#!/usr/bin/env python3
# Check and fix syntax issues

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Count parentheses and braces
parens = content.count('(') - content.count(')')
braces = content.count('{') - content.count('}')
brackets = content.count('[') - content.count(']')

print(f"Parentheses balance: {parens}")
print(f"Braces balance: {braces}")
print(f"Brackets balance: {brackets}")

# If unbalanced, there might be a syntax error
if parens != 0 or braces != 0 or brackets != 0:
    print("WARNING: Unbalanced brackets detected!")
    
    # Find the area around line 2966
    lines = content.split('\n')
    if len(lines) > 2966:
        print("\nContext around line 2966:")
        for i in range(2960, min(2970, len(lines))):
            marker = ">>> " if i == 2965 else "    "
            print(f"{marker}{i+1}: {lines[i][:80]}")
else:
    print("Brackets appear balanced")

print("\nDone!")
