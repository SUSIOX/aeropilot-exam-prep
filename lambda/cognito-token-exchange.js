// Lambda Function URL handler for Cognito token exchange
// This function securely handles the client secret

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

export const handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://yourdomain.com', // Replace with actual domain
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
    };
    
    // Handle OPTIONS request for CORS preflight
    if (event.requestContext?.http?.method === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }
    
    try {
        // Retrieve client secret from AWS Secrets Manager
        const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'eu-central-1' });
        const secretResponse = await secretsClient.send(
            new GetSecretValueCommand({
                SecretId: process.env.SECRET_NAME || 'aeropilot-cognito-client-secret'
            })
        );
        const secretValue = JSON.parse(secretResponse.SecretString);
        const CLIENT_SECRET = secretValue.client_secret;
        
        // Parse request body
        let body;
        if (typeof event.body === 'string') {
            body = JSON.parse(event.body);
        } else {
            body = event.body;
        }
        
        const { code, grant_type, refresh_token } = body;
        
        // Cognito configuration from environment variables
        const COGNITO_DOMAIN = process.env.COGNITO_DOMAIN;
        const CLIENT_ID = process.env.CLIENT_ID;
        const REDIRECT_URI = process.env.REDIRECT_URI;
        
        console.log('Processing token exchange for client:', CLIENT_ID);
        
        let tokenParams;
        
        if (grant_type === 'refresh_token' && refresh_token) {
            // Refresh token flow
            tokenParams = new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: CLIENT_ID,
                refresh_token: refresh_token
            });
        } else if (code) {
            // Authorization code flow
            tokenParams = new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: CLIENT_ID,
                code: code,
                redirect_uri: REDIRECT_URI
            });
        } else {
            throw new Error('Missing required parameters: code or refresh_token');
        }
        
        // Add client secret to request
        if (CLIENT_SECRET) {
            tokenParams.append('client_secret', CLIENT_SECRET);
        }
        
        // Call Cognito token endpoint
        const tokenUrl = `https://${COGNITO_DOMAIN}/oauth2/token`;
        console.log('Calling Cognito token endpoint:', tokenUrl);
        
        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: tokenParams.toString()
        });
        
        const responseText = await response.text();
        console.log('Cognito response status:', response.status);
        console.log('Cognito response:', responseText);
        
        if (!response.ok) {
            let errorData;
            try {
                errorData = JSON.parse(responseText);
            } catch (e) {
                errorData = { error: 'unknown', error_description: responseText };
            }
            
            return {
                statusCode: response.status,
                headers,
                body: JSON.stringify({
                    error: errorData.error || 'token_exchange_failed',
                    error_description: errorData.error_description || 'Failed to exchange token'
                })
            };
        }
        
        const tokenData = JSON.parse(responseText);
        
        // Return tokens to client
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                access_token: tokenData.access_token,
                id_token: tokenData.id_token,
                refresh_token: tokenData.refresh_token,
                expires_in: tokenData.expires_in,
                token_type: tokenData.token_type || 'Bearer'
            })
        };
        
    } catch (error) {
        console.error('Lambda error:', error);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'internal_error',
                error_description: error.message
            })
        };
    }
};
