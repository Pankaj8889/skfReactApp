"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var tslib_1 = require("tslib");
var types_1 = require("../types");
var index_1 = require("./index");
var relationship_1 = require("../storage/relationship");
var util_1 = require("../util");
var ops = tslib_1.__spread(index_1.comparisonKeys);
/**
 * A map from keys (exposed to customers) to the internal predicate data
 * structures invoking code should not muck with.
 */
var predicateInternalsMap = new Map();
/**
 * Creates a link between a key (and generates a key if needed) and an internal
 * `GroupCondition`, which allows us to return a key object instead of the gory
 * conditions details to customers/invoking code.
 *
 * @param condition The internal condition to keep hidden.
 * @param key The object DataStore will use to find the internal condition.
 * If no key is given, an empty one is created.
 */
var registerPredicateInternals = function (condition, key) {
    var finalKey = key || new types_1.PredicateInternalsKey();
    predicateInternalsMap.set(finalKey, condition);
    return finalKey;
};
/**
 * Takes a key object from `registerPredicateInternals()` to fetch an internal
 * `GroupCondition` object, which can then be used to query storage or
 * test/match objects.
 *
 * This indirection exists to hide `GroupCondition` from public interfaces, since
 * `GroupCondition` contains extra methods and properties that public callers
 * should not use.
 *
 * @param key A key object previously returned by `registerPredicateInternals()`
 */
exports.internals = function (key) {
    if (!predicateInternalsMap.has(key)) {
        throw new Error("Invalid predicate. Terminate your predicate with a valid condition (e.g., `p => p.field.eq('value')`) or pass `Predicates.ALL`.");
    }
    return predicateInternalsMap.get(key);
};
/**
 * Maps operators to negated operators.
 * Used to facilitate propagation of negation down a tree of conditions.
 */
var negations = {
    and: 'or',
    or: 'and',
    not: 'and',
    eq: 'ne',
    ne: 'eq',
    gt: 'le',
    ge: 'lt',
    lt: 'ge',
    le: 'gt',
    contains: 'notContains',
    notContains: 'contains',
};
/**
 * A condition that can operate against a single "primitive" field of a model or item.
 * @member field The field of *some record* to test against.
 * @member operator The equality or comparison operator to use.
 * @member operands The operands for the equality/comparison check.
 */
var FieldCondition = /** @class */ (function () {
    function FieldCondition(field, operator, operands) {
        this.field = field;
        this.operator = operator;
        this.operands = operands;
        this.validate();
    }
    /**
     * Creates a copy of self.
     * @param extract Not used. Present only to fulfill the `UntypedCondition` interface.
     * @returns A new, identitical `FieldCondition`.
     */
    FieldCondition.prototype.copy = function (extract) {
        return [
            new FieldCondition(this.field, this.operator, tslib_1.__spread(this.operands)),
            undefined,
        ];
    };
    /**
     * Produces a tree structure similar to a graphql condition. The returned
     * structure is "dumb" and is intended for another query/condition
     * generation mechanism to interpret, such as the cloud or storage query
     * builders.
     *
     * E.g.,
     *
     * ```json
     * {
     * 	"name": {
     * 		"eq": "robert"
     * 	}
     * }
     * ```
     */
    FieldCondition.prototype.toAST = function () {
        var _a, _b;
        return _a = {},
            _a[this.field] = (_b = {},
                _b[this.operator] = this.operator === 'between'
                    ? [this.operands[0], this.operands[1]]
                    : this.operands[0],
                _b),
            _a;
    };
    /**
     * Produces a new condition (`FieldCondition` or `GroupCondition`) that
     * matches the opposite of this condition.
     *
     * Intended to be used when applying De Morgan's Law, which can be done to
     * produce more efficient queries against the storage layer if a negation
     * appears in the query tree.
     *
     * For example:
     *
     * 1. `name.eq('robert')` becomes `name.ne('robert')`
     * 2. `price.between(100, 200)` becomes `m => m.or(m => [m.price.lt(100), m.price.gt(200)])`
     *
     * @param model The model meta to use when construction a new `GroupCondition`
     * for cases where the negation requires multiple `FieldCondition`'s.
     */
    FieldCondition.prototype.negated = function (model) {
        if (this.operator === 'between') {
            return new GroupCondition(model, undefined, undefined, 'or', [
                new FieldCondition(this.field, 'lt', [this.operands[0]]),
                new FieldCondition(this.field, 'gt', [this.operands[1]]),
            ]);
        }
        else if (this.operator === 'beginsWith') {
            // beginsWith negation doesn't have a good, safe optimation right now.
            // just re-wrap it in negation. The adapter will have to scan-and-filter,
            // as is likely optimal for negated beginsWith conditions *anyway*.
            return new GroupCondition(model, undefined, undefined, 'not', [
                new FieldCondition(this.field, 'beginsWith', [this.operands[0]]),
            ]);
        }
        else {
            return new FieldCondition(this.field, negations[this.operator], this.operands);
        }
    };
    /**
     * Not implemented. Not needed. GroupCondition instead consumes FieldConditions and
     * transforms them into legacy predicates. (*For now.*)
     * @param storage N/A. If ever implemented, the storage adapter to query.
     * @returns N/A. If ever implemented, return items from `storage` that match.
     */
    FieldCondition.prototype.fetch = function (storage) {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            return tslib_1.__generator(this, function (_a) {
                return [2 /*return*/, Promise.reject('No implementation needed [yet].')];
            });
        });
    };
    /**
     * Determins whether a given item matches the expressed condition.
     * @param item The item to test.
     * @returns `Promise<boolean>`, `true` if matches; `false` otherwise.
     */
    FieldCondition.prototype.matches = function (item) {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var v, operations, operation, result;
            var _this = this;
            return tslib_1.__generator(this, function (_a) {
                v = item[this.field];
                operations = {
                    eq: function () { return v === _this.operands[0]; },
                    ne: function () { return v !== _this.operands[0]; },
                    gt: function () { return v > _this.operands[0]; },
                    ge: function () { return v >= _this.operands[0]; },
                    lt: function () { return v < _this.operands[0]; },
                    le: function () { return v <= _this.operands[0]; },
                    contains: function () { return v.indexOf(_this.operands[0]) > -1; },
                    notContains: function () { return v.indexOf(_this.operands[0]) === -1; },
                    beginsWith: function () { return v.startsWith(_this.operands[0]); },
                    between: function () { return v >= _this.operands[0] && v <= _this.operands[1]; },
                };
                operation = operations[this.operator];
                if (operation) {
                    result = operation();
                    return [2 /*return*/, result];
                }
                else {
                    throw new Error("Invalid operator given: " + this.operator);
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Checks `this.operands` for compatibility with `this.operator`.
     */
    FieldCondition.prototype.validate = function () {
        var _this = this;
        /**
         * Creates a validator that checks for a particular `operands` count.
         * Throws an exception if the `count` disagrees with `operands.length`.
         * @param count The number of `operands` expected.
         */
        var argumentCount = function (count) {
            var argsClause = count === 1 ? 'argument is' : 'arguments are';
            return function () {
                if (_this.operands.length !== count) {
                    return "Exactly " + count + " " + argsClause + " required.";
                }
            };
        };
        // NOTE: validations should return a message on failure.
        // hence, they should be "joined" together with logical OR's
        // as seen in the `between:` entry.
        var validations = {
            eq: argumentCount(1),
            ne: argumentCount(1),
            gt: argumentCount(1),
            ge: argumentCount(1),
            lt: argumentCount(1),
            le: argumentCount(1),
            contains: argumentCount(1),
            notContains: argumentCount(1),
            beginsWith: argumentCount(1),
            between: function () {
                return argumentCount(2)() ||
                    (_this.operands[0] > _this.operands[1]
                        ? 'The first argument must be less than or equal to the second argument.'
                        : null);
            },
        };
        var validate = validations[this.operator];
        if (validate) {
            var e = validate();
            if (typeof e === 'string')
                throw new Error("Incorrect usage of `" + this.operator + "()`: " + e);
        }
        else {
            throw new Error("Non-existent operator: `" + this.operator + "()`");
        }
    };
    return FieldCondition;
}());
exports.FieldCondition = FieldCondition;
/**
 * Small utility function to generate a monotonically increasing ID.
 * Used by GroupCondition to help keep track of which group is doing what,
 * when, and where during troubleshooting.
 */
var getGroupId = (function () {
    var seed = 1;
    return function () { return "group_" + seed++; };
})();
/**
 * A set of sub-conditions to operate against a model, optionally scoped to
 * a specific field, combined with the given operator (one of `and`, `or`, or `not`).
 * @member groupId Used to distinguish between GroupCondition instances for
 * debugging and troublehsooting.
 * @member model A metadata object that tells GroupCondition what to query and how.
 * @member field The field on the model that the sub-conditions apply to.
 * @member operator How to group child conditions together.
 * @member operands The child conditions.
 */
var GroupCondition = /** @class */ (function () {
    function GroupCondition(
    /**
     * The `ModelMeta` of the model to query and/or filter against.
     * Expected to contain:
     *
     * ```js
     * {
     * 	builder: ModelConstructor,
     * 	schema: SchemaModel,
     * 	pkField: string[]
     * }
     * ```
     */
    model, 
    /**
     * If populated, this group specifices a condition on a relationship.
     *
     * If `field` does *not* point to a related model, that's an error. It
     * could indicate that the `GroupCondition` was instantiated with bad
     * data, or that the model metadata is incorrect.
     */
    field, 
    /**
     * If a `field` is given, whether the relationship is a `HAS_ONE`,
     * 'HAS_MANY`, or `BELONGS_TO`.
     *
     * TODO: Remove this and replace with derivation using
     * `ModelRelationship.from(this.model, this.field).relationship`;
     */
    relationshipType, 
    /**
     *
     */
    operator, 
    /**
     *
     */
    operands, 
    /**
     * Whether this GroupCondition is the result of an optimize call.
     *
     * This is used to guard against infinitely fetch -> optimize -> fetch
     * recursion.
     */
    isOptimized) {
        if (isOptimized === void 0) { isOptimized = false; }
        this.model = model;
        this.field = field;
        this.relationshipType = relationshipType;
        this.operator = operator;
        this.operands = operands;
        this.isOptimized = isOptimized;
        // `groupId` was used for development/debugging.
        // Should we leave this in for future troubleshooting?
        this.groupId = getGroupId();
    }
    /**
     * Returns a copy of a GroupCondition, which also returns the copy of a
     * given reference node to "extract".
     * @param extract A node of interest. Its copy will *also* be returned if the node exists.
     * @returns [The full copy, the copy of `extract` | undefined]
     */
    GroupCondition.prototype.copy = function (extract) {
        var copied = new GroupCondition(this.model, this.field, this.relationshipType, this.operator, []);
        var extractedCopy = extract === this ? copied : undefined;
        this.operands.forEach(function (o) {
            var _a = tslib_1.__read(o.copy(extract), 2), operandCopy = _a[0], extractedFromOperand = _a[1];
            copied.operands.push(operandCopy);
            extractedCopy = extractedCopy || extractedFromOperand;
        });
        return [copied, extractedCopy];
    };
    /**
     * Creates a new `GroupCondition` that contains only the local field conditions,
     * omitting related model conditions. That resulting `GroupCondition` can be
     * used to produce predicates that are compatible with the storage adapters and
     * Cloud storage.
     *
     * @param negate Whether the condition tree should be negated according
     * to De Morgan's law.
     */
    GroupCondition.prototype.withFieldConditionsOnly = function (negate) {
        var _this = this;
        var negateChildren = negate !== (this.operator === 'not');
        return new GroupCondition(this.model, undefined, undefined, (negate ? negations[this.operator] : this.operator), this.operands
            .filter(function (o) { return o instanceof FieldCondition; })
            .map(function (o) {
            return negateChildren ? o.negated(_this.model) : o;
        }));
    };
    /**
     * Returns a version of the predicate tree with unnecessary logical groups
     * condensed and merged together. This is intended to create a dense tree
     * with leaf nodes (`FieldCondition`'s) aggregated under as few group conditions
     * as possible for the most efficient fetching possible -- it allows `fetch()`.
     *
     * E.g. a grouping like this:
     *
     * ```yaml
     * and:
     * 	and:
     * 		id:
     * 			eq: "abc"
     * 	and:
     * 		name:
     * 			eq: "xyz"
     * ```
     *
     * Will become this:
     *
     * ```yaml
     * and:
     * 	id:
     * 		eq: "abc"
     * 	name:
     * 		eq: "xyz"
     * ```
     *
     * This allows `fetch()` to pass both the `id` and `name` conditions to the adapter
     * together, which can then decide what index to use based on both fields together.
     *
     * @param preserveNode Whether to preserve the current node and to explicitly not eliminate
     * it during optimization. Used internally to preserve the root node and children of
     * `not` groups. `not` groups will always have a single child, so there's nothing to
     * optimize below a `not` (for now), and it makes the query logic simpler later.
     */
    GroupCondition.prototype.optimized = function (preserveNode) {
        var _this = this;
        if (preserveNode === void 0) { preserveNode = true; }
        var operands = this.operands.map(function (o) {
            return o instanceof GroupCondition ? o.optimized(_this.operator === 'not') : o;
        });
        // we're only collapsing and/or groups that contains a single child for now,
        // because they're much more common and much more trivial to collapse. basically,
        // an `and`/`or` that contains a single child doesn't require the layer of
        // logical grouping.
        if (!preserveNode &&
            ['and', 'or'].includes(this.operator) &&
            !this.field &&
            operands.length === 1) {
            var operand = operands[0];
            if (operand instanceof FieldCondition) {
                // between conditions should NOT be passed up the chain. if they
                // need to be *negated* later, it is important that they be properly
                // contained in an AND group. when de morgan's law is applied, the
                // conditions are reversed and the AND group flips to an OR. this
                // doesn't work right if the a `between` doesn't live in an AND group.
                if (operand.operator !== 'between') {
                    return operand;
                }
            }
            else {
                return operand;
            }
        }
        return new GroupCondition(this.model, this.field, this.relationshipType, this.operator, operands, true);
    };
    /**
     * Fetches matching records from a given storage adapter using legacy predicates (for now).
     * @param storage The storage adapter this predicate will query against.
     * @param breadcrumb For debugging/troubleshooting. A list of the `groupId`'s this
     * GroupdCondition.fetch is nested within.
     * @param negate Whether to match on the `NOT` of `this`.
     * @returns An `Promise` of `any[]` from `storage` matching the child conditions.
     */
    GroupCondition.prototype.fetch = function (storage, breadcrumb, negate) {
        if (breadcrumb === void 0) { breadcrumb = []; }
        if (negate === void 0) { negate = false; }
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var resultGroups, operator, negateChildren, groups, conditions, groups_1, groups_1_1, g, relatives, relationship, allJoinConditions, relatives_1, relatives_1_1, relative, relativeConditions, i, predicate, _a, _b, e_1_1, predicate, _c, _d, _e, _f, getPKValue, resultIndex, resultGroups_1, resultGroups_1_1, group, intersectWith, _g, _h, k, resultGroups_2, resultGroups_2_1, group, group_1, group_1_1, item;
            var e_1, _j, e_2, _k, _l, e_3, _m, e_4, _o, e_5, _p, e_6, _q;
            var _this = this;
            return tslib_1.__generator(this, function (_r) {
                switch (_r.label) {
                    case 0:
                        if (!this.isOptimized) {
                            return [2 /*return*/, this.optimized().fetch(storage)];
                        }
                        resultGroups = [];
                        operator = (negate ? negations[this.operator] : this.operator);
                        negateChildren = negate !== (this.operator === 'not');
                        groups = this.operands.filter(function (op) { return op instanceof GroupCondition; });
                        conditions = this.operands.filter(function (op) { return op instanceof FieldCondition; });
                        _r.label = 1;
                    case 1:
                        _r.trys.push([1, 10, 11, 12]);
                        groups_1 = tslib_1.__values(groups), groups_1_1 = groups_1.next();
                        _r.label = 2;
                    case 2:
                        if (!!groups_1_1.done) return [3 /*break*/, 9];
                        g = groups_1_1.value;
                        return [4 /*yield*/, g.fetch(storage, tslib_1.__spread(breadcrumb, [this.groupId]), negateChildren)];
                    case 3:
                        relatives = _r.sent();
                        // no relatives -> no need to attempt to perform a "join" query for
                        // candidate results:
                        //
                        // select a.* from a,b where b.id in EMPTY_SET ==> EMPTY_SET
                        //
                        // Additionally, the entire (sub)-query can be short-circuited if
                        // the operator is `AND`. Illustrated in SQL:
                        //
                        // select a.* from a where
                        //   id in [a,b,c]
                        //     AND                        <
                        //   id in EMTPY_SET            <<< Look!
                        //     AND                        <
                        //   id in [x,y,z]
                        //
                        // YIELDS: EMPTY_SET           // <-- Easy peasy. Lemon squeezy.
                        //
                        if (relatives.length === 0) {
                            // aggressively short-circuit as soon as we know the group condition will fail
                            if (operator === 'and') {
                                return [2 /*return*/, []];
                            }
                            // less aggressive short-circuit if we know the relatives will produce no
                            // candidate results; but aren't sure yet how this affects the group condition.
                            resultGroups.push([]);
                            return [3 /*break*/, 8];
                        }
                        if (!g.field) return [3 /*break*/, 7];
                        relationship = relationship_1.ModelRelationship.from(this.model, g.field);
                        if (!relationship) return [3 /*break*/, 5];
                        allJoinConditions = [];
                        try {
                            for (relatives_1 = (e_2 = void 0, tslib_1.__values(relatives)), relatives_1_1 = relatives_1.next(); !relatives_1_1.done; relatives_1_1 = relatives_1.next()) {
                                relative = relatives_1_1.value;
                                relativeConditions = [];
                                for (i = 0; i < relationship.localJoinFields.length; i++) {
                                    relativeConditions.push((_l = {},
                                        _l[relationship.localJoinFields[i]] = {
                                            eq: relative[relationship.remoteJoinFields[i]],
                                        },
                                        _l));
                                }
                                allJoinConditions.push({ and: relativeConditions });
                            }
                        }
                        catch (e_2_1) { e_2 = { error: e_2_1 }; }
                        finally {
                            try {
                                if (relatives_1_1 && !relatives_1_1.done && (_k = relatives_1.return)) _k.call(relatives_1);
                            }
                            finally { if (e_2) throw e_2.error; }
                        }
                        predicate = index_1.ModelPredicateCreator.createFromAST(this.model.schema, {
                            or: allJoinConditions,
                        });
                        _b = (_a = resultGroups).push;
                        return [4 /*yield*/, storage.query(this.model.builder, predicate)];
                    case 4:
                        _b.apply(_a, [_r.sent()]);
                        return [3 /*break*/, 6];
                    case 5: throw new Error('Missing field metadata.');
                    case 6: return [3 /*break*/, 8];
                    case 7:
                        // relatives are not actually relatives. they're candidate results.
                        resultGroups.push(relatives);
                        _r.label = 8;
                    case 8:
                        groups_1_1 = groups_1.next();
                        return [3 /*break*/, 2];
                    case 9: return [3 /*break*/, 12];
                    case 10:
                        e_1_1 = _r.sent();
                        e_1 = { error: e_1_1 };
                        return [3 /*break*/, 12];
                    case 11:
                        try {
                            if (groups_1_1 && !groups_1_1.done && (_j = groups_1.return)) _j.call(groups_1);
                        }
                        finally { if (e_1) throw e_1.error; }
                        return [7 /*endfinally*/];
                    case 12:
                        if (!(conditions.length > 0)) return [3 /*break*/, 14];
                        predicate = this.withFieldConditionsOnly(negateChildren).toStoragePredicate();
                        _d = (_c = resultGroups).push;
                        return [4 /*yield*/, storage.query(this.model.builder, predicate)];
                    case 13:
                        _d.apply(_c, [_r.sent()]);
                        return [3 /*break*/, 16];
                    case 14:
                        if (!(conditions.length === 0 && resultGroups.length === 0)) return [3 /*break*/, 16];
                        _f = (_e = resultGroups).push;
                        return [4 /*yield*/, storage.query(this.model.builder)];
                    case 15:
                        _f.apply(_e, [_r.sent()]);
                        _r.label = 16;
                    case 16:
                        getPKValue = function (item) {
                            return JSON.stringify(_this.model.pkField.map(function (name) { return item[name]; }));
                        };
                        if (operator === 'and') {
                            if (resultGroups.length === 0) {
                                return [2 /*return*/, []];
                            }
                            try {
                                // for each group, we intersect, removing items from the result index
                                // that aren't present in each subsequent group.
                                for (resultGroups_1 = tslib_1.__values(resultGroups), resultGroups_1_1 = resultGroups_1.next(); !resultGroups_1_1.done; resultGroups_1_1 = resultGroups_1.next()) {
                                    group = resultGroups_1_1.value;
                                    if (resultIndex === undefined) {
                                        resultIndex = new Map(group.map(function (item) { return [getPKValue(item), item]; }));
                                    }
                                    else {
                                        intersectWith = new Map(group.map(function (item) { return [getPKValue(item), item]; }));
                                        try {
                                            for (_g = (e_4 = void 0, tslib_1.__values(resultIndex.keys())), _h = _g.next(); !_h.done; _h = _g.next()) {
                                                k = _h.value;
                                                if (!intersectWith.has(k)) {
                                                    resultIndex.delete(k);
                                                }
                                            }
                                        }
                                        catch (e_4_1) { e_4 = { error: e_4_1 }; }
                                        finally {
                                            try {
                                                if (_h && !_h.done && (_o = _g.return)) _o.call(_g);
                                            }
                                            finally { if (e_4) throw e_4.error; }
                                        }
                                    }
                                }
                            }
                            catch (e_3_1) { e_3 = { error: e_3_1 }; }
                            finally {
                                try {
                                    if (resultGroups_1_1 && !resultGroups_1_1.done && (_m = resultGroups_1.return)) _m.call(resultGroups_1);
                                }
                                finally { if (e_3) throw e_3.error; }
                            }
                        }
                        else if (operator === 'or' || operator === 'not') {
                            // it's OK to handle NOT here, because NOT must always only negate
                            // a single child predicate. NOT logic will have been distributed down
                            // to the leaf conditions already.
                            resultIndex = new Map();
                            try {
                                // just merge the groups, performing DISTINCT-ification by ID.
                                for (resultGroups_2 = tslib_1.__values(resultGroups), resultGroups_2_1 = resultGroups_2.next(); !resultGroups_2_1.done; resultGroups_2_1 = resultGroups_2.next()) {
                                    group = resultGroups_2_1.value;
                                    try {
                                        for (group_1 = (e_6 = void 0, tslib_1.__values(group)), group_1_1 = group_1.next(); !group_1_1.done; group_1_1 = group_1.next()) {
                                            item = group_1_1.value;
                                            resultIndex.set(getPKValue(item), item);
                                        }
                                    }
                                    catch (e_6_1) { e_6 = { error: e_6_1 }; }
                                    finally {
                                        try {
                                            if (group_1_1 && !group_1_1.done && (_q = group_1.return)) _q.call(group_1);
                                        }
                                        finally { if (e_6) throw e_6.error; }
                                    }
                                }
                            }
                            catch (e_5_1) { e_5 = { error: e_5_1 }; }
                            finally {
                                try {
                                    if (resultGroups_2_1 && !resultGroups_2_1.done && (_p = resultGroups_2.return)) _p.call(resultGroups_2);
                                }
                                finally { if (e_5) throw e_5.error; }
                            }
                        }
                        return [2 /*return*/, Array.from((resultIndex === null || resultIndex === void 0 ? void 0 : resultIndex.values()) || [])];
                }
            });
        });
    };
    /**
     * Determines whether a single item matches the conditions of `this`.
     * When checking the target `item`'s properties, each property will be `await`'d
     * to ensure lazy-loading is respected where applicable.
     * @param item The item to match against.
     * @param ignoreFieldName Tells `match()` that the field name has already been dereferenced.
     * (Used for iterating over children on HAS_MANY checks.)
     * @returns A boolean (promise): `true` if matched, `false` otherwise.
     */
    GroupCondition.prototype.matches = function (item, ignoreFieldName) {
        if (ignoreFieldName === void 0) { ignoreFieldName = false; }
        var e_7, _a;
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var itemToCheck, _b, itemToCheck_1, itemToCheck_1_1, singleItem, e_7_1;
            return tslib_1.__generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (!(this.field && !ignoreFieldName)) return [3 /*break*/, 2];
                        return [4 /*yield*/, item[this.field]];
                    case 1:
                        _b = _c.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        _b = item;
                        _c.label = 3;
                    case 3:
                        itemToCheck = _b;
                        // if there is no item to check, we can stop recursing immediately.
                        // a condition cannot match against an item that does not exist. this
                        // can occur when `item.field` is optional in the schema.
                        if (!itemToCheck) {
                            return [2 /*return*/, false];
                        }
                        if (!(this.relationshipType === 'HAS_MANY' &&
                            typeof itemToCheck[Symbol.asyncIterator] === 'function')) return [3 /*break*/, 17];
                        _c.label = 4;
                    case 4:
                        _c.trys.push([4, 10, 11, 16]);
                        itemToCheck_1 = tslib_1.__asyncValues(itemToCheck);
                        _c.label = 5;
                    case 5: return [4 /*yield*/, itemToCheck_1.next()];
                    case 6:
                        if (!(itemToCheck_1_1 = _c.sent(), !itemToCheck_1_1.done)) return [3 /*break*/, 9];
                        singleItem = itemToCheck_1_1.value;
                        return [4 /*yield*/, this.matches(singleItem, true)];
                    case 7:
                        if (_c.sent()) {
                            return [2 /*return*/, true];
                        }
                        _c.label = 8;
                    case 8: return [3 /*break*/, 5];
                    case 9: return [3 /*break*/, 16];
                    case 10:
                        e_7_1 = _c.sent();
                        e_7 = { error: e_7_1 };
                        return [3 /*break*/, 16];
                    case 11:
                        _c.trys.push([11, , 14, 15]);
                        if (!(itemToCheck_1_1 && !itemToCheck_1_1.done && (_a = itemToCheck_1.return))) return [3 /*break*/, 13];
                        return [4 /*yield*/, _a.call(itemToCheck_1)];
                    case 12:
                        _c.sent();
                        _c.label = 13;
                    case 13: return [3 /*break*/, 15];
                    case 14:
                        if (e_7) throw e_7.error;
                        return [7 /*endfinally*/];
                    case 15: return [7 /*endfinally*/];
                    case 16: return [2 /*return*/, false];
                    case 17:
                        if (!(this.operator === 'or')) return [3 /*break*/, 18];
                        return [2 /*return*/, util_1.asyncSome(this.operands, function (c) { return c.matches(itemToCheck); })];
                    case 18:
                        if (!(this.operator === 'and')) return [3 /*break*/, 19];
                        return [2 /*return*/, util_1.asyncEvery(this.operands, function (c) { return c.matches(itemToCheck); })];
                    case 19:
                        if (!(this.operator === 'not')) return [3 /*break*/, 21];
                        if (this.operands.length !== 1) {
                            throw new Error('Invalid arguments! `not()` accepts exactly one predicate expression.');
                        }
                        return [4 /*yield*/, this.operands[0].matches(itemToCheck)];
                    case 20: return [2 /*return*/, !(_c.sent())];
                    case 21: throw new Error('Invalid group operator!');
                }
            });
        });
    };
    /**
     * Tranfsorm to a AppSync GraphQL compatible AST.
     * (Does not support filtering in nested types.)
     */
    GroupCondition.prototype.toAST = function () {
        var _a;
        if (this.field)
            throw new Error('Nested type conditions are not supported!');
        return _a = {},
            _a[this.operator] = this.operands.map(function (operand) { return operand.toAST(); }),
            _a;
    };
    GroupCondition.prototype.toStoragePredicate = function (baseCondition) {
        return index_1.ModelPredicateCreator.createFromAST(this.model.schema, this.toAST());
    };
    /**
     * A JSON representation that's good for debugging.
     */
    GroupCondition.prototype.toJSON = function () {
        return tslib_1.__assign(tslib_1.__assign({}, this), { model: this.model.schema.name });
    };
    return GroupCondition;
}());
exports.GroupCondition = GroupCondition;
/**
 * Creates a "seed" predicate that can be used to build an executable condition.
 * This is used in `query()`, for example, to seed customer- E.g.,
 *
 * ```
 * const p = predicateFor({builder: modelConstructor, schema: modelSchema, pkField: string[]});
 * p.and(child => [
 *   child.field.eq('whatever'),
 *   child.childModel.childField.eq('whatever else'),
 *   child.childModel.or(child => [
 *     child.otherField.contains('x'),
 *     child.otherField.contains('y'),
 *     child.otherField.contains('z'),
 *   ])
 * ])
 * ```
 *
 * `predicateFor()` returns objecst with recursive getters. To facilitate this,
 * a `query` and `tail` can be provided to "accumulate" nested conditions.
 *
 * TODO: the sortof-immutable algorithm was originally done to support legacy style
 * predicate branching (`p => p.x.eq(value).y.eq(value)`). i'm not sure this is
 * necessary or beneficial at this point, since we decided that each field condition
 * must flly terminate a branch. is the strong mutation barrier between chain links
 * still necessary or helpful?
 *
 * @param ModelType The ModelMeta used to build child properties.
 * @param field Scopes the query branch to a field.
 * @param query A base query to build on. Omit to start a new query.
 * @param tail The point in an existing `query` to attach new conditions to.
 * @returns A ModelPredicate (builder) that customers can create queries with.
 * (As shown in function description.)
 */
function recursivePredicateFor(ModelType, allowRecursion, field, query, tail) {
    if (allowRecursion === void 0) { allowRecursion = true; }
    // to be used if we don't have a base query or tail to build onto
    var starter = new GroupCondition(ModelType, field, undefined, 'and', []);
    var baseCondition = query && tail ? query : starter;
    var tailCondition = query && tail ? tail : starter;
    // our eventual return object, which can be built upon.
    // next steps will be to add or(), and(), not(), and field.op() methods.
    var link = {};
    // so it can be looked up later with in the internals when processing conditions.
    registerPredicateInternals(baseCondition, link);
    var copyLink = function () {
        var _a = tslib_1.__read(baseCondition.copy(tailCondition), 2), query = _a[0], newTail = _a[1];
        var newLink = recursivePredicateFor(ModelType, allowRecursion, undefined, query, newTail);
        return { query: query, newTail: newTail, newLink: newLink };
    };
    // Adds .or() and .and() methods to the link.
    // TODO: If revisiting this code, consider writing a Proxy instead.
    ['and', 'or'].forEach(function (op) {
        link[op] = function (builder) {
            // or() and and() will return a copy of the original link
            // to head off mutability concerns.
            var _a = copyLink(), query = _a.query, newTail = _a.newTail;
            var childConditions = builder(recursivePredicateFor(ModelType, allowRecursion));
            if (!Array.isArray(childConditions)) {
                throw new Error("Invalid predicate. `" + op + "` groups must return an array of child conditions.");
            }
            // the customer will supply a child predicate, which apply to the `model.field`
            // of the tail GroupCondition.
            newTail === null || newTail === void 0 ? void 0 : newTail.operands.push(new GroupCondition(ModelType, field, undefined, op, childConditions.map(function (c) { return exports.internals(c); })));
            // FinalPredicate
            return registerPredicateInternals(query);
        };
    });
    // TODO: If revisiting this code, consider proxy.
    link.not = function (builder) {
        // not() will return a copy of the original link
        // to head off mutability concerns.
        var _a = copyLink(), query = _a.query, newTail = _a.newTail;
        // unlike and() and or(), the customer will supply a "singular" child predicate.
        // the difference being: not() does not accept an array of predicate-like objects.
        // it negates only a *single* predicate subtree.
        newTail === null || newTail === void 0 ? void 0 : newTail.operands.push(new GroupCondition(ModelType, field, undefined, 'not', [
            exports.internals(builder(recursivePredicateFor(ModelType, allowRecursion))),
        ]));
        // A `FinalModelPredicate`.
        // Return a thing that can no longer be extended, but instead used to `async filter(items)`
        // or query storage: `.__query.fetch(storage)`.
        return registerPredicateInternals(query);
    };
    var _loop_1 = function (fieldName) {
        Object.defineProperty(link, fieldName, {
            enumerable: true,
            get: function () {
                var def = ModelType.schema.allFields[fieldName];
                if (!def.association) {
                    // we're looking at a value field. we need to return a
                    // "field matcher object", which contains all of the comparison
                    // functions ('eq', 'ne', 'gt', etc.), scoped to operate
                    // against the target field (fieldName).
                    return ops.reduce(function (fieldMatcher, operator) {
                        var _a;
                        return tslib_1.__assign(tslib_1.__assign({}, fieldMatcher), (_a = {}, _a[operator] = function () {
                            var operands = [];
                            for (var _i = 0; _i < arguments.length; _i++) {
                                operands[_i] = arguments[_i];
                            }
                            // build off a fresh copy of the existing `link`, just in case
                            // the same link is being used elsewhere by the customer.
                            var _a = copyLink(), query = _a.query, newTail = _a.newTail;
                            // normalize operands. if any of the values are `undefiend`, use
                            // `null` instead, because that's what will be stored cross-platform.
                            var normalizedOperands = operands.map(function (o) {
                                return o === undefined ? null : o;
                            });
                            // add the given condition to the link's TAIL node.
                            // remember: the base link might go N nodes deep! e.g.,
                            newTail === null || newTail === void 0 ? void 0 : newTail.operands.push(new FieldCondition(fieldName, operator, normalizedOperands));
                            // A `FinalModelPredicate`.
                            // Return a thing that can no longer be extended, but instead used to `async filter(items)`
                            // or query storage: `.__query.fetch(storage)`.
                            return registerPredicateInternals(query);
                        }, _a));
                    }, {});
                }
                else {
                    if (!allowRecursion) {
                        throw new Error('Predication on releated models is not supported in this context.');
                    }
                    else if (def.association.connectionType === 'BELONGS_TO' ||
                        def.association.connectionType === 'HAS_ONE' ||
                        def.association.connectionType === 'HAS_MANY') {
                        // the use has just typed '.someRelatedModel'. we need to given them
                        // back a predicate chain.
                        var relatedMeta = def.type.modelConstructor;
                        if (!relatedMeta) {
                            throw new Error('Related model metadata is missing. This is a bug! Please report it.');
                        }
                        // `Model.reletedModelField` returns a copy of the original link,
                        // and will contains copies of internal GroupConditions
                        // to head off mutability concerns.
                        var _a = tslib_1.__read(baseCondition.copy(tailCondition), 2), newquery = _a[0], oldtail = _a[1];
                        var newtail = new GroupCondition(relatedMeta, fieldName, def.association.connectionType, 'and', []);
                        // `oldtail` here refers to the *copy* of the old tail.
                        // so, it's safe to modify at this point. and we need to modify
                        // it to push the *new* tail onto the end of it.
                        oldtail.operands.push(newtail);
                        var newlink = recursivePredicateFor(relatedMeta, allowRecursion, undefined, newquery, newtail);
                        return newlink;
                    }
                    else {
                        throw new Error("Related model definition doesn't have a typedef. This is a bug! Please report it.");
                    }
                }
            },
        });
    };
    // For each field on the model schema, we want to add a getter
    // that creates the appropriate new `link` in the query chain.
    // TODO: If revisiting, consider a proxy.
    for (var fieldName in ModelType.schema.allFields) {
        _loop_1(fieldName);
    }
    return link;
}
exports.recursivePredicateFor = recursivePredicateFor;
function predicateFor(ModelType) {
    return recursivePredicateFor(ModelType, false);
}
exports.predicateFor = predicateFor;
//# sourceMappingURL=next.js.map