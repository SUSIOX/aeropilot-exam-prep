#!/usr/bin/env python3
"""
Porovná OCR extrahované otázky s existující databází.

Použití:
    python tools/compare_questions.py <ocr_json> [--subject <num>] [--threshold <0-1>]

Příklad:
    python tools/compare_questions.py work/stavba_konstrukce_otazky.json --subject 8
"""

import argparse
import json
import os
import re
import sys
from difflib import SequenceMatcher
from typing import List, Dict, Tuple


def normalize_text(text: str) -> str:
    """Normalizuje text pro porovnání."""
    if not text:
        return ""
    # Malá písmena
    text = text.lower()
    # Odstranění speciálních znaků a nadbytečných mezer
    text = re.sub(r'[^\w\s]', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def text_similarity(a: str, b: str) -> float:
    """Vypočítá podobnost dvou textů (0-1)."""
    if not a or not b:
        return 0.0
    a_norm = normalize_text(a)
    b_norm = normalize_text(b)
    if not a_norm or not b_norm:
        return 0.0
    return SequenceMatcher(None, a_norm, b_norm).ratio()


def answers_similarity(answers_a: List[str], answers_b: List[str]) -> float:
    """Vypočítá podobnost dvou seznamů odpovědí."""
    if not answers_a or not answers_b:
        return 0.0
    if len(answers_a) != len(answers_b):
        return 0.0
    
    total_sim = 0.0
    for a, b in zip(sorted(answers_a, key=normalize_text), sorted(answers_b, key=normalize_text)):
        total_sim += text_similarity(a, b)
    return total_sim / len(answers_a)


def find_matching_question(ocr_q: Dict, existing_questions: List[Dict], threshold: float = 0.7) -> Tuple[Dict, float]:
    """Najde nejlepší shodu otázky v databázi."""
    best_match = None
    best_score = 0.0
    
    ocr_question_text = ocr_q.get('question', '')
    ocr_answers = ocr_q.get('answers', [])
    
    for existing in existing_questions:
        # Podobnost otázky
        q_sim = text_similarity(ocr_question_text, existing.get('question', ''))
        # Podobnost odpovědí
        a_sim = answers_similarity(ocr_answers, existing.get('answers', []))
        # Celková podobnost - otázka má větší váhu
        total_sim = q_sim * 0.6 + a_sim * 0.4
        
        if total_sim > best_score:
            best_score = total_sim
            best_match = existing
    
    if best_score >= threshold:
        return best_match, best_score
    return None, best_score


def load_database(subject_num: int = 8) -> List[Dict]:
    """Načte existující otázky z databáze."""
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    db_path = os.path.join(base, f"backups/subject_{subject_num}.json")
    
    if not os.path.exists(db_path):
        print(f"Chyba: Databáze {db_path} nenalezena")
        sys.exit(1)
    
    with open(db_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_club_questions(category_filter: str = None) -> List[Dict]:
    """Načte klubové otázky. Vrátí seznam s normalizovanou strukturou."""
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    club_path = os.path.join(base, "public/otazkykluby.json")
    
    if not os.path.exists(club_path):
        print(f"Upozornění: Klubové otázky {club_path} nenalezeny")
        return []
    
    with open(club_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Normalizace struktury
    questions = []
    for q in data:
        cat = q.get('category', 'Neznámá')
        if category_filter and category_filter not in cat:
            continue
        
        # Převod options na answers
        options = q.get('options', [])
        answers = [opt.get('text', '') for opt in options]
        
        # Nalezení správné odpovědi
        correct = 0
        for i, opt in enumerate(options):
            if opt.get('correct', False):
                correct = i
                break
        
        questions.append({
            'id': f"club_{len(questions)}",
            'category': cat,
            'question': q.get('question', ''),
            'answers': answers,
            'correct': correct,
            'correct_labels': q.get('correct_labels', [])
        })
    
    return questions


def main():
    parser = argparse.ArgumentParser(
        description='Porovnání OCR otázek s existující databází a klubovými otázkami'
    )
    parser.add_argument('ocr_json', help='Cesta k JSON souboru s OCR otázkami')
    parser.add_argument('--subject', '-s', type=int, default=8,
                        help='Číslo předmětu v CAA databázi (default: 8 = AGK)')
    parser.add_argument('--club', '-c', action='store_true',
                        help='Porovnat i s klubovými otázkami (SPL)')
    parser.add_argument('--club-category', type=str,
                        help='Filtrovat klubové otázky podle kategorie (např. "Všeobecné znalosti")')
    parser.add_argument('--threshold', '-t', type=float, default=0.7,
                        help='Prahová hodnota podobnosti 0-1 (default: 0.7)')
    parser.add_argument('--output', '-o', help='Výstupní JSON s výsledky')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.ocr_json):
        print(f"Chyba: Soubor {args.ocr_json} nenalezen")
        sys.exit(1)
    
    # Načtení OCR otázek
    with open(args.ocr_json, 'r', encoding='utf-8') as f:
        ocr_data = json.load(f)
    
    ocr_questions = ocr_data.get('questions', [])
    print(f"Načteno {len(ocr_questions)} otázek z OCR")
    
    # Načtení databází
    all_db_questions = []
    
    print(f"Načítám CAA databázi předmětu {args.subject}...")
    caa_questions = load_database(args.subject)
    print(f"  CAA: {len(caa_questions)} otázek")
    all_db_questions.extend(caa_questions)
    
    if args.club:
        print("Načítám klubové otázky...")
        club_questions = load_club_questions(args.club_category)
        print(f"  Klubové: {len(club_questions)} otázek")
        all_db_questions.extend(club_questions)
    
    db_questions = all_db_questions
    
    # Porovnání
    matches = []
    new_questions = []
    duplicates = []
    
    for i, ocr_q in enumerate(ocr_questions):
        match, score = find_matching_question(ocr_q, db_questions, args.threshold)
        
        if match:
            # Určení zdroje shody
            source = 'CLUB' if isinstance(match.get('id'), str) and 'club_' in str(match.get('id')) else f'CAA-{args.subject}'
            matches.append({
                'ocr_id': ocr_q.get('id'),
                'ocr_page': ocr_q.get('page'),
                'db_id': match.get('id'),
                'source': source,
                'category': match.get('category', ''),
                'similarity': round(score, 3),
                'ocr_question': ocr_q.get('question', '')[:80],
                'db_question': match.get('question', '')[:80],
                'status': 'match'
            })
        else:
            # Kontrola duplicit v již zpracovaných OCR otázkách
            is_duplicate = False
            for prev_q in ocr_questions[:i]:
                q_sim = text_similarity(ocr_q.get('question', ''), prev_q.get('question', ''))
                if q_sim > 0.9:
                    duplicates.append({
                        'ocr_id': ocr_q.get('id'),
                        'ocr_page': ocr_q.get('page'),
                        'similarity': round(q_sim, 3),
                        'question': ocr_q.get('question', '')[:80]
                    })
                    is_duplicate = True
                    break
            
            if not is_duplicate:
                new_questions.append({
                    'ocr_id': ocr_q.get('id'),
                    'ocr_page': ocr_q.get('page'),
                    'question': ocr_q.get('question', ''),
                    'answers': ocr_q.get('answers', []),
                    'best_similarity': round(score, 3)
                })
    
    # Výpis výsledků
    print(f"\n{'='*60}")
    print(f"VÝSLEDKY POROVNÁNÍ")
    print(f"{'='*60}")
    print(f"Zdroj pro porovnání:")
    print(f"  CAA předmět {args.subject}: {len(caa_questions)} otázek")
    if args.club:
        print(f"  Klubové otázky: {len(club_questions)} otázek")
    print(f"Celkem nalezeno shod:     {len(matches)}")
    print(f"Nové otázky:              {len(new_questions)}")
    print(f"Duplicity v OCR:          {len(duplicates)}")
    print(f"Celkem zkontrolováno:     {len(ocr_questions)}")
    
    if matches:
        print(f"\n--- SHODY S DATABÁZÍ ({len(matches)}) ---")
        for m in sorted(matches, key=lambda x: x['similarity'], reverse=True)[:10]:
            source_tag = f"[{m['source']}]"
            cat_info = f" ({m['category']})" if m.get('category') else ""
            db_id_str = str(m['db_id'])
            print(f"  OCR Q{m['ocr_id']:3d} (str.{m['ocr_page']:2d}) -> {source_tag} Q{db_id_str}{cat_info} "
                  f"[podobnost: {m['similarity']:.2f}]")
            print(f"    OCR: {m['ocr_question'][:60]}...")
            print(f"    DB:  {m['db_question'][:60]}...")
        if len(matches) > 10:
            print(f"    ... a {len(matches) - 10} dalších")
    
    if new_questions:
        print(f"\n--- NOVÉ OTÁZKY ({len(new_questions)}) ---")
        for n in new_questions[:15]:
            print(f"  Q{n['ocr_id']:3d} (str.{n['ocr_page']:2d}) [nejlepší shoda: {n['best_similarity']:.2f}]")
            print(f"    {n['question'][:70]}...")
        if len(new_questions) > 15:
            print(f"    ... a {len(new_questions) - 15} dalších nových otázek")
    
    if duplicates:
        print(f"\n--- DUPLICITY V OCR ({len(duplicates)}) ---")
        for d in duplicates[:5]:
            print(f"  Q{d['ocr_id']:3d} (str.{d['ocr_page']:2d}) [podobnost: {d['similarity']:.2f}]")
            print(f"    {d['question'][:60]}...")
    
    # Uložení výsledků
    if args.output:
        result = {
            'summary': {
                'total_ocr': len(ocr_questions),
                'total_db': len(db_questions),
                'matches': len(matches),
                'new': len(new_questions),
                'duplicates': len(duplicates)
            },
            'matches': matches,
            'new_questions': new_questions,
            'duplicates': duplicates
        }
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"\nVýsledky uloženy: {args.output}")


if __name__ == '__main__':
    main()
