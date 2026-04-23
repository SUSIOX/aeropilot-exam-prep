#!/usr/bin/env python3
"""
Aktualizuje otázku aerodnamika_q74 (a q73) na S3 URL obrázku.
"""
import boto3
from datetime import datetime, timezone

REGION = 'eu-central-1'
TABLE_NAME = 'aeropilot-questions'

dynamodb = boto3.resource('dynamodb', region_name=REGION)
table = dynamodb.Table(TABLE_NAME)

# Mapování otázek na S3 URL
updates = [
    {
        'questionId': 'aerodnamika_q74',
        'image': 'aerodnamika_polara_aero_body1.png',
        's3_url': 'https://aeropilotexam.s3.eu-central-1.amazonaws.com/questions/aerodnamika_polara_aero_body1.png'
    },
    {
        'questionId': 'aerodnamika_q73',
        'image': 'aerodnamika_polara_aero_body1.png',  # stejný obrázek
        's3_url': 'https://aeropilotexam.s3.eu-central-1.amazonaws.com/questions/aerodnamika_polara_aero_body1.png'
    }
]

now = datetime.now(timezone.utc).isoformat()

print("Aktualizuji S3 URL pro aerodnamika otázky...")
for update in updates:
    qid = update['questionId']
    s3_url = update['s3_url']

    table.update_item(
        Key={'questionId': qid},
        UpdateExpression='SET image = :img, updatedAt = :ts',
        ExpressionAttributeValues={':img': s3_url, ':ts': now}
    )
    print(f"  ✅ {qid}: {s3_url}")

print("\n✅ Hotovo!")
