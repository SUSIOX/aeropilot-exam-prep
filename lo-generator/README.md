# LO Generator — PPL(A) + SPL

Generuje kompletní databázi EASA Learning Objectives pro PPL(A) a SPL pomocí DeepSeek AI.

## Jak spustit

```bash
# Z root adresáře projektu:
npx tsx lo-generator/generate-los.ts
```

## Co script dělá

1. **Fáze 1 — Generování** — Volá DeepSeek (OpenRouter) pro každý ze 9 EASA subjects a ukládá výsledky do `lo-generator/output/subject-XXX.json`. Pokud soubor už existuje, přeskočí (cache).

2. **Fáze 2 — Porovnání** — Nascanuje tabulku `aeropilot-easa-objectives` a zjistí, které LOs chybí.

3. **Fáze 3 — Import** — Vloží pouze chybějící LOs do DynamoDB.

## Výstupní soubory

```
lo-generator/output/
  subject-010.json   ← Air Law
  subject-020.json   ← Aircraft General Knowledge
  ...
  subject-090.json   ← Communications
  all-los.json       ← Merged všechny subjects
```

## Požadavky

- `DEEPSEEK_API_KEY` v `.env` (OpenRouter klíč)
- AWS credentials s přístupem k DynamoDB `aeropilot-easa-objectives`

## Opakované spuštění

Script je idempotentní:
- JSON soubory se nepřegenerují (cache)
- Do DB se vloží jen LOs které tam ještě nejsou
- Pro nové generování smaž `lo-generator/output/` nebo konkrétní subject soubor
