#!/bin/bash

# Deployment script for Cognito Token Exchange Lambda with Function URL

set -e

echo "🚀 Deploying Cognito Token Exchange Lambda..."

# Configuration
LAMBDA_NAME="cognito-token-exchange"
REGION="eu-central-1"
ROLE_NAME="lambda-cognito-token-exchange-role"

# Get AWS Account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "📋 AWS Account ID: $ACCOUNT_ID"

# Create IAM role for Lambda if it doesn't exist
echo "🔐 Checking IAM role..."
if ! aws iam get-role --role-name $ROLE_NAME 2>/dev/null; then
    echo "Creating IAM role..."
    
    # Create trust policy
    cat > /tmp/trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

    aws iam create-role \
        --role-name $ROLE_NAME \
        --assume-role-policy-document file:///tmp/trust-policy.json \
        --region $REGION

    # Attach basic execution policy
    aws iam attach-role-policy \
        --role-name $ROLE_NAME \
        --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole \
        --region $REGION

    echo "⏳ Waiting for role to be ready..."
    sleep 10
fi

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
echo "✅ Role ARN: $ROLE_ARN"

# Create deployment package
echo "📦 Creating deployment package..."
cd lambda
zip -r ../lambda-function.zip cognito-token-exchange.js
cd ..

# Check if Lambda exists
echo "🔍 Checking if Lambda function exists..."
if aws lambda get-function --function-name $LAMBDA_NAME --region $REGION 2>/dev/null; then
    echo "🔄 Updating existing Lambda function..."
    
    aws lambda update-function-code \
        --function-name $LAMBDA_NAME \
        --zip-file fileb://lambda-function.zip \
        --region $REGION
    
    echo "⏳ Waiting for update to complete..."
    aws lambda wait function-updated --function-name $LAMBDA_NAME --region $REGION
    
    aws lambda update-function-configuration \
        --function-name $LAMBDA_NAME \
        --handler cognito-token-exchange.handler \
        --runtime nodejs20.x \
        --timeout 30 \
        --memory-size 256 \
        --region $REGION
else
    echo "🆕 Creating new Lambda function..."
    
    aws lambda create-function \
        --function-name $LAMBDA_NAME \
        --handler cognito-token-exchange.handler \
        --runtime nodejs20.x \
        --role $ROLE_ARN \
        --zip-file fileb://lambda-function.zip \
        --timeout 30 \
        --memory-size 256 \
        --region $REGION
    
    echo "⏳ Waiting for function to be active..."
    aws lambda wait function-active --function-name $LAMBDA_NAME --region $REGION
fi

# Set environment variables
echo "🔧 Setting environment variables..."
aws lambda update-function-configuration \
    --function-name $LAMBDA_NAME \
    --environment "Variables={
        COGNITO_DOMAIN=eu-central-1cfdn8kqio.auth.eu-central-1.amazoncognito.com,
        CLIENT_ID=32d9ivfbtnpo69jaq7vld9p2jp,
        CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE,
        REDIRECT_URI=https://susiox.github.io/aeropilot-exam-prep/
    }" \
    --region $REGION

echo "⏳ Waiting for configuration update..."
aws lambda wait function-updated --function-name $LAMBDA_NAME --region $REGION

# Create or update Function URL
echo "🌐 Setting up Function URL..."
FUNCTION_URL=$(aws lambda create-function-url-config \
    --function-name $LAMBDA_NAME \
    --auth-type NONE \
    --cors "AllowOrigins=*,AllowMethods=POST,AllowHeaders=Content-Type,MaxAge=86400" \
    --region $REGION \
    --query 'FunctionUrl' \
    --output text 2>/dev/null || \
    aws lambda get-function-url-config \
    --function-name $LAMBDA_NAME \
    --region $REGION \
    --query 'FunctionUrl' \
    --output text)

# Add permission for public access
echo "🔓 Adding public invoke permission..."
aws lambda add-permission \
    --function-name $LAMBDA_NAME \
    --statement-id FunctionURLAllowPublicAccess \
    --action lambda:InvokeFunctionUrl \
    --principal "*" \
    --function-url-auth-type NONE \
    --region $REGION 2>/dev/null || echo "Permission already exists"

# Cleanup
rm lambda-function.zip

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Lambda Function URL:"
echo "   $FUNCTION_URL"
echo ""
echo "⚠️  IMPORTANT: Update the following:"
echo ""
echo "1. Get Client Secret from Cognito:"
echo "   Cognito → User pools → User pool - dwwc1 → App integration → App clients → Aeropilot Exam Preparation"
echo "   Copy the Client Secret"
echo ""
echo "2. Update Lambda environment variable:"
echo "   aws lambda update-function-configuration \\"
echo "     --function-name $LAMBDA_NAME \\"
echo "     --environment \"Variables={COGNITO_DOMAIN=eu-central-1cfdn8kqio.auth.eu-central-1.amazoncognito.com,CLIENT_ID=32d9ivfbtnpo69jaq7vld9p2jp,CLIENT_SECRET=YOUR_ACTUAL_SECRET,REDIRECT_URI=https://susiox.github.io/aeropilot-exam-prep/}\" \\"
echo "     --region $REGION"
echo ""
echo "3. Update .env file:"
echo "   LAMBDA_TOKEN_EXCHANGE_URL=$FUNCTION_URL"
echo ""
echo "4. Test the Lambda:"
echo "   curl -X POST \"$FUNCTION_URL\" \\"
echo "     -H \"Content-Type: application/json\" \\"
echo "     -d '{\"code\":\"test\"}'"
echo ""
echo "🎉 Done!"
