import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.COGNITO_IDENTITY_POOL_ID': JSON.stringify(env.COGNITO_IDENTITY_POOL_ID),
      'process.env.AWS_REGION': JSON.stringify(env.AWS_REGION || 'eu-central-1'),
      'process.env.COGNITO_DOMAIN': JSON.stringify(env.COGNITO_DOMAIN),
      'process.env.COGNITO_CLIENT_ID': JSON.stringify(env.COGNITO_CLIENT_ID),
      'process.env.COGNITO_REDIRECT_URI': JSON.stringify(mode === 'production' ? 'https://susiox.github.io/aeropilot-exam-prep/' : env.COGNITO_REDIRECT_URI),
      'process.env.LAMBDA_TOKEN_EXCHANGE_URL': JSON.stringify(env.LAMBDA_TOKEN_EXCHANGE_URL),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    base: mode === 'production' ? '/aeropilot-exam-prep/' : '/',
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: true,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
