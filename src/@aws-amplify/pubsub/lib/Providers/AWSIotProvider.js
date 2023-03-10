"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var tslib_1 = require("tslib");
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
var MqttOverWSProvider_1 = require("./MqttOverWSProvider");
var core_1 = require("@aws-amplify/core");
var SERVICE_NAME = 'iotdevicegateway';
var AWSIoTProvider = /** @class */ (function (_super) {
    tslib_1.__extends(AWSIoTProvider, _super);
    function AWSIoTProvider(options) {
        if (options === void 0) { options = {}; }
        return _super.call(this, options) || this;
    }
    Object.defineProperty(AWSIoTProvider.prototype, "region", {
        get: function () {
            return this.options['aws_pubsub_region'];
        },
        enumerable: true,
        configurable: true
    });
    AWSIoTProvider.prototype.getProviderName = function () {
        return 'AWSIoTProvider';
    };
    Object.defineProperty(AWSIoTProvider.prototype, "endpoint", {
        get: function () {
            var _this = this;
            return (function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                var endpoint, serviceInfo, _a, access_key, secret_key, session_token, result;
                return tslib_1.__generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            endpoint = this.options.aws_pubsub_endpoint;
                            serviceInfo = {
                                service: SERVICE_NAME,
                                region: this.region,
                            };
                            return [4 /*yield*/, core_1.Credentials.get()];
                        case 1:
                            _a = _b.sent(), access_key = _a.accessKeyId, secret_key = _a.secretAccessKey, session_token = _a.sessionToken;
                            result = core_1.Signer.signUrl(endpoint, { access_key: access_key, secret_key: secret_key, session_token: session_token }, serviceInfo);
                            return [2 /*return*/, result];
                    }
                });
            }); })();
        },
        enumerable: true,
        configurable: true
    });
    return AWSIoTProvider;
}(MqttOverWSProvider_1.MqttOverWSProvider));
exports.AWSIoTProvider = AWSIoTProvider;
//# sourceMappingURL=AWSIotProvider.js.map