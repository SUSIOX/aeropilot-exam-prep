#!/usr/bin/env python3
# Fix syntax error in App.tsx around line 2966

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Find and remove the problematic deprecated LO generation code block
# This is around the generateMissingLearningObjectives function area

# Pattern to find the problematic section
start_marker = "const handleGenerateLOs = async () =>"
if start_marker in content:
    # Find the start of this function
    start_idx = content.find(start_marker)
    if start_idx != -1:
        # Find where this function ends (next function definition or major section)
        # Look for "const handle" or "const [" which would indicate next function/state
        next_func = content.find("const handle", start_idx + len(start_marker))
        if next_func == -1:
            next_func = content.find("const [", start_idx + len(start_marker))
        
        if next_func != -1:
            # Comment out the entire problematic function
            old_section = content[start_idx:next_func]
            new_section = '''// DEPRECATED: LO generation removed
const handleGenerateLOs = async () => {
  console.warn('LO generation is deprecated');
  return;
};

'''
            content = content[:start_idx] + new_section + content[next_func:]
            print("Fixed handleGenerateLOs function")
        else:
            print("Could not find end of handleGenerateLOs")
    else:
        print("Could not find handleGenerateLOs")
else:
    print("handleGenerateLOs not found - may already be fixed")

# Also remove any dangling references to generateMissingLearningObjectives
content = content.replace("generateMissingLearningObjectives(", "// generateMissingLearningObjectives deprecated")

with open('src/App.tsx', 'w') as f:
    f.write(content)

print("Done!")
