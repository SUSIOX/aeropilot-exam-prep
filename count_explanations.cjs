const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const client = new DynamoDBClient({ region: 'eu-central-1' });

async function count() {
  let lastKey = null, pdfExp = 0, aiExp = 0, other = 0;
  const bySubject = {};
  const otherItems = [];
  do {
    const r = await client.send(new ScanCommand({ TableName: 'aeropilot-ai-explanations', ExclusiveStartKey: lastKey }));
    for (const raw of r.Items || []) {
      const item = unmarshall(raw);
      const qid = item.questionId || '';
      if (/^subject\d+_q\d+$/.test(qid)) {
        pdfExp++;
        const m = qid.match(/^subject(\d+)_q/);
        if (m) bySubject['pred' + m[1]] = (bySubject['pred' + m[1]] || 0) + 1;
      } else if (/^subject\d+_ai_/.test(qid) || /^ai_/.test(qid)) {
        aiExp++;
      } else {
        other++;
        otherItems.push(qid);
      }
    }
    lastKey = r.LastEvaluatedKey;
  } while (lastKey);

  console.log('=== aeropilot-ai-explanations ===');
  console.log('PDF otazky (subjectN_qID):', pdfExp);
  console.log('AI otazky (subject/ai_hash):', aiExp);
  console.log('Ostatni:', other, otherItems);
  console.log('PDF podle predmetu:', bySubject);
  console.log('CELKEM:', pdfExp + aiExp + other);
}

count().catch(console.error);
