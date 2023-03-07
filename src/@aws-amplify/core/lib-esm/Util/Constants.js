// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
// Logging constants
var AWS_CLOUDWATCH_BASE_BUFFER_SIZE = 26;
var AWS_CLOUDWATCH_MAX_BATCH_EVENT_SIZE = 1048576;
var AWS_CLOUDWATCH_MAX_EVENT_SIZE = 256000;
var AWS_CLOUDWATCH_CATEGORY = 'Logging';
var AWS_CLOUDWATCH_PROVIDER_NAME = 'AWSCloudWatch';
var NO_CREDS_ERROR_STRING = 'No credentials';
var RETRY_ERROR_CODES = [
    'ResourceNotFoundException',
    'InvalidSequenceTokenException',
];
export { AWS_CLOUDWATCH_BASE_BUFFER_SIZE, AWS_CLOUDWATCH_CATEGORY, AWS_CLOUDWATCH_MAX_BATCH_EVENT_SIZE, AWS_CLOUDWATCH_MAX_EVENT_SIZE, AWS_CLOUDWATCH_PROVIDER_NAME, NO_CREDS_ERROR_STRING, RETRY_ERROR_CODES, };
//# sourceMappingURL=Constants.js.map