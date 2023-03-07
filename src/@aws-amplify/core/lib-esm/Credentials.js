import { __assign, __awaiter, __generator } from "tslib";
import { ConsoleLogger as Logger } from './Logger';
import { StorageHelper } from './StorageHelper';
import { makeQuerablePromise } from './JS';
import { FacebookOAuth, GoogleOAuth } from './OAuthHelper';
import { jitteredExponentialRetry } from './Util';
import { Amplify } from './Amplify';
import { fromCognitoIdentity, fromCognitoIdentityPool, } from '@aws-sdk/credential-provider-cognito-identity';
import { GetIdCommand, GetCredentialsForIdentityCommand, } from '@aws-sdk/client-cognito-identity';
import { parseAWSExports } from './parseAWSExports';
import { Hub } from './Hub';
import { createCognitoIdentityClient } from './Util/CognitoIdentityClient';
var logger = new Logger('Credentials');
var CREDENTIALS_TTL = 50 * 60 * 1000; // 50 min, can be modified on config if required in the future
var COGNITO_IDENTITY_KEY_PREFIX = 'CognitoIdentityId-';
var AMPLIFY_SYMBOL = (typeof Symbol !== 'undefined' && typeof Symbol.for === 'function'
    ? Symbol.for('amplify_default')
    : '@@amplify_default');
var dispatchCredentialsEvent = function (event, data, message) {
    Hub.dispatch('core', { event: event, data: data, message: message }, 'Credentials', AMPLIFY_SYMBOL);
};
var CredentialsClass = /** @class */ (function () {
    function CredentialsClass(config) {
        this._gettingCredPromise = null;
        this._refreshHandlers = {};
        // Allow `Auth` to be injected for SSR, but Auth isn't a required dependency for Credentials
        this.Auth = undefined;
        this.configure(config);
        this._refreshHandlers['google'] = GoogleOAuth.refreshGoogleToken;
        this._refreshHandlers['facebook'] = FacebookOAuth.refreshFacebookToken;
    }
    CredentialsClass.prototype.getModuleName = function () {
        return 'Credentials';
    };
    CredentialsClass.prototype.getCredSource = function () {
        return this._credentials_source;
    };
    CredentialsClass.prototype.configure = function (config) {
        if (!config)
            return this._config || {};
        this._config = Object.assign({}, this._config, config);
        var refreshHandlers = this._config.refreshHandlers;
        // If the developer has provided an object of refresh handlers,
        // then we can merge the provided handlers with the current handlers.
        if (refreshHandlers) {
            this._refreshHandlers = __assign(__assign({}, this._refreshHandlers), refreshHandlers);
        }
        this._storage = this._config.storage;
        if (!this._storage) {
            this._storage = new StorageHelper().getStorage();
        }
        this._storageSync = Promise.resolve();
        if (typeof this._storage['sync'] === 'function') {
            this._storageSync = this._storage['sync']();
        }
        dispatchCredentialsEvent('credentials_configured', null, "Credentials has been configured successfully");
        return this._config;
    };
    CredentialsClass.prototype.get = function () {
        logger.debug('getting credentials');
        return this._pickupCredentials();
    };
    // currently we only store the guest identity in local storage
    CredentialsClass.prototype._getCognitoIdentityIdStorageKey = function (identityPoolId) {
        return "" + COGNITO_IDENTITY_KEY_PREFIX + identityPoolId;
    };
    CredentialsClass.prototype._pickupCredentials = function () {
        logger.debug('picking up credentials');
        if (!this._gettingCredPromise || !this._gettingCredPromise.isPending()) {
            logger.debug('getting new cred promise');
            this._gettingCredPromise = makeQuerablePromise(this._keepAlive());
        }
        else {
            logger.debug('getting old cred promise');
        }
        return this._gettingCredPromise;
    };
    CredentialsClass.prototype._keepAlive = function () {
        return __awaiter(this, void 0, void 0, function () {
            var cred, _a, Auth, user_1, session, refreshToken_1, refreshRequest, err_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        logger.debug('checking if credentials exists and not expired');
                        cred = this._credentials;
                        if (cred && !this._isExpired(cred) && !this._isPastTTL()) {
                            logger.debug('credentials not changed and not expired, directly return');
                            return [2 /*return*/, Promise.resolve(cred)];
                        }
                        logger.debug('need to get a new credential or refresh the existing one');
                        _a = this.Auth, Auth = _a === void 0 ? Amplify.Auth : _a;
                        if (!Auth || typeof Auth.currentUserCredentials !== 'function') {
                            // If Auth module is not imported, do a best effort to get guest credentials
                            return [2 /*return*/, this._setCredentialsForGuest()];
                        }
                        if (!(!this._isExpired(cred) && this._isPastTTL())) return [3 /*break*/, 6];
                        logger.debug('ttl has passed but token is not yet expired');
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 5, , 6]);
                        return [4 /*yield*/, Auth.currentUserPoolUser()];
                    case 2:
                        user_1 = _b.sent();
                        return [4 /*yield*/, Auth.currentSession()];
                    case 3:
                        session = _b.sent();
                        refreshToken_1 = session.refreshToken;
                        refreshRequest = new Promise(function (res, rej) {
                            user_1.refreshSession(refreshToken_1, function (err, data) {
                                return err ? rej(err) : res(data);
                            });
                        });
                        return [4 /*yield*/, refreshRequest];
                    case 4:
                        _b.sent(); // note that rejections will be caught and handled in the catch block.
                        return [3 /*break*/, 6];
                    case 5:
                        err_1 = _b.sent();
                        // should not throw because user might just be on guest access or is authenticated through federation
                        logger.debug('Error attempting to refreshing the session', err_1);
                        return [3 /*break*/, 6];
                    case 6: return [2 /*return*/, Auth.currentUserCredentials()];
                }
            });
        });
    };
    CredentialsClass.prototype.refreshFederatedToken = function (federatedInfo) {
        logger.debug('Getting federated credentials');
        var provider = federatedInfo.provider, user = federatedInfo.user, token = federatedInfo.token, identity_id = federatedInfo.identity_id;
        var expires_at = federatedInfo.expires_at;
        // Make sure expires_at is in millis
        expires_at =
            new Date(expires_at).getFullYear() === 1970
                ? expires_at * 1000
                : expires_at;
        var that = this;
        logger.debug('checking if federated jwt token expired');
        if (expires_at > new Date().getTime()) {
            // if not expired
            logger.debug('token not expired');
            return this._setCredentialsFromFederation({
                provider: provider,
                token: token,
                user: user,
                identity_id: identity_id,
                expires_at: expires_at,
            });
        }
        else {
            // if refresh handler exists
            if (that._refreshHandlers[provider] &&
                typeof that._refreshHandlers[provider] === 'function') {
                logger.debug('getting refreshed jwt token from federation provider');
                return this._providerRefreshWithRetry({
                    refreshHandler: that._refreshHandlers[provider],
                    provider: provider,
                    user: user,
                });
            }
            else {
                logger.debug('no refresh handler for provider:', provider);
                this.clear();
                return Promise.reject('no refresh handler for provider');
            }
        }
    };
    CredentialsClass.prototype._providerRefreshWithRetry = function (_a) {
        var _this = this;
        var refreshHandler = _a.refreshHandler, provider = _a.provider, user = _a.user;
        var MAX_DELAY_MS = 10 * 1000;
        // refreshHandler will retry network errors, otherwise it will
        // return NonRetryableError to break out of jitteredExponentialRetry
        return jitteredExponentialRetry(refreshHandler, [], MAX_DELAY_MS)
            .then(function (data) {
            logger.debug('refresh federated token sucessfully', data);
            return _this._setCredentialsFromFederation({
                provider: provider,
                token: data.token,
                user: user,
                identity_id: data.identity_id,
                expires_at: data.expires_at,
            });
        })
            .catch(function (e) {
            var isNetworkError = typeof e === 'string' &&
                e.toLowerCase().lastIndexOf('network error', e.length) === 0;
            if (!isNetworkError) {
                _this.clear();
            }
            logger.debug('refresh federated token failed', e);
            return Promise.reject('refreshing federation token failed: ' + e);
        });
    };
    CredentialsClass.prototype._isExpired = function (credentials) {
        if (!credentials) {
            logger.debug('no credentials for expiration check');
            return true;
        }
        logger.debug('are these credentials expired?', credentials);
        var ts = Date.now();
        /* returns date object.
            https://github.com/aws/aws-sdk-js-v3/blob/v1.0.0-beta.1/packages/types/src/credentials.ts#L26
        */
        var expiration = credentials.expiration;
        return expiration.getTime() <= ts;
    };
    CredentialsClass.prototype._isPastTTL = function () {
        return this._nextCredentialsRefresh <= Date.now();
    };
    CredentialsClass.prototype._setCredentialsForGuest = function () {
        var _a;
        return __awaiter(this, void 0, void 0, function () {
            var _b, identityPoolId, region, mandatorySignIn, identityPoolRegion, identityId, _c, cognitoClient, credentials, cognitoIdentityParams, credentialsProvider;
            var _this = this;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        logger.debug('setting credentials for guest');
                        if (!((_a = this._config) === null || _a === void 0 ? void 0 : _a.identityPoolId)) {
                            // If Credentials are not configured thru Auth module,
                            // doing best effort to check if the library was configured
                            this._config = Object.assign({}, this._config, parseAWSExports(this._config || {}).Auth);
                        }
                        _b = this._config, identityPoolId = _b.identityPoolId, region = _b.region, mandatorySignIn = _b.mandatorySignIn, identityPoolRegion = _b.identityPoolRegion;
                        if (mandatorySignIn) {
                            return [2 /*return*/, Promise.reject('cannot get guest credentials when mandatory signin enabled')];
                        }
                        if (!identityPoolId) {
                            logger.debug('No Cognito Identity pool provided for unauthenticated access');
                            return [2 /*return*/, Promise.reject('No Cognito Identity pool provided for unauthenticated access')];
                        }
                        if (!identityPoolRegion && !region) {
                            logger.debug('region is not configured for getting the credentials');
                            return [2 /*return*/, Promise.reject('region is not configured for getting the credentials')];
                        }
                        _c = this;
                        return [4 /*yield*/, this._getGuestIdentityId()];
                    case 1:
                        identityId = (_c._identityId = _d.sent());
                        cognitoClient = createCognitoIdentityClient({
                            region: identityPoolRegion || region,
                        });
                        credentials = undefined;
                        if (identityId) {
                            cognitoIdentityParams = {
                                identityId: identityId,
                                client: cognitoClient,
                            };
                            credentials = fromCognitoIdentity(cognitoIdentityParams)();
                        }
                        else {
                            credentialsProvider = function () { return __awaiter(_this, void 0, void 0, function () {
                                var IdentityId, cognitoIdentityParams, credentialsFromCognitoIdentity;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, cognitoClient.send(new GetIdCommand({
                                                IdentityPoolId: identityPoolId,
                                            }))];
                                        case 1:
                                            IdentityId = (_a.sent()).IdentityId;
                                            this._identityId = IdentityId;
                                            cognitoIdentityParams = {
                                                client: cognitoClient,
                                                identityId: IdentityId,
                                            };
                                            credentialsFromCognitoIdentity = fromCognitoIdentity(cognitoIdentityParams);
                                            return [2 /*return*/, credentialsFromCognitoIdentity()];
                                    }
                                });
                            }); };
                            credentials = credentialsProvider().catch(function (err) { return __awaiter(_this, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    throw err;
                                });
                            }); });
                        }
                        return [2 /*return*/, this._loadCredentials(credentials, 'guest', false, null)
                                .then(function (res) {
                                return res;
                            })
                                .catch(function (e) { return __awaiter(_this, void 0, void 0, function () {
                                var credentialsProvider;
                                var _this = this;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            if (!(e.name === 'ResourceNotFoundException' &&
                                                e.message === "Identity '" + identityId + "' not found.")) return [3 /*break*/, 2];
                                            logger.debug('Failed to load guest credentials');
                                            return [4 /*yield*/, this._removeGuestIdentityId()];
                                        case 1:
                                            _a.sent();
                                            credentialsProvider = function () { return __awaiter(_this, void 0, void 0, function () {
                                                var IdentityId, cognitoIdentityParams, credentialsFromCognitoIdentity;
                                                return __generator(this, function (_a) {
                                                    switch (_a.label) {
                                                        case 0: return [4 /*yield*/, cognitoClient.send(new GetIdCommand({
                                                                IdentityPoolId: identityPoolId,
                                                            }))];
                                                        case 1:
                                                            IdentityId = (_a.sent()).IdentityId;
                                                            this._identityId = IdentityId;
                                                            cognitoIdentityParams = {
                                                                client: cognitoClient,
                                                                identityId: IdentityId,
                                                            };
                                                            credentialsFromCognitoIdentity = fromCognitoIdentity(cognitoIdentityParams);
                                                            return [2 /*return*/, credentialsFromCognitoIdentity()];
                                                    }
                                                });
                                            }); };
                                            credentials = credentialsProvider().catch(function (err) { return __awaiter(_this, void 0, void 0, function () {
                                                return __generator(this, function (_a) {
                                                    throw err;
                                                });
                                            }); });
                                            return [2 /*return*/, this._loadCredentials(credentials, 'guest', false, null)];
                                        case 2: return [2 /*return*/, e];
                                    }
                                });
                            }); })];
                }
            });
        });
    };
    CredentialsClass.prototype._setCredentialsFromFederation = function (params) {
        var provider = params.provider, token = params.token, identity_id = params.identity_id;
        var domains = {
            google: 'accounts.google.com',
            facebook: 'graph.facebook.com',
            amazon: 'www.amazon.com',
            developer: 'cognito-identity.amazonaws.com',
        };
        // Use custom provider url instead of the predefined ones
        var domain = domains[provider] || provider;
        if (!domain) {
            return Promise.reject('You must specify a federated provider');
        }
        var logins = {};
        logins[domain] = token;
        var _a = this._config, identityPoolId = _a.identityPoolId, region = _a.region, identityPoolRegion = _a.identityPoolRegion;
        if (!identityPoolId) {
            logger.debug('No Cognito Federated Identity pool provided');
            return Promise.reject('No Cognito Federated Identity pool provided');
        }
        if (!identityPoolRegion && !region) {
            logger.debug('region is not configured for getting the credentials');
            return Promise.reject('region is not configured for getting the credentials');
        }
        var cognitoClient = createCognitoIdentityClient({
            region: identityPoolRegion || region,
        });
        var credentials = undefined;
        if (identity_id) {
            var cognitoIdentityParams = {
                identityId: identity_id,
                logins: logins,
                client: cognitoClient,
            };
            credentials = fromCognitoIdentity(cognitoIdentityParams)();
        }
        else {
            var cognitoIdentityParams = {
                logins: logins,
                identityPoolId: identityPoolId,
                client: cognitoClient,
            };
            credentials = fromCognitoIdentityPool(cognitoIdentityParams)();
        }
        return this._loadCredentials(credentials, 'federated', true, params);
    };
    CredentialsClass.prototype._setCredentialsFromSession = function (session) {
        var _this = this;
        logger.debug('set credentials from session');
        var idToken = session.getIdToken().getJwtToken();
        var _a = this._config, region = _a.region, userPoolId = _a.userPoolId, identityPoolId = _a.identityPoolId, identityPoolRegion = _a.identityPoolRegion;
        if (!identityPoolId) {
            logger.debug('No Cognito Federated Identity pool provided');
            return Promise.reject('No Cognito Federated Identity pool provided');
        }
        if (!identityPoolRegion && !region) {
            logger.debug('region is not configured for getting the credentials');
            return Promise.reject('region is not configured for getting the credentials');
        }
        var key = 'cognito-idp.' + region + '.amazonaws.com/' + userPoolId;
        var logins = {};
        logins[key] = idToken;
        var cognitoClient = createCognitoIdentityClient({
            region: identityPoolRegion || region,
        });
        /*
            Retreiving identityId with GetIdCommand to mimic the behavior in the following code in aws-sdk-v3:
            https://git.io/JeDxU

            Note: Retreive identityId from CredentialsProvider once aws-sdk-js v3 supports this.
        */
        var credentialsProvider = function () { return __awaiter(_this, void 0, void 0, function () {
            var guestIdentityId, generatedOrRetrievedIdentityId, IdentityId, _a, _b, AccessKeyId, Expiration, SecretKey, SessionToken, primaryIdentityId;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, this._getGuestIdentityId()];
                    case 1:
                        guestIdentityId = _c.sent();
                        if (!!guestIdentityId) return [3 /*break*/, 3];
                        return [4 /*yield*/, cognitoClient.send(new GetIdCommand({
                                IdentityPoolId: identityPoolId,
                                Logins: logins,
                            }))];
                    case 2:
                        IdentityId = (_c.sent()).IdentityId;
                        generatedOrRetrievedIdentityId = IdentityId;
                        _c.label = 3;
                    case 3: return [4 /*yield*/, cognitoClient.send(new GetCredentialsForIdentityCommand({
                            IdentityId: guestIdentityId || generatedOrRetrievedIdentityId,
                            Logins: logins,
                        }))];
                    case 4:
                        _a = _c.sent(), _b = _a.Credentials, AccessKeyId = _b.AccessKeyId, Expiration = _b.Expiration, SecretKey = _b.SecretKey, SessionToken = _b.SessionToken, primaryIdentityId = _a.IdentityId;
                        this._identityId = primaryIdentityId;
                        if (!guestIdentityId) return [3 /*break*/, 6];
                        // if guestIdentity is found and used by GetCredentialsForIdentity
                        // it will be linked to the logins provided, and disqualified as an unauth identity
                        logger.debug("The guest identity " + guestIdentityId + " has been successfully linked to the logins");
                        if (guestIdentityId === primaryIdentityId) {
                            logger.debug("The guest identity " + guestIdentityId + " has become the primary identity");
                        }
                        // remove it from local storage to avoid being used as a guest Identity by _setCredentialsForGuest
                        return [4 /*yield*/, this._removeGuestIdentityId()];
                    case 5:
                        // remove it from local storage to avoid being used as a guest Identity by _setCredentialsForGuest
                        _c.sent();
                        _c.label = 6;
                    case 6: 
                    // https://github.com/aws/aws-sdk-js-v3/blob/main/packages/credential-provider-cognito-identity/src/fromCognitoIdentity.ts#L40
                    return [2 /*return*/, {
                            accessKeyId: AccessKeyId,
                            secretAccessKey: SecretKey,
                            sessionToken: SessionToken,
                            expiration: Expiration,
                            identityId: primaryIdentityId,
                        }];
                }
            });
        }); };
        var credentials = credentialsProvider().catch(function (err) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                throw err;
            });
        }); });
        return this._loadCredentials(credentials, 'userPool', true, null);
    };
    CredentialsClass.prototype._loadCredentials = function (credentials, source, authenticated, info) {
        var _this = this;
        var that = this;
        return new Promise(function (res, rej) {
            credentials
                .then(function (credentials) { return __awaiter(_this, void 0, void 0, function () {
                var user, provider, token, expires_at, identity_id;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            logger.debug('Load credentials successfully', credentials);
                            if (this._identityId && !credentials.identityId) {
                                credentials['identityId'] = this._identityId;
                            }
                            that._credentials = credentials;
                            that._credentials.authenticated = authenticated;
                            that._credentials_source = source;
                            that._nextCredentialsRefresh = new Date().getTime() + CREDENTIALS_TTL;
                            if (source === 'federated') {
                                user = Object.assign({ id: this._credentials.identityId }, info.user);
                                provider = info.provider, token = info.token, expires_at = info.expires_at, identity_id = info.identity_id;
                                try {
                                    this._storage.setItem('aws-amplify-federatedInfo', JSON.stringify({
                                        provider: provider,
                                        token: token,
                                        user: user,
                                        expires_at: expires_at,
                                        identity_id: identity_id,
                                    }));
                                }
                                catch (e) {
                                    logger.debug('Failed to put federated info into auth storage', e);
                                }
                            }
                            if (!(source === 'guest')) return [3 /*break*/, 2];
                            return [4 /*yield*/, this._setGuestIdentityId(credentials.identityId)];
                        case 1:
                            _a.sent();
                            _a.label = 2;
                        case 2:
                            res(that._credentials);
                            return [2 /*return*/];
                    }
                });
            }); })
                .catch(function (err) {
                if (err) {
                    logger.debug('Failed to load credentials', credentials);
                    logger.debug('Error loading credentials', err);
                    rej(err);
                    return;
                }
            });
        });
    };
    CredentialsClass.prototype.set = function (params, source) {
        if (source === 'session') {
            return this._setCredentialsFromSession(params);
        }
        else if (source === 'federation') {
            return this._setCredentialsFromFederation(params);
        }
        else if (source === 'guest') {
            return this._setCredentialsForGuest();
        }
        else {
            logger.debug('no source specified for setting credentials');
            return Promise.reject('invalid source');
        }
    };
    CredentialsClass.prototype.clear = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this._credentials = null;
                this._credentials_source = null;
                logger.debug('removing aws-amplify-federatedInfo from storage');
                this._storage.removeItem('aws-amplify-federatedInfo');
                return [2 /*return*/];
            });
        });
    };
    /* operations on local stored guest identity */
    CredentialsClass.prototype._getGuestIdentityId = function () {
        return __awaiter(this, void 0, void 0, function () {
            var identityPoolId, e_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        identityPoolId = this._config.identityPoolId;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this._storageSync];
                    case 2:
                        _a.sent();
                        return [2 /*return*/, this._storage.getItem(this._getCognitoIdentityIdStorageKey(identityPoolId))];
                    case 3:
                        e_1 = _a.sent();
                        logger.debug('Failed to get the cached guest identityId', e_1);
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    CredentialsClass.prototype._setGuestIdentityId = function (identityId) {
        return __awaiter(this, void 0, void 0, function () {
            var identityPoolId, e_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        identityPoolId = this._config.identityPoolId;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this._storageSync];
                    case 2:
                        _a.sent();
                        this._storage.setItem(this._getCognitoIdentityIdStorageKey(identityPoolId), identityId);
                        return [3 /*break*/, 4];
                    case 3:
                        e_2 = _a.sent();
                        logger.debug('Failed to cache guest identityId', e_2);
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    CredentialsClass.prototype._removeGuestIdentityId = function () {
        return __awaiter(this, void 0, void 0, function () {
            var identityPoolId;
            return __generator(this, function (_a) {
                identityPoolId = this._config.identityPoolId;
                logger.debug("removing " + this._getCognitoIdentityIdStorageKey(identityPoolId) + " from storage");
                this._storage.removeItem(this._getCognitoIdentityIdStorageKey(identityPoolId));
                return [2 /*return*/];
            });
        });
    };
    /**
     * Compact version of credentials
     * @param {Object} credentials
     * @return {Object} - Credentials
     */
    CredentialsClass.prototype.shear = function (credentials) {
        return {
            accessKeyId: credentials.accessKeyId,
            sessionToken: credentials.sessionToken,
            secretAccessKey: credentials.secretAccessKey,
            identityId: credentials.identityId,
            authenticated: credentials.authenticated,
        };
    };
    return CredentialsClass;
}());
export { CredentialsClass };
export var Credentials = new CredentialsClass(null);
Amplify.register(Credentials);
//# sourceMappingURL=Credentials.js.map