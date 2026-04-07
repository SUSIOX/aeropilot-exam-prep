#!/usr/bin/env python3
# Find and fix syntax error around line 2966

with open('src/App.tsx', 'r') as f:
    lines = f.readlines()

# Check lines around 2966
start = max(0, 2965 - 10)
end = min(len(lines), 2965 + 10)

print("Lines around 2966:")
for i in range(start, end):
    print(f"{i+1}: {lines[i][:80]}")

# Look for common syntax issues
for i in range(start, end):
    line = lines[i]
    # Check for unclosed parentheses, brackets, etc.
    if 'AI_PROXY_URL' in line and 'getProxyIdToken' in lines[i+1] if i+1 < len(lines) else False:
        print(f"\nFound problematic code at line {i+1}")
        # Check if there's a missing parenthesis or bracket before this
        for j in range(max(0, i-5), i):
            print(f"  {j+1}: {lines[j][:60]}")
