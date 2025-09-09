#!/bin/bash

echo "🔍 Checking deployment status..."
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check stack status
STACK_STATUS=$(aws cloudformation describe-stacks \
    --stack-name SengacWebsiteStack \
    --query 'Stacks[0].StackStatus' \
    --output text \
    --region us-east-1 2>/dev/null)

if [ -z "$STACK_STATUS" ]; then
    echo -e "${RED}❌ Stack not found${NC}"
    exit 1
fi

echo "Stack Status: $STACK_STATUS"
echo ""

if [ "$STACK_STATUS" == "CREATE_IN_PROGRESS" ] || [ "$STACK_STATUS" == "UPDATE_IN_PROGRESS" ]; then
    echo -e "${YELLOW}⏳ Deployment in progress...${NC}"
    echo ""
    echo "Resources being created:"
    aws cloudformation list-stack-resources \
        --stack-name SengacWebsiteStack \
        --query "StackResourceSummaries[?ResourceStatus=='CREATE_IN_PROGRESS'].{Resource:LogicalResourceId,Type:ResourceType}" \
        --output table \
        --region us-east-1
    echo ""
    echo "CloudFront distributions can take 15-30 minutes to deploy."
    echo "Run this script again in a few minutes to check status."
    
elif [ "$STACK_STATUS" == "CREATE_COMPLETE" ] || [ "$STACK_STATUS" == "UPDATE_COMPLETE" ]; then
    echo -e "${GREEN}✅ Stack deployed successfully!${NC}"
    echo ""
    
    # Get outputs
    BUCKET_NAME=$(aws cloudformation describe-stacks \
        --stack-name SengacWebsiteStack \
        --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue' \
        --output text \
        --region us-east-1)
    
    DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
        --stack-name SengacWebsiteStack \
        --query 'Stacks[0].Outputs[?OutputKey==`DistributionId`].OutputValue' \
        --output text \
        --region us-east-1)
    
    WEBSITE_URL=$(aws cloudformation describe-stacks \
        --stack-name SengacWebsiteStack \
        --query 'Stacks[0].Outputs[?OutputKey==`WebsiteURL`].OutputValue' \
        --output text \
        --region us-east-1)
    
    echo "📊 Stack Outputs:"
    echo "  Bucket: $BUCKET_NAME"
    echo "  Distribution ID: $DISTRIBUTION_ID"
    echo "  Website URL: $WEBSITE_URL"
    echo ""
    
    # Check if website content exists in bucket
    OBJECT_COUNT=$(aws s3 ls s3://$BUCKET_NAME --recursive --summarize --region us-east-1 2>/dev/null | grep "Total Objects:" | awk '{print $3}')
    
    if [ "$OBJECT_COUNT" == "0" ] || [ -z "$OBJECT_COUNT" ]; then
        echo -e "${YELLOW}⚠️  No content in bucket. Syncing website files...${NC}"
        if [ -d "./website" ]; then
            aws s3 sync ./website s3://$BUCKET_NAME --delete --region us-east-1
            echo -e "${GREEN}✅ Content synced!${NC}"
            
            # Invalidate CloudFront
            aws cloudfront create-invalidation \
                --distribution-id "$DISTRIBUTION_ID" \
                --paths "/*" \
                --region us-east-1 \
                --output text > /dev/null
            echo "🔄 CloudFront cache invalidated"
        else
            echo -e "${RED}❌ website/ directory not found${NC}"
        fi
    else
        echo -e "${GREEN}✅ Content already in bucket ($OBJECT_COUNT files)${NC}"
    fi
    
    echo ""
    echo "🌐 Your website is ready at: $WEBSITE_URL"
    echo ""
    echo "To update content: ./sync-content.sh"
    
elif [ "$STACK_STATUS" == "ROLLBACK_IN_PROGRESS" ] || [ "$STACK_STATUS" == "ROLLBACK_COMPLETE" ]; then
    echo -e "${RED}❌ Stack deployment failed and rolled back${NC}"
    echo ""
    echo "To see what went wrong:"
    echo "aws cloudformation describe-stack-events --stack-name SengacWebsiteStack --region us-east-1"
    echo ""
    echo "To delete and retry:"
    echo "npx cdk destroy"
    echo "./deploy.sh"
    
else
    echo -e "${YELLOW}Stack Status: $STACK_STATUS${NC}"
fi