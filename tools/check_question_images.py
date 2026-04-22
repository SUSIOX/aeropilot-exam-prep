#!/usr/bin/env python3
"""
Kontrola otazek v DynamoDB oproti lokálním obrázkům.
Zjistí:
- Case-sensitivity problémy (PFP-053E.jpg vs PFP-053e.jpg)
- Chybějící obrázky v databázi (otázka má 'Viz obr.' ale image pole je prázdné)
- Chybějící soubory na disku (v db je image ale soubor neexistuje)
- Obrázky na disku bez reference v db

Použití:
  python3 tools/check_question_images.py [--fix] [--db-check]

--fix    - Vytvoří SQL skript pro opravu case-sensitivity problémů
--db-check - Načte data z DynamoDB místo lokálního backupu
"""

import json
import os
import sys
import re
from pathlib import Path
from typing import Dict, List, Tuple, Set

# Cesty
PROJECT_DIR = Path(__file__).parent.parent
IMAGES_DIR = PROJECT_DIR / "public" / "assets" / "images" / "questions"
BACKUP_FILE = PROJECT_DIR / "backups" / "aeropilot-questions.json"


def load_images_from_disk() -> Set[str]:
    """Načte seznam všech obrázků z disku (case-sensitive)."""
    if not IMAGES_DIR.exists():
        print(f"❌ Adresář s obrázky neexistuje: {IMAGES_DIR}")
        return set()
    
    images = set()
    for f in IMAGES_DIR.iterdir():
        if f.is_file() and f.suffix.lower() in ('.jpg', '.jpeg', '.png', '.gif', '.webp'):
            images.add(f.name)
    return images


def normalize_filename(filename: str) -> str:
    """Normalizuje jméno souboru pro porovnání (malá písmena)."""
    return filename.lower() if filename else ""


def find_case_mismatch(db_filename: str, disk_images: Set[str]) -> Tuple[bool, str]:
    """
    Zjistí, jestli existuje soubor s jinou velikostí písmen.
    Vrací: (mismatch_found, correct_filename)
    """
    if not db_filename:
        return False, ""
    
    # Pokud přesná shoda, není problém
    if db_filename in disk_images:
        return False, db_filename
    
    # Hledáme case-insensitive shodu
    db_normalized = normalize_filename(db_filename)
    for disk_img in disk_images:
        if normalize_filename(disk_img) == db_normalized:
            return True, disk_img
    
    return False, ""


def load_questions_from_backup() -> List[Dict]:
    """Načte otázky z lokálního backupu."""
    if not BACKUP_FILE.exists():
        print(f"❌ Backup file neexistuje: {BACKUP_FILE}")
        return []
    
    try:
        with open(BACKUP_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # DynamoDB export format - Items array
            if isinstance(data, dict) and 'Items' in data:
                return data['Items']
            # Simple array format
            if isinstance(data, list):
                return data
            return []
    except Exception as e:
        print(f"❌ Chyba při načítání backupu: {e}")
        return []


def extract_dynamo_value(item, key: str, default=None):
    """Extrahuje hodnotu z DynamoDB formátu."""
    if isinstance(item, dict):
        if key in item:
            val = item[key]
            if isinstance(val, dict):
                return val.get('S', val.get('N', val.get('BOOL', default)))
            return val
    return default


def check_questions(questions: List[Dict], disk_images: Set[str]) -> Dict:
    """Zkontroluje všechny otázky a vrátí statistiky problémů."""
    
    case_issues: List[Dict] = []
    missing_in_db: List[Dict] = []  # Otázka má "Viz obr." ale image je prázdné
    missing_on_disk: List[Dict] = []  # Image v db ale soubor neexistuje
    ok_count = 0
    
    # Pro shromažďování všech nalezených image referencí v DB
    db_images: Set[str] = set()
    
    for q in questions:
        qid = extract_dynamo_value(q, 'questionId', 'unknown')
        question_text = extract_dynamo_value(q, 'question', '')
        image = extract_dynamo_value(q, 'image')
        
        # Obsahuje otázka odkaz na obrázek v textu?
        has_image_reference = bool(re.search(r'Viz obr\.?|obrázek|obr\.|PFP-|AGK-|MET-|NAV-|ALW-|OPR-|PFA-', question_text, re.IGNORECASE))
        
        if image:
            db_images.add(image)
            
            # Kontrola case-sensitivity
            mismatch, correct = find_case_mismatch(image, disk_images)
            if mismatch:
                case_issues.append({
                    'questionId': qid,
                    'db_image': image,
                    'correct_image': correct,
                    'question': question_text[:80] + '...' if len(question_text) > 80 else question_text
                })
            elif image not in disk_images:
                # Soubor vůbec neexistuje (ani case-insensitive)
                missing_on_disk.append({
                    'questionId': qid,
                    'image': image,
                    'question': question_text[:80] + '...' if len(question_text) > 80 else question_text
                })
            else:
                ok_count += 1
        elif has_image_reference:
            # Otázka má odkaz na obrázek v textu, ale image pole je prázdné
            missing_in_db.append({
                'questionId': qid,
                'question': question_text,
                'detected_refs': re.findall(r'(PFP-\d+|AGK-\d+|MET-\d+|NAV-\d+|ALW-\d+|OPR-\d+|PFA-\d+)[a-z]?', question_text, re.IGNORECASE)
            })
    
    # Najděme obrázky na disku, které nejsou v DB
    unreferenced_images = disk_images - db_images
    
    return {
        'case_issues': case_issues,
        'missing_in_db': missing_in_db,
        'missing_on_disk': missing_on_disk,
        'unreferenced_images': unreferenced_images,
        'ok_count': ok_count,
        'total_with_images': len([q for q in questions if extract_dynamo_value(q, 'image')]),
        'total_questions': len(questions)
    }


def generate_fix_script(case_issues: List[Dict]) -> str:
    """Vygeneruje AWS CLI příkazy pro opravu case-sensitivity problémů."""
    if not case_issues:
        return "# Žádné case-sensitivity problémy nenalezeny\n"
    
    lines = ["#!/bin/bash", "# Oprava case-sensitivity problémů v DynamoDB", "", f"TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)", "TABLE_NAME=\"aeropilot-questions\"", "REGION=\"eu-central-1\"", ""]
    
    for issue in case_issues:
        qid = issue['questionId']
        correct = issue['correct_image']
        
        cmd = f"""aws dynamodb update-item \\
  --table-name "$TABLE_NAME" \\
  --region "$REGION" \\
  --key '{{"questionId":{{"S":"{qid}"}}}}' \\
  --update-expression 'SET #img = :image, updatedAt = :ts' \\
  --expression-attribute-names '{{"#img":"image"}}' \\
  --expression-attribute-values '{{":image":{{"S":"{correct}"}}, ":ts":{{"S":"$TIMESTAMP"}}}}' \\
  --return-values UPDATED_NEW"""
        
        lines.append(f"echo 'Fixing {qid}: {issue['db_image']} -> {correct}'")
        lines.append(cmd)
        lines.append("")
    
    return "\n".join(lines)


def main():
    fix_mode = '--fix' in sys.argv
    
    print("=" * 70)
    print("KONTROLA OBRÁZKŮ V DYNAMODB")
    print("=" * 70)
    print(f"Adresář s obrázky: {IMAGES_DIR}")
    print(f"Backup: {BACKUP_FILE}")
    print()
    
    # Načtení dat
    disk_images = load_images_from_disk()
    print(f"📁 Nalezeno {len(disk_images)} obrázků na disku")
    
    questions = load_questions_from_backup()
    print(f"📊 Načteno {len(questions)} otázek z backupu")
    print()
    
    if not disk_images or not questions:
        print("❌ Nelze pokračovat - chybí data")
        return 1
    
    # Kontrola
    results = check_questions(questions, disk_images)
    
    # Výsledky
    print("=" * 70)
    print("VÝSLEDKY")
    print("=" * 70)
    print(f"Celkem otázek: {results['total_questions']}")
    print(f"Otázek s obrázkem: {results['total_with_images']}")
    print(f"✅ OK: {results['ok_count']}")
    print()
    
    # Case-sensitivity problémy
    if results['case_issues']:
        print(f"⚠️  CASE-SENSITIVITY PROBLÉMY ({len(results['case_issues'])}):")
        print("-" * 70)
        for issue in results['case_issues']:
            print(f"  {issue['questionId']}:")
            print(f"    DB:  {issue['db_image']}")
            print(f"    DISK: {issue['correct_image']}")
            print(f"    Q: {issue['question'][:60]}...")
            print()
    else:
        print("✅ Žádné case-sensitivity problémy")
    
    # Chybějící v DB
    if results['missing_in_db']:
        print(f"\n⚠️  ODKAZ NA OBRÁZEK V TEXTU, ALE PRAZDNÉ IMAGE POLE ({len(results['missing_in_db'])}):")
        print("-" * 70)
        for item in results['missing_in_db'][:10]:  # Zobrazíme max 10
            print(f"  {item['questionId']}:")
            print(f"    Q: {item['question'][:80]}...")
            if item['detected_refs']:
                print(f"    Detekováno: {', '.join(item['detected_refs'])}")
            print()
        if len(results['missing_in_db']) > 10:
            print(f"    ... a {len(results['missing_in_db']) - 10} dalších")
    
    # Chybějící na disku
    if results['missing_on_disk']:
        print(f"\n❌ OBRÁZEK V DB ALE CHYBÍ NA DISKU ({len(results['missing_on_disk'])}):")
        print("-" * 70)
        for item in results['missing_on_disk'][:10]:
            print(f"  {item['questionId']}: {item['image']}")
        if len(results['missing_on_disk']) > 10:
            print(f"    ... a {len(results['missing_on_disk']) - 10} dalších")
    
    # Nepoužité obrázky
    if results['unreferenced_images']:
        print(f"\n📦 OBRÁZKY NA DISKU BEZ REFERENCE V DB ({len(results['unreferenced_images'])}):")
        print("-" * 70)
        for img in sorted(results['unreferenced_images']):
            print(f"  {img}")
    
    # Generování fix skriptu
    if fix_mode and results['case_issues']:
        script_path = PROJECT_DIR / "tools" / "fix_case_issues.sh"
        script_content = generate_fix_script(results['case_issues'])
        with open(script_path, 'w', encoding='utf-8') as f:
            f.write(script_content)
        os.chmod(script_path, 0o755)
        print(f"\n📝 Vygenerován fix skript: {script_path}")
        print("   Spusť: ./tools/fix_case_issues.sh")
    
    print("\n" + "=" * 70)
    return 0


if __name__ == '__main__':
    sys.exit(main())
