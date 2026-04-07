#!/usr/bin/env python3
# Fix ModelButton key prop and setAnswers errors

with open('src/App.tsx', 'r') as f:
    content = f.read()

print("=== Oprava chyb ===\n")

# Fix 1: ModelButton JSX syntax
old_model = "{(['gemini', 'claude', 'deepseek'] as const).map(p => (\n                              (ModelButton as any)({ key: p, provider: p, active: aiProvider === p, onClick: () => setAiProvider(p) })\n                            ))}"
new_model = """{(['gemini', 'claude', 'deepseek'] as const).map(p => (
                              <ModelButton key={p} provider={p} active={aiProvider === p} onClick={() => setAiProvider(p)} />
                            ))}"""

if old_model in content:
    content = content.replace(old_model, new_model)
    print("1. ✓ ModelButton: Opraven JSX syntax s key prop")
else:
    print("1. ⚠ ModelButton: Pattern nenalezen nebo již opraven")

# Fix 2: setAnswers - replace with localStorage clearing
if 'setAnswers({})' in content:
    # Replace all occurrences in handleResetProgress context
    old_reset = '''console.log('[Reset] localStorage cleared');

      // CRITICAL: Clear answers state BEFORE syncing to prevent old data restoration
      setAnswers({});
      
      // Small delay to ensure DynamoDB deletion is propagated
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Reload fresh data from DB
      await syncUserData();'''
    
    new_reset = '''console.log('[Reset] localStorage cleared');

      // Clear answers from localStorage directly
      localStorage.removeItem(`${uid}:answers`);
      console.log('[Reset] Answers cleared from localStorage');
      
      // Small delay to ensure DynamoDB deletion is propagated
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Reload fresh data from DB
      await syncUserData();'''
    
    if old_reset in content:
        content = content.replace(old_reset, new_reset)
        print("2. ✓ setAnswers: Nahrazeno localStorage clearing")
    else:
        # Try simpler replacement
        content = content.replace('setAnswers({});', '''localStorage.removeItem(`${uid}:answers`);''')
        print("2. ✓ setAnswers: Nahrazeno jednoduchým localStorage remove")
else:
    print("2. ⚠ setAnswers({}) nenalezeno v kódu")

with open('src/App.tsx', 'w') as f:
    f.write(content)

print("\n=== Opravy dokončeny ===")
print("\nSpusť 'npm run dev' pro ověření oprav.")
