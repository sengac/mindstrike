#!/bin/bash

set -e

echo "🔧 Configuring Google Workspace MX Records for sengac.com"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

HOSTED_ZONE_ID="Z06191511DF11ZVTE10MY"
DOMAIN="sengac.com"

echo "Hosted Zone ID: $HOSTED_ZONE_ID"
echo "Domain: $DOMAIN"
echo ""

# Check for existing MX records
echo "🔍 Checking for existing MX records..."
EXISTING_MX=$(aws route53 list-resource-record-sets \
    --hosted-zone-id $HOSTED_ZONE_ID \
    --query "ResourceRecordSets[?Type=='MX' && Name=='${DOMAIN}.'].ResourceRecords" \
    --output text \
    --region us-east-1 2>/dev/null || echo "")

if [ -n "$EXISTING_MX" ]; then
    echo -e "${YELLOW}⚠️  Existing MX records found:${NC}"
    echo "$EXISTING_MX"
    echo ""
    read -p "Do you want to replace them with Google Workspace MX records? (y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborting..."
        exit 1
    fi
fi

# Create the change batch JSON
cat > /tmp/mx-records-change.json << 'EOF'
{
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "sengac.com.",
        "Type": "MX",
        "TTL": 3600,
        "ResourceRecords": [
          {
            "Value": "1 aspmx.l.google.com."
          },
          {
            "Value": "5 alt1.aspmx.l.google.com."
          },
          {
            "Value": "5 alt2.aspmx.l.google.com."
          },
          {
            "Value": "10 alt3.aspmx.l.google.com."
          },
          {
            "Value": "10 alt4.aspmx.l.google.com."
          }
        ]
      }
    }
  ]
}
EOF

echo "📝 Google Workspace MX Records to be configured:"
echo "  Priority 1:  aspmx.l.google.com"
echo "  Priority 5:  alt1.aspmx.l.google.com"
echo "  Priority 5:  alt2.aspmx.l.google.com"
echo "  Priority 10: alt3.aspmx.l.google.com"
echo "  Priority 10: alt4.aspmx.l.google.com"
echo ""

# Apply the changes
echo "🚀 Applying MX record changes to Route 53..."
CHANGE_ID=$(aws route53 change-resource-record-sets \
    --hosted-zone-id $HOSTED_ZONE_ID \
    --change-batch file:///tmp/mx-records-change.json \
    --query 'ChangeInfo.Id' \
    --output text \
    --region us-east-1)

echo "Change ID: $CHANGE_ID"
echo ""

# Wait for the change to propagate
echo "⏳ Waiting for DNS changes to propagate..."
aws route53 wait resource-record-sets-changed \
    --id $CHANGE_ID \
    --region us-east-1 2>/dev/null || true

# Clean up
rm -f /tmp/mx-records-change.json

echo ""
echo -e "${GREEN}✅ Google Workspace MX records configured successfully!${NC}"
echo ""
echo "📊 Verification Steps:"
echo "1. DNS propagation may take up to 48 hours (usually much faster)"
echo "2. You can verify the MX records with: dig MX sengac.com"
echo "3. Or check with: nslookup -type=mx sengac.com"
echo ""
echo "📧 Next Steps in Google Workspace Admin:"
echo "1. Sign in to your Google Admin console"
echo "2. Go to Apps → Google Workspace → Gmail"
echo "3. Click 'Activate Gmail'"
echo "4. Follow the verification steps"
echo ""
echo "⚠️  Important Notes:"
echo "- Ensure you have an active Google Workspace subscription"
echo "- You may need to verify domain ownership in Google Admin Console"
echo "- Add SPF record for email authentication: 'v=spf1 include:_spf.google.com ~all'"
echo "- Consider adding DKIM records for better email deliverability"

# Show current MX records
echo ""
echo "🔍 Current MX Records:"
aws route53 list-resource-record-sets \
    --hosted-zone-id $HOSTED_ZONE_ID \
    --query "ResourceRecordSets[?Type=='MX' && Name=='${DOMAIN}.'].ResourceRecords[].Value" \
    --output table \
    --region us-east-1