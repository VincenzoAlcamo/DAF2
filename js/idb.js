/*
ISC License (ISC)
Copyright (c) 2016, Jake Archibald <jaffathecake@gmail.com>

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
*/
/*
Module  : IndexedDB Promised
Author  : Jake Archibald <jaffathecake@gmail.com>
Version : 2.1.1
Source  : https://github.com/jakearchibald/idb
Notes   : Retrieved on 2018-04-15 and later modified by Vincenzo Alcamo
*/
let idb = (function() {
    'use strict';

    // This function can be called with one parameter (request) or three parameters
    function promisifyRequest(obj, method, args) {
        var request = arguments.length == 1 ? obj : null;
        var p = new Promise(function(resolve, reject) {
            // we call the method here, so the Promise constructor can catch an eventual exception
            request = request || obj[method].apply(obj, args);
            request.onsuccess = function() {
                resolve(request.result);
            };
            request.onerror = function() {
                reject(request.error);
            };
        });
        p.request = request;
        return p;
    }

    function proxify(ProxyClass, Constructor, options) {
        var prototype = Constructor.prototype;
        if (options.properties) options.properties.forEach(function(name) {
            Object.defineProperty(ProxyClass.prototype, name, {
                get: function() {
                    return this._native[name];
                },
                set: function(val) {
                    this._native[name] = val;
                }
            });
        });
        if (options.methods) options.methods.forEach(function(name) {
            if (name in prototype) ProxyClass.prototype[name] = function() {
                return this._native[name].apply(this._native, arguments);
            };
        });
        if (options.requestMethods) options.requestMethods.forEach(function(name) {
            if (name in prototype) ProxyClass.prototype[name] = function() {
                return promisifyRequest(this._native, name, arguments);
            };
        });
        if (options.cursorRequestMethods) options.cursorRequestMethods.forEach(function(name) {
            if (name in prototype) ProxyClass.prototype[name] = function() {
                return promisifyRequest(this._native, name, arguments).then(function(value) {
                    return value && new Cursor(value, p.request);
                });
            };
        });
    }

    function Index(index) {
        this._native = index;
    }

    proxify(Index, IDBIndex, {
        properties: ['name', 'keyPath', 'multiEntry', 'unique'],
        requestMethods: ['get', 'getKey', 'getAll', 'getAllKeys', 'count'],
        cursorRequestMethods: ['openCursor', 'openKeyCursor']
    });

    function Cursor(cursor, request) {
        this._native = cursor;
        this._request = request;
    }

    proxify(Cursor, IDBCursor, {
        properties: ['direction', 'key', 'primaryKey', 'value'],
        requestMethods: ['update', 'delete']
    });

    // proxy 'next' methods
    ['advance', 'continue', 'continuePrimaryKey'].forEach(function(name) {
        if (name in IDBCursor.prototype) Cursor.prototype[name] = function() {
            var cursor = this,
                args = arguments;
            return Promise.resolve().then(function() {
                cursor._native[name].apply(cursor._native, args);
                return promisifyRequest(cursor._request).then(function(value) {
                    return value && new Cursor(value, cursor._request);
                });
            });
        };
    });

    function ObjectStore(store) {
        this._native = store;
    }

    ObjectStore.prototype.createIndex = function() {
        return new Index(this._native.createIndex.apply(this._native, arguments));
    };

    ObjectStore.prototype.index = function() {
        return new Index(this._native.index.apply(this._native, arguments));
    };

    // Bulk add / put
    ['bulkAdd', 'bulkPut'].forEach(function(methodName) {
        var name = methodName.substr(4).toLowerCase();
        ObjectStore.prototype[methodName] = function(items) {
            var store = this._native;
            return new Promise(function(resolve, reject) {
                var array = Array.isArray(items) ? items : [items],
                    len = array.length,
                    fired = false,
                    count = 0,
                    success = function() {
                        count += 1;
                        if (count == len && !fired) {
                            fired = true;
                            resolve(this.result);
                        }
                    },
                    error = function() {
                        if (!fired) {
                            fired = true;
                            reject(this.error);
                        }
                    };
                for (var i = 0; i < len; i++) {
                    var request = store[name](array[i]);
                    request.onsuccess = success;
                    request.onerror = error;
                }
            });
        }
    });

    proxify(ObjectStore, IDBObjectStore, {
        properties: ['name', 'keyPath', 'indexNames', 'autoIncrement'],
        methods: ['deleteIndex'],
        requestMethods: ['put', 'add', 'delete', 'clear', 'get', 'getAll', 'getKey', 'getAllKeys', 'count'],
        cursorRequestMethods: ['openCursor', 'openKeyCursor']
    });

    function Transaction(idbTransaction) {
        this._native = idbTransaction;
        this.complete = new Promise(function(resolve, reject) {
            idbTransaction.oncomplete = function() {
                resolve();
            };
            idbTransaction.onerror = idbTransaction.onabort = function() {
                reject(idbTransaction.error);
            };
        });
    }

    Transaction.prototype.objectStore = function(name) {
        return new ObjectStore(this._native.objectStore.apply(this._native, arguments));
    };

    proxify(Transaction, IDBTransaction, {
        properties: ['objectStoreNames', 'mode'],
        methods: ['abort']
    });

    function DB(db) {
        this._native = db;
    }

    DB.prototype.transaction = function() {
        return new Transaction(this._native.transaction.apply(this._native, arguments));
    };

    proxify(DB, IDBDatabase, {
        properties: ['name', 'version', 'objectStoreNames'],
        methods: ['close']
    });

    function UpgradeDB(db, oldVersion, transaction) {
        this._native = db;
        this.oldVersion = oldVersion;
        this.transaction = new Transaction(transaction);
    }

    UpgradeDB.prototype.createObjectStore = function() {
        return new ObjectStore(this._native.createObjectStore.apply(this._native, arguments));
    };

    proxify(UpgradeDB, IDBDatabase, {
        properties: ['name', 'version', 'objectStoreNames'],
        methods: ['deleteObjectStore', 'close']
    });

    // Add cursor iterators
    // TODO: remove this once browsers do the right thing with promises
    ['openCursor', 'openKeyCursor'].forEach(function(funcName) {
        [ObjectStore, Index].forEach(function(Constructor) {
            Constructor.prototype[funcName.replace('open', 'iterate')] = function() {
                var args = Array.from(arguments);
                var callback = args[args.length - 1];
                var nativeObject = this._native;
                var request = nativeObject[funcName].apply(nativeObject, args.slice(0, -1));
                request.onsuccess = function() {
                    callback(request.result);
                };
            };
        });
    });

    return {
        open: function(name, version, upgradeCallback) {
            var p = promisifyRequest(indexedDB, 'open', [name, version]);
            p.request.onupgradeneeded = function(event) {
                if (upgradeCallback) {
                    upgradeCallback(new UpgradeDB(event.target.result, event.oldVersion, event.target.transaction));
                }
            };

            return p.then(function(db) {
                return new DB(db);
            });
        },
        delete: function(name) {
            return promisifyRequest(indexedDB, 'deleteDatabase', [name]);
        }
    };
}());