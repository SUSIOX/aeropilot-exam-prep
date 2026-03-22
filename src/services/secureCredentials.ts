// AWS Cognito Credentials Provider
import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { cognitoAuthService } from './cognitoAuthService';
import { getCognitoConfig } from './awsConfig';

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

  // Initialize with Cognito configuration and authenticated credentials
  async initializeAuthenticated(): Promise<void> {
    const config = getCognitoConfig();
    this.config = config;

    // Initialize DynamoDB clients with a credentials provider function
    // This allows the SDK to fetch fresh credentials (and refresh tokens) automatically
    this.dynamoClient = new DynamoDBClient({
      region: config.region,
      credentials: async () => {
        const awsCredentials = await cognitoAuthService.getValidAWSCredentials();
        if (!awsCredentials) {
          throw new Error('No valid AWS credentials available. User must be authenticated.');
        }
        return {
          accessKeyId: awsCredentials.accessKeyId,
          secretAccessKey: awsCredentials.secretAccessKey,
          sessionToken: awsCredentials.sessionToken,
          expiration: awsCredentials.expiration
        };
      }
    });

    this.docClient = DynamoDBDocumentClient.from(this.dynamoClient, {
      marshallOptions: { removeUndefinedValues: true }
    });
  }

  // Initialize with unauthenticated (guest) credentials
  initializeGuest(): void {
    const config = getCognitoConfig();
    this.config = config;

    // For guest mode, try to use Cognito Identity Pool first
    try {
      const credentials = fromCognitoIdentityPool({
        client: new CognitoIdentityClient({ region: config.region }),
        identityPoolId: config.identityPoolId,
        // For unauthenticated access, don't pass logins
      });

      // Initialize DynamoDB clients with guest credentials provider
      this.dynamoClient = new DynamoDBClient({
        region: config.region,
        credentials
      });

      this.docClient = DynamoDBDocumentClient.from(this.dynamoClient, {
        marshallOptions: { removeUndefinedValues: true }
      });
      console.log('✅ Guest credentials initialized via Cognito Identity Pool');
    } catch (error) {
      console.warn('❌ Failed to initialize guest credentials via Identity Pool:', error);
      console.log('🔄 Falling back to mock/local mode for guest access');

      // Fallback: Create a mock client that doesn't actually connect to AWS
      // This allows the app to run in guest mode without AWS credentials
      this.dynamoClient = null as any;
      this.docClient = null as any;
      this.config = config;
    }
  }

  // Get DynamoDB client
  getDynamoClient(): DynamoDBClient {
    if (!this.dynamoClient) {
      throw new Error('DynamoDB client not available. Guest mode may not have AWS access.');
    }
    return this.dynamoClient;
  }

  // Get DynamoDB Document client
  getDocClient(): DynamoDBDocumentClient {
    if (!this.docClient) {
      throw new Error('DynamoDB Document client not available. Guest mode may not have AWS access.');
    }
    return this.docClient;
  }

  // Check if credentials are properly initialized
  isInitialized(): boolean {
    return this.config !== null; // Allow null clients for guest mode
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

// Helper function to initialize authenticated credentials
export const initializeAuthenticatedCredentials = async (): Promise<boolean> => {
  try {
    await secureCredentials.initializeAuthenticated();
    console.log('✅ Authenticated AWS credentials initialized');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize authenticated credentials:', error);
    return false;
  }
};

// Helper function to initialize guest credentials
export const initializeGuestCredentials = (): boolean => {
  try {
    secureCredentials.initializeGuest();
    console.log('✅ Guest AWS credentials initialized');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize guest credentials:', error);
    return false;
  }
};

// Legacy helper function for backward compatibility
export const initializeSecureCredentials = (): boolean => {
  const identityPoolId = process.env.COGNITO_IDENTITY_POOL_ID;
  const region = process.env.AWS_REGION || 'eu-central-1';

  if (!identityPoolId || identityPoolId === 'eu-central-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx') {
    console.warn('❌ Cognito Identity Pool ID not configured. Using guest mode.');
    return initializeGuestCredentials();
  }

  // Try authenticated mode first, fallback to guest
  console.log('🔄 Attempting authenticated credentials initialization...');
  initializeAuthenticatedCredentials().then(success => {
    if (!success) {
      console.log('🔄 Falling back to guest credentials...');
      initializeGuestCredentials();
    }
  });

  return true;
};
