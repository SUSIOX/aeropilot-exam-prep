#!/usr/bin/env python3
# Comprehensive fix for reset and statistics

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Fix 1: Update handleResetProgress with better logging and error handling
old_handle_reset = '''const handleResetProgress = async () => {
    if (!confirm('Opravdu chcete smazat veškerý váš postup a historii testů? Tato akce je nevratná.')) return;

    try {
      const uid = user?.id || 'guest';
      
      // CRITICAL: First delete from database for authenticated users
      if (!isGuestMode && user?.id) {
        console.log('[Reset] Deleting from DynamoDB...');
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
      localStorage.removeItem(`${uid}:session_start`);'''

new_handle_reset = '''const handleResetProgress = async () => {
    if (!confirm('Opravdu chcete smazat veškerý váš postup a historii testů? Tato akce je nevratná.')) return;

    try {
      const uid = user?.id || 'guest';
      
      // CRITICAL: First delete from database for authenticated users
      if (!isGuestMode && user?.id) {
        console.log('[Reset] Starting database deletion...');
        
        // Delete from USERS table (stats, progress, flags)
        const result = await dynamoDBService.deleteAllUserProgress(String(user.id));
        if (!result.success) {
          console.error('[Reset] USERS table deletion failed:', result.error);
          alert('Nepodařilo se smazat postup v databázi: ' + result.error);
          return;
        }
        console.log('[Reset] USERS table cleared');
        
        // Also delete flags
        const flagsResult = await dynamoDBService.deleteAllQuestionFlags(String(user.id));
        if (!flagsResult.success) {
          console.warn('[Reset] Could not delete flags:', flagsResult.error);
        } else {
          console.log('[Reset] Flags deleted from DB');
        }
      }
      
      // Then clear localStorage
      console.log('[Reset] Clearing localStorage...');
      localStorage.removeItem(`${uid}:user_progress`);
      localStorage.removeItem(`${uid}:user_stats`);
      localStorage.removeItem(`${uid}:answers`);
      localStorage.removeItem(`${uid}:guest_stats`);
      localStorage.removeItem(`${uid}:session_start`);
      localStorage.removeItem('question_flags');'''

if old_handle_reset in content:
    content = content.replace(old_handle_reset, new_handle_reset)
    print("Fixed handleResetProgress with comprehensive DB deletion")
else:
    print("Pattern not found")

# Fix 2: Add deleteAllUserProgressDetail function to dynamoService if not exists
# This would be in dynamoService.ts but we need to check if handleResetProgress uses it

with open('src/App.tsx', 'w') as f:
    f.write(content)

print("\nDone! Now testing the fix...")
