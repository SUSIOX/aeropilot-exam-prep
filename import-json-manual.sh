#!/bin/bash

# Ruční import JSON souborů pomocí put-item
# Subject 6: 60 otázek, Subject 7: 103 otázek, Subject 8: 127 otázek

set -e

TABLE_NAME="aeropilot-questions"
REGION="eu-central-1"

echo "=== Ruční import JSON souborů ==="
echo ""

import_subject() {
    local subject_id=$1
    local json_file=$2
    
    echo "📥 Importuji $json_file -> Subject $subject_id..."
    
    local count=$(jq length "$json_file")
    echo "   Počet otázek: $count"
    
    local imported=0
    
    for i in $(seq 0 $((count - 1))); do
        local item=$(jq -r ".[$i]" "$json_file")
        local original_id=$(echo "$item" | jq -r '.id')
        local question_id="subject${subject_id}_q${original_id}"
        local question=$(echo "$item" | jq -r '.question')
        local answers=$(echo "$item" | jq -r '.answers | tojson')
        local correct=$(echo "$item" | jq -r '.correct')
        local explanation=$(echo "$item" | jq -r '.explanation // ""')
        
        aws dynamodb put-item \
            --table-name $TABLE_NAME \
            --item "{
                \"questionId\": {\"S\": \"$question_id\"},
                \"originalId\": {\"N\": \"$original_id\"},
                \"question\": {\"S\": $question},
                \"answers\": {\"L\": $answers},
                \"correct\": {\"N\": \"$correct\"},
                \"subjectId\": {\"N\": \"$subject_id\"},
                \"source\": {\"S\": \"user\"},
                \"explanation\": {\"S\": \"$explanation\"},
                \"createdAt\": {\"S\": \"$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")\"}
            }" \
            --region $REGION \
            >/dev/null 2>&1
        
        imported=$((imported + 1))
        if [ $((imported % 10)) -eq 0 ]; then
            echo "   Importováno $imported/$count..."
        fi
    done
    
    echo "   ✅ Dokončeno: $imported otázek importováno"
}

# Import všech subjectů
import_subject 6 subject_6.json
import_subject 7 subject_7.json
import_subject 8 subject_8.json

echo ""
echo "🔍 Finální kontrola:"
for sid in 6 7 8; do
    count=$(aws dynamodb scan --table-name $TABLE_NAME --filter-expression "subjectId = :sid AND (attribute_not_exists(#src) OR #src <> :src)" --expression-attribute-values "{\":sid\":{\"N\":\"$sid\"},\":src\":{\"S\":\"ai\"}}" --expression-attribute-names '{"#src":"source"}' --region $REGION --query "Count" --output json)
    echo "   Subject $sid: $count uživatelských otázek"
done

echo ""
echo "🎉 Import dokončen!"
