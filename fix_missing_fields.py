import boto3

# Připojení k DynamoDB
dynamodb = boto3.client('dynamodb', region_name='eu-central-1')

print("=== OPRAVA CHYBĚJÍCÍCH POLÍ V USER OTÁZKÁCH ===")

# Najdi všechny user otázky
print("Hledám všechny user otázky...")

all_questions = []
last_evaluated_key = None

while True:
    scan_kwargs = {
        'TableName': 'aeropilot-questions',
        'FilterExpression': 'attribute_not_exists(#src) OR #src <> :src',
        'ExpressionAttributeValues': {':src': {'S': 'ai'}},
        'ExpressionAttributeNames': {'#src': 'source'},
        'ProjectionExpression': 'questionId'
    }
    
    if last_evaluated_key:
        scan_kwargs['ExclusiveStartKey'] = last_evaluated_key
    
    response = dynamodb.scan(**scan_kwargs)
    all_questions.extend(response['Items'])
    
    last_evaluated_key = response.get('LastEvaluatedKey')
    if not last_evaluated_key:
        break

print(f"Nalezeno {len(all_questions)} user otázek k kontrole")

# Kontrola a oprava chybějících polí
fixed = 0
for i, item in enumerate(all_questions):
    question_id = item['questionId']['S']
    
    # Zkontroluj aktuální položku
    current_item = dynamodb.get_item(
        TableName='aeropilot-questions',
        Key={'questionId': {'S': question_id}}
    )['Item']
    
    needs_update = False
    update_expression = "SET "
    expression_values = {}
    
    # Přidej chybějící pole 'image' (null)
    if 'image' not in current_item:
        needs_update = True
        update_expression += "image = :image, "
        expression_values[':image'] = {'NULL': True}
        print(f"Otázka {question_id}: chybí pole 'image'")
    
    # Přidej chybějící pole 'id' (použij číslo z questionId)
    if 'id' not in current_item:
        needs_update = True
        # Extrahuj číslo z questionId (např. subject6_q23 -> 23)
        import re
        match = re.search(r'q(\d+)$', question_id)
        if match:
            id_num = int(match.group(1))
            update_expression += "id = :id, "
            expression_values[':id'] = {'N': str(id_num)}
            print(f"Otázka {question_id}: chybí pole 'id' -> {id_num}")
    
    if needs_update:
        # Odstraň poslední čárku a mezery
        update_expression = update_expression.rstrip(', ')
        
        dynamodb.update_item(
            TableName='aeropilot-questions',
            Key={'questionId': {'S': question_id}},
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_values
        )
        fixed += 1
        print(f"  ✅ Opraveno: {question_id}")
    
    if (i + 1) % 50 == 0:
        print(f"Zkontrolováno {i + 1}/{len(all_questions)}...")

print(f"\n🎉 DOKONČENO! Opraveno {fixed} otázek")

# Finální kontrola jedné opravené otázky
sample_question = dynamodb.get_item(
    TableName='aeropilot-questions',
    Key={'questionId': {'S': 'subject6_q23'}}
)['Item']

print(f"\n📋 Ukázka opravené otázky:")
for key in sorted(sample_question.keys()):
    value = sample_question[key]
    if 'S' in value:
        print(f"  {key}: \"{value['S'][:50]}{'...' if len(value['S']) > 50 else ''}\"")
    elif 'N' in value:
        print(f"  {key}: {value['N']}")
    elif 'NULL' in value:
        print(f"  {key}: null")
    elif 'L' in value:
        print(f"  {key}: [{len(value['L'])} answers]")
    else:
        print(f"  {key}: {type(value).__name__}")
