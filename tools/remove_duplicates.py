#!/usr/bin/env python3
"""
Odstranění duplicitních otázek z JSON souboru.

Porovnává otázky na základě:
- Podobnost otázky (text)
- Podobnost odpovědí

Použití:
    python tools/remove_duplicates.py <input_json> [--threshold <0-1>] [--output <output.json>]
"""

import argparse
import json
import os
import sys
from difflib import SequenceMatcher
from typing import List, Dict, Tuple


def normalize_text(text: str) -> str:
    """Normalizuje text pro porovnání."""
    if not text:
        return ""
    return text.lower().strip()


def text_similarity(a: str, b: str) -> float:
    """Vypočítá podobnost dvou textů (0-1)."""
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, normalize_text(a), normalize_text(b)).ratio()


def answers_similarity(answers_a: List[str], answers_b: List[str]) -> float:
    """Vypočítá podobnost dvou seznamů odpovědí."""
    if not answers_a or not answers_b:
        return 0.0
    if len(answers_a) != len(answers_b):
        # Různý počet odpovědí - nižší podobnost
        min_len = min(len(answers_a), len(answers_b))
        total = sum(text_similarity(answers_a[i], answers_b[i]) for i in range(min_len))
        return (total / max(len(answers_a), len(answers_b))) * 0.7
    
    total = sum(text_similarity(a, b) for a, b in zip(answers_a, answers_b))
    return total / len(answers_a)


def find_duplicates(questions: List[Dict], threshold: float = 0.85) -> List[Tuple[int, int, float]]:
    """
    Najde duplicitní otázky.
    Vrací seznam tuple (index1, index2, podobnost).
    """
    duplicates = []
    n = len(questions)
    
    for i in range(n):
        for j in range(i + 1, n):
            q1 = questions[i]
            q2 = questions[j]
            
            # Podobnost otázky (60% váha)
            q_sim = text_similarity(q1.get('question', ''), q2.get('question', ''))
            # Podobnost odpovědí (40% váha)
            a_sim = answers_similarity(q1.get('answers', []), q2.get('answers', []))
            
            total_sim = q_sim * 0.6 + a_sim * 0.4
            
            if total_sim >= threshold:
                duplicates.append((i, j, round(total_sim, 3)))
    
    return duplicates


def remove_duplicates(questions: List[Dict], duplicates: List[Tuple[int, int, float]]) -> Tuple[List[Dict], int]:
    """
    Odstraní duplicitní otázky.
    Zachová první výskyt, odstraní duplicity.
    """
    # Sestavíme množinu indexů k odstranění
    to_remove = set()
    
    for idx1, idx2, sim in duplicates:
        # Zachováme první (nižší index), odstraníme druhý
        to_remove.add(idx2)
    
    # Vytvoříme nový seznam bez duplicit
    unique_questions = []
    removed_count = 0
    
    for i, q in enumerate(questions):
        if i in to_remove:
            removed_count += 1
        else:
            # Aktualizujeme ID pro sekvenční číslování
            q['id'] = len(unique_questions) + 1
            unique_questions.append(q)
    
    return unique_questions, removed_count


def main():
    parser = argparse.ArgumentParser(
        description='Odstranění duplicitních otázek'
    )
    parser.add_argument('input_json', help='Vstupní JSON soubor')
    parser.add_argument('--threshold', '-t', type=float, default=0.85,
                        help='Prahová hodnota pro duplicitu (default: 0.85)')
    parser.add_argument('--output', '-o', help='Výstupní JSON soubor')
    parser.add_argument('--dry-run', '-d', action='store_true',
                        help='Jen zobrazit duplicity, neodstraňovat')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.input_json):
        print(f"Chyba: Soubor {args.input_json} nenalezen")
        sys.exit(1)
    
    # Načtení dat
    with open(args.input_json, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    questions = data.get('questions', [])
    original_count = len(questions)
    
    print(f"Načteno {original_count} otázek")
    print(f"Hledám duplicity (threshold={args.threshold})...")
    
    # Nalezení duplicit
    duplicates = find_duplicates(questions, args.threshold)
    
    if not duplicates:
        print("\n✅ Žádné duplicity nenalezeny!")
        return
    
    print(f"\nNalezeno {len(duplicates)} párů duplicit:")
    print("-" * 80)
    
    for idx1, idx2, sim in duplicates:
        q1 = questions[idx1]
        q2 = questions[idx2]
        
        print(f"\nDuplicita #{duplicates.index((idx1, idx2, sim)) + 1} [podobnost: {sim:.2f}]")
        print(f"  Zachovám: Q{q1['id']} - {q1['question'][:60]}...")
        print(f"  Smažu:    Q{q2['id']} - {q2['question'][:60]}...")
        
        # Zobrazit zdroj správné odpovědi
        src1 = q1.get('correct_source', 'unknown')
        src2 = q2.get('correct_source', 'unknown')
        if src1 != src2:
            print(f"  Zdroje: {src1} vs {src2}")
    
    if args.dry_run:
        print(f"\n[DRY RUN] Nebyly provedeny žádné změny")
        print(f"Pro odstranění spusťte bez --dry-run")
        return
    
    # Odstranění duplicit
    unique_questions, removed = remove_duplicates(questions, duplicates)
    
    print(f"\n{'='*60}")
    print(f"VÝSLEDKY")
    print(f"{'='*60}")
    print(f"Původní počet: {original_count}")
    print(f"Odstraněno:    {removed}")
    print(f"Zbývá:         {len(unique_questions)}")
    
    # Uložení
    output_path = args.output or args.input_json.replace('.json', '_unique.json')
    data['questions'] = unique_questions
    data['deduplication'] = {
        'original_count': original_count,
        'removed': removed,
        'final_count': len(unique_questions),
        'threshold': args.threshold,
        'duplicates_found': len(duplicates)
    }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"\n✓ Uloženo: {output_path}")


if __name__ == '__main__':
    main()
