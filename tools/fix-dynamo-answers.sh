#!/usr/bin/env bash
#
# Oprava správných odpovědí v DynamoDB tabulce aeropilot-questions.
# Čte answer_fix_log_*.json a pro každou opravu volá aws dynamodb update-item.
#
# Použití:
#   ./tools/fix-dynamo-answers.sh                  # dry-run (jen výpis)
#   ./tools/fix-dynamo-answers.sh --execute        # provede update
#   ./tools/fix-dynamo-answers.sh --verify         # ověří aktuální stav v DB
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TABLE_NAME="aeropilot-questions"
REGION="eu-central-1"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
OPTION_KEYS=("A" "B" "C" "D")

# Find the fix log
FIX_LOG="$(ls -t "$PROJECT_DIR"/answer_fix_log_*.json 2>/dev/null | head -1)"
if [[ -z "$FIX_LOG" ]]; then
    echo "ERROR: answer_fix_log_*.json not found in $PROJECT_DIR"
    exit 1
fi

echo "Fix log: $(basename "$FIX_LOG")"
TOTAL=$(python3 -c "import json; print(json.load(open('$FIX_LOG'))['total_fixes'])")
echo "Total fixes: $TOTAL"
echo "Table: $TABLE_NAME"
echo "Region: $REGION"
echo ""

MODE="${1:---dry-run}"

if [[ "$MODE" == "--verify" ]]; then
    echo "=== VERIFY MODE: checking current DB values ==="
    echo ""
    WRONG=0
    OK=0
    MISSING=0

    python3 -c "
import json, sys
fixes = json.load(open('$FIX_LOG'))['fixes']
for f in fixes:
    print(f\"{f['questionId']} {f['new_correct']}\")
" | while read -r QID NEW_CORRECT; do
        RESULT=$(aws dynamodb get-item \
            --table-name "$TABLE_NAME" \
            --region "$REGION" \
            --key "{\"questionId\":{\"S\":\"$QID\"}}" \
            --projection-expression "correct,correctOption" \
            --output json 2>/dev/null || echo "ERROR")

        if [[ "$RESULT" == "ERROR" ]] || [[ -z "$RESULT" ]] || ! echo "$RESULT" | python3 -c "import sys,json; json.load(sys.stdin)['Item']" 2>/dev/null; then
            echo "  MISSING: $QID"
            MISSING=$((MISSING + 1))
        else
            DB_CORRECT=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['Item']['correct']['N'])")
            EXPECTED_OPTION="${OPTION_KEYS[$NEW_CORRECT]}"
            if [[ "$DB_CORRECT" == "$NEW_CORRECT" ]]; then
                OK=$((OK + 1))
            else
                echo "  WRONG: $QID  db=$DB_CORRECT expected=$NEW_CORRECT"
                WRONG=$((WRONG + 1))
            fi
        fi
    done

    echo ""
    echo "Done. OK=$OK WRONG=$WRONG MISSING=$MISSING"
    exit 0
fi

if [[ "$MODE" == "--execute" ]]; then
    echo "=== EXECUTE MODE: updating DynamoDB ==="
    echo ""
else
    echo "=== DRY-RUN MODE (use --execute to apply changes) ==="
    echo ""
fi

SUCCESS=0
FAIL=0

python3 -c "
import json
fixes = json.load(open('$FIX_LOG'))['fixes']
for f in fixes:
    print(f\"{f['questionId']} {f['new_correct']} {f['old_correct']}\")
" | while read -r QID NEW_CORRECT OLD_CORRECT; do
    OPTION="${OPTION_KEYS[$NEW_CORRECT]}"

    if [[ "$MODE" == "--execute" ]]; then
        RESULT=$(aws dynamodb update-item \
            --table-name "$TABLE_NAME" \
            --region "$REGION" \
            --key "{\"questionId\":{\"S\":\"$QID\"}}" \
            --update-expression "SET correct = :c, correctOption = :co, updatedAt = :ts" \
            --expression-attribute-values "{\":c\":{\"N\":\"$NEW_CORRECT\"},\":co\":{\"S\":\"$OPTION\"},\":ts\":{\"S\":\"$TIMESTAMP\"}}" \
            --return-values UPDATED_NEW \
            2>&1) && {
                echo "  OK: $QID  [$OLD_CORRECT] -> [$NEW_CORRECT] ($OPTION)"
                SUCCESS=$((SUCCESS + 1))
            } || {
                echo "  FAIL: $QID  $RESULT"
                FAIL=$((FAIL + 1))
            }
    else
        echo "  [DRY] $QID  [$OLD_CORRECT] -> [$NEW_CORRECT] ($OPTION)"
        SUCCESS=$((SUCCESS + 1))
    fi
done

echo ""
echo "Done. Success=$SUCCESS Failed=$FAIL"
