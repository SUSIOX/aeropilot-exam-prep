#!/usr/bin/env python3
"""
Detekce správných odpovědí v OCR otázkách.

Strategie:
1. Najít shodu v existujících databázích (CAA/klubové) - zkopírovat správnou odpověď
2. Pro zbývající: použít AI analýzu nebo označit pro manuální kontrolu

Použití:
    python tools/detect_correct_answers.py <ocr_json> [--output <output.json>]

Vyžaduje:
    - Existující databáze (backups/subject_8.json, public/otazkykluby.json)
    - Pro AI režim: nastavený OPENAI_API_KEY nebo ANTHROPIC_API_KEY
"""

import argparse
import json
import os
import sys
from difflib import SequenceMatcher
from typing import List, Dict, Optional, Tuple


def normalize_text(text: str) -> str:
    """Normalizuje text pro porovnání."""
    if not text:
        return ""
    return text.lower().strip()


def text_similarity(a: str, b: str) -> float:
    """Vypočítá podobnost dvou textů."""
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, normalize_text(a), normalize_text(b)).ratio()


def answers_similarity(answers_a: List[str], answers_b: List[str]) -> float:
    """Vypočítá podobnost dvou seznamů odpovědí."""
    if not answers_a or not answers_b or len(answers_a) != len(answers_b):
        return 0.0
    total = sum(text_similarity(a, b) for a, b in zip(answers_a, answers_b))
    return total / len(answers_a)


def load_databases() -> Tuple[List[Dict], List[Dict]]:
    """Načte CAA a klubové databáze."""
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    # CAA databáze předmět 8
    caa_path = os.path.join(base, "backups/subject_8.json")
    caa_db = []
    if os.path.exists(caa_path):
        with open(caa_path, 'r', encoding='utf-8') as f:
            caa_db = json.load(f)
    
    # Klubové otázky
    club_path = os.path.join(base, "public/otazkykluby.json")
    club_db = []
    if os.path.exists(club_path):
        with open(club_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        for q in data:
            options = q.get('options', [])
            answers = [opt.get('text', '') for opt in options]
            correct = 0
            for i, opt in enumerate(options):
                if opt.get('correct', False):
                    correct = i
                    break
            club_db.append({
                'id': q.get('id', ''),
                'question': q.get('question', ''),
                'answers': answers,
                'correct': correct,
                'category': q.get('category', '')
            })
    
    return caa_db, club_db


def find_match_with_correct(ocr_q: Dict, databases: List[List[Dict]], threshold: float = 0.75) -> Optional[Tuple[int, str]]:
    """
    Najde shodu v databázích a vrátí index správné odpovědi.
    Vrací (correct_index, source) nebo None.
    """
    ocr_question = ocr_q.get('question', '')
    ocr_answers = ocr_q.get('answers', [])
    
    sources = ['CAA-8', 'CLUB']
    
    for db_idx, db in enumerate(databases):
        for db_q in db:
            # Podobnost otázky (60% váha)
            q_sim = text_similarity(ocr_question, db_q.get('question', ''))
            # Podobnost odpovědí (40% váha)
            a_sim = answers_similarity(ocr_answers, db_q.get('answers', []))
            
            total_sim = q_sim * 0.6 + a_sim * 0.4
            
            if total_sim >= threshold:
                correct = db_q.get('correct', 0)
                # Zkontrolujeme, že správný index je platný
                if 0 <= correct < len(ocr_answers):
                    return (correct, sources[db_idx], round(total_sim, 2))
    
    return None


def detect_by_keywords(question: str, answers: List[str]) -> Optional[int]:
    """
    Heuristická detekce správné odpovědi pomocí klíčových slov.
    Vrací index nebo None.
    """
    q_lower = question.lower()
    
    # Indikátory, že otázka má jen jednu správnou odpověď
    single_choice_indicators = [
        'je', 'jsou', 'nazývá', 'nazývají', 'definován', 'charakterizován',
        'označuje', 'slouží k', 'patří', 'náleží'
    ]
    
    # Pokud otázka obsahuje "které/která z následujících" - pravděpodobně vícero správných
    if 'které z následujících' in q_lower or 'která z následujících' in q_lower:
        return None  # Vícenásobná volba - potřebuje AI nebo manuální kontrolu
    
    return None  # Nelze spolehlivě určit


def analyze_with_ai(questions: List[Dict], api_key: Optional[str] = None) -> List[Dict]:
    """
    Použije AI pro určení správných odpovědí.
    Vyžaduje API klíč.
    """
    if not api_key:
        return questions
    
    # Jednoduchá implementace pro OpenAI
    try:
        import openai
        openai.api_key = api_key
        
        for q in questions:
            if q.get('correct') is not None:
                continue  # Už máme správnou odpověď
            
            prompt = f"""Jsi letecký expert. Urči správnou odpověď na tuto otázku z učebnice "Stavba a konstrukce letadel".

Otázka: {q['question']}

Odpovědi:
"""
            for i, ans in enumerate(q['answers']):
                prompt += f"{chr(97+i)}) {ans}\n"
            
            prompt += """
Odpověz POUZE písmenem správné odpovědi (a, b, c, nebo d). Pokud si nejsi jistý, odpověz "?".
"""
            
            try:
                response = openai.ChatCompletion.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.1,
                    max_tokens=10
                )
                answer = response.choices[0].message.content.strip().lower()
                
                # Mapování odpovědi na index
                answer_map = {'a': 0, 'b': 1, 'c': 2, 'd': 3, 'e': 4}
                if answer in answer_map and answer_map[answer] < len(q['answers']):
                    q['correct'] = answer_map[answer]
                    q['correct_source'] = 'AI'
            except Exception as e:
                print(f"  AI chyba pro Q{q.get('id')}: {e}")
                continue
        
        return questions
    except ImportError:
        print("Knihovna openai není nainstalována. Přeskočeno AI zpracování.")
        return questions


def main():
    parser = argparse.ArgumentParser(
        description='Detekce správných odpovědí v OCR otázkách'
    )
    parser.add_argument('ocr_json', help='Cesta k JSON souboru s OCR otázkami')
    parser.add_argument('--output', '-o', help='Výstupní JSON s označenými odpověďmi')
    parser.add_argument('--threshold', '-t', type=float, default=0.75,
                        help='Prahová hodnota pro shodu s databází (default: 0.75)')
    parser.add_argument('--ai', '-a', action='store_true',
                        help='Použít AI pro zbývající otázky (vyžaduje API klíč)')
    parser.add_argument('--manual', '-m', type=str,
                        help='Interaktivní manuální režim pro zbývající otázky')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.ocr_json):
        print(f"Chyba: Soubor {args.ocr_json} nenalezen")
        sys.exit(1)
    
    # Načtení OCR otázek
    with open(args.ocr_json, 'r', encoding='utf-8') as f:
        ocr_data = json.load(f)
    
    questions = ocr_data.get('questions', [])
    print(f"Načteno {len(questions)} otázek z OCR")
    
    # Načtení databází
    print("Načítám databáze...")
    caa_db, club_db = load_databases()
    print(f"  CAA předmět 8: {len(caa_db)} otázek")
    print(f"  Klubové otázky: {len(club_db)} otázek")
    
    # Fáze 1: Shoda s databází
    print(f"\nHledám shody s databázemi (threshold={args.threshold})...")
    matched = 0
    for q in questions:
        result = find_match_with_correct(q, [caa_db, club_db], args.threshold)
        if result:
            correct_idx, source, sim = result
            q['correct'] = correct_idx
            q['correct_source'] = source
            q['match_similarity'] = sim
            matched += 1
    
    print(f"  Nalezeno shod: {matched}/{len(questions)} ({100*matched/len(questions):.1f}%)")
    
    # Fáze 2: Heuristická analýza
    remaining = [q for q in questions if q.get('correct') is None]
    if remaining:
        print(f"\nHeuristická analýza {len(remaining)} zbývajících otázek...")
        heuristic = 0
        for q in remaining:
            result = detect_by_keywords(q.get('question', ''), q.get('answers', []))
            if result is not None:
                q['correct'] = result
                q['correct_source'] = 'heuristic'
                heuristic += 1
        print(f"  Určeno heuristikou: {heuristic}")
    
    # Fáze 3: AI analýza (pokud požadováno)
    if args.ai:
        remaining = [q for q in questions if q.get('correct') is None]
        if remaining:
            print(f"\nAI analýza {len(remaining)} zbývajících otázek...")
            api_key = os.environ.get('OPENAI_API_KEY')
            if not api_key:
                print("  VAROVÁNÍ: OPENAI_API_KEY není nastaven. Přeskočeno.")
            else:
                remaining = analyze_with_ai(remaining, api_key)
                ai_count = sum(1 for q in remaining if q.get('correct_source') == 'AI')
                print(f"  Určeno AI: {ai_count}")
    
    # Statistika
    total_with_correct = sum(1 for q in questions if q.get('correct') is not None)
    total_without = len(questions) - total_with_correct
    
    print(f"\n{'='*60}")
    print(f"VÝSLEDKY DETEKCE SPRÁVNÝCH ODPOVĚDÍ")
    print(f"{'='*60}")
    print(f"Celkem otázek:        {len(questions)}")
    print(f"Se správnou odpovědí: {total_with_correct} ({100*total_with_correct/len(questions):.1f}%)")
    print(f"  - Z databáze:       {sum(1 for q in questions if q.get('correct_source') in ['CAA-8', 'CLUB'])}")
    print(f"  - Heuristika:       {sum(1 for q in questions if q.get('correct_source') == 'heuristic')}")
    print(f"  - AI:               {sum(1 for q in questions if q.get('correct_source') == 'AI')}")
    print(f"K manuální kontrole:  {total_without}")
    
    # Výpis otázek s detekovanými odpověďmi
    print(f"\n--- UKÁZKA DETEKOVANÝCH ODPOVĚDÍ ---")
    for q in questions[:5]:
        if q.get('correct') is not None:
            source = q.get('correct_source', 'unknown')
            correct_idx = q['correct']
            correct_letter = chr(97 + correct_idx)
            sim_info = f" [sim:{q.get('match_similarity', '-')}]" if 'match_similarity' in q else ""
            print(f"\nQ{q['id']} ({source}{sim_info}):")
            print(f"  {q['question'][:70]}...")
            print(f"  Správná: {correct_letter}) {q['answers'][correct_idx][:50]}...")
    
    # Seznam otázek bez správné odpovědi
    if total_without > 0:
        print(f"\n--- BEZ SPRÁVNÉ ODPOVĚDI ({total_without}) ---")
        for q in questions[:10]:
            if q.get('correct') is None:
                print(f"  Q{q['id']} (str.{q.get('page', '?')}): {q['question'][:60]}...")
        if total_without > 10:
            print(f"    ... a {total_without - 10} dalších")
    
    # Uložení výsledku
    output_path = args.output or args.ocr_json.replace('.json', '_with_answers.json')
    ocr_data['questions'] = questions
    ocr_data['detection_stats'] = {
        'total': len(questions),
        'with_correct': total_with_correct,
        'from_database': sum(1 for q in questions if q.get('correct_source') in ['CAA-8', 'CLUB']),
        'from_heuristic': sum(1 for q in questions if q.get('correct_source') == 'heuristic'),
        'from_ai': sum(1 for q in questions if q.get('correct_source') == 'AI'),
        'manual_needed': total_without
    }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(ocr_data, f, indent=2, ensure_ascii=False)
    
    print(f"\nVýsledek uložen: {output_path}")
    
    if total_without > 0:
        print(f"\n💡 Tip: Pro zbývající {total_without} otázek můžete:")
        print(f"   1. Prohlédnout originální PDF a manuálně doplnit")
        print(f"   2. Použít AI: python tools/detect_correct_answers.py {args.ocr_json} --ai")
        print(f"   3. Spustit interaktivní režim: python tools/detect_correct_answers.py {args.ocr_json} --manual")


if __name__ == '__main__':
    main()
