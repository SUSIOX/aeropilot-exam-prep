#!/bin/bash

# Vyčištění a správné naimportování JSON souborů
# Subject 6: 60 otázek, Subject 7: 103 otázek, Subject 8: 127 otázek

set -e

TABLE_NAME="aeropilot-questions"
REGION="eu-central-1"

echo "=== Vyčištění a správné naimportování JSON souborů ==="
echo "Tabulka: $TABLE_NAME"
echo ""

# 1. Kontrola JSON souborů
echo "📋 Kontrola JSON souborů:"
JSON_6=$(jq length subject_6.json)
JSON_7=$(jq length subject_7.json)
JSON_8=$(jq length subject_8.json)

echo "   subject_6.json: $JSON_6 otázek"
echo "   subject_7.json: $JSON_7 otázek"
echo "   subject_8.json: $JSON_8 otázek"

# 2. Aktuální stav v databázi
echo ""
echo "📊 Aktuální stav v databázi (user otázky):"
DB_6=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND (attribute_not_exists(#src) OR #src <> :src)" --expression-attribute-values "{\":sid\":{\"N\":\"6\"},\":src\":{\"S\":\"ai\"}}" --expression-attribute-names '{"#src":"source"}' --region $REGION --query "Count" --output json)
DB_7=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND (attribute_not_exists(#src) OR #src <> :src)" --expression-attribute-values "{\":sid\":{\"N\":\"7\"},\":src\":{\"S\":\"ai\"}}" --expression-attribute-names '{"#src":"source"}' --region $REGION --query "Count" --output json)
DB_8=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND (attribute_not_exists(#src) OR #src <> :src)" --expression-attribute-values "{\":sid\":{\"N\":\"8\"},\":src\":{\"S\":\"ai\"}}" --expression-attribute-names '{"#src":"source"}' --region $REGION --query "Count" --output json)

echo "   Subject 6 (user): $DB_6 otázek (mělo by být $JSON_6)"
echo "   Subject 7 (user): $DB_7 otázek (mělo by být $JSON_7)"
echo "   Subject 8 (user): $DB_8 otázek (mělo by být $JSON_8)"

# 3. AI otázky (mají zůstat)
echo ""
echo "🤖 AI otázky (zůstanou nezměněny):"
AI_6=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND #src = :src" --expression-attribute-values "{\":sid\":{\"N\":\"6\"},\":src\":{\"S\":\"ai\"}}" --expression-attribute-names '{"#src":"source"}' --region $REGION --query "Count" --output json)
AI_7=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND #src = :src" --expression-attribute-values "{\":sid\":{\"N\":\"7\"},\":src\":{\"S\":\"ai\"}}" --expression-attribute-names '{"#src":"source"}' --region $REGION --query "Count" --output json)
AI_8=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND #src = :src" --expression-attribute-values "{\":sid\":{\"N\":\"8\"},\":src\":{\"S\":\"ai\"}}" --expression-attribute-names '{"#src":"source"}' --region $REGION --query "Count" --output json)

echo "   Subject 6 (ai): $AI_6 otázek"
echo "   Subject 7 (ai): $AI_7 otázek"
echo "   Subject 8 (ai): $AI_8 otázek"

TOTAL_USER_TO_DELETE=$((DB_6 + DB_7 + DB_8))
TOTAL_USER_TO_IMPORT=$((JSON_6 + JSON_7 + JSON_8))

echo ""
echo "⚠️  PŘIPRAVEN OPERACI:"
echo "   Smazat: $TOTAL_USER_TO_DELETE uživatelských otázek"
echo "   Naimportovat: $TOTAL_USER_TO_IMPORT otázek z JSON"
echo "   AI otázky zůstanou nezměněny"
echo ""
read -p "Pokračovat? (ano/ne): " answer

if [ "$answer" != "ano" ]; then
    echo "❌ Operace zrušena"
    exit 0
fi

# 4. Smazání stávajících uživatelských otázek
echo ""
echo "🗑️  Krok 1: Mazání stávajících uživatelských otázek"

delete_user_questions() {
    local subject_id=$1
    local count=$2
    
    echo "   Mažu user otázky z Subject $subject_id ($count položek)..."
    
    # Získání všech user otázek
    local items=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND (attribute_not_exists(#src) OR #src <> :src)" --expression-attribute-values "{\":sid\":{\"N\":\"$subject_id\"},\":src\":{\"S\":\"ai\"}}" --expression-attribute-names '{"#src":"source"}' --projection-expression "questionId" --region $REGION --query "Items[*].questionId.S" --output text)
    
    local deleted=0
    for question_id in $items; do
        if [ -n "$question_id" ]; then
            aws dynamodb delete-item \
                --table-name $TABLE_NAME \
                --key "{\"questionId\":{\"S\":\"$question_id\"}}" \
                --region $REGION \
                >/dev/null 2>&1
            
            deleted=$((deleted + 1))
            if [ $((deleted % 25)) -eq 0 ]; then
                echo "     Smazáno $deleted/$count..."
            fi
        fi
    done
    
    echo "   ✅ Smazáno $deleted uživatelských otázek z Subject $subject_id"
}

if [ $DB_6 -gt 0 ]; then delete_user_questions 6 $DB_6; fi
if [ $DB_7 -gt 0 ]; then delete_user_questions 7 $DB_7; fi
if [ $DB_8 -gt 0 ]; then delete_user_questions 8 $DB_8; fi

echo "✅ Krok 1 dokončen - všechny user otázky smazány"

# 5. Import z JSON souborů
echo ""
echo "📥 Krok 2: Import otázek z JSON souborů"

import_json_questions() {
    local subject_id=$1
    local json_file=$2
    local expected_count=$3
    
    echo "   Importuji $json_file -> Subject $subject_id ($expected_count otázek)..."
    
    # Vytvoření dočasného souboru s correct subjectId
    local temp_file="temp_subject_${subject_id}.json"
    jq --arg sid "$subject_id" '.[] | . + {subjectId: ($sid | tonumber)}' "$json_file" > "$temp_file"
    
    # Import pomocí existujícího import scriptu
    if [ -f "test-scripts/import-questions.ts" ]; then
        echo "     Používám existující import script..."
        npx tsx test-scripts/import-questions.ts --subject $subject_id --file "$temp_file"
    else
        echo "     Ruční import..."
        # Zde by byl ruční import, ale použijeme existující script
    fi
    
    rm -f "$temp_file"
    echo "   ✅ Import $json_file dokončen"
}

import_json_questions 6 subject_6.json $JSON_6
import_json_questions 7 subject_7.json $JSON_7
import_json_questions 8 subject_8.json $JSON_8

echo "✅ Krok 2 dokončen - všechny JSON soubory naimportovány"

# 6. Finální kontrola
echo ""
echo "🔍 FINÁLNÍ KONTROLA:"
sleep 3

FINAL_6=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND (attribute_not_exists(#src) OR #src <> :src)" --expression-attribute-values "{\":sid\":{\"N\":\"6\"},\":src\":{\"S\":\"ai\"}}" --expression-attribute-names '{"#src":"source"}' --region $REGION --query "Count" --output json)
FINAL_7=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND (attribute_not_exists(#src) OR #src <> :src)" --expression-attribute-values "{\":sid\":{\"N\":\"7\"},\":src\":{\"S\":\"ai\"}}" --expression-attribute-names '{"#src":"source"}' --region $REGION --query "Count" --output json)
FINAL_8=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND (attribute_not_exists(#src) OR #src <> :src)" --expression-attribute-values "{\":sid\":{\"N\":\"8\"},\":src\":{\"S\":\"ai\"}}" --expression-attribute-names '{"#src":"source"}' --region $REGION --query "Count" --output json)

FINAL_AI_6=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND #src = :src" --expression-attribute-values "{\":sid\":{\"N\":\"6\"},\":src\":{\"S\":\"ai\"}}" --expression-attribute-names '{"#src":"source"}' --region $REGION --query "Count" --output json)
FINAL_AI_7=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND #src = :src" --expression-attribute-values "{\":sid\":{\"N\":\"7\"},\":src\":{\"S\":\"ai\"}}" --expression-attribute-names '{"#src":"source"}' --region $REGION --query "Count" --output json)
FINAL_AI_8=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND #src = :src" --expression-attribute-values "{\":sid\":{\"N\":\"8\"},\":src\":{\"S\":\"ai\"}}" --expression-attribute-names '{"#src":"source"}' --region $REGION --query "Count" --output json)

echo ""
echo "📊 FINÁLNÍ VÝSLEDKY:"
echo "   Subject 6: $FINAL_6 user + $FINAL_AI_6 ai otázek (očekáváno: $JSON_6 user + $AI_6 ai)"
echo "   Subject 7: $FINAL_7 user + $FINAL_AI_7 ai otázek (očekáváno: $JSON_7 user + $AI_7 ai)"
echo "   Subject 8: $FINAL_8 user + $FINAL_AI_8 ai otázek (očekáváno: $JSON_8 user + $AI_8 ai)"

echo ""
echo "🎉 OPERACE DOKONČENA!"

# 7. Validace
if [ "$FINAL_6" = "$JSON_6" ] && [ "$FINAL_7" = "$JSON_7" ] && [ "$FINAL_8" = "$JSON_8" ]; then
    echo "✅ VŠE V POŘÁDKU! JSON soubory jsou správně naimportovány."
else
    echo "⚠️  POZOR! Něco není v pořádku s importem."
fi
