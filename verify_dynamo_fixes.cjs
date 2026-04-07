const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const fs = require('fs');
const path = require('path');

const client = new DynamoDBClient({ region: "eu-central-1" });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = "aeropilot-questions";

// Seznam opravených otázek: {subject}_{id}
const FIXED_QUESTIONS = [
  // Subject 1
  { subject: 1, id: 12 },
  { subject: 1, id: 29 },
  { subject: 1, id: 30 },
  { subject: 1, id: 85 },
  // Subject 2
  { subject: 2, id: 10 },
  { subject: 2, id: 33 },
  // Subject 3
  { subject: 3, id: 73 },
  { subject: 3, id: 74 },
  // Subject 4
  { subject: 4, id: 74 },
  { subject: 4, id: 78 },
  { subject: 4, id: 80 },
  // Subject 5
  { subject: 5, id: 100 },
  // Subject 6
  { subject: 6, id: 30 },
  // Subject 7
  { subject: 7, id: 37 },
  { subject: 7, id: 98 },
  // Subject 8
  { subject: 8, id: 73 },
  // Subject 9
  { subject: 9, id: 43 },
];

async function getDynamoQuestion(subject, id) {
  const questionId = `subject${subject}_q${id}`;
  try {
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { questionId }
    }));
    return result.Item;
  } catch (error) {
    return null;
  }
}

function getJsonQuestion(subject, id) {
  const filePath = path.join(__dirname, `subject_${subject}.json`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return data.find(q => q.id === id) || null;
}

async function verifyAll() {
  console.log("=== Kontrola opravených otázek v DynamoDB ===\n");

  let mismatches = [];
  let notInDynamo = [];
  let notInJson = [];
  let matches = [];

  for (const { subject, id } of FIXED_QUESTIONS) {
    const dynamo = await getDynamoQuestion(subject, id);
    const json = getJsonQuestion(subject, id);

    if (!dynamo) {
      notInDynamo.push(`${subject}_${id}`);
      console.log(`❌ ${subject}_${id}: Není v DynamoDB`);
      continue;
    }

    if (!json) {
      notInJson.push(`${subject}_${id}`);
      console.log(`❌ ${subject}_${id}: Není v JSON`);
      continue;
    }

    // Porovnání klíčových polí
    const checks = {
      question: dynamo.text === json.question,
      answers: JSON.stringify(dynamo.answers) === JSON.stringify(json.answers),
      correct: dynamo.correctOption === json.correct,
      answerCount: dynamo.answers?.length === json.answers?.length
    };

    const allMatch = Object.values(checks).every(v => v);

    if (!allMatch) {
      mismatches.push({
        id: `${subject}_${id}`,
        dynamo,
        json,
        checks
      });
      console.log(`⚠️  ${subject}_${id}: ROZDÍL`);
      console.log(`   Dynamo correct: ${dynamo.correctOption}, JSON correct: ${json.correct}`);
      console.log(`   Dynamo answers: ${dynamo.answers?.length}, JSON answers: ${json.answers?.length}`);
    } else {
      matches.push(`${subject}_${id}`);
      console.log(`✅ ${subject}_${id}: OK`);
    }
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Shoda: ${matches.length}/${FIXED_QUESTIONS.length}`);
  console.log(`Rozdíly: ${mismatches.length}`);
  console.log(`Chybí v DynamoDB: ${notInDynamo.length} (${notInDynamo.join(', ')})`);

  if (mismatches.length > 0) {
    console.log("\n=== DETAILY ROZDÍLŮ ===");
    for (const m of mismatches) {
      console.log(`\n${m.id}:`);
      console.log(`  Question match: ${m.checks.question}`);
      console.log(`  Answers match: ${m.checks.answers}`);
      console.log(`  Correct match: ${m.checks.correct} (Dynamo: ${m.dynamo.correctOption}, JSON: ${m.json.correct})`);
      console.log(`  Answer count match: ${m.checks.answerCount}`);
    }
  }

  return { matches, mismatches, notInDynamo };
}

verifyAll().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
