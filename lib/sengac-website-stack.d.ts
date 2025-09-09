import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
export interface SengacWebsiteStackProps extends cdk.StackProps {
    domainName: string;
    hostedZoneId?: string;
}
export declare class SengacWebsiteStack extends cdk.Stack {
    readonly bucketName: string;
    readonly distributionId: string;
    readonly distributionDomainName: string;
    constructor(scope: Construct, id: string, props: SengacWebsiteStackProps);
}
