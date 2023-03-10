import { __asyncValues, __awaiter, __generator, __read, __spread, __values } from "tslib";
import { ConsoleLogger as Logger } from '@aws-amplify/core';
import * as idb from 'idb';
import { ModelPredicateCreator } from '../../predicates';
import { isPredicateObj, isPredicateGroup, OpType, QueryOne, } from '../../types';
import { getIndex, getIndexFromAssociation, isModelConstructor, isPrivateMode, traverseModel, validatePredicate, inMemoryPagination, keysEqual, getStorename, getIndexKeys, extractPrimaryKeyValues, isSafariCompatabilityMode, } from '../../util';
var logger = new Logger('DataStore');
/**
 * The point after which queries composed of multiple simple OR conditions
 * should scan-and-filter instead of individual queries for each condition.
 *
 * At some point, this should be configurable and/or dynamic based on table
 * size and possibly even on observed average seek latency. For now, it's
 * based on an manual "binary search" for the breakpoint as measured in the
 * unit test suite. This isn't necessarily optimal. But, it's at least derived
 * empirically, rather than theoretically and without any verification!
 *
 * REMEMBER! If you run more realistic benchmarks and update this value, update
 * this comment so the validity and accuracy of future query tuning exercises
 * can be compared to the methods used to derive the current value. E.g.,
 *
 * 1. In browser benchmark > unit test benchmark
 * 2. Multi-browser benchmark > single browser benchmark
 * 3. Benchmarks of various table sizes > static table size benchmark
 *
 * etc...
 *
 */
var MULTI_OR_CONDITION_SCAN_BREAKPOINT = 7;
var DB_NAME = 'amplify-datastore';
var IndexedDBAdapter = /** @class */ (function () {
    function IndexedDBAdapter() {
        var _this = this;
        this.dbName = DB_NAME;
        this.safariCompatabilityMode = false;
        /**
         * Checks the given path against the browser's IndexedDB implementation for
         * necessary compatibility transformations, applying those transforms if needed.
         *
         * @param `keyArr` strings to compatibilize for browser-indexeddb index operations
         * @returns An array or string, depending on and given key,
         * that is ensured to be compatible with the IndexedDB implementation's nuances.
         */
        this.canonicalKeyPath = function (keyArr) {
            if (_this.safariCompatabilityMode) {
                return keyArr.length > 1 ? keyArr : keyArr[0];
            }
            return keyArr;
        };
    }
    IndexedDBAdapter.prototype.getStorenameForModel = function (modelConstructor) {
        var namespace = this.namespaceResolver(modelConstructor);
        var modelName = modelConstructor.name;
        return getStorename(namespace, modelName);
    };
    // Retrieves primary key values from a model
    IndexedDBAdapter.prototype.getIndexKeyValuesFromModel = function (model) {
        var modelConstructor = Object.getPrototypeOf(model)
            .constructor;
        var namespaceName = this.namespaceResolver(modelConstructor);
        var keys = getIndexKeys(this.schema.namespaces[namespaceName], modelConstructor.name);
        return extractPrimaryKeyValues(model, keys);
    };
    IndexedDBAdapter.prototype.checkPrivate = function () {
        return __awaiter(this, void 0, void 0, function () {
            var isPrivate;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, isPrivateMode().then(function (isPrivate) {
                            return isPrivate;
                        })];
                    case 1:
                        isPrivate = _a.sent();
                        if (isPrivate) {
                            logger.error("IndexedDB not supported in this browser's private mode");
                            return [2 /*return*/, Promise.reject("IndexedDB not supported in this browser's private mode")];
                        }
                        else {
                            return [2 /*return*/, Promise.resolve()];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Whether the browser's implementation of IndexedDB is coercing single-field
     * indexes to a scalar key.
     *
     * If this returns `true`, we need to treat indexes containing a single field
     * as scalars.
     *
     * See PR description for reference:
     * https://github.com/aws-amplify/amplify-js/pull/10527
     */
    IndexedDBAdapter.prototype.setSafariCompatabilityMode = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = this;
                        return [4 /*yield*/, isSafariCompatabilityMode()];
                    case 1:
                        _a.safariCompatabilityMode = _b.sent();
                        if (this.safariCompatabilityMode === true) {
                            logger.debug('IndexedDB Adapter is running in Safari Compatability Mode');
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    IndexedDBAdapter.prototype.getNamespaceAndModelFromStorename = function (storeName) {
        var _a = __read(storeName.split('_')), namespaceName = _a[0], modelNameArr = _a.slice(1);
        return {
            namespaceName: namespaceName,
            modelName: modelNameArr.join('_'),
        };
    };
    IndexedDBAdapter.prototype.setUp = function (theSchema, namespaceResolver, modelInstanceCreator, getModelConstructorByModelName, sessionId) {
        return __awaiter(this, void 0, void 0, function () {
            var VERSION, _a, error_1;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.checkPrivate()];
                    case 1:
                        _b.sent();
                        return [4 /*yield*/, this.setSafariCompatabilityMode()];
                    case 2:
                        _b.sent();
                        if (!!this.initPromise) return [3 /*break*/, 3];
                        this.initPromise = new Promise(function (res, rej) {
                            _this.resolve = res;
                            _this.reject = rej;
                        });
                        return [3 /*break*/, 5];
                    case 3: return [4 /*yield*/, this.initPromise];
                    case 4:
                        _b.sent();
                        _b.label = 5;
                    case 5:
                        if (sessionId) {
                            this.dbName = DB_NAME + "-" + sessionId;
                        }
                        this.schema = theSchema;
                        this.namespaceResolver = namespaceResolver;
                        this.modelInstanceCreator = modelInstanceCreator;
                        this.getModelConstructorByModelName = getModelConstructorByModelName;
                        _b.label = 6;
                    case 6:
                        _b.trys.push([6, 9, , 10]);
                        if (!!this.db) return [3 /*break*/, 8];
                        VERSION = 3;
                        _a = this;
                        return [4 /*yield*/, idb.openDB(this.dbName, VERSION, {
                                upgrade: function (db, oldVersion, newVersion, txn) { return __awaiter(_this, void 0, void 0, function () {
                                    var _a, _b, storeName, origStore, tmpName, _c, namespaceName, modelName, modelInCurrentSchema, newStore, cursor, count, e_1_1, error_2;
                                    var e_1, _d;
                                    var _this = this;
                                    return __generator(this, function (_e) {
                                        switch (_e.label) {
                                            case 0:
                                                if (oldVersion === 0) {
                                                    Object.keys(theSchema.namespaces).forEach(function (namespaceName) {
                                                        var namespace = theSchema.namespaces[namespaceName];
                                                        Object.keys(namespace.models).forEach(function (modelName) {
                                                            var storeName = getStorename(namespaceName, modelName);
                                                            _this.createObjectStoreForModel(db, namespaceName, storeName, modelName);
                                                        });
                                                    });
                                                    return [2 /*return*/];
                                                }
                                                if (!((oldVersion === 1 || oldVersion === 2) && newVersion === 3)) return [3 /*break*/, 16];
                                                _e.label = 1;
                                            case 1:
                                                _e.trys.push([1, 14, , 15]);
                                                _e.label = 2;
                                            case 2:
                                                _e.trys.push([2, 11, 12, 13]);
                                                _a = __values(txn.objectStoreNames), _b = _a.next();
                                                _e.label = 3;
                                            case 3:
                                                if (!!_b.done) return [3 /*break*/, 10];
                                                storeName = _b.value;
                                                origStore = txn.objectStore(storeName);
                                                tmpName = "tmp_" + storeName;
                                                origStore.name = tmpName;
                                                _c = this.getNamespaceAndModelFromStorename(storeName), namespaceName = _c.namespaceName, modelName = _c.modelName;
                                                modelInCurrentSchema = modelName in this.schema.namespaces[namespaceName].models;
                                                if (!modelInCurrentSchema) {
                                                    // delete original
                                                    db.deleteObjectStore(tmpName);
                                                    return [3 /*break*/, 9];
                                                }
                                                newStore = this.createObjectStoreForModel(db, namespaceName, storeName, modelName);
                                                return [4 /*yield*/, origStore.openCursor()];
                                            case 4:
                                                cursor = _e.sent();
                                                count = 0;
                                                _e.label = 5;
                                            case 5:
                                                if (!(cursor && cursor.value)) return [3 /*break*/, 8];
                                                // we don't pass key, since they are all new entries in the new store
                                                return [4 /*yield*/, newStore.put(cursor.value)];
                                            case 6:
                                                // we don't pass key, since they are all new entries in the new store
                                                _e.sent();
                                                return [4 /*yield*/, cursor.continue()];
                                            case 7:
                                                cursor = _e.sent();
                                                count++;
                                                return [3 /*break*/, 5];
                                            case 8:
                                                // delete original
                                                db.deleteObjectStore(tmpName);
                                                logger.debug(count + " " + storeName + " records migrated");
                                                _e.label = 9;
                                            case 9:
                                                _b = _a.next();
                                                return [3 /*break*/, 3];
                                            case 10: return [3 /*break*/, 13];
                                            case 11:
                                                e_1_1 = _e.sent();
                                                e_1 = { error: e_1_1 };
                                                return [3 /*break*/, 13];
                                            case 12:
                                                try {
                                                    if (_b && !_b.done && (_d = _a.return)) _d.call(_a);
                                                }
                                                finally { if (e_1) throw e_1.error; }
                                                return [7 /*endfinally*/];
                                            case 13:
                                                // add new models created after IndexedDB, but before migration
                                                // this case may happen when a user has not opened an app for
                                                // some time and a new model is added during that time
                                                Object.keys(theSchema.namespaces).forEach(function (namespaceName) {
                                                    var namespace = theSchema.namespaces[namespaceName];
                                                    var objectStoreNames = new Set(txn.objectStoreNames);
                                                    Object.keys(namespace.models)
                                                        .map(function (modelName) {
                                                        return [
                                                            modelName,
                                                            getStorename(namespaceName, modelName),
                                                        ];
                                                    })
                                                        .filter(function (_a) {
                                                        var _b = __read(_a, 2), storeName = _b[1];
                                                        return !objectStoreNames.has(storeName);
                                                    })
                                                        .forEach(function (_a) {
                                                        var _b = __read(_a, 2), modelName = _b[0], storeName = _b[1];
                                                        _this.createObjectStoreForModel(db, namespaceName, storeName, modelName);
                                                    });
                                                });
                                                return [3 /*break*/, 15];
                                            case 14:
                                                error_2 = _e.sent();
                                                logger.error('Error migrating IndexedDB data', error_2);
                                                txn.abort();
                                                throw error_2;
                                            case 15: return [2 /*return*/];
                                            case 16: return [2 /*return*/];
                                        }
                                    });
                                }); },
                            })];
                    case 7:
                        _a.db = _b.sent();
                        this.resolve();
                        _b.label = 8;
                    case 8: return [3 /*break*/, 10];
                    case 9:
                        error_1 = _b.sent();
                        this.reject(error_1);
                        return [3 /*break*/, 10];
                    case 10: return [2 /*return*/];
                }
            });
        });
    };
    IndexedDBAdapter.prototype._get = function (storeOrStoreName, keyArr) {
        return __awaiter(this, void 0, void 0, function () {
            var index, storeName, store, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (typeof storeOrStoreName === 'string') {
                            storeName = storeOrStoreName;
                            index = this.db.transaction(storeName, 'readonly').store.index('byPk');
                        }
                        else {
                            store = storeOrStoreName;
                            index = store.index('byPk');
                        }
                        return [4 /*yield*/, index.get(this.canonicalKeyPath(keyArr))];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result];
                }
            });
        });
    };
    IndexedDBAdapter.prototype.save = function (model, condition) {
        var e_2, _a;
        return __awaiter(this, void 0, void 0, function () {
            var modelConstructor, storeName, namespaceName, connectedModels, set, connectionStoreNames, tx, store, keyValues, fromDB, predicates, _b, predicateObjs, type, isValid, msg, result, connectionStoreNames_1, connectionStoreNames_1_1, resItem, storeName_1, item, instance, keys, store_1, itemKeyValues, fromDB_1, opType, modelKeyValues, key, e_2_1;
            var _this = this;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, this.checkPrivate()];
                    case 1:
                        _c.sent();
                        modelConstructor = Object.getPrototypeOf(model)
                            .constructor;
                        storeName = this.getStorenameForModel(modelConstructor);
                        namespaceName = this.namespaceResolver(modelConstructor);
                        connectedModels = traverseModel(modelConstructor.name, model, this.schema.namespaces[namespaceName], this.modelInstanceCreator, this.getModelConstructorByModelName);
                        set = new Set();
                        connectionStoreNames = Object.values(connectedModels).map(function (_a) {
                            var modelName = _a.modelName, item = _a.item, instance = _a.instance;
                            var storeName = getStorename(namespaceName, modelName);
                            set.add(storeName);
                            var keys = getIndexKeys(_this.schema.namespaces[namespaceName], modelName);
                            return { storeName: storeName, item: item, instance: instance, keys: keys };
                        });
                        tx = this.db.transaction(__spread([storeName], Array.from(set.values())), 'readwrite');
                        store = tx.objectStore(storeName);
                        keyValues = this.getIndexKeyValuesFromModel(model);
                        return [4 /*yield*/, this._get(store, keyValues)];
                    case 2:
                        fromDB = _c.sent();
                        if (condition && fromDB) {
                            predicates = ModelPredicateCreator.getPredicates(condition);
                            _b = predicates || {}, predicateObjs = _b.predicates, type = _b.type;
                            isValid = validatePredicate(fromDB, type, predicateObjs);
                            if (!isValid) {
                                msg = 'Conditional update failed';
                                logger.error(msg, { model: fromDB, condition: predicateObjs });
                                throw new Error(msg);
                            }
                        }
                        result = [];
                        _c.label = 3;
                    case 3:
                        _c.trys.push([3, 11, 12, 17]);
                        connectionStoreNames_1 = __asyncValues(connectionStoreNames);
                        _c.label = 4;
                    case 4: return [4 /*yield*/, connectionStoreNames_1.next()];
                    case 5:
                        if (!(connectionStoreNames_1_1 = _c.sent(), !connectionStoreNames_1_1.done)) return [3 /*break*/, 10];
                        resItem = connectionStoreNames_1_1.value;
                        storeName_1 = resItem.storeName, item = resItem.item, instance = resItem.instance, keys = resItem.keys;
                        store_1 = tx.objectStore(storeName_1);
                        itemKeyValues = keys.map(function (key) {
                            var value = item[key];
                            return value;
                        });
                        return [4 /*yield*/, this._get(store_1, itemKeyValues)];
                    case 6:
                        fromDB_1 = _c.sent();
                        opType = fromDB_1 === undefined ? OpType.INSERT : OpType.UPDATE;
                        modelKeyValues = this.getIndexKeyValuesFromModel(model);
                        if (!(keysEqual(itemKeyValues, modelKeyValues) ||
                            opType === OpType.INSERT)) return [3 /*break*/, 9];
                        return [4 /*yield*/, store_1
                                .index('byPk')
                                .getKey(this.canonicalKeyPath(itemKeyValues))];
                    case 7:
                        key = _c.sent();
                        return [4 /*yield*/, store_1.put(item, key)];
                    case 8:
                        _c.sent();
                        result.push([instance, opType]);
                        _c.label = 9;
                    case 9: return [3 /*break*/, 4];
                    case 10: return [3 /*break*/, 17];
                    case 11:
                        e_2_1 = _c.sent();
                        e_2 = { error: e_2_1 };
                        return [3 /*break*/, 17];
                    case 12:
                        _c.trys.push([12, , 15, 16]);
                        if (!(connectionStoreNames_1_1 && !connectionStoreNames_1_1.done && (_a = connectionStoreNames_1.return))) return [3 /*break*/, 14];
                        return [4 /*yield*/, _a.call(connectionStoreNames_1)];
                    case 13:
                        _c.sent();
                        _c.label = 14;
                    case 14: return [3 /*break*/, 16];
                    case 15:
                        if (e_2) throw e_2.error;
                        return [7 /*endfinally*/];
                    case 16: return [7 /*endfinally*/];
                    case 17: return [4 /*yield*/, tx.done];
                    case 18:
                        _c.sent();
                        return [2 /*return*/, result];
                }
            });
        });
    };
    IndexedDBAdapter.prototype.load = function (namespaceName, srcModelName, records) {
        return __awaiter(this, void 0, void 0, function () {
            var namespace, relations, connectionStoreNames, modelConstructor;
            var _this = this;
            return __generator(this, function (_a) {
                namespace = this.schema.namespaces[namespaceName];
                relations = namespace.relationships[srcModelName].relationTypes;
                connectionStoreNames = relations.map(function (_a) {
                    var modelName = _a.modelName;
                    return getStorename(namespaceName, modelName);
                });
                modelConstructor = this.getModelConstructorByModelName(namespaceName, srcModelName);
                if (connectionStoreNames.length === 0) {
                    return [2 /*return*/, records.map(function (record) {
                            return _this.modelInstanceCreator(modelConstructor, record);
                        })];
                }
                return [2 /*return*/, records.map(function (record) {
                        return _this.modelInstanceCreator(modelConstructor, record);
                    })];
            });
        });
    };
    IndexedDBAdapter.prototype.query = function (modelConstructor, predicate, pagination) {
        return __awaiter(this, void 0, void 0, function () {
            var storeName, namespaceName, predicates, keyPath, queryByKey, hasSort, hasPagination, records;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPrivate()];
                    case 1:
                        _a.sent();
                        storeName = this.getStorenameForModel(modelConstructor);
                        namespaceName = this.namespaceResolver(modelConstructor);
                        predicates = predicate && ModelPredicateCreator.getPredicates(predicate);
                        keyPath = getIndexKeys(this.schema.namespaces[namespaceName], modelConstructor.name);
                        queryByKey = predicates && this.keyValueFromPredicate(predicates, keyPath);
                        hasSort = pagination && pagination.sort;
                        hasPagination = pagination && pagination.limit;
                        return [4 /*yield*/, (function () { return __awaiter(_this, void 0, void 0, function () {
                                var record, filtered, all;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            if (!queryByKey) return [3 /*break*/, 2];
                                            return [4 /*yield*/, this.getByKey(storeName, queryByKey)];
                                        case 1:
                                            record = _a.sent();
                                            return [2 /*return*/, record ? [record] : []];
                                        case 2:
                                            if (!predicates) return [3 /*break*/, 4];
                                            return [4 /*yield*/, this.filterOnPredicate(storeName, predicates)];
                                        case 3:
                                            filtered = _a.sent();
                                            return [2 /*return*/, this.inMemoryPagination(filtered, pagination)];
                                        case 4:
                                            if (!hasSort) return [3 /*break*/, 6];
                                            return [4 /*yield*/, this.getAll(storeName)];
                                        case 5:
                                            all = _a.sent();
                                            return [2 /*return*/, this.inMemoryPagination(all, pagination)];
                                        case 6:
                                            if (hasPagination) {
                                                return [2 /*return*/, this.enginePagination(storeName, pagination)];
                                            }
                                            return [2 /*return*/, this.getAll(storeName)];
                                    }
                                });
                            }); })()];
                    case 2:
                        records = (_a.sent());
                        return [4 /*yield*/, this.load(namespaceName, modelConstructor.name, records)];
                    case 3: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    IndexedDBAdapter.prototype.getByKey = function (storeName, keyValue) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this._get(storeName, keyValue)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    IndexedDBAdapter.prototype.getAll = function (storeName) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.db.getAll(storeName)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    IndexedDBAdapter.prototype.keyValueFromPredicate = function (predicates, keyPath) {
        var e_3, _a;
        var predicateObjs = predicates.predicates;
        if (predicateObjs.length !== keyPath.length) {
            return;
        }
        var keyValues = [];
        var _loop_1 = function (key) {
            var predicateObj = predicateObjs.find(function (p) {
                // it's a relevant predicate object only if it's an equality
                // operation for a key field from the key:
                return isPredicateObj(p) &&
                    p.field === key &&
                    p.operator === 'eq' &&
                    // it's only valid if it's not nullish.
                    // (IDB will throw a fit if it's nullish.)
                    p.operand !== null &&
                    p.operand !== undefined;
            });
            predicateObj && keyValues.push(predicateObj.operand);
        };
        try {
            for (var keyPath_1 = __values(keyPath), keyPath_1_1 = keyPath_1.next(); !keyPath_1_1.done; keyPath_1_1 = keyPath_1.next()) {
                var key = keyPath_1_1.value;
                _loop_1(key);
            }
        }
        catch (e_3_1) { e_3 = { error: e_3_1 }; }
        finally {
            try {
                if (keyPath_1_1 && !keyPath_1_1.done && (_a = keyPath_1.return)) _a.call(keyPath_1);
            }
            finally { if (e_3) throw e_3.error; }
        }
        return keyValues.length === keyPath.length ? keyValues : undefined;
    };
    /**
     * Tries to generate an index fetcher for the given predicates. Assumes
     * that the given predicate conditions are contained by an AND group and
     * should therefore all match a single record.
     *
     * @param storeName The table to query.
     * @param predicates The predicates to try to AND together.
     * @param transaction
     */
    IndexedDBAdapter.prototype.matchingIndexQueries = function (storeName, predicates, transaction) {
        var e_4, _a, e_5, _b;
        var _this = this;
        // could be expanded later to include `exec()` and a `cardinality` estimate?
        var queries = [];
        var predicateIndex = new Map();
        try {
            for (var predicates_1 = __values(predicates), predicates_1_1 = predicates_1.next(); !predicates_1_1.done; predicates_1_1 = predicates_1.next()) {
                var predicate = predicates_1_1.value;
                predicateIndex.set(String(predicate.field), predicate);
            }
        }
        catch (e_4_1) { e_4 = { error: e_4_1 }; }
        finally {
            try {
                if (predicates_1_1 && !predicates_1_1.done && (_a = predicates_1.return)) _a.call(predicates_1);
            }
            finally { if (e_4) throw e_4.error; }
        }
        var store = transaction.objectStore(storeName);
        var _loop_2 = function (name_1) {
            var e_6, _a;
            var idx = store.index(name_1);
            var keypath = Array.isArray(idx.keyPath) ? idx.keyPath : [idx.keyPath];
            var matchingPredicateValues = [];
            try {
                for (var keypath_1 = (e_6 = void 0, __values(keypath)), keypath_1_1 = keypath_1.next(); !keypath_1_1.done; keypath_1_1 = keypath_1.next()) {
                    var field = keypath_1_1.value;
                    var p = predicateIndex.get(field);
                    if (p && p.operand !== null && p.operand !== undefined) {
                        matchingPredicateValues.push(p.operand);
                    }
                    else {
                        break;
                    }
                }
            }
            catch (e_6_1) { e_6 = { error: e_6_1 }; }
            finally {
                try {
                    if (keypath_1_1 && !keypath_1_1.done && (_a = keypath_1.return)) _a.call(keypath_1);
                }
                finally { if (e_6) throw e_6.error; }
            }
            // if we have a matching predicate field for each component of this index,
            // we can build a query for it. otherwise, we can't.
            if (matchingPredicateValues.length === keypath.length) {
                // re-create a transaction, because the transaction used to fetch the
                // indexes may no longer be active.
                queries.push(function () {
                    return _this.db
                        .transaction(storeName)
                        .objectStore(storeName)
                        .index(name_1)
                        .getAll(_this.canonicalKeyPath(matchingPredicateValues));
                });
            }
        };
        try {
            for (var _c = __values(store.indexNames), _d = _c.next(); !_d.done; _d = _c.next()) {
                var name_1 = _d.value;
                _loop_2(name_1);
            }
        }
        catch (e_5_1) { e_5 = { error: e_5_1 }; }
        finally {
            try {
                if (_d && !_d.done && (_b = _c.return)) _b.call(_c);
            }
            finally { if (e_5) throw e_5.error; }
        }
        return queries;
    };
    IndexedDBAdapter.prototype.baseQueryIndex = function (storeName, predicates, transaction) {
        return __awaiter(this, void 0, void 0, function () {
            var predicateObjs, type, fieldPredicates, txn, result, groupQueries, objectQueries, indexedQueries;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        predicateObjs = predicates.predicates, type = predicates.type;
                        // the predicate objects we care about tend to be nested at least
                        // one level down: `{and: {or: {and: { <the predicates we want> }}}}`
                        // so, we unpack and/or groups until we find a group with more than 1
                        // child OR a child that is not a group (and is therefore a predicate "object").
                        while (predicateObjs.length === 1 &&
                            isPredicateGroup(predicateObjs[0]) &&
                            predicateObjs[0].type !== 'not') {
                            type = predicateObjs[0].type;
                            predicateObjs = predicateObjs[0].predicates;
                        }
                        fieldPredicates = predicateObjs.filter(function (p) { return isPredicateObj(p) && p.operator === 'eq'; });
                        txn = transaction || this.db.transaction(storeName);
                        result = {};
                        if (!(type === 'or')) return [3 /*break*/, 2];
                        return [4 /*yield*/, Promise.all(predicateObjs
                                .filter(function (o) { return isPredicateGroup(o) && o.type === 'and'; })
                                .map(function (o) {
                                return _this.baseQueryIndex(storeName, o, txn);
                            })).then(function (queries) {
                                return queries
                                    .filter(function (q) { return q.indexedQueries.length === 1; })
                                    .map(function (i) { return i.indexedQueries; });
                            })];
                    case 1:
                        groupQueries = _a.sent();
                        objectQueries = predicateObjs
                            .filter(function (o) { return isPredicateObj(o); })
                            .map(function (o) {
                            return _this.matchingIndexQueries(storeName, [o], txn);
                        });
                        indexedQueries = __spread(groupQueries, objectQueries).map(function (q) { return q[0]; })
                            .filter(function (i) { return i; });
                        // if, after hunting for base queries, we don't have exactly 1 base query
                        // for each child group + object, stop trying to optimize. we're not dealing
                        // with a simple query that fits the intended optimization path.
                        if (predicateObjs.length > indexedQueries.length) {
                            result = {
                                groupType: null,
                                indexedQueries: [],
                            };
                        }
                        else {
                            result = {
                                groupType: 'or',
                                indexedQueries: indexedQueries,
                            };
                        }
                        return [3 /*break*/, 3];
                    case 2:
                        if (type === 'and') {
                            // our potential indexes or lacks thereof.
                            // note that we're only optimizing for `eq` right now.
                            result = {
                                groupType: type,
                                indexedQueries: this.matchingIndexQueries(storeName, fieldPredicates, txn),
                            };
                        }
                        else {
                            result = {
                                groupType: null,
                                indexedQueries: [],
                            };
                        }
                        _a.label = 3;
                    case 3:
                        if (!!transaction) return [3 /*break*/, 5];
                        return [4 /*yield*/, txn.done];
                    case 4:
                        _a.sent();
                        _a.label = 5;
                    case 5: return [2 /*return*/, result];
                }
            });
        });
    };
    IndexedDBAdapter.prototype.filterOnPredicate = function (storeName, predicates) {
        return __awaiter(this, void 0, void 0, function () {
            var predicateObjs, type, _a, groupType, indexedQueries, candidateResults, distinctResults, indexedQueries_1, indexedQueries_1_1, query, resultGroup, resultGroup_1, resultGroup_1_1, item, distinctificationString, e_7_1, filtered;
            var e_7, _b, e_8, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        predicateObjs = predicates.predicates, type = predicates.type;
                        return [4 /*yield*/, this.baseQueryIndex(storeName, predicates)];
                    case 1:
                        _a = _d.sent(), groupType = _a.groupType, indexedQueries = _a.indexedQueries;
                        if (!(groupType === 'and' && indexedQueries.length > 0)) return [3 /*break*/, 3];
                        return [4 /*yield*/, indexedQueries[0]()];
                    case 2:
                        // each condition must be satsified, we can form a base set with any
                        // ONE of those conditions and then filter.
                        candidateResults = _d.sent();
                        return [3 /*break*/, 14];
                    case 3:
                        if (!(groupType === 'or' &&
                            indexedQueries.length > 0 &&
                            indexedQueries.length <= MULTI_OR_CONDITION_SCAN_BREAKPOINT)) return [3 /*break*/, 12];
                        distinctResults = new Map();
                        _d.label = 4;
                    case 4:
                        _d.trys.push([4, 9, 10, 11]);
                        indexedQueries_1 = __values(indexedQueries), indexedQueries_1_1 = indexedQueries_1.next();
                        _d.label = 5;
                    case 5:
                        if (!!indexedQueries_1_1.done) return [3 /*break*/, 8];
                        query = indexedQueries_1_1.value;
                        return [4 /*yield*/, query()];
                    case 6:
                        resultGroup = _d.sent();
                        try {
                            for (resultGroup_1 = (e_8 = void 0, __values(resultGroup)), resultGroup_1_1 = resultGroup_1.next(); !resultGroup_1_1.done; resultGroup_1_1 = resultGroup_1.next()) {
                                item = resultGroup_1_1.value;
                                distinctificationString = JSON.stringify(item);
                                distinctResults.set(distinctificationString, item);
                            }
                        }
                        catch (e_8_1) { e_8 = { error: e_8_1 }; }
                        finally {
                            try {
                                if (resultGroup_1_1 && !resultGroup_1_1.done && (_c = resultGroup_1.return)) _c.call(resultGroup_1);
                            }
                            finally { if (e_8) throw e_8.error; }
                        }
                        _d.label = 7;
                    case 7:
                        indexedQueries_1_1 = indexedQueries_1.next();
                        return [3 /*break*/, 5];
                    case 8: return [3 /*break*/, 11];
                    case 9:
                        e_7_1 = _d.sent();
                        e_7 = { error: e_7_1 };
                        return [3 /*break*/, 11];
                    case 10:
                        try {
                            if (indexedQueries_1_1 && !indexedQueries_1_1.done && (_b = indexedQueries_1.return)) _b.call(indexedQueries_1);
                        }
                        finally { if (e_7) throw e_7.error; }
                        return [7 /*endfinally*/];
                    case 11:
                        // we could conceivably check for special conditions and return early here.
                        // but, this is simpler and has not yet had a measurable performance impact.
                        candidateResults = Array.from(distinctResults.values());
                        return [3 /*break*/, 14];
                    case 12: return [4 /*yield*/, this.getAll(storeName)];
                    case 13:
                        // nothing intelligent we can do with `not` groups unless or until we start
                        // smashing comparison operators against indexes -- at which point we could
                        // perform some reversal here.
                        candidateResults = (_d.sent());
                        _d.label = 14;
                    case 14:
                        filtered = predicateObjs
                            ? candidateResults.filter(function (m) { return validatePredicate(m, type, predicateObjs); })
                            : candidateResults;
                        return [2 /*return*/, filtered];
                }
            });
        });
    };
    IndexedDBAdapter.prototype.inMemoryPagination = function (records, pagination) {
        return inMemoryPagination(records, pagination);
    };
    IndexedDBAdapter.prototype.enginePagination = function (storeName, pagination) {
        return __awaiter(this, void 0, void 0, function () {
            var result, _a, page, _b, limit, initialRecord, cursor, pageResults, hasLimit;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (!pagination) return [3 /*break*/, 7];
                        _a = pagination.page, page = _a === void 0 ? 0 : _a, _b = pagination.limit, limit = _b === void 0 ? 0 : _b;
                        initialRecord = Math.max(0, page * limit) || 0;
                        return [4 /*yield*/, this.db
                                .transaction(storeName)
                                .objectStore(storeName)
                                .openCursor()];
                    case 1:
                        cursor = _c.sent();
                        if (!(cursor && initialRecord > 0)) return [3 /*break*/, 3];
                        return [4 /*yield*/, cursor.advance(initialRecord)];
                    case 2:
                        _c.sent();
                        _c.label = 3;
                    case 3:
                        pageResults = [];
                        hasLimit = typeof limit === 'number' && limit > 0;
                        _c.label = 4;
                    case 4:
                        if (!(cursor && cursor.value)) return [3 /*break*/, 6];
                        pageResults.push(cursor.value);
                        if (hasLimit && pageResults.length === limit) {
                            return [3 /*break*/, 6];
                        }
                        return [4 /*yield*/, cursor.continue()];
                    case 5:
                        cursor = _c.sent();
                        return [3 /*break*/, 4];
                    case 6:
                        result = pageResults;
                        return [3 /*break*/, 9];
                    case 7: return [4 /*yield*/, this.db.getAll(storeName)];
                    case 8:
                        result = (_c.sent());
                        _c.label = 9;
                    case 9: return [2 /*return*/, result];
                }
            });
        });
    };
    IndexedDBAdapter.prototype.queryOne = function (modelConstructor, firstOrLast) {
        if (firstOrLast === void 0) { firstOrLast = QueryOne.FIRST; }
        return __awaiter(this, void 0, void 0, function () {
            var storeName, cursor, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkPrivate()];
                    case 1:
                        _a.sent();
                        storeName = this.getStorenameForModel(modelConstructor);
                        return [4 /*yield*/, this.db
                                .transaction([storeName], 'readonly')
                                .objectStore(storeName)
                                .openCursor(undefined, firstOrLast === QueryOne.FIRST ? 'next' : 'prev')];
                    case 2:
                        cursor = _a.sent();
                        result = cursor ? cursor.value : undefined;
                        return [2 /*return*/, result && this.modelInstanceCreator(modelConstructor, result)];
                }
            });
        });
    };
    IndexedDBAdapter.prototype.delete = function (modelOrModelConstructor, condition) {
        return __awaiter(this, void 0, void 0, function () {
            var deleteQueue, modelConstructor, nameSpace, storeName, models, relations, deletedModels, deletedModels, model, modelConstructor, namespaceName, storeName, tx, store, keyValues, fromDB, msg, predicates, _a, predicateObjs, type, isValid, msg, relations, relations, deletedModels;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.checkPrivate()];
                    case 1:
                        _b.sent();
                        deleteQueue = [];
                        if (!isModelConstructor(modelOrModelConstructor)) return [3 /*break*/, 9];
                        modelConstructor = modelOrModelConstructor;
                        nameSpace = this.namespaceResolver(modelConstructor);
                        storeName = this.getStorenameForModel(modelConstructor);
                        return [4 /*yield*/, this.query(modelConstructor, condition)];
                    case 2:
                        models = _b.sent();
                        relations = this.schema.namespaces[nameSpace].relationships[modelConstructor.name]
                            .relationTypes;
                        if (!(condition !== undefined)) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.deleteTraverse(relations, models, modelConstructor.name, nameSpace, deleteQueue)];
                    case 3:
                        _b.sent();
                        return [4 /*yield*/, this.deleteItem(deleteQueue)];
                    case 4:
                        _b.sent();
                        deletedModels = deleteQueue.reduce(function (acc, _a) {
                            var items = _a.items;
                            return acc.concat(items);
                        }, []);
                        return [2 /*return*/, [models, deletedModels]];
                    case 5: return [4 /*yield*/, this.deleteTraverse(relations, models, modelConstructor.name, nameSpace, deleteQueue)];
                    case 6:
                        _b.sent();
                        // Delete all
                        return [4 /*yield*/, this.db
                                .transaction([storeName], 'readwrite')
                                .objectStore(storeName)
                                .clear()];
                    case 7:
                        // Delete all
                        _b.sent();
                        deletedModels = deleteQueue.reduce(function (acc, _a) {
                            var items = _a.items;
                            return acc.concat(items);
                        }, []);
                        return [2 /*return*/, [models, deletedModels]];
                    case 8: return [3 /*break*/, 17];
                    case 9:
                        model = modelOrModelConstructor;
                        modelConstructor = Object.getPrototypeOf(model)
                            .constructor;
                        namespaceName = this.namespaceResolver(modelConstructor);
                        storeName = this.getStorenameForModel(modelConstructor);
                        if (!condition) return [3 /*break*/, 13];
                        tx = this.db.transaction([storeName], 'readwrite');
                        store = tx.objectStore(storeName);
                        keyValues = this.getIndexKeyValuesFromModel(model);
                        return [4 /*yield*/, this._get(store, keyValues)];
                    case 10:
                        fromDB = _b.sent();
                        if (fromDB === undefined) {
                            msg = 'Model instance not found in storage';
                            logger.warn(msg, { model: model });
                            return [2 /*return*/, [[model], []]];
                        }
                        predicates = ModelPredicateCreator.getPredicates(condition);
                        _a = predicates, predicateObjs = _a.predicates, type = _a.type;
                        isValid = validatePredicate(fromDB, type, predicateObjs);
                        if (!isValid) {
                            msg = 'Conditional update failed';
                            logger.error(msg, { model: fromDB, condition: predicateObjs });
                            throw new Error(msg);
                        }
                        return [4 /*yield*/, tx.done];
                    case 11:
                        _b.sent();
                        relations = this.schema.namespaces[namespaceName].relationships[modelConstructor.name].relationTypes;
                        return [4 /*yield*/, this.deleteTraverse(relations, [model], modelConstructor.name, namespaceName, deleteQueue)];
                    case 12:
                        _b.sent();
                        return [3 /*break*/, 15];
                    case 13:
                        relations = this.schema.namespaces[namespaceName].relationships[modelConstructor.name].relationTypes;
                        return [4 /*yield*/, this.deleteTraverse(relations, [model], modelConstructor.name, namespaceName, deleteQueue)];
                    case 14:
                        _b.sent();
                        _b.label = 15;
                    case 15: return [4 /*yield*/, this.deleteItem(deleteQueue)];
                    case 16:
                        _b.sent();
                        deletedModels = deleteQueue.reduce(function (acc, _a) {
                            var items = _a.items;
                            return acc.concat(items);
                        }, []);
                        return [2 /*return*/, [[model], deletedModels]];
                    case 17: return [2 /*return*/];
                }
            });
        });
    };
    IndexedDBAdapter.prototype.deleteItem = function (deleteQueue) {
        var e_9, _a, e_10, _b;
        return __awaiter(this, void 0, void 0, function () {
            var connectionStoreNames, tx, _c, _d, deleteItem, storeName, items, store, items_1, items_1_1, item, key, keyValues, itemKey, e_10_1, e_9_1;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        connectionStoreNames = deleteQueue.map(function (_a) {
                            var storeName = _a.storeName;
                            return storeName;
                        });
                        tx = this.db.transaction(__spread(connectionStoreNames), 'readwrite');
                        _e.label = 1;
                    case 1:
                        _e.trys.push([1, 22, 23, 28]);
                        _c = __asyncValues(deleteQueue);
                        _e.label = 2;
                    case 2: return [4 /*yield*/, _c.next()];
                    case 3:
                        if (!(_d = _e.sent(), !_d.done)) return [3 /*break*/, 21];
                        deleteItem = _d.value;
                        storeName = deleteItem.storeName, items = deleteItem.items;
                        store = tx.objectStore(storeName);
                        _e.label = 4;
                    case 4:
                        _e.trys.push([4, 14, 15, 20]);
                        items_1 = __asyncValues(items);
                        _e.label = 5;
                    case 5: return [4 /*yield*/, items_1.next()];
                    case 6:
                        if (!(items_1_1 = _e.sent(), !items_1_1.done)) return [3 /*break*/, 13];
                        item = items_1_1.value;
                        if (!item) return [3 /*break*/, 12];
                        key = void 0;
                        if (!(typeof item === 'object')) return [3 /*break*/, 8];
                        keyValues = this.getIndexKeyValuesFromModel(item);
                        return [4 /*yield*/, store
                                .index('byPk')
                                .getKey(this.canonicalKeyPath(keyValues))];
                    case 7:
                        key = _e.sent();
                        return [3 /*break*/, 10];
                    case 8:
                        itemKey = item.toString();
                        return [4 /*yield*/, store.index('byPk').getKey(itemKey)];
                    case 9:
                        key = _e.sent();
                        _e.label = 10;
                    case 10:
                        if (!(key !== undefined)) return [3 /*break*/, 12];
                        return [4 /*yield*/, store.delete(key)];
                    case 11:
                        _e.sent();
                        _e.label = 12;
                    case 12: return [3 /*break*/, 5];
                    case 13: return [3 /*break*/, 20];
                    case 14:
                        e_10_1 = _e.sent();
                        e_10 = { error: e_10_1 };
                        return [3 /*break*/, 20];
                    case 15:
                        _e.trys.push([15, , 18, 19]);
                        if (!(items_1_1 && !items_1_1.done && (_b = items_1.return))) return [3 /*break*/, 17];
                        return [4 /*yield*/, _b.call(items_1)];
                    case 16:
                        _e.sent();
                        _e.label = 17;
                    case 17: return [3 /*break*/, 19];
                    case 18:
                        if (e_10) throw e_10.error;
                        return [7 /*endfinally*/];
                    case 19: return [7 /*endfinally*/];
                    case 20: return [3 /*break*/, 2];
                    case 21: return [3 /*break*/, 28];
                    case 22:
                        e_9_1 = _e.sent();
                        e_9 = { error: e_9_1 };
                        return [3 /*break*/, 28];
                    case 23:
                        _e.trys.push([23, , 26, 27]);
                        if (!(_d && !_d.done && (_a = _c.return))) return [3 /*break*/, 25];
                        return [4 /*yield*/, _a.call(_c)];
                    case 24:
                        _e.sent();
                        _e.label = 25;
                    case 25: return [3 /*break*/, 27];
                    case 26:
                        if (e_9) throw e_9.error;
                        return [7 /*endfinally*/];
                    case 27: return [7 /*endfinally*/];
                    case 28: return [2 /*return*/];
                }
            });
        });
    };
    IndexedDBAdapter.prototype.deleteTraverse = function (relations, models, srcModel, nameSpace, deleteQueue) {
        var relations_1, relations_1_1, models_1, models_1_1, models_2, models_2_1;
        var e_11, _a, e_12, _b, e_13, _c;
        return __awaiter(this, void 0, void 0, function () {
            var rel, relationType, modelName, targetName, targetNames, associatedWith, storeName, _d, model, hasOneIndex, values, recordToDelete, index, values, value, recordToDelete, modelsToDelete, _e, e_12_1, model, index, keyValues, childRecords, childModels, e_13_1, e_11_1;
            var _this = this;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        _f.trys.push([0, 42, 43, 48]);
                        relations_1 = __asyncValues(relations);
                        _f.label = 1;
                    case 1: return [4 /*yield*/, relations_1.next()];
                    case 2:
                        if (!(relations_1_1 = _f.sent(), !relations_1_1.done)) return [3 /*break*/, 41];
                        rel = relations_1_1.value;
                        relationType = rel.relationType, modelName = rel.modelName, targetName = rel.targetName, targetNames = rel.targetNames, associatedWith = rel.associatedWith;
                        storeName = getStorename(nameSpace, modelName);
                        _d = relationType;
                        switch (_d) {
                            case 'HAS_ONE': return [3 /*break*/, 3];
                            case 'HAS_MANY': return [3 /*break*/, 23];
                            case 'BELONGS_TO': return [3 /*break*/, 38];
                        }
                        return [3 /*break*/, 39];
                    case 3:
                        _f.trys.push([3, 16, 17, 22]);
                        models_1 = __asyncValues(models);
                        _f.label = 4;
                    case 4: return [4 /*yield*/, models_1.next()];
                    case 5:
                        if (!(models_1_1 = _f.sent(), !models_1_1.done)) return [3 /*break*/, 15];
                        model = models_1_1.value;
                        hasOneIndex = 'byPk';
                        if (!(targetNames === null || targetNames === void 0 ? void 0 : targetNames.length)) return [3 /*break*/, 8];
                        values = targetNames
                            .filter(function (targetName) { var _a; return (_a = model[targetName]) !== null && _a !== void 0 ? _a : false; })
                            .map(function (targetName) { return model[targetName]; });
                        if (values.length === 0)
                            return [3 /*break*/, 15];
                        return [4 /*yield*/, this.db
                                .transaction(storeName, 'readwrite')
                                .objectStore(storeName)
                                .index(hasOneIndex)
                                .get(this.canonicalKeyPath(values))];
                    case 6:
                        recordToDelete = (_f.sent());
                        return [4 /*yield*/, this.deleteTraverse(this.schema.namespaces[nameSpace].relationships[modelName]
                                .relationTypes, recordToDelete ? [recordToDelete] : [], modelName, nameSpace, deleteQueue)];
                    case 7:
                        _f.sent();
                        return [3 /*break*/, 15];
                    case 8:
                        index = void 0;
                        values = void 0;
                        if (targetName && targetName in model) {
                            index = hasOneIndex;
                            value = model[targetName];
                            if (value === null)
                                return [3 /*break*/, 15];
                            values = [value];
                        }
                        else {
                            // backwards compatability for older versions of codegen that did not emit targetName for HAS_ONE relations
                            // TODO: can we deprecate this? it's been ~2 years since codegen started including targetName for HAS_ONE
                            // If we deprecate, we'll need to re-gen the MIPR in __tests__/schema.ts > newSchema
                            // otherwise some unit tests will fail
                            index = getIndex(this.schema.namespaces[nameSpace].relationships[modelName]
                                .relationTypes, srcModel);
                            values = this.getIndexKeyValuesFromModel(model);
                        }
                        if (!values || !index)
                            return [3 /*break*/, 15];
                        return [4 /*yield*/, this.db
                                .transaction(storeName, 'readwrite')
                                .objectStore(storeName)
                                .index(index)
                                .get(this.canonicalKeyPath(values))];
                    case 9:
                        recordToDelete = (_f.sent());
                        if (!recordToDelete) return [3 /*break*/, 11];
                        return [4 /*yield*/, this.load(nameSpace, modelName, [recordToDelete])];
                    case 10:
                        _e = _f.sent();
                        return [3 /*break*/, 12];
                    case 11:
                        _e = [];
                        _f.label = 12;
                    case 12:
                        modelsToDelete = _e;
                        return [4 /*yield*/, this.deleteTraverse(this.schema.namespaces[nameSpace].relationships[modelName]
                                .relationTypes, modelsToDelete, modelName, nameSpace, deleteQueue)];
                    case 13:
                        _f.sent();
                        _f.label = 14;
                    case 14: return [3 /*break*/, 4];
                    case 15: return [3 /*break*/, 22];
                    case 16:
                        e_12_1 = _f.sent();
                        e_12 = { error: e_12_1 };
                        return [3 /*break*/, 22];
                    case 17:
                        _f.trys.push([17, , 20, 21]);
                        if (!(models_1_1 && !models_1_1.done && (_b = models_1.return))) return [3 /*break*/, 19];
                        return [4 /*yield*/, _b.call(models_1)];
                    case 18:
                        _f.sent();
                        _f.label = 19;
                    case 19: return [3 /*break*/, 21];
                    case 20:
                        if (e_12) throw e_12.error;
                        return [7 /*endfinally*/];
                    case 21: return [7 /*endfinally*/];
                    case 22: return [3 /*break*/, 40];
                    case 23:
                        _f.trys.push([23, 31, 32, 37]);
                        models_2 = __asyncValues(models);
                        _f.label = 24;
                    case 24: return [4 /*yield*/, models_2.next()];
                    case 25:
                        if (!(models_2_1 = _f.sent(), !models_2_1.done)) return [3 /*break*/, 30];
                        model = models_2_1.value;
                        index = 
                        // explicit bi-directional @hasMany and @manyToMany
                        getIndex(this.schema.namespaces[nameSpace].relationships[modelName]
                            .relationTypes, srcModel) ||
                            // uni and/or implicit @hasMany
                            getIndexFromAssociation(this.schema.namespaces[nameSpace].relationships[modelName]
                                .indexes, associatedWith);
                        keyValues = this.getIndexKeyValuesFromModel(model);
                        return [4 /*yield*/, this.db
                                .transaction(storeName, 'readwrite')
                                .objectStore(storeName)
                                .index(index)
                                .getAll(this.canonicalKeyPath(keyValues))];
                    case 26:
                        childRecords = _f.sent();
                        return [4 /*yield*/, this.load(nameSpace, modelName, childRecords)];
                    case 27:
                        childModels = _f.sent();
                        return [4 /*yield*/, this.deleteTraverse(this.schema.namespaces[nameSpace].relationships[modelName]
                                .relationTypes, childModels, modelName, nameSpace, deleteQueue)];
                    case 28:
                        _f.sent();
                        _f.label = 29;
                    case 29: return [3 /*break*/, 24];
                    case 30: return [3 /*break*/, 37];
                    case 31:
                        e_13_1 = _f.sent();
                        e_13 = { error: e_13_1 };
                        return [3 /*break*/, 37];
                    case 32:
                        _f.trys.push([32, , 35, 36]);
                        if (!(models_2_1 && !models_2_1.done && (_c = models_2.return))) return [3 /*break*/, 34];
                        return [4 /*yield*/, _c.call(models_2)];
                    case 33:
                        _f.sent();
                        _f.label = 34;
                    case 34: return [3 /*break*/, 36];
                    case 35:
                        if (e_13) throw e_13.error;
                        return [7 /*endfinally*/];
                    case 36: return [7 /*endfinally*/];
                    case 37: return [3 /*break*/, 40];
                    case 38: 
                    // Intentionally blank
                    return [3 /*break*/, 40];
                    case 39: throw new Error("Invalid relation type " + relationType);
                    case 40: return [3 /*break*/, 1];
                    case 41: return [3 /*break*/, 48];
                    case 42:
                        e_11_1 = _f.sent();
                        e_11 = { error: e_11_1 };
                        return [3 /*break*/, 48];
                    case 43:
                        _f.trys.push([43, , 46, 47]);
                        if (!(relations_1_1 && !relations_1_1.done && (_a = relations_1.return))) return [3 /*break*/, 45];
                        return [4 /*yield*/, _a.call(relations_1)];
                    case 44:
                        _f.sent();
                        _f.label = 45;
                    case 45: return [3 /*break*/, 47];
                    case 46:
                        if (e_11) throw e_11.error;
                        return [7 /*endfinally*/];
                    case 47: return [7 /*endfinally*/];
                    case 48:
                        deleteQueue.push({
                            storeName: getStorename(nameSpace, srcModel),
                            items: models.map(function (record) {
                                return _this.modelInstanceCreator(_this.getModelConstructorByModelName(nameSpace, srcModel), record);
                            }),
                        });
                        return [2 /*return*/];
                }
            });
        });
    };
    IndexedDBAdapter.prototype.clear = function () {
        var _a;
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.checkPrivate()];
                    case 1:
                        _b.sent();
                        (_a = this.db) === null || _a === void 0 ? void 0 : _a.close();
                        return [4 /*yield*/, idb.deleteDB(this.dbName)];
                    case 2:
                        _b.sent();
                        this.db = undefined;
                        this.initPromise = undefined;
                        return [2 /*return*/];
                }
            });
        });
    };
    IndexedDBAdapter.prototype.batchSave = function (modelConstructor, items) {
        return __awaiter(this, void 0, void 0, function () {
            var result, storeName, txn, store, _loop_3, this_1, items_2, items_2_1, item, e_14_1;
            var e_14, _a;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (items.length === 0) {
                            return [2 /*return*/, []];
                        }
                        return [4 /*yield*/, this.checkPrivate()];
                    case 1:
                        _b.sent();
                        result = [];
                        storeName = this.getStorenameForModel(modelConstructor);
                        txn = this.db.transaction(storeName, 'readwrite');
                        store = txn.store;
                        _loop_3 = function (item) {
                            var namespaceName, modelName, model, connectedModels, keyValues, _deleted, index, key, instance;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        namespaceName = this_1.namespaceResolver(modelConstructor);
                                        modelName = modelConstructor.name;
                                        model = this_1.modelInstanceCreator(modelConstructor, item);
                                        connectedModels = traverseModel(modelName, model, this_1.schema.namespaces[namespaceName], this_1.modelInstanceCreator, this_1.getModelConstructorByModelName);
                                        keyValues = this_1.getIndexKeyValuesFromModel(model);
                                        _deleted = item._deleted;
                                        index = store.index('byPk');
                                        return [4 /*yield*/, index.getKey(this_1.canonicalKeyPath(keyValues))];
                                    case 1:
                                        key = _a.sent();
                                        if (!!_deleted) return [3 /*break*/, 3];
                                        instance = connectedModels.find(function (_a) {
                                            var instance = _a.instance;
                                            var instanceKeyValues = _this.getIndexKeyValuesFromModel(instance);
                                            return keysEqual(instanceKeyValues, keyValues);
                                        }).instance;
                                        result.push([
                                            instance,
                                            key ? OpType.UPDATE : OpType.INSERT,
                                        ]);
                                        return [4 /*yield*/, store.put(instance, key)];
                                    case 2:
                                        _a.sent();
                                        return [3 /*break*/, 5];
                                    case 3:
                                        result.push([item, OpType.DELETE]);
                                        if (!key) return [3 /*break*/, 5];
                                        return [4 /*yield*/, store.delete(key)];
                                    case 4:
                                        _a.sent();
                                        _a.label = 5;
                                    case 5: return [2 /*return*/];
                                }
                            });
                        };
                        this_1 = this;
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, 7, 8, 9]);
                        items_2 = __values(items), items_2_1 = items_2.next();
                        _b.label = 3;
                    case 3:
                        if (!!items_2_1.done) return [3 /*break*/, 6];
                        item = items_2_1.value;
                        return [5 /*yield**/, _loop_3(item)];
                    case 4:
                        _b.sent();
                        _b.label = 5;
                    case 5:
                        items_2_1 = items_2.next();
                        return [3 /*break*/, 3];
                    case 6: return [3 /*break*/, 9];
                    case 7:
                        e_14_1 = _b.sent();
                        e_14 = { error: e_14_1 };
                        return [3 /*break*/, 9];
                    case 8:
                        try {
                            if (items_2_1 && !items_2_1.done && (_a = items_2.return)) _a.call(items_2);
                        }
                        finally { if (e_14) throw e_14.error; }
                        return [7 /*endfinally*/];
                    case 9: return [4 /*yield*/, txn.done];
                    case 10:
                        _b.sent();
                        return [2 /*return*/, result];
                }
            });
        });
    };
    IndexedDBAdapter.prototype.createObjectStoreForModel = function (db, namespaceName, storeName, modelName) {
        var store = db.createObjectStore(storeName, {
            autoIncrement: true,
        });
        var indexes = this.schema.namespaces[namespaceName].relationships[modelName].indexes;
        indexes.forEach(function (_a) {
            var _b = __read(_a, 3), idxName = _b[0], keyPath = _b[1], options = _b[2];
            store.createIndex(idxName, keyPath, options);
        });
        return store;
    };
    return IndexedDBAdapter;
}());
export default new IndexedDBAdapter();
//# sourceMappingURL=IndexedDBAdapter.js.map