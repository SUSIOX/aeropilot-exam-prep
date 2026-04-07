const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ region: "eu-central-1" });
const docClient = DynamoDBDocumentClient.from(client);

async function run() {
  const result = await docClient.send(new GetCommand({
    TableName: "AeroPilot-EasaObjectives",
    Key: { loId: "010.02.02.01.01" }
  }));
  console.log(JSON.stringify(result.Item, null, 2));
}

run().catch(console.error);
