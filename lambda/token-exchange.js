// Lambda function for Cognito token exchange
const { CognitoIdentityProviderClient, InitiateAuthCommand, RespondToAuthChallengeCommand, AdminInitiateAuthCommand } = require('@aws-sdk/client-cognito-identity-provider');

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

// Cognito User Pool configuration
const USER_POOL_ID = process.env.USER_POOL_ID; // e.g., eu-central-1_XXXXXXX
const CLIENT_ID = process.env.CLIENT_ID;

exports.handler = async (event) => {
    console.log('Token exchange request:', event);

    try {
        const { code, grant_type, refresh_token } = event;

        if (grant_type === 'refresh_token' && refresh_token) {
            // Handle token refresh
            return await handleTokenRefresh(refresh_token);
        } else if (code) {
            // Handle authorization code exchange
            return await handleAuthCodeExchange(code);
        } else {
            throw new Error('Invalid request: missing code or refresh_token');
        }
    } catch (error) {
        console.error('Token exchange error:', error);
        return {
            statusCode: 400,
            body: JSON.stringify({ 
                error: 'Token exchange failed',
                message: error.message 
            })
        };
    }
};

async function handleAuthCodeExchange(code) {
    try {
        // For authorization code flow, we need to use the token endpoint directly
        // This is a simplified implementation - in production, you'd want to verify the code
        
        // For now, we'll simulate token exchange with admin auth flow
        // In a real implementation, you'd call Cognito's token endpoint
        
        const mockTokens = {
            access_token: generateMockToken('access'),
            id_token: generateMockToken('id'),
            refresh_token: generateMockToken('refresh'),
            expires_in: 3600,
            token_type: 'Bearer'
        };

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: JSON.stringify(mockTokens)
        };
    } catch (error) {
        console.error('Auth code exchange error:', error);
        throw error;
    }
}

async function handleTokenRefresh(refreshToken) {
    try {
        // In production, you'd use InitiateAuthCommand with REFRESH_TOKEN_AUTH
        const mockTokens = {
            access_token: generateMockToken('access'),
            id_token: generateMockToken('id'),
            expires_in: 3600,
            token_type: 'Bearer'
        };

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: JSON.stringify(mockTokens)
        };
    } catch (error) {
        console.error('Token refresh error:', error);
        throw error;
    }
}

function generateMockToken(type) {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({
        sub: 'user-id',
        aud: CLIENT_ID,
        iss: `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${USER_POOL_ID}`,
        token_use: type,
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        'cognito:username': 'testuser',
        email: 'test@example.com'
    }));
    const signature = 'mock-signature';
    return `${header}.${payload}.${signature}`;
}

// Handle OPTIONS request for CORS
exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    // Main handler logic
    const body = JSON.parse(event.body || '{}');
    return await exports.handler(body);
};
