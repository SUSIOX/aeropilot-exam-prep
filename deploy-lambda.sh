#!/bin/bash

# Deployment script for Cognito token exchange Lambda

echo "🚀 Deploying Cognito Token Exchange Lambda..."

# Configuration
LAMBDA_NAME="cognito-token-exchange"
REGION="eu-central-1"
ROLE_ARN="arn:aws:iam::ACCOUNT-ID:role/lambda-execution-role" # Update with your role ARN

# Create deployment package
echo "📦 Creating deployment package..."
cd lambda
zip -r ../lambda-function.zip .
cd ..

# Check if Lambda exists
if aws lambda get-function --function-name $LAMBDA_NAME --region $REGION 2>/dev/null; then
    echo "🔄 Updating existing Lambda function..."
    aws lambda update-function-code \
        --function-name $LAMBDA_NAME \
        --zip-file fileb://lambda-function.zip \
        --region $REGION
    
    aws lambda update-function-configuration \
        --function-name $LAMBDA_NAME \
        --handler token-exchange.handler \
        --runtime nodejs18.x \
        --role $ROLE_ARN \
        --environment Variables={
            USER_POOL_ID="eu-central-1_XXXXXXX",
            CLIENT_ID="32d9ivfbtnpo69jaq7vld9p2jp",
            AWS_REGION="eu-central-1"
        } \
        --region $REGION
else
    echo "🆕 Creating new Lambda function..."
    aws lambda create-function \
        --function-name $LAMBDA_NAME \
        --handler token-exchange.handler \
        --runtime nodejs18.x \
        --role $ROLE_ARN \
        --zip-file fileb://lambda-function.zip \
        --environment Variables={
            USER_POOL_ID="eu-central-1_XXXXXXX",
            CLIENT_ID="32d9ivfbtnpo69jaq7vld9p2jp",
            AWS_REGION="eu-central-1"
        } \
        --region $REGION
fi

# Create API Gateway
echo "🌐 Setting up API Gateway..."

# Check if API exists
API_ID=$(aws apigateway get-rest-apis --query "items[?name=='cognito-auth-api'].id" --output text --region $REGION)

if [ -z "$API_ID" ]; then
    echo "🆕 Creating new API Gateway..."
    API_ID=$(aws apigateway create-rest-api --name cognito-auth-api --region $REGION --query 'id' --output text)
fi

# Get root resource ID
ROOT_ID=$(aws apigateway get-resources --rest-api-id $API_ID --query 'items[?path==`/`].id' --output text --region $REGION)

# Create resource
RESOURCE_ID=$(aws apigateway create-resource \
    --rest-api-id $API_ID \
    --parent-id $ROOT_ID \
    --path-part token \
    --query 'id' \
    --output text \
    --region $REGION)

# Create POST method
aws apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $RESOURCE_ID \
    --http-method POST \
    --authorization-type NONE \
    --region $REGION

# Set up Lambda integration
aws apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $RESOURCE_ID \
    --http-method POST \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/arn:aws:lambda:$REGION:ACCOUNT-ID:function:$LAMBDA_NAME/invocations \
    --region $REGION

# Add Lambda permission
aws lambda add-permission \
    --function-name $LAMBDA_NAME \
    --statement-id apigateway-invoke \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn arn:aws:execute-api:$REGION:ACCOUNT-ID:$API_ID/*/POST/token \
    --region $REGION

# Deploy API
echo "🚀 Deploying API Gateway..."
aws apigateway create-deployment \
    --rest-api-id $API_ID \
    --stage-name prod \
    --region $REGION

# Get API URL
API_URL="https://$API_ID.execute-api.$REGION.amazonaws.com/prod/token"

echo "✅ Deployment complete!"
echo "📝 Lambda URL: $API_URL"
echo "⚠️  Remember to:"
echo "   1. Update USER_POOL_ID in Lambda environment"
echo "   2. Update ACCOUNT_ID in the script"
echo "   3. Set up proper IAM role for Lambda"
echo "   4. Update LAMBDA_TOKEN_EXCHANGE_URL in .env"

# Cleanup
rm lambda-function.zip

echo "🎉 Done!"
