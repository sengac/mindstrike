#!/bin/bash

echo "🔐 AWS Configuration Setup"
echo ""
echo "You'll need your AWS Access Key ID and Secret Access Key."
echo ""
echo "To get these credentials:"
echo "1. Log in to AWS Console: https://console.aws.amazon.com/"
echo "2. Go to IAM → Users → Your Username"
echo "3. Click 'Security credentials' tab"
echo "4. Click 'Create access key'"
echo "5. Select 'Command Line Interface (CLI)'"
echo "6. Download or copy the credentials"
echo ""
echo "Press Enter when you have your credentials ready..."
read

# Check if aws is in PATH
if command -v aws >/dev/null 2>&1; then
    AWS_CMD="aws"
elif [ -f ~/.local/bin/aws ]; then
    AWS_CMD="~/.local/bin/aws"
else
    echo "❌ AWS CLI not found. Please run ./setup-tools.sh first"
    exit 1
fi

$AWS_CMD configure

echo ""
echo "Testing AWS credentials..."
if $AWS_CMD sts get-caller-identity >/dev/null 2>&1; then
    echo "✅ AWS credentials configured successfully!"
    echo ""
    $AWS_CMD sts get-caller-identity --output table
else
    echo "❌ Failed to authenticate with AWS. Please check your credentials."
    exit 1
fi
