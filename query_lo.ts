import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: "eu-central-1" });
const ddbDocClient = DynamoDBDocumentClient.from(client);

async function main() {
    const response = await ddbDocClient.send(new GetCommand({
        TableName: "AeroPilot-Syllabus",
        Key: { id: "010.02.02.01.01" }
    }));
    console.log("AeroPilot-Syllabus:", response.Item);

    const response2 = await ddbDocClient.send(new GetCommand({
        TableName: "AeroPilot-LOs",
        Key: { id: "010.02.02.01.01" }
    }));
    console.log("AeroPilot-LOs:", response2.Item);
}

main().catch(console.error);
