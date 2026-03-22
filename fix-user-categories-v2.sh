#!/bin/bash

# Oprava kategorií v DynamoDB - POUZE UŽIVATELSKÉ OTÁZKY (ne AI)
# Postup: 6→67→7, 7→78→8, 8→86→6

set -e

TABLE_NAME="aeropilot-questions"
REGION="eu-central-1"

echo "=== Oprava kategorií UŽIVATELSKÝCH otázek (AWS CLI) ==="
echo "Tabulka: $TABLE_NAME"
echo "Postup: 6→67→7, 7→78→8, 8→86→6"
echo "Filtr: ne AI otázky (source != \"ai\" nebo bez source)"
echo ""

# 1. Původní stav - POUZE UŽIVATELSKÉ OTÁZKY (ne AI)
echo "📋 PŮVODNÍ STAV (pouze user - ne AI):"
COUNT_6=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND (attribute_not_exists(#src) OR #src <> :src)" --expression-attribute-values '{":sid":{"N":"6"},":src":{"S":"ai"}}' --expression-attribute-names '{"#src":"source"}' --region $REGION --query "Count" --output text 2>/dev/null || echo "0")
COUNT_7=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND (attribute_not_exists(#src) OR #src <> :src)" --expression-attribute-values '{":sid":{"N":"7"},":src":{"S":"ai"}}' --expression-attribute-names '{"#src":"source"}' --region $REGION --query "Count" --output text 2>/dev/null || echo "0")
COUNT_8=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND (attribute_not_exists(#src) OR #src <> :src)" --expression-attribute-values '{":sid":{"N":"8"},":src":{"S":"ai"}}' --expression-attribute-names '{"#src":"source"}' --region $REGION --query "Count" --output text 2>/dev/null || echo "0")

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
echo "⚠️  PŘIPRAVEN PROVEST OPRAVU UŽIVATELSKÝCH OTÁZEK!"
echo "   6→67→7, 7→78→8, 8→86→6 (pouze ne AI)"
echo ""
read -p "Pokračovat? (ano/ne): " answer

if [ "$answer" != "ano" ]; then
    echo "❌ Operace zrušena"
    exit 0
fi

# 2. Krok 1: Přesun na dočasné kategorie
echo ""
echo "🔄 KROK 1: Přesun na dočasné kategorie"

# Subject 6 -> 67 (pouze ne AI)
if [ $COUNT_6 -gt 0 ]; then
    echo "   Subject 6 (user) -> 67 ($COUNT_6 položek)..."
    
    # Získání všech uživatelských položek s subjectId = 6
    ITEMS_6=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND (attribute_not_exists(#src) OR #src <> :src)" --expression-attribute-values '{":sid":{"N":"6"},":src":{"S":"ai"}}' --expression-attribute-names '{"#src":"source"}' --projection-expression "questionId" --region $REGION --query "Items[*].questionId.S" --output text)
    
    # Aktualizace každé položky
    UPDATED_6=0
    for question_id in $ITEMS_6; do
        aws dynamodb update-item \
            --table-name $TABLE_NAME \
            --key "{\"questionId\":{\"S\":\"$question_id\"}}" \
            --update-expression "SET subjectId = :newSubjectId, updatedAt = :updatedAt" \
            --expression-attribute-values '{":newSubjectId":{"N":"67"},":updatedAt":{"S":"'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'"}}' \
            --region $REGION \
            >/dev/null 2>&1
        
        UPDATED_6=$((UPDATED_6 + 1))
        if [ $((UPDATED_6 % 25)) -eq 0 ]; then
            echo "     Provedeno $UPDATED_6/$COUNT_6..."
        fi
    done
    
    echo "   ✅ Subject 6 (user) -> 67 dokončen ($UPDATED_6 položek)"
fi

# Subject 7 -> 78 (pouze ne AI)
if [ $COUNT_7 -gt 0 ]; then
    echo "   Subject 7 (user) -> 78 ($COUNT_7 položek)..."
    
    ITEMS_7=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND (attribute_not_exists(#src) OR #src <> :src)" --expression-attribute-values '{":sid":{"N":"7"},":src":{"S":"ai"}}' --expression-attribute-names '{"#src":"source"}' --projection-expression "questionId" --region $REGION --query "Items[*].questionId.S" --output text)
    
    UPDATED_7=0
    for question_id in $ITEMS_7; do
        aws dynamodb update-item \
            --table-name $TABLE_NAME \
            --key "{\"questionId\":{\"S\":\"$question_id\"}}" \
            --update-expression "SET subjectId = :newSubjectId, updatedAt = :updatedAt" \
            --expression-attribute-values '{":newSubjectId":{"N":"78"},":updatedAt":{"S":"'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'"}}' \
            --region $REGION \
            >/dev/null 2>&1
        
        UPDATED_7=$((UPDATED_7 + 1))
        if [ $((UPDATED_7 % 25)) -eq 0 ]; then
            echo "     Provedeno $UPDATED_7/$COUNT_7..."
        fi
    done
    
    echo "   ✅ Subject 7 (user) -> 78 dokončen ($UPDATED_7 položek)"
fi

# Subject 8 -> 86 (pouze ne AI)
if [ $COUNT_8 -gt 0 ]; then
    echo "   Subject 8 (user) -> 86 ($COUNT_8 položek)..."
    
    ITEMS_8=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND (attribute_not_exists(#src) OR #src <> :src)" --expression-attribute-values '{":sid":{"N":"8"},":src":{"S":"ai"}}' --expression-attribute-names '{"#src":"source"}' --projection-expression "questionId" --region $REGION --query "Items[*].questionId.S" --output text)
    
    UPDATED_8=0
    for question_id in $ITEMS_8; do
        aws dynamodb update-item \
            --table-name $TABLE_NAME \
            --key "{\"questionId\":{\"S\":\"$question_id\"}}" \
            --update-expression "SET subjectId = :newSubjectId, updatedAt = :updatedAt" \
            --expression-attribute-values '{":newSubjectId":{"N":"86"},":updatedAt":{"S":"'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'"}}' \
            --region $REGION \
            >/dev/null 2>&1
        
        UPDATED_8=$((UPDATED_8 + 1))
        if [ $((UPDATED_8 % 25)) -eq 0 ]; then
            echo "     Provedeno $UPDATED_8/$COUNT_8..."
        fi
    done
    
    echo "   ✅ Subject 8 (user) -> 86 dokončen ($UPDATED_8 položek)"
fi

STEP1_TOTAL=$((UPDATED_6 + UPDATED_7 + UPDATED_8))
echo ""
echo "✅ Krok 1 dokončen! Aktualizováno: $STEP1_TOTAL uživatelských položek"

# 3. Kontrola po Kroku 1
echo ""
echo "🔍 Kontrola po Kroku 1:"
sleep 2

COUNT_67=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND (attribute_not_exists(#src) OR #src <> :src)" --expression-attribute-values '{":sid":{"N":"67"},":src":{"S":"ai"}}' --expression-attribute-names '{"#src":"source"}' --region $REGION --query "Count" --output text 2>/dev/null || echo "0")
COUNT_78=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND (attribute_not_exists(#src) OR #src <> :src)" --expression-attribute-values '{":sid":{"N":"78"},":src":{"S":"ai"}}' --expression-attribute-names '{"#src":"source"}' --region $REGION --query "Count" --output text 2>/dev/null || echo "0")
COUNT_86=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND (attribute_not_exists(#src) OR #src <> :src)" --expression-attribute-values '{":sid":{"N":"86"},":src":{"S":"ai"}}' --expression-attribute-names '{"#src":"source"}' --region $REGION --query "Count" --output text 2>/dev/null || echo "0")

echo "   Subject 67 (user): $COUNT_67 položek"
echo "   Subject 78 (user): $COUNT_78 položek"
echo "   Subject 86 (user): $COUNT_86 položek"

# 4. Krok 2: Přesun na finální kategorie
echo ""
echo "🔄 KROK 2: Přesun na finální kategorie"

# 67 -> 7 (pouze ne AI)
if [ $COUNT_67 -gt 0 ]; then
    echo "   Subject 67 (user) -> 7 ($COUNT_67 položek)..."
    
    ITEMS_67=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND (attribute_not_exists(#src) OR #src <> :src)" --expression-attribute-values '{":sid":{"N":"67"},":src":{"S":"ai"}}' --expression-attribute-names '{"#src":"source"}' --projection-expression "questionId" --region $REGION --query "Items[*].questionId.S" --output text)
    
    UPDATED_67=0
    for question_id in $ITEMS_67; do
        aws dynamodb update-item \
            --table-name $TABLE_NAME \
            --key "{\"questionId\":{\"S\":\"$question_id\"}}" \
            --update-expression "SET subjectId = :newSubjectId, updatedAt = :updatedAt" \
            --expression-attribute-values '{":newSubjectId":{"N":"7"},":updatedAt":{"S":"'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'"}}' \
            --region $REGION \
            >/dev/null 2>&1
        
        UPDATED_67=$((UPDATED_67 + 1))
        if [ $((UPDATED_67 % 25)) -eq 0 ]; then
            echo "     Provedeno $UPDATED_67/$COUNT_67..."
        fi
    done
    
    echo "   ✅ Subject 67 (user) -> 7 dokončen ($UPDATED_67 položek)"
fi

# 78 -> 8 (pouze ne AI)
if [ $COUNT_78 -gt 0 ]; then
    echo "   Subject 78 (user) -> 8 ($COUNT_78 položek)..."
    
    ITEMS_78=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND (attribute_not_exists(#src) OR #src <> :src)" --expression-attribute-values '{":sid":{"N":"78"},":src":{"S":"ai"}}' --expression-attribute-names '{"#src":"source"}' --projection-expression "questionId" --region $REGION --query "Items[*].questionId.S" --output text)
    
    UPDATED_78=0
    for question_id in $ITEMS_78; do
        aws dynamodb update-item \
            --table-name $TABLE_NAME \
            --key "{\"questionId\":{\"S\":\"$question_id\"}}" \
            --update-expression "SET subjectId = :newSubjectId, updatedAt = :updatedAt" \
            --expression-attribute-values '{":newSubjectId":{"N":"8"},":updatedAt":{"S":"'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'"}}' \
            --region $REGION \
            >/dev/null 2>&1
        
        UPDATED_78=$((UPDATED_78 + 1))
        if [ $((UPDATED_78 % 25)) -eq 0 ]; then
            echo "     Provedeno $UPDATED_78/$COUNT_78..."
        fi
    done
    
    echo "   ✅ Subject 78 (user) -> 8 dokončen ($UPDATED_78 položek)"
fi

# 86 -> 6 (pouze ne AI)
if [ $COUNT_86 -gt 0 ]; then
    echo "   Subject 86 (user) -> 6 ($COUNT_86 položek)..."
    
    ITEMS_86=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND (attribute_not_exists(#src) OR #src <> :src)" --expression-attribute-values '{":sid":{"N":"86"},":src":{"S":"ai"}}' --expression-attribute-names '{"#src":"source"}' --projection-expression "questionId" --region $REGION --query "Items[*].questionId.S" --output text)
    
    UPDATED_86=0
    for question_id in $ITEMS_86; do
        aws dynamodb update-item \
            --table-name $TABLE_NAME \
            --key "{\"questionId\":{\"S\":\"$question_id\"}}" \
            --update-expression "SET subjectId = :newSubjectId, updatedAt = :updatedAt" \
            --expression-attribute-values '{":newSubjectId":{"N":"6"},":updatedAt":{"S":"'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'"}}' \
            --region $REGION \
            >/dev/null 2>&1
        
        UPDATED_86=$((UPDATED_86 + 1))
        if [ $((UPDATED_86 % 25)) -eq 0 ]; then
            echo "     Provedeno $UPDATED_86/$COUNT_86..."
        fi
    done
    
    echo "   ✅ Subject 86 (user) -> 6 dokončen ($UPDATED_86 položek)"
fi

STEP2_TOTAL=$((UPDATED_67 + UPDATED_78 + UPDATED_86))
echo ""
echo "✅ Krok 2 dokončen! Aktualizováno: $STEP2_TOTAL uživatelských položek"

# 5. Finální kontrola
echo ""
echo "🔍 FINÁLNÍ KONTROLA:"
sleep 2

FINAL_COUNT_6_USER=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND (attribute_not_exists(#src) OR #src <> :src)" --expression-attribute-values '{":sid":{"N":"6"},":src":{"S":"ai"}}' --expression-attribute-names '{"#src":"source"}' --region $REGION --query "Count" --output text 2>/dev/null || echo "0")
FINAL_COUNT_7_USER=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND (attribute_not_exists(#src) OR #src <> :src)" --expression-attribute-values '{":sid":{"N":"7"},":src":{"S":"ai"}}' --expression-attribute-names '{"#src":"source"}' --region $REGION --query "Count" --output text 2>/dev/null || echo "0")
FINAL_COUNT_8_USER=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND (attribute_not_exists(#src) OR #src <> :src)" --expression-attribute-values '{":sid":{"N":"8"},":src":{"S":"ai"}}' --expression-attribute-names '{"#src":"source"}' --region $REGION --query "Count" --output text 2>/dev/null || echo "0")

# Kontrola AI otázek (měly zůstat nezměněné)
FINAL_COUNT_6_AI=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND #src = :src" --expression-attribute-values '{":sid":{"N":"6"},":src":{"S":"ai"}}' --expression-attribute-names '{"#src":"source"}' --region $REGION --query "Count" --output text 2>/dev/null || echo "0")
FINAL_COUNT_7_AI=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND #src = :src" --expression-attribute-values '{":sid":{"N":"7"},":src":{"S":"ai"}}' --expression-attribute-names '{"#src":"source"}' --region $REGION --query "Count" --output text 2>/dev/null || echo "0")
FINAL_COUNT_8_AI=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND #src = :src" --expression-attribute-values '{":sid":{"N":"8"},":src":{"S":"ai"}}' --expression-attribute-names '{"#src":"source"}' --region $REGION --query "Count" --output text 2>/dev/null || echo "0")

echo ""
echo "📊 FINÁLNÍ ROZDĚLENÍ UŽIVATELSKÝCH OTÁZEK:"
echo "   Subject 6 (user): $FINAL_COUNT_6_USER položek (původní 8 user: $COUNT_8)"
echo "   Subject 7 (user): $FINAL_COUNT_7_USER položek (původní 6 user: $COUNT_6)"
echo "   Subject 8 (user): $FINAL_COUNT_8_USER položek (původní 7 user: $COUNT_7)"

echo ""
echo "📊 FINÁLNÍ ROZDĚLENÍ AI OTÁZEK (měly zůstat nezměněné):"
echo "   Subject 6 (ai): $FINAL_COUNT_6_AI položek"
echo "   Subject 7 (ai): $FINAL_COUNT_7_AI položek"
echo "   Subject 8 (ai): $FINAL_COUNT_8_AI položek"

echo ""
echo "🎉 OPERACE DOKONČENA!"
echo "✅ Celkem aktualizováno uživatelských otázek: $((STEP1_TOTAL + STEP2_TOTAL))"

# 6. Validace
if [ "$FINAL_COUNT_7_USER" = "$COUNT_6" ] && [ "$FINAL_COUNT_8_USER" = "$COUNT_7" ] && [ "$FINAL_COUNT_6_USER" = "$COUNT_8" ]; then
    echo ""
    echo "✅ VŠE V POŘÁDKU! Mapování uživatelských otázek je správné."
    echo "✅ AI otázky zůstaly nezměněny."
else
    echo ""
    echo "⚠️  POZOR! Něco není v pořádku s mapováním uživatelských otázek."
fi
