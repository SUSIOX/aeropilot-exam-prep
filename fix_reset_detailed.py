#!/usr/bin/env python3
# Comprehensive diagnostic and fix for reset functionality

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Find handleResetProgress and add comprehensive logging
old_reset = '''const handleResetProgress = async () => {
    if (!confirm('Opravdu chcete smazat veškerý váš postup a historii testů? Tato akce je nevratná.')) return;

    try {
      const uid = user?.id || 'guest';
      
      // First delete from database for authenticated users
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

      // Reload fresh data from DB (BUT NOT progress - it's now empty)
      await syncUserData();'''

new_reset = '''const handleResetProgress = async () => {
    if (!confirm('Opravdu chcete smazat veškerý váš postup a historii testů? Tato akce je nevratná.')) return;

    try {
      const uid = user?.id || 'guest';
      console.log('[Reset] Starting reset for user:', uid);
      
      // First delete from database for authenticated users
      if (!isGuestMode && user?.id) {
        console.log('[Reset] Step 1: Deleting from DynamoDB USERS table...');
        const result = await dynamoDBService.deleteAllUserProgress(String(user.id));
        if (!result.success) {
          console.error('[Reset] FAILED - DynamoDB error:', result.error);
          alert('Nepodařilo se smazat postup v databázi: ' + result.error);
          return;
        }
        console.log('[Reset] Step 1: ✓ DynamoDB USERS.progress cleared');
        
        // Also delete flags from DB
        console.log('[Reset] Step 2: Deleting flags from DynamoDB...');
        const flagsResult = await dynamoDBService.deleteAllQuestionFlags(String(user.id));
        if (!flagsResult.success) {
          console.warn('[Reset] Could not delete flags:', flagsResult.error);
        } else {
          console.log('[Reset] Step 2: ✓ DynamoDB flags cleared');
        }
      } else {
        console.log('[Reset] Skipping DB deletion (guest mode or no user)');
      }

      // Then clear localStorage
      console.log('[Reset] Step 3: Clearing localStorage...');
      const itemsBefore = [
        localStorage.getItem(`${uid}:user_progress`),
        localStorage.getItem(`${uid}:answers`),
        localStorage.getItem(`${uid}:user_stats`)
      ].filter(Boolean).length;
      
      localStorage.removeItem(`${uid}:user_progress`);
      localStorage.removeItem(`${uid}:user_stats`);
      localStorage.removeItem(`${uid}:answers`);
      localStorage.removeItem(`${uid}:guest_stats`);
      localStorage.removeItem(`${uid}:session_start`);
      localStorage.removeItem('question_flags');
      
      console.log(`[Reset] Step 3: ✓ Cleared ${itemsBefore} items from localStorage`);

      // CRITICAL: Clear React state BEFORE syncing
      console.log('[Reset] Step 4: Clearing React state...');
      setAnswers({});
      console.log('[Reset] Step 4: ✓ React state cleared');
      
      // Wait for DB to propagate
      console.log('[Reset] Step 5: Waiting for DB propagation...');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Reload fresh data
      console.log('[Reset] Step 6: Syncing with DB...');
      await syncUserData();
      
      // Verify
      if (!isGuestMode && user?.id) {
        console.log('[Reset] Step 7: Verifying deletion...');
        const verifyResult = await dynamoDBService.getUserProgress(String(user.id));
        if (verifyResult.success) {
          const progressKeys = verifyResult.data ? Object.keys(verifyResult.data).length : 0;
          console.log(`[Reset] Verification: ${progressKeys} progress items in DB`);
          if (progressKeys > 0) {
            console.warn('[Reset] WARNING: Progress still exists in DB!');
          }
        }
      }
      
      console.log('[Reset] ✓ Reset complete!');
      alert('Váš postup byl úspěšně smazán.');
      
    } catch (err: any) {
      console.error('[Reset] UNEXPECTED ERROR:', err);
      alert('Nepodařilo se smazat postup: ' + (err.message || 'Neznámá chyba'));
    }
  };'''

if old_reset in content:
    content = content.replace(old_reset, new_reset)
    print("✓ Added comprehensive logging to handleResetProgress")
    with open('src/App.tsx', 'w') as f:
        f.write(content)
    print("✓ File saved")
else:
    print("✗ Pattern not found - checking current state...")
    # Check if already fixed
    if '[Reset] Step 1:' in content:
        print("✓ Logging already added!")
    else:
        print("✗ Could not find the pattern to replace")
        print("Current handleResetProgress may have different structure")

print("\nDone!")
