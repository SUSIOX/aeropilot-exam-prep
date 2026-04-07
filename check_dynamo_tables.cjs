const { DynamoDBClient, ListTablesCommand, DescribeTableCommand } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ region: "eu-central-1" });
const docClient = DynamoDBDocumentClient.from(client);

async function checkTables() {
  try {
    // List all tables
    const tables = await client.send(new ListTablesCommand({}));
    console.log("=== DynamoDB Tables ===");
    tables.TableNames.forEach(name => console.log(`  - ${name}`));

    // Check each table for questions
    for (const tableName of tables.TableNames) {
      console.log(`\n=== Checking table: ${tableName} ===`);

      try {
        const result = await docClient.send(new ScanCommand({
          TableName: tableName,
          Limit: 5
        }));

        if (result.Items && result.Items.length > 0) {
          console.log(`  Found ${result.Items.length} items (showing first):`);
          result.Items.forEach((item, i) => {
            const keys = Object.keys(item);
            console.log(`    Item ${i}: keys=[${keys.join(', ')}]`);
            if (item.questionId) console.log(`      questionId: ${item.questionId}`);
            if (item.subjectId) console.log(`      subjectId: ${item.subjectId}`);
            if (item.id) console.log(`      id: ${item.id}`);
          });
        } else {
          console.log("  No items found");
        }
      } catch (e) {
        console.log(`  Error scanning: ${e.message}`);
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

checkTables().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
