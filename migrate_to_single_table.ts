import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, PutCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: 'eu-central-1' });
const docClient = DynamoDBDocumentClient.from(client);

async function migrateData() {
  console.log('Spouštím migraci progresu do aeropilot-user-progress...');
  
  // 1. Stáhnout všechny uživatele ze staré tabulky
  const users: any[] = [];
  let lastKey: any = undefined;
  do {
    const scanRes = await docClient.send(new ScanCommand({
      TableName: 'aeropilot-users',
      ExclusiveStartKey: lastKey
    }));
    lastKey = scanRes.LastEvaluatedKey;
    if (scanRes.Items) users.push(...scanRes.Items);
  } while (lastKey);

  let totalMigratedAnswers = 0;
  let summaryRecords = 0;

  for (const user of users) {
    const userId = user.userId || user.id; // Podpora starého i nového formátu ID
    if (!userId) continue;

    const progress = user.progress || {};
    const questionIds = Object.keys(progress);
    
    if (questionIds.length === 0) continue;

    console.log(`Migrace dat pro ${user.username || userId} (otázek: ${questionIds.length})`);

    let userCorrectCount = 0;
    let latestTimestamp = user.createdAt || new Date().toISOString();

    // Migrace jednotlivých odpovědí
    for (const qid of questionIds) {
      const prog = progress[qid];
      const isCorrect = prog.isCorrect === true;
      const ts = prog.answerTimestamp || prog.timestamp || new Date().toISOString();
      const sk = `Q#${String(qid).padStart(5, '0')}`;

      if (isCorrect) userCorrectCount++;
      if (ts > latestTimestamp) latestTimestamp = ts;

      await docClient.send(new PutCommand({
        TableName: 'aeropilot-user-progress-v2',
        Item: {
          PK: `USER#${userId}`,
          SK: sk,
          correct: isCorrect,
          correct_str: isCorrect ? 'Y' : 'N',
          subjectId: prog.subjectId !== undefined ? prog.subjectId : -1,
          attempts: prog.attempts || 1,
          updated_at: ts
        }
      }));
      totalMigratedAnswers++;
    }

    // Vytvoření/přepis SUMMARY záznamu pro tohoto uživatele
    await docClient.send(new PutCommand({
      TableName: 'aeropilot-user-progress-v2',
      Item: {
        PK: `USER#${userId}`,
        SK: 'SUMMARY',
        answered: questionIds.length,
        correct_count: userCorrectCount,
        last_active: latestTimestamp
      }
    }));
    summaryRecords++;
  }

  console.log('✅ Migrace dokončena!');
  console.log(`Celkem přenesených odpovědí (otázek): ${totalMigratedAnswers}`);
  console.log(`Vytvořeno SUMMARY záznamů (uživatelů s pokrokem): ${summaryRecords}`);
}

migrateData().catch(console.error);
