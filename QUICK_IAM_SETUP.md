# Quick IAM Setup - Copy & Paste Guide

## Fastest Setup (Administrator Access)

Follow these exact steps in the AWS Console:

### 1. Open IAM Users Page
Go to: https://console.aws.amazon.com/iam/home#/users

### 2. Click "Create user"

### 3. Set User Details
- **User name:** `sengac-deploy`
- Click **"Next"**

### 4. Set Permissions
- Select: **"Attach policies directly"**
- In the search box, type: `AdministratorAccess`
- ✅ Check the box next to **"AdministratorAccess"**
- Click **"Next"**

### 5. Review and Create
- Click **"Create user"**

### 6. Create Access Keys
You'll be on the user list page. Now:

1. Click on **`sengac-deploy`** (the user you just created)
2. Click the **"Security credentials"** tab
3. Scroll down to **"Access keys"**
4. Click **"Create access key"**
5. Select **"Command Line Interface (CLI)"**
6. ✅ Check **"I understand the above recommendation"**
7. Click **"Next"**
8. Description (optional): `CDK deployment`
9. Click **"Create access key"**

### 7. Save Your Credentials

⚠️ **IMPORTANT: Save these NOW - you won't see the secret again!**

Copy these somewhere safe:
- **Access key ID:** `AKIA...` (will start with AKIA)
- **Secret access key:** `[40 characters]`

Click **"Download .csv file"** to save a backup.

### 8. Configure Your Local AWS CLI

In your terminal, run:
```bash
cd /home/rquast/projects/sengac.com
./configure-aws.sh
```

When prompted, paste:
- **AWS Access Key ID:** [paste your AKIA... key]
- **AWS Secret Access Key:** [paste your 40-character secret]
- **Default region name:** `us-east-1`
- **Default output format:** `json`

### 9. Deploy Your Website

```bash
./deploy.sh
```

---

## That's it! 🎉

Your website will be deployed to AWS. The first deployment takes about 10-15 minutes.

---

## Alternative: Custom Policy (More Secure)

If you want to use minimal permissions instead of AdministratorAccess:

### After Step 3 Above:
- Select: **"Attach policies directly"**
- Click **"Create policy"**
- Click **"JSON"** tab
- **DELETE** everything in the editor
- **COPY & PASTE** the entire contents from: `iam-policies/cdk-deploy-policy.json`
- Click **"Next"**
- **Policy name:** `SengacDeployPolicy`
- Click **"Create policy"**
- Go back to the user creation tab
- Search for: `SengacDeployPolicy`
- ✅ Check the box
- Continue from Step 5 above

---

## Troubleshooting

**"Access Denied" during deployment?**
- Make sure you selected AdministratorAccess (or your custom policy)
- Verify your AWS CLI is configured: `aws sts get-caller-identity`

**Wrong region?**
- The stack MUST deploy to us-east-1: `aws configure set region us-east-1`