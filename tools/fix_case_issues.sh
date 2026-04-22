#!/bin/bash
# Oprava case-sensitivity problémů v DynamoDB

TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
TABLE_NAME="aeropilot-questions"
REGION="eu-central-1"

echo 'Fixing user_7_026: PFP-052E.jpg -> PFP-052e.jpg'
aws dynamodb update-item \
  --table-name "$TABLE_NAME" \
  --region "$REGION" \
  --key '{"questionId":{"S":"user_7_026"}}' \
  --update-expression 'SET #img = :image, updatedAt = :ts' \
  --expression-attribute-names '{"#img":"image"}' \
  --expression-attribute-values '{":image":{"S":"PFP-052e.jpg"}, ":ts":{"S":"$TIMESTAMP"}}' \
  --return-values UPDATED_NEW

echo 'Fixing user_7_085: PFP-051A.jpg -> PFP-051a.jpg'
aws dynamodb update-item \
  --table-name "$TABLE_NAME" \
  --region "$REGION" \
  --key '{"questionId":{"S":"user_7_085"}}' \
  --update-expression 'SET #img = :image, updatedAt = :ts' \
  --expression-attribute-names '{"#img":"image"}' \
  --expression-attribute-values '{":image":{"S":"PFP-051a.jpg"}, ":ts":{"S":"$TIMESTAMP"}}' \
  --return-values UPDATED_NEW

echo 'Fixing user_7_031: PFP-053E.jpg -> PFP-053e.jpg'
aws dynamodb update-item \
  --table-name "$TABLE_NAME" \
  --region "$REGION" \
  --key '{"questionId":{"S":"user_7_031"}}' \
  --update-expression 'SET #img = :image, updatedAt = :ts' \
  --expression-attribute-names '{"#img":"image"}' \
  --expression-attribute-values '{":image":{"S":"PFP-053e.jpg"}, ":ts":{"S":"$TIMESTAMP"}}' \
  --return-values UPDATED_NEW
