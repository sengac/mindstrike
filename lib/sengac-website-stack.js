"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SengacWebsiteStack = void 0;
const cdk = require("aws-cdk-lib");
const s3 = require("aws-cdk-lib/aws-s3");
const cloudfront = require("aws-cdk-lib/aws-cloudfront");
const cloudfrontOrigins = require("aws-cdk-lib/aws-cloudfront-origins");
const route53 = require("aws-cdk-lib/aws-route53");
const route53Targets = require("aws-cdk-lib/aws-route53-targets");
const acm = require("aws-cdk-lib/aws-certificatemanager");
const s3deploy = require("aws-cdk-lib/aws-s3-deployment");
class SengacWebsiteStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { domainName, hostedZoneId } = props;
        const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
            bucketName: `${domainName}-website-content`,
            websiteIndexDocument: 'index.html',
            websiteErrorDocument: 'error.html',
            publicReadAccess: false,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            versioned: true,
            cors: [
                {
                    allowedHeaders: ['*'],
                    allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
                    allowedOrigins: ['*'],
                    exposedHeaders: [],
                },
            ],
        });
        let hostedZone;
        let certificate;
        if (hostedZoneId) {
            hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
                hostedZoneId: hostedZoneId,
                zoneName: domainName,
            });
        }
        else {
            hostedZone = new route53.HostedZone(this, 'HostedZone', {
                zoneName: domainName,
                comment: `Hosted zone for ${domainName}`,
            });
            new cdk.CfnOutput(this, 'NameServers', {
                value: cdk.Fn.join(', ', hostedZone.hostedZoneNameServers),
                description: 'Name servers for the hosted zone - configure these with your domain registrar',
            });
        }
        certificate = new acm.Certificate(this, 'Certificate', {
            domainName: domainName,
            subjectAlternativeNames: [`www.${domainName}`],
            validation: acm.CertificateValidation.fromDns(hostedZone),
        });
        const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OriginAccessIdentity', {
            comment: `OAI for ${domainName}`,
        });
        websiteBucket.grantRead(originAccessIdentity);
        const distribution = new cloudfront.Distribution(this, 'Distribution', {
            defaultBehavior: {
                origin: new cloudfrontOrigins.S3Origin(websiteBucket, {
                    originAccessIdentity: originAccessIdentity,
                }),
                compress: true,
                allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
            },
            domainNames: [domainName, `www.${domainName}`],
            certificate: certificate,
            defaultRootObject: 'index.html',
            minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
            errorResponses: [
                {
                    httpStatus: 403,
                    responseHttpStatus: 200,
                    responsePagePath: '/index.html',
                    ttl: cdk.Duration.minutes(5),
                },
                {
                    httpStatus: 404,
                    responseHttpStatus: 200,
                    responsePagePath: '/index.html',
                    ttl: cdk.Duration.minutes(5),
                },
            ],
            priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
            enabled: true,
            httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
        });
        new route53.ARecord(this, 'AliasRecord', {
            zone: hostedZone,
            recordName: domainName,
            target: route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(distribution)),
        });
        new route53.ARecord(this, 'WwwAliasRecord', {
            zone: hostedZone,
            recordName: `www.${domainName}`,
            target: route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(distribution)),
        });
        new s3deploy.BucketDeployment(this, 'DeployWebsite', {
            sources: [s3deploy.Source.asset('./website')],
            destinationBucket: websiteBucket,
            distribution,
            distributionPaths: ['/*'],
        });
        this.bucketName = websiteBucket.bucketName;
        this.distributionId = distribution.distributionId;
        this.distributionDomainName = distribution.distributionDomainName;
        new cdk.CfnOutput(this, 'BucketName', {
            value: this.bucketName,
            description: 'Name of the S3 bucket',
        });
        new cdk.CfnOutput(this, 'DistributionId', {
            value: this.distributionId,
            description: 'CloudFront Distribution ID',
        });
        new cdk.CfnOutput(this, 'DistributionDomainName', {
            value: this.distributionDomainName,
            description: 'CloudFront Distribution Domain Name',
        });
        new cdk.CfnOutput(this, 'WebsiteURL', {
            value: `https://${domainName}`,
            description: 'Website URL',
        });
    }
}
exports.SengacWebsiteStack = SengacWebsiteStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VuZ2FjLXdlYnNpdGUtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzZW5nYWMtd2Vic2l0ZS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxtQ0FBbUM7QUFFbkMseUNBQXlDO0FBQ3pDLHlEQUF5RDtBQUN6RCx3RUFBd0U7QUFDeEUsbURBQW1EO0FBQ25ELGtFQUFrRTtBQUNsRSwwREFBMEQ7QUFDMUQsMERBQTBEO0FBTzFELE1BQWEsa0JBQW1CLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFLL0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUE4QjtRQUN0RSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBRSxHQUFHLEtBQUssQ0FBQztRQUUzQyxNQUFNLGFBQWEsR0FBRyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUN6RCxVQUFVLEVBQUUsR0FBRyxVQUFVLGtCQUFrQjtZQUMzQyxvQkFBb0IsRUFBRSxZQUFZO1lBQ2xDLG9CQUFvQixFQUFFLFlBQVk7WUFDbEMsZ0JBQWdCLEVBQUUsS0FBSztZQUN2QixpQkFBaUIsRUFBRSxFQUFFLENBQUMsaUJBQWlCLENBQUMsU0FBUztZQUNqRCxhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1lBQ3hDLGlCQUFpQixFQUFFLElBQUk7WUFDdkIsU0FBUyxFQUFFLElBQUk7WUFDZixJQUFJLEVBQUU7Z0JBQ0o7b0JBQ0UsY0FBYyxFQUFFLENBQUMsR0FBRyxDQUFDO29CQUNyQixjQUFjLEVBQUUsQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQztvQkFDekQsY0FBYyxFQUFFLENBQUMsR0FBRyxDQUFDO29CQUNyQixjQUFjLEVBQUUsRUFBRTtpQkFDbkI7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QUUsZ0JBQWdCLEVBQUU7WUFDeEMsS0FBSyxFQUFFLElBQUksQ0FBQyxjQUFjO1lBQzFCLFdBQVcsRUFBRSw0QkFBNEI7U0FDMUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSx3QkFBd0IsRUFBRTtZQUNoRCxLQUFLLEVBQUUsSUFBSSxDQUFDLHNCQUFzQjtZQUNsQyxXQUFXLEVBQUUscUNBQXFDO1NBQ25ELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFO1lBQ3BDLEtBQUssRUFBRSxXQUFXLFVBQVUsRUFBRTtZQUM5QixXQUFXLEVBQUUsYUFBYTtTQUMzQixDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFqSkQsZ0RBaUpDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIGNsb3VkZnJvbnQgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQnO1xuaW1wb3J0ICogYXMgY2xvdWRmcm9udE9yaWdpbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQtb3JpZ2lucyc7XG5pbXBvcnQgKiBhcyByb3V0ZTUzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzJztcbmltcG9ydCAqIGFzIHJvdXRlNTNUYXJnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzLXRhcmdldHMnO1xuaW1wb3J0ICogYXMgYWNtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jZXJ0aWZpY2F0ZW1hbmFnZXInO1xuaW1wb3J0ICogYXMgczNkZXBsb3kgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzLWRlcGxveW1lbnQnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNlbmdhY1dlYnNpdGVTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBkb21haW5OYW1lOiBzdHJpbmc7XG4gIGhvc3RlZFpvbmVJZD86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIFNlbmdhY1dlYnNpdGVTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIHB1YmxpYyByZWFkb25seSBidWNrZXROYW1lOiBzdHJpbmc7XG4gIHB1YmxpYyByZWFkb25seSBkaXN0cmlidXRpb25JZDogc3RyaW5nO1xuICBwdWJsaWMgcmVhZG9ubHkgZGlzdHJpYnV0aW9uRG9tYWluTmFtZTogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTZW5nYWNXZWJzaXRlU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgY29uc3QgeyBkb21haW5OYW1lLCBob3N0ZWRab25lSWQgfSA9IHByb3BzO1xuXG4gICAgY29uc3Qgd2Vic2l0ZUJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ1dlYnNpdGVCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgJHtkb21haW5OYW1lfS13ZWJzaXRlLWNvbnRlbnRgLFxuICAgICAgd2Vic2l0ZUluZGV4RG9jdW1lbnQ6ICdpbmRleC5odG1sJyxcbiAgICAgIHdlYnNpdGVFcnJvckRvY3VtZW50OiAnZXJyb3IuaHRtbCcsXG4gICAgICBwdWJsaWNSZWFkQWNjZXNzOiBmYWxzZSxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXG4gICAgICB2ZXJzaW9uZWQ6IHRydWUsXG4gICAgICBjb3JzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhbGxvd2VkSGVhZGVyczogWycqJ10sXG4gICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IFtzMy5IdHRwTWV0aG9kcy5HRVQsIHMzLkh0dHBNZXRob2RzLkhFQURdLFxuICAgICAgICAgIGFsbG93ZWRPcmlnaW5zOiBbJyonXSxcbiAgICAgICAgICBleHBvc2VkSGVhZGVyczogW10sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgbGV0IGhvc3RlZFpvbmU6IHJvdXRlNTMuSUhvc3RlZFpvbmUgfCB1bmRlZmluZWQ7XG4gICAgbGV0IGNlcnRpZmljYXRlOiBhY20uSUNlcnRpZmljYXRlIHwgdW5kZWZpbmVkO1xuXG4gICAgaWYgKGhvc3RlZFpvbmVJZCkge1xuICAgICAgaG9zdGVkWm9uZSA9IHJvdXRlNTMuSG9zdGVkWm9uZS5mcm9tSG9zdGVkWm9uZUF0dHJpYnV0ZXModGhpcywgJ0hvc3RlZFpvbmUnLCB7XG4gICAgICAgIGhvc3RlZFpvbmVJZDogaG9zdGVkWm9uZUlkLFxuICAgICAgICB6b25lTmFtZTogZG9tYWluTmFtZSxcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBob3N0ZWRab25lID0gbmV3IHJvdXRlNTMuSG9zdGVkWm9uZSh0aGlzLCAnSG9zdGVkWm9uZScsIHtcbiAgICAgICAgem9uZU5hbWU6IGRvbWFpbk5hbWUsXG4gICAgICAgIGNvbW1lbnQ6IGBIb3N0ZWQgem9uZSBmb3IgJHtkb21haW5OYW1lfWAsXG4gICAgICB9KTtcblxuICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ05hbWVTZXJ2ZXJzJywge1xuICAgICAgICB2YWx1ZTogY2RrLkZuLmpvaW4oJywgJywgaG9zdGVkWm9uZS5ob3N0ZWRab25lTmFtZVNlcnZlcnMhKSxcbiAgICAgICAgZGVzY3JpcHRpb246ICdOYW1lIHNlcnZlcnMgZm9yIHRoZSBob3N0ZWQgem9uZSAtIGNvbmZpZ3VyZSB0aGVzZSB3aXRoIHlvdXIgZG9tYWluIHJlZ2lzdHJhcicsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjZXJ0aWZpY2F0ZSA9IG5ldyBhY20uQ2VydGlmaWNhdGUodGhpcywgJ0NlcnRpZmljYXRlJywge1xuICAgICAgZG9tYWluTmFtZTogZG9tYWluTmFtZSxcbiAgICAgIHN1YmplY3RBbHRlcm5hdGl2ZU5hbWVzOiBbYHd3dy4ke2RvbWFpbk5hbWV9YF0sXG4gICAgICB2YWxpZGF0aW9uOiBhY20uQ2VydGlmaWNhdGVWYWxpZGF0aW9uLmZyb21EbnMoaG9zdGVkWm9uZSksXG4gICAgfSk7XG5cbiAgICBjb25zdCBvcmlnaW5BY2Nlc3NJZGVudGl0eSA9IG5ldyBjbG91ZGZyb250Lk9yaWdpbkFjY2Vzc0lkZW50aXR5KFxuICAgICAgdGhpcyxcbiAgICAgICdPcmlnaW5BY2Nlc3NJZGVudGl0eScsXG4gICAgICB7XG4gICAgICAgIGNvbW1lbnQ6IGBPQUkgZm9yICR7ZG9tYWluTmFtZX1gLFxuICAgICAgfVxuICAgICk7XG5cbiAgICB3ZWJzaXRlQnVja2V0LmdyYW50UmVhZChvcmlnaW5BY2Nlc3NJZGVudGl0eSk7XG5cbiAgICBjb25zdCBkaXN0cmlidXRpb24gPSBuZXcgY2xvdWRmcm9udC5EaXN0cmlidXRpb24odGhpcywgJ0Rpc3RyaWJ1dGlvbicsIHtcbiAgICAgIGRlZmF1bHRCZWhhdmlvcjoge1xuICAgICAgICBvcmlnaW46IG5ldyBjbG91ZGZyb250T3JpZ2lucy5TM09yaWdpbih3ZWJzaXRlQnVja2V0LCB7XG4gICAgICAgICAgb3JpZ2luQWNjZXNzSWRlbnRpdHk6IG9yaWdpbkFjY2Vzc0lkZW50aXR5LFxuICAgICAgICB9KSxcbiAgICAgICAgY29tcHJlc3M6IHRydWUsXG4gICAgICAgIGFsbG93ZWRNZXRob2RzOiBjbG91ZGZyb250LkFsbG93ZWRNZXRob2RzLkFMTE9XX0dFVF9IRUFEX09QVElPTlMsXG4gICAgICAgIHZpZXdlclByb3RvY29sUG9saWN5OiBjbG91ZGZyb250LlZpZXdlclByb3RvY29sUG9saWN5LlJFRElSRUNUX1RPX0hUVFBTLFxuICAgICAgICBjYWNoZVBvbGljeTogY2xvdWRmcm9udC5DYWNoZVBvbGljeS5DQUNISU5HX09QVElNSVpFRCxcbiAgICAgIH0sXG4gICAgICBkb21haW5OYW1lczogW2RvbWFpbk5hbWUsIGB3d3cuJHtkb21haW5OYW1lfWBdLFxuICAgICAgY2VydGlmaWNhdGU6IGNlcnRpZmljYXRlLFxuICAgICAgZGVmYXVsdFJvb3RPYmplY3Q6ICdpbmRleC5odG1sJyxcbiAgICAgIG1pbmltdW1Qcm90b2NvbFZlcnNpb246IGNsb3VkZnJvbnQuU2VjdXJpdHlQb2xpY3lQcm90b2NvbC5UTFNfVjFfMl8yMDIxLFxuICAgICAgZXJyb3JSZXNwb25zZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGh0dHBTdGF0dXM6IDQwMyxcbiAgICAgICAgICByZXNwb25zZUh0dHBTdGF0dXM6IDIwMCxcbiAgICAgICAgICByZXNwb25zZVBhZ2VQYXRoOiAnL2luZGV4Lmh0bWwnLFxuICAgICAgICAgIHR0bDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBodHRwU3RhdHVzOiA0MDQsXG4gICAgICAgICAgcmVzcG9uc2VIdHRwU3RhdHVzOiAyMDAsXG4gICAgICAgICAgcmVzcG9uc2VQYWdlUGF0aDogJy9pbmRleC5odG1sJyxcbiAgICAgICAgICB0dGw6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIHByaWNlQ2xhc3M6IGNsb3VkZnJvbnQuUHJpY2VDbGFzcy5QUklDRV9DTEFTU18xMDAsXG4gICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgaHR0cFZlcnNpb246IGNsb3VkZnJvbnQuSHR0cFZlcnNpb24uSFRUUDJfQU5EXzMsXG4gICAgfSk7XG5cbiAgICBuZXcgcm91dGU1My5BUmVjb3JkKHRoaXMsICdBbGlhc1JlY29yZCcsIHtcbiAgICAgIHpvbmU6IGhvc3RlZFpvbmUsXG4gICAgICByZWNvcmROYW1lOiBkb21haW5OYW1lLFxuICAgICAgdGFyZ2V0OiByb3V0ZTUzLlJlY29yZFRhcmdldC5mcm9tQWxpYXMoXG4gICAgICAgIG5ldyByb3V0ZTUzVGFyZ2V0cy5DbG91ZEZyb250VGFyZ2V0KGRpc3RyaWJ1dGlvbilcbiAgICAgICksXG4gICAgfSk7XG5cbiAgICBuZXcgcm91dGU1My5BUmVjb3JkKHRoaXMsICdXd3dBbGlhc1JlY29yZCcsIHtcbiAgICAgIHpvbmU6IGhvc3RlZFpvbmUsXG4gICAgICByZWNvcmROYW1lOiBgd3d3LiR7ZG9tYWluTmFtZX1gLFxuICAgICAgdGFyZ2V0OiByb3V0ZTUzLlJlY29yZFRhcmdldC5mcm9tQWxpYXMoXG4gICAgICAgIG5ldyByb3V0ZTUzVGFyZ2V0cy5DbG91ZEZyb250VGFyZ2V0KGRpc3RyaWJ1dGlvbilcbiAgICAgICksXG4gICAgfSk7XG5cbiAgICBuZXcgczNkZXBsb3kuQnVja2V0RGVwbG95bWVudCh0aGlzLCAnRGVwbG95V2Vic2l0ZScsIHtcbiAgICAgIHNvdXJjZXM6IFtzM2RlcGxveS5Tb3VyY2UuYXNzZXQoJy4vd2Vic2l0ZScpXSxcbiAgICAgIGRlc3RpbmF0aW9uQnVja2V0OiB3ZWJzaXRlQnVja2V0LFxuICAgICAgZGlzdHJpYnV0aW9uLFxuICAgICAgZGlzdHJpYnV0aW9uUGF0aHM6IFsnLyonXSxcbiAgICB9KTtcblxuICAgIHRoaXMuYnVja2V0TmFtZSA9IHdlYnNpdGVCdWNrZXQuYnVja2V0TmFtZTtcbiAgICB0aGlzLmRpc3RyaWJ1dGlvbklkID0gZGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbklkO1xuICAgIHRoaXMuZGlzdHJpYnV0aW9uRG9tYWluTmFtZSA9IGRpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0J1Y2tldE5hbWUnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5idWNrZXROYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSBTMyBidWNrZXQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Rpc3RyaWJ1dGlvbklkJywge1xuICAgICAgdmFsdWU6IHRoaXMuZGlzdHJpYnV0aW9uSWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0Nsb3VkRnJvbnQgRGlzdHJpYnV0aW9uIElEJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEaXN0cmlidXRpb25Eb21haW5OYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMuZGlzdHJpYnV0aW9uRG9tYWluTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ2xvdWRGcm9udCBEaXN0cmlidXRpb24gRG9tYWluIE5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1dlYnNpdGVVUkwnLCB7XG4gICAgICB2YWx1ZTogYGh0dHBzOi8vJHtkb21haW5OYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ1dlYnNpdGUgVVJMJyxcbiAgICB9KTtcbiAgfVxufSJdfQ==