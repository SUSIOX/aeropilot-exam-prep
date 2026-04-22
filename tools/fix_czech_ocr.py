#!/usr/bin/env python3
"""
Oprava českého textu z OCR - běžné chyby rozpoznávání.

Použití:
    python tools/fix_czech_ocr.py <input_json> [--output <output.json>]
"""

import argparse
import json
import os
import re
import sys
from typing import Dict, List


# Mapa běžných OCR chyb v češtině
OCR_FIXES = {
    # Záměny písmen
    'tetadla': 'letadla',
    'tetadlo': 'letadlo',
    'Tetadla': 'Letadla',
    'Tetadlo': 'Letadlo',
    '—': '-',
    '–': '-',
    '©': '',  # artefakt
    '®': '',
    '°': '',
    '™': '',
    '|': '',  # artefakt z OCR
    '  ': ' ',  # dvojité mezery
    
    # Časté chyby v letecké terminologii
    'konicke': 'konické',
    'konie': 'konice',
    'vhikem': 'vhledem',
    'prodlouzenf': 'prodloužení',
    'zkraceni': 'zkrácení',
    'zatizení': 'zatížení',
    'zatíženi': 'zatížení',
    'pevnoti': 'pevnosti',
    'hodnoty"': 'hodnoty',
    'konstrukcf': 'konstrukce',
    'hmotnostf': 'hmotnosti',
    'délce"': 'délce',
    'části"': 'části',
    'jednotek,': 'jednotek',
    
    # Chyby z učebnice stavby letadel
    'ner': 'nebo',
    'iochča': 'ploška',
    'konmišá': 'kormidla',
    'Vychyluje': 'Vychyluje',
    'zácěrový': 'závěsový',
    'sousta': 'soustava',
    'zaňení': 'zařízení',
    'zařizení': 'zařízení',
    'trupech': 'trupu',
    'nosnou': 'nosnou',
    'plóchou': 'plochou',
    'plócha': 'plocha',
    'čného': 'čelního',
    'ří': 'řízení',
    'ří dicí': 'řídící',
    'ří dicí': 'řídící',
    'é dolu': 'dolů',
    'é řížký': 'těžký',
    'NS 008 LE': '',  # artefakt OCR
    'řízení."': 'řízení.',
    'systém."': 'systém.',
    'řezů"': 'řezů',
    'výkonnosti"': 'výkonnosti',
    'nejvyšší"': 'nejvyšší',
    'pevnost"': 'pevnost',
    'síly"': 'síly',
    'křidélko"': 'křidélko',
    'trup"': 'trup',
    'Při"': 'Při',
    'nárazů"': 'nárazů',
    'kineticke': 'kinetické',
    'kinetické"': 'kinetické',
    'pojíždení': 'pojíždění',
    'KOMEDA': 'kompozitní',
    'KONEDA': 'kompozitní',
    'S KOMEDA': 'kompozitní',
    'voštiová': 'voštinová',
    'voštiové': 'voštinové',
    'různě"': 'různě',
    'stavební"': 'stavební',
    'rovině"': 'rovině',
    'zvýšení"': 'zvýšení',
    'zlepšení"': 'zlepšení',
    'zhoršení"': 'zhoršení',
    'podélné"': 'podélné',
    'příčné"': 'příčné',
    'rychlosti"': 'rychlosti',
    'letu"': 'letu',
    'vyšší"': 'vyšší',
    'nižší"': 'nižší',
    'dobré"': 'dobré',
    'špatné"': 'špatné',
    'vhodné"': 'vhodné',
    'nevhodné"': 'nevhodné',
    'možné"': 'možné',
    'nemožné"': 'nemožné',
    'nutné"': 'nutné',
    'zbytné': 'zbytné',
    'důležité"': 'důležité',
    'nedůležité"': 'nedůležité',
    'potřebné"': 'potřebné',
    'nepotřebné"': 'nepotřebné',
    'užitečné"': 'užitečné',
    'neužitečné"': 'neužitečné',
    'vhodné"': 'vhodné',
    'nevhodné"': 'nevhodné',
    'správné"': 'správné',
    'nesprávné"': 'nesprávné',
    'přesné"': 'přesné',
    'nepřesné"': 'nepřesné',
    'přesného': 'přesného',
    'nepřesného': 'nepřesného',
    'přesná': 'přesná',
    'nepřesná': 'nepřesná',
    'přesné': 'přesné',
    'nepřesné': 'nepřesné',
    'přesný': 'přesný',
    'nepřesný': 'nepřesný',
}

# Regex vzorce pro složitější náhrady
REGEX_FIXES = [
    (r'\s+', ' '),  # více mezer
    (r'\s*\n\s*', ' '),  # nové řádky uvnitř textu
    (r'"\s+', '"'),  # mezera po uvozovce
    (r'\s+"', '"'),  # mezera před uvozovkou
    (r'\.{3,}', '...'),  # více teček
    (r'\s*,\s*', ', '),  # mezery kolem čárky
    (r'\s*\.\s*([a-z])', r'. \1'),  # mezera po tečce
]

# Oprava uvozovek
QUOTE_FIXES = {
    '"': '"',  # typografická uvozovka nahradit prostou
    '"': '"',  # typografická uvozovka nahradit prostou
    '"': '"',
    '"': '"',
    ''': "'",
    ''': "'",
    ''': "'",
    ''': "'",
}


def fix_text(text: str) -> str:
    """Opraví český text z OCR."""
    if not text:
        return text
    
    # Aplikace jednoduchých náhrad
    for bad, good in OCR_FIXES.items():
        text = text.replace(bad, good)
    
    # Oprava uvozovek
    for bad, good in QUOTE_FIXES.items():
        text = text.replace(bad, good)
    
    # Aplikace regex náhrad
    for pattern, replacement in REGEX_FIXES:
        text = re.sub(pattern, replacement, text)
    
    # Oprava mezer u interpunkce
    text = re.sub(r'\s+([.,;:!?])', r'\1', text)  # mezera před interpunkcí
    text = re.sub(r'([.,;:!?])([^\s])', r'\1 \2', text)  # mezera po interpunkci
    
    # Odstranění nadbytečných mezer
    text = ' '.join(text.split())
    
    return text.strip()


def fix_question(question: Dict) -> Dict:
    """Opraví češtinu v jedné otázce."""
    # Kopie pro modifikaci
    fixed = question.copy()
    
    # Oprava textu otázky
    if 'question' in fixed:
        fixed['question'] = fix_text(fixed['question'])
    
    # Oprava odpovědí
    if 'answers' in fixed and isinstance(fixed['answers'], list):
        fixed['answers'] = [fix_text(ans) for ans in fixed['answers']]
    
    # Oprava explanation pokud existuje
    if 'explanation' in fixed:
        fixed['explanation'] = fix_text(fixed['explanation'])
    
    return fixed


def main():
    parser = argparse.ArgumentParser(
        description='Oprava českého textu z OCR'
    )
    parser.add_argument('input_json', help='Vstupní JSON soubor')
    parser.add_argument('--output', '-o', help='Výstupní JSON soubor')
    parser.add_argument('--preview', '-p', action='store_true',
                        help='Ukázat náhled oprav bez uložení')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.input_json):
        print(f"Chyba: Soubor {args.input_json} nenalezen")
        sys.exit(1)
    
    # Načtení dat
    with open(args.input_json, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    questions = data.get('questions', [])
    print(f"Načteno {len(questions)} otázek")
    
    # Oprava češtiny
    fixed_questions = []
    changes_count = 0
    
    for q in questions:
        original_q = q.get('question', '')
        original_answers = q.get('answers', [])
        
        fixed_q = fix_question(q)
        
        # Počítání změn
        if fixed_q['question'] != original_q:
            changes_count += 1
        for i, (orig, fixed) in enumerate(zip(original_answers, fixed_q.get('answers', []))):
            if orig != fixed:
                changes_count += 1
        
        fixed_questions.append(fixed_q)
    
    print(f"Provedeno {changes_count} oprav")
    
    # Náhled změn
    if args.preview or changes_count > 0:
        print(f"\n--- UKÁZKA OPRAV ---")
        shown = 0
        for orig, fixed in zip(questions, fixed_questions):
            if shown >= 5:
                break
            
            orig_q = orig.get('question', '')
            fixed_q_text = fixed['question']
            
            if orig_q != fixed_q_text:
                print(f"\nOtázka {orig.get('id')}:")
                print(f"  PŘED: {orig_q[:70]}...")
                print(f"  PO:   {fixed_q_text[:70]}...")
                shown += 1
            
            # Kontrola odpovědí
            for i, (orig_a, fixed_a) in enumerate(zip(orig.get('answers', []), fixed.get('answers', []))):
                if orig_a != fixed_a and shown < 5:
                    print(f"\nOdpověď {chr(97+i)} v otázce {orig.get('id')}:")
                    print(f"  PŘED: {orig_a[:50]}...")
                    print(f"  PO:   {fixed_a[:50]}...")
                    shown += 1
    
    if args.preview:
        print(f"\n[PREVIEW] Nebyly provedeny žádné změny")
        return
    
    # Uložení
    data['questions'] = fixed_questions
    data['czech_fixes'] = {
        'original_questions': len(questions),
        'fixes_applied': changes_count,
        'rules_count': len(OCR_FIXES)
    }
    
    output_path = args.output or args.input_json.replace('.json', '_fixed.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"\n✓ Uloženo: {output_path}")


if __name__ == '__main__':
    main()
