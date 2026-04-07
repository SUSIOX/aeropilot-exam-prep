#!/usr/bin/env python3
# Fix handleResetProgress to properly wait for database deletion

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Find handleResetProgress and fix it
old_pattern = '''const handleResetProgress = async () => {
    if (!confirm('Opravdu chcete smazat veškerý váš postup a historii testů? Tato akce je nevratná.')) return;

    try {
      const uid = user?.id || 'guest';
      localStorage.removeItem(`${uid}:user_progress`);
      localStorage.removeItem(`${uid}:user_stats`);
      localStorage.removeItem(`${uid}:answers`);
      localStorage.removeItem(`${uid}:guest_stats`);
      localStorage.removeItem(`${uid}:session_start`);'''

new_pattern = '''const handleResetProgress = async () => {
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

if old_pattern in content:
    content = content.replace(old_pattern, new_pattern)
    print("Fixed handleResetProgress - DB deletion now happens FIRST")
else:
    print("Pattern not found")

with open('src/App.tsx', 'w') as f:
    f.write(content)

print("Done!")
