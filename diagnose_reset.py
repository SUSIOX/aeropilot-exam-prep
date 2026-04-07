#!/usr/bin/env python3
import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Find handleResetProgress function
pattern = r'const handleResetProgress = async \(\) => \{[^}]*\}'
match = re.search(pattern, content, re.DOTALL)

if match:
    func = match.group(0)
    print("Found handleResetProgress function")
    print("="*60)
    # Print first 800 chars
    print(func[:800])
    print("="*60)
    
    # Check order
    db_pos = func.find('dynamoDBService.deleteAllUserProgress')
    local_pos = func.find('localStorage.removeItem')
    
    print(f"\nDB deletion at position: {db_pos}")
    print(f"localStorage at position: {local_pos}")
    
    if db_pos == -1:
        print("\nERROR: No DB deletion found!")
    elif local_pos == -1:
        print("\nERROR: No localStorage clearing found!")
    elif local_pos < db_pos:
        print("\nBUG FOUND: localStorage cleared BEFORE DB deletion!")
        print("This causes the bug - data is deleted locally first,")
        print("then sync happens and restores from DB before DB is cleared.")
    else:
        print("\nOrder appears correct: DB before localStorage")
else:
    print("Could not find handleResetProgress function")
    print("Trying alternative search...")
    
    # Try finding by name only
    idx = content.find('handleResetProgress')
    if idx != -1:
        print(f"Found 'handleResetProgress' at position {idx}")
        print("Context:")
        print(content[idx-50:idx+200])
