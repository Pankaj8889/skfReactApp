"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var tslib_1 = require("tslib");
var Logger_1 = require("./Logger");
var logger = new Logger_1.ConsoleLogger('Amplify');
var AmplifyClass = /** @class */ (function () {
    function AmplifyClass() {
        // Everything that is `register`ed is tracked here
        this._components = [];
        this._config = {};
        // All modules (with `getModuleName()`) are stored here for dependency injection
        this._modules = {};
        // for backward compatibility to avoid breaking change
        // if someone is using like Amplify.Auth
        this.Auth = null;
        this.Analytics = null;
        this.API = null;
        this.Credentials = null;
        this.Storage = null;
        this.I18n = null;
        this.Cache = null;
        this.PubSub = null;
        this.Interactions = null;
        this.Pushnotification = null;
        this.UI = null;
        this.XR = null;
        this.Predictions = null;
        this.DataStore = null;
        this.Geo = null;
        this.Notifications = null;
        this.Logger = Logger_1.ConsoleLogger;
        this.ServiceWorker = null;
    }
    AmplifyClass.prototype.register = function (comp) {
        logger.debug('component registered in amplify', comp);
        this._components.push(comp);
        if (typeof comp.getModuleName === 'function') {
            this._modules[comp.getModuleName()] = comp;
            this[comp.getModuleName()] = comp;
        }
        else {
            logger.debug('no getModuleName method for component', comp);
        }
        // Finally configure this new component(category) loaded
        // With the new modularization changes in Amplify V3, all the Amplify
        // component are not loaded/registered right away but when they are
        // imported (and hence instantiated) in the client's app. This ensures
        // that all new components imported get correctly configured with the
        // configuration that Amplify.configure() was called with.
        comp.configure(this._config);
    };
    AmplifyClass.prototype.configure = function (config) {
        var _this = this;
        if (!config)
            return this._config;
        this._config = Object.assign(this._config, config);
        logger.debug('amplify config', this._config);
        // Dependency Injection via property-setting.
        // This avoids introducing a public method/interface/setter that's difficult to remove later.
        // Plus, it reduces `if` statements within the `constructor` and `configure` of each module
        Object.entries(this._modules).forEach(function (_a) {
            var _b = tslib_1.__read(_a, 2), Name = _b[0], comp = _b[1];
            // e.g. Auth.*
            Object.keys(comp).forEach(function (property) {
                // e.g. Auth["Credentials"] = this._modules["Credentials"] when set
                if (_this._modules[property]) {
                    comp[property] = _this._modules[property];
                }
            });
        });
        this._components.map(function (comp) {
            comp.configure(_this._config);
        });
        return this._config;
    };
    AmplifyClass.prototype.addPluggable = function (pluggable) {
        if (pluggable &&
            pluggable['getCategory'] &&
            typeof pluggable['getCategory'] === 'function') {
            this._components.map(function (comp) {
                if (comp['addPluggable'] &&
                    typeof comp['addPluggable'] === 'function') {
                    comp.addPluggable(pluggable);
                }
            });
        }
    };
    return AmplifyClass;
}());
exports.AmplifyClass = AmplifyClass;
exports.Amplify = new AmplifyClass();
//# sourceMappingURL=Amplify.js.map