const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const TABLE = 'aeropilot-questions';

async function checkUserExplanations() {
  console.log('=== Kontrola explanations u uživatelských otázek ===\n');
  
  let allUserWithExp = [];
  let lastKey = null;
  let scanned = 0;
  
  do {
    const cmd = new ScanCommand({
      TableName: TABLE,
      ExclusiveStartKey: lastKey,
      Limit: 1000
    });
    const result = await client.send(cmd);
    const items = result.Items || [];
    scanned += items.length;
    lastKey = result.LastEvaluatedKey;
    
    // Filtrovat pouze user otázky s explanations
    const userWithExp = items.filter(item => {
      const source = item.source?.S;
      const isUser = source !== 'ai'; // user nebo undefined
      const hasExp = item.ai_explanation?.S || item.ai_detailed_explanation?.S || 
                      item.explanation?.S || item.aiExplanation?.S;
      return isUser && hasExp;
    });
    
    if (userWithExp.length > 0) {
      allUserWithExp = allUserWithExp.concat(userWithExp);
    }
    
    process.stdout.write(`\rScan: ${scanned} položek, nalezeno ${allUserWithExp.length} s explanations...`);
    
  } while (lastKey);
  
  console.log('\n\n=== Nalezeno ' + allUserWithExp.length + ' uživatelských otázek s explanations ===\n');
  
  if (allUserWithExp.length > 0) {
    // Group by subject
    const bySubject = {};
    const byKeyFormat = { subjectN_qID: 0, other: 0 };
    
    allUserWithExp.forEach(q => {
      const sub = q.subjectId?.N || 'unknown';
      if (!bySubject[sub]) bySubject[sub] = [];
      
      const qid = q.questionId?.S || '';
      const isCorrectFormat = /^subject\d+_q\d+$/.test(qid);
      if (isCorrectFormat) byKeyFormat.subjectN_qID++;
      else byKeyFormat.other++;
      
      bySubject[sub].push({
        questionId: qid,
        originalId: q.originalId?.N,
        hasAiExp: !!q.ai_explanation?.S,
        hasDetailed: !!q.ai_detailed_explanation?.S,
        hasOldExp: !!(q.explanation?.S || q.aiExplanation?.S)
      });
    });
    
    console.log('Podle subjectId:');
    Object.entries(bySubject).sort((a,b) => parseInt(a[0])-parseInt(b[0])).forEach(([sub, questions]) => {
      console.log(`\n  Subject ${sub}: ${questions.length} otázek s explanations`);
      questions.slice(0, 5).forEach(q => {
        const expTypes = [];
        if (q.hasAiExp) expTypes.push('ai_explanation');
        if (q.hasDetailed) expTypes.push('ai_detailed');
        if (q.hasOldExp) expTypes.push('old_explanation');
        console.log(`    - ${q.questionId} (orig:${q.originalId}): ${expTypes.join(', ')}`);
      });
      if (questions.length > 5) {
        console.log(`    ... a ${questions.length - 5} dalších`);
      }
    });
    
    console.log('\nPodle formátu klíče:');
    console.log(`  subjectN_qID (správný): ${byKeyFormat.subjectN_qID}`);
    console.log(`  jiný formát: ${byKeyFormat.other}`);
    
    if (byKeyFormat.other > 0) {
      console.log('\n⚠️  POZOR: Nalezeno otázek se špatným formátem klíče!');
      const wrong = allUserWithExp.filter(q => !/^subject\d+_q\d+$/.test(q.questionId?.S));
      wrong.slice(0, 10).forEach(q => {
        console.log(`    - ${q.questionId?.S}`);
      });
    }
  }
  
  return allUserWithExp.length;
}

checkUserExplanations().then(count => {
  console.log(`\n✅ Kontrola dokončena. Nalezeno ${count} uživatelských otázek s explanations.`);
  process.exit(0);
}).catch(err => {
  console.error('❌ Chyba:', err);
  process.exit(1);
});
