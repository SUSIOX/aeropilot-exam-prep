const { DynamoDBClient, ScanCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const TABLE_NAME = 'aeropilot-questions';

const fixes = {
  5: {
    8: {
      answers: ['Otázka vyřazena - neplatné', 'A', 'B', 'C'],
      question: 'Vyřazena',
      correct: 0,
    }
  },
  9: {
    74: {
      answers: ['125 kt', '75 kt', '100 kt', 'Chybí zbytek zadání'],
      question: 'Je dáno: Zeměpisná trať: 270°. Pravá vzdušná rychlost: 100 kt. vítr: 090°/25 kt. vzdálenost: (Příklad pokračuje - jaká je Ground Speed?)',
      correct: 0,
    },
    75: {
      answers: ['125 kt', '75 kt', '100 kt', 'Chybí zbytek zadání'],
      question: 'Je dáno: Zeměpisná trať: 270°. Pravá vzdušná rychlost: 100 kt. vítr: 090°/25 kt. vzdálenost: (Příklad pokračuje - jaká je Ground Speed?)',
      correct: 0,
    }
  }
};

async function fixRemaining() {
  let lastEvaluatedKey = undefined;
  let count = 0;

  do {
      const scanCmd = new ScanCommand({
          TableName: TABLE_NAME,
          ExclusiveStartKey: lastEvaluatedKey
      });

      const response = await client.send(scanCmd);
      
      for (const item of response.Items) {
          const subId = item.subjectId?.N;
          let idStr = item.originalId?.N;
          
          if (!idStr) {
               // Fallback: extract from questionId (e.g. user_9_074)
               const qid = item.questionId?.S || '';
               const parts = qid.split('_');
               if (parts.length === 3) {
                   idStr = parseInt(parts[2], 10).toString();
               }
          }

          if (subId && idStr && fixes[subId] && fixes[subId][idStr]) {
              const targetFix = fixes[subId][idStr];
              
              const answersL = targetFix.answers.map(x => ({S: x}));
              const updateCmd = new UpdateItemCommand({
                  TableName: TABLE_NAME,
                  Key: { 'questionId': item.questionId },
                  UpdateExpression: 'SET answers = :ans, question = :q, correct = :c',
                  ExpressionAttributeValues: {
                      ':ans': { L: answersL },
                      ':q': { S: targetFix.question },
                      ':c': { N: targetFix.correct.toString() }
                  }
              });

              try {
                  await client.send(updateCmd);
                  console.log(`Updated DynamoDB Sub:${subId} ID:${idStr} (questionId: ${item.questionId.S})`);
                  count++;
              } catch (err) {
                  console.error(`Failed to update ${item.questionId.S}:`, err);
              }
          }
      }
      
      lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`Finished updating ${count} items in DynamoDB.`);
}

fixRemaining().catch(console.error);
