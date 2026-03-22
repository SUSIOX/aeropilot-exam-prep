#!/bin/bash

# Clear admin123 DeepSeek keys using AWS CLI
# Spustte: chmod +x aws-clear-admin123.sh && ./aws-clear-admin123.sh

echo "🔍 Hledám admin123 DeepSeek klíče..."

# Název tabulky - upravte pokud máte jiný
TABLE_NAME="aeropilot-exam-prep-USERS"

# Scan pro nalezení všech uživatelů s DeepSeek klíči
echo "📊 Scanuji tabulku $TABLE_NAME..."
USERS=$(aws dynamodb scan \
  --table-name $TABLE_NAME \
  --filter-expression "attribute_exists(settings.deepseekApiKey)" \
  --projection-expression "userId, settings.deepseekApiKey" \
  --output json)

if [ $? -ne 0 ]; then
    echo "❌ Chyba při scanu tabulky"
    exit 1
fi

# Počet nalezených uživatelů
COUNT=$(echo "$USERS" | jq '.Items | length')
echo "Našel $COUNT uživatelů s DeepSeek klíči"

# Projdeme všechny uživatele
CLEANED=0
echo "$USERS" | jq -c '.Items[]' | while read -r user; do
    USER_ID=$(echo "$user" | jq -r '.userId')
    DEEPSEEK_KEY=$(echo "$user" | jq -r '.settings.deepseekApiKey // "null"')
    
    echo "Uživatel $USER_ID: \"$DEEPSEEK_KEY\""
    
    # Smažeme jen testovací klíče
    if [ "$DEEPSEEK_KEY" = "admin123" ] || [ "$DEEPSEEK_KEY" = "test" ] || [ "$DEEPSEEK_KEY" = "demo" ]; then
        echo "🧹 Mažu test klíč: $DEEPSEEK_KEY"
        
        aws dynamodb update-item \
          --table-name $TABLE_NAME \
          --key "{\"userId\": {\"S\": \"$USER_ID\"}}" \
          --update-expression "REMOVE settings.deepseekApiKey SET updatedAt = :updatedAt" \
          --expression-attribute-values "{\":updatedAt\": {\"S\": \"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\"}}" \
          --output json
        
        if [ $? -eq 0 ]; then
            echo "✅ Vyčištěno: $USER_ID"
            CLEANED=$((CLEANED + 1))
        else
            echo "❌ Chyba při mazání: $USER_ID"
        fi
    else
        echo "⚠️ Zachovávám reálný klíč: ${DEEPSEEK_KEY:0:10}..."
    fi
done

echo "🎉 Hotovo! Vyčištěno $CLEANED testovacích klíčů"
