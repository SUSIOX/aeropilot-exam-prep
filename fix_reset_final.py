#!/usr/bin/env python3
# Comprehensive fix for handleResetProgress

with open('src/App.tsx', 'r') as f:
    content = f.read()

# The new handleResetProgress function with correct order
new_function = '''const handleResetProgress = async () => {
    if (!confirm('Opravdu chcete smazat veškerý váš postup a historii testů? Tato akce je nevratná.')) return;

    try {
      const uid = user?.id || 'guest';
      
      // CRITICAL: First delete from database for authenticated users
      if (!isGuestMode && user?.id) {
        console.log('[Reset] Deleting progress from DynamoDB...');
        const result = await dynamoDBService.deleteAllUserProgress(String(user.id));
        if (!result.success) {
          console.error('[Reset] Failed to delete from DynamoDB:', result.error);
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

      // CRITICAL: Clear answers state BEFORE syncing to prevent old data restoration
      setAnswers({});
      
      // Small delay to ensure DynamoDB deletion is propagated
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Reload fresh data from DB
      await syncUserData();
      
      // Verify deletion worked for authenticated users
      if (!isGuestMode && user?.id) {
        const verifyResult = await dynamoDBService.getUserProgress(String(user.id));
        if (verifyResult.success && verifyResult.data) {
          const progressCount = Object.keys(verifyResult.data).length;
          if (progressCount > 0) {
            console.warn('[Reset] Warning: Some progress still exists in DB:', progressCount, 'items');
          } else {
            console.log('[Reset] Verified: No progress in DB');
          }
        }
      }

      alert('Váš postup byl úspěšně smazán.');
      
    } catch (err) {
      console.error('[Reset] Error:', err);
      alert('Nepodařilo se smazat postup.');
    }
  };'''

# Find the function start
start_marker = 'const handleResetProgress = async () => {'
start_idx = content.find(start_marker)

if start_idx == -1:
    print("ERROR: Could not find handleResetProgress!")
    exit(1)

print(f"Found handleResetProgress at position {start_idx}")

# Find the end of the function by looking for the pattern
end_marker = "alert('Váš postup byl úspěšně smazán.');"
end_idx = content.find(end_marker, start_idx)

if end_idx != -1:
    # Find the closing of the try block and the function
    closing_idx = content.find('  };', end_idx)
    if closing_idx != -1:
        end_idx = closing_idx + 4  # Include the "  };"
    else:
        # Fallback: look for catch block end
        catch_idx = content.find('  } catch', start_idx)
        if catch_idx != -1:
            closing_idx = content.find('  };', catch_idx)
            if closing_idx != -1:
                end_idx = closing_idx + 4
        
if end_idx == -1 or end_idx <= start_idx:
    print("ERROR: Could not find end of function!")
    # Try simpler approach - find next function
    next_func = content.find('const handle', start_idx + len(start_marker))
    if next_func != -1:
        end_idx = next_func
        print(f"Using next function as end marker at {end_idx}")
    else:
        exit(1)

print(f"Function spans from {start_idx} to {end_idx}")

# Replace the function
old_func = content[start_idx:end_idx]
content = content[:start_idx] + new_function + content[end_idx:]

print("✓ Replaced handleResetProgress with fixed version")

# Write back
with open('src/App.tsx', 'w') as f:
    f.write(content)

print("✓ File saved")
print("\nThe fix ensures:")
print("1. DB deletion happens FIRST (before localStorage)")
print("2. State is cleared before sync")
print("3. Added verification step")
print("4. Added delay for DB propagation")
