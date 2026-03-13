// AWS Cognito Credentials Provider
import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export interface CognitoConfig {
  identityPoolId: string;
  region: string;
}

export class SecureCredentialsManager {
  private static instance: SecureCredentialsManager;
  private dynamoClient: DynamoDBClient | null = null;
  private docClient: DynamoDBDocumentClient | null = null;
  private config: CognitoConfig | null = null;

  private constructor() {}

  static getInstance(): SecureCredentialsManager {
    if (!SecureCredentialsManager.instance) {
      SecureCredentialsManager.instance = new SecureCredentialsManager();
    }
    return SecureCredentialsManager.instance;
  }

  // Initialize with Cognito configuration
  initialize(config: CognitoConfig): void {
    this.config = config;
    
    // Create credentials provider from Cognito Identity Pool
    const credentials = fromCognitoIdentityPool({
      client: new CognitoIdentityClient({ region: config.region }),
      identityPoolId: config.identityPoolId
    });

    // Initialize DynamoDB clients with secure credentials
    this.dynamoClient = new DynamoDBClient({
      region: config.region,
      credentials
    });

    this.docClient = DynamoDBDocumentClient.from(this.dynamoClient);
  }

  // Get DynamoDB client
  getDynamoClient(): DynamoDBClient {
    if (!this.dynamoClient) {
      throw new Error('Secure credentials not initialized. Call initialize() first.');
    }
    return this.dynamoClient;
  }

  // Get DynamoDB Document client
  getDocClient(): DynamoDBDocumentClient {
    if (!this.docClient) {
      throw new Error('Secure credentials not initialized. Call initialize() first.');
    }
    return this.docClient;
  }

  // Check if credentials are properly initialized
  isInitialized(): boolean {
    return this.dynamoClient !== null && this.docClient !== null && this.config !== null;
  }

  // Get configuration
  getConfig(): CognitoConfig | null {
    return this.config;
  }

  // Reset credentials (for testing or re-initialization)
  reset(): void {
    this.dynamoClient = null;
    this.docClient = null;
    this.config = null;
  }
}

// Export singleton instance
export const secureCredentials = SecureCredentialsManager.getInstance();

// Helper function to initialize from environment variables
export const initializeSecureCredentials = (): boolean => {
  const identityPoolId = process.env.COGNITO_IDENTITY_POOL_ID;
  const region = process.env.AWS_REGION || 'eu-central-1';


  if (!identityPoolId || identityPoolId === 'eu-central-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx') {
    console.warn('❌ Cognito Identity Pool ID not configured. Using fallback mode.');
    return false;
  }

  try {
    secureCredentials.initialize({
      identityPoolId,
      region
    });
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize secure credentials:', error);
    return false;
  }
};
