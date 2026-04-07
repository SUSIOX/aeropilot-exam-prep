#!/usr/bin/env python3
# Fix ModelButton key prop and setAnswers issues

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Fix 1: ModelButton usage - change from function call to JSX
old_modelbutton = """{(['gemini', 'claude', 'deepseek'] as const).map(p => (
                              (ModelButton as any)({ key: p, provider: p, active: aiProvider === p, onClick: () => setAiProvider(p) })
                            ))}"""

new_modelbutton = """{(['gemini', 'claude', 'deepseek'] as const).map(p => (
                              <ModelButton key={p} provider={p} active={aiProvider === p} onClick={() => setAiProvider(p)} />
                            ))}"""

if old_modelbutton in content:
    content = content.replace(old_modelbutton, new_modelbutton)
    print("✓ Fixed ModelButton key prop (line 4709)")
else:
    print("⚠ ModelButton pattern not found")

# Fix 2: Check if setAnswers is defined in handleResetProgress scope
# Find handleResetProgress and check if it references setAnswers
if 'setAnswers({})' in content:
    # Find where useState for answers is defined
    if 'const [answers, setAnswers]' not in content and 'const [answers,' not in content:
        print("⚠ WARNING: setAnswers is used but answers useState not found!")
        
        # We need to add setAnswers as a parameter or find another solution
        # Let's use localStorage clearing only and force state update through other means
        
        # Replace setAnswers({}) with window.location.reload() for now as fallback
        content = content.replace('setAnswers({})', '// setAnswers not in scope - using reload instead\n      window.location.reload()')
        print("✓ Replaced setAnswers with window.location.reload as fallback")
    else:
        print("✓ answers useState found - setAnswers should be available")

with open('src/App.tsx', 'w') as f:
    f.write(content)

print("\nDone!")
