#!/bin/bash

# Aeropilot Exam Prep - Deployment Script

echo "🚀 Preparing Aeropilot Exam Prep for GitHub Pages deployment..."

# Clean previous build
echo "🧹 Cleaning previous build..."
rm -rf dist

# Build the application
echo "📦 Building application..."
npm run build

# Check if build was successful
if [ -d "dist" ]; then
    echo "✅ Build successful!"
    echo "📁 Build files are in ./dist/"
    echo ""
    echo "🎯 Next steps:"
    echo "1. git add ."
    echo "2. git commit -m 'Build for GitHub Pages'"
    echo "3. git push origin main"
    echo ""
    echo "🌐 Your app will be available at:"
    echo "https://[your-username].github.io/aeropilot-exam-prep/"
else
    echo "❌ Build failed!"
    exit 1
fi
