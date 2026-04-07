#!/usr/bin/env python3
# Add additional verification and ensure complete reset

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Find the end of handleResetProgress and add verification
old_end = '''console.log('[Reset] localStorage cleared');

      // Reload fresh data from DB (BUT NOT progress - it's now empty)
      await syncUserData();
      
      // Force clear the local answers state
      setAnswers({});

      alert('Váš postup byl úspěšně smazán.');
      
      // Reset local state without reload
      setAnswers({});
      
    } catch (err) {
      alert('Nepodařilo se smazat postup.');
    }
  };'''

new_end = '''console.log('[Reset] localStorage cleared');

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
      alert('Nepodařilo se smazat postup: ' + (err.message || 'Neznámá chyba'));
    }
  };'''

if old_end in content:
    content = content.replace(old_end, new_end)
    print("Added verification and delay to handleResetProgress")
else:
    print("End pattern not found - checking alternative...")
    # Try simpler pattern
    alt_end = '''console.log('[Reset] localStorage cleared');

      // Reload fresh data from DB (BUT NOT progress - it's now empty)
      await syncUserData();'''
    
    alt_new = '''console.log('[Reset] localStorage cleared');

      // Clear state before sync
      setAnswers({});
      
      // Small delay for DB propagation
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Reload fresh data from DB
      await syncUserData();'''
    
    if alt_end in content:
        content = content.replace(alt_end, alt_new)
        print("Added state clearing and delay (alternative pattern)")
    else:
        print("Alternative pattern not found either")

with open('src/App.tsx', 'w') as f:
    f.write(content)

print("\nDone!")
