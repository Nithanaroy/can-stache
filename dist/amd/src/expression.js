/*can-stache@3.0.0-pre.16#src/expression*/
define(function (require, exports, module) {
    var Scope = require('can-view-scope');
    var compute = require('can-compute');
    var utils = require('./utils');
    var mustacheHelpers = require('../helpers/core');
    var each = require('can-util/js/each');
    var isEmptyObject = require('can-util/js/is-empty-object');
    var dev = require('can-util/js/dev');
    var assign = require('can-util/js/assign');
    var last = require('can-util/js/last');
    var getKeyComputeData = function (key, scope, readOptions) {
            var data = scope.computeData(key, readOptions);
            compute.temporarilyBind(data.compute);
            return data;
        }, lookupValue = function (key, scope, helperOptions, readOptions) {
            var computeData = getKeyComputeData(key, scope, readOptions);
            if (!computeData.compute.computeInstance.hasDependencies) {
                return {
                    value: computeData.initialValue,
                    computeData: computeData
                };
            } else {
                return {
                    value: computeData.compute,
                    computeData: computeData
                };
            }
        }, lookupValueOrHelper = function (key, scope, helperOptions, readOptions) {
            var res = lookupValue(key, scope, helperOptions, readOptions);
            if (res.computeData.initialValue === undefined) {
                if (key.charAt(0) === '@' && key !== '@index') {
                    key = key.substr(1);
                }
                var helper = mustacheHelpers.getHelper(key, helperOptions);
                res.helper = helper && helper.fn;
            }
            return res;
        }, convertToArgExpression = function (expr) {
            if (!(expr instanceof Arg) && !(expr instanceof Literal)) {
                return new Arg(expr);
            } else {
                return expr;
            }
        };
    var Bracket = function (key, root) {
        this.root = root;
        this.key = key;
    };
    Bracket.prototype.value = function (scope) {
        var prop = this.key;
        var obj = this.root;
        if (prop instanceof Literal) {
            prop = prop.value();
        } else if (prop instanceof Lookup) {
            prop = lookupValue(prop.key, scope, {}, {});
            prop = prop.value();
        } else {
            prop = prop.value(scope, {}, {})();
        }
        if (!obj) {
            return lookupValue(prop, scope, {}, {}).value;
        } else {
            return compute(function () {
                if (obj instanceof Lookup) {
                    obj = lookupValue(obj.key, scope, {}, {}).value();
                } else {
                    obj = obj.value(scope, {}, {})();
                }
                return obj[prop];
            });
        }
    };
    var Literal = function (value) {
        this._value = value;
    };
    Literal.prototype.value = function () {
        return this._value;
    };
    var Lookup = function (key, root) {
        this.key = key;
        this.rootExpr = root;
    };
    Lookup.prototype.value = function (scope, helperOptions) {
        var result = lookupValueOrHelper(this.key, scope, helperOptions);
        this.isHelper = result.helper && !result.helper.callAsMethod;
        return result.helper || result.value;
    };
    var ScopeLookup = function (key, root) {
        Lookup.apply(this, arguments);
    };
    ScopeLookup.prototype.value = function (scope, helperOptions) {
        return lookupValue(this.key, scope, helperOptions).value;
    };
    var Arg = function (expression, modifiers) {
        this.expr = expression;
        this.modifiers = modifiers || {};
        this.isCompute = false;
    };
    Arg.prototype.value = function () {
        return this.expr.value.apply(this.expr, arguments);
    };
    var Hash = function () {
    };
    var Hashes = function (hashes) {
        this.hashExprs = hashes;
    };
    Hashes.prototype.value = function (scope, helperOptions) {
        var hash = {};
        for (var prop in this.hashExprs) {
            var val = convertToArgExpression(this.hashExprs[prop]), value = val.value.apply(val, arguments);
            hash[prop] = {
                call: value && value.isComputed && !val.modifiers.compute,
                value: value
            };
        }
        return compute(function () {
            var finalHash = {};
            for (var prop in hash) {
                finalHash[prop] = hash[prop].call ? hash[prop].value() : hash[prop].value;
            }
            return finalHash;
        });
    };
    var Call = function (methodExpression, argExpressions) {
        this.methodExpr = methodExpression;
        this.argExprs = argExpressions.map(convertToArgExpression);
    };
    Call.prototype.args = function (scope, helperOptions) {
        var args = [];
        for (var i = 0, len = this.argExprs.length; i < len; i++) {
            var arg = this.argExprs[i];
            var value = arg.value.apply(arg, arguments);
            args.push({
                call: value && value.isComputed && !arg.modifiers.compute,
                value: value
            });
        }
        return function () {
            var finalArgs = [];
            for (var i = 0, len = args.length; i < len; i++) {
                finalArgs[i] = args[i].call ? args[i].value() : args[i].value;
            }
            return finalArgs;
        };
    };
    Call.prototype.value = function (scope, helperScope, helperOptions) {
        var method = this.methodExpr.value(scope, helperScope);
        var isHelper = this.isHelper = this.methodExpr.isHelper;
        var getArgs = this.args(scope, helperScope);
        return compute(function (newVal) {
            var func = method;
            if (func && func.isComputed) {
                func = func();
            }
            if (typeof func === 'function') {
                var args = getArgs();
                if (isHelper && helperOptions) {
                    args.push(helperOptions);
                }
                if (arguments.length) {
                    args.unshift(new expression.SetIdentifier(newVal));
                }
                return func.apply(null, args);
            }
        });
    };
    var HelperLookup = function () {
        Lookup.apply(this, arguments);
    };
    HelperLookup.prototype.value = function (scope, helperOptions) {
        var result = lookupValueOrHelper(this.key, scope, helperOptions, {
            isArgument: true,
            args: [
                scope.peak('.'),
                scope
            ]
        });
        return result.helper || result.value;
    };
    var HelperScopeLookup = function () {
        Lookup.apply(this, arguments);
    };
    HelperScopeLookup.prototype.value = function (scope, helperOptions) {
        return lookupValue(this.key, scope, helperOptions, {
            callMethodsOnObservables: true,
            isArgument: true,
            args: [
                scope.peak('.'),
                scope
            ]
        }).value;
    };
    var Helper = function (methodExpression, argExpressions, hashExpressions) {
        this.methodExpr = methodExpression;
        this.argExprs = argExpressions;
        this.hashExprs = hashExpressions;
        this.mode = null;
    };
    Helper.prototype.args = function (scope, helperOptions) {
        var args = [];
        for (var i = 0, len = this.argExprs.length; i < len; i++) {
            var arg = this.argExprs[i];
            args.push(arg.value.apply(arg, arguments));
        }
        return args;
    };
    Helper.prototype.hash = function (scope, helperOptions) {
        var hash = {};
        for (var prop in this.hashExprs) {
            var val = this.hashExprs[prop];
            hash[prop] = val.value.apply(val, arguments);
        }
        return hash;
    };
    Helper.prototype.helperAndValue = function (scope, helperOptions) {
        var looksLikeAHelper = this.argExprs.length || !isEmptyObject(this.hashExprs), helper, value, methodKey = this.methodExpr instanceof Literal ? '' + this.methodExpr._value : this.methodExpr.key, initialValue, args;
        if (looksLikeAHelper) {
            helper = mustacheHelpers.getHelper(methodKey, helperOptions);
            var context = scope.peak('.');
            if (!helper && typeof context[methodKey] === 'function') {
                helper = { fn: context[methodKey] };
            }
        }
        if (!helper) {
            args = this.args(scope, helperOptions);
            var computeData = getKeyComputeData(methodKey, scope, {
                    isArgument: false,
                    args: args && args.length ? args : [
                        scope.peak('.'),
                        scope
                    ]
                }), compute = computeData.compute;
            initialValue = computeData.initialValue;
            if (computeData.compute.computeInstance.hasDependencies) {
                value = compute;
            } else {
                value = initialValue;
            }
            if (!looksLikeAHelper && initialValue === undefined) {
                helper = mustacheHelpers.getHelper(methodKey, helperOptions);
            }
        }
        return {
            value: value,
            args: args,
            helper: helper && helper.fn
        };
    };
    Helper.prototype.evaluator = function (helper, scope, helperOptions, readOptions, nodeList, truthyRenderer, falseyRenderer, stringOnly) {
        var helperOptionArg = {
                fn: function () {
                },
                inverse: function () {
                },
                stringOnly: stringOnly
            }, context = scope.peak('.'), args = this.args(scope, helperOptions, nodeList, truthyRenderer, falseyRenderer, stringOnly), hash = this.hash(scope, helperOptions, nodeList, truthyRenderer, falseyRenderer, stringOnly);
        utils.convertToScopes(helperOptionArg, scope, helperOptions, nodeList, truthyRenderer, falseyRenderer, stringOnly);
        assign(helperOptionArg, {
            context: context,
            scope: scope,
            contexts: scope,
            hash: hash,
            nodeList: nodeList,
            exprData: this,
            helperOptions: helperOptions,
            helpers: helperOptions
        });
        args.push(helperOptionArg);
        return function () {
            return helper.apply(context, args);
        };
    };
    Helper.prototype.value = function (scope, helperOptions, nodeList, truthyRenderer, falseyRenderer, stringOnly) {
        var helperAndValue = this.helperAndValue(scope, helperOptions);
        var helper = helperAndValue.helper;
        if (!helper) {
            return helperAndValue.value;
        }
        var fn = this.evaluator(helper, scope, helperOptions, nodeList, truthyRenderer, falseyRenderer, stringOnly);
        var computeValue = compute(fn);
        compute.temporarilyBind(computeValue);
        if (!computeValue.computeInstance.hasDependencies) {
            return computeValue();
        } else {
            return computeValue;
        }
    };
    var keyRegExp = /[\w\.\\\-_@\/\&%]+/, tokensRegExp = /('.*?'|".*?"|=|[\w\.\\\-_@\/*%\$]+|[\(\)]|,|\~|\[|\])/g, literalRegExp = /^('.*?'|".*?"|[0-9]+\.?[0-9]*|true|false|null|undefined)$/;
    var isTokenKey = function (token) {
        return keyRegExp.test(token);
    };
    var testDot = /^[\.@]\w/;
    var isAddingToExpression = function (token) {
        return isTokenKey(token) && testDot.test(token);
    };
    var ensureChildren = function (type) {
        if (!type.children) {
            type.children = [];
        }
        return type;
    };
    var Stack = function () {
        this.root = {
            children: [],
            type: 'Root'
        };
        this.current = this.root;
        this.stack = [this.root];
    };
    assign(Stack.prototype, {
        top: function () {
            return last(this.stack);
        },
        isRootTop: function () {
            return this.top() === this.root;
        },
        popTo: function (types) {
            this.popUntil(types);
            if (!this.isRootTop()) {
                this.stack.pop();
            }
        },
        first: function (types) {
            var curIndex = this.stack.length - 1;
            while (curIndex > 0 && types.indexOf(this.stack[curIndex].type) === -1) {
                curIndex--;
            }
            return this.stack[curIndex];
        },
        firstParent: function (types) {
            var curIndex = this.stack.length - 2;
            while (curIndex > 0 && types.indexOf(this.stack[curIndex].type) === -1) {
                curIndex--;
            }
            return this.stack[curIndex];
        },
        popUntil: function (types) {
            while (types.indexOf(this.top().type) === -1 && !this.isRootTop()) {
                this.stack.pop();
            }
            return this.top();
        },
        addTo: function (types, type) {
            var cur = this.popUntil(types);
            ensureChildren(cur).children.push(type);
        },
        addToAndPush: function (types, type) {
            this.addTo(types, type);
            this.stack.push(type);
        },
        push: function (type) {
            this.stack.push(type);
        },
        topLastChild: function () {
            return last(this.top().children);
        },
        replaceTopLastChild: function (type) {
            var children = ensureChildren(this.top()).children;
            children.pop();
            children.push(type);
            return type;
        },
        replaceTopLastChildAndPush: function (type) {
            this.replaceTopLastChild(type);
            this.stack.push(type);
        },
        replaceTopAndPush: function (type) {
            var children;
            if (this.top() === this.root) {
                children = ensureChildren(this.top()).children;
            } else {
                this.stack.pop();
                children = ensureChildren(this.top()).children;
            }
            children.pop();
            children.push(type);
            this.stack.push(type);
            return type;
        }
    });
    var convertKeyToLookup = function (key) {
        var lastPath = key.lastIndexOf('./');
        var lastDot = key.lastIndexOf('.');
        if (lastDot > lastPath) {
            return key.substr(0, lastDot) + '@' + key.substr(lastDot + 1);
        }
        var firstNonPathCharIndex = lastPath === -1 ? 0 : lastPath + 2;
        var firstNonPathChar = key.charAt(firstNonPathCharIndex);
        if (firstNonPathChar === '.' || firstNonPathChar === '@') {
            return key.substr(0, firstNonPathCharIndex) + '@' + key.substr(firstNonPathCharIndex + 1);
        } else {
            return key.substr(0, firstNonPathCharIndex) + '@' + key.substr(firstNonPathCharIndex);
        }
    };
    var convertToAtLookup = function (ast) {
        if (ast.type === 'Lookup') {
            ast.key = convertKeyToLookup(ast.key);
        }
        return ast;
    };
    var convertToHelperIfTopIsLookup = function (stack) {
        var top = stack.top();
        if (top && top.type === 'Lookup') {
            var base = stack.stack[stack.stack.length - 2];
            if (base.type !== 'Helper' && base) {
                stack.replaceTopAndPush({
                    type: 'Helper',
                    method: top
                });
            }
        }
    };
    var expression = {
        convertKeyToLookup: convertKeyToLookup,
        Literal: Literal,
        Lookup: Lookup,
        ScopeLookup: ScopeLookup,
        Arg: Arg,
        Hash: Hash,
        Hashes: Hashes,
        Call: Call,
        Helper: Helper,
        HelperLookup: HelperLookup,
        HelperScopeLookup: HelperScopeLookup,
        Bracket: Bracket,
        SetIdentifier: function (value) {
            this.value = value;
        },
        tokenize: function (expression) {
            var tokens = [];
            (expression.trim() + ' ').replace(tokensRegExp, function (whole, arg) {
                tokens.push(arg);
            });
            return tokens;
        },
        lookupRules: {
            'default': function (ast, methodType, isArg) {
                var name = (methodType === 'Helper' && !ast.root ? 'Helper' : '') + (isArg ? 'Scope' : '') + 'Lookup';
                return expression[name];
            },
            'method': function (ast, methodType, isArg) {
                return ScopeLookup;
            }
        },
        methodRules: {
            'default': function (ast) {
                return ast.type === 'Call' ? Call : Helper;
            },
            'call': function (ast) {
                return Call;
            }
        },
        parse: function (expressionString, options) {
            options = options || {};
            var ast = this.ast(expressionString);
            if (!options.lookupRule) {
                options.lookupRule = 'default';
            }
            if (typeof options.lookupRule === 'string') {
                options.lookupRule = expression.lookupRules[options.lookupRule];
            }
            if (!options.methodRule) {
                options.methodRule = 'default';
            }
            if (typeof options.methodRule === 'string') {
                options.methodRule = expression.methodRules[options.methodRule];
            }
            var expr = this.hydrateAst(ast, options, options.baseMethodType || 'Helper');
            return expr;
        },
        hydrateAst: function (ast, options, methodType, isArg) {
            if (ast.type === 'Lookup') {
                return new (options.lookupRule(ast, methodType, isArg))(ast.key, ast.root && this.hydrateAst(ast.root, options, methodType));
            } else if (ast.type === 'Literal') {
                return new Literal(ast.value);
            } else if (ast.type === 'Arg') {
                return new Arg(this.hydrateAst(ast.children[0], options, methodType, isArg), { compute: true });
            } else if (ast.type === 'Hash') {
                throw new Error('');
            } else if (ast.type === 'Hashes') {
                var hashes = {};
                each(ast.children, function (hash) {
                    hashes[hash.prop] = this.hydrateAst(hash.children[0], options, methodType, true);
                }, this);
                return new Hashes(hashes);
            } else if (ast.type === 'Call' || ast.type === 'Helper') {
                var hashes = {}, args = [], children = ast.children, ExpressionType = options.methodRule(ast);
                if (children) {
                    for (var i = 0; i < children.length; i++) {
                        var child = children[i];
                        if (child.type === 'Hashes' && ast.type === 'Helper' && !(ExpressionType === Call)) {
                            each(child.children, function (hash) {
                                hashes[hash.prop] = this.hydrateAst(hash.children[0], options, ast.type, true);
                            }, this);
                        } else {
                            args.push(this.hydrateAst(child, options, ast.type, true));
                        }
                    }
                }
                return new ExpressionType(this.hydrateAst(ast.method, options, ast.type), args, hashes);
            } else if (ast.type === 'Bracket') {
                return new Bracket(this.hydrateAst(ast.children[0], options), ast.root ? this.hydrateAst(ast.root, options) : undefined);
            }
        },
        ast: function (expression) {
            var tokens = this.tokenize(expression);
            return this.parseAst(tokens, { index: 0 });
        },
        parseAst: function (tokens, cursor) {
            var stack = new Stack(), top;
            while (cursor.index < tokens.length) {
                var token = tokens[cursor.index], nextToken = tokens[cursor.index + 1];
                cursor.index++;
                if (literalRegExp.test(token)) {
                    convertToHelperIfTopIsLookup(stack);
                    var firstParent = stack.first([
                        'Helper',
                        'Call',
                        'Hash',
                        'Bracket'
                    ]);
                    if (firstParent.type === 'Hash' && (firstParent.children && firstParent.children.length > 0)) {
                        stack.addTo([
                            'Helper',
                            'Call',
                            'Bracket'
                        ], {
                            type: 'Literal',
                            value: utils.jsonParse(token)
                        });
                    } else {
                        stack.addTo([
                            'Helper',
                            'Call',
                            'Hash',
                            'Bracket'
                        ], {
                            type: 'Literal',
                            value: utils.jsonParse(token)
                        });
                    }
                } else if (nextToken === '=') {
                    top = stack.top();
                    if (top && top.type === 'Lookup') {
                        var firstParent = stack.firstParent([
                            'Call',
                            'Helper',
                            'Hash'
                        ]);
                        if (firstParent.type === 'Call' || firstParent.type === 'Root') {
                            stack.popUntil(['Call']);
                            top = stack.top();
                            stack.replaceTopAndPush({
                                type: 'Helper',
                                method: top.type === 'Root' ? last(top.children) : top
                            });
                        }
                    }
                    var firstParent = stack.firstParent([
                        'Call',
                        'Helper',
                        'Hashes'
                    ]);
                    var hash = {
                        type: 'Hash',
                        prop: token
                    };
                    if (firstParent.type === 'Hashes') {
                        stack.addToAndPush(['Hashes'], hash);
                    } else {
                        var hash;
                        stack.addToAndPush([
                            'Helper',
                            'Call'
                        ], {
                            type: 'Hashes',
                            children: [hash]
                        });
                        stack.push(hash);
                    }
                    cursor.index++;
                } else if (keyRegExp.test(token)) {
                    var lastToken = stack.topLastChild();
                    if (lastToken && lastToken.type === 'Call' && isAddingToExpression(token)) {
                        stack.replaceTopLastChildAndPush({
                            type: 'Lookup',
                            root: lastToken,
                            key: token
                        });
                    } else {
                        convertToHelperIfTopIsLookup(stack);
                        stack.addToAndPush([
                            'Helper',
                            'Call',
                            'Hash',
                            'Arg',
                            'Bracket'
                        ], {
                            type: 'Lookup',
                            key: token
                        });
                    }
                } else if (token === '~') {
                    convertToHelperIfTopIsLookup(stack);
                    stack.addToAndPush([
                        'Helper',
                        'Call',
                        'Hash'
                    ], {
                        type: 'Arg',
                        key: token
                    });
                } else if (token === '(') {
                    top = stack.top();
                    if (top.type === 'Lookup') {
                        stack.replaceTopAndPush({
                            type: 'Call',
                            method: convertToAtLookup(top)
                        });
                    } else {
                        throw new Error('Unable to understand expression ' + tokens.join(''));
                    }
                } else if (token === ')') {
                    stack.popTo(['Call']);
                } else if (token === ',') {
                    stack.popUntil(['Call']);
                } else if (token === '[') {
                    top = stack.top();
                    lastToken = stack.topLastChild();
                    if (lastToken && lastToken.type === 'Call') {
                        stack.replaceTopAndPush({
                            type: 'Bracket',
                            root: lastToken
                        });
                    } else if (top.type === 'Lookup') {
                        stack.replaceTopAndPush({
                            type: 'Bracket',
                            root: top
                        });
                    } else {
                        stack.replaceTopAndPush({ type: 'Bracket' });
                    }
                }
            }
            return stack.root.children[0];
        }
    };
    module.exports = expression;
});