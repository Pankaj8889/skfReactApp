import { __assign, __awaiter, __extends, __generator, __rest } from "tslib";
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import * as Paho from '../vendor/paho-mqtt';
import { v4 as uuid } from 'uuid';
import Observable from 'zen-observable-ts';
import { AbstractPubSubProvider } from './PubSubProvider';
import { ConnectionState, } from '../types/PubSub';
import { ConsoleLogger as Logger, Hub } from '@aws-amplify/core';
import { ConnectionStateMonitor, CONNECTION_CHANGE, } from '../utils/ConnectionStateMonitor';
import { ReconnectEvent, ReconnectionMonitor, } from '../utils/ReconnectionMonitor';
import { AMPLIFY_SYMBOL, CONNECTION_STATE_CHANGE } from './constants';
var logger = new Logger('MqttOverWSProvider');
export function mqttTopicMatch(filter, topic) {
    var filterArray = filter.split('/');
    var length = filterArray.length;
    var topicArray = topic.split('/');
    for (var i = 0; i < length; ++i) {
        var left = filterArray[i];
        var right = topicArray[i];
        if (left === '#')
            return topicArray.length >= length;
        if (left !== '+' && left !== right)
            return false;
    }
    return length === topicArray.length;
}
var ClientsQueue = /** @class */ (function () {
    function ClientsQueue() {
        this.promises = new Map();
    }
    ClientsQueue.prototype.get = function (clientId, clientFactory) {
        return __awaiter(this, void 0, void 0, function () {
            var cachedPromise, newPromise;
            var _this = this;
            return __generator(this, function (_a) {
                cachedPromise = this.promises.get(clientId);
                if (cachedPromise)
                    return [2 /*return*/, cachedPromise];
                if (clientFactory) {
                    newPromise = clientFactory(clientId);
                    this.promises.set(clientId, newPromise);
                    newPromise.catch(function () { return _this.promises.delete(clientId); });
                    return [2 /*return*/, newPromise];
                }
                return [2 /*return*/, undefined];
            });
        });
    };
    Object.defineProperty(ClientsQueue.prototype, "allClients", {
        get: function () {
            return Array.from(this.promises.keys());
        },
        enumerable: true,
        configurable: true
    });
    ClientsQueue.prototype.remove = function (clientId) {
        this.promises.delete(clientId);
    };
    return ClientsQueue;
}());
var dispatchPubSubEvent = function (event, data, message) {
    Hub.dispatch('pubsub', { event: event, data: data, message: message }, 'PubSub', AMPLIFY_SYMBOL);
};
var topicSymbol = typeof Symbol !== 'undefined' ? Symbol('topic') : '@@topic';
var MqttOverWSProvider = /** @class */ (function (_super) {
    __extends(MqttOverWSProvider, _super);
    function MqttOverWSProvider(options) {
        if (options === void 0) { options = {}; }
        var _this = _super.call(this, __assign(__assign({}, options), { clientId: options.clientId || uuid() })) || this;
        _this._clientsQueue = new ClientsQueue();
        _this.connectionStateMonitor = new ConnectionStateMonitor();
        _this.reconnectionMonitor = new ReconnectionMonitor();
        _this._topicObservers = new Map();
        _this._clientIdObservers = new Map();
        // Monitor the connection health state and pass changes along to Hub
        _this.connectionStateMonitor.connectionStateObservable.subscribe(function (connectionStateChange) {
            dispatchPubSubEvent(CONNECTION_STATE_CHANGE, {
                provider: _this,
                connectionState: connectionStateChange,
            }, "Connection state is " + connectionStateChange);
            _this.connectionState = connectionStateChange;
            // Trigger reconnection when the connection is disrupted
            if (connectionStateChange === ConnectionState.ConnectionDisrupted) {
                _this.reconnectionMonitor.record(ReconnectEvent.START_RECONNECT);
            }
            else if (connectionStateChange !== ConnectionState.Connecting) {
                // Trigger connected to halt reconnection attempts
                _this.reconnectionMonitor.record(ReconnectEvent.HALT_RECONNECT);
            }
        });
        return _this;
    }
    Object.defineProperty(MqttOverWSProvider.prototype, "clientId", {
        get: function () {
            return this.options.clientId;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(MqttOverWSProvider.prototype, "endpoint", {
        get: function () {
            return Promise.resolve(this.options.aws_pubsub_endpoint);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(MqttOverWSProvider.prototype, "clientsQueue", {
        get: function () {
            return this._clientsQueue;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(MqttOverWSProvider.prototype, "isSSLEnabled", {
        get: function () {
            return !this.options['aws_appsync_dangerously_connect_to_http_endpoint_for_testing'];
        },
        enumerable: true,
        configurable: true
    });
    MqttOverWSProvider.prototype.getProviderName = function () {
        return 'MqttOverWSProvider';
    };
    MqttOverWSProvider.prototype.onDisconnect = function (_a) {
        var clientId = _a.clientId, errorCode = _a.errorCode, args = __rest(_a, ["clientId", "errorCode"]);
        if (errorCode !== 0) {
            logger.warn(clientId, JSON.stringify(__assign({ errorCode: errorCode }, args), null, 2));
            if (!clientId) {
                return;
            }
            var clientIdObservers = this._clientIdObservers.get(clientId);
            if (!clientIdObservers) {
                return;
            }
            this.disconnect(clientId);
        }
    };
    MqttOverWSProvider.prototype.newClient = function (_a) {
        var url = _a.url, clientId = _a.clientId;
        return __awaiter(this, void 0, void 0, function () {
            var client, connected;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        logger.debug('Creating new MQTT client', clientId);
                        this.connectionStateMonitor.record(CONNECTION_CHANGE.OPENING_CONNECTION);
                        client = new Paho.Client(url, clientId);
                        client.onMessageArrived = function (_a) {
                            var topic = _a.destinationName, msg = _a.payloadString;
                            _this._onMessage(topic, msg);
                        };
                        client.onConnectionLost = function (_a) {
                            var errorCode = _a.errorCode, args = __rest(_a, ["errorCode"]);
                            _this.onDisconnect(__assign({ clientId: clientId, errorCode: errorCode }, args));
                            _this.connectionStateMonitor.record(CONNECTION_CHANGE.CLOSED);
                        };
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                client.connect({
                                    useSSL: _this.isSSLEnabled,
                                    mqttVersion: 3,
                                    onSuccess: function () { return resolve(true); },
                                    onFailure: function () {
                                        if (clientId)
                                            _this._clientsQueue.remove(clientId);
                                        _this.connectionStateMonitor.record(CONNECTION_CHANGE.CLOSED);
                                        resolve(false);
                                    },
                                });
                            })];
                    case 1:
                        connected = _b.sent();
                        if (connected) {
                            this.connectionStateMonitor.record(CONNECTION_CHANGE.CONNECTION_ESTABLISHED);
                        }
                        return [2 /*return*/, client];
                }
            });
        });
    };
    MqttOverWSProvider.prototype.connect = function (clientId, options) {
        if (options === void 0) { options = {}; }
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.clientsQueue.get(clientId, function (clientId) { return __awaiter(_this, void 0, void 0, function () {
                            var client;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, this.newClient(__assign(__assign({}, options), { clientId: clientId }))];
                                    case 1:
                                        client = _a.sent();
                                        if (client) {
                                            // Once connected, subscribe to all topics registered observers
                                            this._topicObservers.forEach(function (_value, key) {
                                                client.subscribe(key);
                                            });
                                        }
                                        return [2 /*return*/, client];
                                }
                            });
                        }); })];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    MqttOverWSProvider.prototype.disconnect = function (clientId) {
        return __awaiter(this, void 0, void 0, function () {
            var client;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.clientsQueue.get(clientId)];
                    case 1:
                        client = _a.sent();
                        if (client && client.isConnected()) {
                            client.disconnect();
                        }
                        this.clientsQueue.remove(clientId);
                        this.connectionStateMonitor.record(CONNECTION_CHANGE.CLOSED);
                        return [2 /*return*/];
                }
            });
        });
    };
    MqttOverWSProvider.prototype.publish = function (topics, msg) {
        return __awaiter(this, void 0, void 0, function () {
            var targetTopics, message, client;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        targetTopics = [].concat(topics);
                        message = JSON.stringify(msg);
                        return [4 /*yield*/, this.clientsQueue.get(this.clientId)];
                    case 1:
                        client = _a.sent();
                        if (client) {
                            logger.debug('Publishing to topic(s)', targetTopics.join(','), message);
                            targetTopics.forEach(function (topic) { return client.send(topic, message); });
                        }
                        else {
                            logger.debug('Publishing to topic(s) failed', targetTopics.join(','), message);
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    MqttOverWSProvider.prototype._onMessage = function (topic, msg) {
        try {
            var matchedTopicObservers_1 = [];
            this._topicObservers.forEach(function (observerForTopic, observerTopic) {
                if (mqttTopicMatch(observerTopic, topic)) {
                    matchedTopicObservers_1.push(observerForTopic);
                }
            });
            var parsedMessage_1 = JSON.parse(msg);
            if (typeof parsedMessage_1 === 'object') {
                parsedMessage_1.topicSymbol = topic;
            }
            matchedTopicObservers_1.forEach(function (observersForTopic) {
                observersForTopic.forEach(function (observer) { return observer.next(parsedMessage_1); });
            });
        }
        catch (error) {
            logger.warn('Error handling message', error, msg);
        }
    };
    MqttOverWSProvider.prototype.subscribe = function (topics, options) {
        var _this = this;
        if (options === void 0) { options = {}; }
        var targetTopics = [].concat(topics);
        logger.debug('Subscribing to topic(s)', targetTopics.join(','));
        var reconnectSubscription;
        return new Observable(function (observer) {
            targetTopics.forEach(function (topic) {
                // this._topicObservers is used to notify the observers according to the topic received on the message
                var observersForTopic = _this._topicObservers.get(topic);
                if (!observersForTopic) {
                    observersForTopic = new Set();
                    _this._topicObservers.set(topic, observersForTopic);
                }
                observersForTopic.add(observer);
            });
            var _a = options.clientId, clientId = _a === void 0 ? _this.clientId : _a;
            // this._clientIdObservers is used to close observers when client gets disconnected
            var observersForClientId = _this._clientIdObservers.get(clientId);
            if (!observersForClientId) {
                observersForClientId = new Set();
            }
            if (observersForClientId) {
                observersForClientId.add(observer);
                _this._clientIdObservers.set(clientId, observersForClientId);
            }
            (function () { return __awaiter(_this, void 0, void 0, function () {
                var getClient;
                var _this = this;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            getClient = function () { return __awaiter(_this, void 0, void 0, function () {
                                var _a, url, _b, client_1, e_1;
                                return __generator(this, function (_c) {
                                    switch (_c.label) {
                                        case 0:
                                            _c.trys.push([0, 5, , 6]);
                                            _a = options.url;
                                            if (!(_a === void 0)) return [3 /*break*/, 2];
                                            return [4 /*yield*/, this.endpoint];
                                        case 1:
                                            _b = _c.sent();
                                            return [3 /*break*/, 3];
                                        case 2:
                                            _b = _a;
                                            _c.label = 3;
                                        case 3:
                                            url = _b;
                                            return [4 /*yield*/, this.connect(clientId, { url: url })];
                                        case 4:
                                            client_1 = _c.sent();
                                            if (client_1 !== undefined) {
                                                targetTopics.forEach(function (topic) {
                                                    client_1.subscribe(topic);
                                                });
                                            }
                                            return [3 /*break*/, 6];
                                        case 5:
                                            e_1 = _c.sent();
                                            logger.debug('Error forming connection', e_1);
                                            return [3 /*break*/, 6];
                                        case 6: return [2 /*return*/];
                                    }
                                });
                            }); };
                            // Establish the initial connection
                            return [4 /*yield*/, getClient()];
                        case 1:
                            // Establish the initial connection
                            _a.sent();
                            // Add an observable to the reconnection list to manage reconnection for this subscription
                            reconnectSubscription = new Observable(function (observer) {
                                _this.reconnectionMonitor.addObserver(observer);
                            }).subscribe(function () {
                                getClient();
                            });
                            return [2 /*return*/];
                    }
                });
            }); })();
            return function () { return __awaiter(_this, void 0, void 0, function () {
                var client;
                var _this = this;
                var _a, _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0: return [4 /*yield*/, this.clientsQueue.get(clientId)];
                        case 1:
                            client = _c.sent();
                            reconnectSubscription === null || reconnectSubscription === void 0 ? void 0 : reconnectSubscription.unsubscribe();
                            if (client) {
                                (_a = this._clientIdObservers.get(clientId)) === null || _a === void 0 ? void 0 : _a.delete(observer);
                                // No more observers per client => client not needed anymore
                                if (((_b = this._clientIdObservers.get(clientId)) === null || _b === void 0 ? void 0 : _b.size) === 0) {
                                    this.disconnect(clientId);
                                    this.connectionStateMonitor.record(CONNECTION_CHANGE.CLOSING_CONNECTION);
                                    this._clientIdObservers.delete(clientId);
                                }
                                targetTopics.forEach(function (topic) {
                                    var observersForTopic = _this._topicObservers.get(topic) ||
                                        new Set();
                                    observersForTopic.delete(observer);
                                    // if no observers exists for the topic, topic should be removed
                                    if (observersForTopic.size === 0) {
                                        _this._topicObservers.delete(topic);
                                        if (client.isConnected()) {
                                            client.unsubscribe(topic);
                                        }
                                    }
                                });
                            }
                            return [2 /*return*/, null];
                    }
                });
            }); };
        });
    };
    return MqttOverWSProvider;
}(AbstractPubSubProvider));
export { MqttOverWSProvider };
//# sourceMappingURL=MqttOverWSProvider.js.map