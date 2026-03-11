// Lambda Function URL handler for Cognito token exchange
// This function securely handles the client secret

exports.handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
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
        const CLIENT_SECRET = process.env.CLIENT_SECRET; // Stored securely in Lambda
        const REDIRECT_URI = process.env.REDIRECT_URI;
        
        console.log('Processing token exchange for client:', CLIENT_ID);
        console.log('Cognito domain:', COGNITO_DOMAIN);
        console.log('Has client secret:', !!CLIENT_SECRET);
        
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
        console.log('Token params:', tokenParams.toString());
        
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
