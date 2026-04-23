#!/usr/bin/env python3
"""Zobrazí aktuální stav obrázků pro subject5 otázky přímo z DynamoDB."""
import boto3

dynamodb = boto3.resource('dynamodb', region_name='eu-central-1')
table = dynamodb.Table('aeropilot-questions')

# Batch-get all subject5_q1 .. subject5_q120
keys = [{'questionId': f'subject5_q{i}'} for i in range(1, 121)]
results = []

# batch_get_item max 100 keys at a time
for chunk_start in range(0, len(keys), 100):
    chunk = keys[chunk_start:chunk_start+100]
    resp = dynamodb.batch_get_item(
        RequestItems={'aeropilot-questions': {'Keys': chunk, 'ProjectionExpression': 'questionId, image, question'}}
    )
    results.extend(resp['Responses'].get('aeropilot-questions', []))

results.sort(key=lambda x: int(x['questionId'].replace('subject5_q', '')))

print(f"Nacteno: {len(results)} otazek\n")
print(f"{'questionId':<20} {'image':<45} question[:60]")
print("-" * 130)
for i in results:
    img = i.get('image') or 'BEZ OBRAZKU'
    q = i.get('question', '')[:60]
    print(f"{i['questionId']:<20} {img:<45} {q}")
