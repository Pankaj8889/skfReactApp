"use strict";
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
Object.defineProperty(exports, "__esModule", { value: true });
var tslib_1 = require("tslib");
var Logger_1 = require("./Logger");
var logger = new Logger_1.ConsoleLogger('Hub');
var AMPLIFY_SYMBOL = (typeof Symbol !== 'undefined' && typeof Symbol.for === 'function'
    ? Symbol.for('amplify_default')
    : '@@amplify_default');
function isLegacyCallback(callback) {
    return callback.onHubCapsule !== undefined;
}
var HubClass = /** @class */ (function () {
    function HubClass(name) {
        this.listeners = [];
        this.patterns = [];
        this.protectedChannels = [
            'core',
            'auth',
            'api',
            'analytics',
            'interactions',
            'pubsub',
            'storage',
            'ui',
            'xr',
        ];
        this.name = name;
    }
    /**
     * Used internally to remove a Hub listener.
     *
     * @remarks
     * This private method is for internal use only. Instead of calling Hub.remove, call the result of Hub.listen.
     */
    HubClass.prototype._remove = function (channel, listener) {
        if (channel instanceof RegExp) {
            var pattern_1 = this.patterns.find(function (_a) {
                var pattern = _a.pattern;
                return pattern.source === channel.source;
            });
            if (!pattern_1) {
                logger.warn("No listeners for " + channel);
                return;
            }
            this.patterns = tslib_1.__spread(this.patterns.filter(function (x) { return x !== pattern_1; }));
        }
        else {
            var holder = this.listeners[channel];
            if (!holder) {
                logger.warn("No listeners for " + channel);
                return;
            }
            this.listeners[channel] = tslib_1.__spread(holder.filter(function (_a) {
                var callback = _a.callback;
                return callback !== listener;
            }));
        }
    };
    /**
     * @deprecated Instead of calling Hub.remove, call the result of Hub.listen.
     */
    HubClass.prototype.remove = function (channel, listener) {
        this._remove(channel, listener);
    };
    /**
     * Used to send a Hub event.
     *
     * @param channel - The channel on which the event will be broadcast
     * @param payload - The HubPayload
     * @param source  - The source of the event; defaults to ''
     * @param ampSymbol - Symbol used to determine if the event is dispatched internally on a protected channel
     *
     */
    HubClass.prototype.dispatch = function (channel, payload, source, ampSymbol) {
        if (source === void 0) { source = ''; }
        if (this.protectedChannels.indexOf(channel) > -1) {
            var hasAccess = ampSymbol === AMPLIFY_SYMBOL;
            if (!hasAccess) {
                logger.warn("WARNING: " + channel + " is protected and dispatching on it can have unintended consequences");
            }
        }
        var capsule = {
            channel: channel,
            payload: tslib_1.__assign({}, payload),
            source: source,
            patternInfo: [],
        };
        try {
            this._toListeners(capsule);
        }
        catch (e) {
            logger.error(e);
        }
    };
    /**
     * Used to listen for Hub events.
     *
     * @param channel - The channel on which to listen
     * @param callback - The callback to execute when an event is received on the specified channel
     * @param listenerName - The name of the listener; defaults to 'noname'
     * @returns A function which can be called to cancel the listener.
     *
     */
    HubClass.prototype.listen = function (channel, callback, listenerName) {
        var _this = this;
        if (listenerName === void 0) { listenerName = 'noname'; }
        var cb;
        // Check for legacy onHubCapsule callback for backwards compatability
        if (isLegacyCallback(callback)) {
            logger.warn("WARNING onHubCapsule is Deprecated. Please pass in a callback.");
            cb = callback.onHubCapsule.bind(callback);
        }
        else if (typeof callback !== 'function') {
            throw new Error('No callback supplied to Hub');
        }
        else {
            cb = callback;
        }
        if (channel instanceof RegExp) {
            this.patterns.push({
                pattern: channel,
                callback: cb,
            });
        }
        else {
            var holder = this.listeners[channel];
            if (!holder) {
                holder = [];
                this.listeners[channel] = holder;
            }
            holder.push({
                name: listenerName,
                callback: cb,
            });
        }
        return function () {
            _this._remove(channel, cb);
        };
    };
    HubClass.prototype._toListeners = function (capsule) {
        var channel = capsule.channel, payload = capsule.payload;
        var holder = this.listeners[channel];
        if (holder) {
            holder.forEach(function (listener) {
                logger.debug("Dispatching to " + channel + " with ", payload);
                try {
                    listener.callback(capsule);
                }
                catch (e) {
                    logger.error(e);
                }
            });
        }
        if (this.patterns.length > 0) {
            if (!payload.message) {
                logger.warn("Cannot perform pattern matching without a message key");
                return;
            }
            var payloadStr_1 = payload.message;
            this.patterns.forEach(function (pattern) {
                var match = payloadStr_1.match(pattern.pattern);
                if (match) {
                    var _a = tslib_1.__read(match), groups = _a.slice(1);
                    var dispatchingCapsule = tslib_1.__assign(tslib_1.__assign({}, capsule), { patternInfo: groups });
                    try {
                        pattern.callback(dispatchingCapsule);
                    }
                    catch (e) {
                        logger.error(e);
                    }
                }
            });
        }
    };
    return HubClass;
}());
exports.HubClass = HubClass;
/*We export a __default__ instance of HubClass to use it as a
pseudo Singleton for the main messaging bus, however you can still create
your own instance of HubClass() for a separate "private bus" of events.*/
exports.Hub = new HubClass('__default__');
//# sourceMappingURL=Hub.js.map