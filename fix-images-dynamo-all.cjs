const { DynamoDBClient, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const fs = require('fs');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const TABLE_NAME = 'aeropilot-questions';

async function updateAllSubjectsImages() {
  const subjects = [6, 7, 8]; // user generated ones typically? Wait, the user has 1 to 9.
  const allSubjects = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  
  for (const sub of allSubjects) {
     const fileName = `subject_${sub}.json`;
     if (!fs.existsSync(fileName)) continue;

     const data = JSON.parse(fs.readFileSync(fileName, 'utf8'));
     let c = 0;
     for (let i = 0; i < data.length; i++) {
        const item = data[i];
        if (item.image) {
            // Need to know what ID they have in dynamo. 
            // The import script for manual used "user_${subject_id}_$(printf "%03d" $((i + 1)))"
            const questionId = `user_${sub}_${String(i + 1).padStart(3, '0')}`;
            
            try {
              const command = new UpdateItemCommand({
                  TableName: TABLE_NAME,
                  Key: { 'questionId': { S: questionId } },
                  UpdateExpression: 'SET image = :img',
                  ExpressionAttributeValues: {
                      ':img': { S: item.image }
                  }
              });
              
              await client.send(command);
              c++;
            } catch (err) {
              console.error(`Error updating ${questionId}: ${err.message}`);
            }
        }
     }
     console.log(`Finished updating ${c} images for subject ${sub}`);
  }
}

updateAllSubjectsImages().then(() => {
    console.log("All done");
    process.exit(0);
}).catch(console.error);
