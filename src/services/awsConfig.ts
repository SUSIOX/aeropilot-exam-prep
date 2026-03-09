// AWS Configuration for DynamoDB
export interface AWSConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  tableNamePrefix: string;
}

// Get AWS configuration from environment variables
export const getAWSConfig = (): AWSConfig => {
  const config: AWSConfig = {
    region: process.env.AWS_REGION || 'eu-central-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    tableNamePrefix: process.env.DYNAMODB_TABLE_PREFIX || 'aeropilot-'
  };

  // Validate required fields
  if (!config.accessKeyId || !config.secretAccessKey) {
    console.warn('AWS credentials not found in environment variables. Using fallback mode.');
    // For development, we'll use mock credentials
    return {
      ...config,
      accessKeyId: 'mock-access-key',
      secretAccessKey: 'mock-secret-key'
    };
  }

  return config;
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
  return `${prefix}${baseName}`;
};

// Export configuration for use in services
export const awsConfig = getAWSConfig();
