import boto3
from datetime import datetime, timezone

# Připojení k DynamoDB
dynamodb = boto3.client('dynamodb', region_name='eu-central-1')

# Správný formát data
correct_time = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%3f')[:-3] + 'Z'

print(f"Opravuji updatedAt na: {correct_time}")

# Scan user otázek v Subject 7
response = dynamodb.scan(
    TableName='aeropilot-questions',
    FilterExpression='subjectId = :sid AND (attribute_not_exists(#src) OR #src <> :src)',
    ExpressionAttributeValues={':sid': {'N': '7'}, ':src': {'S': 'ai'}},
    ExpressionAttributeNames={'#src': 'source'},
    ProjectionExpression='questionId'
)

print(f"Nalezeno {len(response['Items'])} user otázek k opravě")

# Hromadný update
updated = 0
for item in response['Items']:
    question_id = item['questionId']['S']
    
    dynamodb.update_item(
        TableName='aeropilot-questions',
        Key={'questionId': {'S': question_id}},
        UpdateExpression='SET updatedAt = :newTime',
        ExpressionAttributeValues={':newTime': {'S': correct_time}}
    )
    
    updated += 1
    if updated % 10 == 0:
        print(f"Opraveno {updated}/{len(response['Items'])}...")

print(f"✅ Dokončeno! Opraveno {updated} otázek")
