# Aeropilot Exam Prep

**EASA PPL Knowledge Test Preparation with AI**

Moderní aplikace pro přípravu na pilotní zkoušky s AI vysvětleními.

## Živá ukázka

**GitHub Pages:** [https://vas-username.github.io/aeropilot-exam-prep/](https://vas-username.github.io/aeropilot-exam-prep/)

## Funkce

### AI Vysvětlení (Gemini + Claude)
- **Technické analýzy** - strohý, přesný popis
- **Lidská vysvětlení** - srozumitelné pro studenty
- **Všechny modely** - včetně nejnovější Claude 4.6
- **Ukládání odpovědí** - pro rychlé načítání

### Learning Objectives
- **Auto-detekce** - AI najde správné EASA LO
- **Integrace s databází** - ukládá detekované témata
- **Inteligentní kategorizace** - pro lepší organizaci

### Vlastnosti
- **1000+ otázek** - z reálných EASA testů
- **Vícejazyčný** - CZ/EN překlady
- **Dark mode** - pro noční studium
- **Responzivní** - mobilní, tablet, desktop
- **Offline připraven** - localStorage cache

## Lokální vývoj

**Prerequisites:** Node.js 20+

```bash
# Instalace
npm install

# Spuštění vývoje
npm run dev

# Build pro produkci
npm run build
```

## AI API Klíče

Pro plnou funkčnost potřebujete API klíče:

### Google Gemini (zdarma)
1. Jděte na [ai.google.dev](https://ai.google.dev)
2. Vytvořte API klíč
3. Zadejte do aplikace

### Anthropic Claude (placený)
1. Jděte na [console.anthropic.com](https://console.anthropic.com)
2. Vytvořte API klíč
3. Zadejte do aplikace

## Nasazení

### GitHub Pages (doporučeno)
1. Fork tohoto repository
2. Povolte GitHub Pages v Settings
3. Automatické nasazení při každém push

### Vlastní server
```bash
# Build
npm run build

# Nasazení
npm install -g serve
serve -s dist -l 3000
```

## Architektura

- **Frontend:** React 19 + Vite + TailwindCSS
- **AI:** Gemini SDK + Anthropic SDK
- **Storage:** localStorage (statická verze)
- **Deployment:** GitHub Pages

## Podporované Modely

### Google Gemini
- Gemini 3 Flash (rychlý)
- Gemini 3.1 Pro (chytřejší)
- Gemini 1.5 Flash (starší)

### Anthropic Claude
- Claude Sonnet 4.6 (nejnovější) 🆕
- Claude Opus 4.6 (nejlepší) 🆕
- Claude Sonnet 4 (stabilní)
- Claude Opus 4 (výkonný)
- Claude Haiku 4.5 (rychlý)

## Přispění

Vítáme pull requests! Hlavní oblasti:
- Nové otázky a témata
- Vylepšení AI vysvětlení
- UI/UX vylepšení
- Bug fixes

## Licence

MIT License - volné pro komerční i nekomerční použití

---

Made with love for aviation enthusiasts.
