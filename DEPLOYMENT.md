# Aeropilot Exam Prep - GitHub Pages Deployment

Tato aplikace byla připravena pro nasazení na GitHub Pages.

## 🚀 Nasazení na GitHub Pages

### 1. Vytvořte GitHub repository
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/vas-username/aeropilot-exam-prep.git
git push -u origin main
```

### 2. Povolte GitHub Pages
1. Jděte na Settings → Pages
2. Vyberte "GitHub Actions" jako zdroj
3. Uložte nastavení

### 3. Automatické nasazení
- Každý push do `main` branch automaticky nasadí aplikaci
- Bude dostupná na: `https://vas-username.github.io/aeropilot-exam-prep/`

## 📝 Poznámky

### Backend vs Frontend
Tato verze je **pouze frontend** (statická) pro GitHub Pages:
- ✅ Všechny AI funkce fungují (přímo v prohlížeči)
- ✅ Ukládání do localStorage
- ❌ Žádný backend (databáze, uživatelské účty)
- ❌ Žádné synchronizace mezi zařízeními

### AI API klíče
Uživatelé musí zadat vlastní API klíče:
- **Gemini**: Zdarma na [ai.google.dev](https://ai.google.dev)
- **Claude**: Na [console.anthropic.com](https://console.anthropic.com)

### Pro plnou verzi s backendem
Pokud chcete plnou verzi s databází a uživatelskými účty:
1. Nasaďte na VPS (DigitalOcean, Hetzner)
2. Použijte Railway, Render, nebo Vercel s backendem
3. Nebo kontaktujte mě pro kompletní nasazení

## 🎯 Funkce ve statické verzi

- ✅ Všechny AI odpovědi (Gemini + Claude)
- ✅ Ukládání AI odpovědí do localStorage
- ✅ Všechny modely (včetně nejnovější Claude 4.6)
- ✅ Learning objectives detekce
- ✅ Podrobná lidská vysvětlení
- ✅ Všechny otázky a překlady
- ✅ Dark mode a responzivní design

## 🔧 Lokální vývoj

```bash
npm install
npm run dev
```

Aplikace poběží na `http://localhost:5173`
