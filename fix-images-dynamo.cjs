const { DynamoDBClient, ScanCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const fs = require('fs');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const TABLE_NAME = 'aeropilot-questions';

async function updateImages() {
  try {
    const data = JSON.parse(fs.readFileSync('subject_7.json', 'utf8'));
    let count = 0;
    
    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        if (item.image) {
            const questionId = `user_7_${String(i + 1).padStart(3, '0')}`;
            
            const command = new UpdateItemCommand({
                TableName: TABLE_NAME,
                Key: { 'questionId': { S: questionId } },
                UpdateExpression: 'SET image = :img',
                ExpressionAttributeValues: {
                    ':img': { S: item.image }
                }
            });
            
            await client.send(command);
            console.log(`Updated ${questionId} with image ${item.image}`);
            count++;
        }
    }
    console.log(`Finished updating ${count} images in DynamoDB.`);
  } catch (err) {
    console.error(err);
  }
}

updateImages();
