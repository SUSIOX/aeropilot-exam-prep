#!/bin/bash

# Jednoduchý script pro opravu kategorií uživatelských otázek
# Postup: 6→67→7, 7→78→8, 8→86→6

set -e

TABLE_NAME="aeropilot-questions"
REGION="eu-central-1"

echo "=== Oprava kategorií UŽIVATELSKÝCH otázek ==="
echo "Tabulka: $TABLE_NAME"
echo "Postup: 6→67→7, 7→78→8, 8→86→6"
echo ""

# Funkce pro získání počtu user otázek
get_user_count() {
    local subject_id=$1
    aws dynamodb scan \
        --table-name $TABLE_NAME \
        --filter-expression "subjectId = :sid AND (attribute_not_exists(#src) OR #src <> :src)" \
        --expression-attribute-values "{\":sid\":{\"N\":\"$subject_id\"},\":src\":{\"S\":\"ai\"}}" \
        --expression-attribute-names '{"#src":"source"}' \
        --region $REGION \
        --query "Count" \
        --output json | jq -r '.'
}

# 1. Původní stav
echo "📋 PŮVODNÍ STAV (uživatelské otázky):"
COUNT_6=$(get_user_count 6)
COUNT_7=$(get_user_count 7)
COUNT_8=$(get_user_count 8)

echo "   Subject 6 (user): $COUNT_6 položek"
echo "   Subject 7 (user): $COUNT_7 položek"
echo "   Subject 8 (user): $COUNT_8 položek"

TOTAL_TO_FIX=$((COUNT_6 + COUNT_7 + COUNT_8))
echo "   Celkem k opravě: $TOTAL_TO_FIX položek"

if [ $TOTAL_TO_FIX -eq 0 ]; then
    echo "✅ Žádné uživatelské otázky k opravě!"
    exit 0
fi

echo ""
echo "⚠️  Připraven opravit $TOTAL_TO_FIX uživatelských otázek!"
echo "   6→67→7, 7→78→8, 8→86→6"
echo ""
read -p "Pokračovat? (ano/ne): " answer

if [ "$answer" != "ano" ]; then
    echo "❌ Operace zrušena"
    exit 0
fi

# Funkce pro aktualizaci kategorie
update_category() {
    local old_id=$1
    local new_id=$2
    local count=$3
    
    echo "   Subject $old_id -> $new_id ($count položek)..."
    
    # Získání IDček
    local items=$(aws dynamodb scan \
        --table-name $TABLE_NAME \
        --filter-expression "subjectId = :sid AND (attribute_not_exists(#src) OR #src <> :src)" \
        --expression-attribute-values "{\":sid\":{\"N\":\"$old_id\"},\":src\":{\"S\":\"ai\"}}" \
        --expression-attribute-names '{"#src":"source"}' \
        --projection-expression "questionId" \
        --region $REGION \
        --query "Items[*].questionId.S" \
        --output json | jq -r '.[]')
    
    local updated=0
    for question_id in $items; do
        aws dynamodb update-item \
            --table-name $TABLE_NAME \
            --key "{\"questionId\":{\"S\":\"$question_id\"}}" \
            --update-expression "SET subjectId = :newSubjectId, updatedAt = :updatedAt" \
            --expression-attribute-values "{\":newSubjectId\":{\"N\":\"$new_id\"},\":updatedAt\":{\"S\":\"$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")\"}}" \
            --region $REGION \
            >/dev/null 2>&1
        
        updated=$((updated + 1))
        if [ $((updated % 25)) -eq 0 ]; then
            echo "     Provedeno $updated/$count..."
        fi
    done
    
    echo "   ✅ Dokončeno ($updated položek)"
    return $updated
}

# 2. Krok 1: Přesun na dočasné kategorie
echo ""
echo "🔄 KROK 1: Přesun na dočasné kategorie"

UPDATED_6=$(update_category 6 67 $COUNT_6)
UPDATED_7=$(update_category 7 78 $COUNT_7)
UPDATED_8=$(update_category 8 86 $COUNT_8)

STEP1_TOTAL=$((UPDATED_6 + UPDATED_7 + UPDATED_8))
echo ""
echo "✅ Krok 1 dokončen! Aktualizováno: $STEP1_TOTAL položek"

# 3. Kontrola po Kroku 1
echo ""
echo "🔍 Kontrola po Kroku 1:"
sleep 2

COUNT_67=$(get_user_count 67)
COUNT_78=$(get_user_count 78)
COUNT_86=$(get_user_count 86)

echo "   Subject 67 (user): $COUNT_67 položek"
echo "   Subject 78 (user): $COUNT_78 položek"
echo "   Subject 86 (user): $COUNT_86 položek"

# 4. Krok 2: Přesun na finální kategorie
echo ""
echo "🔄 KROK 2: Přesun na finální kategorie"

UPDATED_67=$(update_category 67 7 $COUNT_67)
UPDATED_78=$(update_category 78 8 $COUNT_78)
UPDATED_86=$(update_category 86 6 $COUNT_86)

STEP2_TOTAL=$((UPDATED_67 + UPDATED_78 + UPDATED_86))
echo ""
echo "✅ Krok 2 dokončen! Aktualizováno: $STEP2_TOTAL položek"

# 5. Finální kontrola
echo ""
echo "🔍 FINÁLNÍ KONTROLA:"
sleep 2

FINAL_6=$(get_user_count 6)
FINAL_7=$(get_user_count 7)
FINAL_8=$(get_user_count 8)

echo ""
echo "📊 FINÁLNÍ ROZDĚLENÍ UŽIVATELSKÝCH OTÁZEK:"
echo "   Subject 6 (user): $FINAL_6 položek (původní 8: $COUNT_8)"
echo "   Subject 7 (user): $FINAL_7 položek (původní 6: $COUNT_6)"
echo "   Subject 8 (user): $FINAL_8 položek (původní 7: $COUNT_7)"

echo ""
echo "🎉 OPERACE DOKONČENA!"
echo "✅ Celkem aktualizováno: $((STEP1_TOTAL + STEP2_TOTAL)) uživatelských otázek"

# 6. Validace
if [ "$FINAL_7" = "$COUNT_6" ] && [ "$FINAL_8" = "$COUNT_7" ] && [ "$FINAL_6" = "$COUNT_8" ]; then
    echo ""
    echo "✅ VŠE V POŘÁDKU! Mapování je správné."
else
    echo ""
    echo "⚠️  POZOR! Mapování není správné."
fi
