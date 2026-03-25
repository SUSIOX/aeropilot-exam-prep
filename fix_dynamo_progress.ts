import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: 'eu-central-1' });
const docClient = DynamoDBDocumentClient.from(client);

async function main() {
  console.log('Starting migration to add missing subjectIds to user progress...');
  let updatedUsersCount = 0;
  let skippedUsersCount = 0;
  let fixedProgressCount = 0;

  // 1. Scan all users
  let lastKey: any = undefined;
  do {
    const scanRes = await docClient.send(new ScanCommand({
      TableName: 'aeropilot-users',
      ExclusiveStartKey: lastKey
    }));
    lastKey = scanRes.LastEvaluatedKey;

    for (const user of scanRes.Items || []) {
      const progressMap = user.progress || {};
      const qIdsToFix = Object.keys(progressMap).filter(qid => progressMap[qid].subjectId === undefined);

      if (qIdsToFix.length === 0) {
        skippedUsersCount++;
        continue;
      }

      console.log(`User ${user.username || user.userId} needs ${qIdsToFix.length} fixes.`);
      
      let needsUpdate = false;
      const updatedProgress = { ...progressMap };

      for (const qid of qIdsToFix) {
        // Fetch question to get subjectId
        try {
          const qRes = await docClient.send(new GetCommand({
            TableName: 'aeropilot-questions',
            Key: { questionId: qid }
          }));
          
          let foundSid: number | undefined = undefined;
          if (qRes.Item && qRes.Item.subjectId !== undefined) {
             foundSid = Number(qRes.Item.subjectId);
          } else {
             // Fallback to parsing from qid
             if (/^\d+_/.test(qid)) {
               foundSid = parseInt(qid.split('_')[0], 10);
             } else {
               const match = qid.match(/^subject(\d+)_/i);
               if (match) {
                 foundSid = parseInt(match[1], 10);
               }
             }
          }

          if (foundSid !== undefined) {
             updatedProgress[qid].subjectId = foundSid;
             needsUpdate = true;
             fixedProgressCount++;
          } else {
             console.warn(`Warning: Could not find subjectId for question ${qid}`);
          }
        } catch (err) {
          console.error(`Error looking up question ${qid}:`, err);
        }
      }

      if (needsUpdate) {
        // Update user
        try {
           await docClient.send(new UpdateCommand({
             TableName: 'aeropilot-users',
             Key: { userId: user.userId },
             UpdateExpression: 'SET progress = :p',
             ExpressionAttributeValues: {
               ':p': updatedProgress
             }
           }));
           updatedUsersCount++;
           console.log(`Successfully updated user ${user.username || user.userId}`);
        } catch (err) {
           console.error(`Error updating user ${user.userId}:`, err);
        }
      }
    }
  } while (lastKey);

  console.log('Migration complete!');
  console.log(`Updated Users: ${updatedUsersCount}`);
  console.log(`Skipped Users (Already good): ${skippedUsersCount}`);
  console.log(`Total Progress Items Fixed: ${fixedProgressCount}`);
}

main().catch(console.error);
