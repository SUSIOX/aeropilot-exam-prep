# Kontrola Reset a Mazání Historie - Nálezy

## 1. Nalezené Funkce Reset

### handleResetProgress (App.tsx:3329)
**Co maže:**
- `${uid}:user_progress` (localStorage)
- `${uid}:user_stats` (localStorage)  
- `${uid}:answers` (localStorage)
- `${uid}:guest_stats` (localStorage)
- `${uid}:session_start` (localStorage)
- DynamoDB `progress` field (pro přihlášené uživatele)

**Volá:** `dynamoDBService.deleteAllUserProgress()`

### handleResetFlags (App.tsx:2856)
**Co maže:**
- `question_flags` (localStorage)
- DynamoDB `flags` field (pro přihlášené uživatele)

**Volá:** `dynamoDBService.deleteAllQuestionFlags()`

### Tlačítko "Restartovat historii" (App.tsx:4778)
**Co maže:**
- Pouze `userKey('answers')` (localStorage)
- DynamoDB progress (pro přihlášené uživatele)

**Rozdíl:** Toto je částečné mazání, neúplné jako `handleResetProgress`

## 2. DynamoDB Funkce (dynamoService.ts)

### deleteAllUserProgress (line 370)
```typescript
UpdateExpression: 'SET progress = :empty, updatedAt = :now'
```
- Maže celý `progress` objekt v tabulce USERS

### deleteSubjectProgress (line 388)
- Maže progress pro konkrétní předmět (subjectId)
- Batch delete z USER_PROGRESS tabulky
- Aktualizuje SUMMARY record

### deleteAllQuestionFlags (line 754)
```typescript
UpdateExpression: 'SET flags = :empty, updatedAt = :now'
```
- Maže celý `flags` objekt v tabulce USERS

## 3. Potenciální Problémy

### Problém 1: Nekonzistentní mazání
- `handleResetProgress` maže vše (answers, stats, progress, session)
- Tlačítko "Restartovat historii" maže pouze answers
- **Doporučení:** Sjednotit nebo přejmenovat tlačítka pro jasnost

### Problém 2: LicenseProgress komponenta
- Po smazání historie by se měla aktualizovat LicenseProgress
- Aktuálně se spoléhá na `window.location.reload()`
- **Doporučení:** Přidat callback pro aktualizaci stavu bez reloadu

### Problém 3: Smazání podle kategorie
- Není UI pro mazání pouze jedné kategorie/předmětu
- `deleteSubjectProgress` existuje v API ale není využita v UI
- **Doporučení:** Přidat možnost resetu pro konkrétní předmět

## 4. Doporučení pro Opravy

### 4.1 Přidat reset pro konkrétní předmět
```typescript
const handleResetSubjectProgress = async (subjectId: number) => {
  // Mazání pouze pro vybraný předmět
  await dynamoDBService.deleteSubjectProgress(user.id, subjectId);
  // Aktualizace lokálního stavu
  updateLicenseProgress(); // Nová funkce
};
```

### 4.2 Aktualizace LicenseProgress po resetu
```typescript
const resetAndRefresh = async () => {
  await handleResetProgress();
  // Místo reloadu - lokální aktualizace
  setAnswers({});
  recalculateLicenseStats();
};
```

### 4.3 Jasnější UI popisky
- "Smazat všechny odpovědi" místo "Restartovat historii"
- "Resetovat celý postup" místo současného nejasného tlačítka

## 5. Závěr

**Stav:** Funkce fungují, ale jsou nekonzistentní a mohou uživatele mást.

**Priorita oprav:**
1. Vysoká - Sjednotit mazání nebo přejmenovat tlačítka
2. Střední - Přidat mazání pro konkrétní předmět  
3. Nízká - Aktualizace bez reloadu (UX vylepšení)
