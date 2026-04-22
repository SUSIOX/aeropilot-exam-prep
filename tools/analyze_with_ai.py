#!/usr/bin/env python3
"""
AI analýza správných odpovědí v OCR otázkách.

Podporuje:
- Google Gemini API (doporučeno - má volnou verzi)
- DeepSeek API
- Claude API
- Lokální heuristická analýza (bez API)

Použití:
    # S Gemini API (doporučeno - zdarma tier)
    export GEMINI_API_KEY="your_key"
    python tools/analyze_with_ai.py <ocr_json> --provider gemini

    # S DeepSeek
    export DEEPSEEK_API_KEY="your_key"
    python tools/analyze_with_ai.py <ocr_json> --provider deepseek

    # Heuristická analýza (bez API)
    python tools/analyze_with_ai.py <ocr_json> --provider heuristic

Získání API klíče:
    - Gemini: https://aistudio.google.com/app/apikey (zdarma tier)
    - DeepSeek: https://platform.deepseek.com/ (levné)
"""

import argparse
import json
import os
import sys
import time
from typing import List, Dict, Optional, Tuple
import re


class QuestionAnalyzer:
    """Analýza otázek pomocí AI nebo heuristiky."""
    
    def __init__(self, provider: str = 'heuristic'):
        self.provider = provider
        self.api_key = None
        self.client = None
        self._init_provider()
    
    def _init_provider(self):
        """Inicializace AI providera."""
        if self.provider == 'gemini':
            self.api_key = os.environ.get('GEMINI_API_KEY')
            if not self.api_key:
                print("Chyba: GEMINI_API_KEY není nastaven.")
                print("Získejte klíč zdarma: https://aistudio.google.com/app/apikey")
                sys.exit(1)
            try:
                import google.generativeai as genai
                genai.configure(api_key=self.api_key)
                self.client = genai.GenerativeModel('gemini-2.0-flash-lite')
                print(f"✓ Připojeno k Gemini API")
            except ImportError:
                print("Instaluji google-generativeai...")
                os.system(f"{sys.executable} -m pip install google-generativeai -q")
                import google.generativeai as genai
                genai.configure(api_key=self.api_key)
                self.client = genai.GenerativeModel('gemini-2.0-flash-lite')
                
        elif self.provider == 'deepseek':
            self.api_key = os.environ.get('DEEPSEEK_API_KEY')
            if not self.api_key:
                print("Chyba: DEEPSEEK_API_KEY není nastaven.")
                sys.exit(1)
            try:
                import openai
                self.client = openai.OpenAI(
                    api_key=self.api_key,
                    base_url="https://api.deepseek.com"
                )
                print(f"✓ Připojeno k DeepSeek API")
            except ImportError:
                print("Instaluji openai...")
                os.system(f"{sys.executable} -m pip install openai -q")
                import openai
                self.client = openai.OpenAI(
                    api_key=self.api_key,
                    base_url="https://api.deepseek.com"
                )
                
        elif self.provider == 'heuristic':
            print(f"✓ Používám heuristickou analýzu (bez API)")
        else:
            print(f"Neznámý provider: {self.provider}")
            sys.exit(1)
    
    def analyze_batch(self, questions: List[Dict], batch_size: int = 5) -> List[Dict]:
        """Analyzuje dávku otázek."""
        results = []
        total = len(questions)
        
        for i in range(0, total, batch_size):
            batch = questions[i:i+batch_size]
            print(f"\nAnalýza dávky {i//batch_size + 1}/{(total-1)//batch_size + 1} "
                  f"(otázky {i+1}-{min(i+batch_size, total)})")
            
            for q in batch:
                result = self._analyze_single(q)
                results.append(result)
                
                # Rate limiting
                if self.provider != 'heuristic':
                    time.sleep(0.5)
        
        return results
    
    def _analyze_single(self, question: Dict) -> Dict:
        """Analyzuje jednu otázku."""
        q_text = question.get('question', '')
        answers = question.get('answers', [])
        
        if not answers:
            question['correct'] = None
            question['correct_source'] = 'error_no_answers'
            return question
        
        if self.provider == 'heuristic':
            return self._heuristic_analysis(question)
        else:
            return self._ai_analysis(question)
    
    def _heuristic_analysis(self, question: Dict) -> Dict:
        """Heuristická analýza bez API."""
        q_text = question.get('question', '').lower()
        answers = question.get('answers', [])
        
        scores = [0.0] * len(answers)
        reasons = [''] * len(answers)
        
        # 1. Analýza klíčových slov v odpovědích
        # Definice technicky správných termínů pro stavbu letadel
        correct_indicators = {
            'samonosné křídlo': ['ano', 'samonosné', 'skořepinová'],
            'konstrukce': ['skořepinová', 'poloskořepinová', 'příhradová'],
            'materiál': ['dural', 'ocel', 'titan', 'kompozit'],
            'zatížení': ['nezatížený', 'nulový', 'rovnoměrný'],
            'stabilita': ['těžiště', 'páka', 'okamžik', 'moment'],
        }
        
        # 2. Detekce definic (otázky typu "co je...", "jak se nazývá...")
        is_definition = any(kw in q_text for kw in 
            ['co je', 'jak se nazývá', 'definuje se', 'značí se'])
        
        # 3. Analýza délky odpovědi (správná bývá často nejkompletnější)
        max_length = max(len(a) for a in answers)
        for i, ans in enumerate(answers):
            # Bonus za kompletní odpověď
            if len(ans) > max_length * 0.8:
                scores[i] += 0.1
            
            # Bonus za technické termíny
            ans_lower = ans.lower()
            for category, terms in correct_indicators.items():
                if any(term in ans_lower for term in terms):
                    scores[i] += 0.2
                    reasons[i] = f"obsahuje termín z kategorie '{category}'"
            
            # Bonus za přesnou definici
            if is_definition:
                # Definice často začíná "je to..."
                if re.match(r'^(je to|jsou to|označuje|nazývá)', ans_lower):
                    scores[i] += 0.15
                    reasons[i] += ", formát definice"
        
        # 4. Detekce vylučování (pokud jsou dvě odpovědi protichůdné)
        # Např. "větší/menší", "před/za"
        opposites = [
            ('větší', 'menší'), ('před', 'za'), ('nad', 'pod'),
            ('ano', 'ne'), ('pravda', 'nepravda')
        ]
        
        for i, ans1 in enumerate(answers):
            for j, ans2 in enumerate(answers[i+1:], i+1):
                for opp1, opp2 in opposites:
                    if opp1 in ans1.lower() and opp2 in ans2.lower():
                        # Protichůdné odpovědi - obě dostanou bonus
                        scores[i] += 0.05
                        scores[j] += 0.05
        
        # Výběr nejlepší odpovědi
        best_idx = scores.index(max(scores))
        confidence = scores[best_idx]
        
        question['correct'] = best_idx
        question['correct_source'] = 'heuristic'
        question['confidence'] = round(confidence, 2)
        question['analysis_reason'] = reasons[best_idx] if reasons[best_idx] else 'nejvyšší skóre'
        
        return question
    
    def _ai_analysis(self, question: Dict) -> Dict:
        """AI analýza pomocí API."""
        q_text = question.get('question', '')
        answers = question.get('answers', [])
        
        prompt = self._build_prompt(q_text, answers)
        
        try:
            if self.provider == 'gemini':
                response = self.client.generate_content(prompt)
                answer_text = response.text.strip()
            elif self.provider == 'deepseek':
                response = self.client.chat.completions.create(
                    model="deepseek-chat",
                    messages=[
                        {"role": "system", "content": "Jsi letecký expert. Odpovídej pouze písmenem a, b, c, nebo d."},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=10,
                    temperature=0.1
                )
                answer_text = response.choices[0].message.content.strip()
            else:
                answer_text = "?"
            
            # Parsování odpovědi
            answer_letter = self._parse_ai_response(answer_text, len(answers))
            
            if answer_letter is not None:
                question['correct'] = answer_letter
                question['correct_source'] = self.provider
                question['confidence'] = 0.9
                question['ai_raw_response'] = answer_text[:50]
            else:
                question['correct'] = 0
                question['correct_source'] = 'ai_uncertain'
                question['confidence'] = 0.3
                
        except Exception as e:
            print(f"    Chyba AI: {e}")
            question['correct'] = None
            question['correct_source'] = f'ai_error: {str(e)[:30]}'
            question['confidence'] = 0
        
        return question
    
    def _build_prompt(self, question: str, answers: List[str]) -> str:
        """Sestaví prompt pro AI."""
        prompt = f"""Jsi letecký expert a instruktor pilotního výcviku.

Urči SPRÁVNOU odpověď na otázku z učebnice "Stavba a konstrukce letadel".

OTÁZKA:
{question}

ODPOVĚDI:
"""
        for i, ans in enumerate(answers):
            letter = chr(97 + i)
            prompt += f"{letter}) {ans}\n"
        
        prompt += """
Odpověz POUZE jedním písmenem: a, b, c, nebo d.
Nepíšeš nic jiného, jen jedno písmeno.

Pokud si nejsi jistý, odpověz tím, co je podle tebe nejpravděpodobnější."""
        
        return prompt
    
    def _parse_ai_response(self, response: str, num_answers: int) -> Optional[int]:
        """Parsuje odpověď z AI."""
        response = response.lower().strip()
        
        # Hledáme písmeno
        letter_map = {'a': 0, 'b': 1, 'c': 2, 'd': 3, 'e': 4}
        
        # Přímá shoda
        if response in letter_map and letter_map[response] < num_answers:
            return letter_map[response]
        
        # Hledání v textu
        for letter, idx in letter_map.items():
            if letter in response and idx < num_answers:
                return idx
        
        return None


def main():
    parser = argparse.ArgumentParser(
        description='AI/heuristická analýza správných odpovědí'
    )
    parser.add_argument('ocr_json', help='Cesta k JSON souboru s OCR otázkami')
    parser.add_argument('--provider', '-p', 
                        choices=['gemini', 'deepseek', 'heuristic'],
                        default='heuristic',
                        help='AI provider (default: heuristic)')
    parser.add_argument('--output', '-o', help='Výstupní JSON soubor')
    parser.add_argument('--batch-size', '-b', type=int, default=5,
                        help='Velikost dávky pro API (default: 5)')
    parser.add_argument('--limit', '-l', type=int,
                        help='Omezit počet otázek k analýze (pro test)')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.ocr_json):
        print(f"Chyba: Soubor {args.ocr_json} nenalezen")
        sys.exit(1)
    
    # Načtení dat
    with open(args.ocr_json, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    questions = data.get('questions', [])
    
    # Filtr pouze otázek bez správné odpovědi
    to_analyze = [q for q in questions if q.get('correct') is None]
    
    if args.limit:
        to_analyze = to_analyze[:args.limit]
    
    already_have = len(questions) - len(to_analyze)
    
    print(f"=" * 60)
    print(f"ANALÝZA SPRÁVNÝCH ODPOVĚDÍ")
    print(f"=" * 60)
    print(f"Provider: {args.provider}")
    print(f"Celkem otázek: {len(questions)}")
    print(f"Již má správnou odpověď: {already_have}")
    print(f"K analýze: {len(to_analyze)}")
    print(f"=" * 60)
    
    if not to_analyze:
        print("\nVšechny otázky již mají určenou správnou odpověď!")
        return
    
    # Inicializace analyzeru
    analyzer = QuestionAnalyzer(args.provider)
    
    # Analýza
    analyzed = analyzer.analyze_batch(to_analyze, args.batch_size)
    
    # Sloučení výsledků
    analyzed_ids = {q['id'] for q in analyzed}
    final_questions = []
    
    for q in questions:
        if q['id'] in analyzed_ids:
            # Najdi analyzovanou verzi
            for aq in analyzed:
                if aq['id'] == q['id']:
                    final_questions.append(aq)
                    break
        else:
            final_questions.append(q)
    
    # Statistiky
    with_correct = sum(1 for q in final_questions if q.get('correct') is not None)
    
    print(f"\n{'='*60}")
    print(f"VÝSLEDKY")
    print(f"{'='*60}")
    print(f"Se správnou odpovědí: {with_correct}/{len(final_questions)} ({100*with_correct/len(final_questions):.1f}%)")
    print(f"  - Z databáze: {sum(1 for q in final_questions if q.get('correct_source') in ['CAA-8', 'CLUB'])}")
    print(f"  - Heuristika: {sum(1 for q in final_questions if q.get('correct_source') == 'heuristic')}")
    print(f"  - AI ({args.provider}): {sum(1 for q in final_questions if q.get('correct_source') == args.provider)}")
    
    # Zobrazení vzorku výsledků
    print(f"\n--- UKÁZKA ANALÝZY ---")
    for q in final_questions[:5]:
        if q.get('correct') is not None:
            source = q.get('correct_source', 'unknown')
            conf = q.get('confidence', '-')
            letter = chr(97 + q['correct'])
            print(f"\nQ{q['id']} [{source}, conf:{conf}]:")
            print(f"  {q['question'][:60]}...")
            print(f"  → Správná: {letter}) {q['answers'][q['correct']][:40]}...")
            if q.get('analysis_reason'):
                print(f"  Důvod: {q['analysis_reason']}")
    
    # Uložení
    output_path = args.output or args.ocr_json.replace('.json', '_analyzed.json')
    data['questions'] = final_questions
    data['analysis_meta'] = {
        'provider': args.provider,
        'total': len(final_questions),
        'with_correct': with_correct,
        'by_source': {
            'database': sum(1 for q in final_questions if q.get('correct_source') in ['CAA-8', 'CLUB']),
            'heuristic': sum(1 for q in final_questions if q.get('correct_source') == 'heuristic'),
            'ai': sum(1 for q in final_questions if q.get('correct_source') == args.provider)
        }
    }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"\n✓ Výsledek uložen: {output_path}")
    
    if with_correct < len(final_questions):
        remaining = len(final_questions) - with_correct
        print(f"\n⚠️  {remaining} otázek stále bez správné odpovědi")
        print(f"   Zkuste: --provider gemini pro AI analýzu")


if __name__ == '__main__':
    main()
