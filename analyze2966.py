#!/usr/bin/env python3
# Fix syntax error at line 2966

with open('src/App.tsx', 'r') as f:
    lines = f.readlines()

# Check if line 2966 exists and what's on it
if len(lines) >= 2966:
    print(f"Line 2966: {repr(lines[2965])}")
    
    # Check previous lines for context
    for i in range(2960, min(2970, len(lines))):
        print(f"{i+1}: {lines[i][:80]}")
    
    # Look for the pattern that causes the error
    # The error shows ");" at line 2966
    # This is likely in a function call with await getProxyIdToken()
    
    # Check if there's a broken function call
    for i in range(2950, min(2980, len(lines))):
        if 'getProxyIdToken' in lines[i] or 'AI_PROXY_URL' in lines[i]:
            print(f"\nFound at line {i+1}: {lines[i][:80]}")

print("\nDone analyzing")
