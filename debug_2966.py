#!/usr/bin/env python3
# Direct fix for line 2966 syntax error

with open('src/App.tsx', 'r') as f:
    lines = f.readlines()

# Show the exact content
print(f"File has {len(lines)} lines")
if len(lines) >= 2970:
    print("\nLines 2960-2970:")
    for i in range(2959, 2970):
        marker = ">>> " if i == 2965 else "    "
        line = lines[i].rstrip()
        # Show special characters
        line = line.replace('\t', '→').replace(' ', '·')
        print(f"{marker}{i+1}: {line[:100]}")

    # Check if line 2966 has unexpected content
    line_2966 = lines[2965] if len(lines) > 2965 else ""
    print(f"\nLine 2966 raw: {repr(line_2966)}")
