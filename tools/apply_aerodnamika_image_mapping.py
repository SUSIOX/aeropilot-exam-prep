#!/usr/bin/env python3
"""
Aplikuje mapování obrázků z work/aerodnamika_images/image_mapping.json
na DynamoDB otázky podle originalId.
"""
import boto3
import json
from datetime import datetime, timezone
from pathlib import Path

REGION = 'eu-central-1'
TABLE_NAME = 'aeropilot-questions'
MAPPING_FILE = Path(__file__).parent.parent / 'work' / 'aerodnamika_images' / 'image_mapping.json'

dynamodb = boto3.resource('dynamodb', region_name=REGION)
table = dynamodb.Table(TABLE_NAME)

# Načti mapování originalId -> image
with open(MAPPING_FILE) as f:
    mapping = json.load(f)['question_to_image']

print(f"Načteno {len(mapping)} mapování z {MAPPING_FILE}")

# Načti všechny subject5 otázky (originalId je číslo)
print("Skenuji DynamoDB pro subject5 otázky...")
items = []
resp = table.scan(
    FilterExpression=boto3.dynamodb.conditions.Attr('subjectId').eq(5),
    ProjectionExpression='questionId, originalId, image'
)
items.extend(resp['Items'])
while 'LastEvaluatedKey' in resp:
    resp = table.scan(
        FilterExpression=boto3.dynamodb.conditions.Attr('subjectId').eq(5),
        ProjectionExpression='questionId, originalId, image',
        ExclusiveStartKey=resp['LastEvaluatedKey']
    )
    items.extend(resp['Items'])

print(f"Nalezeno {len(items)} subject5 otázek")

# Vytvoř slovník originalId -> questionId
orig_to_qid = {}
for item in items:
    orig_id = item.get('originalId')
    if orig_id is not None:
        orig_to_qid[str(int(orig_id))] = item['questionId']

now = datetime.now(timezone.utc).isoformat()
updated = 0
skipped = 0
not_found = 0

print("\nAplikuji mapování...")
for orig_id, image_file in sorted(mapping.items(), key=lambda x: int(x[0])):
    qid = orig_to_qid.get(str(orig_id))
    if not qid:
        print(f"  ⚠️  originalId={orig_id} -> nenalezeno v DynamoDB")
        not_found += 1
        continue

    # Najdi aktuální image
    current = next((i.get('image') for i in items if i['questionId'] == qid), None)
    if current == image_file:
        skipped += 1
        continue

    table.update_item(
        Key={'questionId': qid},
        UpdateExpression='SET image = :img, updatedAt = :ts',
        ExpressionAttributeValues={':img': image_file, ':ts': now}
    )
    print(f"  ✅ {qid} (orig={orig_id}): {image_file}")
    updated += 1

print(f"\n=== VÝSLEDEK ===")
print(f"Aktualizováno: {updated}")
print(f"Přeskočeno (stejné): {skipped}")
print(f"Nenalezeno: {not_found}")
