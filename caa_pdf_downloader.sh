#!/bin/bash

# CAA PDF Downloader
# Stáhne všechny PDF zkouškové otázky PPL/LAPL z CAA webu

set -e

# Adresář pro ukládání
OUTPUT_DIR="caa_ppl_lapl_pdfs"
BASE_URL="https://www.caa.gov.cz/zkusebni-otazky-pro-zkousky-teoretickych-znalosti-ppl-lapl/"

echo "🚀 Stahuji PDF zkouškové otázky PPL/LAPL z CAA..."
echo "📂 Výstupní adresář: $OUTPUT_DIR"

# Vytvoř adresář pokud neexistuje
mkdir -p "$OUTPUT_DIR"

echo "🔍 Hledám PDF odkazy na stránce..."

# Získej HTML stránku
HTML_CONTENT=$(curl -s "$BASE_URL")

# Najdi všechny PDF odkazy - upravený regex pro CAA web
PDF_LINKS=$(echo "$HTML_CONTENT" | grep -oE 'href="[^"]*\.pdf[^"]*"' | sed 's/href="//g' | sed 's/".*//g')

if [ -z "$PDF_LINKS" ]; then
    echo "❌ Nebyly nalezeny žádné PDF odkazy"
    exit 1
fi

echo "📄 Nalezeno PDF souborů: $(echo "$PDF_LINKS" | wc -l)"
echo ""

# Stáhni každé PDF
for PDF_URL in $PDF_LINKS; do
    # Pokud je relativní URL, přidej base URL
    if [[ $PDF_URL == http* ]]; then
        FULL_URL="$PDF_URL"
    else
        FULL_URL="https://www.caa.gov.cz$PDF_URL"
    fi
    
    # Získej název souboru z URL
    FILENAME=$(basename "$FULL_URL" | cut -d'?' -f1)
    OUTPUT_PATH="$OUTPUT_DIR/$FILENAME"
    
    echo "📥 Stahuji: $FILENAME"
    
    # Stáhni PDF s progress barem
    if curl -L --progress-bar -o "$OUTPUT_PATH" "$FULL_URL"; then
        echo "✅ Hotovo: $OUTPUT_PATH"
    else
        echo "❌ Chyba při stahování: $FULL_URL"
    fi
    
    echo ""
done

echo "🎉 Staženo všech PDF souborů do adresáře: $OUTPUT_DIR"
echo "📊 Celkem stažených souborů: $(ls -1 "$OUTPUT_DIR"/*.pdf 2>/dev/null | wc -l)"

# Zobraz souhrn
echo ""
echo "📋 Souhrn stažených souborů:"
ls -lh "$OUTPUT_DIR"/*.pdf 2>/dev/null || echo "Žádné PDF soubory nenalezeny"
