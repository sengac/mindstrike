#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SengacWebsiteStack } from './sengac-website-stack';

const app = new cdk.App();

const domainName = 'sengac.com';

const hostedZoneId = app.node.tryGetContext('hostedZoneId');

new SengacWebsiteStack(app, 'SengacWebsiteStack', {
  domainName: domainName,
  hostedZoneId: hostedZoneId,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },
  description: 'Static website hosting for sengac.com with CloudFront, S3, and Route53',
});