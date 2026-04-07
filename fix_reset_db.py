#!/usr/bin/env python3
# Fix handleResetProgress to properly wait for database deletion

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Fix: The problem is that handleResetProgress has syncUserData() which might reload old data
# Let's fix it to properly handle the async deletion

old_reset_progress = '''const handleResetProgress = async () => {
    if (!confirm('Opravdu chcete smazat veškerý váš postup a historii testů? Tato akce je nevratná.')) return;

    try {
      const uid = user?.id || 'guest';
      localStorage.removeItem(`${uid}:user_progress`);
      localStorage.removeItem(`${uid}:user_stats`);
      localStorage.removeItem(`${uid}:answers`);
      localStorage.removeItem(`${uid}:guest_stats`);
      localStorage.removeItem(`${uid}:session_start`);

      // Delete progress from DynamoDB for authenticated users
      if (!isGuestMode && user?.id) {
        const result = await dynamoDBService.deleteAllUserProgress(String(user.id));
        if (!result.success) {
          alert('Nepodařilo se smazat postup v databázi: ' + result.error);
          return;
        }
      }

      // Reload fresh data from DB (correct question counts etc.)
      await syncUserData();'''

new_reset_progress = '''const handleResetProgress = async () => {
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
      await syncUserData();
      
      // Force clear the local answers state
      setAnswers({});'''

if old_reset_progress in content:
    content = content.replace(old_reset_progress, new_reset_progress)
    print("Fixed handleResetProgress to properly delete from DB first")
else:
    print("Pattern not found - checking for alternative...")

# Also fix handleResetSubjectProgress
old_subject_reset = '''const handleResetSubjectProgress = async (subjectId: number, subjectName: string) => {
    if (!window.confirm(`Opravdu chcete smazat postup pro předmět "${subjectName}"? Tato akce je nevratná.`)) return;

    try {
      const uid = user?.id || 'guest';
      const answersKey = `${uid}:answers`;
      const existingAnswers = JSON.parse(localStorage.getItem(answersKey) || '{}');
      
      // Filter out answers for this subject
      const filteredAnswers = Object.entries(existingAnswers).reduce((acc, [key, value]: [string, any]) => {
        if (value.subjectId !== subjectId) {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, any>);
      
      localStorage.setItem(answersKey, JSON.stringify(filteredAnswers));

      // Delete from DynamoDB for authenticated users
      if (!isGuestMode && user?.id) {
        const result = await dynamoDBService.deleteSubjectProgress(String(user.id), subjectId);
        if (!result.success) {
          alert('Nepodařilo se smazat postup v databázi: ' + result.error);
          return;
        }
      }

      // Update state without reload
      setAnswers(filteredAnswers);'''

new_subject_reset = '''const handleResetSubjectProgress = async (subjectId: number, subjectName: string) => {
    if (!window.confirm(`Opravdu chcete smazat postup pro předmět "${subjectName}"? Tato akce je nevratná.`)) return;

    try {
      const uid = user?.id || 'guest';
      
      // Delete from DynamoDB first for authenticated users
      if (!isGuestMode && user?.id) {
        console.log(`[Reset Subject] Deleting subject ${subjectId} from DynamoDB...`);
        const result = await dynamoDBService.deleteSubjectProgress(String(user.id), subjectId);
        if (!result.success) {
          console.error('[Reset Subject] Failed to delete from DynamoDB:', result.error);
          alert('Nepodařilo se smazat postup v databázi: ' + result.error);
          return;
        }
        console.log('[Reset Subject] DynamoDB deletion successful');
      }
      
      const answersKey = `${uid}:answers`;
      const existingAnswers = JSON.parse(localStorage.getItem(answersKey) || '{}');
      
      // Filter out answers for this subject
      const filteredAnswers = Object.entries(existingAnswers).reduce((acc, [key, value]: [string, any]) => {
        if (value.subjectId !== subjectId) {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, any>);
      
      localStorage.setItem(answersKey, JSON.stringify(filteredAnswers));
      console.log('[Reset Subject] localStorage updated');

      // Update state without reload
      setAnswers(filteredAnswers);'''

if old_subject_reset in content:
    content = content.replace(old_subject_reset, new_subject_reset)
    print("Fixed handleResetSubjectProgress to delete from DB first")
else:
    print("Subject reset pattern not found")

with open('src/App.tsx', 'w') as f:
    f.write(content)

print("\nDone!")
