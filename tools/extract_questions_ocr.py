#!/usr/bin/env python3
"""
OCR extrakce kontrolních otázek ze skenovaného PDF.

Použití:
    python tools/extract_questions_ocr.py <pdf_path> [--output <output.json>]

Prerekvizity:
    pip install pdf2image pytesseract Pillow
    # Na macOS: brew install tesseract pdf2image poppler
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

try:
    from pdf2image import convert_from_path
    import pytesseract
    from PIL import Image
except ImportError:
    print("Chybí závislosti. Nainstalujte: pip install pdf2image pytesseract Pillow")
    print("Na macOS: brew install tesseract poppler")
    sys.exit(1)


def extract_questions_from_text(text: str):
    """Extrahuje otázky a odpovědi z OCR textu."""
    questions = []

    # Hledáme vzorce jako "1.", "1)", "1 -" na začátku otázky
    # a pak odpovědi označené a), b), c), d) nebo A), B), C), D)

    # Rozdělíme na bloky podle čísel otázek
    # Vzor: číslo tečka/uzávorka mezera text otázky
    question_pattern = r'(?:^|\n)\s*(\d+)[\.\)\s]\s*([^\n]+(?:\n(?![\s]*\d+[\.\)\s]|\n[abcdABCD][\.\)\s])[^\n]*)*)'

    # Alternativní vzor pro odpovědi
    answer_pattern = r'([abcdABCD])[\.\)\s]\s*([^\n]+)'

    lines = text.split('\n')
    current_q = None
    current_q_text = []
    current_answers = []

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Kontrola začátku nové otázky
        q_match = re.match(r'^(\d+)[\.\)\s]\s*(.*)', line)
        if q_match:
            # Uložíme předchozí otázku
            if current_q and current_answers:
                questions.append({
                    'id': current_q,
                    'question': ' '.join(current_q_text).strip(),
                    'answers': [a['text'] for a in current_answers],
                    'correct': None  # Nevíme z OCR
                })

            current_q = int(q_match.group(1))
            current_q_text = [q_match.group(2)] if q_match.group(2) else []
            current_answers = []
            continue

        # Kontrola odpovědi a), b), c), d)
        a_match = re.match(r'^([abcdABCD])[\.\)\s]\s*(.*)', line)
        if a_match and current_q:
            letter = a_match.group(1).upper()
            answer_text = a_match.group(2)
            current_answers.append({
                'letter': letter,
                'text': answer_text
            })
            continue

        # Přidáme řádek k aktuální otázce nebo odpovědi
        if current_q:
            if current_answers and not a_match:
                # Přidáme k poslední odpovědi
                if current_answers:
                    current_answers[-1]['text'] += ' ' + line
            else:
                current_q_text.append(line)

    # Uložíme poslední otázku
    if current_q and current_answers:
        questions.append({
            'id': current_q,
            'question': ' '.join(current_q_text).strip(),
            'answers': [a['text'] for a in current_answers],
            'correct': None
        })

    return questions


def process_pdf(pdf_path: str, output_path: str = None, dpi: int = 300):
    """Zpracuje PDF pomocí OCR a extrahuje otázky."""
    print(f"Zpracovávám PDF: {pdf_path}")
    print(f"Rozlišení OCR: {dpi} DPI")

    # Konverze PDF na obrázky
    print("Konverze PDF na obrázky...")
    try:
        images = convert_from_path(pdf_path, dpi=dpi)
    except Exception as e:
        print(f"Chyba při konverzi PDF: {e}")
        print("Zkontrolujte, zda máte nainstalovaný poppler (brew install poppler)")
        sys.exit(1)

    print(f"Počet stránek: {len(images)}")

    all_questions = []

    for i, image in enumerate(images, 1):
        print(f"OCR stránky {i}/{len(images)}...")

        # OCR s češtinou (ISO 639-2 kód: ces)
        text = pytesseract.image_to_string(image, lang='ces')

        print(f"  Extrahováno {len(text)} znaků")

        # Uložení textu pro debug
        if os.environ.get('OCR_DEBUG'):
            debug_file = f"/tmp/ocr_page_{i:03d}.txt"
            with open(debug_file, 'w', encoding='utf-8') as f:
                f.write(text)
            print(f"  Debug: {debug_file}")

        # Extrakce otázek
        questions = extract_questions_from_text(text)
        print(f"  Nalezeno {len(questions)} otázek")

        for q in questions:
            q['page'] = i
            all_questions.append(q)

    print(f"\nCelkem extrahováno: {len(all_questions)} otázek")

    # Uložení výsledku
    result = {
        'source': pdf_path,
        'total_pages': len(images),
        'total_questions': len(all_questions),
        'questions': all_questions
    }

    if output_path:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"Výsledek uložen: {output_path}")
    else:
        # Výchozí výstup
        default_output = pdf_path.replace('.pdf', '_questions.json')
        with open(default_output, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"Výsledek uložen: {default_output}")

    return result


def main():
    parser = argparse.ArgumentParser(
        description='OCR extrakce kontrolních otázek ze skenovaného PDF'
    )
    parser.add_argument('pdf_path', help='Cesta k PDF souboru')
    parser.add_argument('--output', '-o', help='Výstupní JSON soubor')
    parser.add_argument('--dpi', type=int, default=300,
                        help='Rozlišení OCR (default: 300)')
    parser.add_argument('--debug', action='store_true',
                        help='Uložit mezivýsledky OCR')

    args = parser.parse_args()

    if not os.path.exists(args.pdf_path):
        print(f"Chyba: Soubor {args.pdf_path} nenalezen")
        sys.exit(1)

    if args.debug:
        os.environ['OCR_DEBUG'] = '1'

    process_pdf(args.pdf_path, args.output, args.dpi)


if __name__ == '__main__':
    main()
