#!/bin/bash

set -e

echo "🔧 Installing necessary tools for AWS CDK deployment..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Detect OS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
    if grep -q Microsoft /proc/version; then
        OS="wsl"
    fi
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
else
    echo -e "${RED}Unsupported OS: $OSTYPE${NC}"
    exit 1
fi

echo "Detected OS: $OS"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check and install AWS CLI v2
echo "📦 Checking AWS CLI..."
if command_exists aws; then
    AWS_VERSION=$(aws --version 2>&1 | cut -d' ' -f1 | cut -d'/' -f2)
    echo -e "${GREEN}✓ AWS CLI is already installed (version $AWS_VERSION)${NC}"
else
    echo -e "${YELLOW}Installing AWS CLI v2...${NC}"
    
    if [[ "$OS" == "linux" ]] || [[ "$OS" == "wsl" ]]; then
        # Install AWS CLI v2 for Linux/WSL
        cd /tmp
        curl -s "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
        unzip -q awscliv2.zip
        sudo ./aws/install
        rm -rf awscliv2.zip aws/
        cd - > /dev/null
    elif [[ "$OS" == "macos" ]]; then
        # Check for Homebrew
        if command_exists brew; then
            brew install awscli
        else
            # Install using official installer
            cd /tmp
            curl -s "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
            sudo installer -pkg AWSCLIV2.pkg -target /
            rm AWSCLIV2.pkg
            cd - > /dev/null
        fi
    fi
    
    echo -e "${GREEN}✓ AWS CLI v2 installed successfully${NC}"
fi

# Check Node.js and npm
echo ""
echo "📦 Checking Node.js and npm..."
if command_exists node && command_exists npm; then
    NODE_VERSION=$(node --version)
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✓ Node.js $NODE_VERSION and npm $NPM_VERSION are installed${NC}"
else
    echo -e "${RED}✗ Node.js or npm not found${NC}"
    echo "Please install Node.js manually from: https://nodejs.org/"
    exit 1
fi

# Install AWS CDK globally
echo ""
echo "📦 Checking AWS CDK..."
if command_exists cdk; then
    CDK_VERSION=$(cdk --version 2>&1 | cut -d' ' -f1)
    echo -e "${GREEN}✓ AWS CDK is already installed (version $CDK_VERSION)${NC}"
else
    echo -e "${YELLOW}Installing AWS CDK globally...${NC}"
    npm install -g aws-cdk
    echo -e "${GREEN}✓ AWS CDK installed successfully${NC}"
fi

# Install TypeScript globally (needed for CDK)
echo ""
echo "📦 Checking TypeScript..."
if command_exists tsc; then
    TSC_VERSION=$(tsc --version 2>&1 | cut -d' ' -f2)
    echo -e "${GREEN}✓ TypeScript is already installed (version $TSC_VERSION)${NC}"
else
    echo -e "${YELLOW}Installing TypeScript globally...${NC}"
    npm install -g typescript
    echo -e "${GREEN}✓ TypeScript installed successfully${NC}"
fi

# Install ts-node globally (needed for CDK)
echo ""
echo "📦 Checking ts-node..."
if command_exists ts-node; then
    echo -e "${GREEN}✓ ts-node is already installed${NC}"
else
    echo -e "${YELLOW}Installing ts-node globally...${NC}"
    npm install -g ts-node
    echo -e "${GREEN}✓ ts-node installed successfully${NC}"
fi

# Install project dependencies
echo ""
echo "📦 Installing project dependencies..."
npm install
echo -e "${GREEN}✓ Project dependencies installed${NC}"

# Check AWS credentials
echo ""
echo "🔐 Checking AWS credentials..."
if aws sts get-caller-identity >/dev/null 2>&1; then
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    REGION=$(aws configure get region || echo "not set")
    echo -e "${GREEN}✓ AWS credentials configured${NC}"
    echo "  Account: $ACCOUNT_ID"
    echo "  Region: $REGION"
    
    if [[ "$REGION" == "not set" ]]; then
        echo -e "${YELLOW}⚠ No default region set. Setting to us-east-1...${NC}"
        aws configure set region us-east-1
    fi
else
    echo -e "${YELLOW}⚠ AWS credentials not configured${NC}"
    echo ""
    echo "Please run: ./configure-aws.sh"
    echo "Or manually run: aws configure"
fi

echo ""
echo "✅ Installation complete!"
echo ""
echo "Next steps:"
echo "1. If AWS credentials are not configured, run: ./configure-aws.sh"
echo "2. Deploy your infrastructure: ./deploy.sh"
echo ""

# Create AWS configuration helper script
cat > configure-aws.sh << 'EOF'
#!/bin/bash

echo "🔐 AWS Configuration Setup"
echo ""
echo "You'll need your AWS Access Key ID and Secret Access Key."
echo "You can get these from the AWS Console:"
echo "1. Go to IAM → Users → Your User → Security credentials"
echo "2. Create a new access key"
echo ""
echo "Press Enter to continue..."
read

aws configure

echo ""
echo "Testing AWS credentials..."
if aws sts get-caller-identity >/dev/null 2>&1; then
    echo "✅ AWS credentials configured successfully!"
    aws sts get-caller-identity
else
    echo "❌ Failed to authenticate with AWS. Please check your credentials."
    exit 1
fi
EOF

chmod +x configure-aws.sh

echo "Created configure-aws.sh for AWS credential setup"