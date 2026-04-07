#!/usr/bin/env python3
# Read and analyze the error area around line 2966

with open('src/App.tsx', 'r') as f:
    lines = f.readlines()

print("Lines 2960-2970:")
for i in range(2959, min(2970, len(lines))):
    marker = ">>> " if i == 2965 else "    "
    line_content = lines[i].rstrip()
    print(f"{marker}{i+1}: {line_content[:100]}")

# Check for syntax issues
print("\nAnalyzing for syntax errors...")
# Look for mismatched parentheses around this area
paren_count = 0
brace_count = 0
for i in range(2950, min(2980, len(lines))):
    line = lines[i]
    paren_count += line.count('(') - line.count(')')
    brace_count += line.count('{') - line.count('}')
    
print(f"Parentheses balance from line 2950-2980: {paren_count}")
print(f"Braces balance from line 2950-2980: {brace_count}")
