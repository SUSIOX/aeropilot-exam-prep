# 🚀 Firebase Quick Start Guide

## 📋 CHECKLIST PRO FIREBASE SETUP

### ✅ Krok 1: Firebase Console
- [ ] Přihlásit se na [console.firebase.google.com](https://console.firebase.google.com)
- [ ] Vytvořit nový projekt `aeropilot-exam-prep`
- [ ] Počkat na vytvoření (cca 1 minuta)

### ✅ Krok 2: Firestore Database
- [ ] V levém menu → Firestore Database
- [ ] "Vytvořit databázi"
- [ ] "V produkčním režimu"
- [ ] Lokalita: `europe-west1` (nebo blízká)
- [ ] "Povolit"

### ✅ Krok 3: Security Rules
- [ ] Jít na "Pravidla" (Rules)
- [ ] Smazat výchozí pravidla
- [ ] Vložit:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```
- [ ] "Publikovat"

### ✅ Krok 4: Získání konfigurace
- [ ] Nastavení projektu → Konfigurace
- [ ] Zkopírovat Firebase SDK snippet
- [ ] Najít `firebaseConfig` objekt

### ✅ Krok 5: Aktualizace kódu
- [ ] Otevřít `src/services/firebaseCache.ts`
- [ ] Nahradit `firebaseConfig` vaší konfigurací
- [ ] Uložit soubor

## 📝 PŘÍKLAD KONFIGURACE

**Z Firebase Console:**
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyC1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p",
  authDomain: "aeropilot-exam-prep.firebaseapp.com",
  projectId: "aeropilot-exam-prep",
  storageBucket: "aeropilot-exam-prep.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:a1b2c3d4e5f6g7h8i9j0k"
};
```

**V aplikaci:**
```javascript
// src/services/firebaseCache.ts
const firebaseConfig = {
  apiKey: "AIzaSyC1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p",
  authDomain: "aeropilot-exam-prep.firebaseapp.com",
  projectId: "aeropilot-exam-prep",
  storageBucket: "aeropilot-exam-prep.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:a1b2c3d4e5f6g7h8i9j0k"
};
```

## 🧪 TESTOVÁNÍ

### Jak otestovat:
1. Spustit aplikaci: `npm run dev`
2. Zkontrolovat console pro Firebase chyby
3. Vygenerovat AI odpověď
4. Zkontrolovat Firebase Console → Firestore Data

### Co vidět v Firebase Console:
- Kolekce `explanations`
- Kolekce `objectives`
- Dokumenty s ID jako `123_claude-sonnet-4-6`

## ⚠️ PROBLÉMY A ŘEŠENÍ

### Chyba: "Firebase project does not exist"
- Zkontrolujte `projectId` v konfiguraci
- Ujistěte se, že projekt je vytvořen

### Chyba: "Missing or insufficient permissions"
- Zkontrolujte Security Rules
- Ujistěte se, že jsou publikovány

### Chyba: "Network error"
- Zkontrolujte `apiKey` v konfiguraci
- Ujistěte se, že jste online

## 🎯 DALŠÍ KROKY

Po setupu:
1. **Nasazení** - GitHub Pages nebo Windsurf
2. **Testování** - více uživatelů
3. **Monitoring** - Firebase Console usage
4. **Analytics** - sledování populárních odpovědí

---

**Hotovo! Firebase je ready.** 🔥✈️
