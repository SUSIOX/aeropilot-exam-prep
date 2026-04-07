# EASA Syllabus Audit Tool

## Bezpečnostní pojistky

Tento auditní nástroj obsahuje následující bezpečnostní mechanismy:

### 1. Výchozí Dry-Run režim
- Bez parametru `--apply` se **nic nezmění**
- Pouze generuje report o nalezených nesrovnalostech

### 2. Záloha před změnami
- Před jakoukoliv úpravou automaticky vytvoří zálohu
- Soubor: `backups/rollback_YYYYMMDD_HHMMSS.json`
- Obsahuje původní data všech ovlivněných záznamů

### 3. Potvrzení uživatelem
- `--apply` vyžaduje explicitní potvrzení (napiš "YES")
- `--force` přeskočí potvrzení (pouze pro automatizaci)

### 4. Rollback možnost
```bash
python audit_syllabus.py --rollback backups/rollback_20250331_220000.json
```

### 5. Batch limity
- Max 25 položek na batch (DynamoDB limit)
- Chyba v jedné položce nezastaví ostatní

### 6. Error handling
- Každý DB operace má try/except
- Chyby se logují, ale nezastavují proces
- Na konci report o úspěšných/failed operacích

## Instalace

```bash
cd audit/
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Uprav .env podle potřeby
```

## Použití

### 1. Report bez změn (bezpečné)
```bash
python audit_syllabus.py
```

### 2. Náhled změn
```bash
python audit_syllabus.py --dry-run
```

### 3. Aplikace změn s potvrzením
```bash
python audit_syllabus.py --apply
# Pak napiš: YES
```

### 4. Rollback při problému
```bash
python audit_syllabus.py --rollback backups/rollback_20250331_220000.json
```

## Mapování tagů

| PDF Sloupec | Tagy v databázi |
|-------------|-----------------|
| PPL(A) | `["PPL(A)", "LAPL(A)"]` |
| PPL(H) | `["PPL(H)", "LAPL(H)"]` |
| SPL | `["SPL", "LAPL(S)"]` |
| BPL | `["BPL", "LAPL(B)"]` |

## Detekované problémy

- **missing_in_db**: LO v PDF, ale chybí v databázi
- **missing_tags**: LO má méně tagů než by mělo
- **extra_tags**: LO má více tagů než by mělo
- **wrong_tags**: LO má jiné tagy než by mělo
- **legacy_ppl**: Používá starý `"PPL"` tag místo `"PPL(A)"`
- **orphaned_in_db**: LO v databázi, ale není v PDF
