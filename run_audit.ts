import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: 'eu-central-1' });
const docClient = DynamoDBDocumentClient.from(client);

async function runAudit() {
  console.log('Fetching users from aeropilot-users...');
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

  const totalUsers = users.length;
  let totalProgressItems = 0;
  let missingSubjectIds = 0;
  let usersWithProgress = 0;
  let correctAnswers = 0;
  
  const subjectDistribution: Record<number, number> = {};
  const usersWithSettings = users.filter(u => u.settings).length;
  const usersWithFlags = users.filter(u => u.flags && Object.keys(u.flags).length > 0).length;

  for (const user of users) {
    const prog = user.progress || {};
    const keys = Object.keys(prog);
    if (keys.length > 0) usersWithProgress++;
    totalProgressItems += keys.length;

    for (const qid of keys) {
      const p = prog[qid];
      if (p.isCorrect) correctAnswers++;
      if (p.subjectId !== undefined) {
        subjectDistribution[p.subjectId] = (subjectDistribution[p.subjectId] || 0) + 1;
      } else {
        missingSubjectIds++;
      }
    }
  }

  const report = {
    "Total Users": totalUsers,
    "Users With Saved Progress": usersWithProgress,
    "Total Progress Items (Answers)": totalProgressItems,
    "Overall Success Rate": totalProgressItems > 0 ? ((correctAnswers / totalProgressItems) * 100).toFixed(1) + '%' : 'N/A',
    "Items Missing SubjectId": missingSubjectIds,
    "Items With SubjectId": totalProgressItems - missingSubjectIds,
    "Users With Custom Settings": usersWithSettings,
    "Users With Flagged Questions": usersWithFlags,
    "Subject Distribution": sortedObject(subjectDistribution)
  };

  console.log('--- AUDIT REPORT JSON START ---');
  console.log(JSON.stringify(report, null, 2));
  console.log('--- AUDIT REPORT JSON END ---');
}

function sortedObject(obj: Record<number, number>) {
  return Object.keys(obj)
    .sort((a, b) => Number(a) - Number(b))
    .reduce((acc, key) => {
      acc[key] = obj[Number(key)];
      return acc;
    }, {} as Record<string, number>);
}

runAudit().catch(console.error);
