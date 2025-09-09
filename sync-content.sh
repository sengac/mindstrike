#!/bin/bash

set -e

echo "📤 Syncing website content to S3..."

if [ ! -d "website" ]; then
    echo "❌ Error: 'website' directory not found!"
    echo "Please create a 'website' directory with your website content."
    exit 1
fi

BUCKET_NAME=$(aws cloudformation describe-stacks \
    --stack-name SengacWebsiteStack \
    --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue' \
    --output text \
    --region us-east-1 2>/dev/null)

if [ -z "$BUCKET_NAME" ]; then
    echo "❌ Error: Could not find S3 bucket. Make sure the stack is deployed first."
    echo "Run ./deploy.sh to deploy the infrastructure."
    exit 1
fi

echo "🪣 Syncing to bucket: $BUCKET_NAME"
aws s3 sync ./website "s3://${BUCKET_NAME}" \
    --delete \
    --region us-east-1 \
    --exclude ".DS_Store" \
    --exclude "*.swp" \
    --exclude "*~"

echo ""
echo "🔄 Invalidating CloudFront cache..."
DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
    --stack-name SengacWebsiteStack \
    --query 'Stacks[0].Outputs[?OutputKey==`DistributionId`].OutputValue' \
    --output text \
    --region us-east-1)

if [ -n "$DISTRIBUTION_ID" ]; then
    INVALIDATION_ID=$(aws cloudfront create-invalidation \
        --distribution-id "$DISTRIBUTION_ID" \
        --paths "/*" \
        --region us-east-1 \
        --query 'Invalidation.Id' \
        --output text)
    
    echo "📝 Invalidation created: $INVALIDATION_ID"
fi

echo ""
echo "✅ Content sync complete!"
echo "🌐 Your updated content will be available at: https://sengac.com"
echo ""
echo "Note: CloudFront cache invalidation may take a few minutes to complete."