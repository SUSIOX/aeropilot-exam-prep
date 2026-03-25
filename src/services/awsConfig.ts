// AWS Configuration for DynamoDB - SECURE VERSION
import { secureCredentials } from './secureCredentials';

export interface AWSConfig {
  region: string;
  tableNamePrefix: string;
}

export interface CognitoConfig {
  region: string;
  userPoolId: string;
  clientId: string;
  identityPoolId: string;
}

// Get AWS configuration (no credentials - using Cognito)
export const getAWSConfig = (): AWSConfig => {
  const config: AWSConfig = {
    region: process.env.AWS_REGION || 'eu-central-1',
    tableNamePrefix: process.env.DYNAMODB_TABLE_PREFIX || 'aeropilot-'
  };

  return config;
};

// Get Cognito configuration for authentication
export const getCognitoConfig = (): CognitoConfig => {
  const config: CognitoConfig = {
    region: process.env.AWS_REGION || 'eu-central-1',
    userPoolId: 'eu-central-1_cfdN8KQIo',
    clientId: '32d9ivfbtnpo69jaq7vld9p2jp',
    identityPoolId: 'eu-central-1:b30b46cc-5882-4d11-ab16-00cc715a793d'
  };

  return config;
};

// Legacy export for backward compatibility
export const awsConfig = getAWSConfig();

// Check if secure credentials are available
export const isSecureCredentialsAvailable = (): boolean => {
  return secureCredentials.isInitialized();
};

// Get secure DynamoDB client
export const getSecureDynamoClient = () => {
  return secureCredentials.getDynamoClient();
};

// Get secure DynamoDB Document client  
export const getSecureDocClient = () => {
  return secureCredentials.getDocClient();
};

// DynamoDB table names
export const TABLE_NAMES = {
  EASA_OBJECTIVES: 'easa-objectives',          // Master LO data (EasaObjective)
  QUESTIONS: 'questions',                       // aeropilot-questions
  USERS: 'users',                               // aeropilot-users
  USER_PROGRESS: 'user-progress-v2',            // single-table design for user progress
  EXAM_RESULTS: 'exam-results'                  // aeropilot-exam-results
} as const;

// Get full table name with prefix
export const getTableName = (baseName: keyof typeof TABLE_NAMES): string => {
  const prefix = getAWSConfig().tableNamePrefix;
  return `${prefix}${TABLE_NAMES[baseName]}`;
};
