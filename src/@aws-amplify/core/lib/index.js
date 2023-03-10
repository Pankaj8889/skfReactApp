"use strict";
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
Object.defineProperty(exports, "__esModule", { value: true });
var Amplify_1 = require("./Amplify");
var Platform_1 = require("./Platform");
var Amplify_2 = require("./Amplify");
exports.Amplify = Amplify_2.Amplify;
var Amplify_3 = require("./Amplify");
exports.AmplifyClass = Amplify_3.AmplifyClass;
var ClientDevice_1 = require("./ClientDevice");
exports.ClientDevice = ClientDevice_1.ClientDevice;
var Logger_1 = require("./Logger");
exports.ConsoleLogger = Logger_1.ConsoleLogger;
exports.Logger = Logger_1.ConsoleLogger;
var Errors_1 = require("./Errors");
exports.invalidParameter = Errors_1.invalidParameter;
exports.missingConfig = Errors_1.missingConfig;
var Hub_1 = require("./Hub");
exports.Hub = Hub_1.Hub;
var I18n_1 = require("./I18n");
exports.I18n = I18n_1.I18n;
var JS_1 = require("./JS");
exports.browserOrNode = JS_1.browserOrNode;
exports.filenameToContentType = JS_1.filenameToContentType;
exports.generateRandomString = JS_1.generateRandomString;
exports.isEmpty = JS_1.isEmpty;
exports.isStrictObject = JS_1.isStrictObject;
exports.isTextFile = JS_1.isTextFile;
exports.isWebWorker = JS_1.isWebWorker;
exports.makeQuerablePromise = JS_1.makeQuerablePromise;
exports.objectLessAttributes = JS_1.objectLessAttributes;
exports.sortByField = JS_1.sortByField;
exports.transferKeyToLowerCase = JS_1.transferKeyToLowerCase;
exports.transferKeyToUpperCase = JS_1.transferKeyToUpperCase;
var Signer_1 = require("./Signer");
exports.Signer = Signer_1.Signer;
var parseAWSExports_1 = require("./parseAWSExports");
exports.parseAWSExports = parseAWSExports_1.parseAWSExports;
var Providers_1 = require("./Providers");
exports.AWSCloudWatchProvider = Providers_1.AWSCloudWatchProvider;
var OAuthHelper_1 = require("./OAuthHelper");
exports.FacebookOAuth = OAuthHelper_1.FacebookOAuth;
exports.GoogleOAuth = OAuthHelper_1.GoogleOAuth;
var RNComponents_1 = require("./RNComponents");
exports.AppState = RNComponents_1.AppState;
exports.AsyncStorage = RNComponents_1.AsyncStorage;
exports.Linking = RNComponents_1.Linking;
var Credentials_1 = require("./Credentials");
exports.Credentials = Credentials_1.Credentials;
exports.CredentialsClass = Credentials_1.CredentialsClass;
var ServiceWorker_1 = require("./ServiceWorker");
exports.ServiceWorker = ServiceWorker_1.ServiceWorker;
var StorageHelper_1 = require("./StorageHelper");
exports.StorageHelper = StorageHelper_1.StorageHelper;
exports.MemoryStorage = StorageHelper_1.MemoryStorage;
var UniversalStorage_1 = require("./UniversalStorage");
exports.UniversalStorage = UniversalStorage_1.UniversalStorage;
var Platform_2 = require("./Platform");
exports.Platform = Platform_2.Platform;
exports.getAmplifyUserAgent = Platform_2.getAmplifyUserAgent;
var constants_1 = require("./constants");
exports.INTERNAL_AWS_APPSYNC_REALTIME_PUBSUB_PROVIDER = constants_1.INTERNAL_AWS_APPSYNC_REALTIME_PUBSUB_PROVIDER;
exports.USER_AGENT_HEADER = constants_1.USER_AGENT_HEADER;
exports.Constants = {
    userAgent: Platform_1.Platform.userAgent,
};
var Util_1 = require("./Util");
exports.AWS_CLOUDWATCH_BASE_BUFFER_SIZE = Util_1.AWS_CLOUDWATCH_BASE_BUFFER_SIZE;
exports.AWS_CLOUDWATCH_CATEGORY = Util_1.AWS_CLOUDWATCH_CATEGORY;
exports.AWS_CLOUDWATCH_MAX_BATCH_EVENT_SIZE = Util_1.AWS_CLOUDWATCH_MAX_BATCH_EVENT_SIZE;
exports.AWS_CLOUDWATCH_MAX_EVENT_SIZE = Util_1.AWS_CLOUDWATCH_MAX_EVENT_SIZE;
exports.AWS_CLOUDWATCH_PROVIDER_NAME = Util_1.AWS_CLOUDWATCH_PROVIDER_NAME;
exports.BackgroundManagerNotOpenError = Util_1.BackgroundManagerNotOpenError;
exports.BackgroundProcessManager = Util_1.BackgroundProcessManager;
exports.BackgroundProcessManagerState = Util_1.BackgroundProcessManagerState;
exports.DateUtils = Util_1.DateUtils;
exports.Mutex = Util_1.Mutex;
exports.NO_CREDS_ERROR_STRING = Util_1.NO_CREDS_ERROR_STRING;
exports.NonRetryableError = Util_1.NonRetryableError;
exports.RETRY_ERROR_CODES = Util_1.RETRY_ERROR_CODES;
exports.Reachability = Util_1.Reachability;
exports.isNonRetryableError = Util_1.isNonRetryableError;
exports.jitteredBackoff = Util_1.jitteredBackoff;
exports.jitteredExponentialRetry = Util_1.jitteredExponentialRetry;
exports.retry = Util_1.retry;
exports.urlSafeDecode = Util_1.urlSafeDecode;
exports.urlSafeEncode = Util_1.urlSafeEncode;
/**
 * @deprecated use named import
 */
exports.default = Amplify_1.Amplify;
//# sourceMappingURL=index.js.map