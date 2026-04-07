#!/usr/bin/env python3
# Add UI for per-subject reset and fix state updates

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Add reset button to subject selection or progress area
# Find the LicenseProgress component usage and add reset button there

old_license_progress = '''<LicenseProgress
                                          questions={questions}
                                          answers={answers}
                                          subjectId={selectedSubject.id}
                                          showDetails={isProgressExpanded}
                                        />'''

new_license_progress = '''<LicenseProgress
                                          questions={questions}
                                          answers={answers}
                                          subjectId={selectedSubject.id}
                                          showDetails={isProgressExpanded}
                                        />
                                        {/* Per-subject reset button */}
                                        <button
                                          onClick={() => handleResetSubjectProgress(selectedSubject.id, selectedSubject.name)}
                                          className="mt-2 text-[10px] text-red-500 hover:text-red-400 underline"
                                        >
                                          Resetovat postup pro tento předmět
                                        </button>'''

if old_license_progress in content and 'handleResetSubjectProgress' in content:
    content = content.replace(old_license_progress, new_license_progress)
    print("Added per-subject reset button to LicenseProgress")
else:
    print("LicenseProgress pattern not found or handleResetSubjectProgress not available")

# Update handleResetProgress to also reset LicenseProgress state
old_handle_reset = '''alert('Váš postup byl úspěšně smazán.');
    } catch (err) {
      alert('Nepodařilo se smazat postup.');
    }
  };'''

new_handle_reset = '''alert('Váš postup byl úspěšně smazán.');
      
      // Reset local state without reload
      setAnswers({});
      
    } catch (err) {
      alert('Nepodařilo se smazat postup.');
    }
  };'''

if old_handle_reset in content:
    content = content.replace(old_handle_reset, new_handle_reset)
    print("Updated handleResetProgress to reset local state")
else:
    print("handleResetProgress pattern not found")

with open('src/App.tsx', 'w') as f:
    f.write(content)

print("\nDone!")
