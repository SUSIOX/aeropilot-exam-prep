#!/usr/bin/env python3
"""
Ověření správných odpovědí v CAA PPL exam PDF souborech.

Porovnává zaškrtnuté checkboxy v PDF s hodnotou `correct` v subject_X.json.
Detekce funguje renderováním PDF stránek a měřením tmavých pixelů v oblasti
checkboxů — zaškrtnutý checkbox má ~24 % víc tmavých pixelů.

Prerekvizity:
    pip install pypdfium2 pdfplumber Pillow

Použití:
    # Kontrola jednoho předmětu
    python tools/verify-pdf-answers.py --subject 5

    # Kontrola všech předmětů
    python tools/verify-pdf-answers.py

    # Automatická oprava JSON souborů
    python tools/verify-pdf-answers.py --fix

    # Jen výpis bez opravy
    python tools/verify-pdf-answers.py --dry-run
"""
import argparse, json, os, shutil, sys
from datetime import datetime

try:
    import pypdfium2 as pdfium
    import pdfplumber
    from PIL import Image
except ImportError:
    print("Chybí závislosti. Nainstalujte: pip install pypdfium2 pdfplumber Pillow")
    sys.exit(1)

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SUBJECT_PDF = {
    1: "caa_ppl_lapl_pdfs/1-Letecky-zakon-a-postupy-ATC-letoun.pdf",
    2: "caa_ppl_lapl_pdfs/2.-Lidska-vykonnost-letoun.pdf",
    3: "caa_ppl_lapl_pdfs/3-Meteorologie-letoun.pdf",
    4: "caa_ppl_lapl_pdfs/Komunikace.pdf",
    5: "caa_ppl_lapl_pdfs/5-Letove-zasady-letoun.pdf",
    6: "caa_ppl_lapl_pdfs/6-Provozni-postupy-letoun.pdf",
    7: "caa_ppl_lapl_pdfs/7-Vykonnost-a-planovani-letu-letoun.pdf",
    8: "caa_ppl_lapl_pdfs/8-Obecne-znalosti-o-letadle-letoun.pdf",
    9: "caa_ppl_lapl_pdfs/9-Navigace-letoun.pdf",
}

RENDER_SCALE = 6  # Vyšší = přesnější detekce, ale pomalejší


def measure_checkbox(img, top_pt, x0_pt, scale):
    """Změří počet tmavých pixelů v oblasti checkboxu."""
    cb_x_start = max(0, int((x0_pt - 16) * scale))
    cb_x_end = int((x0_pt + 5) * scale)
    cb_y_start = int((top_pt - 2) * scale)
    cb_y_end = int((top_pt + 12) * scale)
    crop = img.crop((cb_x_start, cb_y_start, cb_x_end, cb_y_end))
    pixels = list(crop.getdata())
    return sum(1 for p in pixels if sum(p[:3]) / 3 < 128)


def extract_pdf_answers(pdf_path):
    """Extrahuje otázky z PDF a detekuje správné odpovědi pomocí pixel analýzy."""
    plumber = pdfplumber.open(pdf_path)
    renderer = pdfium.PdfDocument(pdf_path)
    page_imgs = {}

    questions = []
    for pn, page in enumerate(plumber.pages):
        ws = page.extract_words(
            keep_blank_chars=True, extra_attrs=["fontname", "size"]
        )
        i = 0
        while i < len(ws):
            w = ws[i]
            if "Bold" in w.get("fontname", "") and w["text"].strip().isdigit():
                qn = int(w["text"].strip())
                if i + 1 < len(ws) and "Vyřazena" in ws[i + 1].get("text", ""):
                    i += 1
                    continue
                answers = []
                j = i + 2
                while j < len(ws):
                    if "Segoe" in ws[j].get("fontname", ""):
                        if j + 1 < len(ws):
                            at = ws[j + 1]["text"].strip()
                            if at:
                                answers.append(
                                    {
                                        "text": at,
                                        "top": ws[j]["top"],
                                        "x0": ws[j]["x0"],
                                        "page": pn,
                                    }
                                )
                        j += 2
                    elif (
                        "Bold" in ws[j].get("fontname", "")
                        and ws[j]["text"].strip().isdigit()
                    ):
                        break
                    else:
                        j += 1
                if len(answers) >= 2:
                    questions.append({"num": qn, "answers": answers})
            i += 1

    for q in questions:
        for a in q["answers"]:
            pn = a["page"]
            if pn not in page_imgs:
                page_imgs[pn] = renderer[pn].render(scale=RENDER_SCALE).to_pil()
            img = page_imgs[pn]
            a["dark"] = measure_checkbox(img, a["top"], a["x0"], RENDER_SCALE)

    results = {}
    for q in questions:
        ds = [(i, a["dark"]) for i, a in enumerate(q["answers"])]
        if not ds:
            continue
        max_dark = max(d for _, d in ds)
        min_dark = min(d for _, d in ds)
        if min_dark > 0 and max_dark / min_dark < 1.05:
            continue
        ci = max(ds, key=lambda x: x[1])[0]
        results[q["num"]] = {
            "correct": ci,
            "answer": q["answers"][ci]["text"][:60],
            "darks": [d for _, d in ds],
        }

    return results


def check_subject(sid, fix=False):
    """Zkontroluje a volitelně opraví jeden předmět."""
    pdf_rel = SUBJECT_PDF.get(sid)
    if not pdf_rel:
        print(f"  Subject {sid}: neznámý předmět")
        return []

    pdf_path = os.path.join(BASE, pdf_rel)
    json_path = os.path.join(BASE, f"backups/subject_{sid}.json")

    if not os.path.exists(pdf_path):
        print(f"  Subject {sid}: PDF nenalezeno ({pdf_rel})")
        return []
    if not os.path.exists(json_path):
        print(f"  Subject {sid}: JSON nenalezeno")
        return []

    pdf_answers = extract_pdf_answers(pdf_path)

    with open(json_path, encoding="utf-8") as f:
        questions = json.load(f)
    q_map = {q["id"]: q for q in questions}

    mismatches = []
    for qnum, pdf_data in sorted(pdf_answers.items()):
        jq = q_map.get(qnum)
        if not jq:
            continue
        if pdf_data["correct"] != jq["correct"]:
            mismatches.append(
                {
                    "qnum": qnum,
                    "questionId": f"subject{sid}_q{qnum}",
                    "old_correct": jq["correct"],
                    "new_correct": pdf_data["correct"],
                    "old_answer": jq["answers"][jq["correct"]][:60],
                    "new_answer": pdf_data["answer"],
                }
            )

    if mismatches and fix:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup = json_path + f".bak.{timestamp}"
        shutil.copy2(json_path, backup)

        for m in mismatches:
            for q in questions:
                if q["id"] == m["qnum"]:
                    q["correct"] = m["new_correct"]
                    break

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(questions, f, indent=2, ensure_ascii=False)

        print(f"  ✅ {len(mismatches)} opraveno (backup: {os.path.basename(backup)})")
    elif mismatches:
        for m in mismatches:
            print(
                f"  Q{m['qnum']:3d}: [{m['old_correct']}] \"{m['old_answer'][:30]}\" "
                f"-> [{m['new_correct']}] \"{m['new_answer'][:30]}\""
            )
        print(f"  ⚠️  {len(mismatches)} nesrovnalostí (použijte --fix pro opravu)")
    else:
        print(f"  ✅ Vše OK")

    return mismatches


def main():
    parser = argparse.ArgumentParser(
        description="Ověření správných odpovědí v CAA PPL exam PDF"
    )
    parser.add_argument(
        "--subject", "-s", type=int, help="Číslo předmětu (1-9). Bez = všechny."
    )
    parser.add_argument(
        "--fix", action="store_true", help="Automaticky opravit JSON soubory"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Jen výpis, žádné změny (default)"
    )
    args = parser.parse_args()

    subjects = [args.subject] if args.subject else sorted(SUBJECT_PDF.keys())
    do_fix = args.fix and not args.dry_run

    all_mismatches = {}
    for sid in subjects:
        print(f"\nSubject {sid}: {SUBJECT_PDF.get(sid, '?')}", flush=True)
        mm = check_subject(sid, fix=do_fix)
        if mm:
            all_mismatches[sid] = mm

    total = sum(len(v) for v in all_mismatches.values())
    print(f"\n{'='*50}")
    if total:
        print(f"Celkem nesrovnalostí: {total}")
        for sid in sorted(all_mismatches):
            print(f"  Subject {sid}: {len(all_mismatches[sid])}")
        if not do_fix:
            print(f"\nPro opravu spusťte znovu s --fix")
    else:
        print("Žádné nesrovnalosti nenalezeny. ✅")


if __name__ == "__main__":
    main()
