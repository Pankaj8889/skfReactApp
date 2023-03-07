import { __awaiter, __generator } from "tslib";
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { ConsoleLogger as Logger } from '../Logger';
import { browserOrNode } from '../JS';
import { NonRetryableError } from '../Util';
var logger = new Logger('CognitoCredentials');
var waitForInit = new Promise(function (res, rej) {
    if (!browserOrNode().isBrowser) {
        logger.debug('not in the browser, directly resolved');
        return res();
    }
    var ga = window['gapi'] && window['gapi'].auth2 ? window['gapi'].auth2 : null;
    if (ga) {
        logger.debug('google api already loaded');
        return res();
    }
    else {
        setTimeout(function () {
            return res();
        }, 2000);
    }
});
var GoogleOAuth = /** @class */ (function () {
    function GoogleOAuth() {
        this.initialized = false;
        this.refreshGoogleToken = this.refreshGoogleToken.bind(this);
        this._refreshGoogleTokenImpl = this._refreshGoogleTokenImpl.bind(this);
    }
    GoogleOAuth.prototype.refreshGoogleToken = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!!this.initialized) return [3 /*break*/, 2];
                        logger.debug('need to wait for the Google SDK loaded');
                        return [4 /*yield*/, waitForInit];
                    case 1:
                        _a.sent();
                        this.initialized = true;
                        logger.debug('finish waiting');
                        _a.label = 2;
                    case 2: return [2 /*return*/, this._refreshGoogleTokenImpl()];
                }
            });
        });
    };
    GoogleOAuth.prototype._refreshGoogleTokenImpl = function () {
        var ga = null;
        if (browserOrNode().isBrowser)
            ga = window['gapi'] && window['gapi'].auth2 ? window['gapi'].auth2 : null;
        if (!ga) {
            logger.debug('no gapi auth2 available');
            return Promise.reject('no gapi auth2 available');
        }
        return new Promise(function (res, rej) {
            ga.getAuthInstance()
                .then(function (googleAuth) {
                if (!googleAuth) {
                    logger.debug('google Auth undefined');
                    rej(new NonRetryableError('google Auth undefined'));
                }
                var googleUser = googleAuth.currentUser.get();
                // refresh the token
                if (googleUser.isSignedIn()) {
                    logger.debug('refreshing the google access token');
                    googleUser
                        .reloadAuthResponse()
                        .then(function (authResponse) {
                        var id_token = authResponse.id_token, expires_at = authResponse.expires_at;
                        res({ token: id_token, expires_at: expires_at });
                    })
                        .catch(function (err) {
                        if (err && err.error === 'network_error') {
                            // Not using NonRetryableError so handler will be retried
                            rej('Network error reloading google auth response');
                        }
                        else {
                            rej(new NonRetryableError('Failed to reload google auth response'));
                        }
                    });
                }
                else {
                    rej(new NonRetryableError('User is not signed in with Google'));
                }
            })
                .catch(function (err) {
                logger.debug('Failed to refresh google token', err);
                rej(new NonRetryableError('Failed to refresh google token'));
            });
        });
    };
    return GoogleOAuth;
}());
export { GoogleOAuth };
//# sourceMappingURL=GoogleOAuth.js.map