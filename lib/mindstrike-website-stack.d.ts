import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
export interface MindstrikeWebsiteStackProps extends cdk.StackProps {
    domainName: string;
    hostedZoneId?: string;
}
export declare class MindstrikeWebsiteStack extends cdk.Stack {
    readonly bucketName: string;
    readonly distributionId: string;
    readonly distributionDomainName: string;
    constructor(scope: Construct, id: string, props: MindstrikeWebsiteStackProps);
}
