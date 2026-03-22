#!/bin/bash
# Jednoduchý AWS CLI script pro smazání admin123 klíčů

TABLE="aeropilot-users"  # Správný název tabulky

echo "🔍 Hledám admin123 DeepSeek klíče..."

# Najdi všechny s DeepSeek klíčem
aws dynamodb scan \
  --table-name $TABLE \
  --filter-expression "attribute_exists(settings.deepseekApiKey)" \
  --projection-expression "userId, settings.deepseekApiKey" \
  --query 'Items[?settings.deepseekApiKey == `admin123` || settings.deepseekApiKey == `test` || settings.deepseekApiKey == `demo`].userId' \
  --output text | while read USER_ID; do
    
    if [ -n "$USER_ID" ]; then
        echo "🧹 Mažu admin123 od uživatele: $USER_ID"
        
        aws dynamodb update-item \
          --table-name $TABLE \
          --key "{\"userId\": {\"S\": \"$USER_ID\"}}" \
          --update-expression "REMOVE settings.deepseekApiKey SET updatedAt = :updatedAt" \
          --expression-attribute-values "{\":updatedAt\": {\"S\": \"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\"}}"
        
        echo "✅ Hotovo: $USER_ID"
    fi
done

echo "🎉 Všechny admin123 klíče smazány!"
