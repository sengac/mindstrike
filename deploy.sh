#!/bin/bash

set -e

echo "🚀 Deploying mindstrike.ai website infrastructure and content..."
echo ""

# Check for AWS CLI
if ! command -v aws &> /dev/null; then
    if [ -f ~/.local/bin/aws ]; then
        export PATH="$HOME/.local/bin:$PATH"
    else
        echo "❌ Error: AWS CLI not found!"
        echo "Please run: ./setup-tools.sh"
        exit 1
    fi
fi

# Check AWS credentials
if ! aws sts get-caller-identity >/dev/null 2>&1; then
    echo "❌ Error: AWS credentials not configured!"
    echo "Please run: ./configure-aws.sh"
    exit 1
fi

if [ ! -d "website" ]; then
    echo "❌ Error: 'website' directory not found!"
    echo "Please create a 'website' directory with your website content."
    exit 1
fi

if [ ! -f "website/index.html" ]; then
    echo "⚠️  Warning: index.html not found in website directory"
    echo "Creating a default index.html..."
    mkdir -p website
    cat > website/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MindStrike</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: white;
            text-align: center;
            padding: 20px;
        }
        
        .container {
            max-width: 600px;
            animation: fadeIn 1s ease-in;
        }
        
        h1 {
            font-size: 3.5rem;
            font-weight: 700;
            margin-bottom: 1rem;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
        }
        
        .subtitle {
            font-size: 1.5rem;
            font-weight: 300;
            margin-bottom: 2rem;
            opacity: 0.95;
        }
        
        .divider {
            width: 80px;
            height: 4px;
            background: white;
            margin: 2rem auto;
            border-radius: 2px;
        }
        
        .info {
            font-size: 1.1rem;
            line-height: 1.8;
            opacity: 0.9;
            margin-bottom: 2rem;
        }
        
        .info a {
            color: white;
            text-decoration: none;
            transition: opacity 0.3s ease;
        }
        
        .info a:hover {
            opacity: 0.8;
            text-decoration: underline;
        }
        
        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        @media (max-width: 600px) {
            h1 {
                font-size: 2.5rem;
            }
            .subtitle {
                font-size: 1.2rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>MindStrike</h1>
        <p class="subtitle">Software Engineering & Consulting Pty Ltd</p>
        <div class="divider"></div>
        <p class="info">
            Phone: 0478 914 599<br>
            Email: <a href="mailto:info@mindstrike.ai">info@mindstrike.ai</a>
        </p>
    </div>
</body>
</html>
EOF
fi

echo "📦 Installing dependencies..."
npm install

echo ""
echo "🏗️  Building CDK application..."
npm run build

echo ""
echo "🔄 Bootstrapping CDK (if needed)..."
npx cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/us-east-1 2>/dev/null || true

echo ""
echo "🚀 Deploying CDK stack..."
echo "Note: CloudFront distribution creation can take 15-30 minutes..."
npx cdk deploy --require-approval never

# Wait a moment for stack outputs to be available
sleep 2

echo ""
echo "📤 Syncing website content to S3..."
BUCKET_NAME=$(aws cloudformation describe-stacks \
    --stack-name MindstrikeWebsiteStack \
    --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue' \
    --output text \
    --region us-east-1)

if [ -z "$BUCKET_NAME" ]; then
    echo "❌ Error: Could not find S3 bucket name from stack outputs"
    echo "Stack may still be creating. Please run ./sync-content.sh after stack creation completes."
    exit 1
fi

# Sync with correct content type for HTML files
aws s3 sync ./website "s3://${BUCKET_NAME}" \
    --delete \
    --region us-east-1 \
    --exclude ".DS_Store" \
    --exclude "*.swp" \
    --exclude "*~"

# Set correct content types
aws s3 cp s3://${BUCKET_NAME}/index.html s3://${BUCKET_NAME}/index.html \
    --content-type "text/html" \
    --metadata-directive REPLACE \
    --region us-east-1 2>/dev/null || true

if [ -f "website/error.html" ]; then
    aws s3 cp s3://${BUCKET_NAME}/error.html s3://${BUCKET_NAME}/error.html \
        --content-type "text/html" \
        --metadata-directive REPLACE \
        --region us-east-1 2>/dev/null || true
fi

echo ""
echo "🔄 Invalidating CloudFront cache..."
DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
    --stack-name MindstrikeWebsiteStack \
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
    echo "Invalidation created: $INVALIDATION_ID"
fi

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 Stack Outputs:"
aws cloudformation describe-stacks \
    --stack-name MindstrikeWebsiteStack \
    --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
    --output table \
    --region us-east-1

# Get the nameservers for display
NAMESERVERS=$(aws cloudformation describe-stacks \
    --stack-name MindstrikeWebsiteStack \
    --query 'Stacks[0].Outputs[?OutputKey==`NameServers`].OutputValue' \
    --output text \
    --region us-east-1)

echo ""
echo "🌐 Your website will be available at: https://mindstrike.ai"
echo ""

if [ -n "$NAMESERVERS" ]; then
    echo "📌 IMPORTANT - Domain Configuration:"
    echo "=================================="
    echo "Update your domain registrar with these nameservers:"
    echo ""
    for ns in $(echo $NAMESERVERS | tr ',' '\n'); do
        echo "  • $(echo $ns | xargs)"
    done
    echo ""
    echo "DNS propagation may take up to 48 hours (usually much faster)."
    echo "=================================="
else
    echo "⚠️  Important Notes:"
    echo "1. If this is a new domain, update your domain registrar's nameservers"
    echo "2. DNS propagation may take up to 48 hours"
    echo "3. SSL certificate validation happens automatically via DNS"
fi

echo ""
echo "📝 Next Steps:"
echo "1. Check deployment status: ./check-deployment.sh"
echo "2. Update website content: Edit files in ./website"
echo "3. Sync changes: ./sync-content.sh"
echo ""

# Check if the website is accessible
echo "🔍 Testing website accessibility..."
sleep 5
if curl -s -o /dev/null -w "%{http_code}" https://mindstrike.ai | grep -q "200\|301\|302"; then
    echo "✅ Website is accessible!"
else
    echo "⏳ Website is not yet accessible. This is normal for new deployments."
    echo "   CloudFront distribution may still be propagating (15-30 minutes)."
    echo "   Run ./check-deployment.sh to monitor progress."
fi