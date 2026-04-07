#!/usr/bin/env python3
# Fix syntax error - remove broken LO generation code

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Find and remove the problematic handleGenerateLOs function
start_marker = 'const handleGenerateLOs = async () => {'
start_idx = content.find(start_marker)

if start_idx != -1:
    # Find the end of this function by looking for the next function definition
    # or a significant code boundary
    search_start = start_idx + len(start_marker)
    
    # Look for patterns that indicate end of function
    end_markers = [
        'const handle',
        'const [',
        'const start',
        'const toggle',
        'const set',
        'useEffect',
        'return (',
        'export default'
    ]
    
    end_idx = len(content)
    for marker in end_markers:
        idx = content.find(marker, search_start)
        if idx != -1 and idx < end_idx:
            end_idx = idx
    
    # Replace the broken function with a simple stub
    old_code = content[start_idx:end_idx]
    new_code = '''const handleGenerateLOs = async () => {
    console.warn('[handleGenerateLOs] DEPRECATED: LO generation is disabled');
    return { success: false, los: [], error: 'DEPRECATED' };
  };

  '''
    
    content = content[:start_idx] + new_code + content[end_idx:]
    print(f"Fixed handleGenerateLOs (replaced {len(old_code)} chars)")
else:
    print("handleGenerateLOs not found")

with open('src/App.tsx', 'w') as f:
    f.write(content)

print("Done!")
