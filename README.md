# Aeropilot Exam Prep

**EASA PPL Knowledge Test Preparation with AI**

Moderní aplikace pro přípravu na pilotní zkoušky s AI vysvětleními.

## Živá ukázka

**GitHub Pages:** [https://vas-username.github.io/aeropilot-exam-prep/](https://vas-username.github.io/aeropilot-exam-prep/)

## Funkce

### AI Vysvětlení (Gemini + Claude + DeepSeek)
- **Technické analýzy** - strohý, přesný popis
- **Lidská vysvětlení** - srozumitelné pro studenty
- **Všechny modely** - včetně nejnovější Claude 4.6 a DeepSeek V3
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

## Zdroje Otázek

### AWS DynamoDB Database
- Všechny otázky uloženy v AWS DynamoDB
- Rychlý přístup a synchronizace
- Automatické zálohování a replikace

### UCL (Ústav pro letecké vzdělávání)
- Oficiální testovací databáze UCL
- Reálné zkouškové otázky z CAA
- Aktualizované podle aktuálních předpisů

### EASA Learning Objectives
- Oficiální EASA syllabus Part-FCL
- Kompletní seznam Learning Objectives
- Všechny PPL(A) předměty a témata

### Aerokluby
- Zkušenosti pilotů z aeroklubů
- Praktické tipy a triky
- Regionální specifika a postupy

### Doporučená literatura
- PPL(A) učebnice dle EASA
- Letecké předpisy a regulace
- Meteorologické a navigační příručky

## Architektura

- **Frontend:** React 19 + Vite + TailwindCSS
- **AI:** Gemini SDK + Anthropic SDK + DeepSeek SDK
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

### DeepSeek
- DeepSeek V3 (nejnovější, nejlepší poměr cena/výkon) 🆕
- DeepSeek Coder V2 (specializovaný na kód)
- DeepSeek Chat (rychlý a efektivní)

## AI API Klíče

Pro plnou funkčnost potřebujete API klíče:

### Google Gemini (zdarma)
[ai.google.dev](https://ai.google.dev)

### Anthropic Claude (placený)
[console.anthropic.com](https://console.anthropic.com)

### DeepSeek (placený, nejlepší poměr cena/výkon)
[platform.deepseek.com](https://platform.deepseek.com)



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
