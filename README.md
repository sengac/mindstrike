# MindStrike.ai AWS CDK Infrastructure

This project sets up a static website hosting infrastructure for mindstrike.ai using AWS CDK with:
- S3 bucket for website content storage
- CloudFront CDN for global content delivery
- Route 53 for DNS management
- ACM SSL certificate for HTTPS
- Automated deployment scripts

## Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js 18+ and npm installed
- AWS CDK CLI (`npm install -g aws-cdk`)
- Domain name (mindstrike.ai) ready to be configured

## Project Structure

```
mindstrike.ai/
├── lib/                    # CDK TypeScript code
│   ├── app.ts             # CDK app entry point
│   └── mindstrike-website-stack.ts  # Main stack definition
├── website/               # Static website content
│   ├── index.html        # Main page
│   └── error.html        # Error page
├── deploy.sh             # Full deployment script
├── sync-content.sh       # Content sync script
├── package.json          # Node.js dependencies
├── tsconfig.json         # TypeScript configuration
└── cdk.json             # CDK configuration
```

## Initial Deployment

1. Install dependencies:
   ```bash
   npm install
   ```

2. Deploy the infrastructure and initial content:
   ```bash
   ./deploy.sh
   ```

   This script will:
   - Build the CDK application
   - Bootstrap CDK in your AWS account (if needed)
   - Deploy the CloudFormation stack
   - Upload website content to S3
   - Invalidate CloudFront cache

3. **Important**: After deployment, you'll need to:
   - Note the nameservers from the stack outputs
   - Update your domain registrar to use these AWS Route 53 nameservers
   - Wait for DNS propagation (up to 48 hours, usually much faster)
   - SSL certificate validation will happen automatically via DNS

## Updating Website Content

To update your website content without redeploying infrastructure:

1. Modify files in the `./website` directory
2. Run the sync script:
   ```bash
   ./sync-content.sh
   ```
   Or use npm:
   ```bash
   npm run sync
   ```

## CDK Commands

- `npm run build` - Compile TypeScript to JavaScript
- `npm run deploy` - Build and deploy the CDK stack
- `npm run sync` - Sync website content to S3
- `npx cdk diff` - Compare deployed stack with current code
- `npx cdk synth` - Synthesize CloudFormation template
- `npx cdk destroy` - Remove all resources (use with caution!)

## Using Existing Route 53 Hosted Zone

If you already have a Route 53 hosted zone for mindstrike.ai, you can use it by providing the hosted zone ID:

```bash
npx cdk deploy -c hostedZoneId=YOUR_HOSTED_ZONE_ID
```

## Architecture

The infrastructure includes:

1. **S3 Bucket**: Stores website files with versioning enabled
2. **CloudFront Distribution**: 
   - Global CDN with HTTPS enforcement
   - Custom domain names (mindstrike.ai and www.mindstrike.ai)
   - Optimized caching policies
   - HTTP/2 and HTTP/3 support
3. **Route 53**: DNS records pointing to CloudFront
4. **ACM Certificate**: SSL/TLS certificate for HTTPS
5. **Origin Access Identity**: Secure access between CloudFront and S3

## Costs

Estimated monthly costs (varies by usage):
- Route 53 Hosted Zone: ~$0.50
- S3 Storage: ~$0.02 (for small sites)
- CloudFront: ~$0.10-$1.00 (depends on traffic)
- ACM Certificate: Free
- Data transfer: Varies by traffic

## Security Features

- S3 bucket is private (no direct public access)
- CloudFront OAI ensures only CDN can access S3
- HTTPS enforced with modern TLS protocols
- Content versioning in S3
- CloudFront security headers

## Troubleshooting

- **DNS not resolving**: Ensure nameservers are updated at your registrar
- **SSL certificate pending**: Check Route 53 for validation records
- **Content not updating**: CloudFront cache invalidation may take a few minutes
- **Stack deployment fails**: Check AWS credentials and permissions

## Clean Up

To remove all resources:
```bash
npx cdk destroy
```

Note: This will delete the S3 bucket and all website content!