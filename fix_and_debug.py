#!/usr/bin/env python3
with open('src/App.tsx', 'r') as f:
    lines = f.readlines()

# Write problematic lines to output file
with open('/tmp/debug2966.txt', 'w') as out:
    out.write("Lines 2960-2970:\n")
    for i in range(2959, min(2970, len(lines))):
        marker = ">>> " if i == 2965 else "    "
        out.write(f"{marker}{i+1}: {lines[i]}")

print("Debug info written to /tmp/debug2966.txt")

# Fix the issue: look for pattern around line 2966
for i in range(2950, min(2980, len(lines))):
    if ');' in lines[i] and i > 0:
        # Check context
        prev_lines = ''.join(lines[max(0,i-3):i+1])
        if 'AI_PROXY_URL' in prev_lines or 'getProxyIdToken' in prev_lines:
            # Found problematic area, fix it
            lines[i] = lines[i].replace(');', ';  // Fixed syntax')
            print(f"Fixed line {i+1}")
            break

with open('src/App.tsx', 'w') as f:
    f.writelines(lines)

print("Done!")
