import { __assign, __awaiter, __generator, __read, __rest, __values } from "tslib";
import { API } from '@aws-amplify/api';
import { ConsoleLogger as Logger, jitteredBackoff, NonRetryableError, retry, BackgroundProcessManager, } from '@aws-amplify/core';
import Observable from 'zen-observable-ts';
import { DISCARD, isModelFieldType, isTargetNameAssociation, OpType, ProcessName, } from '../../types';
import { extractTargetNamesFromSrc, USER, USER_AGENT_SUFFIX_DATASTORE, ID, } from '../../util';
import { buildGraphQLOperation, createMutationInstanceFromModelOperation, getModelAuthModes, TransformerMutationType, getTokenForCustomAuth, } from '../utils';
import { getMutationErrorType } from './errorMaps';
var MAX_ATTEMPTS = 10;
var logger = new Logger('DataStore');
var MutationProcessor = /** @class */ (function () {
    function MutationProcessor(schema, storage, userClasses, outbox, modelInstanceCreator, MutationEvent, amplifyConfig, authModeStrategy, errorHandler, conflictHandler, amplifyContext) {
        if (amplifyConfig === void 0) { amplifyConfig = {}; }
        this.schema = schema;
        this.storage = storage;
        this.userClasses = userClasses;
        this.outbox = outbox;
        this.modelInstanceCreator = modelInstanceCreator;
        this.MutationEvent = MutationEvent;
        this.amplifyConfig = amplifyConfig;
        this.authModeStrategy = authModeStrategy;
        this.errorHandler = errorHandler;
        this.conflictHandler = conflictHandler;
        this.amplifyContext = amplifyContext;
        this.typeQuery = new WeakMap();
        this.processing = false;
        this.runningProcesses = new BackgroundProcessManager();
        this.amplifyContext.API = this.amplifyContext.API || API;
        this.generateQueries();
    }
    MutationProcessor.prototype.generateQueries = function () {
        var _this = this;
        Object.values(this.schema.namespaces).forEach(function (namespace) {
            Object.values(namespace.models)
                .filter(function (_a) {
                var syncable = _a.syncable;
                return syncable;
            })
                .forEach(function (model) {
                var _a = __read(buildGraphQLOperation(namespace, model, 'CREATE'), 1), createMutation = _a[0];
                var _b = __read(buildGraphQLOperation(namespace, model, 'UPDATE'), 1), updateMutation = _b[0];
                var _c = __read(buildGraphQLOperation(namespace, model, 'DELETE'), 1), deleteMutation = _c[0];
                _this.typeQuery.set(model, [
                    createMutation,
                    updateMutation,
                    deleteMutation,
                ]);
            });
        });
    };
    MutationProcessor.prototype.isReady = function () {
        return this.observer !== undefined;
    };
    MutationProcessor.prototype.start = function () {
        var _this = this;
        this.runningProcesses = new BackgroundProcessManager();
        var observable = new Observable(function (observer) {
            _this.observer = observer;
            try {
                _this.resume();
            }
            catch (error) {
                logger.error('mutations processor start error', error);
                throw error;
            }
            return _this.runningProcesses.addCleaner(function () { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    this.pause();
                    return [2 /*return*/];
                });
            }); });
        });
        return observable;
    };
    MutationProcessor.prototype.stop = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.runningProcesses.close()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.runningProcesses.open()];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    MutationProcessor.prototype.resume = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (this.runningProcesses.isOpen &&
                            this.runningProcesses.add(function (onTerminate) { return __awaiter(_this, void 0, void 0, function () {
                                var head, namespaceName, _loop_1, this_1, _a;
                                var _this = this;
                                return __generator(this, function (_b) {
                                    switch (_b.label) {
                                        case 0:
                                            if (this.processing ||
                                                !this.isReady() ||
                                                !this.runningProcesses.isOpen) {
                                                return [2 /*return*/];
                                            }
                                            this.processing = true;
                                            namespaceName = USER;
                                            _loop_1 = function () {
                                                var model, operation, data, condition, modelConstructor, result, opName, modelDefinition, modelAuthModes, operationAuthModes_1, authModeAttempts_1, authModeRetry_1, error_1, record, hasMore;
                                                var _a;
                                                return __generator(this, function (_b) {
                                                    switch (_b.label) {
                                                        case 0:
                                                            model = head.model, operation = head.operation, data = head.data, condition = head.condition;
                                                            modelConstructor = this_1.userClasses[model];
                                                            result = undefined;
                                                            opName = undefined;
                                                            modelDefinition = undefined;
                                                            _b.label = 1;
                                                        case 1:
                                                            _b.trys.push([1, 4, , 5]);
                                                            return [4 /*yield*/, getModelAuthModes({
                                                                    authModeStrategy: this_1.authModeStrategy,
                                                                    defaultAuthMode: this_1.amplifyConfig.aws_appsync_authenticationType,
                                                                    modelName: model,
                                                                    schema: this_1.schema,
                                                                })];
                                                        case 2:
                                                            modelAuthModes = _b.sent();
                                                            operationAuthModes_1 = modelAuthModes[operation.toUpperCase()];
                                                            authModeAttempts_1 = 0;
                                                            authModeRetry_1 = function () { return __awaiter(_this, void 0, void 0, function () {
                                                                var response, error_2;
                                                                return __generator(this, function (_a) {
                                                                    switch (_a.label) {
                                                                        case 0:
                                                                            _a.trys.push([0, 2, , 4]);
                                                                            logger.debug("Attempting mutation with authMode: " + operationAuthModes_1[authModeAttempts_1]);
                                                                            return [4 /*yield*/, this.jitteredRetry(namespaceName, model, operation, data, condition, modelConstructor, this.MutationEvent, head, operationAuthModes_1[authModeAttempts_1], onTerminate)];
                                                                        case 1:
                                                                            response = _a.sent();
                                                                            logger.debug("Mutation sent successfully with authMode: " + operationAuthModes_1[authModeAttempts_1]);
                                                                            return [2 /*return*/, response];
                                                                        case 2:
                                                                            error_2 = _a.sent();
                                                                            authModeAttempts_1++;
                                                                            if (authModeAttempts_1 >= operationAuthModes_1.length) {
                                                                                logger.debug("Mutation failed with authMode: " + operationAuthModes_1[authModeAttempts_1 - 1]);
                                                                                throw error_2;
                                                                            }
                                                                            logger.debug("Mutation failed with authMode: " + operationAuthModes_1[authModeAttempts_1 - 1] + ". Retrying with authMode: " + operationAuthModes_1[authModeAttempts_1]);
                                                                            return [4 /*yield*/, authModeRetry_1()];
                                                                        case 3: return [2 /*return*/, _a.sent()];
                                                                        case 4: return [2 /*return*/];
                                                                    }
                                                                });
                                                            }); };
                                                            return [4 /*yield*/, authModeRetry_1()];
                                                        case 3:
                                                            _a = __read.apply(void 0, [_b.sent(), 3]), result = _a[0], opName = _a[1], modelDefinition = _a[2];
                                                            return [3 /*break*/, 5];
                                                        case 4:
                                                            error_1 = _b.sent();
                                                            if (error_1.message === 'Offline' ||
                                                                error_1.message === 'RetryMutation') {
                                                                return [2 /*return*/, "continue"];
                                                            }
                                                            return [3 /*break*/, 5];
                                                        case 5:
                                                            if (!(result === undefined)) return [3 /*break*/, 7];
                                                            logger.debug('done retrying');
                                                            return [4 /*yield*/, this_1.storage.runExclusive(function (storage) { return __awaiter(_this, void 0, void 0, function () {
                                                                    return __generator(this, function (_a) {
                                                                        switch (_a.label) {
                                                                            case 0: return [4 /*yield*/, this.outbox.dequeue(storage)];
                                                                            case 1:
                                                                                _a.sent();
                                                                                return [2 /*return*/];
                                                                        }
                                                                    });
                                                                }); })];
                                                        case 6:
                                                            _b.sent();
                                                            return [2 /*return*/, "continue"];
                                                        case 7:
                                                            record = result.data[opName];
                                                            hasMore = false;
                                                            return [4 /*yield*/, this_1.storage.runExclusive(function (storage) { return __awaiter(_this, void 0, void 0, function () {
                                                                    return __generator(this, function (_a) {
                                                                        switch (_a.label) {
                                                                            case 0: 
                                                                            // using runExclusive to prevent possible race condition
                                                                            // when another record gets enqueued between dequeue and peek
                                                                            return [4 /*yield*/, this.outbox.dequeue(storage, record, operation)];
                                                                            case 1:
                                                                                // using runExclusive to prevent possible race condition
                                                                                // when another record gets enqueued between dequeue and peek
                                                                                _a.sent();
                                                                                return [4 /*yield*/, this.outbox.peek(storage)];
                                                                            case 2:
                                                                                hasMore = (_a.sent()) !== undefined;
                                                                                return [2 /*return*/];
                                                                        }
                                                                    });
                                                                }); })];
                                                        case 8:
                                                            _b.sent();
                                                            this_1.observer.next({
                                                                operation: operation,
                                                                modelDefinition: modelDefinition,
                                                                model: record,
                                                                hasMore: hasMore,
                                                            });
                                                            return [2 /*return*/];
                                                    }
                                                });
                                            };
                                            this_1 = this;
                                            _b.label = 1;
                                        case 1:
                                            _a = this.processing &&
                                                this.runningProcesses.isOpen;
                                            if (!_a) return [3 /*break*/, 3];
                                            return [4 /*yield*/, this.outbox.peek(this.storage)];
                                        case 2:
                                            _a = (head = _b.sent()) !== undefined;
                                            _b.label = 3;
                                        case 3:
                                            if (!_a) return [3 /*break*/, 5];
                                            return [5 /*yield**/, _loop_1()];
                                        case 4:
                                            _b.sent();
                                            return [3 /*break*/, 1];
                                        case 5:
                                            // pauses itself
                                            this.pause();
                                            return [2 /*return*/];
                                    }
                                });
                            }); }, 'mutation resume loop'))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    MutationProcessor.prototype.jitteredRetry = function (namespaceName, model, operation, data, condition, modelConstructor, MutationEvent, mutationEvent, authMode, onTerminate) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, retry(function (model, operation, data, condition, modelConstructor, MutationEvent, mutationEvent) { return __awaiter(_this, void 0, void 0, function () {
                            var _a, query, variables, graphQLCondition, opName, modelDefinition, authToken, tryWith, attempt, opType, result, err_1, _b, error, _c, _d, code, retryWith, err_2, _e, _f, opName_1, query_1, authToken_1, serverData, namespace, updatedMutation;
                            var _g;
                            return __generator(this, function (_h) {
                                switch (_h.label) {
                                    case 0:
                                        _a = __read(this.createQueryVariables(namespaceName, model, operation, data, condition), 5), query = _a[0], variables = _a[1], graphQLCondition = _a[2], opName = _a[3], modelDefinition = _a[4];
                                        return [4 /*yield*/, getTokenForCustomAuth(authMode, this.amplifyConfig)];
                                    case 1:
                                        authToken = _h.sent();
                                        tryWith = {
                                            query: query,
                                            variables: variables,
                                            authMode: authMode,
                                            authToken: authToken,
                                            userAgentSuffix: USER_AGENT_SUFFIX_DATASTORE,
                                        };
                                        attempt = 0;
                                        opType = this.opTypeFromTransformerOperation(operation);
                                        _h.label = 2;
                                    case 2:
                                        _h.trys.push([2, 4, , 17]);
                                        return [4 /*yield*/, this.amplifyContext.API.graphql(tryWith)];
                                    case 3:
                                        result = (_h.sent());
                                        // Use `as any` because TypeScript doesn't seem to like passing tuples
                                        // through generic params.
                                        return [2 /*return*/, [result, opName, modelDefinition]];
                                    case 4:
                                        err_1 = _h.sent();
                                        if (!(err_1.errors && err_1.errors.length > 0)) return [3 /*break*/, 15];
                                        _b = __read(err_1.errors, 1), error = _b[0];
                                        _c = error.originalError, _d = (_c === void 0 ? {} : _c).code, code = _d === void 0 ? null : _d;
                                        if (error.errorType === 'Unauthorized') {
                                            throw new NonRetryableError('Unauthorized');
                                        }
                                        if (error.message === 'Network Error' ||
                                            code === 'ECONNABORTED' // refers to axios timeout error caused by device's bad network condition
                                        ) {
                                            if (!this.processing) {
                                                throw new NonRetryableError('Offline');
                                            }
                                            // TODO: Check errors on different env (react-native or other browsers)
                                            throw new Error('Network Error');
                                        }
                                        if (!(error.errorType === 'ConflictUnhandled')) return [3 /*break*/, 13];
                                        // TODO: add on ConflictConditionalCheck error query last from server
                                        attempt++;
                                        retryWith = void 0;
                                        if (!(attempt > MAX_ATTEMPTS)) return [3 /*break*/, 5];
                                        retryWith = DISCARD;
                                        return [3 /*break*/, 8];
                                    case 5:
                                        _h.trys.push([5, 7, , 8]);
                                        return [4 /*yield*/, this.conflictHandler({
                                                modelConstructor: modelConstructor,
                                                localModel: this.modelInstanceCreator(modelConstructor, variables.input),
                                                remoteModel: this.modelInstanceCreator(modelConstructor, error.data),
                                                operation: opType,
                                                attempts: attempt,
                                            })];
                                    case 6:
                                        retryWith = _h.sent();
                                        return [3 /*break*/, 8];
                                    case 7:
                                        err_2 = _h.sent();
                                        logger.warn('conflict trycatch', err_2);
                                        return [3 /*break*/, 17];
                                    case 8:
                                        if (!(retryWith === DISCARD)) return [3 /*break*/, 11];
                                        _e = __read(buildGraphQLOperation(this.schema.namespaces[namespaceName], modelDefinition, 'GET'), 1), _f = __read(_e[0], 3), opName_1 = _f[1], query_1 = _f[2];
                                        return [4 /*yield*/, getTokenForCustomAuth(authMode, this.amplifyConfig)];
                                    case 9:
                                        authToken_1 = _h.sent();
                                        return [4 /*yield*/, this.amplifyContext.API.graphql({
                                                query: query_1,
                                                variables: { id: variables.input.id },
                                                authMode: authMode,
                                                authToken: authToken_1,
                                                userAgentSuffix: USER_AGENT_SUFFIX_DATASTORE,
                                            })];
                                    case 10:
                                        serverData = _h.sent();
                                        // onTerminate cancel graphql()
                                        return [2 /*return*/, [serverData, opName_1, modelDefinition]];
                                    case 11:
                                        namespace = this.schema.namespaces[namespaceName];
                                        updatedMutation = createMutationInstanceFromModelOperation(namespace.relationships, modelDefinition, opType, modelConstructor, retryWith, graphQLCondition, MutationEvent, this.modelInstanceCreator, mutationEvent.id);
                                        return [4 /*yield*/, this.storage.save(updatedMutation)];
                                    case 12:
                                        _h.sent();
                                        throw new NonRetryableError('RetryMutation');
                                    case 13:
                                        try {
                                            this.errorHandler({
                                                recoverySuggestion: 'Ensure app code is up to date, auth directives exist and are correct on each model, and that server-side data has not been invalidated by a schema change. If the problem persists, search for or create an issue: https://github.com/aws-amplify/amplify-js/issues',
                                                localModel: variables.input,
                                                message: error.message,
                                                operation: operation,
                                                errorType: getMutationErrorType(error),
                                                errorInfo: error.errorInfo,
                                                process: ProcessName.mutate,
                                                cause: error,
                                                remoteModel: error.data
                                                    ? this.modelInstanceCreator(modelConstructor, error.data)
                                                    : null,
                                            });
                                        }
                                        catch (err) {
                                            logger.warn('Mutation error handler failed with:', err);
                                        }
                                        finally {
                                            // Return empty tuple, dequeues the mutation
                                            return [2 /*return*/, error.data
                                                    ? [
                                                        { data: (_g = {}, _g[opName] = error.data, _g) },
                                                        opName,
                                                        modelDefinition,
                                                    ]
                                                    : []];
                                        }
                                        _h.label = 14;
                                    case 14: return [3 /*break*/, 16];
                                    case 15: 
                                    // Catch-all for client-side errors that don't come back in the `GraphQLError` format.
                                    // These errors should not be retried.
                                    throw new NonRetryableError(err_1);
                                    case 16: return [3 /*break*/, 17];
                                    case 17:
                                        if (tryWith) return [3 /*break*/, 2];
                                        _h.label = 18;
                                    case 18: return [2 /*return*/];
                                }
                            });
                        }); }, [
                            model,
                            operation,
                            data,
                            condition,
                            modelConstructor,
                            MutationEvent,
                            mutationEvent,
                        ], safeJitteredBackoff, onTerminate)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    MutationProcessor.prototype.createQueryVariables = function (namespaceName, model, operation, data, condition) {
        var e_1, _a, e_2, _b, e_3, _c;
        var _d, _e;
        var modelDefinition = this.schema.namespaces[namespaceName].models[model];
        var primaryKey = this.schema.namespaces[namespaceName].keys[model].primaryKey;
        var auth = (_d = modelDefinition.attributes) === null || _d === void 0 ? void 0 : _d.find(function (a) { return a.type === 'auth'; });
        var ownerFields = ((_e = auth === null || auth === void 0 ? void 0 : auth.properties) === null || _e === void 0 ? void 0 : _e.rules.map(function (rule) { return rule.ownerField; }).filter(function (f) { return f; })) || ['owner'];
        var queriesTuples = this.typeQuery.get(modelDefinition);
        var _f = __read(queriesTuples.find(function (_a) {
            var _b = __read(_a, 1), transformerMutationType = _b[0];
            return transformerMutationType === operation;
        }), 3), opName = _f[1], query = _f[2];
        var _g = JSON.parse(data), _version = _g._version, parsedData = __rest(_g, ["_version"]);
        // include all the fields that comprise a custom PK if one is specified
        var deleteInput = {};
        if (primaryKey === null || primaryKey === void 0 ? void 0 : primaryKey.length) {
            try {
                for (var primaryKey_1 = __values(primaryKey), primaryKey_1_1 = primaryKey_1.next(); !primaryKey_1_1.done; primaryKey_1_1 = primaryKey_1.next()) {
                    var pkField = primaryKey_1_1.value;
                    deleteInput[pkField] = parsedData[pkField];
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (primaryKey_1_1 && !primaryKey_1_1.done && (_a = primaryKey_1.return)) _a.call(primaryKey_1);
                }
                finally { if (e_1) throw e_1.error; }
            }
        }
        else {
            deleteInput[ID] = parsedData.id;
        }
        var mutationInput;
        if (operation === TransformerMutationType.DELETE) {
            // For DELETE mutations, only the key(s) are included in the input
            mutationInput = deleteInput;
        }
        else {
            // Otherwise, we construct the mutation input with the following logic
            mutationInput = {};
            var modelFields = Object.values(modelDefinition.fields);
            try {
                for (var modelFields_1 = __values(modelFields), modelFields_1_1 = modelFields_1.next(); !modelFields_1_1.done; modelFields_1_1 = modelFields_1.next()) {
                    var _h = modelFields_1_1.value, name_1 = _h.name, type = _h.type, association = _h.association, isReadOnly = _h.isReadOnly;
                    // omit readonly fields. cloud storage doesn't need them and won't take them!
                    if (isReadOnly) {
                        continue;
                    }
                    // omit owner fields if it's `null`. cloud storage doesn't allow it.
                    if (ownerFields.includes(name_1) && parsedData[name_1] === null) {
                        continue;
                    }
                    // model fields should be stripped out from the input
                    if (isModelFieldType(type)) {
                        // except for belongs to relations - we need to replace them with the correct foreign key(s)
                        if (isTargetNameAssociation(association) &&
                            association.connectionType === 'BELONGS_TO') {
                            var targetNames = extractTargetNamesFromSrc(association);
                            if (targetNames) {
                                try {
                                    // instead of including the connected model itself, we add its key(s) to the mutation input
                                    for (var targetNames_1 = (e_3 = void 0, __values(targetNames)), targetNames_1_1 = targetNames_1.next(); !targetNames_1_1.done; targetNames_1_1 = targetNames_1.next()) {
                                        var targetName = targetNames_1_1.value;
                                        mutationInput[targetName] = parsedData[targetName];
                                    }
                                }
                                catch (e_3_1) { e_3 = { error: e_3_1 }; }
                                finally {
                                    try {
                                        if (targetNames_1_1 && !targetNames_1_1.done && (_c = targetNames_1.return)) _c.call(targetNames_1);
                                    }
                                    finally { if (e_3) throw e_3.error; }
                                }
                            }
                        }
                        continue;
                    }
                    // scalar fields / non-model types
                    if (operation === TransformerMutationType.UPDATE) {
                        if (!parsedData.hasOwnProperty(name_1)) {
                            // for update mutations - strip out a field if it's unchanged
                            continue;
                        }
                    }
                    // all other fields are added to the input object
                    mutationInput[name_1] = parsedData[name_1];
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (modelFields_1_1 && !modelFields_1_1.done && (_b = modelFields_1.return)) _b.call(modelFields_1);
                }
                finally { if (e_2) throw e_2.error; }
            }
        }
        // Build mutation variables input object
        var input = __assign(__assign({}, mutationInput), { _version: _version });
        var graphQLCondition = JSON.parse(condition);
        var variables = __assign({ input: input }, (operation === TransformerMutationType.CREATE
            ? {}
            : {
                condition: Object.keys(graphQLCondition).length > 0
                    ? graphQLCondition
                    : null,
            }));
        return [query, variables, graphQLCondition, opName, modelDefinition];
    };
    MutationProcessor.prototype.opTypeFromTransformerOperation = function (operation) {
        switch (operation) {
            case TransformerMutationType.CREATE:
                return OpType.INSERT;
            case TransformerMutationType.DELETE:
                return OpType.DELETE;
            case TransformerMutationType.UPDATE:
                return OpType.UPDATE;
            case TransformerMutationType.GET: // Intentionally blank
                break;
            default:
                throw new Error("Invalid operation " + operation);
        }
        // because it makes TS happy ...
        return undefined;
    };
    MutationProcessor.prototype.pause = function () {
        this.processing = false;
    };
    return MutationProcessor;
}());
var MAX_RETRY_DELAY_MS = 5 * 60 * 1000;
var originalJitteredBackoff = jitteredBackoff(MAX_RETRY_DELAY_MS);
/**
 * @private
 * Internal use of Amplify only.
 *
 * Wraps the jittered backoff calculation to retry Network Errors indefinitely.
 * Backs off according to original jittered retry logic until the original retry
 * logic hits its max. After this occurs, if the error is a Network Error, we
 * ignore the attempt count and return MAX_RETRY_DELAY_MS to retry forever (until
 * the request succeeds).
 *
 * @param attempt ignored
 * @param _args ignored
 * @param error tested to see if `.message` is 'Network Error'
 * @returns number | false :
 */
export var safeJitteredBackoff = function (attempt, _args, error) {
    var attemptResult = originalJitteredBackoff(attempt);
    // If this is the last attempt and it is a network error, we retry indefinitively every 5 minutes
    if (attemptResult === false && (error === null || error === void 0 ? void 0 : error.message) === 'Network Error') {
        return MAX_RETRY_DELAY_MS;
    }
    return attemptResult;
};
export { MutationProcessor };
//# sourceMappingURL=mutation.js.map