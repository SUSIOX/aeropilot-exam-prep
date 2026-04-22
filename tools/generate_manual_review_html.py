#!/usr/bin/env python3
"""
Generátor HTML stránky pro manuální označení správných odpovědí.

Vytvoří interaktivní HTML soubor kde můžete klikat na správné odpovědi.
Výsledek se uloží jako JSON.

Použití:
    python tools/generate_manual_review_html.py <ocr_json> [--output <html_file>]

Pak otevřete HTML v prohlížeči, označte odpovědi a klikněte "Uložit".
"""

import argparse
import json
import os
import sys
from html import escape


HTML_TEMPLATE = '''<!DOCTYPE html>
<html lang="cs">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Označení správných odpovědí - {title}</title>
    <style>
        * {{ box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 900px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }}
        .header {{
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        .header h1 {{ margin: 0 0 10px 0; font-size: 24px; }}
        .stats {{
            display: flex;
            gap: 20px;
            flex-wrap: wrap;
            font-size: 14px;
            color: #666;
        }}
        .stat {{ display: flex; align-items: center; gap: 5px; }}
        .stat .value {{ font-weight: bold; color: #333; }}
        
        .question {{
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 15px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        .question.answered {{
            border-left: 4px solid #4caf50;
        }}
        .question-header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }}
        .question-number {{
            background: #2196f3;
            color: white;
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: bold;
        }}
        .page-info {{
            color: #999;
            font-size: 13px;
        }}
        .question-text {{
            font-size: 16px;
            line-height: 1.6;
            margin-bottom: 15px;
            color: #333;
        }}
        .answers {{
            display: flex;
            flex-direction: column;
            gap: 10px;
        }}
        .answer {{
            display: flex;
            align-items: flex-start;
            padding: 12px 15px;
            border: 2px solid #e0e0e0;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
        }}
        .answer:hover {{
            border-color: #2196f3;
            background: #f5f5f5;
        }}
        .answer.selected {{
            border-color: #4caf50;
            background: #e8f5e9;
        }}
        .answer-letter {{
            background: #e0e0e0;
            color: #333;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            margin-right: 12px;
            flex-shrink: 0;
        }}
        .answer.selected .answer-letter {{
            background: #4caf50;
            color: white;
        }}
        .answer-text {{
            flex: 1;
            line-height: 1.5;
        }}
        
        .controls {{
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: white;
            padding: 15px 20px;
            box-shadow: 0 -2px 10px rgba(0,0,0,0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
            z-index: 100;
        }}
        .progress {{
            font-size: 14px;
            color: #666;
        }}
        .btn {{
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
        }}
        .btn-primary {{
            background: #2196f3;
            color: white;
        }}
        .btn-primary:hover {{ background: #1976d2; }}
        .btn-success {{
            background: #4caf50;
            color: white;
        }}
        .btn-success:hover {{ background: #388e3c; }}
        
        .save-section {{
            margin-top: 80px;
            padding: 20px;
            background: white;
            border-radius: 8px;
            text-align: center;
        }}
        #json-output {{
            width: 100%;
            height: 200px;
            margin-top: 15px;
            font-family: monospace;
            font-size: 12px;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            resize: vertical;
        }}
        
        .answered-badge {{
            background: #4caf50;
            color: white;
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 11px;
            margin-left: 10px;
        }}
        .hidden {{ display: none; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>{title}</h1>
        <div class="stats">
            <div class="stat">Celkem: <span class="value" id="total-count">{total}</span></div>
            <div class="stat">Označeno: <span class="value" id="answered-count">0</span></div>
            <div class="stat">Zbývá: <span class="value" id="remaining-count">{total}</span></div>
        </div>
    </div>
    
    <div id="questions">
        {questions_html}
    </div>
    
    <div class="controls">
        <div class="progress">
            <span id="progress-text">Označeno 0 / {total}</span>
        </div>
        <button class="btn btn-primary" onclick="showSaveSection()">✓ Dokončit a uložit</button>
    </div>
    
    <div id="save-section" class="save-section hidden">
        <h2>Hotovo!</h2>
        <p>Zkopírujte JSON níže a uložte ho do souboru, nebo klikněte na tlačítko pro stažení.</p>
        <textarea id="json-output" readonly></textarea>
        <div style="margin-top: 15px;">
            <button class="btn btn-success" onclick="downloadJSON()">📥 Stáhnout JSON</button>
            <button class="btn btn-primary" onclick="hideSaveSection()" style="margin-left: 10px;">Zpět k otázkám</button>
        </div>
    </div>
    
    <div style="height: 100px;"></div>
    
    <script>
        const questionsData = {questions_json};
        let answeredCount = 0;
        
        function selectAnswer(questionId, answerIndex) {{
            // Odstranit označení z ostatních odpovědí u této otázky
            const questionEl = document.getElementById('q-' + questionId);
            const answers = questionEl.querySelectorAll('.answer');
            answers.forEach((el, idx) => {{
                el.classList.remove('selected');
            }});
            
            // Označit vybranou odpověď
            answers[answerIndex].classList.add('selected');
            
            // Uložit do dat
            const q = questionsData.find(q => q.id === questionId);
            const wasAnswered = q.correct !== null && q.correct !== undefined;
            q.correct = answerIndex;
            q.correct_source = 'manual';
            
            // Aktualizovat počítadlo
            if (!wasAnswered) {{
                answeredCount++;
                updateProgress();
                questionEl.classList.add('answered');
            }}
            
            // Přidat badge
            const header = questionEl.querySelector('.question-header');
            if (!header.querySelector('.answered-badge')) {{
                header.innerHTML += '<span class="answered-badge">✓</span>';
            }}
        }}
        
        function updateProgress() {{
            document.getElementById('answered-count').textContent = answeredCount;
            document.getElementById('remaining-count').textContent = questionsData.length - answeredCount;
            document.getElementById('progress-text').textContent = `Označeno ${{answeredCount}} / ${{questionsData.length}}`;
        }}
        
        function showSaveSection() {{
            const output = {{
                source: '{source}',
                total_questions: questionsData.length,
                answered: answeredCount,
                questions: questionsData
            }};
            document.getElementById('json-output').value = JSON.stringify(output, null, 2);
            document.getElementById('save-section').classList.remove('hidden');
            window.scrollTo(0, document.getElementById('save-section').offsetTop);
        }}
        
        function hideSaveSection() {{
            document.getElementById('save-section').classList.add('hidden');
        }}
        
        function downloadJSON() {{
            const data = document.getElementById('json-output').value;
            const blob = new Blob([data], {{ type: 'application/json' }});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = '{output_filename}';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }}
    </script>
</body>
</html>
'''


def generate_questions_html(questions):
    """Generuje HTML pro otázky."""
    html = []
    
    for q in questions:
        q_id = q.get('id', 0)
        q_text = escape(q.get('question', ''))
        answers = q.get('answers', [])
        page = q.get('page', '?')
        
        # Pokud už má správnou odpověď z databáze
        has_correct = q.get('correct') is not None
        correct_idx = q.get('correct', 0) if has_correct else None
        
        html.append(f'<div class="question {"answered" if has_correct else ""}" id="q-{q_id}">')
        html.append('  <div class="question-header">')
        html.append(f'    <span class="question-number">Otázka {q_id}</span>')
        if has_correct:
            html.append('    <span class="answered-badge">✓ Auto</span>')
        html.append(f'    <span class="page-info">Strana {page}</span>')
        html.append('  </div>')
        html.append(f'  <div class="question-text">{q_text}</div>')
        html.append('  <div class="answers">')
        
        for i, ans in enumerate(answers):
            letter = chr(97 + i)  # a, b, c, d...
            ans_text = escape(ans)
            selected = 'selected' if has_correct and i == correct_idx else ''
            html.append(f'    <div class="answer {selected}" onclick="selectAnswer({q_id}, {i})">')
            html.append(f'      <span class="answer-letter">{letter}</span>')
            html.append(f'      <span class="answer-text">{ans_text}</span>')
            html.append('    </div>')
        
        html.append('  </div>')
        html.append('</div>')
    
    return '\n'.join(html)


def main():
    parser = argparse.ArgumentParser(
        description='Generátor HTML pro manuální označení správných odpovědí'
    )
    parser.add_argument('ocr_json', help='Cesta k JSON souboru s OCR otázkami')
    parser.add_argument('--output', '-o', help='Výstupní HTML soubor')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.ocr_json):
        print(f"Chyba: Soubor {args.ocr_json} nenalezen")
        sys.exit(1)
    
    # Načtení dat
    with open(args.ocr_json, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    questions = data.get('questions', [])
    source = data.get('source', 'OCR otázky')
    
    # Počítadlo automaticky označených
    auto_answered = sum(1 for q in questions if q.get('correct') is not None)
    
    print(f"Načteno {len(questions)} otázek")
    print(f"  Již označeno z databáze: {auto_answered}")
    print(f"  K manuálnímu označení: {len(questions) - auto_answered}")
    
    # Generování HTML
    questions_html = generate_questions_html(questions)
    
    output_filename = os.path.basename(args.ocr_json).replace('.json', '_reviewed.json')
    
    html = HTML_TEMPLATE.format(
        title=escape(source.split('/')[-1].replace('.pdf', '')),
        total=len(questions),
        questions_html=questions_html,
        questions_json=json.dumps(questions, ensure_ascii=False),
        source=escape(source),
        output_filename=output_filename
    )
    
    # Uložení
    output_path = args.output or args.ocr_json.replace('.json', '_review.html')
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)
    
    print(f"\nHTML stránka vytvořena: {output_path}")
    print(f"Otevřete ji v prohlížeči a klikněte na správné odpovědi.")
    print(f"Poté klikněte 'Dokončit a uložit' pro stažení JSON s označenými odpověďmi.")


if __name__ == '__main__':
    main()
