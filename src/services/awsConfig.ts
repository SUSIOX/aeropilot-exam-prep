// AWS Configuration for DynamoDB - SECURE VERSION
import { secureCredentials } from './secureCredentials';

export interface AWSConfig {
  region: string;
  tableNamePrefix: string;
}

// Get AWS configuration (no credentials - using Cognito)
export const getAWSConfig = (): AWSConfig => {
  const config: AWSConfig = {
    region: process.env.AWS_REGION || 'eu-central-1',
    tableNamePrefix: process.env.DYNAMODB_TABLE_PREFIX || 'aeropilot-'
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
  AI_EXPLANATIONS: 'ai-explanations',
  LEARNING_OBJECTIVES: 'learning-objectives', 
  USER_PROGRESS: 'user-progress',
  QUESTION_FLAGS: 'question-flags'
} as const;

// Get full table name with prefix
export const getTableName = (baseName: keyof typeof TABLE_NAMES): string => {
  const prefix = getAWSConfig().tableNamePrefix;
  return `${prefix}${TABLE_NAMES[baseName]}`;
};
