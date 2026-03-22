import boto3
from datetime import datetime, timezone

# Připojení k DynamoDB
dynamodb = boto3.client('dynamodb', region_name='eu-central-1')

print("=== DOKONČENÍ PŘESUNU KATEGORIÍ ===")

# 1. Najdi původní otázky z Subject 7 (které mají ID user_7_*)
print("1. Hledám původní otázky z Subject 7...")

response = dynamodb.scan(
    TableName='aeropilot-questions',
    FilterExpression='subjectId = :sid AND begins_with(questionId, :prefix)',
    ExpressionAttributeValues={':sid': {'N': '7'}, ':prefix': {'S': 'user_7_'}},
    ProjectionExpression='questionId'
)

original_7_questions = [item['questionId']['S'] for item in response['Items']]
print(f"Nalezeno {len(original_7_questions)} původních otázek z Subject 7")

# 2. Přesun je do Subject 8
print(f"2. Přesouvám {len(original_7_questions)} otázek z Subject 7 → Subject 8...")

correct_time = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%3f')[:-3] + 'Z'

moved = 0
for question_id in original_7_questions:
    dynamodb.update_item(
        TableName='aeropilot-questions',
        Key={'questionId': {'S': question_id}},
        UpdateExpression='SET subjectId = :newSid, updatedAt = :newTime',
        ExpressionAttributeValues={
            ':newSid': {'N': '8'},
            ':newTime': {'S': correct_time}
        }
    )
    moved += 1
    if moved % 5 == 0:
        print(f"   Přesunuto {moved}/{len(original_7_questions)}...")

print(f"✅ Subject 7→8 dokončen! Přesunuto {moved} otázek")

# 3. Najdi původní otázky z Subject 8 (které mají ID subject8_q*)
print("\n3. Hledám původní otázky z Subject 8...")

response = dynamodb.scan(
    TableName='aeropilot-questions',
    FilterExpression='subjectId = :sid AND begins_with(questionId, :prefix)',
    ExpressionAttributeValues={':sid': {'N': '8'}, ':prefix': {'S': 'subject8_q'}},
    ProjectionExpression='questionId'
)

original_8_questions = [item['questionId']['S'] for item in response['Items']]
print(f"Nalezeno {len(original_8_questions)} původních otázek z Subject 8")

# 4. Přesun je do Subject 6
print(f"4. Přesouvám {len(original_8_questions)} otázek z Subject 8 → Subject 6...")

moved = 0
for question_id in original_8_questions:
    dynamodb.update_item(
        TableName='aeropilot-questions',
        Key={'questionId': {'S': question_id}},
        UpdateExpression='SET subjectId = :newSid, updatedAt = :newTime',
        ExpressionAttributeValues={
            ':newSid': {'N': '6'},
            ':newTime': {'S': correct_time}
        }
    )
    moved += 1
    if moved % 5 == 0:
        print(f"   Přesunuto {moved}/{len(original_8_questions)}...")

print(f"✅ Subject 8→6 dokončen! Přesunuto {moved} otázek")

# 5. Finální kontrola
print("\n5. Finální kontrola:")
subjects = [6, 7, 8]
for sid in subjects:
    # User otázky
    user_response = dynamodb.scan(
        TableName='aeropilot-questions',
        FilterExpression='subjectId = :sid AND (attribute_not_exists(#src) OR #src <> :src)',
        ExpressionAttributeValues={':sid': {'N': str(sid)}, ':src': {'S': 'ai'}},
        ExpressionAttributeNames={'#src': 'source'},
        Select='COUNT'
    )
    
    # AI otázky
    ai_response = dynamodb.scan(
        TableName='aeropilot-questions',
        FilterExpression='subjectId = :sid AND #src = :src',
        ExpressionAttributeValues={':sid': {'N': str(sid)}, ':src': {'S': 'ai'}},
        ExpressionAttributeNames={'#src': 'source'},
        Select='COUNT'
    )
    
    user_count = user_response['Count']
    ai_count = ai_response['Count']
    total_count = user_count + ai_count
    
    print(f"   Subject {sid}: {total_count} celkem ({user_count} user + {ai_count} ai)")

print("\n🎉 PŘESUN KATEGORIÍ DOKONČEN!")
