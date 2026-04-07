const { DynamoDBClient, ScanCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const TABLE_NAME = 'aeropilot-questions';

async function fixImagesByText() {
    let lastEvaluatedKey = undefined;
    let count = 0;

    do {
        const scanCmd = new ScanCommand({
            TableName: TABLE_NAME,
            ExclusiveStartKey: lastEvaluatedKey
        });

        const response = await client.send(scanCmd);
        
        for (const item of response.Items) {
            const text = item.question?.S || '';
            const match = text.match(/(PFP-\d+[a-z]?)/i);
            
            if (match) {
                const imageName = match[1].toUpperCase() + '.jpg';
                const currentImage = item.image?.S;

                if (currentImage !== imageName) {
                    const updateCmd = new UpdateItemCommand({
                        TableName: TABLE_NAME,
                        Key: { 'questionId': item.questionId },
                        UpdateExpression: 'SET image = :img',
                        ExpressionAttributeValues: {
                            ':img': { S: imageName }
                        }
                    });

                    try {
                        await client.send(updateCmd);
                        console.log(`Updated ${item.questionId.S} with image ${imageName}`);
                        count++;
                    } catch (err) {
                        console.error(`Failed to update ${item.questionId.S}:`, err);
                    }
                }
            }
        }
        
        lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`Finished updating ${count} items based on text matching.`);
}

fixImagesByText().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
