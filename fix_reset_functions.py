#!/usr/bin/env python3
# Fix 1: Add per-subject reset function and fix inconsistent deletion

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Add handleResetSubjectProgress function after handleResetProgress
new_function = '''
  // Reset progress for specific subject/category
  const handleResetSubjectProgress = async (subjectId: number, subjectName: string) => {
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
      setAnswers(filteredAnswers);
      
      alert(`Postup pro předmět "${subjectName}" byl smazán.`);
    } catch (err) {
      alert('Nepodařilo se smazat postup.');
    }
  };

'''

# Find handleResetProgress and insert new function after it
marker = 'const handleResetProgress = async () => {'
if marker in content and 'handleResetSubjectProgress' not in content:
    # Find the end of handleResetProgress function
    start_idx = content.find(marker)
    if start_idx != -1:
        # Look for the next function definition
        next_func_markers = ['const handleFileUpload', 'const handleDownloadCategories', 'const handle']
        end_idx = len(content)
        for marker in next_func_markers:
            idx = content.find(marker, start_idx + 100)
            if idx != -1 and idx < end_idx:
                end_idx = idx
        
        # Insert new function
        content = content[:end_idx] + new_function + content[end_idx:]
        print("Added handleResetSubjectProgress function")
else:
    print("handleResetSubjectProgress already exists or marker not found")

# Fix 2: Update the "Restartovat historii" button to be consistent
# Find the inline reset button and update it
old_button = '''<button
                        onClick={() => {
                          if (window.confirm('Opravdu chcete smazat historii všech pokusů? Tuto akci nelze vrátit.')) {
                            localStorage.removeItem(userKey('answers'));
                            if (!isGuestMode && user?.id) {
                              dynamoDBService.deleteAllUserProgress(String(user.id)).catch(() => { });
                            }
                            alert('Historie pokusů byla vymazána.');
                            window.location.reload(); // Refresh to update success rates on dashboard
                          }
                        }}'''

new_button = '''<button
                        onClick={() => {
                          if (window.confirm('Opravdu chcete smazat historii všech pokusů? Toto smaže všechny vaše odpovědi a úspěšnost.')) {
                            const uid = user?.id || 'guest';
                            // Remove all answers
                            localStorage.removeItem(userKey('answers'));
                            localStorage.removeItem(`${uid}:user_stats`);
                            localStorage.removeItem(`${uid}:guest_stats`);
                            
                            if (!isGuestMode && user?.id) {
                              dynamoDBService.deleteAllUserProgress(String(user.id)).catch(() => { });
                            }
                            
                            // Update state without reload
                            setAnswers({});
                            
                            alert('Historie pokusů byla vymazána.');
                          }
                        }}'''

if old_button in content:
    content = content.replace(old_button, new_button)
    print("Updated Restartovat historii button")
else:
    print("Button pattern not found - may need manual update")

with open('src/App.tsx', 'w') as f:
    f.write(content)

print("\nDone!")
