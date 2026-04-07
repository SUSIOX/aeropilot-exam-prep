const fs = require('fs');
const { DynamoDBClient, ScanCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const TABLE_NAME = 'aeropilot-questions';

const fixes = {
  'subject_5.json': {
    8: {
      answers: ['Otázka vyřazena - neplatné', 'A', 'B', 'C'],
      correct: 0,
    }
  },
  'subject_7.json': {
    65: {
      answers: ['Chybí příloha pro výpočet', '350 ft/min', '500 ft/min', '150 ft/min'],
      question: 'Jaká je maximální stoupavost letadla v tlakové výšce 6500 ft při teplotě vnějšího vzduchu? (Zadání je neúplné)',
      correct: 0,
    },
    66: {
      answers: ['Chybí tabulka TAS', '100 kt, 20 l/h', '120 kt, 25 l/h', '80 kt, 15 l/h'],
      question: 'Jaká je pravá vzdušná rychlost (TAS) (kt) a spotřeba paliva (l/h) při traťovém letu s výkonem? (Neúplné zadání)',
      correct: 0,
    },
    97: {
      answers: ['60 US galonů', '50 US galonů', '40 US galonů', 'Chybějící zbytek zadání'],
      question: 'Pro let je dáno: Traťové palivo = 70 US galonů, palivo pro mimořádné okolnosti = 5 % traťového paliva, palivo pro let na náhradní letiště a konečná záloha paliva = 20 US galonů, využitelné palivo při vzletu = 95 US galonů. Po uletění poloviny vzdálenosti bylo spotřebováno 35 US galónů. Jaké je zbývající využitelné palivo?',
      correct: 0,
    }
  },
  'subject_9.json': {
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

async function fixBrokenQuestions() {
  // 1. Fix locally
  for (const file of Object.keys(fixes)) {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      let modified = false;
      
      Object.keys(fixes[file]).forEach(id => {
        const numericId = parseInt(id);
        const item = data.find(q => q.id === numericId);
        if (item) {
          const fix = fixes[file][id];
          if (fix.answers) item.answers = fix.answers;
          if (fix.question) item.question = fix.question;
          if (fix.correct !== undefined) item.correct = fix.correct;
          modified = true;
        }
      });

      if (modified) {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
        console.log(`Locally updated ${file}`);
      }
    }
  }

  // 2. Fix DynamoDB
  let lastEvaluatedKey = undefined;
  let count = 0;

  do {
      const scanCmd = new ScanCommand({
          TableName: TABLE_NAME,
          ExclusiveStartKey: lastEvaluatedKey
      });

      const response = await client.send(scanCmd);
      
      for (const item of response.Items) {
          const qText = item.question?.S || '';
          
          let targetFix = null;
          
          if (qText.startsWith('Vyřazena') && item.subjectId?.N === '5') {
            targetFix = fixes['subject_5.json'][8];
          } else if (qText.startsWith('Jaká je maximální stoupavost letadla v tlakové výšce 6500 ft')) {
            targetFix = fixes['subject_7.json'][65];
          } else if (qText.startsWith('Jaká je pravá vzdušná rychlost (TAS) (kt) a spotřeba paliva (l/h) při traťovém letu')) {
            targetFix = fixes['subject_7.json'][66];
          } else if (qText.startsWith('Pro let je dáno: Traťové palivo = 70 US galonů, palivo pro mimořádné okolnosti = 5 %')) {
            targetFix = fixes['subject_7.json'][97];
          } else if (qText.startsWith('Je dáno: Zeměpisná trať: 270°. Pravá vzdušná rychlost: 100 kt. vítr: 090°')) {
            targetFix = fixes['subject_9.json'][74];
          }
          
          if (targetFix) {
              const answersL = targetFix.answers.map(x => ({S: x}));
              const updateCmd = new UpdateItemCommand({
                  TableName: TABLE_NAME,
                  Key: { 'questionId': item.questionId },
                  UpdateExpression: 'SET answers = :ans, question = :q, correct = :c',
                  ExpressionAttributeValues: {
                      ':ans': { L: answersL },
                      ':q': { S: targetFix.question || qText },
                      ':c': { N: targetFix.correct.toString() }
                  }
              });

              try {
                  await client.send(updateCmd);
                  console.log(`Updated DynamoDB ${item.questionId.S}`);
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

fixBrokenQuestions().catch(console.error);
