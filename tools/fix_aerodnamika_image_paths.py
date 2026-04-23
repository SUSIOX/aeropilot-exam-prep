#!/usr/bin/env python3
"""
Opraví cesty k obrázkům pro aerodnamika otázky.
Z "images/aerodnamika/xxx.png" -> "aerodnamika_xxx.png"
"""
import boto3
from datetime import datetime, timezone

REGION = 'eu-central-1'
TABLE_NAME = 'aeropilot-questions'

dynamodb = boto3.resource('dynamodb', region_name=REGION)
table = dynamodb.Table(TABLE_NAME)

print("Načítám aerodnamika otázky z DynamoDB...")

# Načti všechny otázky s image obsahujícím "aerodnamika"
items = []
resp = table.scan(
    FilterExpression=boto3.dynamodb.conditions.Attr('image').contains('aerodnamika'),
    ProjectionExpression='questionId, image'
)
items.extend(resp['Items'])
while 'LastEvaluatedKey' in resp:
    resp = table.scan(
        FilterExpression=boto3.dynamodb.conditions.Attr('image').contains('aerodnamika'),
        ProjectionExpression='questionId, image',
        ExclusiveStartKey=resp['LastEvaluatedKey']
    )
    items.extend(resp['Items'])

print(f"Nalezeno {len(items)} otázek s aerodnamika obrázkem")

now = datetime.now(timezone.utc).isoformat()
updated = 0
skipped = 0

for item in items:
    qid = item['questionId']
    current_image = item.get('image', '')

    # Oprav cestu: "images/aerodnamika/aerodnamika_xxx.png" -> "aerodnamika_xxx.png"
    if current_image.startswith('images/aerodnamika/'):
        new_image = current_image.replace('images/aerodnamika/', '')

        table.update_item(
            Key={'questionId': qid},
            UpdateExpression='SET image = :img, updatedAt = :ts',
            ExpressionAttributeValues={':img': new_image, ':ts': now}
        )
        print(f"  ✅ {qid}: {current_image} -> {new_image}")
        updated += 1
    else:
        print(f"  ⏭️  {qid}: {current_image} (bez změny)")
        skipped += 1

print(f"\n=== VÝSLEDEK ===")
print(f"Aktualizováno: {updated}")
print(f"Přeskočeno: {skipped}")
