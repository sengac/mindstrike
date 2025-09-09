#!/bin/bash

set -e

echo "🔧 Setting up AWS CDK tools..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check Node.js and npm
echo "📦 Checking Node.js and npm..."
if command_exists node && command_exists npm; then
    NODE_VERSION=$(node --version)
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✓ Node.js $NODE_VERSION and npm $NPM_VERSION are installed${NC}"
else
    echo -e "${RED}✗ Node.js or npm not found${NC}"
    echo "Please install Node.js from: https://nodejs.org/"
    exit 1
fi

# Install AWS CLI v2 in user directory (no sudo required)
echo ""
echo "📦 Setting up AWS CLI v2..."
if command_exists aws; then
    AWS_VERSION=$(aws --version 2>&1 | cut -d' ' -f1 | cut -d'/' -f2 || echo "unknown")
    echo -e "${GREEN}✓ AWS CLI is already installed (version $AWS_VERSION)${NC}"
else
    echo -e "${YELLOW}Installing AWS CLI v2 to user directory...${NC}"
    
    # Create local bin directory if it doesn't exist
    mkdir -p ~/.local/bin
    
    # Download and install AWS CLI to user directory
    cd /tmp
    curl -s "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
    unzip -o -q awscliv2.zip
    ./aws/install -i ~/.local/aws-cli -b ~/.local/bin --update 2>/dev/null || \
    ./aws/install -i ~/.local/aws-cli -b ~/.local/bin
    rm -rf awscliv2.zip aws/
    cd - > /dev/null
    
    # Add to PATH if not already there
    if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
        echo ""
        echo -e "${YELLOW}Adding ~/.local/bin to PATH...${NC}"
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
        export PATH="$HOME/.local/bin:$PATH"
        echo -e "${GREEN}✓ PATH updated. Run 'source ~/.bashrc' or restart your terminal.${NC}"
    fi
    
    echo -e "${GREEN}✓ AWS CLI v2 installed to ~/.local/bin${NC}"
fi

# Install AWS CDK globally
echo ""
echo "📦 Installing AWS CDK..."
if command_exists cdk; then
    CDK_VERSION=$(cdk --version 2>&1 | cut -d' ' -f1)
    echo -e "${GREEN}✓ AWS CDK is already installed (version $CDK_VERSION)${NC}"
    echo "  Updating to latest version..."
    npm install -g aws-cdk@latest
else
    echo -e "${YELLOW}Installing AWS CDK...${NC}"
    npm install -g aws-cdk@latest
    echo -e "${GREEN}✓ AWS CDK installed successfully${NC}"
fi

# Install TypeScript
echo ""
echo "📦 Installing TypeScript..."
if command_exists tsc; then
    TSC_VERSION=$(tsc --version 2>&1 | cut -d' ' -f2)
    echo -e "${GREEN}✓ TypeScript is already installed (version $TSC_VERSION)${NC}"
else
    echo -e "${YELLOW}Installing TypeScript...${NC}"
    npm install -g typescript
    echo -e "${GREEN}✓ TypeScript installed successfully${NC}"
fi

# Install ts-node
echo ""
echo "📦 Installing ts-node..."
if command_exists ts-node; then
    echo -e "${GREEN}✓ ts-node is already installed${NC}"
else
    echo -e "${YELLOW}Installing ts-node...${NC}"
    npm install -g ts-node
    echo -e "${GREEN}✓ ts-node installed successfully${NC}"
fi

# Install project dependencies
echo ""
echo "📦 Installing project dependencies..."
npm install
echo -e "${GREEN}✓ Project dependencies installed${NC}"

# Check if AWS CLI is accessible
echo ""
echo "🔍 Verifying AWS CLI installation..."
if ~/.local/bin/aws --version 2>/dev/null || aws --version 2>/dev/null; then
    echo -e "${GREEN}✓ AWS CLI is accessible${NC}"
else
    echo -e "${YELLOW}⚠ AWS CLI installed but not in PATH yet${NC}"
    echo "  Please run: source ~/.bashrc"
    echo "  Or add this to your current session: export PATH=\"\$HOME/.local/bin:\$PATH\""
fi

# Create AWS configuration script
cat > configure-aws.sh << 'EOF'
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
EOF

chmod +x configure-aws.sh

echo ""
echo "================================"
echo -e "${GREEN}✅ Setup complete!${NC}"
echo "================================"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo ""
echo "1. If AWS CLI is not in PATH, run:"
echo -e "   ${YELLOW}source ~/.bashrc${NC}"
echo "   OR"
echo -e "   ${YELLOW}export PATH=\"\$HOME/.local/bin:\$PATH\"${NC}"
echo ""
echo "2. Configure AWS credentials:"
echo -e "   ${YELLOW}./configure-aws.sh${NC}"
echo ""
echo "3. Deploy your website:"
echo -e "   ${YELLOW}./deploy.sh${NC}"
echo ""

# Final check
echo -e "${BLUE}Installed tools summary:${NC}"
echo -n "  Node.js: "
command_exists node && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}"
echo -n "  npm: "
command_exists npm && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}"
echo -n "  AWS CLI: "
(command_exists aws || [ -f ~/.local/bin/aws ]) && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}"
echo -n "  AWS CDK: "
command_exists cdk && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}"
echo -n "  TypeScript: "
command_exists tsc && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}"
echo -n "  ts-node: "
command_exists ts-node && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}"