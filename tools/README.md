# Nástroje pro správu otázkové databáze

## verify-pdf-answers.py

Ověřuje, zda hodnota `correct` v `subject_X.json` odpovídá zaškrtnutému checkboxu ☑ v originálních CAA PDF souborech.

### Jak to funguje

1. Renderuje každou stránku PDF ve vysokém rozlišení (6× scale)
2. Pomocí `pdfplumber` najde pozice checkboxů (font `SegoeMDL2Assets`)
3. Měří počet tmavých pixelů v oblasti každého checkboxu
4. Zaškrtnutý checkbox ☑ má ~24 % víc tmavých pixelů než prázdný ☐
5. Porovná detekovaný index s hodnotou `correct` v JSON

### Prerekvizity

```bash
pip install pypdfium2 pdfplumber Pillow
```

### Použití

```bash
# Kontrola všech předmětů (jen výpis)
python tools/verify-pdf-answers.py

# Kontrola jednoho předmětu
python tools/verify-pdf-answers.py --subject 5

# Automatická oprava JSON souborů (vytvoří .bak zálohy)
python tools/verify-pdf-answers.py --fix

# Oprava jednoho předmětu
python tools/verify-pdf-answers.py --subject 5 --fix
```

### Kdy použít

- Po přidání nových otázek z PDF
- Po jakémkoli importu/re-importu dat
- Jako sanity check před deployem

### Omezení

- Detekce je založena na pixel analýze — u otázek, kde je rozdíl tmavých pixelů mezi odpověďmi < 5 %, je výsledek přeskočen jako nejednoznačný
- PDF musí obsahovat checkboxy ve fontu SegoeMDL2Assets (formát ÚCL/CAA)
- Po opravě JSON je třeba zvlášť aktualizovat DynamoDB (skript opravuje jen lokální JSON)

### Pozadí

Originální importní skripty nedokázaly na datové úrovni PDF rozlišit zaškrtnutý a nezaškrtnutý checkbox — oba se mapují na Unicode U+0020 (mezera) v subsetovaném fontu SegoeMDL2Assets. Vizuální rozdíl (fajfka) vzniká až při renderování díky odlišným Image XObject referencím per stránka. Import proto defaultoval většinu odpovědí na `correct: 0`.

V dubnu 2026 bylo tímto nástrojem nalezeno a opraveno **153 chybných odpovědí** napříč všemi 9 předměty. Log oprav: `answer_fix_log_20260409_022404.json`.

---

## fix-dynamo-answers.sh

Aplikuje opravy správných odpovědí z fix logu do DynamoDB tabulky `aeropilot-questions`.

### Prerekvizity

- AWS CLI nakonfigurované s přístupem k DynamoDB (`aws configure`)

### Použití

```bash
# Dry-run — jen výpis plánovaných změn
./tools/fix-dynamo-answers.sh

# Provést update v DynamoDB
./tools/fix-dynamo-answers.sh --execute

# Ověřit aktuální stav v DB
./tools/fix-dynamo-answers.sh --verify
```

### Co updatuje

Pro každý záznam v `answer_fix_log_*.json`:
- `correct` — index správné odpovědi (0–3)
- `correctOption` — písmeno správné odpovědi (A–D)
- `updatedAt` — timestamp updatu

Skript je idempotentní — opakované spuštění nic nepokazí.
