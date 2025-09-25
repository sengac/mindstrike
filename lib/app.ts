#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MindstrikeWebsiteStack } from './mindstrike-website-stack';

const app = new cdk.App();

const domainName = 'mindstrike.ai';

const hostedZoneId = app.node.tryGetContext('hostedZoneId');

new MindstrikeWebsiteStack(app, 'MindstrikeWebsiteStack', {
  domainName: domainName,
  hostedZoneId: hostedZoneId,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },
  description: 'Static website hosting for mindstrike.ai with CloudFront, S3, and Route53',
});