# IAM User Setup Guide for AWS CDK Deployment

This guide will walk you through creating an IAM user with the necessary permissions to deploy the mindstrike.ai infrastructure.

## Quick Setup (Administrator Access)

For the simplest setup during development, you can create a user with Administrator access:

### Step 1: Create IAM User

1. **Log in to AWS Console**: https://console.aws.amazon.com/
2. **Navigate to IAM**: Services → IAM (or search "IAM" in the search bar)
3. **Create User**:
   - Click "Users" in the left sidebar
   - Click "Create user" button
   - User name: `mindstrike-cdk-deploy`
   - Click "Next"

### Step 2: Set Permissions

1. **Select**: "Attach policies directly"
2. **Search for**: `AdministratorAccess`
3. **Check the box** next to "AdministratorAccess"
4. Click "Next"
5. Click "Create user"

### Step 3: Create Access Keys

1. **Click on the username** `mindstrike-cdk-deploy` you just created
2. Go to **"Security credentials"** tab
3. Scroll to **"Access keys"** section
4. Click **"Create access key"**
5. Select **"Command Line Interface (CLI)"**
6. Check the confirmation box
7. Click **"Next"**
8. Optional: Add a description like "CDK deployment for mindstrike.ai"
9. Click **"Create access key"**
10. **IMPORTANT**: Save both the "Access key" and "Secret access key"
    - Click "Download .csv file" to save them
    - You won't be able to see the secret key again!

### Step 4: Configure AWS CLI

Run the configuration script:
```bash
./configure-aws.sh
```

Enter:
- AWS Access Key ID: [paste your access key]
- AWS Secret Access Key: [paste your secret key]
- Default region name: us-east-1
- Default output format: json

---

## Production Setup (Minimal Permissions)

For production, use the principle of least privilege with a custom policy:

### Step 1: Create Custom Policy

1. Go to IAM → Policies
2. Click "Create policy"
3. Click "JSON" tab
4. Copy and paste the contents from `iam-policies/cdk-deploy-policy.json`
5. Click "Next"
6. Policy name: `MindstrikeCDKDeployPolicy`
7. Description: "Permissions for deploying mindstrike.ai infrastructure via CDK"
8. Click "Create policy"

### Step 2: Create IAM User

1. Go to IAM → Users
2. Click "Create user"
3. User name: `mindstrike-cdk-deploy`
4. Click "Next"

### Step 3: Attach Custom Policy

1. Select "Attach policies directly"
2. Search for: `MindstrikeCDKDeployPolicy`
3. Check the box next to your custom policy
4. Click "Next"
5. Click "Create user"

### Step 4: Create Access Keys

Follow the same steps as in Quick Setup Step 3 above.

---

## Security Best Practices

1. **Rotate Keys Regularly**: Create new access keys every 90 days
2. **Use MFA**: Enable Multi-Factor Authentication for the AWS Console
3. **Restrict IP Access**: Consider adding IP restrictions to the IAM policy
4. **Use Temporary Credentials**: For enhanced security, use AWS STS temporary credentials
5. **Store Securely**: Never commit AWS credentials to Git
6. **Monitor Usage**: Enable CloudTrail to monitor API calls

## Verify Permissions

After configuration, test your setup:

```bash
# Test AWS credentials
aws sts get-caller-identity

# Test CDK bootstrap (one-time setup)
npx cdk bootstrap

# Deploy the stack
./deploy.sh
```

## Troubleshooting

### "Access Denied" Errors

If you encounter permission errors during deployment:

1. **For Quick Setup**: Ensure AdministratorAccess policy is attached
2. **For Production Setup**: Check that all required services are included in the policy
3. **Check Region**: Ensure you're deploying to us-east-1 (required for CloudFront)

### Common Issues

- **Invalid credentials**: Double-check access key and secret key
- **Wrong region**: CDK must deploy to us-east-1 for CloudFront
- **Policy not attached**: Verify the policy is attached to the user
- **Expired keys**: Check if access keys are still active in IAM console

## Cost Considerations

The IAM user itself has no cost, but be aware of costs for deployed resources:
- Route 53 Hosted Zone: ~$0.50/month
- S3 Storage: ~$0.023/GB/month
- CloudFront: Usage-based pricing
- ACM Certificate: Free

## Cleanup

To remove the IAM user when no longer needed:

1. Delete all access keys first
2. Detach all policies
3. Delete the user

Or keep the user but deactivate access keys when not in use.