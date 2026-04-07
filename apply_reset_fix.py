#!/usr/bin/env python3
import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Find handleResetProgress function
start_marker = 'const handleResetProgress = async () => {'
start_idx = content.find(start_marker)

if start_idx == -1:
    print("ERROR: handleResetProgress not found!")
    exit(1)

# Find the end - look for the pattern after the alert
end_marker = "alert('Váš postup byl úspěšně smazán.');"
end_idx = content.find(end_marker, start_idx)

if end_idx == -1:
    print("ERROR: Could not find end of function!")
    exit(1)

# Find the closing "  };" after the alert
closing_idx = content.find('  };', end_idx)
if closing_idx != -1:
    end_idx = closing_idx + 4

print(f"Found function from {start_idx} to {end_idx}")

# The fixed function
new_func = '''const handleResetProgress = async () => {
    if (!confirm('Opravdu chcete smazat veškerý váš postup a historii testů? Tato akce je nevratná.')) return;

    try {
      const uid = user?.id || 'guest';
      
      // CRITICAL: First delete from database for authenticated users
      if (!isGuestMode && user?.id) {
        console.log('[Reset] Deleting progress from DynamoDB...');
        const result = await dynamoDBService.deleteAllUserProgress(String(user.id));
        if (!result.success) {
          console.error('[Reset] Failed:', result.error);
          alert('Nepodařilo se smazat postup v databázi: ' + result.error);
          return;
        }
        console.log('[Reset] DynamoDB deletion successful');
      }

      // Then clear localStorage
      localStorage.removeItem(`${uid}:user_progress`);
      localStorage.removeItem(`${uid}:user_stats`);
      localStorage.removeItem(`${uid}:answers`);
      localStorage.removeItem(`${uid}:guest_stats`);
      localStorage.removeItem(`${uid}:session_start`);
      localStorage.removeItem('question_flags');
      
      console.log('[Reset] localStorage cleared');

      // CRITICAL: Clear state BEFORE syncing
      setAnswers({});
      
      // Wait for DB propagation
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Reload fresh data
      await syncUserData();

      alert('Váš postup byl úspěšně smazán.');
      
    } catch (err) {
      console.error('[Reset] Error:', err);
      alert('Nepodařilo se smazat postup.');
    }
  };'''

# Replace
old_func = content[start_idx:end_idx]
content = content[:start_idx] + new_func + content[end_idx:]

with open('src/App.tsx', 'w') as f:
    f.write(content)

print("✓ Fixed handleResetProgress")
print("\nChanges made:")
print("1. DB deletion happens BEFORE localStorage clearing")
print("2. setAnswers({}) called before sync")
print("3. Added 500ms delay for DB propagation")
print("4. Added console logging")
