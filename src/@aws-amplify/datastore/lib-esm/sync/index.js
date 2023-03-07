import { __awaiter, __generator, __read, __spread, __values } from "tslib";
import { browserOrNode, ConsoleLogger as Logger, BackgroundProcessManager, } from '@aws-amplify/core';
import { CONTROL_MSG as PUBSUB_CONTROL_MSG } from '@aws-amplify/pubsub';
import Observable from 'zen-observable-ts';
import { ModelPredicateCreator } from '../predicates';
import { OpType, } from '../types';
import { getNow, SYNC, USER } from '../util';
import DataStoreConnectivity from './datastoreConnectivity';
import { ModelMerger } from './merger';
import { MutationEventOutbox } from './outbox';
import { MutationProcessor } from './processors/mutation';
import { CONTROL_MSG, SubscriptionProcessor } from './processors/subscription';
import { SyncProcessor } from './processors/sync';
import { createMutationInstanceFromModelOperation, getIdentifierValue, predicateToGraphQLCondition, } from './utils';
var isNode = browserOrNode().isNode;
var logger = new Logger('DataStore');
var ownSymbol = Symbol('sync');
export var ControlMessage;
(function (ControlMessage) {
    ControlMessage["SYNC_ENGINE_STORAGE_SUBSCRIBED"] = "storageSubscribed";
    ControlMessage["SYNC_ENGINE_SUBSCRIPTIONS_ESTABLISHED"] = "subscriptionsEstablished";
    ControlMessage["SYNC_ENGINE_SYNC_QUERIES_STARTED"] = "syncQueriesStarted";
    ControlMessage["SYNC_ENGINE_SYNC_QUERIES_READY"] = "syncQueriesReady";
    ControlMessage["SYNC_ENGINE_MODEL_SYNCED"] = "modelSynced";
    ControlMessage["SYNC_ENGINE_OUTBOX_MUTATION_ENQUEUED"] = "outboxMutationEnqueued";
    ControlMessage["SYNC_ENGINE_OUTBOX_MUTATION_PROCESSED"] = "outboxMutationProcessed";
    ControlMessage["SYNC_ENGINE_OUTBOX_STATUS"] = "outboxStatus";
    ControlMessage["SYNC_ENGINE_NETWORK_STATUS"] = "networkStatus";
    ControlMessage["SYNC_ENGINE_READY"] = "ready";
})(ControlMessage || (ControlMessage = {}));
var SyncEngine = /** @class */ (function () {
    function SyncEngine(schema, namespaceResolver, modelClasses, userModelClasses, storage, modelInstanceCreator, conflictHandler, errorHandler, syncPredicates, amplifyConfig, authModeStrategy, amplifyContext, connectivityMonitor) {
        if (amplifyConfig === void 0) { amplifyConfig = {}; }
        this.schema = schema;
        this.namespaceResolver = namespaceResolver;
        this.modelClasses = modelClasses;
        this.userModelClasses = userModelClasses;
        this.storage = storage;
        this.modelInstanceCreator = modelInstanceCreator;
        this.syncPredicates = syncPredicates;
        this.amplifyConfig = amplifyConfig;
        this.authModeStrategy = authModeStrategy;
        this.amplifyContext = amplifyContext;
        this.connectivityMonitor = connectivityMonitor;
        this.online = false;
        this.modelSyncedStatus = new WeakMap();
        this.runningProcesses = new BackgroundProcessManager();
        var MutationEvent = this.modelClasses['MutationEvent'];
        this.outbox = new MutationEventOutbox(this.schema, MutationEvent, modelInstanceCreator, ownSymbol);
        this.modelMerger = new ModelMerger(this.outbox, ownSymbol);
        this.syncQueriesProcessor = new SyncProcessor(this.schema, this.syncPredicates, this.amplifyConfig, this.authModeStrategy, errorHandler, this.amplifyContext);
        this.subscriptionsProcessor = new SubscriptionProcessor(this.schema, this.syncPredicates, this.amplifyConfig, this.authModeStrategy, errorHandler, this.amplifyContext);
        this.mutationsProcessor = new MutationProcessor(this.schema, this.storage, this.userModelClasses, this.outbox, this.modelInstanceCreator, MutationEvent, this.amplifyConfig, this.authModeStrategy, errorHandler, conflictHandler, this.amplifyContext);
        this.datastoreConnectivity =
            this.connectivityMonitor || new DataStoreConnectivity();
    }
    SyncEngine.prototype.getModelSyncedStatus = function (modelConstructor) {
        return this.modelSyncedStatus.get(modelConstructor);
    };
    SyncEngine.prototype.start = function (params) {
        var _this = this;
        return new Observable(function (observer) {
            logger.log('starting sync engine...');
            var subscriptions = [];
            _this.runningProcesses.add(function () { return __awaiter(_this, void 0, void 0, function () {
                var err_1, startPromise, hasMutationsInOutbox;
                var _this = this;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 2, , 3]);
                            return [4 /*yield*/, this.setupModels(params)];
                        case 1:
                            _a.sent();
                            return [3 /*break*/, 3];
                        case 2:
                            err_1 = _a.sent();
                            observer.error(err_1);
                            return [2 /*return*/];
                        case 3:
                            startPromise = new Promise(function (doneStarting, failedStarting) {
                                _this.datastoreConnectivity.status().subscribe(function (_a) {
                                    var online = _a.online;
                                    return __awaiter(_this, void 0, void 0, function () {
                                        var _this = this;
                                        return __generator(this, function (_b) {
                                            return [2 /*return*/, this.runningProcesses.isOpen &&
                                                    this.runningProcesses.add(function (onTerminate) { return __awaiter(_this, void 0, void 0, function () {
                                                        var ctlSubsObservable_1, dataSubsObservable, err_2, error_1;
                                                        var _a;
                                                        var _this = this;
                                                        return __generator(this, function (_b) {
                                                            switch (_b.label) {
                                                                case 0:
                                                                    if (!(online && !this.online)) return [3 /*break*/, 10];
                                                                    this.online = online;
                                                                    observer.next({
                                                                        type: ControlMessage.SYNC_ENGINE_NETWORK_STATUS,
                                                                        data: {
                                                                            active: this.online,
                                                                        },
                                                                    });
                                                                    dataSubsObservable = void 0;
                                                                    if (!isNode) return [3 /*break*/, 1];
                                                                    logger.warn('Realtime disabled when in a server-side environment');
                                                                    return [3 /*break*/, 6];
                                                                case 1:
                                                                    //#region GraphQL Subscriptions
                                                                    _a = __read(this.subscriptionsProcessor.start(), 2), ctlSubsObservable_1 = _a[0], dataSubsObservable = _a[1];
                                                                    _b.label = 2;
                                                                case 2:
                                                                    _b.trys.push([2, 4, , 5]);
                                                                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                                                                            onTerminate.then(reject);
                                                                            var ctlSubsSubscription = ctlSubsObservable_1.subscribe({
                                                                                next: function (msg) {
                                                                                    if (msg === CONTROL_MSG.CONNECTED) {
                                                                                        resolve();
                                                                                    }
                                                                                },
                                                                                error: function (err) {
                                                                                    reject(err);
                                                                                    var handleDisconnect = _this.disconnectionHandler();
                                                                                    handleDisconnect(err);
                                                                                },
                                                                            });
                                                                            subscriptions.push(ctlSubsSubscription);
                                                                        })];
                                                                case 3:
                                                                    _b.sent();
                                                                    return [3 /*break*/, 5];
                                                                case 4:
                                                                    err_2 = _b.sent();
                                                                    observer.error(err_2);
                                                                    failedStarting();
                                                                    return [2 /*return*/];
                                                                case 5:
                                                                    logger.log('Realtime ready');
                                                                    observer.next({
                                                                        type: ControlMessage.SYNC_ENGINE_SUBSCRIPTIONS_ESTABLISHED,
                                                                    });
                                                                    _b.label = 6;
                                                                case 6:
                                                                    _b.trys.push([6, 8, , 9]);
                                                                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                                                                            var syncQuerySubscription = _this.syncQueriesObservable().subscribe({
                                                                                next: function (message) {
                                                                                    var type = message.type;
                                                                                    if (type ===
                                                                                        ControlMessage.SYNC_ENGINE_SYNC_QUERIES_READY) {
                                                                                        resolve();
                                                                                    }
                                                                                    observer.next(message);
                                                                                },
                                                                                complete: function () {
                                                                                    resolve();
                                                                                },
                                                                                error: function (error) {
                                                                                    reject(error);
                                                                                },
                                                                            });
                                                                            if (syncQuerySubscription) {
                                                                                subscriptions.push(syncQuerySubscription);
                                                                            }
                                                                        })];
                                                                case 7:
                                                                    _b.sent();
                                                                    return [3 /*break*/, 9];
                                                                case 8:
                                                                    error_1 = _b.sent();
                                                                    observer.error(error_1);
                                                                    failedStarting();
                                                                    return [2 /*return*/];
                                                                case 9:
                                                                    //#endregion
                                                                    //#region process mutations (outbox)
                                                                    subscriptions.push(this.mutationsProcessor
                                                                        .start()
                                                                        .subscribe(function (_a) {
                                                                        var modelDefinition = _a.modelDefinition, item = _a.model, hasMore = _a.hasMore;
                                                                        return _this.runningProcesses.add(function () { return __awaiter(_this, void 0, void 0, function () {
                                                                            var modelConstructor, model;
                                                                            var _this = this;
                                                                            return __generator(this, function (_a) {
                                                                                switch (_a.label) {
                                                                                    case 0:
                                                                                        modelConstructor = this.userModelClasses[modelDefinition.name];
                                                                                        model = this.modelInstanceCreator(modelConstructor, item);
                                                                                        return [4 /*yield*/, this.storage.runExclusive(function (storage) {
                                                                                                return _this.modelMerger.merge(storage, model, modelDefinition);
                                                                                            })];
                                                                                    case 1:
                                                                                        _a.sent();
                                                                                        observer.next({
                                                                                            type: ControlMessage.SYNC_ENGINE_OUTBOX_MUTATION_PROCESSED,
                                                                                            data: {
                                                                                                model: modelConstructor,
                                                                                                element: model,
                                                                                            },
                                                                                        });
                                                                                        observer.next({
                                                                                            type: ControlMessage.SYNC_ENGINE_OUTBOX_STATUS,
                                                                                            data: {
                                                                                                isEmpty: !hasMore,
                                                                                            },
                                                                                        });
                                                                                        return [2 /*return*/];
                                                                                }
                                                                            });
                                                                        }); }, 'mutation processor event');
                                                                    }));
                                                                    //#endregion
                                                                    //#region Merge subscriptions buffer
                                                                    // TODO: extract to function
                                                                    if (!isNode) {
                                                                        subscriptions.push(dataSubsObservable.subscribe(function (_a) {
                                                                            var _b = __read(_a, 3), _transformerMutationType = _b[0], modelDefinition = _b[1], item = _b[2];
                                                                            return _this.runningProcesses.add(function () { return __awaiter(_this, void 0, void 0, function () {
                                                                                var modelConstructor, model;
                                                                                var _this = this;
                                                                                return __generator(this, function (_a) {
                                                                                    switch (_a.label) {
                                                                                        case 0:
                                                                                            modelConstructor = this.userModelClasses[modelDefinition.name];
                                                                                            model = this.modelInstanceCreator(modelConstructor, item);
                                                                                            return [4 /*yield*/, this.storage.runExclusive(function (storage) {
                                                                                                    return _this.modelMerger.merge(storage, model, modelDefinition);
                                                                                                })];
                                                                                        case 1:
                                                                                            _a.sent();
                                                                                            return [2 /*return*/];
                                                                                    }
                                                                                });
                                                                            }); }, 'subscription dataSubsObservable event');
                                                                        }));
                                                                    }
                                                                    return [3 /*break*/, 11];
                                                                case 10:
                                                                    if (!online) {
                                                                        this.online = online;
                                                                        observer.next({
                                                                            type: ControlMessage.SYNC_ENGINE_NETWORK_STATUS,
                                                                            data: {
                                                                                active: this.online,
                                                                            },
                                                                        });
                                                                        subscriptions.forEach(function (sub) { return sub.unsubscribe(); });
                                                                        subscriptions = [];
                                                                    }
                                                                    _b.label = 11;
                                                                case 11:
                                                                    doneStarting();
                                                                    return [2 /*return*/];
                                                            }
                                                        });
                                                    }); }, 'datastore connectivity event')];
                                        });
                                    });
                                });
                            });
                            this.storage
                                .observe(null, null, ownSymbol)
                                .filter(function (_a) {
                                var model = _a.model;
                                var modelDefinition = _this.getModelDefinition(model);
                                return modelDefinition.syncable === true;
                            })
                                .subscribe({
                                next: function (_a) {
                                    var opType = _a.opType, model = _a.model, element = _a.element, condition = _a.condition;
                                    return __awaiter(_this, void 0, void 0, function () {
                                        var _this = this;
                                        return __generator(this, function (_b) {
                                            return [2 /*return*/, this.runningProcesses.add(function () { return __awaiter(_this, void 0, void 0, function () {
                                                    var namespace, MutationEventConstructor, modelDefinition, graphQLCondition, mutationEvent;
                                                    return __generator(this, function (_a) {
                                                        switch (_a.label) {
                                                            case 0:
                                                                namespace = this.schema.namespaces[this.namespaceResolver(model)];
                                                                MutationEventConstructor = this.modelClasses['MutationEvent'];
                                                                modelDefinition = this.getModelDefinition(model);
                                                                graphQLCondition = predicateToGraphQLCondition(condition, modelDefinition);
                                                                mutationEvent = createMutationInstanceFromModelOperation(namespace.relationships, this.getModelDefinition(model), opType, model, element, graphQLCondition, MutationEventConstructor, this.modelInstanceCreator);
                                                                return [4 /*yield*/, this.outbox.enqueue(this.storage, mutationEvent)];
                                                            case 1:
                                                                _a.sent();
                                                                observer.next({
                                                                    type: ControlMessage.SYNC_ENGINE_OUTBOX_MUTATION_ENQUEUED,
                                                                    data: {
                                                                        model: model,
                                                                        element: element,
                                                                    },
                                                                });
                                                                observer.next({
                                                                    type: ControlMessage.SYNC_ENGINE_OUTBOX_STATUS,
                                                                    data: {
                                                                        isEmpty: false,
                                                                    },
                                                                });
                                                                return [4 /*yield*/, startPromise];
                                                            case 2:
                                                                _a.sent();
                                                                if (this.online) {
                                                                    this.mutationsProcessor.resume();
                                                                }
                                                                return [2 /*return*/];
                                                        }
                                                    });
                                                }); }, 'storage event')];
                                        });
                                    });
                                },
                            });
                            observer.next({
                                type: ControlMessage.SYNC_ENGINE_STORAGE_SUBSCRIBED,
                            });
                            return [4 /*yield*/, this.outbox.peek(this.storage)];
                        case 4:
                            hasMutationsInOutbox = (_a.sent()) === undefined;
                            observer.next({
                                type: ControlMessage.SYNC_ENGINE_OUTBOX_STATUS,
                                data: {
                                    isEmpty: hasMutationsInOutbox,
                                },
                            });
                            return [4 /*yield*/, startPromise];
                        case 5:
                            _a.sent();
                            observer.next({
                                type: ControlMessage.SYNC_ENGINE_READY,
                            });
                            return [2 /*return*/];
                    }
                });
            }); }, 'sync start');
        });
    };
    SyncEngine.prototype.getModelsMetadataWithNextFullSync = function (currentTimeStamp) {
        return __awaiter(this, void 0, void 0, function () {
            var modelLastSync, _a;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = Map.bind;
                        return [4 /*yield*/, this.runningProcesses.add(function () { return _this.getModelsMetadata(); }, 'sync/index getModelsMetadataWithNextFullSync')];
                    case 1:
                        modelLastSync = new (_a.apply(Map, [void 0, (_b.sent()).map(function (_a) {
                                var namespace = _a.namespace, model = _a.model, lastSync = _a.lastSync, lastFullSync = _a.lastFullSync, fullSyncInterval = _a.fullSyncInterval, lastSyncPredicate = _a.lastSyncPredicate;
                                var nextFullSync = lastFullSync + fullSyncInterval;
                                var syncFrom = !lastFullSync || nextFullSync < currentTimeStamp
                                    ? 0 // perform full sync if expired
                                    : lastSync; // perform delta sync
                                return [
                                    _this.schema.namespaces[namespace].models[model],
                                    [namespace, syncFrom],
                                ];
                            })]))();
                        return [2 /*return*/, modelLastSync];
                }
            });
        });
    };
    SyncEngine.prototype.syncQueriesObservable = function () {
        var _this = this;
        if (!this.online) {
            return Observable.of();
        }
        return new Observable(function (observer) {
            var syncQueriesSubscription;
            _this.runningProcesses.isOpen &&
                _this.runningProcesses.add(function (onTerminate) { return __awaiter(_this, void 0, void 0, function () {
                    var terminated, _loop_1, this_1;
                    var _this = this;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                terminated = false;
                                _loop_1 = function () {
                                    var count, modelLastSync, paginatingModels, lastFullSyncStartedAt, syncInterval, start, syncDuration, lastStartedAt, msNextFullSync;
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0:
                                                count = new WeakMap();
                                                return [4 /*yield*/, this_1.getModelsMetadataWithNextFullSync(Date.now())];
                                            case 1:
                                                modelLastSync = _a.sent();
                                                paginatingModels = new Set(modelLastSync.keys());
                                                return [4 /*yield*/, new Promise(function (resolve, reject) {
                                                        if (!_this.runningProcesses.isOpen)
                                                            resolve();
                                                        onTerminate.then(function () { return resolve(); });
                                                        syncQueriesSubscription = _this.syncQueriesProcessor
                                                            .start(modelLastSync)
                                                            .subscribe({
                                                            next: function (_a) {
                                                                var namespace = _a.namespace, modelDefinition = _a.modelDefinition, items = _a.items, done = _a.done, startedAt = _a.startedAt, isFullSync = _a.isFullSync;
                                                                return __awaiter(_this, void 0, void 0, function () {
                                                                    var modelConstructor, modelName, modelMetadata_1, lastFullSync, fullSyncInterval, counts;
                                                                    var _this = this;
                                                                    return __generator(this, function (_b) {
                                                                        switch (_b.label) {
                                                                            case 0:
                                                                                modelConstructor = this.userModelClasses[modelDefinition.name];
                                                                                if (!count.has(modelConstructor)) {
                                                                                    count.set(modelConstructor, {
                                                                                        new: 0,
                                                                                        updated: 0,
                                                                                        deleted: 0,
                                                                                    });
                                                                                    start = getNow();
                                                                                    lastStartedAt =
                                                                                        lastStartedAt === undefined
                                                                                            ? startedAt
                                                                                            : Math.max(lastStartedAt, startedAt);
                                                                                }
                                                                                /**
                                                                                 * If there are mutations in the outbox for a given id, those need to be
                                                                                 * merged individually. Otherwise, we can merge them in batches.
                                                                                 */
                                                                                return [4 /*yield*/, this.storage.runExclusive(function (storage) { return __awaiter(_this, void 0, void 0, function () {
                                                                                        var idsInOutbox, oneByOne, page, opTypeCount, oneByOne_1, oneByOne_1_1, item, opType, e_1_1, _a, _b, _c, counts;
                                                                                        var e_1, _d;
                                                                                        return __generator(this, function (_e) {
                                                                                            switch (_e.label) {
                                                                                                case 0: return [4 /*yield*/, this.outbox.getModelIds(storage)];
                                                                                                case 1:
                                                                                                    idsInOutbox = _e.sent();
                                                                                                    oneByOne = [];
                                                                                                    page = items.filter(function (item) {
                                                                                                        var itemId = getIdentifierValue(modelDefinition, item);
                                                                                                        if (!idsInOutbox.has(itemId)) {
                                                                                                            return true;
                                                                                                        }
                                                                                                        oneByOne.push(item);
                                                                                                        return false;
                                                                                                    });
                                                                                                    opTypeCount = [];
                                                                                                    _e.label = 2;
                                                                                                case 2:
                                                                                                    _e.trys.push([2, 7, 8, 9]);
                                                                                                    oneByOne_1 = __values(oneByOne), oneByOne_1_1 = oneByOne_1.next();
                                                                                                    _e.label = 3;
                                                                                                case 3:
                                                                                                    if (!!oneByOne_1_1.done) return [3 /*break*/, 6];
                                                                                                    item = oneByOne_1_1.value;
                                                                                                    return [4 /*yield*/, this.modelMerger.merge(storage, item, modelDefinition)];
                                                                                                case 4:
                                                                                                    opType = _e.sent();
                                                                                                    if (opType !== undefined) {
                                                                                                        opTypeCount.push([item, opType]);
                                                                                                    }
                                                                                                    _e.label = 5;
                                                                                                case 5:
                                                                                                    oneByOne_1_1 = oneByOne_1.next();
                                                                                                    return [3 /*break*/, 3];
                                                                                                case 6: return [3 /*break*/, 9];
                                                                                                case 7:
                                                                                                    e_1_1 = _e.sent();
                                                                                                    e_1 = { error: e_1_1 };
                                                                                                    return [3 /*break*/, 9];
                                                                                                case 8:
                                                                                                    try {
                                                                                                        if (oneByOne_1_1 && !oneByOne_1_1.done && (_d = oneByOne_1.return)) _d.call(oneByOne_1);
                                                                                                    }
                                                                                                    finally { if (e_1) throw e_1.error; }
                                                                                                    return [7 /*endfinally*/];
                                                                                                case 9:
                                                                                                    _b = (_a = opTypeCount.push).apply;
                                                                                                    _c = [opTypeCount];
                                                                                                    return [4 /*yield*/, this.modelMerger.mergePage(storage, modelConstructor, page, modelDefinition)];
                                                                                                case 10:
                                                                                                    _b.apply(_a, _c.concat([__spread.apply(void 0, [(_e.sent())])]));
                                                                                                    counts = count.get(modelConstructor);
                                                                                                    opTypeCount.forEach(function (_a) {
                                                                                                        var _b = __read(_a, 2), opType = _b[1];
                                                                                                        switch (opType) {
                                                                                                            case OpType.INSERT:
                                                                                                                counts.new++;
                                                                                                                break;
                                                                                                            case OpType.UPDATE:
                                                                                                                counts.updated++;
                                                                                                                break;
                                                                                                            case OpType.DELETE:
                                                                                                                counts.deleted++;
                                                                                                                break;
                                                                                                            default:
                                                                                                                throw new Error("Invalid opType " + opType);
                                                                                                        }
                                                                                                    });
                                                                                                    return [2 /*return*/];
                                                                                            }
                                                                                        });
                                                                                    }); })];
                                                                            case 1:
                                                                                /**
                                                                                 * If there are mutations in the outbox for a given id, those need to be
                                                                                 * merged individually. Otherwise, we can merge them in batches.
                                                                                 */
                                                                                _b.sent();
                                                                                if (!done) return [3 /*break*/, 4];
                                                                                modelName = modelDefinition.name;
                                                                                return [4 /*yield*/, this.getModelMetadata(namespace, modelName)];
                                                                            case 2:
                                                                                modelMetadata_1 = _b.sent();
                                                                                lastFullSync = modelMetadata_1.lastFullSync, fullSyncInterval = modelMetadata_1.fullSyncInterval;
                                                                                syncInterval = fullSyncInterval;
                                                                                lastFullSyncStartedAt =
                                                                                    lastFullSyncStartedAt === undefined
                                                                                        ? lastFullSync
                                                                                        : Math.max(lastFullSyncStartedAt, isFullSync ? startedAt : lastFullSync);
                                                                                modelMetadata_1 = this.modelClasses
                                                                                    .ModelMetadata.copyOf(modelMetadata_1, function (draft) {
                                                                                    draft.lastSync = startedAt;
                                                                                    draft.lastFullSync = isFullSync
                                                                                        ? startedAt
                                                                                        : modelMetadata_1.lastFullSync;
                                                                                });
                                                                                return [4 /*yield*/, this.storage.save(modelMetadata_1, undefined, ownSymbol)];
                                                                            case 3:
                                                                                _b.sent();
                                                                                counts = count.get(modelConstructor);
                                                                                this.modelSyncedStatus.set(modelConstructor, true);
                                                                                observer.next({
                                                                                    type: ControlMessage.SYNC_ENGINE_MODEL_SYNCED,
                                                                                    data: {
                                                                                        model: modelConstructor,
                                                                                        isFullSync: isFullSync,
                                                                                        isDeltaSync: !isFullSync,
                                                                                        counts: counts,
                                                                                    },
                                                                                });
                                                                                paginatingModels.delete(modelDefinition);
                                                                                if (paginatingModels.size === 0) {
                                                                                    syncDuration = getNow() - start;
                                                                                    resolve();
                                                                                    observer.next({
                                                                                        type: ControlMessage.SYNC_ENGINE_SYNC_QUERIES_READY,
                                                                                    });
                                                                                    syncQueriesSubscription.unsubscribe();
                                                                                }
                                                                                _b.label = 4;
                                                                            case 4: return [2 /*return*/];
                                                                        }
                                                                    });
                                                                });
                                                            },
                                                            error: function (error) {
                                                                observer.error(error);
                                                            },
                                                        });
                                                        observer.next({
                                                            type: ControlMessage.SYNC_ENGINE_SYNC_QUERIES_STARTED,
                                                            data: {
                                                                models: Array.from(paginatingModels).map(function (_a) {
                                                                    var name = _a.name;
                                                                    return name;
                                                                }),
                                                            },
                                                        });
                                                    })];
                                            case 2:
                                                _a.sent();
                                                if (!lastFullSyncStartedAt) {
                                                    msNextFullSync = syncInterval - syncDuration;
                                                }
                                                else {
                                                    msNextFullSync =
                                                        lastFullSyncStartedAt +
                                                            syncInterval -
                                                            (lastStartedAt + syncDuration);
                                                }
                                                logger.debug("Next fullSync in " + msNextFullSync / 1000 + " seconds. (" + new Date(Date.now() + msNextFullSync) + ")");
                                                // TODO: create `BackgroundProcessManager.sleep()` ... but, need to put
                                                // a lot of thought into what that contract looks like to
                                                //  support possible use-cases:
                                                //
                                                //  1. non-cancelable
                                                //  2. cancelable, unsleep on exit()
                                                //  3. cancelable, throw Error on exit()
                                                //  4. cancelable, callback first on exit()?
                                                //  5. ... etc. ? ...
                                                //
                                                // TLDR; this is a lot of complexity here for a sleep(),
                                                // but, it's not clear to me yet how to support an
                                                // extensible, centralized cancelable `sleep()` elegantly.
                                                return [4 /*yield*/, this_1.runningProcesses.add(function (onTerminate) { return __awaiter(_this, void 0, void 0, function () {
                                                        var sleepTimer, unsleep, sleep;
                                                        return __generator(this, function (_a) {
                                                            sleep = new Promise(function (_unsleep) {
                                                                unsleep = _unsleep;
                                                                sleepTimer = setTimeout(unsleep, msNextFullSync);
                                                            });
                                                            onTerminate.then(function () {
                                                                terminated = true;
                                                                unsleep();
                                                            });
                                                            return [2 /*return*/, sleep];
                                                        });
                                                    }); }, 'syncQueriesObservable sleep')];
                                            case 3:
                                                // TODO: create `BackgroundProcessManager.sleep()` ... but, need to put
                                                // a lot of thought into what that contract looks like to
                                                //  support possible use-cases:
                                                //
                                                //  1. non-cancelable
                                                //  2. cancelable, unsleep on exit()
                                                //  3. cancelable, throw Error on exit()
                                                //  4. cancelable, callback first on exit()?
                                                //  5. ... etc. ? ...
                                                //
                                                // TLDR; this is a lot of complexity here for a sleep(),
                                                // but, it's not clear to me yet how to support an
                                                // extensible, centralized cancelable `sleep()` elegantly.
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                };
                                this_1 = this;
                                _a.label = 1;
                            case 1:
                                if (!(!observer.closed && !terminated)) return [3 /*break*/, 3];
                                return [5 /*yield**/, _loop_1()];
                            case 2:
                                _a.sent();
                                return [3 /*break*/, 1];
                            case 3: return [2 /*return*/];
                        }
                    });
                }); }, 'syncQueriesObservable main');
        });
    };
    SyncEngine.prototype.disconnectionHandler = function () {
        var _this = this;
        return function (msg) {
            // This implementation is tied to AWSAppSyncRealTimeProvider 'Connection closed', 'Timeout disconnect' msg
            if (PUBSUB_CONTROL_MSG.CONNECTION_CLOSED === msg ||
                PUBSUB_CONTROL_MSG.TIMEOUT_DISCONNECT === msg) {
                _this.datastoreConnectivity.socketDisconnected();
            }
        };
    };
    SyncEngine.prototype.unsubscribeConnectivity = function () {
        this.datastoreConnectivity.unsubscribe();
    };
    /**
     * Stops all subscription activities and resolves when all activies report
     * that they're disconnected, done retrying, etc..
     */
    SyncEngine.prototype.stop = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logger.debug('stopping sync engine');
                        /**
                         * Gracefully disconnecting subscribers first just prevents *more* work
                         * from entering the pipelines.
                         */
                        this.unsubscribeConnectivity();
                        /**
                         * aggressively shut down any lingering background processes.
                         * some of this might be semi-redundant with unsubscribing. however,
                         * unsubscribing doesn't allow us to wait for settling.
                         * (Whereas `stop()` does.)
                         */
                        return [4 /*yield*/, this.mutationsProcessor.stop()];
                    case 1:
                        /**
                         * aggressively shut down any lingering background processes.
                         * some of this might be semi-redundant with unsubscribing. however,
                         * unsubscribing doesn't allow us to wait for settling.
                         * (Whereas `stop()` does.)
                         */
                        _a.sent();
                        return [4 /*yield*/, this.subscriptionsProcessor.stop()];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, this.datastoreConnectivity.stop()];
                    case 3:
                        _a.sent();
                        return [4 /*yield*/, this.syncQueriesProcessor.stop()];
                    case 4:
                        _a.sent();
                        return [4 /*yield*/, this.runningProcesses.close()];
                    case 5:
                        _a.sent();
                        return [4 /*yield*/, this.runningProcesses.open()];
                    case 6:
                        _a.sent();
                        logger.debug('sync engine stopped and ready to restart');
                        return [2 /*return*/];
                }
            });
        });
    };
    SyncEngine.prototype.setupModels = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var fullSyncInterval, ModelMetadataConstructor, models, savedModel, promises, result, _a, _b, modelMetadata, modelName, e_2_1;
            var e_2, _c;
            var _this = this;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        fullSyncInterval = params.fullSyncInterval;
                        ModelMetadataConstructor = this.modelClasses
                            .ModelMetadata;
                        models = [];
                        Object.values(this.schema.namespaces).forEach(function (namespace) {
                            Object.values(namespace.models)
                                .filter(function (_a) {
                                var syncable = _a.syncable;
                                return syncable;
                            })
                                .forEach(function (model) {
                                models.push([namespace.name, model]);
                                if (namespace.name === USER) {
                                    var modelConstructor = _this.userModelClasses[model.name];
                                    _this.modelSyncedStatus.set(modelConstructor, false);
                                }
                            });
                        });
                        promises = models.map(function (_a) {
                            var _b = __read(_a, 2), namespace = _b[0], model = _b[1];
                            return __awaiter(_this, void 0, void 0, function () {
                                var modelMetadata, syncPredicate, lastSyncPredicate, prevSyncPredicate, syncPredicateUpdated_1;
                                var _c, _d, _e, _f;
                                return __generator(this, function (_g) {
                                    switch (_g.label) {
                                        case 0: return [4 /*yield*/, this.getModelMetadata(namespace, model.name)];
                                        case 1:
                                            modelMetadata = _g.sent();
                                            syncPredicate = ModelPredicateCreator.getPredicates(this.syncPredicates.get(model), false);
                                            lastSyncPredicate = syncPredicate
                                                ? JSON.stringify(syncPredicate)
                                                : null;
                                            if (!(modelMetadata === undefined)) return [3 /*break*/, 3];
                                            return [4 /*yield*/, this.storage.save(this.modelInstanceCreator(ModelMetadataConstructor, {
                                                    model: model.name,
                                                    namespace: namespace,
                                                    lastSync: null,
                                                    fullSyncInterval: fullSyncInterval,
                                                    lastFullSync: null,
                                                    lastSyncPredicate: lastSyncPredicate,
                                                }), undefined, ownSymbol)];
                                        case 2:
                                            _c = __read.apply(void 0, [_g.sent(), 1]), _d = __read(_c[0], 1), savedModel = _d[0];
                                            return [3 /*break*/, 5];
                                        case 3:
                                            prevSyncPredicate = modelMetadata.lastSyncPredicate
                                                ? modelMetadata.lastSyncPredicate
                                                : null;
                                            syncPredicateUpdated_1 = prevSyncPredicate !== lastSyncPredicate;
                                            return [4 /*yield*/, this.storage.save(ModelMetadataConstructor.copyOf(modelMetadata, function (draft) {
                                                    draft.fullSyncInterval = fullSyncInterval;
                                                    // perform a base sync if the syncPredicate changed in between calls to DataStore.start
                                                    // ensures that the local store contains all the data specified by the syncExpression
                                                    if (syncPredicateUpdated_1) {
                                                        draft.lastSync = null;
                                                        draft.lastFullSync = null;
                                                        draft.lastSyncPredicate = lastSyncPredicate;
                                                    }
                                                }))];
                                        case 4:
                                            _e = __read.apply(void 0, [_g.sent(), 1]), _f = __read(_e[0], 1), savedModel = _f[0];
                                            _g.label = 5;
                                        case 5: return [2 /*return*/, savedModel];
                                    }
                                });
                            });
                        });
                        result = {};
                        _d.label = 1;
                    case 1:
                        _d.trys.push([1, 6, 7, 8]);
                        return [4 /*yield*/, Promise.all(promises)];
                    case 2:
                        _a = __values.apply(void 0, [_d.sent()]), _b = _a.next();
                        _d.label = 3;
                    case 3:
                        if (!!_b.done) return [3 /*break*/, 5];
                        modelMetadata = _b.value;
                        modelName = modelMetadata.model;
                        result[modelName] = modelMetadata;
                        _d.label = 4;
                    case 4:
                        _b = _a.next();
                        return [3 /*break*/, 3];
                    case 5: return [3 /*break*/, 8];
                    case 6:
                        e_2_1 = _d.sent();
                        e_2 = { error: e_2_1 };
                        return [3 /*break*/, 8];
                    case 7:
                        try {
                            if (_b && !_b.done && (_c = _a.return)) _c.call(_a);
                        }
                        finally { if (e_2) throw e_2.error; }
                        return [7 /*endfinally*/];
                    case 8: return [2 /*return*/, result];
                }
            });
        });
    };
    SyncEngine.prototype.getModelsMetadata = function () {
        return __awaiter(this, void 0, void 0, function () {
            var ModelMetadata, modelsMetadata;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        ModelMetadata = this.modelClasses
                            .ModelMetadata;
                        return [4 /*yield*/, this.storage.query(ModelMetadata)];
                    case 1:
                        modelsMetadata = _a.sent();
                        return [2 /*return*/, modelsMetadata];
                }
            });
        });
    };
    SyncEngine.prototype.getModelMetadata = function (namespace, model) {
        return __awaiter(this, void 0, void 0, function () {
            var ModelMetadata, predicate, _a, modelMetadata;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        ModelMetadata = this.modelClasses
                            .ModelMetadata;
                        predicate = ModelPredicateCreator.createFromExisting(this.schema.namespaces[SYNC].models[ModelMetadata.name], function (c) { return c.namespace('eq', namespace).model('eq', model); });
                        return [4 /*yield*/, this.storage.query(ModelMetadata, predicate, {
                                page: 0,
                                limit: 1,
                            })];
                    case 1:
                        _a = __read.apply(void 0, [_b.sent(), 1]), modelMetadata = _a[0];
                        return [2 /*return*/, modelMetadata];
                }
            });
        });
    };
    SyncEngine.prototype.getModelDefinition = function (modelConstructor) {
        var namespaceName = this.namespaceResolver(modelConstructor);
        var modelDefinition = this.schema.namespaces[namespaceName].models[modelConstructor.name];
        return modelDefinition;
    };
    SyncEngine.getNamespace = function () {
        var namespace = {
            name: SYNC,
            relationships: {},
            enums: {
                OperationType: {
                    name: 'OperationType',
                    values: ['CREATE', 'UPDATE', 'DELETE'],
                },
            },
            nonModels: {},
            models: {
                MutationEvent: {
                    name: 'MutationEvent',
                    pluralName: 'MutationEvents',
                    syncable: false,
                    fields: {
                        id: {
                            name: 'id',
                            type: 'ID',
                            isRequired: true,
                            isArray: false,
                        },
                        model: {
                            name: 'model',
                            type: 'String',
                            isRequired: true,
                            isArray: false,
                        },
                        data: {
                            name: 'data',
                            type: 'String',
                            isRequired: true,
                            isArray: false,
                        },
                        modelId: {
                            name: 'modelId',
                            type: 'String',
                            isRequired: true,
                            isArray: false,
                        },
                        operation: {
                            name: 'operation',
                            type: {
                                enum: 'Operationtype',
                            },
                            isArray: false,
                            isRequired: true,
                        },
                        condition: {
                            name: 'condition',
                            type: 'String',
                            isArray: false,
                            isRequired: true,
                        },
                    },
                },
                ModelMetadata: {
                    name: 'ModelMetadata',
                    pluralName: 'ModelsMetadata',
                    syncable: false,
                    fields: {
                        id: {
                            name: 'id',
                            type: 'ID',
                            isRequired: true,
                            isArray: false,
                        },
                        namespace: {
                            name: 'namespace',
                            type: 'String',
                            isRequired: true,
                            isArray: false,
                        },
                        model: {
                            name: 'model',
                            type: 'String',
                            isRequired: true,
                            isArray: false,
                        },
                        lastSync: {
                            name: 'lastSync',
                            type: 'Int',
                            isRequired: false,
                            isArray: false,
                        },
                        lastFullSync: {
                            name: 'lastFullSync',
                            type: 'Int',
                            isRequired: false,
                            isArray: false,
                        },
                        fullSyncInterval: {
                            name: 'fullSyncInterval',
                            type: 'Int',
                            isRequired: true,
                            isArray: false,
                        },
                        lastSyncPredicate: {
                            name: 'lastSyncPredicate',
                            type: 'String',
                            isRequired: false,
                            isArray: false,
                        },
                    },
                },
            },
        };
        return namespace;
    };
    return SyncEngine;
}());
export { SyncEngine };
//# sourceMappingURL=index.js.map