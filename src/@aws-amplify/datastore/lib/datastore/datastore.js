"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var tslib_1 = require("tslib");
var api_1 = require("@aws-amplify/api");
var auth_1 = require("@aws-amplify/auth");
var cache_1 = require("@aws-amplify/cache");
var core_1 = require("@aws-amplify/core");
var immer_1 = require("immer");
var uuid_1 = require("uuid");
var zen_observable_ts_1 = tslib_1.__importDefault(require("zen-observable-ts"));
var authModeStrategies_1 = require("../authModeStrategies");
var predicates_1 = require("../predicates");
var storage_1 = require("../storage/storage");
var relationship_1 = require("../storage/relationship");
var sync_1 = require("../sync");
var types_1 = require("../types");
var util_1 = require("../util");
var next_1 = require("../predicates/next");
var utils_1 = require("../sync/utils");
immer_1.setAutoFreeze(true);
immer_1.enablePatches();
var logger = new core_1.ConsoleLogger('DataStore');
var ulid = util_1.monotonicUlidFactory(Date.now());
var isNode = core_1.browserOrNode().isNode;
var SETTING_SCHEMA_VERSION = 'schemaVersion';
var schema;
var modelNamespaceMap = new WeakMap();
// stores data for crafting the correct update mutation input for a model
// Patch[] - array of changed fields and metadata
// PersistentModel - the source model, used for diffing object-type fields
var modelPatchesMap = new WeakMap();
var getModelDefinition = function (modelConstructor) {
    var namespace = modelNamespaceMap.get(modelConstructor);
    var definition = namespace
        ? schema.namespaces[namespace].models[modelConstructor.name]
        : undefined;
    return definition;
};
var getModelPKFieldName = function (modelConstructor) {
    var _a, _b, _c;
    var namespace = modelNamespaceMap.get(modelConstructor);
    return ((namespace && ((_c = (_b = (_a = schema.namespaces) === null || _a === void 0 ? void 0 : _a[namespace]) === null || _b === void 0 ? void 0 : _b.keys) === null || _c === void 0 ? void 0 : _c[modelConstructor.name].primaryKey)) || ['id']);
};
/**
 * Determine what the managed timestamp field names are for the given model definition
 * and return the mapping.
 *
 * All timestamp fields are included in the mapping, regardless of whether the final field
 * names are the defaults or customized in the `@model` directive.
 *
 * @see https://docs.amplify.aws/cli/graphql/data-modeling/#customize-creation-and-update-timestamps
 *
 * @param definition modelDefinition to inspect.
 * @returns An object mapping `createdAt` and `updatedAt` to their field names.
 */
var getTimestampFields = function (definition) {
    var _a, _b;
    var modelAttributes = (_a = definition.attributes) === null || _a === void 0 ? void 0 : _a.find(function (attr) { return attr.type === 'model'; });
    var timestampFieldsMap = (_b = modelAttributes === null || modelAttributes === void 0 ? void 0 : modelAttributes.properties) === null || _b === void 0 ? void 0 : _b.timestamps;
    var defaultFields = {
        createdAt: 'createdAt',
        updatedAt: 'updatedAt',
    };
    var customFields = timestampFieldsMap || {};
    return tslib_1.__assign(tslib_1.__assign({}, defaultFields), customFields);
};
var isValidModelConstructor = function (obj) {
    if (util_1.isModelConstructor(obj) && modelNamespaceMap.has(obj)) {
        return true;
    }
    else {
        return false;
    }
};
var namespaceResolver = function (modelConstructor) {
    var resolver = modelNamespaceMap.get(modelConstructor);
    if (!resolver) {
        throw new Error("Namespace Resolver for '" + modelConstructor.name + "' not found! This is probably a bug in '@amplify-js/datastore'.");
    }
    return resolver;
};
var buildSeedPredicate = function (modelConstructor) {
    if (!modelConstructor)
        throw new Error('Missing modelConstructor');
    var modelSchema = getModelDefinition(modelConstructor);
    if (!modelSchema)
        throw new Error('Missing modelSchema');
    var pks = getModelPKFieldName(modelConstructor);
    if (!pks)
        throw new Error('Could not determine PK');
    return next_1.recursivePredicateFor({
        builder: modelConstructor,
        schema: modelSchema,
        pkField: pks,
    });
};
var userClasses;
var dataStoreClasses;
var storageClasses;
/**
 * Maps a model to its related models for memoization/immutability.
 */
var modelInstanceAssociationsMap = new WeakMap();
/**
 * Describes whether and to what a model is attached for lazy loading purposes.
 */
var ModelAttachment;
(function (ModelAttachment) {
    /**
     * Model doesn't lazy load from any data source.
     *
     * Related entity properties provided at instantiation are returned
     * via the respective lazy interfaces when their properties are invoked.
     */
    ModelAttachment["Detached"] = "Detached";
    /**
     * Model lazy loads from the global DataStore.
     */
    ModelAttachment["DataStore"] = "DataStore";
    /**
     * Demonstrative. Not yet implemented.
     */
    ModelAttachment["API"] = "API";
})(ModelAttachment || (ModelAttachment = {}));
/**
 * Tells us which data source a model is attached to (lazy loads from).
 *
 * If `Deatched`, the model's lazy properties will only ever return properties
 * from memory provided at construction time.
 */
var attachedModelInstances = new WeakMap();
/**
 * Registers a model instance against a data source (DataStore, API, or
 * Detached/None).
 *
 * The API option is demonstrative. Lazy loading against API is not yet
 * implemented.
 *
 * @param result A model instance or array of instances
 * @param attachment A ModelAttachment data source
 * @returns passes the `result` back through after attachment
 */
function attached(result, attachment) {
    if (Array.isArray(result)) {
        result.map(function (record) { return attached(record, attachment); });
    }
    else {
        result && attachedModelInstances.set(result, attachment);
    }
    return result;
}
exports.attached = attached;
/**
 * Determines what source a model instance should lazy load from.
 *
 * If the instace was never explicitly registered, it is detached by default.
 *
 * @param instance A model instance
 */
exports.getAttachment = function (instance) {
    return attachedModelInstances.has(instance)
        ? attachedModelInstances.get(instance)
        : ModelAttachment.Detached;
};
var initSchema = function (userSchema) {
    var _a;
    if (schema !== undefined) {
        console.warn('The schema has already been initialized');
        return userClasses;
    }
    logger.log('validating schema', { schema: userSchema });
    checkSchemaCodegenVersion(userSchema.codegenVersion);
    var internalUserNamespace = tslib_1.__assign({ name: util_1.USER }, userSchema);
    logger.log('DataStore', 'Init models');
    userClasses = createTypeClasses(internalUserNamespace);
    logger.log('DataStore', 'Models initialized');
    var dataStoreNamespace = getNamespace();
    var storageNamespace = storage_1.ExclusiveStorage.getNamespace();
    var syncNamespace = sync_1.SyncEngine.getNamespace();
    dataStoreClasses = createTypeClasses(dataStoreNamespace);
    storageClasses = createTypeClasses(storageNamespace);
    exports.syncClasses = createTypeClasses(syncNamespace);
    schema = {
        namespaces: (_a = {},
            _a[dataStoreNamespace.name] = dataStoreNamespace,
            _a[internalUserNamespace.name] = internalUserNamespace,
            _a[storageNamespace.name] = storageNamespace,
            _a[syncNamespace.name] = syncNamespace,
            _a),
        version: userSchema.version,
        codegenVersion: userSchema.codegenVersion,
    };
    Object.keys(schema.namespaces).forEach(function (namespace) {
        var e_1, _a;
        var _b = tslib_1.__read(util_1.establishRelationAndKeys(schema.namespaces[namespace]), 2), relations = _b[0], keys = _b[1];
        schema.namespaces[namespace].relationships = relations;
        schema.namespaces[namespace].keys = keys;
        var modelAssociations = new Map();
        Object.values(schema.namespaces[namespace].models).forEach(function (model) {
            var e_2, _a, e_3, _b;
            var connectedModels = [];
            Object.values(model.fields)
                .filter(function (field) {
                return field.association &&
                    field.association.connectionType === 'BELONGS_TO' &&
                    field.type.model !== model.name;
            })
                .forEach(function (field) {
                return connectedModels.push(field.type.model);
            });
            modelAssociations.set(model.name, connectedModels);
            Object.values(model.fields).forEach(function (field) {
                if (typeof field.type === 'object' &&
                    !Object.getOwnPropertyDescriptor(field.type, 'modelConstructor')) {
                    Object.defineProperty(field.type, 'modelConstructor', {
                        get: function () {
                            return {
                                builder: userClasses[field.type.model],
                                schema: schema.namespaces[namespace].models[field.type.model],
                                pkField: getModelPKFieldName(userClasses[field.type.model]),
                            };
                        },
                    });
                }
            });
            // compatibility with legacy/pre-PK codegen for lazy loading to inject
            // index fields into the model definition.
            // definition.cloudFields = { ...definition.fields };
            var indexes = schema.namespaces[namespace].relationships[model.name].indexes;
            var indexFields = new Set();
            try {
                for (var indexes_1 = tslib_1.__values(indexes), indexes_1_1 = indexes_1.next(); !indexes_1_1.done; indexes_1_1 = indexes_1.next()) {
                    var index = indexes_1_1.value;
                    try {
                        for (var _c = (e_3 = void 0, tslib_1.__values(index[1])), _d = _c.next(); !_d.done; _d = _c.next()) {
                            var indexField = _d.value;
                            indexFields.add(indexField);
                        }
                    }
                    catch (e_3_1) { e_3 = { error: e_3_1 }; }
                    finally {
                        try {
                            if (_d && !_d.done && (_b = _c.return)) _b.call(_c);
                        }
                        finally { if (e_3) throw e_3.error; }
                    }
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (indexes_1_1 && !indexes_1_1.done && (_a = indexes_1.return)) _a.call(indexes_1);
                }
                finally { if (e_2) throw e_2.error; }
            }
            model.allFields = tslib_1.__assign(tslib_1.__assign({}, Object.fromEntries(tslib_1.__spread(indexFields.values()).map(function (name) { return [
                name,
                {
                    name: name,
                    type: 'ID',
                    isArray: false,
                },
            ]; }))), model.fields);
        });
        var result = new Map();
        var count = 1000;
        while (true && count > 0) {
            if (modelAssociations.size === 0) {
                break;
            }
            count--;
            if (count === 0) {
                throw new Error('Models are not topologically sortable. Please verify your schema.');
            }
            try {
                for (var _c = (e_1 = void 0, tslib_1.__values(Array.from(modelAssociations.keys()))), _d = _c.next(); !_d.done; _d = _c.next()) {
                    var modelName = _d.value;
                    var parents = modelAssociations.get(modelName);
                    if (parents === null || parents === void 0 ? void 0 : parents.every(function (x) { return result.has(x); })) {
                        result.set(modelName, parents);
                    }
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_d && !_d.done && (_a = _c.return)) _a.call(_c);
                }
                finally { if (e_1) throw e_1.error; }
            }
            Array.from(result.keys()).forEach(function (x) { return modelAssociations.delete(x); });
        }
        schema.namespaces[namespace].modelTopologicalOrdering = result;
    });
    return userClasses;
};
exports.initSchema = initSchema;
/**
 * Throws an exception if the schema has *not* been initialized
 * by `initSchema()`.
 *
 * **To be called before trying to access schema.**
 *
 * Currently this only needs to be called in `start()` and `clear()` because
 * all other functions will call start first.
 */
var checkSchemaInitialized = function () {
    if (schema === undefined) {
        var message = 'Schema is not initialized. DataStore will not function as expected. This could happen if you have multiple versions of DataStore installed. Please see https://docs.amplify.aws/lib/troubleshooting/upgrading/q/platform/js/#check-for-duplicate-versions';
        logger.error(message);
        throw new Error(message);
    }
};
/**
 * Throws an exception if the schema is using a codegen version that is not supported.
 *
 * Set the supported version by setting majorVersion and minorVersion
 * This functions similar to ^ version range.
 * The tested codegenVersion major version must exactly match the set majorVersion
 * The tested codegenVersion minor version must be gt or equal to the set minorVersion
 * Example: For a min supported version of 5.4.0 set majorVersion = 5 and minorVersion = 4
 *
 * This regex will not work when setting a supported range with minor version
 * of 2 or more digits.
 * i.e. minorVersion = 10 will not work
 * The regex will work for testing a codegenVersion with multi digit minor
 * versions as long as the minimum minorVersion is single digit.
 * i.e. codegenVersion = 5.30.1, majorVersion = 5, minorVersion = 4 PASSES
 *
 * @param codegenVersion schema codegenVersion
 */
var checkSchemaCodegenVersion = function (codegenVersion) {
    var majorVersion = 3;
    var minorVersion = 2;
    var isValid = false;
    try {
        var versionParts = codegenVersion.split('.');
        var _a = tslib_1.__read(versionParts, 4), major = _a[0], minor = _a[1], patch = _a[2], patchrevision = _a[3];
        isValid = Number(major) === majorVersion && Number(minor) >= minorVersion;
    }
    catch (err) {
        console.log("Error parsing codegen version: " + codegenVersion + "\n" + err);
    }
    if (!isValid) {
        var message = "Models were generated with an unsupported version of codegen. Codegen artifacts are from " + (codegenVersion || 'an unknown version') + ", whereas ^" + majorVersion + "." + minorVersion + ".0 is required. " +
            "Update to the latest CLI and run 'amplify codegen models'.";
        logger.error(message);
        throw new Error(message);
    }
};
var createTypeClasses = function (namespace) {
    var classes = {};
    Object.entries(namespace.models).forEach(function (_a) {
        var _b = tslib_1.__read(_a, 2), modelName = _b[0], modelDefinition = _b[1];
        var clazz = createModelClass(modelDefinition);
        classes[modelName] = clazz;
        modelNamespaceMap.set(clazz, namespace.name);
    });
    Object.entries(namespace.nonModels || {}).forEach(function (_a) {
        var _b = tslib_1.__read(_a, 2), typeName = _b[0], typeDefinition = _b[1];
        var clazz = createNonModelClass(typeDefinition);
        classes[typeName] = clazz;
    });
    return classes;
};
/**
 * Collection of instantiated models to allow storage of metadata apart from
 * the model visible to the consuming app -- in case the app doesn't have
 * metadata fields (_version, _deleted, etc.) exposed on the model itself.
 */
var instancesMetadata = new WeakSet();
function modelInstanceCreator(modelConstructor, init) {
    instancesMetadata.add(init);
    return new modelConstructor(init);
}
var validateModelFields = function (modelDefinition) { return function (k, v) {
    var fieldDefinition = modelDefinition.fields[k];
    if (fieldDefinition !== undefined) {
        var type_1 = fieldDefinition.type, isRequired_1 = fieldDefinition.isRequired, isArrayNullable = fieldDefinition.isArrayNullable, name_1 = fieldDefinition.name, isArray = fieldDefinition.isArray;
        var timestamps = types_1.isSchemaModelWithAttributes(modelDefinition)
            ? getTimestampFields(modelDefinition)
            : {};
        var isTimestampField = !!timestamps[name_1];
        if (((!isArray && isRequired_1) || (isArray && !isArrayNullable)) &&
            !isTimestampField &&
            (v === null || v === undefined)) {
            throw new Error("Field " + name_1 + " is required");
        }
        if (types_1.isSchemaModelWithAttributes(modelDefinition) &&
            !util_1.isIdManaged(modelDefinition)) {
            var keys = util_1.extractPrimaryKeyFieldNames(modelDefinition);
            if (keys.includes(k) && v === '') {
                logger.error(util_1.errorMessages.idEmptyString, { k: k, value: v });
                throw new Error(util_1.errorMessages.idEmptyString);
            }
        }
        if (types_1.isGraphQLScalarType(type_1)) {
            var jsType_1 = types_1.GraphQLScalarType.getJSType(type_1);
            var validateScalar_1 = types_1.GraphQLScalarType.getValidationFunction(type_1);
            if (type_1 === 'AWSJSON') {
                if (typeof v === jsType_1) {
                    return;
                }
                if (typeof v === 'string') {
                    try {
                        JSON.parse(v);
                        return;
                    }
                    catch (error) {
                        throw new Error("Field " + name_1 + " is an invalid JSON object. " + v);
                    }
                }
            }
            if (isArray) {
                var errorTypeText = jsType_1;
                if (!isRequired_1) {
                    errorTypeText = jsType_1 + " | null | undefined";
                }
                if (!Array.isArray(v) && !isArrayNullable) {
                    throw new Error("Field " + name_1 + " should be of type [" + errorTypeText + "], " + typeof v + " received. " + v);
                }
                if (!util_1.isNullOrUndefined(v) &&
                    v.some(function (e) {
                        return util_1.isNullOrUndefined(e) ? isRequired_1 : typeof e !== jsType_1;
                    })) {
                    var elemTypes = v
                        .map(function (e) { return (e === null ? 'null' : typeof e); })
                        .join(',');
                    throw new Error("All elements in the " + name_1 + " array should be of type " + errorTypeText + ", [" + elemTypes + "] received. " + v);
                }
                if (validateScalar_1 && !util_1.isNullOrUndefined(v)) {
                    var validationStatus = v.map(function (e) {
                        if (!util_1.isNullOrUndefined(e)) {
                            return validateScalar_1(e);
                        }
                        else if (util_1.isNullOrUndefined(e) && !isRequired_1) {
                            return true;
                        }
                        else {
                            return false;
                        }
                    });
                    if (!validationStatus.every(function (s) { return s; })) {
                        throw new Error("All elements in the " + name_1 + " array should be of type " + type_1 + ", validation failed for one or more elements. " + v);
                    }
                }
            }
            else if (!isRequired_1 && v === undefined) {
                return;
            }
            else if (typeof v !== jsType_1 && v !== null) {
                throw new Error("Field " + name_1 + " should be of type " + jsType_1 + ", " + typeof v + " received. " + v);
            }
            else if (!util_1.isNullOrUndefined(v) &&
                validateScalar_1 &&
                !validateScalar_1(v) // TODO: why never, TS ... why ...
            ) {
                throw new Error("Field " + name_1 + " should be of type " + type_1 + ", validation failed. " + v);
            }
        }
        else if (types_1.isNonModelFieldType(type_1)) {
            // do not check non model fields if undefined or null
            if (!util_1.isNullOrUndefined(v)) {
                var subNonModelDefinition_1 = schema.namespaces.user.nonModels[type_1.nonModel];
                var modelValidator_1 = validateModelFields(subNonModelDefinition_1);
                if (isArray) {
                    var errorTypeText = type_1.nonModel;
                    if (!isRequired_1) {
                        errorTypeText = type_1.nonModel + " | null | undefined";
                    }
                    if (!Array.isArray(v)) {
                        throw new Error("Field " + name_1 + " should be of type [" + errorTypeText + "], " + typeof v + " received. " + v);
                    }
                    v.forEach(function (item) {
                        if ((util_1.isNullOrUndefined(item) && isRequired_1) ||
                            (typeof item !== 'object' && typeof item !== 'undefined')) {
                            throw new Error("All elements in the " + name_1 + " array should be of type " + type_1.nonModel + ", [" + typeof item + "] received. " + item);
                        }
                        if (!util_1.isNullOrUndefined(item)) {
                            Object.keys(subNonModelDefinition_1.fields).forEach(function (subKey) {
                                modelValidator_1(subKey, item[subKey]);
                            });
                        }
                    });
                }
                else {
                    if (typeof v !== 'object') {
                        throw new Error("Field " + name_1 + " should be of type " + type_1.nonModel + ", " + typeof v + " recieved. " + v);
                    }
                    Object.keys(subNonModelDefinition_1.fields).forEach(function (subKey) {
                        modelValidator_1(subKey, v[subKey]);
                    });
                }
            }
        }
    }
}; };
var castInstanceType = function (modelDefinition, k, v) {
    var _a = modelDefinition.fields[k] || {}, isArray = _a.isArray, type = _a.type;
    // attempt to parse stringified JSON
    if (typeof v === 'string' &&
        (isArray ||
            type === 'AWSJSON' ||
            types_1.isNonModelFieldType(type) ||
            types_1.isModelFieldType(type))) {
        try {
            return JSON.parse(v);
        }
        catch (_b) {
            // if JSON is invalid, don't throw and let modelValidator handle it
        }
    }
    // cast from numeric representation of boolean to JS boolean
    if (typeof v === 'number' && type === 'Boolean') {
        return Boolean(v);
    }
    return v;
};
/**
 * Attempts to apply type-aware, casted field values from a given `init`
 * object to the given `draft`.
 *
 * @param init The initialization object to extract field values from.
 * @param modelDefinition The definition describing the target object shape.
 * @param draft The draft to apply field values to.
 */
var initializeInstance = function (init, modelDefinition, draft) {
    var modelValidator = validateModelFields(modelDefinition);
    Object.entries(init).forEach(function (_a) {
        var _b = tslib_1.__read(_a, 2), k = _b[0], v = _b[1];
        var parsedValue = castInstanceType(modelDefinition, k, v);
        modelValidator(k, parsedValue);
        draft[k] = parsedValue;
    });
};
/**
 * Updates a draft to standardize its customer-defined fields so that they are
 * consistent with the data as it would look after having been synchronized from
 * Cloud storage.
 *
 * The exceptions to this are:
 *
 * 1. Non-schema/Internal [sync] metadata fields.
 * 2. Cloud-managed fields, which are `null` until set by cloud storage.
 *
 * This function should be expanded if/when deviations between canonical Cloud
 * storage data and locally managed data are found. For now, the known areas
 * that require normalization are:
 *
 * 1. Ensuring all non-metadata fields are *defined*. (I.e., turn `undefined` -> `null`.)
 *
 * @param modelDefinition Definition for the draft. Used to discover all fields.
 * @param draft The instance draft to apply normalizations to.
 */
var normalize = function (modelDefinition, draft) {
    var e_4, _a;
    try {
        for (var _b = tslib_1.__values(Object.keys(modelDefinition.fields)), _c = _b.next(); !_c.done; _c = _b.next()) {
            var k = _c.value;
            if (draft[k] === undefined)
                draft[k] = null;
        }
    }
    catch (e_4_1) { e_4 = { error: e_4_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
        }
        finally { if (e_4) throw e_4.error; }
    }
};
var createModelClass = function (modelDefinition) {
    var clazz = /** @class */ (function () {
        function Model(init) {
            var instance = immer_1.produce(this, function (draft) {
                initializeInstance(init, modelDefinition, draft);
                // model is initialized inside a DataStore component (e.g. by Sync Engine, Storage Engine, etc.)
                var isInternallyInitialized = instancesMetadata.has(init);
                var modelInstanceMetadata = isInternallyInitialized
                    ? init
                    : {};
                var _id = modelInstanceMetadata.id;
                if (util_1.isIdManaged(modelDefinition)) {
                    var isInternalModel = _id !== null && _id !== undefined;
                    var id = isInternalModel
                        ? _id
                        : modelDefinition.syncable
                            ? uuid_1.v4()
                            : ulid();
                    draft.id = id;
                }
                else if (util_1.isIdOptionallyManaged(modelDefinition)) {
                    // only auto-populate if the id was not provided
                    draft.id = draft.id || uuid_1.v4();
                }
                if (!isInternallyInitialized) {
                    checkReadOnlyPropertyOnCreate(draft, modelDefinition);
                }
                var _version = modelInstanceMetadata._version, _lastChangedAt = modelInstanceMetadata._lastChangedAt, _deleted = modelInstanceMetadata._deleted;
                if (modelDefinition.syncable) {
                    draft._version = _version;
                    draft._lastChangedAt = _lastChangedAt;
                    draft._deleted = _deleted;
                }
                normalize(modelDefinition, draft);
            });
            return instance;
        }
        Model.copyOf = function (source, fn) {
            var modelConstructor = Object.getPrototypeOf(source || {}).constructor;
            if (!isValidModelConstructor(modelConstructor)) {
                var msg = 'The source object is not a valid model';
                logger.error(msg, { source: source });
                throw new Error(msg);
            }
            var patches = [];
            var model = immer_1.produce(source, function (draft) {
                fn(draft);
                var keyNames = util_1.extractPrimaryKeyFieldNames(modelDefinition);
                // Keys are immutable
                keyNames.forEach(function (key) {
                    if (draft[key] !== source[key]) {
                        logger.warn("copyOf() does not update PK fields. The '" + key + "' update is being ignored.", { source: source });
                    }
                    draft[key] = source[key];
                });
                var modelValidator = validateModelFields(modelDefinition);
                Object.entries(draft).forEach(function (_a) {
                    var _b = tslib_1.__read(_a, 2), k = _b[0], v = _b[1];
                    var parsedValue = castInstanceType(modelDefinition, k, v);
                    modelValidator(k, parsedValue);
                });
                normalize(modelDefinition, draft);
            }, function (p) { return (patches = p); });
            var hasExistingPatches = modelPatchesMap.has(source);
            if (patches.length || hasExistingPatches) {
                if (hasExistingPatches) {
                    var _a = tslib_1.__read(modelPatchesMap.get(source), 2), existingPatches = _a[0], existingSource = _a[1];
                    var mergedPatches = util_1.mergePatches(existingSource, existingPatches, patches);
                    modelPatchesMap.set(model, [mergedPatches, existingSource]);
                    checkReadOnlyPropertyOnUpdate(mergedPatches, modelDefinition);
                }
                else {
                    modelPatchesMap.set(model, [patches, source]);
                    checkReadOnlyPropertyOnUpdate(patches, modelDefinition);
                }
            }
            return attached(model, ModelAttachment.DataStore);
        };
        // "private" method (that's hidden via `Setting`) for `withSSRContext` to use
        // to gain access to `modelInstanceCreator` and `clazz` for persisting IDs from server to client.
        Model.fromJSON = function (json) {
            var _this = this;
            if (Array.isArray(json)) {
                return json.map(function (init) { return _this.fromJSON(init); });
            }
            var instance = modelInstanceCreator(clazz, json);
            var modelValidator = validateModelFields(modelDefinition);
            Object.entries(instance).forEach(function (_a) {
                var _b = tslib_1.__read(_a, 2), k = _b[0], v = _b[1];
                modelValidator(k, v);
            });
            return attached(instance, ModelAttachment.DataStore);
        };
        return Model;
    }());
    clazz[immer_1.immerable] = true;
    Object.defineProperty(clazz, 'name', { value: modelDefinition.name });
    var _loop_1 = function (field) {
        if (!types_1.isFieldAssociation(modelDefinition, field)) {
            return "continue";
        }
        var _a = modelDefinition.fields[field], type = _a.type, localAssociation = _a.association, _b = _a.association, targetName = _b.targetName, targetNames = _b.targetNames;
        var relationship = new relationship_1.ModelRelationship({
            builder: clazz,
            schema: modelDefinition,
            pkField: util_1.extractPrimaryKeyFieldNames(modelDefinition),
        }, field);
        Object.defineProperty(clazz.prototype, modelDefinition.fields[field].name, {
            set: function (model) {
                if (!(typeof model === 'object' || typeof model === 'undefined'))
                    return;
                // if model is undefined or null, the connection should be removed
                if (model) {
                    // Avoid validation error when processing AppSync response with nested
                    // selection set. Nested entitites lack version field and can not be validated
                    // TODO: explore a more reliable method to solve this
                    if (model.hasOwnProperty('_version')) {
                        var modelConstructor = Object.getPrototypeOf(model || {})
                            .constructor;
                        if (!isValidModelConstructor(modelConstructor)) {
                            var msg = "Value passed to " + modelDefinition.name + "." + field + " is not a valid instance of a model";
                            logger.error(msg, { model: model });
                            throw new Error(msg);
                        }
                        if (modelConstructor.name.toLowerCase() !==
                            relationship.remoteModelConstructor.name.toLowerCase()) {
                            var msg = "Value passed to " + modelDefinition.name + "." + field + " is not an instance of " + relationship.remoteModelConstructor.name;
                            logger.error(msg, { model: model });
                            throw new Error(msg);
                        }
                    }
                }
                if (relationship.isComplete) {
                    for (var i = 0; i < relationship.localJoinFields.length; i++) {
                        this[relationship.localJoinFields[i]] = model === null || model === void 0 ? void 0 : model[relationship.remoteJoinFields[i]];
                    }
                    var instanceMemos = modelInstanceAssociationsMap.has(this)
                        ? modelInstanceAssociationsMap.get(this)
                        : modelInstanceAssociationsMap.set(this, {}).get(this);
                    instanceMemos[field] = model || undefined;
                }
            },
            get: function () {
                var _this = this;
                var instanceMemos = modelInstanceAssociationsMap.has(this)
                    ? modelInstanceAssociationsMap.get(this)
                    : modelInstanceAssociationsMap.set(this, {}).get(this);
                if (!instanceMemos.hasOwnProperty(field)) {
                    if (exports.getAttachment(this) === ModelAttachment.DataStore) {
                        var resultPromise = instance.query(relationship.remoteModelConstructor, function (base) {
                            return base.and(function (q) {
                                return relationship.remoteJoinFields.map(function (field, index) {
                                    return q[field].eq(_this[relationship.localJoinFields[index]]);
                                });
                            });
                        });
                        if (relationship.type === 'HAS_MANY') {
                            instanceMemos[field] = new AsyncCollection(resultPromise);
                        }
                        else {
                            instanceMemos[field] = resultPromise.then(function (rows) {
                                if (rows.length > 1) {
                                    // should never happen for a HAS_ONE or BELONGS_TO.
                                    var err = new Error("\n\t\t\t\t\t\t\t\t\tData integrity error.\n\t\t\t\t\t\t\t\t\tToo many records found for a HAS_ONE/BELONGS_TO field '" + modelDefinition.name + "." + field + "'\n\t\t\t\t\t\t\t\t");
                                    console.error(err);
                                    throw err;
                                }
                                else {
                                    return rows[0];
                                }
                            });
                        }
                    }
                    else if (exports.getAttachment(this) === ModelAttachment.API) {
                        throw new Error('Lazy loading from API is not yet supported!');
                    }
                    else {
                        if (relationship.type === 'HAS_MANY') {
                            return new AsyncCollection([]);
                        }
                        else {
                            return Promise.resolve(undefined);
                        }
                    }
                }
                return instanceMemos[field];
            },
        });
    };
    for (var field in modelDefinition.fields) {
        _loop_1(field);
    }
    return clazz;
};
var AsyncItem = /** @class */ (function (_super) {
    tslib_1.__extends(AsyncItem, _super);
    function AsyncItem() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    return AsyncItem;
}(Promise));
exports.AsyncItem = AsyncItem;
var AsyncCollection = /** @class */ (function () {
    function AsyncCollection(values) {
        this.values = values;
    }
    AsyncCollection.prototype[Symbol.asyncIterator] = function () {
        var _this = this;
        var values;
        var index = 0;
        return {
            next: function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                var result;
                return tslib_1.__generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (!!values) return [3 /*break*/, 2];
                            return [4 /*yield*/, this.values];
                        case 1:
                            values = _a.sent();
                            _a.label = 2;
                        case 2:
                            if (index < values.length) {
                                result = {
                                    value: values[index],
                                    done: false,
                                };
                                index++;
                                return [2 /*return*/, result];
                            }
                            return [2 /*return*/, {
                                    value: null,
                                    done: true,
                                }];
                    }
                });
            }); },
        };
    };
    AsyncCollection.prototype.toArray = function (_a) {
        var _b = (_a === void 0 ? {} : _a).max, max = _b === void 0 ? Number.MAX_SAFE_INTEGER : _b;
        var e_5, _c;
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var output, i, _d, _e, element, e_5_1;
            return tslib_1.__generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        output = [];
                        i = 0;
                        _f.label = 1;
                    case 1:
                        _f.trys.push([1, 6, 7, 12]);
                        _d = tslib_1.__asyncValues(this);
                        _f.label = 2;
                    case 2: return [4 /*yield*/, _d.next()];
                    case 3:
                        if (!(_e = _f.sent(), !_e.done)) return [3 /*break*/, 5];
                        element = _e.value;
                        if (i < max) {
                            output.push(element);
                            i++;
                        }
                        else {
                            return [3 /*break*/, 5];
                        }
                        _f.label = 4;
                    case 4: return [3 /*break*/, 2];
                    case 5: return [3 /*break*/, 12];
                    case 6:
                        e_5_1 = _f.sent();
                        e_5 = { error: e_5_1 };
                        return [3 /*break*/, 12];
                    case 7:
                        _f.trys.push([7, , 10, 11]);
                        if (!(_e && !_e.done && (_c = _d.return))) return [3 /*break*/, 9];
                        return [4 /*yield*/, _c.call(_d)];
                    case 8:
                        _f.sent();
                        _f.label = 9;
                    case 9: return [3 /*break*/, 11];
                    case 10:
                        if (e_5) throw e_5.error;
                        return [7 /*endfinally*/];
                    case 11: return [7 /*endfinally*/];
                    case 12: return [2 /*return*/, output];
                }
            });
        });
    };
    return AsyncCollection;
}());
exports.AsyncCollection = AsyncCollection;
var checkReadOnlyPropertyOnCreate = function (draft, modelDefinition) {
    var modelKeys = Object.keys(draft);
    var fields = modelDefinition.fields;
    modelKeys.forEach(function (key) {
        if (fields[key] && fields[key].isReadOnly) {
            throw new Error(key + " is read-only.");
        }
    });
};
var checkReadOnlyPropertyOnUpdate = function (patches, modelDefinition) {
    var patchArray = patches.map(function (p) { return [p.path[0], p.value]; });
    var fields = modelDefinition.fields;
    patchArray.forEach(function (_a) {
        var _b = tslib_1.__read(_a, 2), key = _b[0], val = _b[1];
        if (!val || !fields[key])
            return;
        if (fields[key].isReadOnly) {
            throw new Error(key + " is read-only.");
        }
    });
};
var createNonModelClass = function (typeDefinition) {
    var clazz = /** @class */ (function () {
        function Model(init) {
            var instance = immer_1.produce(this, function (draft) {
                initializeInstance(init, typeDefinition, draft);
            });
            return instance;
        }
        return Model;
    }());
    clazz[immer_1.immerable] = true;
    Object.defineProperty(clazz, 'name', { value: typeDefinition.name });
    util_1.registerNonModelClass(clazz);
    return clazz;
};
function isQueryOne(obj) {
    return typeof obj === 'string';
}
function defaultConflictHandler(conflictData) {
    var localModel = conflictData.localModel, modelConstructor = conflictData.modelConstructor, remoteModel = conflictData.remoteModel;
    var _version = remoteModel._version;
    return modelInstanceCreator(modelConstructor, tslib_1.__assign(tslib_1.__assign({}, localModel), { _version: _version }));
}
function defaultErrorHandler(error) {
    logger.warn(error);
}
function getModelConstructorByModelName(namespaceName, modelName) {
    var result;
    switch (namespaceName) {
        case util_1.DATASTORE:
            result = dataStoreClasses[modelName];
            break;
        case util_1.USER:
            result = userClasses[modelName];
            break;
        case util_1.SYNC:
            result = exports.syncClasses[modelName];
            break;
        case util_1.STORAGE:
            result = storageClasses[modelName];
            break;
        default:
            throw new Error("Invalid namespace: " + namespaceName);
    }
    if (isValidModelConstructor(result)) {
        return result;
    }
    else {
        var msg = "Model name is not valid for namespace. modelName: " + modelName + ", namespace: " + namespaceName;
        logger.error(msg);
        throw new Error(msg);
    }
}
/**
 * Queries the DataStore metadata tables to see if they are the expected
 * version. If not, clobbers the whole DB. If so, leaves them alone.
 * Otherwise, simply writes the schema version.
 *
 * SIDE EFFECT:
 * 1. Creates a transaction
 * 1. Updates data.
 *
 * @param storage Storage adapter containing the metadata.
 * @param version The expected schema version.
 */
function checkSchemaVersion(storage, version) {
    return tslib_1.__awaiter(this, void 0, void 0, function () {
        var Setting, modelDefinition;
        var _this = this;
        return tslib_1.__generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    Setting = dataStoreClasses.Setting;
                    modelDefinition = schema.namespaces[util_1.DATASTORE].models.Setting;
                    return [4 /*yield*/, storage.runExclusive(function (s) { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                            var _a, schemaVersionSetting, storedValue;
                            return tslib_1.__generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0: return [4 /*yield*/, s.query(Setting, predicates_1.ModelPredicateCreator.createFromExisting(modelDefinition, function (c) {
                                            return c.key('eq', SETTING_SCHEMA_VERSION);
                                        }), { page: 0, limit: 1 })];
                                    case 1:
                                        _a = tslib_1.__read.apply(void 0, [_b.sent(), 1]), schemaVersionSetting = _a[0];
                                        if (!(schemaVersionSetting !== undefined &&
                                            schemaVersionSetting.value !== undefined)) return [3 /*break*/, 4];
                                        storedValue = JSON.parse(schemaVersionSetting.value);
                                        if (!(storedValue !== version)) return [3 /*break*/, 3];
                                        return [4 /*yield*/, s.clear(false)];
                                    case 2:
                                        _b.sent();
                                        _b.label = 3;
                                    case 3: return [3 /*break*/, 6];
                                    case 4: return [4 /*yield*/, s.save(modelInstanceCreator(Setting, {
                                            key: SETTING_SCHEMA_VERSION,
                                            value: JSON.stringify(version),
                                        }))];
                                    case 5:
                                        _b.sent();
                                        _b.label = 6;
                                    case 6: return [2 /*return*/];
                                }
                            });
                        }); })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
var syncSubscription;
function getNamespace() {
    var namespace = {
        name: util_1.DATASTORE,
        relationships: {},
        enums: {},
        nonModels: {},
        models: {
            Setting: {
                name: 'Setting',
                pluralName: 'Settings',
                syncable: false,
                fields: {
                    id: {
                        name: 'id',
                        type: 'ID',
                        isRequired: true,
                        isArray: false,
                    },
                    key: {
                        name: 'key',
                        type: 'String',
                        isRequired: true,
                        isArray: false,
                    },
                    value: {
                        name: 'value',
                        type: 'String',
                        isRequired: true,
                        isArray: false,
                    },
                },
            },
        },
    };
    return namespace;
}
var DataStoreState;
(function (DataStoreState) {
    DataStoreState["NotRunning"] = "Not Running";
    DataStoreState["Starting"] = "Starting";
    DataStoreState["Running"] = "Running";
    DataStoreState["Stopping"] = "Stopping";
    DataStoreState["Clearing"] = "Clearing";
})(DataStoreState || (DataStoreState = {}));
var DataStore = /** @class */ (function () {
    function DataStore() {
        var _this = this;
        // reference to configured category instances. Used for preserving SSR context
        this.Auth = auth_1.Auth;
        this.API = api_1.API;
        this.Cache = cache_1.Cache;
        // Non-null assertions (bang operator) have been added to most of these properties
        // to make TS happy. These properties are all expected to be set immediately after
        // construction.
        // TODO: Refactor to use proper DI if possible. If not possible, change these to
        // optionals and implement conditional checks throughout. Rinse/repeat on all
        // sync engine processors, storage engine, adapters, etc..
        this.amplifyConfig = {};
        this.syncPredicates = new WeakMap();
        // object that gets passed to descendent classes. Allows us to pass these down by reference
        this.amplifyContext = {
            Auth: this.Auth,
            API: this.API,
            Cache: this.Cache,
        };
        /**
         * **IMPORTANT!**
         *
         * Accumulator for background things that can **and MUST** be called when
         * DataStore stops.
         *
         * These jobs **MUST** be *idempotent promises* that resolve ONLY
         * once the intended jobs are completely finished and/or otherwise destroyed
         * and cleaned up with ZERO outstanding:
         *
         * 1. side effects (e.g., state changes)
         * 1. callbacks
         * 1. subscriptions
         * 1. calls to storage
         * 1. *etc.*
         *
         * Methods that create pending promises, subscriptions, callbacks, or any
         * type of side effect **MUST** be registered with the manager. And, a new
         * manager must be created after each `exit()`.
         *
         * Failure to comply will put DataStore into a highly unpredictable state
         * when it needs to stop or clear -- which occurs when restarting with new
         * sync expressions, during testing, and potentially during app code
         * recovery handling, etc..
         *
         * It is up to the discretion of each disposer whether to wait for job
         * completion or to cancel operations and issue failures *as long as the
         * disposer returns in a reasonable amount of time.*
         *
         * (Reasonable = *seconds*, not minutes.)
         */
        this.runningProcesses = new core_1.BackgroundProcessManager();
        /**
         * Indicates what state DataStore is in.
         *
         * Not [yet?] used for actual state management; but for messaging
         * when errors occur, to help troubleshoot.
         */
        this.state = DataStoreState.NotRunning;
        /**
         * If not already done:
         * 1. Attaches and initializes storage.
         * 1. Loads the schema and records metadata.
         * 1. If `this.amplifyConfig.aws_appsync_graphqlEndpoint` contains a URL,
         * attaches a sync engine, starts it, and subscribes.
         */
        this.start = function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
            var _this = this;
            return tslib_1.__generator(this, function (_a) {
                return [2 /*return*/, this.runningProcesses
                        .add(function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                        var aws_appsync_graphqlEndpoint, _a, fullSyncIntervalInMilliseconds;
                        var _this = this;
                        return tslib_1.__generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    this.state = DataStoreState.Starting;
                                    if (!(this.initialized === undefined)) return [3 /*break*/, 1];
                                    logger.debug('Starting DataStore');
                                    this.initialized = new Promise(function (res, rej) {
                                        _this.initResolve = res;
                                        _this.initReject = rej;
                                    });
                                    return [3 /*break*/, 3];
                                case 1: return [4 /*yield*/, this.initialized];
                                case 2:
                                    _b.sent();
                                    return [2 /*return*/];
                                case 3:
                                    this.storage = new storage_1.ExclusiveStorage(schema, namespaceResolver, getModelConstructorByModelName, modelInstanceCreator, this.storageAdapter, this.sessionId);
                                    return [4 /*yield*/, this.storage.init()];
                                case 4:
                                    _b.sent();
                                    checkSchemaInitialized();
                                    return [4 /*yield*/, checkSchemaVersion(this.storage, schema.version)];
                                case 5:
                                    _b.sent();
                                    aws_appsync_graphqlEndpoint = this.amplifyConfig.aws_appsync_graphqlEndpoint;
                                    if (!aws_appsync_graphqlEndpoint) return [3 /*break*/, 7];
                                    logger.debug('GraphQL endpoint available', aws_appsync_graphqlEndpoint);
                                    _a = this;
                                    return [4 /*yield*/, this.processSyncExpressions()];
                                case 6:
                                    _a.syncPredicates = _b.sent();
                                    this.sync = new sync_1.SyncEngine(schema, namespaceResolver, exports.syncClasses, userClasses, this.storage, modelInstanceCreator, this.conflictHandler, this.errorHandler, this.syncPredicates, this.amplifyConfig, this.authModeStrategy, this.amplifyContext, this.connectivityMonitor);
                                    fullSyncIntervalInMilliseconds = this.fullSyncInterval * 1000 * 60;
                                    syncSubscription = this.sync
                                        .start({ fullSyncInterval: fullSyncIntervalInMilliseconds })
                                        .subscribe({
                                        next: function (_a) {
                                            var type = _a.type, data = _a.data;
                                            // In Node, we need to wait for queries to be synced to prevent returning empty arrays.
                                            // In the Browser, we can begin returning data once subscriptions are in place.
                                            var readyType = isNode
                                                ? sync_1.ControlMessage.SYNC_ENGINE_SYNC_QUERIES_READY
                                                : sync_1.ControlMessage.SYNC_ENGINE_STORAGE_SUBSCRIBED;
                                            if (type === readyType) {
                                                _this.initResolve();
                                            }
                                            core_1.Hub.dispatch('datastore', {
                                                event: type,
                                                data: data,
                                            });
                                        },
                                        error: function (err) {
                                            logger.warn('Sync error', err);
                                            _this.initReject();
                                        },
                                    });
                                    return [3 /*break*/, 8];
                                case 7:
                                    logger.warn("Data won't be synchronized. No GraphQL endpoint configured. Did you forget `Amplify.configure(awsconfig)`?", {
                                        config: this.amplifyConfig,
                                    });
                                    this.initResolve();
                                    _b.label = 8;
                                case 8: return [4 /*yield*/, this.initialized];
                                case 9:
                                    _b.sent();
                                    this.state = DataStoreState.Running;
                                    return [2 /*return*/];
                            }
                        });
                    }); }, 'datastore start')
                        .catch(this.handleAddProcError('DataStore.start()'))];
            });
        }); };
        this.query = function (modelConstructor, identifierOrCriteria, paginationProducer) { return tslib_1.__awaiter(_this, void 0, void 0, function () {
            var _this = this;
            return tslib_1.__generator(this, function (_a) {
                return [2 /*return*/, this.runningProcesses
                        .add(function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                        var result, msg, modelDefinition, pagination, keyFields, msg, predicate, predicate, seedPredicate, predicate, returnOne;
                        var _a;
                        return tslib_1.__generator(this, function (_b) {
                            switch (_b.label) {
                                case 0: return [4 /*yield*/, this.start()];
                                case 1:
                                    _b.sent();
                                    if (!this.storage) {
                                        throw new Error('No storage to query');
                                    }
                                    //#region Input validation
                                    if (!isValidModelConstructor(modelConstructor)) {
                                        msg = 'Constructor is not for a valid model';
                                        logger.error(msg, { modelConstructor: modelConstructor });
                                        throw new Error(msg);
                                    }
                                    if (typeof identifierOrCriteria === 'string') {
                                        if (paginationProducer !== undefined) {
                                            logger.warn('Pagination is ignored when querying by id');
                                        }
                                    }
                                    modelDefinition = getModelDefinition(modelConstructor);
                                    if (!modelDefinition) {
                                        throw new Error('Invalid model definition provided!');
                                    }
                                    pagination = this.processPagination(modelDefinition, paginationProducer);
                                    keyFields = util_1.extractPrimaryKeyFieldNames(modelDefinition);
                                    if (!isQueryOne(identifierOrCriteria)) return [3 /*break*/, 3];
                                    if (keyFields.length > 1) {
                                        msg = util_1.errorMessages.queryByPkWithCompositeKeyPresent;
                                        logger.error(msg, { keyFields: keyFields });
                                        throw new Error(msg);
                                    }
                                    predicate = predicates_1.ModelPredicateCreator.createForSingleField(modelDefinition, keyFields[0], identifierOrCriteria);
                                    return [4 /*yield*/, this.storage.query(modelConstructor, predicate, pagination)];
                                case 2:
                                    result = _b.sent();
                                    return [3 /*break*/, 9];
                                case 3:
                                    if (!types_1.isIdentifierObject(identifierOrCriteria, modelDefinition)) return [3 /*break*/, 5];
                                    predicate = predicates_1.ModelPredicateCreator.createForPk(modelDefinition, identifierOrCriteria);
                                    return [4 /*yield*/, this.storage.query(modelConstructor, predicate, pagination)];
                                case 4:
                                    result = _b.sent();
                                    return [3 /*break*/, 9];
                                case 5:
                                    if (!(!identifierOrCriteria ||
                                        predicates_1.isPredicatesAll(identifierOrCriteria))) return [3 /*break*/, 7];
                                    return [4 /*yield*/, ((_a = this.storage) === null || _a === void 0 ? void 0 : _a.query(modelConstructor, undefined, pagination))];
                                case 6:
                                    result = _b.sent();
                                    return [3 /*break*/, 9];
                                case 7:
                                    seedPredicate = next_1.recursivePredicateFor({
                                        builder: modelConstructor,
                                        schema: modelDefinition,
                                        pkField: getModelPKFieldName(modelConstructor),
                                    });
                                    predicate = next_1.internals(identifierOrCriteria(seedPredicate));
                                    return [4 /*yield*/, predicate.fetch(this.storage)];
                                case 8:
                                    result = (_b.sent());
                                    result = util_1.inMemoryPagination(result, pagination);
                                    _b.label = 9;
                                case 9:
                                    returnOne = isQueryOne(identifierOrCriteria) ||
                                        types_1.isIdentifierObject(identifierOrCriteria, modelDefinition);
                                    return [2 /*return*/, attached(returnOne ? result[0] : result, ModelAttachment.DataStore)];
                            }
                        });
                    }); }, 'datastore query')
                        .catch(this.handleAddProcError('DataStore.query()'))];
            });
        }); };
        this.save = function (model, condition) { return tslib_1.__awaiter(_this, void 0, void 0, function () {
            var _this = this;
            return tslib_1.__generator(this, function (_a) {
                return [2 /*return*/, this.runningProcesses
                        .add(function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                        var patchesTuple, modelConstructor, msg, modelDefinition, modelMeta, producedCondition, _a, savedModel;
                        var _this = this;
                        return tslib_1.__generator(this, function (_b) {
                            switch (_b.label) {
                                case 0: return [4 /*yield*/, this.start()];
                                case 1:
                                    _b.sent();
                                    if (!this.storage) {
                                        throw new Error('No storage to save to');
                                    }
                                    patchesTuple = modelPatchesMap.get(model);
                                    modelConstructor = model ? model.constructor : undefined;
                                    if (!isValidModelConstructor(modelConstructor)) {
                                        msg = 'Object is not an instance of a valid model';
                                        logger.error(msg, { model: model });
                                        throw new Error(msg);
                                    }
                                    modelDefinition = getModelDefinition(modelConstructor);
                                    if (!modelDefinition) {
                                        throw new Error('Model Definition could not be found for model');
                                    }
                                    modelMeta = {
                                        builder: modelConstructor,
                                        schema: modelDefinition,
                                        pkField: util_1.extractPrimaryKeyFieldNames(modelDefinition),
                                    };
                                    return [4 /*yield*/, this.storage.runExclusive(function (s) { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                                            var nonHasManyRelationships, nonHasManyRelationships_1, nonHasManyRelationships_1_1, relationship, queryObject, related, e_6_1;
                                            var e_6, _a;
                                            var _b;
                                            return tslib_1.__generator(this, function (_c) {
                                                switch (_c.label) {
                                                    case 0:
                                                        nonHasManyRelationships = relationship_1.ModelRelationship.allFrom(modelMeta).filter(function (r) { return r.type === 'BELONGS_TO'; });
                                                        _c.label = 1;
                                                    case 1:
                                                        _c.trys.push([1, 6, 7, 8]);
                                                        nonHasManyRelationships_1 = tslib_1.__values(nonHasManyRelationships), nonHasManyRelationships_1_1 = nonHasManyRelationships_1.next();
                                                        _c.label = 2;
                                                    case 2:
                                                        if (!!nonHasManyRelationships_1_1.done) return [3 /*break*/, 5];
                                                        relationship = nonHasManyRelationships_1_1.value;
                                                        queryObject = relationship.createRemoteQueryObject(model);
                                                        if (!(queryObject !== null)) return [3 /*break*/, 4];
                                                        return [4 /*yield*/, s.query(relationship.remoteModelConstructor, predicates_1.ModelPredicateCreator.createFromFlatEqualities(relationship.remoteDefinition, queryObject))];
                                                    case 3:
                                                        related = _c.sent();
                                                        if (related.length === 0) {
                                                            throw new Error([
                                                                "Data integrity error. You tried to save a " + modelDefinition.name + " (" + JSON.stringify(model) + ")",
                                                                "but the instance assigned to the \"" + relationship.field + "\" property",
                                                                "does not exist in the local database. If you're trying to create the related",
                                                                "\"" + ((_b = relationship.remoteDefinition) === null || _b === void 0 ? void 0 : _b.name) + "\", you must save it independently first.",
                                                            ].join(' '));
                                                        }
                                                        _c.label = 4;
                                                    case 4:
                                                        nonHasManyRelationships_1_1 = nonHasManyRelationships_1.next();
                                                        return [3 /*break*/, 2];
                                                    case 5: return [3 /*break*/, 8];
                                                    case 6:
                                                        e_6_1 = _c.sent();
                                                        e_6 = { error: e_6_1 };
                                                        return [3 /*break*/, 8];
                                                    case 7:
                                                        try {
                                                            if (nonHasManyRelationships_1_1 && !nonHasManyRelationships_1_1.done && (_a = nonHasManyRelationships_1.return)) _a.call(nonHasManyRelationships_1);
                                                        }
                                                        finally { if (e_6) throw e_6.error; }
                                                        return [7 /*endfinally*/];
                                                    case 8: return [2 /*return*/];
                                                }
                                            });
                                        }); })];
                                case 2:
                                    _b.sent();
                                    producedCondition = condition
                                        ? next_1.internals(condition(next_1.predicateFor(modelMeta))).toStoragePredicate()
                                        : undefined;
                                    return [4 /*yield*/, this.storage.runExclusive(function (s) { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                                            var saved;
                                            return tslib_1.__generator(this, function (_a) {
                                                switch (_a.label) {
                                                    case 0: return [4 /*yield*/, s.save(model, producedCondition, undefined, patchesTuple)];
                                                    case 1:
                                                        saved = _a.sent();
                                                        return [2 /*return*/, s.query(modelConstructor, predicates_1.ModelPredicateCreator.createForPk(modelDefinition, model))];
                                                }
                                            });
                                        }); })];
                                case 3:
                                    _a = tslib_1.__read.apply(void 0, [_b.sent(), 1]), savedModel = _a[0];
                                    return [2 /*return*/, attached(savedModel, ModelAttachment.DataStore)];
                            }
                        });
                    }); }, 'datastore save')
                        .catch(this.handleAddProcError('DataStore.save()'))];
            });
        }); };
        this.setConflictHandler = function (config) {
            var configDataStore = config.DataStore;
            var conflictHandlerIsDefault = function () {
                return _this.conflictHandler === defaultConflictHandler;
            };
            if (configDataStore && configDataStore.conflictHandler) {
                return configDataStore.conflictHandler;
            }
            if (conflictHandlerIsDefault() && config.conflictHandler) {
                return config.conflictHandler;
            }
            return _this.conflictHandler || defaultConflictHandler;
        };
        this.setErrorHandler = function (config) {
            var configDataStore = config.DataStore;
            var errorHandlerIsDefault = function () {
                return _this.errorHandler === defaultErrorHandler;
            };
            if (configDataStore && configDataStore.errorHandler) {
                return configDataStore.errorHandler;
            }
            if (errorHandlerIsDefault() && config.errorHandler) {
                return config.errorHandler;
            }
            return _this.errorHandler || defaultErrorHandler;
        };
        this.delete = function (modelOrConstructor, identifierOrCriteria) { return tslib_1.__awaiter(_this, void 0, void 0, function () {
            var _this = this;
            return tslib_1.__generator(this, function (_a) {
                return [2 /*return*/, this.runningProcesses
                        .add(function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                        var condition, msg, modelConstructor, msg, modelDefinition, keyFields, msg, msg, _a, deleted, model, modelConstructor, msg, modelDefinition, pkPredicate, msg, _b, _c, deleted;
                        return tslib_1.__generator(this, function (_d) {
                            switch (_d.label) {
                                case 0: return [4 /*yield*/, this.start()];
                                case 1:
                                    _d.sent();
                                    if (!this.storage) {
                                        throw new Error('No storage to delete from');
                                    }
                                    if (!modelOrConstructor) {
                                        msg = 'Model or Model Constructor required';
                                        logger.error(msg, { modelOrConstructor: modelOrConstructor });
                                        throw new Error(msg);
                                    }
                                    if (!isValidModelConstructor(modelOrConstructor)) return [3 /*break*/, 3];
                                    modelConstructor = modelOrConstructor;
                                    if (!identifierOrCriteria) {
                                        msg = 'Id to delete or criteria required. Do you want to delete all? Pass Predicates.ALL';
                                        logger.error(msg, { identifierOrCriteria: identifierOrCriteria });
                                        throw new Error(msg);
                                    }
                                    modelDefinition = getModelDefinition(modelConstructor);
                                    if (!modelDefinition) {
                                        throw new Error('Could not find model definition for modelConstructor.');
                                    }
                                    if (typeof identifierOrCriteria === 'string') {
                                        keyFields = util_1.extractPrimaryKeyFieldNames(modelDefinition);
                                        if (keyFields.length > 1) {
                                            msg = util_1.errorMessages.deleteByPkWithCompositeKeyPresent;
                                            logger.error(msg, { keyFields: keyFields });
                                            throw new Error(msg);
                                        }
                                        condition = predicates_1.ModelPredicateCreator.createForSingleField(modelDefinition, keyFields[0], identifierOrCriteria);
                                    }
                                    else {
                                        if (types_1.isIdentifierObject(identifierOrCriteria, modelDefinition)) {
                                            condition = predicates_1.ModelPredicateCreator.createForPk(modelDefinition, identifierOrCriteria);
                                        }
                                        else {
                                            condition = next_1.internals(identifierOrCriteria(next_1.predicateFor({
                                                builder: modelConstructor,
                                                schema: modelDefinition,
                                                pkField: util_1.extractPrimaryKeyFieldNames(modelDefinition),
                                            }))).toStoragePredicate();
                                        }
                                        if (!condition ||
                                            !predicates_1.ModelPredicateCreator.isValidPredicate(condition)) {
                                            msg = 'Criteria required. Do you want to delete all? Pass Predicates.ALL';
                                            logger.error(msg, { condition: condition });
                                            throw new Error(msg);
                                        }
                                    }
                                    return [4 /*yield*/, this.storage.delete(modelConstructor, condition)];
                                case 2:
                                    _a = tslib_1.__read.apply(void 0, [_d.sent(), 1]), deleted = _a[0];
                                    return [2 /*return*/, attached(deleted, ModelAttachment.DataStore)];
                                case 3:
                                    model = modelOrConstructor;
                                    modelConstructor = Object.getPrototypeOf(model || {})
                                        .constructor;
                                    if (!isValidModelConstructor(modelConstructor)) {
                                        msg = 'Object is not an instance of a valid model';
                                        logger.error(msg, { model: model });
                                        throw new Error(msg);
                                    }
                                    modelDefinition = getModelDefinition(modelConstructor);
                                    if (!modelDefinition) {
                                        throw new Error('Could not find model definition for modelConstructor.');
                                    }
                                    pkPredicate = predicates_1.ModelPredicateCreator.createForPk(modelDefinition, model);
                                    if (identifierOrCriteria) {
                                        if (typeof identifierOrCriteria !== 'function') {
                                            msg = 'Invalid criteria';
                                            logger.error(msg, { identifierOrCriteria: identifierOrCriteria });
                                            throw new Error(msg);
                                        }
                                        condition = next_1.internals(identifierOrCriteria(next_1.predicateFor({
                                            builder: modelConstructor,
                                            schema: modelDefinition,
                                            pkField: util_1.extractPrimaryKeyFieldNames(modelDefinition),
                                        }))).toStoragePredicate(pkPredicate);
                                    }
                                    else {
                                        condition = pkPredicate;
                                    }
                                    return [4 /*yield*/, this.storage.delete(model, condition)];
                                case 4:
                                    _b = tslib_1.__read.apply(void 0, [_d.sent(), 1]), _c = tslib_1.__read(_b[0], 1), deleted = _c[0];
                                    return [2 /*return*/, attached(deleted, ModelAttachment.DataStore)];
                            }
                        });
                    }); }, 'datastore delete')
                        .catch(this.handleAddProcError('DataStore.delete()'))];
            });
        }); };
        this.observe = function (modelOrConstructor, identifierOrCriteria) {
            var executivePredicate;
            var modelConstructor = modelOrConstructor && isValidModelConstructor(modelOrConstructor)
                ? modelOrConstructor
                : undefined;
            if (modelOrConstructor && modelConstructor === undefined) {
                var model = modelOrConstructor;
                var modelConstructor_1 = model && Object.getPrototypeOf(model).constructor;
                if (isValidModelConstructor(modelConstructor_1)) {
                    if (identifierOrCriteria) {
                        logger.warn('idOrCriteria is ignored when using a model instance', {
                            model: model,
                            identifierOrCriteria: identifierOrCriteria,
                        });
                    }
                    return _this.observe(modelConstructor_1, model.id);
                }
                else {
                    var msg = 'The model is not an instance of a PersistentModelConstructor';
                    logger.error(msg, { model: model });
                    throw new Error(msg);
                }
            }
            // observe should not accept object literal syntax
            if (identifierOrCriteria &&
                modelConstructor &&
                types_1.isIdentifierObject(identifierOrCriteria, getModelDefinition(modelConstructor))) {
                var msg = util_1.errorMessages.observeWithObjectLiteral;
                logger.error(msg, { objectLiteral: identifierOrCriteria });
                throw new Error(msg);
            }
            if (identifierOrCriteria !== undefined && modelConstructor === undefined) {
                var msg = 'Cannot provide criteria without a modelConstructor';
                logger.error(msg, identifierOrCriteria);
                throw new Error(msg);
            }
            if (modelConstructor && !isValidModelConstructor(modelConstructor)) {
                var msg = 'Constructor is not for a valid model';
                logger.error(msg, { modelConstructor: modelConstructor });
                throw new Error(msg);
            }
            if (modelConstructor && typeof identifierOrCriteria === 'string') {
                var buildIdPredicate = function (seed) { return seed.id.eq(identifierOrCriteria); };
                executivePredicate = next_1.internals(buildIdPredicate(buildSeedPredicate(modelConstructor)));
            }
            else if (modelConstructor && typeof identifierOrCriteria === 'function') {
                executivePredicate = next_1.internals(identifierOrCriteria(buildSeedPredicate(modelConstructor)));
            }
            return new zen_observable_ts_1.default(function (observer) {
                var source;
                _this.runningProcesses
                    .add(function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                    var _this = this;
                    return tslib_1.__generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4 /*yield*/, this.start()];
                            case 1:
                                _a.sent();
                                // Filter the events returned by Storage according to namespace,
                                // append original element data, and subscribe to the observable
                                source = this.storage.observe(modelConstructor)
                                    .filter(function (_a) {
                                    var model = _a.model;
                                    return namespaceResolver(model) === util_1.USER;
                                })
                                    .subscribe({
                                    next: function (item) {
                                        return _this.runningProcesses.isOpen &&
                                            _this.runningProcesses.add(function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                                                var message, modelDefinition, keyFields, primaryKeysAndValues, freshElement, _a;
                                                return tslib_1.__generator(this, function (_b) {
                                                    switch (_b.label) {
                                                        case 0:
                                                            message = item;
                                                            if (!(item.opType !== 'DELETE')) return [3 /*break*/, 2];
                                                            modelDefinition = getModelDefinition(item.model);
                                                            keyFields = util_1.extractPrimaryKeyFieldNames(modelDefinition);
                                                            primaryKeysAndValues = util_1.extractPrimaryKeysAndValues(item.element, keyFields);
                                                            return [4 /*yield*/, this.query(item.model, primaryKeysAndValues)];
                                                        case 1:
                                                            freshElement = _b.sent();
                                                            message = tslib_1.__assign(tslib_1.__assign({}, message), { element: freshElement });
                                                            _b.label = 2;
                                                        case 2:
                                                            _a = !executivePredicate;
                                                            if (_a) return [3 /*break*/, 4];
                                                            return [4 /*yield*/, executivePredicate.matches(message.element)];
                                                        case 3:
                                                            _a = (_b.sent());
                                                            _b.label = 4;
                                                        case 4:
                                                            if (_a) {
                                                                observer.next(message);
                                                            }
                                                            return [2 /*return*/];
                                                    }
                                                });
                                            }); }, 'datastore observe message handler');
                                    },
                                    error: function (err) { return observer.error(err); },
                                    complete: function () { return observer.complete(); },
                                });
                                return [2 /*return*/];
                        }
                    });
                }); }, 'datastore observe observable initialization')
                    .catch(_this.handleAddProcError('DataStore.observe()'))
                    .catch(function (error) {
                    observer.error(error);
                });
                // better than no cleaner, but if the subscriber is handling the
                // complete() message async and not registering with the context,
                // this will still be problematic.
                return _this.runningProcesses.addCleaner(function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                    return tslib_1.__generator(this, function (_a) {
                        if (source) {
                            source.unsubscribe();
                        }
                        return [2 /*return*/];
                    });
                }); }, 'DataStore.observe() cleanup');
            });
        };
        this.observeQuery = function (model, criteria, options) {
            return new zen_observable_ts_1.default(function (observer) {
                var items = new Map();
                var itemsChanged = new Map();
                var deletedItemIds = [];
                var handle;
                // let predicate: ModelPredicate<T> | undefined;
                var executivePredicate;
                /**
                 * As the name suggests, this geneates a snapshot in the form of
                 * 	`{items: T[], isSynced: boolean}`
                 * and sends it to the observer.
                 *
                 * SIDE EFFECT: The underlying generation and emission methods may touch:
                 * `items`, `itemsChanged`, and `deletedItemIds`.
                 *
                 * Refer to `generateSnapshot` and `emitSnapshot` for more details.
                 */
                var generateAndEmitSnapshot = function () {
                    var snapshot = generateSnapshot();
                    emitSnapshot(snapshot);
                };
                // a mechanism to return data after X amount of seconds OR after the
                // "limit" (itemsChanged >= this.syncPageSize) has been reached, whichever comes first
                var limitTimerRace = new util_1.DeferredCallbackResolver({
                    callback: generateAndEmitSnapshot,
                    errorHandler: observer.error,
                    maxInterval: 2000,
                });
                var sort = (options || {}).sort;
                var sortOptions = sort ? { sort: sort } : undefined;
                var modelDefinition = getModelDefinition(model);
                if (!modelDefinition) {
                    throw new Error('Could not find model definition.');
                }
                if (model && typeof criteria === 'function') {
                    executivePredicate = next_1.internals(criteria(buildSeedPredicate(model)));
                }
                else if (predicates_1.isPredicatesAll(criteria)) {
                    executivePredicate = undefined;
                }
                _this.runningProcesses
                    .add(function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                    var err_1;
                    var _this = this;
                    return tslib_1.__generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                _a.trys.push([0, 2, , 3]);
                                return [4 /*yield*/, this.query(model, criteria, sortOptions)];
                            case 1:
                                // first, query and return any locally-available records
                                (_a.sent()).forEach(function (item) {
                                    var itemModelDefinition = getModelDefinition(model);
                                    var idOrPk = utils_1.getIdentifierValue(itemModelDefinition, item);
                                    items.set(idOrPk, item);
                                });
                                // Observe the model and send a stream of updates (debounced).
                                // We need to post-filter results instead of passing criteria through
                                // to have visibility into items that move from in-set to out-of-set.
                                // We need to explicitly remove those items from the existing snapshot.
                                handle = this.observe(model).subscribe(function (_a) {
                                    var element = _a.element, model = _a.model, opType = _a.opType;
                                    return _this.runningProcesses.isOpen &&
                                        _this.runningProcesses.add(function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                                            var itemModelDefinition, idOrPk, _a, isSynced, limit;
                                            var _b, _c;
                                            return tslib_1.__generator(this, function (_d) {
                                                switch (_d.label) {
                                                    case 0:
                                                        itemModelDefinition = getModelDefinition(model);
                                                        idOrPk = utils_1.getIdentifierValue(itemModelDefinition, element);
                                                        _a = executivePredicate;
                                                        if (!_a) return [3 /*break*/, 2];
                                                        return [4 /*yield*/, executivePredicate.matches(element)];
                                                    case 1:
                                                        _a = !(_d.sent());
                                                        _d.label = 2;
                                                    case 2:
                                                        if (_a) {
                                                            if (opType === 'UPDATE' &&
                                                                (items.has(idOrPk) || itemsChanged.has(idOrPk))) {
                                                                // tracking as a "deleted item" will include the item in
                                                                // page limit calculations and ensure it is removed from the
                                                                // final items collection, regardless of which collection(s)
                                                                // it is currently in. (I mean, it could be in both, right!?)
                                                                deletedItemIds.push(idOrPk);
                                                            }
                                                            else {
                                                                // ignore updates for irrelevant/filtered items.
                                                                return [2 /*return*/];
                                                            }
                                                        }
                                                        // Flag items which have been recently deleted
                                                        // NOTE: Merging of separate operations to the same model instance is handled upstream
                                                        // in the `mergePage` method within src/sync/merger.ts. The final state of a model instance
                                                        // depends on the LATEST record (for a given id).
                                                        if (opType === 'DELETE') {
                                                            deletedItemIds.push(idOrPk);
                                                        }
                                                        else {
                                                            itemsChanged.set(idOrPk, element);
                                                        }
                                                        isSynced = (_c = (_b = this.sync) === null || _b === void 0 ? void 0 : _b.getModelSyncedStatus(model)) !== null && _c !== void 0 ? _c : false;
                                                        limit = itemsChanged.size - deletedItemIds.length >=
                                                            this.syncPageSize;
                                                        if (limit || isSynced) {
                                                            limitTimerRace.resolve();
                                                        }
                                                        // kicks off every subsequent race as results sync down
                                                        limitTimerRace.start();
                                                        return [2 /*return*/];
                                                }
                                            });
                                        }); }, 'handle observeQuery observed event');
                                });
                                // returns a set of initial/locally-available results
                                generateAndEmitSnapshot();
                                return [3 /*break*/, 3];
                            case 2:
                                err_1 = _a.sent();
                                observer.error(err_1);
                                return [3 /*break*/, 3];
                            case 3: return [2 /*return*/];
                        }
                    });
                }); }, 'datastore observequery startup')
                    .catch(_this.handleAddProcError('DataStore.observeQuery()'))
                    .catch(function (error) {
                    observer.error(error);
                });
                /**
                 * Combines the `items`, `itemsChanged`, and `deletedItemIds` collections into
                 * a snapshot in the form of `{ items: T[], isSynced: boolean}`.
                 *
                 * SIDE EFFECT: The shared `items` collection is recreated.
                 */
                var generateSnapshot = function () {
                    var _a, _b;
                    var isSynced = (_b = (_a = _this.sync) === null || _a === void 0 ? void 0 : _a.getModelSyncedStatus(model)) !== null && _b !== void 0 ? _b : false;
                    var itemsArray = tslib_1.__spread(Array.from(items.values()), Array.from(itemsChanged.values()));
                    if (options === null || options === void 0 ? void 0 : options.sort) {
                        sortItems(itemsArray);
                    }
                    items.clear();
                    itemsArray.forEach(function (item) {
                        var itemModelDefinition = getModelDefinition(model);
                        var idOrPk = utils_1.getIdentifierValue(itemModelDefinition, item);
                        items.set(idOrPk, item);
                    });
                    // remove deleted items from the final result set
                    deletedItemIds.forEach(function (idOrPk) { return items.delete(idOrPk); });
                    return {
                        items: Array.from(items.values()),
                        isSynced: isSynced,
                    };
                };
                /**
                 * Emits the list of items to the observer.
                 *
                 * SIDE EFFECT: `itemsChanged` and `deletedItemIds` are cleared to prepare
                 * for the next snapshot.
                 *
                 * @param snapshot The generated items data to emit.
                 */
                var emitSnapshot = function (snapshot) {
                    // send the generated snapshot to the primary subscription.
                    // NOTE: This observer's handler *could* be async ...
                    observer.next(snapshot);
                    // reset the changed items sets
                    itemsChanged.clear();
                    deletedItemIds = [];
                };
                /**
                 * Sorts an `Array` of `T` according to the sort instructions given in the
                 * original  `observeQuery()` call.
                 *
                 * @param itemsToSort A array of model type.
                 */
                var sortItems = function (itemsToSort) {
                    var modelDefinition = getModelDefinition(model);
                    var pagination = _this.processPagination(modelDefinition, options);
                    var sortPredicates = predicates_1.ModelSortPredicateCreator.getPredicates(pagination.sort);
                    if (sortPredicates.length) {
                        var compareFn = util_1.sortCompareFunction(sortPredicates);
                        itemsToSort.sort(compareFn);
                    }
                };
                /**
                 * Force one last snapshot when the model is fully synced.
                 *
                 * This reduces latency for that last snapshot, which will otherwise
                 * wait for the configured timeout.
                 *
                 * @param payload The payload from the Hub event.
                 */
                var hubCallback = function (_a) {
                    var payload = _a.payload;
                    var _b;
                    var event = payload.event, data = payload.data;
                    if (event === sync_1.ControlMessage.SYNC_ENGINE_MODEL_SYNCED &&
                        ((_b = data === null || data === void 0 ? void 0 : data.model) === null || _b === void 0 ? void 0 : _b.name) === model.name) {
                        generateAndEmitSnapshot();
                        core_1.Hub.remove('datastore', hubCallback);
                    }
                };
                core_1.Hub.listen('datastore', hubCallback);
                return _this.runningProcesses.addCleaner(function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                    return tslib_1.__generator(this, function (_a) {
                        if (handle) {
                            handle.unsubscribe();
                        }
                        return [2 /*return*/];
                    });
                }); }, 'datastore observequery cleaner');
            });
        };
        this.configure = function (config) {
            if (config === void 0) { config = {}; }
            _this.amplifyContext.Auth = _this.Auth;
            _this.amplifyContext.API = _this.API;
            _this.amplifyContext.Cache = _this.Cache;
            var configDataStore = config.DataStore, configAuthModeStrategyType = config.authModeStrategyType, configConflictHandler = config.conflictHandler, configErrorHandler = config.errorHandler, configMaxRecordsToSync = config.maxRecordsToSync, configSyncPageSize = config.syncPageSize, configFullSyncInterval = config.fullSyncInterval, configSyncExpressions = config.syncExpressions, configAuthProviders = config.authProviders, configStorageAdapter = config.storageAdapter, configFromAmplify = tslib_1.__rest(config, ["DataStore", "authModeStrategyType", "conflictHandler", "errorHandler", "maxRecordsToSync", "syncPageSize", "fullSyncInterval", "syncExpressions", "authProviders", "storageAdapter"]);
            _this.amplifyConfig = tslib_1.__assign(tslib_1.__assign({}, configFromAmplify), _this.amplifyConfig);
            _this.conflictHandler = _this.setConflictHandler(config);
            _this.errorHandler = _this.setErrorHandler(config);
            var authModeStrategyType = (configDataStore && configDataStore.authModeStrategyType) ||
                configAuthModeStrategyType ||
                types_1.AuthModeStrategyType.DEFAULT;
            switch (authModeStrategyType) {
                case types_1.AuthModeStrategyType.MULTI_AUTH:
                    _this.authModeStrategy = authModeStrategies_1.multiAuthStrategy(_this.amplifyContext);
                    break;
                case types_1.AuthModeStrategyType.DEFAULT:
                    _this.authModeStrategy = authModeStrategies_1.defaultAuthStrategy;
                    break;
                default:
                    _this.authModeStrategy = authModeStrategies_1.defaultAuthStrategy;
                    break;
            }
            // store on config object, so that Sync, Subscription, and Mutation processors can have access
            _this.amplifyConfig.authProviders =
                (configDataStore && configDataStore.authProviders) || configAuthProviders;
            _this.syncExpressions =
                (configDataStore && configDataStore.syncExpressions) ||
                    configSyncExpressions ||
                    _this.syncExpressions;
            _this.maxRecordsToSync =
                (configDataStore && configDataStore.maxRecordsToSync) ||
                    configMaxRecordsToSync ||
                    _this.maxRecordsToSync ||
                    10000;
            // store on config object, so that Sync, Subscription, and Mutation processors can have access
            _this.amplifyConfig.maxRecordsToSync = _this.maxRecordsToSync;
            _this.syncPageSize =
                (configDataStore && configDataStore.syncPageSize) ||
                    configSyncPageSize ||
                    _this.syncPageSize ||
                    1000;
            // store on config object, so that Sync, Subscription, and Mutation processors can have access
            _this.amplifyConfig.syncPageSize = _this.syncPageSize;
            _this.fullSyncInterval =
                (configDataStore && configDataStore.fullSyncInterval) ||
                    configFullSyncInterval ||
                    _this.fullSyncInterval ||
                    24 * 60; // 1 day
            _this.storageAdapter =
                (configDataStore && configDataStore.storageAdapter) ||
                    configStorageAdapter ||
                    _this.storageAdapter ||
                    undefined;
            _this.sessionId = _this.retrieveSessionId();
        };
    }
    DataStore.prototype.getModuleName = function () {
        return 'DataStore';
    };
    /**
     * Builds a function to capture `BackgroundManagerNotOpenError`'s to produce friendlier,
     * more instructive errors for customers.
     *
     * @param operation The name of the operation (usually a Datastore method) the customer
     * tried to call.
     */
    DataStore.prototype.handleAddProcError = function (operation) {
        var _this = this;
        /**
         * If the tested error is a `BackgroundManagerNotOpenError`, it will be captured
         * and replaced with a friendlier message that instructs the App Developer.
         *
         * @param err An error to test.
         */
        var handler = function (err) {
            if (err.message.startsWith('BackgroundManagerNotOpenError')) {
                throw new Error([
                    "DataStoreStateError: Tried to execute `" + operation + "` while DataStore was \"" + _this.state + "\".",
                    "This can only be done while DataStore is \"Started\" or \"Stopped\". To remedy:",
                    'Ensure all calls to `stop()` and `clear()` have completed first.',
                    'If this is not possible, retry the operation until it succeeds.',
                ].join('\n'));
            }
            else {
                throw err;
            }
        };
        return handler;
    };
    /**
     * Clears all data from storage and removes all data, schema info, other
     * initialization details, and then stops DataStore.
     *
     * That said, reinitialization is required after clearing. This can be done
     * by explicitiliy calling `start()` or any method that implicitly starts
     * DataStore, such as `query()`, `save()`, or `delete()`.
     */
    DataStore.prototype.clear = function () {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            return tslib_1.__generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        checkSchemaInitialized();
                        this.state = DataStoreState.Clearing;
                        return [4 /*yield*/, this.runningProcesses.close()];
                    case 1:
                        _a.sent();
                        if (!(this.storage === undefined)) return [3 /*break*/, 3];
                        // connect to storage so that it can be cleared without fully starting DataStore
                        this.storage = new storage_1.ExclusiveStorage(schema, namespaceResolver, getModelConstructorByModelName, modelInstanceCreator, this.storageAdapter, this.sessionId);
                        return [4 /*yield*/, this.storage.init()];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        if (syncSubscription && !syncSubscription.closed) {
                            syncSubscription.unsubscribe();
                        }
                        if (!this.sync) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.sync.stop()];
                    case 4:
                        _a.sent();
                        _a.label = 5;
                    case 5: return [4 /*yield*/, this.storage.clear()];
                    case 6:
                        _a.sent();
                        this.initialized = undefined; // Should re-initialize when start() is called.
                        this.storage = undefined;
                        this.sync = undefined;
                        this.syncPredicates = new WeakMap();
                        return [4 /*yield*/, this.runningProcesses.open()];
                    case 7:
                        _a.sent();
                        this.state = DataStoreState.NotRunning;
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Stops all DataStore sync activities.
     *
     * TODO: "Waits for graceful termination of
     * running queries and terminates subscriptions."
     */
    DataStore.prototype.stop = function () {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            return tslib_1.__generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.state = DataStoreState.Stopping;
                        return [4 /*yield*/, this.runningProcesses.close()];
                    case 1:
                        _a.sent();
                        if (syncSubscription && !syncSubscription.closed) {
                            syncSubscription.unsubscribe();
                        }
                        if (!this.sync) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.sync.stop()];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        this.initialized = undefined; // Should re-initialize when start() is called.
                        this.sync = undefined;
                        return [4 /*yield*/, this.runningProcesses.open()];
                    case 4:
                        _a.sent();
                        this.state = DataStoreState.NotRunning;
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Validates given pagination input from a query and creates a pagination
     * argument for use against the storage layer.
     *
     * @param modelDefinition
     * @param paginationProducer
     */
    DataStore.prototype.processPagination = function (modelDefinition, paginationProducer) {
        var sortPredicate;
        var _a = paginationProducer || {}, limit = _a.limit, page = _a.page, sort = _a.sort;
        if (limit === undefined && page === undefined && sort === undefined) {
            return undefined;
        }
        if (page !== undefined && limit === undefined) {
            throw new Error('Limit is required when requesting a page');
        }
        if (page !== undefined) {
            if (typeof page !== 'number') {
                throw new Error('Page should be a number');
            }
            if (page < 0) {
                throw new Error("Page can't be negative");
            }
        }
        if (limit !== undefined) {
            if (typeof limit !== 'number') {
                throw new Error('Limit should be a number');
            }
            if (limit < 0) {
                throw new Error("Limit can't be negative");
            }
        }
        if (sort) {
            sortPredicate = predicates_1.ModelSortPredicateCreator.createFromExisting(modelDefinition, sort);
        }
        return {
            limit: limit,
            page: page,
            sort: sortPredicate,
        };
    };
    /**
     * Examines the configured `syncExpressions` and produces a WeakMap of
     * SchemaModel -> predicate to use during sync.
     */
    DataStore.prototype.processSyncExpressions = function () {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var syncPredicates;
            var _this = this;
            return tslib_1.__generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.syncExpressions || !this.syncExpressions.length) {
                            return [2 /*return*/, new WeakMap()];
                        }
                        return [4 /*yield*/, Promise.all(this.syncExpressions.map(function (syncExpression) { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                                var _a, modelConstructor, conditionProducer, modelDefinition, condition, predicate;
                                return tslib_1.__generator(this, function (_b) {
                                    switch (_b.label) {
                                        case 0: return [4 /*yield*/, syncExpression];
                                        case 1:
                                            _a = _b.sent(), modelConstructor = _a.modelConstructor, conditionProducer = _a.conditionProducer;
                                            modelDefinition = getModelDefinition(modelConstructor);
                                            return [4 /*yield*/, this.unwrapPromise(conditionProducer)];
                                        case 2:
                                            condition = _b.sent();
                                            if (predicates_1.isPredicatesAll(condition)) {
                                                return [2 /*return*/, [modelDefinition, null]];
                                            }
                                            predicate = next_1.internals(condition(next_1.predicateFor({
                                                builder: modelConstructor,
                                                schema: modelDefinition,
                                                pkField: util_1.extractPrimaryKeyFieldNames(modelDefinition),
                                            }))).toStoragePredicate();
                                            return [2 /*return*/, [modelDefinition, predicate]];
                                    }
                                });
                            }); }))];
                    case 1:
                        syncPredicates = _a.sent();
                        return [2 /*return*/, this.weakMapFromEntries(syncPredicates)];
                }
            });
        });
    };
    DataStore.prototype.createFromCondition = function (modelDefinition, condition) {
        try {
            return predicates_1.ModelPredicateCreator.createFromExisting(modelDefinition, condition);
        }
        catch (error) {
            logger.error('Error creating Sync Predicate');
            throw error;
        }
    };
    DataStore.prototype.unwrapPromise = function (conditionProducer) {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var condition, error_1;
            return tslib_1.__generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, conditionProducer()];
                    case 1:
                        condition = _a.sent();
                        return [2 /*return*/, condition || conditionProducer];
                    case 2:
                        error_1 = _a.sent();
                        if (error_1 instanceof TypeError) {
                            return [2 /*return*/, conditionProducer];
                        }
                        throw error_1;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    DataStore.prototype.weakMapFromEntries = function (entries) {
        return entries.reduce(function (map, _a) {
            var _b = tslib_1.__read(_a, 2), modelDefinition = _b[0], predicate = _b[1];
            if (map.has(modelDefinition)) {
                var name_2 = modelDefinition.name;
                logger.warn("You can only utilize one Sync Expression per model.\n          Subsequent sync expressions for the " + name_2 + " model will be ignored.");
                return map;
            }
            if (predicate) {
                map.set(modelDefinition, predicate);
            }
            return map;
        }, new WeakMap());
    };
    /**
     * A session ID to allow CMS to open databases against multiple apps.
     * This session ID is only expected be set by AWS Amplify Studio.
     */
    DataStore.prototype.retrieveSessionId = function () {
        try {
            var sessionId = sessionStorage.getItem('datastoreSessionId');
            if (sessionId) {
                var aws_appsync_graphqlEndpoint = this.amplifyConfig.aws_appsync_graphqlEndpoint;
                var appSyncUrl = aws_appsync_graphqlEndpoint.split('/')[2];
                var _a = tslib_1.__read(appSyncUrl.split('.'), 1), appSyncId = _a[0];
                return sessionId + "-" + appSyncId;
            }
        }
        catch (_b) { }
        return undefined;
    };
    return DataStore;
}());
exports.DataStoreClass = DataStore;
var instance = new DataStore();
exports.DataStore = instance;
core_1.Amplify.register(instance);
//# sourceMappingURL=datastore.js.map