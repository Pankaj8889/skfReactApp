"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var tslib_1 = require("tslib");
var core_1 = require("@aws-amplify/core");
var logger = new core_1.ConsoleLogger('AbstractPubSubProvider');
var AbstractPubSubProvider = /** @class */ (function () {
    function AbstractPubSubProvider(options) {
        this._config = options;
    }
    AbstractPubSubProvider.prototype.configure = function (config) {
        this._config = tslib_1.__assign(tslib_1.__assign({}, config), this._config);
        logger.debug("configure " + this.getProviderName(), this._config);
        return this.options;
    };
    AbstractPubSubProvider.prototype.getCategory = function () {
        return 'PubSub';
    };
    Object.defineProperty(AbstractPubSubProvider.prototype, "options", {
        get: function () {
            return tslib_1.__assign({}, this._config);
        },
        enumerable: true,
        configurable: true
    });
    return AbstractPubSubProvider;
}());
exports.AbstractPubSubProvider = AbstractPubSubProvider;
//# sourceMappingURL=PubSubProvider.js.map