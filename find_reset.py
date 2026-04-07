#!/usr/bin/env python3
with open('src/App.tsx', 'r') as f:
    lines = f.readlines()

# Find the start of handleResetProgress
start_line = None
for i, line in enumerate(lines):
    if 'const handleResetProgress = async () => {' in line:
        start_line = i
        break

if start_line is None:
    print("ERROR: handleResetProgress not found!")
    exit(1)

print(f"Found handleResetProgress at line {start_line + 1}")

# Find where the function ends (look for the closing "};" at the right indentation level)
end_line = None
for i in range(start_line + 1, len(lines)):
    if lines[i].strip() == '};' and lines[i].startswith('  '):
        end_line = i
        break

if end_line is None:
    print("ERROR: Could not find end of handleResetProgress!")
    exit(1)

print(f"Function ends at line {end_line + 1}")

# Extract and show the function
print("\nCurrent function:")
print("=" * 60)
for i in range(start_line, min(end_line + 1, start_line + 40)):
    print(f"{i+1}: {lines[i].rstrip()[:80]}")
print("=" * 60)

# Check if it has the bug
func_text = ''.join(lines[start_line:end_line+1])
if 'localStorage.removeItem' in func_text and 'dynamoDBService.deleteAllUserProgress' in func_text:
    local_pos = func_text.find('localStorage.removeItem')
    db_pos = func_text.find('dynamoDBService.deleteAllUserProgress')
    
    if local_pos < db_pos:
        print(f"\nBUG: localStorage at {local_pos}, DB at {db_pos}")
        print("localStorage is cleared BEFORE DB deletion!")
    else:
        print(f"\nOK: DB at {db_pos}, localStorage at {local_pos}")
        print("Order appears correct.")
else:
    print("\nCould not find both operations")
