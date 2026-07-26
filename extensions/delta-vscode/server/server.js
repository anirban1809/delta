"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/vscode-languageserver/lib/common/utils/is.js
var require_is = __commonJS({
  "node_modules/vscode-languageserver/lib/common/utils/is.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.thenable = exports2.typedArray = exports2.stringArray = exports2.array = exports2.func = exports2.error = exports2.number = exports2.string = exports2.boolean = void 0;
    function boolean(value) {
      return value === true || value === false;
    }
    exports2.boolean = boolean;
    function string2(value) {
      return typeof value === "string" || value instanceof String;
    }
    exports2.string = string2;
    function number(value) {
      return typeof value === "number" || value instanceof Number;
    }
    exports2.number = number;
    function error(value) {
      return value instanceof Error;
    }
    exports2.error = error;
    function func(value) {
      return typeof value === "function";
    }
    exports2.func = func;
    function array(value) {
      return Array.isArray(value);
    }
    exports2.array = array;
    function stringArray(value) {
      return array(value) && value.every((elem) => string2(elem));
    }
    exports2.stringArray = stringArray;
    function typedArray(value, check) {
      return Array.isArray(value) && value.every(check);
    }
    exports2.typedArray = typedArray;
    function thenable(value) {
      return value && func(value.then);
    }
    exports2.thenable = thenable;
  }
});

// node_modules/vscode-jsonrpc/lib/common/is.js
var require_is2 = __commonJS({
  "node_modules/vscode-jsonrpc/lib/common/is.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.stringArray = exports2.array = exports2.func = exports2.error = exports2.number = exports2.string = exports2.boolean = void 0;
    function boolean(value) {
      return value === true || value === false;
    }
    exports2.boolean = boolean;
    function string2(value) {
      return typeof value === "string" || value instanceof String;
    }
    exports2.string = string2;
    function number(value) {
      return typeof value === "number" || value instanceof Number;
    }
    exports2.number = number;
    function error(value) {
      return value instanceof Error;
    }
    exports2.error = error;
    function func(value) {
      return typeof value === "function";
    }
    exports2.func = func;
    function array(value) {
      return Array.isArray(value);
    }
    exports2.array = array;
    function stringArray(value) {
      return array(value) && value.every((elem) => string2(elem));
    }
    exports2.stringArray = stringArray;
  }
});

// node_modules/vscode-jsonrpc/lib/common/messages.js
var require_messages = __commonJS({
  "node_modules/vscode-jsonrpc/lib/common/messages.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Message = exports2.NotificationType9 = exports2.NotificationType8 = exports2.NotificationType7 = exports2.NotificationType6 = exports2.NotificationType5 = exports2.NotificationType4 = exports2.NotificationType3 = exports2.NotificationType2 = exports2.NotificationType1 = exports2.NotificationType0 = exports2.NotificationType = exports2.RequestType9 = exports2.RequestType8 = exports2.RequestType7 = exports2.RequestType6 = exports2.RequestType5 = exports2.RequestType4 = exports2.RequestType3 = exports2.RequestType2 = exports2.RequestType1 = exports2.RequestType = exports2.RequestType0 = exports2.AbstractMessageSignature = exports2.ParameterStructures = exports2.ResponseError = exports2.ErrorCodes = void 0;
    var is = require_is2();
    var ErrorCodes;
    (function(ErrorCodes2) {
      ErrorCodes2.ParseError = -32700;
      ErrorCodes2.InvalidRequest = -32600;
      ErrorCodes2.MethodNotFound = -32601;
      ErrorCodes2.InvalidParams = -32602;
      ErrorCodes2.InternalError = -32603;
      ErrorCodes2.jsonrpcReservedErrorRangeStart = -32099;
      ErrorCodes2.serverErrorStart = -32099;
      ErrorCodes2.MessageWriteError = -32099;
      ErrorCodes2.MessageReadError = -32098;
      ErrorCodes2.PendingResponseRejected = -32097;
      ErrorCodes2.ConnectionInactive = -32096;
      ErrorCodes2.ServerNotInitialized = -32002;
      ErrorCodes2.UnknownErrorCode = -32001;
      ErrorCodes2.jsonrpcReservedErrorRangeEnd = -32e3;
      ErrorCodes2.serverErrorEnd = -32e3;
    })(ErrorCodes || (exports2.ErrorCodes = ErrorCodes = {}));
    var ResponseError = class _ResponseError extends Error {
      constructor(code, message, data) {
        super(message);
        this.code = is.number(code) ? code : ErrorCodes.UnknownErrorCode;
        this.data = data;
        Object.setPrototypeOf(this, _ResponseError.prototype);
      }
      toJson() {
        const result = {
          code: this.code,
          message: this.message
        };
        if (this.data !== void 0) {
          result.data = this.data;
        }
        return result;
      }
    };
    exports2.ResponseError = ResponseError;
    var ParameterStructures = class _ParameterStructures {
      constructor(kind) {
        this.kind = kind;
      }
      static is(value) {
        return value === _ParameterStructures.auto || value === _ParameterStructures.byName || value === _ParameterStructures.byPosition;
      }
      toString() {
        return this.kind;
      }
    };
    exports2.ParameterStructures = ParameterStructures;
    ParameterStructures.auto = new ParameterStructures("auto");
    ParameterStructures.byPosition = new ParameterStructures("byPosition");
    ParameterStructures.byName = new ParameterStructures("byName");
    var AbstractMessageSignature = class {
      constructor(method, numberOfParams) {
        this.method = method;
        this.numberOfParams = numberOfParams;
      }
      get parameterStructures() {
        return ParameterStructures.auto;
      }
    };
    exports2.AbstractMessageSignature = AbstractMessageSignature;
    var RequestType0 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 0);
      }
    };
    exports2.RequestType0 = RequestType0;
    var RequestType = class extends AbstractMessageSignature {
      constructor(method, _parameterStructures = ParameterStructures.auto) {
        super(method, 1);
        this._parameterStructures = _parameterStructures;
      }
      get parameterStructures() {
        return this._parameterStructures;
      }
    };
    exports2.RequestType = RequestType;
    var RequestType1 = class extends AbstractMessageSignature {
      constructor(method, _parameterStructures = ParameterStructures.auto) {
        super(method, 1);
        this._parameterStructures = _parameterStructures;
      }
      get parameterStructures() {
        return this._parameterStructures;
      }
    };
    exports2.RequestType1 = RequestType1;
    var RequestType2 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 2);
      }
    };
    exports2.RequestType2 = RequestType2;
    var RequestType3 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 3);
      }
    };
    exports2.RequestType3 = RequestType3;
    var RequestType4 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 4);
      }
    };
    exports2.RequestType4 = RequestType4;
    var RequestType5 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 5);
      }
    };
    exports2.RequestType5 = RequestType5;
    var RequestType6 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 6);
      }
    };
    exports2.RequestType6 = RequestType6;
    var RequestType7 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 7);
      }
    };
    exports2.RequestType7 = RequestType7;
    var RequestType8 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 8);
      }
    };
    exports2.RequestType8 = RequestType8;
    var RequestType9 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 9);
      }
    };
    exports2.RequestType9 = RequestType9;
    var NotificationType = class extends AbstractMessageSignature {
      constructor(method, _parameterStructures = ParameterStructures.auto) {
        super(method, 1);
        this._parameterStructures = _parameterStructures;
      }
      get parameterStructures() {
        return this._parameterStructures;
      }
    };
    exports2.NotificationType = NotificationType;
    var NotificationType0 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 0);
      }
    };
    exports2.NotificationType0 = NotificationType0;
    var NotificationType1 = class extends AbstractMessageSignature {
      constructor(method, _parameterStructures = ParameterStructures.auto) {
        super(method, 1);
        this._parameterStructures = _parameterStructures;
      }
      get parameterStructures() {
        return this._parameterStructures;
      }
    };
    exports2.NotificationType1 = NotificationType1;
    var NotificationType2 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 2);
      }
    };
    exports2.NotificationType2 = NotificationType2;
    var NotificationType3 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 3);
      }
    };
    exports2.NotificationType3 = NotificationType3;
    var NotificationType4 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 4);
      }
    };
    exports2.NotificationType4 = NotificationType4;
    var NotificationType5 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 5);
      }
    };
    exports2.NotificationType5 = NotificationType5;
    var NotificationType6 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 6);
      }
    };
    exports2.NotificationType6 = NotificationType6;
    var NotificationType7 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 7);
      }
    };
    exports2.NotificationType7 = NotificationType7;
    var NotificationType8 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 8);
      }
    };
    exports2.NotificationType8 = NotificationType8;
    var NotificationType9 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 9);
      }
    };
    exports2.NotificationType9 = NotificationType9;
    var Message;
    (function(Message2) {
      function isRequest(message) {
        const candidate = message;
        return candidate && is.string(candidate.method) && (is.string(candidate.id) || is.number(candidate.id));
      }
      Message2.isRequest = isRequest;
      function isNotification(message) {
        const candidate = message;
        return candidate && is.string(candidate.method) && message.id === void 0;
      }
      Message2.isNotification = isNotification;
      function isResponse(message) {
        const candidate = message;
        return candidate && (candidate.result !== void 0 || !!candidate.error) && (is.string(candidate.id) || is.number(candidate.id) || candidate.id === null);
      }
      Message2.isResponse = isResponse;
    })(Message || (exports2.Message = Message = {}));
  }
});

// node_modules/vscode-jsonrpc/lib/common/linkedMap.js
var require_linkedMap = __commonJS({
  "node_modules/vscode-jsonrpc/lib/common/linkedMap.js"(exports2) {
    "use strict";
    var _a;
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.LRUCache = exports2.LinkedMap = exports2.Touch = void 0;
    var Touch;
    (function(Touch2) {
      Touch2.None = 0;
      Touch2.First = 1;
      Touch2.AsOld = Touch2.First;
      Touch2.Last = 2;
      Touch2.AsNew = Touch2.Last;
    })(Touch || (exports2.Touch = Touch = {}));
    var LinkedMap = class {
      constructor() {
        this[_a] = "LinkedMap";
        this._map = /* @__PURE__ */ new Map();
        this._head = void 0;
        this._tail = void 0;
        this._size = 0;
        this._state = 0;
      }
      clear() {
        this._map.clear();
        this._head = void 0;
        this._tail = void 0;
        this._size = 0;
        this._state++;
      }
      isEmpty() {
        return !this._head && !this._tail;
      }
      get size() {
        return this._size;
      }
      get first() {
        return this._head?.value;
      }
      get last() {
        return this._tail?.value;
      }
      has(key) {
        return this._map.has(key);
      }
      get(key, touch = Touch.None) {
        const item = this._map.get(key);
        if (!item) {
          return void 0;
        }
        if (touch !== Touch.None) {
          this.touch(item, touch);
        }
        return item.value;
      }
      set(key, value, touch = Touch.None) {
        let item = this._map.get(key);
        if (item) {
          item.value = value;
          if (touch !== Touch.None) {
            this.touch(item, touch);
          }
        } else {
          item = { key, value, next: void 0, previous: void 0 };
          switch (touch) {
            case Touch.None:
              this.addItemLast(item);
              break;
            case Touch.First:
              this.addItemFirst(item);
              break;
            case Touch.Last:
              this.addItemLast(item);
              break;
            default:
              this.addItemLast(item);
              break;
          }
          this._map.set(key, item);
          this._size++;
        }
        return this;
      }
      delete(key) {
        return !!this.remove(key);
      }
      remove(key) {
        const item = this._map.get(key);
        if (!item) {
          return void 0;
        }
        this._map.delete(key);
        this.removeItem(item);
        this._size--;
        return item.value;
      }
      shift() {
        if (!this._head && !this._tail) {
          return void 0;
        }
        if (!this._head || !this._tail) {
          throw new Error("Invalid list");
        }
        const item = this._head;
        this._map.delete(item.key);
        this.removeItem(item);
        this._size--;
        return item.value;
      }
      forEach(callbackfn, thisArg) {
        const state2 = this._state;
        let current = this._head;
        while (current) {
          if (thisArg) {
            callbackfn.bind(thisArg)(current.value, current.key, this);
          } else {
            callbackfn(current.value, current.key, this);
          }
          if (this._state !== state2) {
            throw new Error(`LinkedMap got modified during iteration.`);
          }
          current = current.next;
        }
      }
      keys() {
        const state2 = this._state;
        let current = this._head;
        const iterator = {
          [Symbol.iterator]: () => {
            return iterator;
          },
          next: () => {
            if (this._state !== state2) {
              throw new Error(`LinkedMap got modified during iteration.`);
            }
            if (current) {
              const result = { value: current.key, done: false };
              current = current.next;
              return result;
            } else {
              return { value: void 0, done: true };
            }
          }
        };
        return iterator;
      }
      values() {
        const state2 = this._state;
        let current = this._head;
        const iterator = {
          [Symbol.iterator]: () => {
            return iterator;
          },
          next: () => {
            if (this._state !== state2) {
              throw new Error(`LinkedMap got modified during iteration.`);
            }
            if (current) {
              const result = { value: current.value, done: false };
              current = current.next;
              return result;
            } else {
              return { value: void 0, done: true };
            }
          }
        };
        return iterator;
      }
      entries() {
        const state2 = this._state;
        let current = this._head;
        const iterator = {
          [Symbol.iterator]: () => {
            return iterator;
          },
          next: () => {
            if (this._state !== state2) {
              throw new Error(`LinkedMap got modified during iteration.`);
            }
            if (current) {
              const result = { value: [current.key, current.value], done: false };
              current = current.next;
              return result;
            } else {
              return { value: void 0, done: true };
            }
          }
        };
        return iterator;
      }
      [(_a = Symbol.toStringTag, Symbol.iterator)]() {
        return this.entries();
      }
      trimOld(newSize) {
        if (newSize >= this.size) {
          return;
        }
        if (newSize === 0) {
          this.clear();
          return;
        }
        let current = this._head;
        let currentSize = this.size;
        while (current && currentSize > newSize) {
          this._map.delete(current.key);
          current = current.next;
          currentSize--;
        }
        this._head = current;
        this._size = currentSize;
        if (current) {
          current.previous = void 0;
        }
        this._state++;
      }
      addItemFirst(item) {
        if (!this._head && !this._tail) {
          this._tail = item;
        } else if (!this._head) {
          throw new Error("Invalid list");
        } else {
          item.next = this._head;
          this._head.previous = item;
        }
        this._head = item;
        this._state++;
      }
      addItemLast(item) {
        if (!this._head && !this._tail) {
          this._head = item;
        } else if (!this._tail) {
          throw new Error("Invalid list");
        } else {
          item.previous = this._tail;
          this._tail.next = item;
        }
        this._tail = item;
        this._state++;
      }
      removeItem(item) {
        if (item === this._head && item === this._tail) {
          this._head = void 0;
          this._tail = void 0;
        } else if (item === this._head) {
          if (!item.next) {
            throw new Error("Invalid list");
          }
          item.next.previous = void 0;
          this._head = item.next;
        } else if (item === this._tail) {
          if (!item.previous) {
            throw new Error("Invalid list");
          }
          item.previous.next = void 0;
          this._tail = item.previous;
        } else {
          const next2 = item.next;
          const previous2 = item.previous;
          if (!next2 || !previous2) {
            throw new Error("Invalid list");
          }
          next2.previous = previous2;
          previous2.next = next2;
        }
        item.next = void 0;
        item.previous = void 0;
        this._state++;
      }
      touch(item, touch) {
        if (!this._head || !this._tail) {
          throw new Error("Invalid list");
        }
        if (touch !== Touch.First && touch !== Touch.Last) {
          return;
        }
        if (touch === Touch.First) {
          if (item === this._head) {
            return;
          }
          const next2 = item.next;
          const previous2 = item.previous;
          if (item === this._tail) {
            previous2.next = void 0;
            this._tail = previous2;
          } else {
            next2.previous = previous2;
            previous2.next = next2;
          }
          item.previous = void 0;
          item.next = this._head;
          this._head.previous = item;
          this._head = item;
          this._state++;
        } else if (touch === Touch.Last) {
          if (item === this._tail) {
            return;
          }
          const next2 = item.next;
          const previous2 = item.previous;
          if (item === this._head) {
            next2.previous = void 0;
            this._head = next2;
          } else {
            next2.previous = previous2;
            previous2.next = next2;
          }
          item.next = void 0;
          item.previous = this._tail;
          this._tail.next = item;
          this._tail = item;
          this._state++;
        }
      }
      toJSON() {
        const data = [];
        this.forEach((value, key) => {
          data.push([key, value]);
        });
        return data;
      }
      fromJSON(data) {
        this.clear();
        for (const [key, value] of data) {
          this.set(key, value);
        }
      }
    };
    exports2.LinkedMap = LinkedMap;
    var LRUCache = class extends LinkedMap {
      constructor(limit, ratio = 1) {
        super();
        this._limit = limit;
        this._ratio = Math.min(Math.max(0, ratio), 1);
      }
      get limit() {
        return this._limit;
      }
      set limit(limit) {
        this._limit = limit;
        this.checkTrim();
      }
      get ratio() {
        return this._ratio;
      }
      set ratio(ratio) {
        this._ratio = Math.min(Math.max(0, ratio), 1);
        this.checkTrim();
      }
      get(key, touch = Touch.AsNew) {
        return super.get(key, touch);
      }
      peek(key) {
        return super.get(key, Touch.None);
      }
      set(key, value) {
        super.set(key, value, Touch.Last);
        this.checkTrim();
        return this;
      }
      checkTrim() {
        if (this.size > this._limit) {
          this.trimOld(Math.round(this._limit * this._ratio));
        }
      }
    };
    exports2.LRUCache = LRUCache;
  }
});

// node_modules/vscode-jsonrpc/lib/common/disposable.js
var require_disposable = __commonJS({
  "node_modules/vscode-jsonrpc/lib/common/disposable.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Disposable = void 0;
    var Disposable;
    (function(Disposable2) {
      function create(func) {
        return {
          dispose: func
        };
      }
      Disposable2.create = create;
    })(Disposable || (exports2.Disposable = Disposable = {}));
  }
});

// node_modules/vscode-jsonrpc/lib/common/ral.js
var require_ral = __commonJS({
  "node_modules/vscode-jsonrpc/lib/common/ral.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var _ral;
    function RAL() {
      if (_ral === void 0) {
        throw new Error(`No runtime abstraction layer installed`);
      }
      return _ral;
    }
    (function(RAL2) {
      function install(ral) {
        if (ral === void 0) {
          throw new Error(`No runtime abstraction layer provided`);
        }
        _ral = ral;
      }
      RAL2.install = install;
    })(RAL || (RAL = {}));
    exports2.default = RAL;
  }
});

// node_modules/vscode-jsonrpc/lib/common/events.js
var require_events = __commonJS({
  "node_modules/vscode-jsonrpc/lib/common/events.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Emitter = exports2.Event = void 0;
    var ral_1 = require_ral();
    var Event;
    (function(Event2) {
      const _disposable = { dispose() {
      } };
      Event2.None = function() {
        return _disposable;
      };
    })(Event || (exports2.Event = Event = {}));
    var CallbackList = class {
      add(callback, context = null, bucket) {
        if (!this._callbacks) {
          this._callbacks = [];
          this._contexts = [];
        }
        this._callbacks.push(callback);
        this._contexts.push(context);
        if (Array.isArray(bucket)) {
          bucket.push({ dispose: () => this.remove(callback, context) });
        }
      }
      remove(callback, context = null) {
        if (!this._callbacks) {
          return;
        }
        let foundCallbackWithDifferentContext = false;
        for (let i = 0, len = this._callbacks.length; i < len; i++) {
          if (this._callbacks[i] === callback) {
            if (this._contexts[i] === context) {
              this._callbacks.splice(i, 1);
              this._contexts.splice(i, 1);
              return;
            } else {
              foundCallbackWithDifferentContext = true;
            }
          }
        }
        if (foundCallbackWithDifferentContext) {
          throw new Error("When adding a listener with a context, you should remove it with the same context");
        }
      }
      invoke(...args) {
        if (!this._callbacks) {
          return [];
        }
        const ret = [], callbacks = this._callbacks.slice(0), contexts = this._contexts.slice(0);
        for (let i = 0, len = callbacks.length; i < len; i++) {
          try {
            ret.push(callbacks[i].apply(contexts[i], args));
          } catch (e) {
            (0, ral_1.default)().console.error(e);
          }
        }
        return ret;
      }
      isEmpty() {
        return !this._callbacks || this._callbacks.length === 0;
      }
      dispose() {
        this._callbacks = void 0;
        this._contexts = void 0;
      }
    };
    var Emitter = class _Emitter {
      constructor(_options) {
        this._options = _options;
      }
      /**
       * For the public to allow to subscribe
       * to events from this Emitter
       */
      get event() {
        if (!this._event) {
          this._event = (listener, thisArgs, disposables) => {
            if (!this._callbacks) {
              this._callbacks = new CallbackList();
            }
            if (this._options && this._options.onFirstListenerAdd && this._callbacks.isEmpty()) {
              this._options.onFirstListenerAdd(this);
            }
            this._callbacks.add(listener, thisArgs);
            const result = {
              dispose: () => {
                if (!this._callbacks) {
                  return;
                }
                this._callbacks.remove(listener, thisArgs);
                result.dispose = _Emitter._noop;
                if (this._options && this._options.onLastListenerRemove && this._callbacks.isEmpty()) {
                  this._options.onLastListenerRemove(this);
                }
              }
            };
            if (Array.isArray(disposables)) {
              disposables.push(result);
            }
            return result;
          };
        }
        return this._event;
      }
      /**
       * To be kept private to fire an event to
       * subscribers
       */
      fire(event) {
        if (this._callbacks) {
          this._callbacks.invoke.call(this._callbacks, event);
        }
      }
      dispose() {
        if (this._callbacks) {
          this._callbacks.dispose();
          this._callbacks = void 0;
        }
      }
    };
    exports2.Emitter = Emitter;
    Emitter._noop = function() {
    };
  }
});

// node_modules/vscode-jsonrpc/lib/common/cancellation.js
var require_cancellation = __commonJS({
  "node_modules/vscode-jsonrpc/lib/common/cancellation.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.CancellationTokenSource = exports2.CancellationToken = void 0;
    var ral_1 = require_ral();
    var Is = require_is2();
    var events_1 = require_events();
    var CancellationToken;
    (function(CancellationToken2) {
      CancellationToken2.None = Object.freeze({
        isCancellationRequested: false,
        onCancellationRequested: events_1.Event.None
      });
      CancellationToken2.Cancelled = Object.freeze({
        isCancellationRequested: true,
        onCancellationRequested: events_1.Event.None
      });
      function is(value) {
        const candidate = value;
        return candidate && (candidate === CancellationToken2.None || candidate === CancellationToken2.Cancelled || Is.boolean(candidate.isCancellationRequested) && !!candidate.onCancellationRequested);
      }
      CancellationToken2.is = is;
    })(CancellationToken || (exports2.CancellationToken = CancellationToken = {}));
    var shortcutEvent = Object.freeze(function(callback, context) {
      const handle = (0, ral_1.default)().timer.setTimeout(callback.bind(context), 0);
      return { dispose() {
        handle.dispose();
      } };
    });
    var MutableToken = class {
      constructor() {
        this._isCancelled = false;
      }
      cancel() {
        if (!this._isCancelled) {
          this._isCancelled = true;
          if (this._emitter) {
            this._emitter.fire(void 0);
            this.dispose();
          }
        }
      }
      get isCancellationRequested() {
        return this._isCancelled;
      }
      get onCancellationRequested() {
        if (this._isCancelled) {
          return shortcutEvent;
        }
        if (!this._emitter) {
          this._emitter = new events_1.Emitter();
        }
        return this._emitter.event;
      }
      dispose() {
        if (this._emitter) {
          this._emitter.dispose();
          this._emitter = void 0;
        }
      }
    };
    var CancellationTokenSource = class {
      get token() {
        if (!this._token) {
          this._token = new MutableToken();
        }
        return this._token;
      }
      cancel() {
        if (!this._token) {
          this._token = CancellationToken.Cancelled;
        } else {
          this._token.cancel();
        }
      }
      dispose() {
        if (!this._token) {
          this._token = CancellationToken.None;
        } else if (this._token instanceof MutableToken) {
          this._token.dispose();
        }
      }
    };
    exports2.CancellationTokenSource = CancellationTokenSource;
  }
});

// node_modules/vscode-jsonrpc/lib/common/sharedArrayCancellation.js
var require_sharedArrayCancellation = __commonJS({
  "node_modules/vscode-jsonrpc/lib/common/sharedArrayCancellation.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.SharedArrayReceiverStrategy = exports2.SharedArraySenderStrategy = void 0;
    var cancellation_1 = require_cancellation();
    var CancellationState;
    (function(CancellationState2) {
      CancellationState2.Continue = 0;
      CancellationState2.Cancelled = 1;
    })(CancellationState || (CancellationState = {}));
    var SharedArraySenderStrategy = class {
      constructor() {
        this.buffers = /* @__PURE__ */ new Map();
      }
      enableCancellation(request) {
        if (request.id === null) {
          return;
        }
        const buffer = new SharedArrayBuffer(4);
        const data = new Int32Array(buffer, 0, 1);
        data[0] = CancellationState.Continue;
        this.buffers.set(request.id, buffer);
        request.$cancellationData = buffer;
      }
      async sendCancellation(_conn, id) {
        const buffer = this.buffers.get(id);
        if (buffer === void 0) {
          return;
        }
        const data = new Int32Array(buffer, 0, 1);
        Atomics.store(data, 0, CancellationState.Cancelled);
      }
      cleanup(id) {
        this.buffers.delete(id);
      }
      dispose() {
        this.buffers.clear();
      }
    };
    exports2.SharedArraySenderStrategy = SharedArraySenderStrategy;
    var SharedArrayBufferCancellationToken = class {
      constructor(buffer) {
        this.data = new Int32Array(buffer, 0, 1);
      }
      get isCancellationRequested() {
        return Atomics.load(this.data, 0) === CancellationState.Cancelled;
      }
      get onCancellationRequested() {
        throw new Error(`Cancellation over SharedArrayBuffer doesn't support cancellation events`);
      }
    };
    var SharedArrayBufferCancellationTokenSource = class {
      constructor(buffer) {
        this.token = new SharedArrayBufferCancellationToken(buffer);
      }
      cancel() {
      }
      dispose() {
      }
    };
    var SharedArrayReceiverStrategy = class {
      constructor() {
        this.kind = "request";
      }
      createCancellationTokenSource(request) {
        const buffer = request.$cancellationData;
        if (buffer === void 0) {
          return new cancellation_1.CancellationTokenSource();
        }
        return new SharedArrayBufferCancellationTokenSource(buffer);
      }
    };
    exports2.SharedArrayReceiverStrategy = SharedArrayReceiverStrategy;
  }
});

// node_modules/vscode-jsonrpc/lib/common/semaphore.js
var require_semaphore = __commonJS({
  "node_modules/vscode-jsonrpc/lib/common/semaphore.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Semaphore = void 0;
    var ral_1 = require_ral();
    var Semaphore = class {
      constructor(capacity = 1) {
        if (capacity <= 0) {
          throw new Error("Capacity must be greater than 0");
        }
        this._capacity = capacity;
        this._active = 0;
        this._waiting = [];
      }
      lock(thunk) {
        return new Promise((resolve, reject) => {
          this._waiting.push({ thunk, resolve, reject });
          this.runNext();
        });
      }
      get active() {
        return this._active;
      }
      runNext() {
        if (this._waiting.length === 0 || this._active === this._capacity) {
          return;
        }
        (0, ral_1.default)().timer.setImmediate(() => this.doRunNext());
      }
      doRunNext() {
        if (this._waiting.length === 0 || this._active === this._capacity) {
          return;
        }
        const next2 = this._waiting.shift();
        this._active++;
        if (this._active > this._capacity) {
          throw new Error(`To many thunks active`);
        }
        try {
          const result = next2.thunk();
          if (result instanceof Promise) {
            result.then((value) => {
              this._active--;
              next2.resolve(value);
              this.runNext();
            }, (err) => {
              this._active--;
              next2.reject(err);
              this.runNext();
            });
          } else {
            this._active--;
            next2.resolve(result);
            this.runNext();
          }
        } catch (err) {
          this._active--;
          next2.reject(err);
          this.runNext();
        }
      }
    };
    exports2.Semaphore = Semaphore;
  }
});

// node_modules/vscode-jsonrpc/lib/common/messageReader.js
var require_messageReader = __commonJS({
  "node_modules/vscode-jsonrpc/lib/common/messageReader.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ReadableStreamMessageReader = exports2.AbstractMessageReader = exports2.MessageReader = void 0;
    var ral_1 = require_ral();
    var Is = require_is2();
    var events_1 = require_events();
    var semaphore_1 = require_semaphore();
    var MessageReader;
    (function(MessageReader2) {
      function is(value) {
        let candidate = value;
        return candidate && Is.func(candidate.listen) && Is.func(candidate.dispose) && Is.func(candidate.onError) && Is.func(candidate.onClose) && Is.func(candidate.onPartialMessage);
      }
      MessageReader2.is = is;
    })(MessageReader || (exports2.MessageReader = MessageReader = {}));
    var AbstractMessageReader = class {
      constructor() {
        this.errorEmitter = new events_1.Emitter();
        this.closeEmitter = new events_1.Emitter();
        this.partialMessageEmitter = new events_1.Emitter();
      }
      dispose() {
        this.errorEmitter.dispose();
        this.closeEmitter.dispose();
      }
      get onError() {
        return this.errorEmitter.event;
      }
      fireError(error) {
        this.errorEmitter.fire(this.asError(error));
      }
      get onClose() {
        return this.closeEmitter.event;
      }
      fireClose() {
        this.closeEmitter.fire(void 0);
      }
      get onPartialMessage() {
        return this.partialMessageEmitter.event;
      }
      firePartialMessage(info) {
        this.partialMessageEmitter.fire(info);
      }
      asError(error) {
        if (error instanceof Error) {
          return error;
        } else {
          return new Error(`Reader received error. Reason: ${Is.string(error.message) ? error.message : "unknown"}`);
        }
      }
    };
    exports2.AbstractMessageReader = AbstractMessageReader;
    var ResolvedMessageReaderOptions;
    (function(ResolvedMessageReaderOptions2) {
      function fromOptions(options) {
        let charset;
        let result;
        let contentDecoder;
        const contentDecoders = /* @__PURE__ */ new Map();
        let contentTypeDecoder;
        const contentTypeDecoders = /* @__PURE__ */ new Map();
        if (options === void 0 || typeof options === "string") {
          charset = options ?? "utf-8";
        } else {
          charset = options.charset ?? "utf-8";
          if (options.contentDecoder !== void 0) {
            contentDecoder = options.contentDecoder;
            contentDecoders.set(contentDecoder.name, contentDecoder);
          }
          if (options.contentDecoders !== void 0) {
            for (const decoder of options.contentDecoders) {
              contentDecoders.set(decoder.name, decoder);
            }
          }
          if (options.contentTypeDecoder !== void 0) {
            contentTypeDecoder = options.contentTypeDecoder;
            contentTypeDecoders.set(contentTypeDecoder.name, contentTypeDecoder);
          }
          if (options.contentTypeDecoders !== void 0) {
            for (const decoder of options.contentTypeDecoders) {
              contentTypeDecoders.set(decoder.name, decoder);
            }
          }
        }
        if (contentTypeDecoder === void 0) {
          contentTypeDecoder = (0, ral_1.default)().applicationJson.decoder;
          contentTypeDecoders.set(contentTypeDecoder.name, contentTypeDecoder);
        }
        return { charset, contentDecoder, contentDecoders, contentTypeDecoder, contentTypeDecoders };
      }
      ResolvedMessageReaderOptions2.fromOptions = fromOptions;
    })(ResolvedMessageReaderOptions || (ResolvedMessageReaderOptions = {}));
    var ReadableStreamMessageReader = class extends AbstractMessageReader {
      constructor(readable, options) {
        super();
        this.readable = readable;
        this.options = ResolvedMessageReaderOptions.fromOptions(options);
        this.buffer = (0, ral_1.default)().messageBuffer.create(this.options.charset);
        this._partialMessageTimeout = 1e4;
        this.nextMessageLength = -1;
        this.messageToken = 0;
        this.readSemaphore = new semaphore_1.Semaphore(1);
      }
      set partialMessageTimeout(timeout) {
        this._partialMessageTimeout = timeout;
      }
      get partialMessageTimeout() {
        return this._partialMessageTimeout;
      }
      listen(callback) {
        this.nextMessageLength = -1;
        this.messageToken = 0;
        this.partialMessageTimer = void 0;
        this.callback = callback;
        const result = this.readable.onData((data) => {
          this.onData(data);
        });
        this.readable.onError((error) => this.fireError(error));
        this.readable.onClose(() => this.fireClose());
        return result;
      }
      onData(data) {
        try {
          this.buffer.append(data);
          while (true) {
            if (this.nextMessageLength === -1) {
              const headers = this.buffer.tryReadHeaders(true);
              if (!headers) {
                return;
              }
              const contentLength = headers.get("content-length");
              if (!contentLength) {
                this.fireError(new Error(`Header must provide a Content-Length property.
${JSON.stringify(Object.fromEntries(headers))}`));
                return;
              }
              const length = parseInt(contentLength);
              if (isNaN(length)) {
                this.fireError(new Error(`Content-Length value must be a number. Got ${contentLength}`));
                return;
              }
              this.nextMessageLength = length;
            }
            const body = this.buffer.tryReadBody(this.nextMessageLength);
            if (body === void 0) {
              this.setPartialMessageTimer();
              return;
            }
            this.clearPartialMessageTimer();
            this.nextMessageLength = -1;
            this.readSemaphore.lock(async () => {
              const bytes = this.options.contentDecoder !== void 0 ? await this.options.contentDecoder.decode(body) : body;
              const message = await this.options.contentTypeDecoder.decode(bytes, this.options);
              this.callback(message);
            }).catch((error) => {
              this.fireError(error);
            });
          }
        } catch (error) {
          this.fireError(error);
        }
      }
      clearPartialMessageTimer() {
        if (this.partialMessageTimer) {
          this.partialMessageTimer.dispose();
          this.partialMessageTimer = void 0;
        }
      }
      setPartialMessageTimer() {
        this.clearPartialMessageTimer();
        if (this._partialMessageTimeout <= 0) {
          return;
        }
        this.partialMessageTimer = (0, ral_1.default)().timer.setTimeout((token, timeout) => {
          this.partialMessageTimer = void 0;
          if (token === this.messageToken) {
            this.firePartialMessage({ messageToken: token, waitingTime: timeout });
            this.setPartialMessageTimer();
          }
        }, this._partialMessageTimeout, this.messageToken, this._partialMessageTimeout);
      }
    };
    exports2.ReadableStreamMessageReader = ReadableStreamMessageReader;
  }
});

// node_modules/vscode-jsonrpc/lib/common/messageWriter.js
var require_messageWriter = __commonJS({
  "node_modules/vscode-jsonrpc/lib/common/messageWriter.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.WriteableStreamMessageWriter = exports2.AbstractMessageWriter = exports2.MessageWriter = void 0;
    var ral_1 = require_ral();
    var Is = require_is2();
    var semaphore_1 = require_semaphore();
    var events_1 = require_events();
    var ContentLength = "Content-Length: ";
    var CRLF = "\r\n";
    var MessageWriter;
    (function(MessageWriter2) {
      function is(value) {
        let candidate = value;
        return candidate && Is.func(candidate.dispose) && Is.func(candidate.onClose) && Is.func(candidate.onError) && Is.func(candidate.write);
      }
      MessageWriter2.is = is;
    })(MessageWriter || (exports2.MessageWriter = MessageWriter = {}));
    var AbstractMessageWriter = class {
      constructor() {
        this.errorEmitter = new events_1.Emitter();
        this.closeEmitter = new events_1.Emitter();
      }
      dispose() {
        this.errorEmitter.dispose();
        this.closeEmitter.dispose();
      }
      get onError() {
        return this.errorEmitter.event;
      }
      fireError(error, message, count) {
        this.errorEmitter.fire([this.asError(error), message, count]);
      }
      get onClose() {
        return this.closeEmitter.event;
      }
      fireClose() {
        this.closeEmitter.fire(void 0);
      }
      asError(error) {
        if (error instanceof Error) {
          return error;
        } else {
          return new Error(`Writer received error. Reason: ${Is.string(error.message) ? error.message : "unknown"}`);
        }
      }
    };
    exports2.AbstractMessageWriter = AbstractMessageWriter;
    var ResolvedMessageWriterOptions;
    (function(ResolvedMessageWriterOptions2) {
      function fromOptions(options) {
        if (options === void 0 || typeof options === "string") {
          return { charset: options ?? "utf-8", contentTypeEncoder: (0, ral_1.default)().applicationJson.encoder };
        } else {
          return { charset: options.charset ?? "utf-8", contentEncoder: options.contentEncoder, contentTypeEncoder: options.contentTypeEncoder ?? (0, ral_1.default)().applicationJson.encoder };
        }
      }
      ResolvedMessageWriterOptions2.fromOptions = fromOptions;
    })(ResolvedMessageWriterOptions || (ResolvedMessageWriterOptions = {}));
    var WriteableStreamMessageWriter = class extends AbstractMessageWriter {
      constructor(writable, options) {
        super();
        this.writable = writable;
        this.options = ResolvedMessageWriterOptions.fromOptions(options);
        this.errorCount = 0;
        this.writeSemaphore = new semaphore_1.Semaphore(1);
        this.writable.onError((error) => this.fireError(error));
        this.writable.onClose(() => this.fireClose());
      }
      async write(msg) {
        return this.writeSemaphore.lock(async () => {
          const payload = this.options.contentTypeEncoder.encode(msg, this.options).then((buffer) => {
            if (this.options.contentEncoder !== void 0) {
              return this.options.contentEncoder.encode(buffer);
            } else {
              return buffer;
            }
          });
          return payload.then((buffer) => {
            const headers = [];
            headers.push(ContentLength, buffer.byteLength.toString(), CRLF);
            headers.push(CRLF);
            return this.doWrite(msg, headers, buffer);
          }, (error) => {
            this.fireError(error);
            throw error;
          });
        });
      }
      async doWrite(msg, headers, data) {
        try {
          await this.writable.write(headers.join(""), "ascii");
          return this.writable.write(data);
        } catch (error) {
          this.handleError(error, msg);
          return Promise.reject(error);
        }
      }
      handleError(error, msg) {
        this.errorCount++;
        this.fireError(error, msg, this.errorCount);
      }
      end() {
        this.writable.end();
      }
    };
    exports2.WriteableStreamMessageWriter = WriteableStreamMessageWriter;
  }
});

// node_modules/vscode-jsonrpc/lib/common/messageBuffer.js
var require_messageBuffer = __commonJS({
  "node_modules/vscode-jsonrpc/lib/common/messageBuffer.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.AbstractMessageBuffer = void 0;
    var CR = 13;
    var LF = 10;
    var CRLF = "\r\n";
    var AbstractMessageBuffer = class {
      constructor(encoding = "utf-8") {
        this._encoding = encoding;
        this._chunks = [];
        this._totalLength = 0;
      }
      get encoding() {
        return this._encoding;
      }
      append(chunk) {
        const toAppend = typeof chunk === "string" ? this.fromString(chunk, this._encoding) : chunk;
        this._chunks.push(toAppend);
        this._totalLength += toAppend.byteLength;
      }
      tryReadHeaders(lowerCaseKeys = false) {
        if (this._chunks.length === 0) {
          return void 0;
        }
        let state2 = 0;
        let chunkIndex = 0;
        let offset2 = 0;
        let chunkBytesRead = 0;
        row: while (chunkIndex < this._chunks.length) {
          const chunk = this._chunks[chunkIndex];
          offset2 = 0;
          column: while (offset2 < chunk.length) {
            const value = chunk[offset2];
            switch (value) {
              case CR:
                switch (state2) {
                  case 0:
                    state2 = 1;
                    break;
                  case 2:
                    state2 = 3;
                    break;
                  default:
                    state2 = 0;
                }
                break;
              case LF:
                switch (state2) {
                  case 1:
                    state2 = 2;
                    break;
                  case 3:
                    state2 = 4;
                    offset2++;
                    break row;
                  default:
                    state2 = 0;
                }
                break;
              default:
                state2 = 0;
            }
            offset2++;
          }
          chunkBytesRead += chunk.byteLength;
          chunkIndex++;
        }
        if (state2 !== 4) {
          return void 0;
        }
        const buffer = this._read(chunkBytesRead + offset2);
        const result = /* @__PURE__ */ new Map();
        const headers = this.toString(buffer, "ascii").split(CRLF);
        if (headers.length < 2) {
          return result;
        }
        for (let i = 0; i < headers.length - 2; i++) {
          const header = headers[i];
          const index = header.indexOf(":");
          if (index === -1) {
            throw new Error(`Message header must separate key and value using ':'
${header}`);
          }
          const key = header.substr(0, index);
          const value = header.substr(index + 1).trim();
          result.set(lowerCaseKeys ? key.toLowerCase() : key, value);
        }
        return result;
      }
      tryReadBody(length) {
        if (this._totalLength < length) {
          return void 0;
        }
        return this._read(length);
      }
      get numberOfBytes() {
        return this._totalLength;
      }
      _read(byteCount) {
        if (byteCount === 0) {
          return this.emptyBuffer();
        }
        if (byteCount > this._totalLength) {
          throw new Error(`Cannot read so many bytes!`);
        }
        if (this._chunks[0].byteLength === byteCount) {
          const chunk = this._chunks[0];
          this._chunks.shift();
          this._totalLength -= byteCount;
          return this.asNative(chunk);
        }
        if (this._chunks[0].byteLength > byteCount) {
          const chunk = this._chunks[0];
          const result2 = this.asNative(chunk, byteCount);
          this._chunks[0] = chunk.slice(byteCount);
          this._totalLength -= byteCount;
          return result2;
        }
        const result = this.allocNative(byteCount);
        let resultOffset = 0;
        let chunkIndex = 0;
        while (byteCount > 0) {
          const chunk = this._chunks[chunkIndex];
          if (chunk.byteLength > byteCount) {
            const chunkPart = chunk.slice(0, byteCount);
            result.set(chunkPart, resultOffset);
            resultOffset += byteCount;
            this._chunks[chunkIndex] = chunk.slice(byteCount);
            this._totalLength -= byteCount;
            byteCount -= byteCount;
          } else {
            result.set(chunk, resultOffset);
            resultOffset += chunk.byteLength;
            this._chunks.shift();
            this._totalLength -= chunk.byteLength;
            byteCount -= chunk.byteLength;
          }
        }
        return result;
      }
    };
    exports2.AbstractMessageBuffer = AbstractMessageBuffer;
  }
});

// node_modules/vscode-jsonrpc/lib/common/connection.js
var require_connection = __commonJS({
  "node_modules/vscode-jsonrpc/lib/common/connection.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createMessageConnection = exports2.ConnectionOptions = exports2.MessageStrategy = exports2.CancellationStrategy = exports2.CancellationSenderStrategy = exports2.CancellationReceiverStrategy = exports2.RequestCancellationReceiverStrategy = exports2.IdCancellationReceiverStrategy = exports2.ConnectionStrategy = exports2.ConnectionError = exports2.ConnectionErrors = exports2.LogTraceNotification = exports2.SetTraceNotification = exports2.TraceFormat = exports2.TraceValues = exports2.Trace = exports2.NullLogger = exports2.ProgressType = exports2.ProgressToken = void 0;
    var ral_1 = require_ral();
    var Is = require_is2();
    var messages_1 = require_messages();
    var linkedMap_1 = require_linkedMap();
    var events_1 = require_events();
    var cancellation_1 = require_cancellation();
    var CancelNotification;
    (function(CancelNotification2) {
      CancelNotification2.type = new messages_1.NotificationType("$/cancelRequest");
    })(CancelNotification || (CancelNotification = {}));
    var ProgressToken;
    (function(ProgressToken2) {
      function is(value) {
        return typeof value === "string" || typeof value === "number";
      }
      ProgressToken2.is = is;
    })(ProgressToken || (exports2.ProgressToken = ProgressToken = {}));
    var ProgressNotification;
    (function(ProgressNotification2) {
      ProgressNotification2.type = new messages_1.NotificationType("$/progress");
    })(ProgressNotification || (ProgressNotification = {}));
    var ProgressType = class {
      constructor() {
      }
    };
    exports2.ProgressType = ProgressType;
    var StarRequestHandler;
    (function(StarRequestHandler2) {
      function is(value) {
        return Is.func(value);
      }
      StarRequestHandler2.is = is;
    })(StarRequestHandler || (StarRequestHandler = {}));
    exports2.NullLogger = Object.freeze({
      error: () => {
      },
      warn: () => {
      },
      info: () => {
      },
      log: () => {
      }
    });
    var Trace;
    (function(Trace2) {
      Trace2[Trace2["Off"] = 0] = "Off";
      Trace2[Trace2["Messages"] = 1] = "Messages";
      Trace2[Trace2["Compact"] = 2] = "Compact";
      Trace2[Trace2["Verbose"] = 3] = "Verbose";
    })(Trace || (exports2.Trace = Trace = {}));
    var TraceValues;
    (function(TraceValues2) {
      TraceValues2.Off = "off";
      TraceValues2.Messages = "messages";
      TraceValues2.Compact = "compact";
      TraceValues2.Verbose = "verbose";
    })(TraceValues || (exports2.TraceValues = TraceValues = {}));
    (function(Trace2) {
      function fromString(value) {
        if (!Is.string(value)) {
          return Trace2.Off;
        }
        value = value.toLowerCase();
        switch (value) {
          case "off":
            return Trace2.Off;
          case "messages":
            return Trace2.Messages;
          case "compact":
            return Trace2.Compact;
          case "verbose":
            return Trace2.Verbose;
          default:
            return Trace2.Off;
        }
      }
      Trace2.fromString = fromString;
      function toString(value) {
        switch (value) {
          case Trace2.Off:
            return "off";
          case Trace2.Messages:
            return "messages";
          case Trace2.Compact:
            return "compact";
          case Trace2.Verbose:
            return "verbose";
          default:
            return "off";
        }
      }
      Trace2.toString = toString;
    })(Trace || (exports2.Trace = Trace = {}));
    var TraceFormat;
    (function(TraceFormat2) {
      TraceFormat2["Text"] = "text";
      TraceFormat2["JSON"] = "json";
    })(TraceFormat || (exports2.TraceFormat = TraceFormat = {}));
    (function(TraceFormat2) {
      function fromString(value) {
        if (!Is.string(value)) {
          return TraceFormat2.Text;
        }
        value = value.toLowerCase();
        if (value === "json") {
          return TraceFormat2.JSON;
        } else {
          return TraceFormat2.Text;
        }
      }
      TraceFormat2.fromString = fromString;
    })(TraceFormat || (exports2.TraceFormat = TraceFormat = {}));
    var SetTraceNotification;
    (function(SetTraceNotification2) {
      SetTraceNotification2.type = new messages_1.NotificationType("$/setTrace");
    })(SetTraceNotification || (exports2.SetTraceNotification = SetTraceNotification = {}));
    var LogTraceNotification;
    (function(LogTraceNotification2) {
      LogTraceNotification2.type = new messages_1.NotificationType("$/logTrace");
    })(LogTraceNotification || (exports2.LogTraceNotification = LogTraceNotification = {}));
    var ConnectionErrors;
    (function(ConnectionErrors2) {
      ConnectionErrors2[ConnectionErrors2["Closed"] = 1] = "Closed";
      ConnectionErrors2[ConnectionErrors2["Disposed"] = 2] = "Disposed";
      ConnectionErrors2[ConnectionErrors2["AlreadyListening"] = 3] = "AlreadyListening";
    })(ConnectionErrors || (exports2.ConnectionErrors = ConnectionErrors = {}));
    var ConnectionError = class _ConnectionError extends Error {
      constructor(code, message) {
        super(message);
        this.code = code;
        Object.setPrototypeOf(this, _ConnectionError.prototype);
      }
    };
    exports2.ConnectionError = ConnectionError;
    var ConnectionStrategy;
    (function(ConnectionStrategy2) {
      function is(value) {
        const candidate = value;
        return candidate && Is.func(candidate.cancelUndispatched);
      }
      ConnectionStrategy2.is = is;
    })(ConnectionStrategy || (exports2.ConnectionStrategy = ConnectionStrategy = {}));
    var IdCancellationReceiverStrategy;
    (function(IdCancellationReceiverStrategy2) {
      function is(value) {
        const candidate = value;
        return candidate && (candidate.kind === void 0 || candidate.kind === "id") && Is.func(candidate.createCancellationTokenSource) && (candidate.dispose === void 0 || Is.func(candidate.dispose));
      }
      IdCancellationReceiverStrategy2.is = is;
    })(IdCancellationReceiverStrategy || (exports2.IdCancellationReceiverStrategy = IdCancellationReceiverStrategy = {}));
    var RequestCancellationReceiverStrategy;
    (function(RequestCancellationReceiverStrategy2) {
      function is(value) {
        const candidate = value;
        return candidate && candidate.kind === "request" && Is.func(candidate.createCancellationTokenSource) && (candidate.dispose === void 0 || Is.func(candidate.dispose));
      }
      RequestCancellationReceiverStrategy2.is = is;
    })(RequestCancellationReceiverStrategy || (exports2.RequestCancellationReceiverStrategy = RequestCancellationReceiverStrategy = {}));
    var CancellationReceiverStrategy;
    (function(CancellationReceiverStrategy2) {
      CancellationReceiverStrategy2.Message = Object.freeze({
        createCancellationTokenSource(_) {
          return new cancellation_1.CancellationTokenSource();
        }
      });
      function is(value) {
        return IdCancellationReceiverStrategy.is(value) || RequestCancellationReceiverStrategy.is(value);
      }
      CancellationReceiverStrategy2.is = is;
    })(CancellationReceiverStrategy || (exports2.CancellationReceiverStrategy = CancellationReceiverStrategy = {}));
    var CancellationSenderStrategy;
    (function(CancellationSenderStrategy2) {
      CancellationSenderStrategy2.Message = Object.freeze({
        sendCancellation(conn, id) {
          return conn.sendNotification(CancelNotification.type, { id });
        },
        cleanup(_) {
        }
      });
      function is(value) {
        const candidate = value;
        return candidate && Is.func(candidate.sendCancellation) && Is.func(candidate.cleanup);
      }
      CancellationSenderStrategy2.is = is;
    })(CancellationSenderStrategy || (exports2.CancellationSenderStrategy = CancellationSenderStrategy = {}));
    var CancellationStrategy;
    (function(CancellationStrategy2) {
      CancellationStrategy2.Message = Object.freeze({
        receiver: CancellationReceiverStrategy.Message,
        sender: CancellationSenderStrategy.Message
      });
      function is(value) {
        const candidate = value;
        return candidate && CancellationReceiverStrategy.is(candidate.receiver) && CancellationSenderStrategy.is(candidate.sender);
      }
      CancellationStrategy2.is = is;
    })(CancellationStrategy || (exports2.CancellationStrategy = CancellationStrategy = {}));
    var MessageStrategy;
    (function(MessageStrategy2) {
      function is(value) {
        const candidate = value;
        return candidate && Is.func(candidate.handleMessage);
      }
      MessageStrategy2.is = is;
    })(MessageStrategy || (exports2.MessageStrategy = MessageStrategy = {}));
    var ConnectionOptions;
    (function(ConnectionOptions2) {
      function is(value) {
        const candidate = value;
        return candidate && (CancellationStrategy.is(candidate.cancellationStrategy) || ConnectionStrategy.is(candidate.connectionStrategy) || MessageStrategy.is(candidate.messageStrategy));
      }
      ConnectionOptions2.is = is;
    })(ConnectionOptions || (exports2.ConnectionOptions = ConnectionOptions = {}));
    var ConnectionState;
    (function(ConnectionState2) {
      ConnectionState2[ConnectionState2["New"] = 1] = "New";
      ConnectionState2[ConnectionState2["Listening"] = 2] = "Listening";
      ConnectionState2[ConnectionState2["Closed"] = 3] = "Closed";
      ConnectionState2[ConnectionState2["Disposed"] = 4] = "Disposed";
    })(ConnectionState || (ConnectionState = {}));
    function createMessageConnection(messageReader, messageWriter, _logger, options) {
      const logger = _logger !== void 0 ? _logger : exports2.NullLogger;
      let sequenceNumber = 0;
      let notificationSequenceNumber = 0;
      let unknownResponseSequenceNumber = 0;
      const version = "2.0";
      let starRequestHandler = void 0;
      const requestHandlers = /* @__PURE__ */ new Map();
      let starNotificationHandler = void 0;
      const notificationHandlers = /* @__PURE__ */ new Map();
      const progressHandlers = /* @__PURE__ */ new Map();
      let timer;
      let messageQueue = new linkedMap_1.LinkedMap();
      let responsePromises = /* @__PURE__ */ new Map();
      let knownCanceledRequests = /* @__PURE__ */ new Set();
      let requestTokens = /* @__PURE__ */ new Map();
      let trace = Trace.Off;
      let traceFormat = TraceFormat.Text;
      let tracer;
      let state2 = ConnectionState.New;
      const errorEmitter = new events_1.Emitter();
      const closeEmitter = new events_1.Emitter();
      const unhandledNotificationEmitter = new events_1.Emitter();
      const unhandledProgressEmitter = new events_1.Emitter();
      const disposeEmitter = new events_1.Emitter();
      const cancellationStrategy = options && options.cancellationStrategy ? options.cancellationStrategy : CancellationStrategy.Message;
      function createRequestQueueKey(id) {
        if (id === null) {
          throw new Error(`Can't send requests with id null since the response can't be correlated.`);
        }
        return "req-" + id.toString();
      }
      function createResponseQueueKey(id) {
        if (id === null) {
          return "res-unknown-" + (++unknownResponseSequenceNumber).toString();
        } else {
          return "res-" + id.toString();
        }
      }
      function createNotificationQueueKey() {
        return "not-" + (++notificationSequenceNumber).toString();
      }
      function addMessageToQueue(queue, message) {
        if (messages_1.Message.isRequest(message)) {
          queue.set(createRequestQueueKey(message.id), message);
        } else if (messages_1.Message.isResponse(message)) {
          queue.set(createResponseQueueKey(message.id), message);
        } else {
          queue.set(createNotificationQueueKey(), message);
        }
      }
      function cancelUndispatched(_message) {
        return void 0;
      }
      function isListening() {
        return state2 === ConnectionState.Listening;
      }
      function isClosed() {
        return state2 === ConnectionState.Closed;
      }
      function isDisposed() {
        return state2 === ConnectionState.Disposed;
      }
      function closeHandler() {
        if (state2 === ConnectionState.New || state2 === ConnectionState.Listening) {
          state2 = ConnectionState.Closed;
          closeEmitter.fire(void 0);
        }
      }
      function readErrorHandler(error) {
        errorEmitter.fire([error, void 0, void 0]);
      }
      function writeErrorHandler(data) {
        errorEmitter.fire(data);
      }
      messageReader.onClose(closeHandler);
      messageReader.onError(readErrorHandler);
      messageWriter.onClose(closeHandler);
      messageWriter.onError(writeErrorHandler);
      function triggerMessageQueue() {
        if (timer || messageQueue.size === 0) {
          return;
        }
        timer = (0, ral_1.default)().timer.setImmediate(() => {
          timer = void 0;
          processMessageQueue();
        });
      }
      function handleMessage(message) {
        if (messages_1.Message.isRequest(message)) {
          handleRequest(message);
        } else if (messages_1.Message.isNotification(message)) {
          handleNotification(message);
        } else if (messages_1.Message.isResponse(message)) {
          handleResponse(message);
        } else {
          handleInvalidMessage(message);
        }
      }
      function processMessageQueue() {
        if (messageQueue.size === 0) {
          return;
        }
        const message = messageQueue.shift();
        try {
          const messageStrategy = options?.messageStrategy;
          if (MessageStrategy.is(messageStrategy)) {
            messageStrategy.handleMessage(message, handleMessage);
          } else {
            handleMessage(message);
          }
        } finally {
          triggerMessageQueue();
        }
      }
      const callback = (message) => {
        try {
          if (messages_1.Message.isNotification(message) && message.method === CancelNotification.type.method) {
            const cancelId = message.params.id;
            const key = createRequestQueueKey(cancelId);
            const toCancel = messageQueue.get(key);
            if (messages_1.Message.isRequest(toCancel)) {
              const strategy = options?.connectionStrategy;
              const response = strategy && strategy.cancelUndispatched ? strategy.cancelUndispatched(toCancel, cancelUndispatched) : cancelUndispatched(toCancel);
              if (response && (response.error !== void 0 || response.result !== void 0)) {
                messageQueue.delete(key);
                requestTokens.delete(cancelId);
                response.id = toCancel.id;
                traceSendingResponse(response, message.method, Date.now());
                messageWriter.write(response).catch(() => logger.error(`Sending response for canceled message failed.`));
                return;
              }
            }
            const cancellationToken = requestTokens.get(cancelId);
            if (cancellationToken !== void 0) {
              cancellationToken.cancel();
              traceReceivedNotification(message);
              return;
            } else {
              knownCanceledRequests.add(cancelId);
            }
          }
          addMessageToQueue(messageQueue, message);
        } finally {
          triggerMessageQueue();
        }
      };
      function handleRequest(requestMessage) {
        if (isDisposed()) {
          return;
        }
        function reply(resultOrError, method, startTime2) {
          const message = {
            jsonrpc: version,
            id: requestMessage.id
          };
          if (resultOrError instanceof messages_1.ResponseError) {
            message.error = resultOrError.toJson();
          } else {
            message.result = resultOrError === void 0 ? null : resultOrError;
          }
          traceSendingResponse(message, method, startTime2);
          messageWriter.write(message).catch(() => logger.error(`Sending response failed.`));
        }
        function replyError(error, method, startTime2) {
          const message = {
            jsonrpc: version,
            id: requestMessage.id,
            error: error.toJson()
          };
          traceSendingResponse(message, method, startTime2);
          messageWriter.write(message).catch(() => logger.error(`Sending response failed.`));
        }
        function replySuccess(result, method, startTime2) {
          if (result === void 0) {
            result = null;
          }
          const message = {
            jsonrpc: version,
            id: requestMessage.id,
            result
          };
          traceSendingResponse(message, method, startTime2);
          messageWriter.write(message).catch(() => logger.error(`Sending response failed.`));
        }
        traceReceivedRequest(requestMessage);
        const element = requestHandlers.get(requestMessage.method);
        let type;
        let requestHandler;
        if (element) {
          type = element.type;
          requestHandler = element.handler;
        }
        const startTime = Date.now();
        if (requestHandler || starRequestHandler) {
          const tokenKey = requestMessage.id ?? String(Date.now());
          const cancellationSource = IdCancellationReceiverStrategy.is(cancellationStrategy.receiver) ? cancellationStrategy.receiver.createCancellationTokenSource(tokenKey) : cancellationStrategy.receiver.createCancellationTokenSource(requestMessage);
          if (requestMessage.id !== null && knownCanceledRequests.has(requestMessage.id)) {
            cancellationSource.cancel();
          }
          if (requestMessage.id !== null) {
            requestTokens.set(tokenKey, cancellationSource);
          }
          try {
            let handlerResult;
            if (requestHandler) {
              if (requestMessage.params === void 0) {
                if (type !== void 0 && type.numberOfParams !== 0) {
                  replyError(new messages_1.ResponseError(messages_1.ErrorCodes.InvalidParams, `Request ${requestMessage.method} defines ${type.numberOfParams} params but received none.`), requestMessage.method, startTime);
                  return;
                }
                handlerResult = requestHandler(cancellationSource.token);
              } else if (Array.isArray(requestMessage.params)) {
                if (type !== void 0 && type.parameterStructures === messages_1.ParameterStructures.byName) {
                  replyError(new messages_1.ResponseError(messages_1.ErrorCodes.InvalidParams, `Request ${requestMessage.method} defines parameters by name but received parameters by position`), requestMessage.method, startTime);
                  return;
                }
                handlerResult = requestHandler(...requestMessage.params, cancellationSource.token);
              } else {
                if (type !== void 0 && type.parameterStructures === messages_1.ParameterStructures.byPosition) {
                  replyError(new messages_1.ResponseError(messages_1.ErrorCodes.InvalidParams, `Request ${requestMessage.method} defines parameters by position but received parameters by name`), requestMessage.method, startTime);
                  return;
                }
                handlerResult = requestHandler(requestMessage.params, cancellationSource.token);
              }
            } else if (starRequestHandler) {
              handlerResult = starRequestHandler(requestMessage.method, requestMessage.params, cancellationSource.token);
            }
            const promise = handlerResult;
            if (!handlerResult) {
              requestTokens.delete(tokenKey);
              replySuccess(handlerResult, requestMessage.method, startTime);
            } else if (promise.then) {
              promise.then((resultOrError) => {
                requestTokens.delete(tokenKey);
                reply(resultOrError, requestMessage.method, startTime);
              }, (error) => {
                requestTokens.delete(tokenKey);
                if (error instanceof messages_1.ResponseError) {
                  replyError(error, requestMessage.method, startTime);
                } else if (error && Is.string(error.message)) {
                  replyError(new messages_1.ResponseError(messages_1.ErrorCodes.InternalError, `Request ${requestMessage.method} failed with message: ${error.message}`), requestMessage.method, startTime);
                } else {
                  replyError(new messages_1.ResponseError(messages_1.ErrorCodes.InternalError, `Request ${requestMessage.method} failed unexpectedly without providing any details.`), requestMessage.method, startTime);
                }
              });
            } else {
              requestTokens.delete(tokenKey);
              reply(handlerResult, requestMessage.method, startTime);
            }
          } catch (error) {
            requestTokens.delete(tokenKey);
            if (error instanceof messages_1.ResponseError) {
              reply(error, requestMessage.method, startTime);
            } else if (error && Is.string(error.message)) {
              replyError(new messages_1.ResponseError(messages_1.ErrorCodes.InternalError, `Request ${requestMessage.method} failed with message: ${error.message}`), requestMessage.method, startTime);
            } else {
              replyError(new messages_1.ResponseError(messages_1.ErrorCodes.InternalError, `Request ${requestMessage.method} failed unexpectedly without providing any details.`), requestMessage.method, startTime);
            }
          }
        } else {
          replyError(new messages_1.ResponseError(messages_1.ErrorCodes.MethodNotFound, `Unhandled method ${requestMessage.method}`), requestMessage.method, startTime);
        }
      }
      function handleResponse(responseMessage) {
        if (isDisposed()) {
          return;
        }
        if (responseMessage.id === null) {
          if (responseMessage.error) {
            logger.error(`Received response message without id: Error is: 
${JSON.stringify(responseMessage.error, void 0, 4)}`);
          } else {
            logger.error(`Received response message without id. No further error information provided.`);
          }
        } else {
          const key = responseMessage.id;
          const responsePromise = responsePromises.get(key);
          traceReceivedResponse(responseMessage, responsePromise);
          if (responsePromise !== void 0) {
            responsePromises.delete(key);
            try {
              if (responseMessage.error) {
                const error = responseMessage.error;
                responsePromise.reject(new messages_1.ResponseError(error.code, error.message, error.data));
              } else if (responseMessage.result !== void 0) {
                responsePromise.resolve(responseMessage.result);
              } else {
                throw new Error("Should never happen.");
              }
            } catch (error) {
              if (error.message) {
                logger.error(`Response handler '${responsePromise.method}' failed with message: ${error.message}`);
              } else {
                logger.error(`Response handler '${responsePromise.method}' failed unexpectedly.`);
              }
            }
          }
        }
      }
      function handleNotification(message) {
        if (isDisposed()) {
          return;
        }
        let type = void 0;
        let notificationHandler;
        if (message.method === CancelNotification.type.method) {
          const cancelId = message.params.id;
          knownCanceledRequests.delete(cancelId);
          traceReceivedNotification(message);
          return;
        } else {
          const element = notificationHandlers.get(message.method);
          if (element) {
            notificationHandler = element.handler;
            type = element.type;
          }
        }
        if (notificationHandler || starNotificationHandler) {
          try {
            traceReceivedNotification(message);
            if (notificationHandler) {
              if (message.params === void 0) {
                if (type !== void 0) {
                  if (type.numberOfParams !== 0 && type.parameterStructures !== messages_1.ParameterStructures.byName) {
                    logger.error(`Notification ${message.method} defines ${type.numberOfParams} params but received none.`);
                  }
                }
                notificationHandler();
              } else if (Array.isArray(message.params)) {
                const params = message.params;
                if (message.method === ProgressNotification.type.method && params.length === 2 && ProgressToken.is(params[0])) {
                  notificationHandler({ token: params[0], value: params[1] });
                } else {
                  if (type !== void 0) {
                    if (type.parameterStructures === messages_1.ParameterStructures.byName) {
                      logger.error(`Notification ${message.method} defines parameters by name but received parameters by position`);
                    }
                    if (type.numberOfParams !== message.params.length) {
                      logger.error(`Notification ${message.method} defines ${type.numberOfParams} params but received ${params.length} arguments`);
                    }
                  }
                  notificationHandler(...params);
                }
              } else {
                if (type !== void 0 && type.parameterStructures === messages_1.ParameterStructures.byPosition) {
                  logger.error(`Notification ${message.method} defines parameters by position but received parameters by name`);
                }
                notificationHandler(message.params);
              }
            } else if (starNotificationHandler) {
              starNotificationHandler(message.method, message.params);
            }
          } catch (error) {
            if (error.message) {
              logger.error(`Notification handler '${message.method}' failed with message: ${error.message}`);
            } else {
              logger.error(`Notification handler '${message.method}' failed unexpectedly.`);
            }
          }
        } else {
          unhandledNotificationEmitter.fire(message);
        }
      }
      function handleInvalidMessage(message) {
        if (!message) {
          logger.error("Received empty message.");
          return;
        }
        logger.error(`Received message which is neither a response nor a notification message:
${JSON.stringify(message, null, 4)}`);
        const responseMessage = message;
        if (Is.string(responseMessage.id) || Is.number(responseMessage.id)) {
          const key = responseMessage.id;
          const responseHandler = responsePromises.get(key);
          if (responseHandler) {
            responseHandler.reject(new Error("The received response has neither a result nor an error property."));
          }
        }
      }
      function stringifyTrace(params) {
        if (params === void 0 || params === null) {
          return void 0;
        }
        switch (trace) {
          case Trace.Verbose:
            return JSON.stringify(params, null, 4);
          case Trace.Compact:
            return JSON.stringify(params);
          default:
            return void 0;
        }
      }
      function traceSendingRequest(message) {
        if (trace === Trace.Off || !tracer) {
          return;
        }
        if (traceFormat === TraceFormat.Text) {
          let data = void 0;
          if ((trace === Trace.Verbose || trace === Trace.Compact) && message.params) {
            data = `Params: ${stringifyTrace(message.params)}

`;
          }
          tracer.log(`Sending request '${message.method} - (${message.id})'.`, data);
        } else {
          logLSPMessage("send-request", message);
        }
      }
      function traceSendingNotification(message) {
        if (trace === Trace.Off || !tracer) {
          return;
        }
        if (traceFormat === TraceFormat.Text) {
          let data = void 0;
          if (trace === Trace.Verbose || trace === Trace.Compact) {
            if (message.params) {
              data = `Params: ${stringifyTrace(message.params)}

`;
            } else {
              data = "No parameters provided.\n\n";
            }
          }
          tracer.log(`Sending notification '${message.method}'.`, data);
        } else {
          logLSPMessage("send-notification", message);
        }
      }
      function traceSendingResponse(message, method, startTime) {
        if (trace === Trace.Off || !tracer) {
          return;
        }
        if (traceFormat === TraceFormat.Text) {
          let data = void 0;
          if (trace === Trace.Verbose || trace === Trace.Compact) {
            if (message.error && message.error.data) {
              data = `Error data: ${stringifyTrace(message.error.data)}

`;
            } else {
              if (message.result) {
                data = `Result: ${stringifyTrace(message.result)}

`;
              } else if (message.error === void 0) {
                data = "No result returned.\n\n";
              }
            }
          }
          tracer.log(`Sending response '${method} - (${message.id})'. Processing request took ${Date.now() - startTime}ms`, data);
        } else {
          logLSPMessage("send-response", message);
        }
      }
      function traceReceivedRequest(message) {
        if (trace === Trace.Off || !tracer) {
          return;
        }
        if (traceFormat === TraceFormat.Text) {
          let data = void 0;
          if ((trace === Trace.Verbose || trace === Trace.Compact) && message.params) {
            data = `Params: ${stringifyTrace(message.params)}

`;
          }
          tracer.log(`Received request '${message.method} - (${message.id})'.`, data);
        } else {
          logLSPMessage("receive-request", message);
        }
      }
      function traceReceivedNotification(message) {
        if (trace === Trace.Off || !tracer || message.method === LogTraceNotification.type.method) {
          return;
        }
        if (traceFormat === TraceFormat.Text) {
          let data = void 0;
          if (trace === Trace.Verbose || trace === Trace.Compact) {
            if (message.params) {
              data = `Params: ${stringifyTrace(message.params)}

`;
            } else {
              data = "No parameters provided.\n\n";
            }
          }
          tracer.log(`Received notification '${message.method}'.`, data);
        } else {
          logLSPMessage("receive-notification", message);
        }
      }
      function traceReceivedResponse(message, responsePromise) {
        if (trace === Trace.Off || !tracer) {
          return;
        }
        if (traceFormat === TraceFormat.Text) {
          let data = void 0;
          if (trace === Trace.Verbose || trace === Trace.Compact) {
            if (message.error && message.error.data) {
              data = `Error data: ${stringifyTrace(message.error.data)}

`;
            } else {
              if (message.result) {
                data = `Result: ${stringifyTrace(message.result)}

`;
              } else if (message.error === void 0) {
                data = "No result returned.\n\n";
              }
            }
          }
          if (responsePromise) {
            const error = message.error ? ` Request failed: ${message.error.message} (${message.error.code}).` : "";
            tracer.log(`Received response '${responsePromise.method} - (${message.id})' in ${Date.now() - responsePromise.timerStart}ms.${error}`, data);
          } else {
            tracer.log(`Received response ${message.id} without active response promise.`, data);
          }
        } else {
          logLSPMessage("receive-response", message);
        }
      }
      function logLSPMessage(type, message) {
        if (!tracer || trace === Trace.Off) {
          return;
        }
        const lspMessage = {
          isLSPMessage: true,
          type,
          message,
          timestamp: Date.now()
        };
        tracer.log(lspMessage);
      }
      function throwIfClosedOrDisposed() {
        if (isClosed()) {
          throw new ConnectionError(ConnectionErrors.Closed, "Connection is closed.");
        }
        if (isDisposed()) {
          throw new ConnectionError(ConnectionErrors.Disposed, "Connection is disposed.");
        }
      }
      function throwIfListening() {
        if (isListening()) {
          throw new ConnectionError(ConnectionErrors.AlreadyListening, "Connection is already listening");
        }
      }
      function throwIfNotListening() {
        if (!isListening()) {
          throw new Error("Call listen() first.");
        }
      }
      function undefinedToNull(param) {
        if (param === void 0) {
          return null;
        } else {
          return param;
        }
      }
      function nullToUndefined(param) {
        if (param === null) {
          return void 0;
        } else {
          return param;
        }
      }
      function isNamedParam(param) {
        return param !== void 0 && param !== null && !Array.isArray(param) && typeof param === "object";
      }
      function computeSingleParam(parameterStructures, param) {
        switch (parameterStructures) {
          case messages_1.ParameterStructures.auto:
            if (isNamedParam(param)) {
              return nullToUndefined(param);
            } else {
              return [undefinedToNull(param)];
            }
          case messages_1.ParameterStructures.byName:
            if (!isNamedParam(param)) {
              throw new Error(`Received parameters by name but param is not an object literal.`);
            }
            return nullToUndefined(param);
          case messages_1.ParameterStructures.byPosition:
            return [undefinedToNull(param)];
          default:
            throw new Error(`Unknown parameter structure ${parameterStructures.toString()}`);
        }
      }
      function computeMessageParams(type, params) {
        let result;
        const numberOfParams = type.numberOfParams;
        switch (numberOfParams) {
          case 0:
            result = void 0;
            break;
          case 1:
            result = computeSingleParam(type.parameterStructures, params[0]);
            break;
          default:
            result = [];
            for (let i = 0; i < params.length && i < numberOfParams; i++) {
              result.push(undefinedToNull(params[i]));
            }
            if (params.length < numberOfParams) {
              for (let i = params.length; i < numberOfParams; i++) {
                result.push(null);
              }
            }
            break;
        }
        return result;
      }
      const connection2 = {
        sendNotification: (type, ...args) => {
          throwIfClosedOrDisposed();
          let method;
          let messageParams;
          if (Is.string(type)) {
            method = type;
            const first = args[0];
            let paramStart = 0;
            let parameterStructures = messages_1.ParameterStructures.auto;
            if (messages_1.ParameterStructures.is(first)) {
              paramStart = 1;
              parameterStructures = first;
            }
            let paramEnd = args.length;
            const numberOfParams = paramEnd - paramStart;
            switch (numberOfParams) {
              case 0:
                messageParams = void 0;
                break;
              case 1:
                messageParams = computeSingleParam(parameterStructures, args[paramStart]);
                break;
              default:
                if (parameterStructures === messages_1.ParameterStructures.byName) {
                  throw new Error(`Received ${numberOfParams} parameters for 'by Name' notification parameter structure.`);
                }
                messageParams = args.slice(paramStart, paramEnd).map((value) => undefinedToNull(value));
                break;
            }
          } else {
            const params = args;
            method = type.method;
            messageParams = computeMessageParams(type, params);
          }
          const notificationMessage = {
            jsonrpc: version,
            method,
            params: messageParams
          };
          traceSendingNotification(notificationMessage);
          return messageWriter.write(notificationMessage).catch((error) => {
            logger.error(`Sending notification failed.`);
            throw error;
          });
        },
        onNotification: (type, handler) => {
          throwIfClosedOrDisposed();
          let method;
          if (Is.func(type)) {
            starNotificationHandler = type;
          } else if (handler) {
            if (Is.string(type)) {
              method = type;
              notificationHandlers.set(type, { type: void 0, handler });
            } else {
              method = type.method;
              notificationHandlers.set(type.method, { type, handler });
            }
          }
          return {
            dispose: () => {
              if (method !== void 0) {
                notificationHandlers.delete(method);
              } else {
                starNotificationHandler = void 0;
              }
            }
          };
        },
        onProgress: (_type, token, handler) => {
          if (progressHandlers.has(token)) {
            throw new Error(`Progress handler for token ${token} already registered`);
          }
          progressHandlers.set(token, handler);
          return {
            dispose: () => {
              progressHandlers.delete(token);
            }
          };
        },
        sendProgress: (_type, token, value) => {
          return connection2.sendNotification(ProgressNotification.type, { token, value });
        },
        onUnhandledProgress: unhandledProgressEmitter.event,
        sendRequest: (type, ...args) => {
          throwIfClosedOrDisposed();
          throwIfNotListening();
          let method;
          let messageParams;
          let token = void 0;
          if (Is.string(type)) {
            method = type;
            const first = args[0];
            const last = args[args.length - 1];
            let paramStart = 0;
            let parameterStructures = messages_1.ParameterStructures.auto;
            if (messages_1.ParameterStructures.is(first)) {
              paramStart = 1;
              parameterStructures = first;
            }
            let paramEnd = args.length;
            if (cancellation_1.CancellationToken.is(last)) {
              paramEnd = paramEnd - 1;
              token = last;
            }
            const numberOfParams = paramEnd - paramStart;
            switch (numberOfParams) {
              case 0:
                messageParams = void 0;
                break;
              case 1:
                messageParams = computeSingleParam(parameterStructures, args[paramStart]);
                break;
              default:
                if (parameterStructures === messages_1.ParameterStructures.byName) {
                  throw new Error(`Received ${numberOfParams} parameters for 'by Name' request parameter structure.`);
                }
                messageParams = args.slice(paramStart, paramEnd).map((value) => undefinedToNull(value));
                break;
            }
          } else {
            const params = args;
            method = type.method;
            messageParams = computeMessageParams(type, params);
            const numberOfParams = type.numberOfParams;
            token = cancellation_1.CancellationToken.is(params[numberOfParams]) ? params[numberOfParams] : void 0;
          }
          const id = sequenceNumber++;
          let disposable;
          if (token) {
            disposable = token.onCancellationRequested(() => {
              const p = cancellationStrategy.sender.sendCancellation(connection2, id);
              if (p === void 0) {
                logger.log(`Received no promise from cancellation strategy when cancelling id ${id}`);
                return Promise.resolve();
              } else {
                return p.catch(() => {
                  logger.log(`Sending cancellation messages for id ${id} failed`);
                });
              }
            });
          }
          const requestMessage = {
            jsonrpc: version,
            id,
            method,
            params: messageParams
          };
          traceSendingRequest(requestMessage);
          if (typeof cancellationStrategy.sender.enableCancellation === "function") {
            cancellationStrategy.sender.enableCancellation(requestMessage);
          }
          return new Promise(async (resolve, reject) => {
            const resolveWithCleanup = (r) => {
              resolve(r);
              cancellationStrategy.sender.cleanup(id);
              disposable?.dispose();
            };
            const rejectWithCleanup = (r) => {
              reject(r);
              cancellationStrategy.sender.cleanup(id);
              disposable?.dispose();
            };
            const responsePromise = { method, timerStart: Date.now(), resolve: resolveWithCleanup, reject: rejectWithCleanup };
            try {
              await messageWriter.write(requestMessage);
              responsePromises.set(id, responsePromise);
            } catch (error) {
              logger.error(`Sending request failed.`);
              responsePromise.reject(new messages_1.ResponseError(messages_1.ErrorCodes.MessageWriteError, error.message ? error.message : "Unknown reason"));
              throw error;
            }
          });
        },
        onRequest: (type, handler) => {
          throwIfClosedOrDisposed();
          let method = null;
          if (StarRequestHandler.is(type)) {
            method = void 0;
            starRequestHandler = type;
          } else if (Is.string(type)) {
            method = null;
            if (handler !== void 0) {
              method = type;
              requestHandlers.set(type, { handler, type: void 0 });
            }
          } else {
            if (handler !== void 0) {
              method = type.method;
              requestHandlers.set(type.method, { type, handler });
            }
          }
          return {
            dispose: () => {
              if (method === null) {
                return;
              }
              if (method !== void 0) {
                requestHandlers.delete(method);
              } else {
                starRequestHandler = void 0;
              }
            }
          };
        },
        hasPendingResponse: () => {
          return responsePromises.size > 0;
        },
        trace: async (_value, _tracer, sendNotificationOrTraceOptions) => {
          let _sendNotification = false;
          let _traceFormat = TraceFormat.Text;
          if (sendNotificationOrTraceOptions !== void 0) {
            if (Is.boolean(sendNotificationOrTraceOptions)) {
              _sendNotification = sendNotificationOrTraceOptions;
            } else {
              _sendNotification = sendNotificationOrTraceOptions.sendNotification || false;
              _traceFormat = sendNotificationOrTraceOptions.traceFormat || TraceFormat.Text;
            }
          }
          trace = _value;
          traceFormat = _traceFormat;
          if (trace === Trace.Off) {
            tracer = void 0;
          } else {
            tracer = _tracer;
          }
          if (_sendNotification && !isClosed() && !isDisposed()) {
            await connection2.sendNotification(SetTraceNotification.type, { value: Trace.toString(_value) });
          }
        },
        onError: errorEmitter.event,
        onClose: closeEmitter.event,
        onUnhandledNotification: unhandledNotificationEmitter.event,
        onDispose: disposeEmitter.event,
        end: () => {
          messageWriter.end();
        },
        dispose: () => {
          if (isDisposed()) {
            return;
          }
          state2 = ConnectionState.Disposed;
          disposeEmitter.fire(void 0);
          const error = new messages_1.ResponseError(messages_1.ErrorCodes.PendingResponseRejected, "Pending response rejected since connection got disposed");
          for (const promise of responsePromises.values()) {
            promise.reject(error);
          }
          responsePromises = /* @__PURE__ */ new Map();
          requestTokens = /* @__PURE__ */ new Map();
          knownCanceledRequests = /* @__PURE__ */ new Set();
          messageQueue = new linkedMap_1.LinkedMap();
          if (Is.func(messageWriter.dispose)) {
            messageWriter.dispose();
          }
          if (Is.func(messageReader.dispose)) {
            messageReader.dispose();
          }
        },
        listen: () => {
          throwIfClosedOrDisposed();
          throwIfListening();
          state2 = ConnectionState.Listening;
          messageReader.listen(callback);
        },
        inspect: () => {
          (0, ral_1.default)().console.log("inspect");
        }
      };
      connection2.onNotification(LogTraceNotification.type, (params) => {
        if (trace === Trace.Off || !tracer) {
          return;
        }
        const verbose = trace === Trace.Verbose || trace === Trace.Compact;
        tracer.log(params.message, verbose ? params.verbose : void 0);
      });
      connection2.onNotification(ProgressNotification.type, (params) => {
        const handler = progressHandlers.get(params.token);
        if (handler) {
          handler(params.value);
        } else {
          unhandledProgressEmitter.fire(params);
        }
      });
      return connection2;
    }
    exports2.createMessageConnection = createMessageConnection;
  }
});

// node_modules/vscode-jsonrpc/lib/common/api.js
var require_api = __commonJS({
  "node_modules/vscode-jsonrpc/lib/common/api.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ProgressType = exports2.ProgressToken = exports2.createMessageConnection = exports2.NullLogger = exports2.ConnectionOptions = exports2.ConnectionStrategy = exports2.AbstractMessageBuffer = exports2.WriteableStreamMessageWriter = exports2.AbstractMessageWriter = exports2.MessageWriter = exports2.ReadableStreamMessageReader = exports2.AbstractMessageReader = exports2.MessageReader = exports2.SharedArrayReceiverStrategy = exports2.SharedArraySenderStrategy = exports2.CancellationToken = exports2.CancellationTokenSource = exports2.Emitter = exports2.Event = exports2.Disposable = exports2.LRUCache = exports2.Touch = exports2.LinkedMap = exports2.ParameterStructures = exports2.NotificationType9 = exports2.NotificationType8 = exports2.NotificationType7 = exports2.NotificationType6 = exports2.NotificationType5 = exports2.NotificationType4 = exports2.NotificationType3 = exports2.NotificationType2 = exports2.NotificationType1 = exports2.NotificationType0 = exports2.NotificationType = exports2.ErrorCodes = exports2.ResponseError = exports2.RequestType9 = exports2.RequestType8 = exports2.RequestType7 = exports2.RequestType6 = exports2.RequestType5 = exports2.RequestType4 = exports2.RequestType3 = exports2.RequestType2 = exports2.RequestType1 = exports2.RequestType0 = exports2.RequestType = exports2.Message = exports2.RAL = void 0;
    exports2.MessageStrategy = exports2.CancellationStrategy = exports2.CancellationSenderStrategy = exports2.CancellationReceiverStrategy = exports2.ConnectionError = exports2.ConnectionErrors = exports2.LogTraceNotification = exports2.SetTraceNotification = exports2.TraceFormat = exports2.TraceValues = exports2.Trace = void 0;
    var messages_1 = require_messages();
    Object.defineProperty(exports2, "Message", { enumerable: true, get: function() {
      return messages_1.Message;
    } });
    Object.defineProperty(exports2, "RequestType", { enumerable: true, get: function() {
      return messages_1.RequestType;
    } });
    Object.defineProperty(exports2, "RequestType0", { enumerable: true, get: function() {
      return messages_1.RequestType0;
    } });
    Object.defineProperty(exports2, "RequestType1", { enumerable: true, get: function() {
      return messages_1.RequestType1;
    } });
    Object.defineProperty(exports2, "RequestType2", { enumerable: true, get: function() {
      return messages_1.RequestType2;
    } });
    Object.defineProperty(exports2, "RequestType3", { enumerable: true, get: function() {
      return messages_1.RequestType3;
    } });
    Object.defineProperty(exports2, "RequestType4", { enumerable: true, get: function() {
      return messages_1.RequestType4;
    } });
    Object.defineProperty(exports2, "RequestType5", { enumerable: true, get: function() {
      return messages_1.RequestType5;
    } });
    Object.defineProperty(exports2, "RequestType6", { enumerable: true, get: function() {
      return messages_1.RequestType6;
    } });
    Object.defineProperty(exports2, "RequestType7", { enumerable: true, get: function() {
      return messages_1.RequestType7;
    } });
    Object.defineProperty(exports2, "RequestType8", { enumerable: true, get: function() {
      return messages_1.RequestType8;
    } });
    Object.defineProperty(exports2, "RequestType9", { enumerable: true, get: function() {
      return messages_1.RequestType9;
    } });
    Object.defineProperty(exports2, "ResponseError", { enumerable: true, get: function() {
      return messages_1.ResponseError;
    } });
    Object.defineProperty(exports2, "ErrorCodes", { enumerable: true, get: function() {
      return messages_1.ErrorCodes;
    } });
    Object.defineProperty(exports2, "NotificationType", { enumerable: true, get: function() {
      return messages_1.NotificationType;
    } });
    Object.defineProperty(exports2, "NotificationType0", { enumerable: true, get: function() {
      return messages_1.NotificationType0;
    } });
    Object.defineProperty(exports2, "NotificationType1", { enumerable: true, get: function() {
      return messages_1.NotificationType1;
    } });
    Object.defineProperty(exports2, "NotificationType2", { enumerable: true, get: function() {
      return messages_1.NotificationType2;
    } });
    Object.defineProperty(exports2, "NotificationType3", { enumerable: true, get: function() {
      return messages_1.NotificationType3;
    } });
    Object.defineProperty(exports2, "NotificationType4", { enumerable: true, get: function() {
      return messages_1.NotificationType4;
    } });
    Object.defineProperty(exports2, "NotificationType5", { enumerable: true, get: function() {
      return messages_1.NotificationType5;
    } });
    Object.defineProperty(exports2, "NotificationType6", { enumerable: true, get: function() {
      return messages_1.NotificationType6;
    } });
    Object.defineProperty(exports2, "NotificationType7", { enumerable: true, get: function() {
      return messages_1.NotificationType7;
    } });
    Object.defineProperty(exports2, "NotificationType8", { enumerable: true, get: function() {
      return messages_1.NotificationType8;
    } });
    Object.defineProperty(exports2, "NotificationType9", { enumerable: true, get: function() {
      return messages_1.NotificationType9;
    } });
    Object.defineProperty(exports2, "ParameterStructures", { enumerable: true, get: function() {
      return messages_1.ParameterStructures;
    } });
    var linkedMap_1 = require_linkedMap();
    Object.defineProperty(exports2, "LinkedMap", { enumerable: true, get: function() {
      return linkedMap_1.LinkedMap;
    } });
    Object.defineProperty(exports2, "LRUCache", { enumerable: true, get: function() {
      return linkedMap_1.LRUCache;
    } });
    Object.defineProperty(exports2, "Touch", { enumerable: true, get: function() {
      return linkedMap_1.Touch;
    } });
    var disposable_1 = require_disposable();
    Object.defineProperty(exports2, "Disposable", { enumerable: true, get: function() {
      return disposable_1.Disposable;
    } });
    var events_1 = require_events();
    Object.defineProperty(exports2, "Event", { enumerable: true, get: function() {
      return events_1.Event;
    } });
    Object.defineProperty(exports2, "Emitter", { enumerable: true, get: function() {
      return events_1.Emitter;
    } });
    var cancellation_1 = require_cancellation();
    Object.defineProperty(exports2, "CancellationTokenSource", { enumerable: true, get: function() {
      return cancellation_1.CancellationTokenSource;
    } });
    Object.defineProperty(exports2, "CancellationToken", { enumerable: true, get: function() {
      return cancellation_1.CancellationToken;
    } });
    var sharedArrayCancellation_1 = require_sharedArrayCancellation();
    Object.defineProperty(exports2, "SharedArraySenderStrategy", { enumerable: true, get: function() {
      return sharedArrayCancellation_1.SharedArraySenderStrategy;
    } });
    Object.defineProperty(exports2, "SharedArrayReceiverStrategy", { enumerable: true, get: function() {
      return sharedArrayCancellation_1.SharedArrayReceiverStrategy;
    } });
    var messageReader_1 = require_messageReader();
    Object.defineProperty(exports2, "MessageReader", { enumerable: true, get: function() {
      return messageReader_1.MessageReader;
    } });
    Object.defineProperty(exports2, "AbstractMessageReader", { enumerable: true, get: function() {
      return messageReader_1.AbstractMessageReader;
    } });
    Object.defineProperty(exports2, "ReadableStreamMessageReader", { enumerable: true, get: function() {
      return messageReader_1.ReadableStreamMessageReader;
    } });
    var messageWriter_1 = require_messageWriter();
    Object.defineProperty(exports2, "MessageWriter", { enumerable: true, get: function() {
      return messageWriter_1.MessageWriter;
    } });
    Object.defineProperty(exports2, "AbstractMessageWriter", { enumerable: true, get: function() {
      return messageWriter_1.AbstractMessageWriter;
    } });
    Object.defineProperty(exports2, "WriteableStreamMessageWriter", { enumerable: true, get: function() {
      return messageWriter_1.WriteableStreamMessageWriter;
    } });
    var messageBuffer_1 = require_messageBuffer();
    Object.defineProperty(exports2, "AbstractMessageBuffer", { enumerable: true, get: function() {
      return messageBuffer_1.AbstractMessageBuffer;
    } });
    var connection_1 = require_connection();
    Object.defineProperty(exports2, "ConnectionStrategy", { enumerable: true, get: function() {
      return connection_1.ConnectionStrategy;
    } });
    Object.defineProperty(exports2, "ConnectionOptions", { enumerable: true, get: function() {
      return connection_1.ConnectionOptions;
    } });
    Object.defineProperty(exports2, "NullLogger", { enumerable: true, get: function() {
      return connection_1.NullLogger;
    } });
    Object.defineProperty(exports2, "createMessageConnection", { enumerable: true, get: function() {
      return connection_1.createMessageConnection;
    } });
    Object.defineProperty(exports2, "ProgressToken", { enumerable: true, get: function() {
      return connection_1.ProgressToken;
    } });
    Object.defineProperty(exports2, "ProgressType", { enumerable: true, get: function() {
      return connection_1.ProgressType;
    } });
    Object.defineProperty(exports2, "Trace", { enumerable: true, get: function() {
      return connection_1.Trace;
    } });
    Object.defineProperty(exports2, "TraceValues", { enumerable: true, get: function() {
      return connection_1.TraceValues;
    } });
    Object.defineProperty(exports2, "TraceFormat", { enumerable: true, get: function() {
      return connection_1.TraceFormat;
    } });
    Object.defineProperty(exports2, "SetTraceNotification", { enumerable: true, get: function() {
      return connection_1.SetTraceNotification;
    } });
    Object.defineProperty(exports2, "LogTraceNotification", { enumerable: true, get: function() {
      return connection_1.LogTraceNotification;
    } });
    Object.defineProperty(exports2, "ConnectionErrors", { enumerable: true, get: function() {
      return connection_1.ConnectionErrors;
    } });
    Object.defineProperty(exports2, "ConnectionError", { enumerable: true, get: function() {
      return connection_1.ConnectionError;
    } });
    Object.defineProperty(exports2, "CancellationReceiverStrategy", { enumerable: true, get: function() {
      return connection_1.CancellationReceiverStrategy;
    } });
    Object.defineProperty(exports2, "CancellationSenderStrategy", { enumerable: true, get: function() {
      return connection_1.CancellationSenderStrategy;
    } });
    Object.defineProperty(exports2, "CancellationStrategy", { enumerable: true, get: function() {
      return connection_1.CancellationStrategy;
    } });
    Object.defineProperty(exports2, "MessageStrategy", { enumerable: true, get: function() {
      return connection_1.MessageStrategy;
    } });
    var ral_1 = require_ral();
    exports2.RAL = ral_1.default;
  }
});

// node_modules/vscode-jsonrpc/lib/node/ril.js
var require_ril = __commonJS({
  "node_modules/vscode-jsonrpc/lib/node/ril.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var util_1 = require("util");
    var api_1 = require_api();
    var MessageBuffer = class _MessageBuffer extends api_1.AbstractMessageBuffer {
      constructor(encoding = "utf-8") {
        super(encoding);
      }
      emptyBuffer() {
        return _MessageBuffer.emptyBuffer;
      }
      fromString(value, encoding) {
        return Buffer.from(value, encoding);
      }
      toString(value, encoding) {
        if (value instanceof Buffer) {
          return value.toString(encoding);
        } else {
          return new util_1.TextDecoder(encoding).decode(value);
        }
      }
      asNative(buffer, length) {
        if (length === void 0) {
          return buffer instanceof Buffer ? buffer : Buffer.from(buffer);
        } else {
          return buffer instanceof Buffer ? buffer.slice(0, length) : Buffer.from(buffer, 0, length);
        }
      }
      allocNative(length) {
        return Buffer.allocUnsafe(length);
      }
    };
    MessageBuffer.emptyBuffer = Buffer.allocUnsafe(0);
    var ReadableStreamWrapper = class {
      constructor(stream) {
        this.stream = stream;
      }
      onClose(listener) {
        this.stream.on("close", listener);
        return api_1.Disposable.create(() => this.stream.off("close", listener));
      }
      onError(listener) {
        this.stream.on("error", listener);
        return api_1.Disposable.create(() => this.stream.off("error", listener));
      }
      onEnd(listener) {
        this.stream.on("end", listener);
        return api_1.Disposable.create(() => this.stream.off("end", listener));
      }
      onData(listener) {
        this.stream.on("data", listener);
        return api_1.Disposable.create(() => this.stream.off("data", listener));
      }
    };
    var WritableStreamWrapper = class {
      constructor(stream) {
        this.stream = stream;
      }
      onClose(listener) {
        this.stream.on("close", listener);
        return api_1.Disposable.create(() => this.stream.off("close", listener));
      }
      onError(listener) {
        this.stream.on("error", listener);
        return api_1.Disposable.create(() => this.stream.off("error", listener));
      }
      onEnd(listener) {
        this.stream.on("end", listener);
        return api_1.Disposable.create(() => this.stream.off("end", listener));
      }
      write(data, encoding) {
        return new Promise((resolve, reject) => {
          const callback = (error) => {
            if (error === void 0 || error === null) {
              resolve();
            } else {
              reject(error);
            }
          };
          if (typeof data === "string") {
            this.stream.write(data, encoding, callback);
          } else {
            this.stream.write(data, callback);
          }
        });
      }
      end() {
        this.stream.end();
      }
    };
    var _ril = Object.freeze({
      messageBuffer: Object.freeze({
        create: (encoding) => new MessageBuffer(encoding)
      }),
      applicationJson: Object.freeze({
        encoder: Object.freeze({
          name: "application/json",
          encode: (msg, options) => {
            try {
              return Promise.resolve(Buffer.from(JSON.stringify(msg, void 0, 0), options.charset));
            } catch (err) {
              return Promise.reject(err);
            }
          }
        }),
        decoder: Object.freeze({
          name: "application/json",
          decode: (buffer, options) => {
            try {
              if (buffer instanceof Buffer) {
                return Promise.resolve(JSON.parse(buffer.toString(options.charset)));
              } else {
                return Promise.resolve(JSON.parse(new util_1.TextDecoder(options.charset).decode(buffer)));
              }
            } catch (err) {
              return Promise.reject(err);
            }
          }
        })
      }),
      stream: Object.freeze({
        asReadableStream: (stream) => new ReadableStreamWrapper(stream),
        asWritableStream: (stream) => new WritableStreamWrapper(stream)
      }),
      console,
      timer: Object.freeze({
        setTimeout(callback, ms, ...args) {
          const handle = setTimeout(callback, ms, ...args);
          return { dispose: () => clearTimeout(handle) };
        },
        setImmediate(callback, ...args) {
          const handle = setImmediate(callback, ...args);
          return { dispose: () => clearImmediate(handle) };
        },
        setInterval(callback, ms, ...args) {
          const handle = setInterval(callback, ms, ...args);
          return { dispose: () => clearInterval(handle) };
        }
      })
    });
    function RIL() {
      return _ril;
    }
    (function(RIL2) {
      function install() {
        api_1.RAL.install(_ril);
      }
      RIL2.install = install;
    })(RIL || (RIL = {}));
    exports2.default = RIL;
  }
});

// node_modules/vscode-jsonrpc/lib/node/main.js
var require_main = __commonJS({
  "node_modules/vscode-jsonrpc/lib/node/main.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createMessageConnection = exports2.createServerSocketTransport = exports2.createClientSocketTransport = exports2.createServerPipeTransport = exports2.createClientPipeTransport = exports2.generateRandomPipeName = exports2.StreamMessageWriter = exports2.StreamMessageReader = exports2.SocketMessageWriter = exports2.SocketMessageReader = exports2.PortMessageWriter = exports2.PortMessageReader = exports2.IPCMessageWriter = exports2.IPCMessageReader = void 0;
    var ril_1 = require_ril();
    ril_1.default.install();
    var path = require("path");
    var os = require("os");
    var crypto_1 = require("crypto");
    var net_1 = require("net");
    var api_1 = require_api();
    __exportStar(require_api(), exports2);
    var IPCMessageReader = class extends api_1.AbstractMessageReader {
      constructor(process2) {
        super();
        this.process = process2;
        let eventEmitter = this.process;
        eventEmitter.on("error", (error) => this.fireError(error));
        eventEmitter.on("close", () => this.fireClose());
      }
      listen(callback) {
        this.process.on("message", callback);
        return api_1.Disposable.create(() => this.process.off("message", callback));
      }
    };
    exports2.IPCMessageReader = IPCMessageReader;
    var IPCMessageWriter = class extends api_1.AbstractMessageWriter {
      constructor(process2) {
        super();
        this.process = process2;
        this.errorCount = 0;
        const eventEmitter = this.process;
        eventEmitter.on("error", (error) => this.fireError(error));
        eventEmitter.on("close", () => this.fireClose);
      }
      write(msg) {
        try {
          if (typeof this.process.send === "function") {
            this.process.send(msg, void 0, void 0, (error) => {
              if (error) {
                this.errorCount++;
                this.handleError(error, msg);
              } else {
                this.errorCount = 0;
              }
            });
          }
          return Promise.resolve();
        } catch (error) {
          this.handleError(error, msg);
          return Promise.reject(error);
        }
      }
      handleError(error, msg) {
        this.errorCount++;
        this.fireError(error, msg, this.errorCount);
      }
      end() {
      }
    };
    exports2.IPCMessageWriter = IPCMessageWriter;
    var PortMessageReader = class extends api_1.AbstractMessageReader {
      constructor(port) {
        super();
        this.onData = new api_1.Emitter();
        port.on("close", () => this.fireClose);
        port.on("error", (error) => this.fireError(error));
        port.on("message", (message) => {
          this.onData.fire(message);
        });
      }
      listen(callback) {
        return this.onData.event(callback);
      }
    };
    exports2.PortMessageReader = PortMessageReader;
    var PortMessageWriter = class extends api_1.AbstractMessageWriter {
      constructor(port) {
        super();
        this.port = port;
        this.errorCount = 0;
        port.on("close", () => this.fireClose());
        port.on("error", (error) => this.fireError(error));
      }
      write(msg) {
        try {
          this.port.postMessage(msg);
          return Promise.resolve();
        } catch (error) {
          this.handleError(error, msg);
          return Promise.reject(error);
        }
      }
      handleError(error, msg) {
        this.errorCount++;
        this.fireError(error, msg, this.errorCount);
      }
      end() {
      }
    };
    exports2.PortMessageWriter = PortMessageWriter;
    var SocketMessageReader = class extends api_1.ReadableStreamMessageReader {
      constructor(socket, encoding = "utf-8") {
        super((0, ril_1.default)().stream.asReadableStream(socket), encoding);
      }
    };
    exports2.SocketMessageReader = SocketMessageReader;
    var SocketMessageWriter = class extends api_1.WriteableStreamMessageWriter {
      constructor(socket, options) {
        super((0, ril_1.default)().stream.asWritableStream(socket), options);
        this.socket = socket;
      }
      dispose() {
        super.dispose();
        this.socket.destroy();
      }
    };
    exports2.SocketMessageWriter = SocketMessageWriter;
    var StreamMessageReader = class extends api_1.ReadableStreamMessageReader {
      constructor(readable, encoding) {
        super((0, ril_1.default)().stream.asReadableStream(readable), encoding);
      }
    };
    exports2.StreamMessageReader = StreamMessageReader;
    var StreamMessageWriter = class extends api_1.WriteableStreamMessageWriter {
      constructor(writable, options) {
        super((0, ril_1.default)().stream.asWritableStream(writable), options);
      }
    };
    exports2.StreamMessageWriter = StreamMessageWriter;
    var XDG_RUNTIME_DIR = process.env["XDG_RUNTIME_DIR"];
    var safeIpcPathLengths = /* @__PURE__ */ new Map([
      ["linux", 107],
      ["darwin", 103]
    ]);
    function generateRandomPipeName() {
      const randomSuffix = (0, crypto_1.randomBytes)(21).toString("hex");
      if (process.platform === "win32") {
        return `\\\\.\\pipe\\vscode-jsonrpc-${randomSuffix}-sock`;
      }
      let result;
      if (XDG_RUNTIME_DIR) {
        result = path.join(XDG_RUNTIME_DIR, `vscode-ipc-${randomSuffix}.sock`);
      } else {
        result = path.join(os.tmpdir(), `vscode-${randomSuffix}.sock`);
      }
      const limit = safeIpcPathLengths.get(process.platform);
      if (limit !== void 0 && result.length > limit) {
        (0, ril_1.default)().console.warn(`WARNING: IPC handle "${result}" is longer than ${limit} characters.`);
      }
      return result;
    }
    exports2.generateRandomPipeName = generateRandomPipeName;
    function createClientPipeTransport(pipeName, encoding = "utf-8") {
      let connectResolve;
      const connected = new Promise((resolve, _reject) => {
        connectResolve = resolve;
      });
      return new Promise((resolve, reject) => {
        let server = (0, net_1.createServer)((socket) => {
          server.close();
          connectResolve([
            new SocketMessageReader(socket, encoding),
            new SocketMessageWriter(socket, encoding)
          ]);
        });
        server.on("error", reject);
        server.listen(pipeName, () => {
          server.removeListener("error", reject);
          resolve({
            onConnected: () => {
              return connected;
            }
          });
        });
      });
    }
    exports2.createClientPipeTransport = createClientPipeTransport;
    function createServerPipeTransport(pipeName, encoding = "utf-8") {
      const socket = (0, net_1.createConnection)(pipeName);
      return [
        new SocketMessageReader(socket, encoding),
        new SocketMessageWriter(socket, encoding)
      ];
    }
    exports2.createServerPipeTransport = createServerPipeTransport;
    function createClientSocketTransport(port, encoding = "utf-8") {
      let connectResolve;
      const connected = new Promise((resolve, _reject) => {
        connectResolve = resolve;
      });
      return new Promise((resolve, reject) => {
        const server = (0, net_1.createServer)((socket) => {
          server.close();
          connectResolve([
            new SocketMessageReader(socket, encoding),
            new SocketMessageWriter(socket, encoding)
          ]);
        });
        server.on("error", reject);
        server.listen(port, "127.0.0.1", () => {
          server.removeListener("error", reject);
          resolve({
            onConnected: () => {
              return connected;
            }
          });
        });
      });
    }
    exports2.createClientSocketTransport = createClientSocketTransport;
    function createServerSocketTransport(port, encoding = "utf-8") {
      const socket = (0, net_1.createConnection)(port, "127.0.0.1");
      return [
        new SocketMessageReader(socket, encoding),
        new SocketMessageWriter(socket, encoding)
      ];
    }
    exports2.createServerSocketTransport = createServerSocketTransport;
    function isReadableStream(value) {
      const candidate = value;
      return candidate.read !== void 0 && candidate.addListener !== void 0;
    }
    function isWritableStream(value) {
      const candidate = value;
      return candidate.write !== void 0 && candidate.addListener !== void 0;
    }
    function createMessageConnection(input, output, logger, options) {
      if (!logger) {
        logger = api_1.NullLogger;
      }
      const reader = isReadableStream(input) ? new StreamMessageReader(input) : input;
      const writer = isWritableStream(output) ? new StreamMessageWriter(output) : output;
      if (api_1.ConnectionStrategy.is(options)) {
        options = { connectionStrategy: options };
      }
      return (0, api_1.createMessageConnection)(reader, writer, logger, options);
    }
    exports2.createMessageConnection = createMessageConnection;
  }
});

// node_modules/vscode-jsonrpc/node.js
var require_node = __commonJS({
  "node_modules/vscode-jsonrpc/node.js"(exports2, module2) {
    "use strict";
    module2.exports = require_main();
  }
});

// node_modules/vscode-languageserver-types/lib/umd/main.js
var require_main2 = __commonJS({
  "node_modules/vscode-languageserver-types/lib/umd/main.js"(exports2, module2) {
    (function(factory) {
      if (typeof module2 === "object" && typeof module2.exports === "object") {
        var v = factory(require, exports2);
        if (v !== void 0) module2.exports = v;
      } else if (typeof define === "function" && define.amd) {
        define(["require", "exports"], factory);
      }
    })(function(require2, exports3) {
      "use strict";
      Object.defineProperty(exports3, "__esModule", { value: true });
      exports3.TextDocument = exports3.EOL = exports3.WorkspaceFolder = exports3.InlineCompletionContext = exports3.SelectedCompletionInfo = exports3.InlineCompletionTriggerKind = exports3.InlineCompletionList = exports3.InlineCompletionItem = exports3.StringValue = exports3.InlayHint = exports3.InlayHintLabelPart = exports3.InlayHintKind = exports3.InlineValueContext = exports3.InlineValueEvaluatableExpression = exports3.InlineValueVariableLookup = exports3.InlineValueText = exports3.SemanticTokens = exports3.SemanticTokenModifiers = exports3.SemanticTokenTypes = exports3.SelectionRange = exports3.DocumentLink = exports3.FormattingOptions = exports3.CodeLens = exports3.CodeAction = exports3.CodeActionContext = exports3.CodeActionTriggerKind = exports3.CodeActionKind = exports3.DocumentSymbol = exports3.WorkspaceSymbol = exports3.SymbolInformation = exports3.SymbolTag = exports3.SymbolKind = exports3.DocumentHighlight = exports3.DocumentHighlightKind = exports3.SignatureInformation = exports3.ParameterInformation = exports3.Hover = exports3.MarkedString = exports3.CompletionList = exports3.CompletionItem = exports3.CompletionItemLabelDetails = exports3.InsertTextMode = exports3.InsertReplaceEdit = exports3.CompletionItemTag = exports3.InsertTextFormat = exports3.CompletionItemKind = exports3.MarkupContent = exports3.MarkupKind = exports3.TextDocumentItem = exports3.OptionalVersionedTextDocumentIdentifier = exports3.VersionedTextDocumentIdentifier = exports3.TextDocumentIdentifier = exports3.WorkspaceChange = exports3.WorkspaceEdit = exports3.DeleteFile = exports3.RenameFile = exports3.CreateFile = exports3.TextDocumentEdit = exports3.AnnotatedTextEdit = exports3.ChangeAnnotationIdentifier = exports3.ChangeAnnotation = exports3.TextEdit = exports3.Command = exports3.Diagnostic = exports3.CodeDescription = exports3.DiagnosticTag = exports3.DiagnosticSeverity = exports3.DiagnosticRelatedInformation = exports3.FoldingRange = exports3.FoldingRangeKind = exports3.ColorPresentation = exports3.ColorInformation = exports3.Color = exports3.LocationLink = exports3.Location = exports3.Range = exports3.Position = exports3.uinteger = exports3.integer = exports3.URI = exports3.DocumentUri = void 0;
      var DocumentUri;
      (function(DocumentUri2) {
        function is(value) {
          return typeof value === "string";
        }
        DocumentUri2.is = is;
      })(DocumentUri || (exports3.DocumentUri = DocumentUri = {}));
      var URI;
      (function(URI2) {
        function is(value) {
          return typeof value === "string";
        }
        URI2.is = is;
      })(URI || (exports3.URI = URI = {}));
      var integer;
      (function(integer2) {
        integer2.MIN_VALUE = -2147483648;
        integer2.MAX_VALUE = 2147483647;
        function is(value) {
          return typeof value === "number" && integer2.MIN_VALUE <= value && value <= integer2.MAX_VALUE;
        }
        integer2.is = is;
      })(integer || (exports3.integer = integer = {}));
      var uinteger;
      (function(uinteger2) {
        uinteger2.MIN_VALUE = 0;
        uinteger2.MAX_VALUE = 2147483647;
        function is(value) {
          return typeof value === "number" && uinteger2.MIN_VALUE <= value && value <= uinteger2.MAX_VALUE;
        }
        uinteger2.is = is;
      })(uinteger || (exports3.uinteger = uinteger = {}));
      var Position2;
      (function(Position3) {
        function create(line, character) {
          if (line === Number.MAX_VALUE) {
            line = uinteger.MAX_VALUE;
          }
          if (character === Number.MAX_VALUE) {
            character = uinteger.MAX_VALUE;
          }
          return { line, character };
        }
        Position3.create = create;
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && Is.uinteger(candidate.line) && Is.uinteger(candidate.character);
        }
        Position3.is = is;
      })(Position2 || (exports3.Position = Position2 = {}));
      var Range;
      (function(Range2) {
        function create(one, two, three, four) {
          if (Is.uinteger(one) && Is.uinteger(two) && Is.uinteger(three) && Is.uinteger(four)) {
            return { start: Position2.create(one, two), end: Position2.create(three, four) };
          } else if (Position2.is(one) && Position2.is(two)) {
            return { start: one, end: two };
          } else {
            throw new Error("Range#create called with invalid arguments[".concat(one, ", ").concat(two, ", ").concat(three, ", ").concat(four, "]"));
          }
        }
        Range2.create = create;
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && Position2.is(candidate.start) && Position2.is(candidate.end);
        }
        Range2.is = is;
      })(Range || (exports3.Range = Range = {}));
      var Location;
      (function(Location2) {
        function create(uri, range) {
          return { uri, range };
        }
        Location2.create = create;
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && Range.is(candidate.range) && (Is.string(candidate.uri) || Is.undefined(candidate.uri));
        }
        Location2.is = is;
      })(Location || (exports3.Location = Location = {}));
      var LocationLink;
      (function(LocationLink2) {
        function create(targetUri, targetRange, targetSelectionRange, originSelectionRange) {
          return { targetUri, targetRange, targetSelectionRange, originSelectionRange };
        }
        LocationLink2.create = create;
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && Range.is(candidate.targetRange) && Is.string(candidate.targetUri) && Range.is(candidate.targetSelectionRange) && (Range.is(candidate.originSelectionRange) || Is.undefined(candidate.originSelectionRange));
        }
        LocationLink2.is = is;
      })(LocationLink || (exports3.LocationLink = LocationLink = {}));
      var Color;
      (function(Color2) {
        function create(red, green, blue, alpha) {
          return {
            red,
            green,
            blue,
            alpha
          };
        }
        Color2.create = create;
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && Is.numberRange(candidate.red, 0, 1) && Is.numberRange(candidate.green, 0, 1) && Is.numberRange(candidate.blue, 0, 1) && Is.numberRange(candidate.alpha, 0, 1);
        }
        Color2.is = is;
      })(Color || (exports3.Color = Color = {}));
      var ColorInformation;
      (function(ColorInformation2) {
        function create(range, color) {
          return {
            range,
            color
          };
        }
        ColorInformation2.create = create;
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && Range.is(candidate.range) && Color.is(candidate.color);
        }
        ColorInformation2.is = is;
      })(ColorInformation || (exports3.ColorInformation = ColorInformation = {}));
      var ColorPresentation;
      (function(ColorPresentation2) {
        function create(label, textEdit, additionalTextEdits) {
          return {
            label,
            textEdit,
            additionalTextEdits
          };
        }
        ColorPresentation2.create = create;
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && Is.string(candidate.label) && (Is.undefined(candidate.textEdit) || TextEdit.is(candidate)) && (Is.undefined(candidate.additionalTextEdits) || Is.typedArray(candidate.additionalTextEdits, TextEdit.is));
        }
        ColorPresentation2.is = is;
      })(ColorPresentation || (exports3.ColorPresentation = ColorPresentation = {}));
      var FoldingRangeKind;
      (function(FoldingRangeKind2) {
        FoldingRangeKind2.Comment = "comment";
        FoldingRangeKind2.Imports = "imports";
        FoldingRangeKind2.Region = "region";
      })(FoldingRangeKind || (exports3.FoldingRangeKind = FoldingRangeKind = {}));
      var FoldingRange;
      (function(FoldingRange2) {
        function create(startLine, endLine, startCharacter, endCharacter, kind, collapsedText) {
          var result = {
            startLine,
            endLine
          };
          if (Is.defined(startCharacter)) {
            result.startCharacter = startCharacter;
          }
          if (Is.defined(endCharacter)) {
            result.endCharacter = endCharacter;
          }
          if (Is.defined(kind)) {
            result.kind = kind;
          }
          if (Is.defined(collapsedText)) {
            result.collapsedText = collapsedText;
          }
          return result;
        }
        FoldingRange2.create = create;
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && Is.uinteger(candidate.startLine) && Is.uinteger(candidate.startLine) && (Is.undefined(candidate.startCharacter) || Is.uinteger(candidate.startCharacter)) && (Is.undefined(candidate.endCharacter) || Is.uinteger(candidate.endCharacter)) && (Is.undefined(candidate.kind) || Is.string(candidate.kind));
        }
        FoldingRange2.is = is;
      })(FoldingRange || (exports3.FoldingRange = FoldingRange = {}));
      var DiagnosticRelatedInformation;
      (function(DiagnosticRelatedInformation2) {
        function create(location, message) {
          return {
            location,
            message
          };
        }
        DiagnosticRelatedInformation2.create = create;
        function is(value) {
          var candidate = value;
          return Is.defined(candidate) && Location.is(candidate.location) && Is.string(candidate.message);
        }
        DiagnosticRelatedInformation2.is = is;
      })(DiagnosticRelatedInformation || (exports3.DiagnosticRelatedInformation = DiagnosticRelatedInformation = {}));
      var DiagnosticSeverity2;
      (function(DiagnosticSeverity3) {
        DiagnosticSeverity3.Error = 1;
        DiagnosticSeverity3.Warning = 2;
        DiagnosticSeverity3.Information = 3;
        DiagnosticSeverity3.Hint = 4;
      })(DiagnosticSeverity2 || (exports3.DiagnosticSeverity = DiagnosticSeverity2 = {}));
      var DiagnosticTag;
      (function(DiagnosticTag2) {
        DiagnosticTag2.Unnecessary = 1;
        DiagnosticTag2.Deprecated = 2;
      })(DiagnosticTag || (exports3.DiagnosticTag = DiagnosticTag = {}));
      var CodeDescription;
      (function(CodeDescription2) {
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && Is.string(candidate.href);
        }
        CodeDescription2.is = is;
      })(CodeDescription || (exports3.CodeDescription = CodeDescription = {}));
      var Diagnostic;
      (function(Diagnostic2) {
        function create(range, message, severity, code, source, relatedInformation) {
          var result = { range, message };
          if (Is.defined(severity)) {
            result.severity = severity;
          }
          if (Is.defined(code)) {
            result.code = code;
          }
          if (Is.defined(source)) {
            result.source = source;
          }
          if (Is.defined(relatedInformation)) {
            result.relatedInformation = relatedInformation;
          }
          return result;
        }
        Diagnostic2.create = create;
        function is(value) {
          var _a;
          var candidate = value;
          return Is.defined(candidate) && Range.is(candidate.range) && Is.string(candidate.message) && (Is.number(candidate.severity) || Is.undefined(candidate.severity)) && (Is.integer(candidate.code) || Is.string(candidate.code) || Is.undefined(candidate.code)) && (Is.undefined(candidate.codeDescription) || Is.string((_a = candidate.codeDescription) === null || _a === void 0 ? void 0 : _a.href)) && (Is.string(candidate.source) || Is.undefined(candidate.source)) && (Is.undefined(candidate.relatedInformation) || Is.typedArray(candidate.relatedInformation, DiagnosticRelatedInformation.is));
        }
        Diagnostic2.is = is;
      })(Diagnostic || (exports3.Diagnostic = Diagnostic = {}));
      var Command;
      (function(Command2) {
        function create(title, command) {
          var args = [];
          for (var _i = 2; _i < arguments.length; _i++) {
            args[_i - 2] = arguments[_i];
          }
          var result = { title, command };
          if (Is.defined(args) && args.length > 0) {
            result.arguments = args;
          }
          return result;
        }
        Command2.create = create;
        function is(value) {
          var candidate = value;
          return Is.defined(candidate) && Is.string(candidate.title) && Is.string(candidate.command);
        }
        Command2.is = is;
      })(Command || (exports3.Command = Command = {}));
      var TextEdit;
      (function(TextEdit2) {
        function replace(range, newText) {
          return { range, newText };
        }
        TextEdit2.replace = replace;
        function insert(position2, newText) {
          return { range: { start: position2, end: position2 }, newText };
        }
        TextEdit2.insert = insert;
        function del(range) {
          return { range, newText: "" };
        }
        TextEdit2.del = del;
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && Is.string(candidate.newText) && Range.is(candidate.range);
        }
        TextEdit2.is = is;
      })(TextEdit || (exports3.TextEdit = TextEdit = {}));
      var ChangeAnnotation;
      (function(ChangeAnnotation2) {
        function create(label, needsConfirmation, description) {
          var result = { label };
          if (needsConfirmation !== void 0) {
            result.needsConfirmation = needsConfirmation;
          }
          if (description !== void 0) {
            result.description = description;
          }
          return result;
        }
        ChangeAnnotation2.create = create;
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && Is.string(candidate.label) && (Is.boolean(candidate.needsConfirmation) || candidate.needsConfirmation === void 0) && (Is.string(candidate.description) || candidate.description === void 0);
        }
        ChangeAnnotation2.is = is;
      })(ChangeAnnotation || (exports3.ChangeAnnotation = ChangeAnnotation = {}));
      var ChangeAnnotationIdentifier;
      (function(ChangeAnnotationIdentifier2) {
        function is(value) {
          var candidate = value;
          return Is.string(candidate);
        }
        ChangeAnnotationIdentifier2.is = is;
      })(ChangeAnnotationIdentifier || (exports3.ChangeAnnotationIdentifier = ChangeAnnotationIdentifier = {}));
      var AnnotatedTextEdit;
      (function(AnnotatedTextEdit2) {
        function replace(range, newText, annotation) {
          return { range, newText, annotationId: annotation };
        }
        AnnotatedTextEdit2.replace = replace;
        function insert(position2, newText, annotation) {
          return { range: { start: position2, end: position2 }, newText, annotationId: annotation };
        }
        AnnotatedTextEdit2.insert = insert;
        function del(range, annotation) {
          return { range, newText: "", annotationId: annotation };
        }
        AnnotatedTextEdit2.del = del;
        function is(value) {
          var candidate = value;
          return TextEdit.is(candidate) && (ChangeAnnotation.is(candidate.annotationId) || ChangeAnnotationIdentifier.is(candidate.annotationId));
        }
        AnnotatedTextEdit2.is = is;
      })(AnnotatedTextEdit || (exports3.AnnotatedTextEdit = AnnotatedTextEdit = {}));
      var TextDocumentEdit;
      (function(TextDocumentEdit2) {
        function create(textDocument, edits) {
          return { textDocument, edits };
        }
        TextDocumentEdit2.create = create;
        function is(value) {
          var candidate = value;
          return Is.defined(candidate) && OptionalVersionedTextDocumentIdentifier.is(candidate.textDocument) && Array.isArray(candidate.edits);
        }
        TextDocumentEdit2.is = is;
      })(TextDocumentEdit || (exports3.TextDocumentEdit = TextDocumentEdit = {}));
      var CreateFile;
      (function(CreateFile2) {
        function create(uri, options, annotation) {
          var result = {
            kind: "create",
            uri
          };
          if (options !== void 0 && (options.overwrite !== void 0 || options.ignoreIfExists !== void 0)) {
            result.options = options;
          }
          if (annotation !== void 0) {
            result.annotationId = annotation;
          }
          return result;
        }
        CreateFile2.create = create;
        function is(value) {
          var candidate = value;
          return candidate && candidate.kind === "create" && Is.string(candidate.uri) && (candidate.options === void 0 || (candidate.options.overwrite === void 0 || Is.boolean(candidate.options.overwrite)) && (candidate.options.ignoreIfExists === void 0 || Is.boolean(candidate.options.ignoreIfExists))) && (candidate.annotationId === void 0 || ChangeAnnotationIdentifier.is(candidate.annotationId));
        }
        CreateFile2.is = is;
      })(CreateFile || (exports3.CreateFile = CreateFile = {}));
      var RenameFile;
      (function(RenameFile2) {
        function create(oldUri, newUri, options, annotation) {
          var result = {
            kind: "rename",
            oldUri,
            newUri
          };
          if (options !== void 0 && (options.overwrite !== void 0 || options.ignoreIfExists !== void 0)) {
            result.options = options;
          }
          if (annotation !== void 0) {
            result.annotationId = annotation;
          }
          return result;
        }
        RenameFile2.create = create;
        function is(value) {
          var candidate = value;
          return candidate && candidate.kind === "rename" && Is.string(candidate.oldUri) && Is.string(candidate.newUri) && (candidate.options === void 0 || (candidate.options.overwrite === void 0 || Is.boolean(candidate.options.overwrite)) && (candidate.options.ignoreIfExists === void 0 || Is.boolean(candidate.options.ignoreIfExists))) && (candidate.annotationId === void 0 || ChangeAnnotationIdentifier.is(candidate.annotationId));
        }
        RenameFile2.is = is;
      })(RenameFile || (exports3.RenameFile = RenameFile = {}));
      var DeleteFile;
      (function(DeleteFile2) {
        function create(uri, options, annotation) {
          var result = {
            kind: "delete",
            uri
          };
          if (options !== void 0 && (options.recursive !== void 0 || options.ignoreIfNotExists !== void 0)) {
            result.options = options;
          }
          if (annotation !== void 0) {
            result.annotationId = annotation;
          }
          return result;
        }
        DeleteFile2.create = create;
        function is(value) {
          var candidate = value;
          return candidate && candidate.kind === "delete" && Is.string(candidate.uri) && (candidate.options === void 0 || (candidate.options.recursive === void 0 || Is.boolean(candidate.options.recursive)) && (candidate.options.ignoreIfNotExists === void 0 || Is.boolean(candidate.options.ignoreIfNotExists))) && (candidate.annotationId === void 0 || ChangeAnnotationIdentifier.is(candidate.annotationId));
        }
        DeleteFile2.is = is;
      })(DeleteFile || (exports3.DeleteFile = DeleteFile = {}));
      var WorkspaceEdit;
      (function(WorkspaceEdit2) {
        function is(value) {
          var candidate = value;
          return candidate && (candidate.changes !== void 0 || candidate.documentChanges !== void 0) && (candidate.documentChanges === void 0 || candidate.documentChanges.every(function(change) {
            if (Is.string(change.kind)) {
              return CreateFile.is(change) || RenameFile.is(change) || DeleteFile.is(change);
            } else {
              return TextDocumentEdit.is(change);
            }
          }));
        }
        WorkspaceEdit2.is = is;
      })(WorkspaceEdit || (exports3.WorkspaceEdit = WorkspaceEdit = {}));
      var TextEditChangeImpl = (
        /** @class */
        (function() {
          function TextEditChangeImpl2(edits, changeAnnotations) {
            this.edits = edits;
            this.changeAnnotations = changeAnnotations;
          }
          TextEditChangeImpl2.prototype.insert = function(position2, newText, annotation) {
            var edit;
            var id;
            if (annotation === void 0) {
              edit = TextEdit.insert(position2, newText);
            } else if (ChangeAnnotationIdentifier.is(annotation)) {
              id = annotation;
              edit = AnnotatedTextEdit.insert(position2, newText, annotation);
            } else {
              this.assertChangeAnnotations(this.changeAnnotations);
              id = this.changeAnnotations.manage(annotation);
              edit = AnnotatedTextEdit.insert(position2, newText, id);
            }
            this.edits.push(edit);
            if (id !== void 0) {
              return id;
            }
          };
          TextEditChangeImpl2.prototype.replace = function(range, newText, annotation) {
            var edit;
            var id;
            if (annotation === void 0) {
              edit = TextEdit.replace(range, newText);
            } else if (ChangeAnnotationIdentifier.is(annotation)) {
              id = annotation;
              edit = AnnotatedTextEdit.replace(range, newText, annotation);
            } else {
              this.assertChangeAnnotations(this.changeAnnotations);
              id = this.changeAnnotations.manage(annotation);
              edit = AnnotatedTextEdit.replace(range, newText, id);
            }
            this.edits.push(edit);
            if (id !== void 0) {
              return id;
            }
          };
          TextEditChangeImpl2.prototype.delete = function(range, annotation) {
            var edit;
            var id;
            if (annotation === void 0) {
              edit = TextEdit.del(range);
            } else if (ChangeAnnotationIdentifier.is(annotation)) {
              id = annotation;
              edit = AnnotatedTextEdit.del(range, annotation);
            } else {
              this.assertChangeAnnotations(this.changeAnnotations);
              id = this.changeAnnotations.manage(annotation);
              edit = AnnotatedTextEdit.del(range, id);
            }
            this.edits.push(edit);
            if (id !== void 0) {
              return id;
            }
          };
          TextEditChangeImpl2.prototype.add = function(edit) {
            this.edits.push(edit);
          };
          TextEditChangeImpl2.prototype.all = function() {
            return this.edits;
          };
          TextEditChangeImpl2.prototype.clear = function() {
            this.edits.splice(0, this.edits.length);
          };
          TextEditChangeImpl2.prototype.assertChangeAnnotations = function(value) {
            if (value === void 0) {
              throw new Error("Text edit change is not configured to manage change annotations.");
            }
          };
          return TextEditChangeImpl2;
        })()
      );
      var ChangeAnnotations = (
        /** @class */
        (function() {
          function ChangeAnnotations2(annotations) {
            this._annotations = annotations === void 0 ? /* @__PURE__ */ Object.create(null) : annotations;
            this._counter = 0;
            this._size = 0;
          }
          ChangeAnnotations2.prototype.all = function() {
            return this._annotations;
          };
          Object.defineProperty(ChangeAnnotations2.prototype, "size", {
            get: function() {
              return this._size;
            },
            enumerable: false,
            configurable: true
          });
          ChangeAnnotations2.prototype.manage = function(idOrAnnotation, annotation) {
            var id;
            if (ChangeAnnotationIdentifier.is(idOrAnnotation)) {
              id = idOrAnnotation;
            } else {
              id = this.nextId();
              annotation = idOrAnnotation;
            }
            if (this._annotations[id] !== void 0) {
              throw new Error("Id ".concat(id, " is already in use."));
            }
            if (annotation === void 0) {
              throw new Error("No annotation provided for id ".concat(id));
            }
            this._annotations[id] = annotation;
            this._size++;
            return id;
          };
          ChangeAnnotations2.prototype.nextId = function() {
            this._counter++;
            return this._counter.toString();
          };
          return ChangeAnnotations2;
        })()
      );
      var WorkspaceChange = (
        /** @class */
        (function() {
          function WorkspaceChange2(workspaceEdit) {
            var _this = this;
            this._textEditChanges = /* @__PURE__ */ Object.create(null);
            if (workspaceEdit !== void 0) {
              this._workspaceEdit = workspaceEdit;
              if (workspaceEdit.documentChanges) {
                this._changeAnnotations = new ChangeAnnotations(workspaceEdit.changeAnnotations);
                workspaceEdit.changeAnnotations = this._changeAnnotations.all();
                workspaceEdit.documentChanges.forEach(function(change) {
                  if (TextDocumentEdit.is(change)) {
                    var textEditChange = new TextEditChangeImpl(change.edits, _this._changeAnnotations);
                    _this._textEditChanges[change.textDocument.uri] = textEditChange;
                  }
                });
              } else if (workspaceEdit.changes) {
                Object.keys(workspaceEdit.changes).forEach(function(key) {
                  var textEditChange = new TextEditChangeImpl(workspaceEdit.changes[key]);
                  _this._textEditChanges[key] = textEditChange;
                });
              }
            } else {
              this._workspaceEdit = {};
            }
          }
          Object.defineProperty(WorkspaceChange2.prototype, "edit", {
            /**
             * Returns the underlying {@link WorkspaceEdit} literal
             * use to be returned from a workspace edit operation like rename.
             */
            get: function() {
              this.initDocumentChanges();
              if (this._changeAnnotations !== void 0) {
                if (this._changeAnnotations.size === 0) {
                  this._workspaceEdit.changeAnnotations = void 0;
                } else {
                  this._workspaceEdit.changeAnnotations = this._changeAnnotations.all();
                }
              }
              return this._workspaceEdit;
            },
            enumerable: false,
            configurable: true
          });
          WorkspaceChange2.prototype.getTextEditChange = function(key) {
            if (OptionalVersionedTextDocumentIdentifier.is(key)) {
              this.initDocumentChanges();
              if (this._workspaceEdit.documentChanges === void 0) {
                throw new Error("Workspace edit is not configured for document changes.");
              }
              var textDocument = { uri: key.uri, version: key.version };
              var result = this._textEditChanges[textDocument.uri];
              if (!result) {
                var edits = [];
                var textDocumentEdit = {
                  textDocument,
                  edits
                };
                this._workspaceEdit.documentChanges.push(textDocumentEdit);
                result = new TextEditChangeImpl(edits, this._changeAnnotations);
                this._textEditChanges[textDocument.uri] = result;
              }
              return result;
            } else {
              this.initChanges();
              if (this._workspaceEdit.changes === void 0) {
                throw new Error("Workspace edit is not configured for normal text edit changes.");
              }
              var result = this._textEditChanges[key];
              if (!result) {
                var edits = [];
                this._workspaceEdit.changes[key] = edits;
                result = new TextEditChangeImpl(edits);
                this._textEditChanges[key] = result;
              }
              return result;
            }
          };
          WorkspaceChange2.prototype.initDocumentChanges = function() {
            if (this._workspaceEdit.documentChanges === void 0 && this._workspaceEdit.changes === void 0) {
              this._changeAnnotations = new ChangeAnnotations();
              this._workspaceEdit.documentChanges = [];
              this._workspaceEdit.changeAnnotations = this._changeAnnotations.all();
            }
          };
          WorkspaceChange2.prototype.initChanges = function() {
            if (this._workspaceEdit.documentChanges === void 0 && this._workspaceEdit.changes === void 0) {
              this._workspaceEdit.changes = /* @__PURE__ */ Object.create(null);
            }
          };
          WorkspaceChange2.prototype.createFile = function(uri, optionsOrAnnotation, options) {
            this.initDocumentChanges();
            if (this._workspaceEdit.documentChanges === void 0) {
              throw new Error("Workspace edit is not configured for document changes.");
            }
            var annotation;
            if (ChangeAnnotation.is(optionsOrAnnotation) || ChangeAnnotationIdentifier.is(optionsOrAnnotation)) {
              annotation = optionsOrAnnotation;
            } else {
              options = optionsOrAnnotation;
            }
            var operation;
            var id;
            if (annotation === void 0) {
              operation = CreateFile.create(uri, options);
            } else {
              id = ChangeAnnotationIdentifier.is(annotation) ? annotation : this._changeAnnotations.manage(annotation);
              operation = CreateFile.create(uri, options, id);
            }
            this._workspaceEdit.documentChanges.push(operation);
            if (id !== void 0) {
              return id;
            }
          };
          WorkspaceChange2.prototype.renameFile = function(oldUri, newUri, optionsOrAnnotation, options) {
            this.initDocumentChanges();
            if (this._workspaceEdit.documentChanges === void 0) {
              throw new Error("Workspace edit is not configured for document changes.");
            }
            var annotation;
            if (ChangeAnnotation.is(optionsOrAnnotation) || ChangeAnnotationIdentifier.is(optionsOrAnnotation)) {
              annotation = optionsOrAnnotation;
            } else {
              options = optionsOrAnnotation;
            }
            var operation;
            var id;
            if (annotation === void 0) {
              operation = RenameFile.create(oldUri, newUri, options);
            } else {
              id = ChangeAnnotationIdentifier.is(annotation) ? annotation : this._changeAnnotations.manage(annotation);
              operation = RenameFile.create(oldUri, newUri, options, id);
            }
            this._workspaceEdit.documentChanges.push(operation);
            if (id !== void 0) {
              return id;
            }
          };
          WorkspaceChange2.prototype.deleteFile = function(uri, optionsOrAnnotation, options) {
            this.initDocumentChanges();
            if (this._workspaceEdit.documentChanges === void 0) {
              throw new Error("Workspace edit is not configured for document changes.");
            }
            var annotation;
            if (ChangeAnnotation.is(optionsOrAnnotation) || ChangeAnnotationIdentifier.is(optionsOrAnnotation)) {
              annotation = optionsOrAnnotation;
            } else {
              options = optionsOrAnnotation;
            }
            var operation;
            var id;
            if (annotation === void 0) {
              operation = DeleteFile.create(uri, options);
            } else {
              id = ChangeAnnotationIdentifier.is(annotation) ? annotation : this._changeAnnotations.manage(annotation);
              operation = DeleteFile.create(uri, options, id);
            }
            this._workspaceEdit.documentChanges.push(operation);
            if (id !== void 0) {
              return id;
            }
          };
          return WorkspaceChange2;
        })()
      );
      exports3.WorkspaceChange = WorkspaceChange;
      var TextDocumentIdentifier;
      (function(TextDocumentIdentifier2) {
        function create(uri) {
          return { uri };
        }
        TextDocumentIdentifier2.create = create;
        function is(value) {
          var candidate = value;
          return Is.defined(candidate) && Is.string(candidate.uri);
        }
        TextDocumentIdentifier2.is = is;
      })(TextDocumentIdentifier || (exports3.TextDocumentIdentifier = TextDocumentIdentifier = {}));
      var VersionedTextDocumentIdentifier;
      (function(VersionedTextDocumentIdentifier2) {
        function create(uri, version) {
          return { uri, version };
        }
        VersionedTextDocumentIdentifier2.create = create;
        function is(value) {
          var candidate = value;
          return Is.defined(candidate) && Is.string(candidate.uri) && Is.integer(candidate.version);
        }
        VersionedTextDocumentIdentifier2.is = is;
      })(VersionedTextDocumentIdentifier || (exports3.VersionedTextDocumentIdentifier = VersionedTextDocumentIdentifier = {}));
      var OptionalVersionedTextDocumentIdentifier;
      (function(OptionalVersionedTextDocumentIdentifier2) {
        function create(uri, version) {
          return { uri, version };
        }
        OptionalVersionedTextDocumentIdentifier2.create = create;
        function is(value) {
          var candidate = value;
          return Is.defined(candidate) && Is.string(candidate.uri) && (candidate.version === null || Is.integer(candidate.version));
        }
        OptionalVersionedTextDocumentIdentifier2.is = is;
      })(OptionalVersionedTextDocumentIdentifier || (exports3.OptionalVersionedTextDocumentIdentifier = OptionalVersionedTextDocumentIdentifier = {}));
      var TextDocumentItem;
      (function(TextDocumentItem2) {
        function create(uri, languageId, version, text) {
          return { uri, languageId, version, text };
        }
        TextDocumentItem2.create = create;
        function is(value) {
          var candidate = value;
          return Is.defined(candidate) && Is.string(candidate.uri) && Is.string(candidate.languageId) && Is.integer(candidate.version) && Is.string(candidate.text);
        }
        TextDocumentItem2.is = is;
      })(TextDocumentItem || (exports3.TextDocumentItem = TextDocumentItem = {}));
      var MarkupKind2;
      (function(MarkupKind3) {
        MarkupKind3.PlainText = "plaintext";
        MarkupKind3.Markdown = "markdown";
        function is(value) {
          var candidate = value;
          return candidate === MarkupKind3.PlainText || candidate === MarkupKind3.Markdown;
        }
        MarkupKind3.is = is;
      })(MarkupKind2 || (exports3.MarkupKind = MarkupKind2 = {}));
      var MarkupContent;
      (function(MarkupContent2) {
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(value) && MarkupKind2.is(candidate.kind) && Is.string(candidate.value);
        }
        MarkupContent2.is = is;
      })(MarkupContent || (exports3.MarkupContent = MarkupContent = {}));
      var CompletionItemKind2;
      (function(CompletionItemKind3) {
        CompletionItemKind3.Text = 1;
        CompletionItemKind3.Method = 2;
        CompletionItemKind3.Function = 3;
        CompletionItemKind3.Constructor = 4;
        CompletionItemKind3.Field = 5;
        CompletionItemKind3.Variable = 6;
        CompletionItemKind3.Class = 7;
        CompletionItemKind3.Interface = 8;
        CompletionItemKind3.Module = 9;
        CompletionItemKind3.Property = 10;
        CompletionItemKind3.Unit = 11;
        CompletionItemKind3.Value = 12;
        CompletionItemKind3.Enum = 13;
        CompletionItemKind3.Keyword = 14;
        CompletionItemKind3.Snippet = 15;
        CompletionItemKind3.Color = 16;
        CompletionItemKind3.File = 17;
        CompletionItemKind3.Reference = 18;
        CompletionItemKind3.Folder = 19;
        CompletionItemKind3.EnumMember = 20;
        CompletionItemKind3.Constant = 21;
        CompletionItemKind3.Struct = 22;
        CompletionItemKind3.Event = 23;
        CompletionItemKind3.Operator = 24;
        CompletionItemKind3.TypeParameter = 25;
      })(CompletionItemKind2 || (exports3.CompletionItemKind = CompletionItemKind2 = {}));
      var InsertTextFormat;
      (function(InsertTextFormat2) {
        InsertTextFormat2.PlainText = 1;
        InsertTextFormat2.Snippet = 2;
      })(InsertTextFormat || (exports3.InsertTextFormat = InsertTextFormat = {}));
      var CompletionItemTag;
      (function(CompletionItemTag2) {
        CompletionItemTag2.Deprecated = 1;
      })(CompletionItemTag || (exports3.CompletionItemTag = CompletionItemTag = {}));
      var InsertReplaceEdit;
      (function(InsertReplaceEdit2) {
        function create(newText, insert, replace) {
          return { newText, insert, replace };
        }
        InsertReplaceEdit2.create = create;
        function is(value) {
          var candidate = value;
          return candidate && Is.string(candidate.newText) && Range.is(candidate.insert) && Range.is(candidate.replace);
        }
        InsertReplaceEdit2.is = is;
      })(InsertReplaceEdit || (exports3.InsertReplaceEdit = InsertReplaceEdit = {}));
      var InsertTextMode;
      (function(InsertTextMode2) {
        InsertTextMode2.asIs = 1;
        InsertTextMode2.adjustIndentation = 2;
      })(InsertTextMode || (exports3.InsertTextMode = InsertTextMode = {}));
      var CompletionItemLabelDetails;
      (function(CompletionItemLabelDetails2) {
        function is(value) {
          var candidate = value;
          return candidate && (Is.string(candidate.detail) || candidate.detail === void 0) && (Is.string(candidate.description) || candidate.description === void 0);
        }
        CompletionItemLabelDetails2.is = is;
      })(CompletionItemLabelDetails || (exports3.CompletionItemLabelDetails = CompletionItemLabelDetails = {}));
      var CompletionItem;
      (function(CompletionItem2) {
        function create(label) {
          return { label };
        }
        CompletionItem2.create = create;
      })(CompletionItem || (exports3.CompletionItem = CompletionItem = {}));
      var CompletionList;
      (function(CompletionList2) {
        function create(items, isIncomplete) {
          return { items: items ? items : [], isIncomplete: !!isIncomplete };
        }
        CompletionList2.create = create;
      })(CompletionList || (exports3.CompletionList = CompletionList = {}));
      var MarkedString;
      (function(MarkedString2) {
        function fromPlainText(plainText) {
          return plainText.replace(/[\\`*_{}[\]()#+\-.!]/g, "\\$&");
        }
        MarkedString2.fromPlainText = fromPlainText;
        function is(value) {
          var candidate = value;
          return Is.string(candidate) || Is.objectLiteral(candidate) && Is.string(candidate.language) && Is.string(candidate.value);
        }
        MarkedString2.is = is;
      })(MarkedString || (exports3.MarkedString = MarkedString = {}));
      var Hover;
      (function(Hover2) {
        function is(value) {
          var candidate = value;
          return !!candidate && Is.objectLiteral(candidate) && (MarkupContent.is(candidate.contents) || MarkedString.is(candidate.contents) || Is.typedArray(candidate.contents, MarkedString.is)) && (value.range === void 0 || Range.is(value.range));
        }
        Hover2.is = is;
      })(Hover || (exports3.Hover = Hover = {}));
      var ParameterInformation;
      (function(ParameterInformation2) {
        function create(label, documentation) {
          return documentation ? { label, documentation } : { label };
        }
        ParameterInformation2.create = create;
      })(ParameterInformation || (exports3.ParameterInformation = ParameterInformation = {}));
      var SignatureInformation;
      (function(SignatureInformation2) {
        function create(label, documentation) {
          var parameters = [];
          for (var _i = 2; _i < arguments.length; _i++) {
            parameters[_i - 2] = arguments[_i];
          }
          var result = { label };
          if (Is.defined(documentation)) {
            result.documentation = documentation;
          }
          if (Is.defined(parameters)) {
            result.parameters = parameters;
          } else {
            result.parameters = [];
          }
          return result;
        }
        SignatureInformation2.create = create;
      })(SignatureInformation || (exports3.SignatureInformation = SignatureInformation = {}));
      var DocumentHighlightKind;
      (function(DocumentHighlightKind2) {
        DocumentHighlightKind2.Text = 1;
        DocumentHighlightKind2.Read = 2;
        DocumentHighlightKind2.Write = 3;
      })(DocumentHighlightKind || (exports3.DocumentHighlightKind = DocumentHighlightKind = {}));
      var DocumentHighlight;
      (function(DocumentHighlight2) {
        function create(range, kind) {
          var result = { range };
          if (Is.number(kind)) {
            result.kind = kind;
          }
          return result;
        }
        DocumentHighlight2.create = create;
      })(DocumentHighlight || (exports3.DocumentHighlight = DocumentHighlight = {}));
      var SymbolKind2;
      (function(SymbolKind3) {
        SymbolKind3.File = 1;
        SymbolKind3.Module = 2;
        SymbolKind3.Namespace = 3;
        SymbolKind3.Package = 4;
        SymbolKind3.Class = 5;
        SymbolKind3.Method = 6;
        SymbolKind3.Property = 7;
        SymbolKind3.Field = 8;
        SymbolKind3.Constructor = 9;
        SymbolKind3.Enum = 10;
        SymbolKind3.Interface = 11;
        SymbolKind3.Function = 12;
        SymbolKind3.Variable = 13;
        SymbolKind3.Constant = 14;
        SymbolKind3.String = 15;
        SymbolKind3.Number = 16;
        SymbolKind3.Boolean = 17;
        SymbolKind3.Array = 18;
        SymbolKind3.Object = 19;
        SymbolKind3.Key = 20;
        SymbolKind3.Null = 21;
        SymbolKind3.EnumMember = 22;
        SymbolKind3.Struct = 23;
        SymbolKind3.Event = 24;
        SymbolKind3.Operator = 25;
        SymbolKind3.TypeParameter = 26;
      })(SymbolKind2 || (exports3.SymbolKind = SymbolKind2 = {}));
      var SymbolTag;
      (function(SymbolTag2) {
        SymbolTag2.Deprecated = 1;
      })(SymbolTag || (exports3.SymbolTag = SymbolTag = {}));
      var SymbolInformation;
      (function(SymbolInformation2) {
        function create(name, kind, range, uri, containerName) {
          var result = {
            name,
            kind,
            location: { uri, range }
          };
          if (containerName) {
            result.containerName = containerName;
          }
          return result;
        }
        SymbolInformation2.create = create;
      })(SymbolInformation || (exports3.SymbolInformation = SymbolInformation = {}));
      var WorkspaceSymbol;
      (function(WorkspaceSymbol2) {
        function create(name, kind, uri, range) {
          return range !== void 0 ? { name, kind, location: { uri, range } } : { name, kind, location: { uri } };
        }
        WorkspaceSymbol2.create = create;
      })(WorkspaceSymbol || (exports3.WorkspaceSymbol = WorkspaceSymbol = {}));
      var DocumentSymbol;
      (function(DocumentSymbol2) {
        function create(name, detail, kind, range, selectionRange, children) {
          var result = {
            name,
            detail,
            kind,
            range,
            selectionRange
          };
          if (children !== void 0) {
            result.children = children;
          }
          return result;
        }
        DocumentSymbol2.create = create;
        function is(value) {
          var candidate = value;
          return candidate && Is.string(candidate.name) && Is.number(candidate.kind) && Range.is(candidate.range) && Range.is(candidate.selectionRange) && (candidate.detail === void 0 || Is.string(candidate.detail)) && (candidate.deprecated === void 0 || Is.boolean(candidate.deprecated)) && (candidate.children === void 0 || Array.isArray(candidate.children)) && (candidate.tags === void 0 || Array.isArray(candidate.tags));
        }
        DocumentSymbol2.is = is;
      })(DocumentSymbol || (exports3.DocumentSymbol = DocumentSymbol = {}));
      var CodeActionKind;
      (function(CodeActionKind2) {
        CodeActionKind2.Empty = "";
        CodeActionKind2.QuickFix = "quickfix";
        CodeActionKind2.Refactor = "refactor";
        CodeActionKind2.RefactorExtract = "refactor.extract";
        CodeActionKind2.RefactorInline = "refactor.inline";
        CodeActionKind2.RefactorRewrite = "refactor.rewrite";
        CodeActionKind2.Source = "source";
        CodeActionKind2.SourceOrganizeImports = "source.organizeImports";
        CodeActionKind2.SourceFixAll = "source.fixAll";
      })(CodeActionKind || (exports3.CodeActionKind = CodeActionKind = {}));
      var CodeActionTriggerKind;
      (function(CodeActionTriggerKind2) {
        CodeActionTriggerKind2.Invoked = 1;
        CodeActionTriggerKind2.Automatic = 2;
      })(CodeActionTriggerKind || (exports3.CodeActionTriggerKind = CodeActionTriggerKind = {}));
      var CodeActionContext;
      (function(CodeActionContext2) {
        function create(diagnostics, only, triggerKind) {
          var result = { diagnostics };
          if (only !== void 0 && only !== null) {
            result.only = only;
          }
          if (triggerKind !== void 0 && triggerKind !== null) {
            result.triggerKind = triggerKind;
          }
          return result;
        }
        CodeActionContext2.create = create;
        function is(value) {
          var candidate = value;
          return Is.defined(candidate) && Is.typedArray(candidate.diagnostics, Diagnostic.is) && (candidate.only === void 0 || Is.typedArray(candidate.only, Is.string)) && (candidate.triggerKind === void 0 || candidate.triggerKind === CodeActionTriggerKind.Invoked || candidate.triggerKind === CodeActionTriggerKind.Automatic);
        }
        CodeActionContext2.is = is;
      })(CodeActionContext || (exports3.CodeActionContext = CodeActionContext = {}));
      var CodeAction;
      (function(CodeAction2) {
        function create(title, kindOrCommandOrEdit, kind) {
          var result = { title };
          var checkKind = true;
          if (typeof kindOrCommandOrEdit === "string") {
            checkKind = false;
            result.kind = kindOrCommandOrEdit;
          } else if (Command.is(kindOrCommandOrEdit)) {
            result.command = kindOrCommandOrEdit;
          } else {
            result.edit = kindOrCommandOrEdit;
          }
          if (checkKind && kind !== void 0) {
            result.kind = kind;
          }
          return result;
        }
        CodeAction2.create = create;
        function is(value) {
          var candidate = value;
          return candidate && Is.string(candidate.title) && (candidate.diagnostics === void 0 || Is.typedArray(candidate.diagnostics, Diagnostic.is)) && (candidate.kind === void 0 || Is.string(candidate.kind)) && (candidate.edit !== void 0 || candidate.command !== void 0) && (candidate.command === void 0 || Command.is(candidate.command)) && (candidate.isPreferred === void 0 || Is.boolean(candidate.isPreferred)) && (candidate.edit === void 0 || WorkspaceEdit.is(candidate.edit));
        }
        CodeAction2.is = is;
      })(CodeAction || (exports3.CodeAction = CodeAction = {}));
      var CodeLens;
      (function(CodeLens2) {
        function create(range, data) {
          var result = { range };
          if (Is.defined(data)) {
            result.data = data;
          }
          return result;
        }
        CodeLens2.create = create;
        function is(value) {
          var candidate = value;
          return Is.defined(candidate) && Range.is(candidate.range) && (Is.undefined(candidate.command) || Command.is(candidate.command));
        }
        CodeLens2.is = is;
      })(CodeLens || (exports3.CodeLens = CodeLens = {}));
      var FormattingOptions;
      (function(FormattingOptions2) {
        function create(tabSize, insertSpaces) {
          return { tabSize, insertSpaces };
        }
        FormattingOptions2.create = create;
        function is(value) {
          var candidate = value;
          return Is.defined(candidate) && Is.uinteger(candidate.tabSize) && Is.boolean(candidate.insertSpaces);
        }
        FormattingOptions2.is = is;
      })(FormattingOptions || (exports3.FormattingOptions = FormattingOptions = {}));
      var DocumentLink;
      (function(DocumentLink2) {
        function create(range, target, data) {
          return { range, target, data };
        }
        DocumentLink2.create = create;
        function is(value) {
          var candidate = value;
          return Is.defined(candidate) && Range.is(candidate.range) && (Is.undefined(candidate.target) || Is.string(candidate.target));
        }
        DocumentLink2.is = is;
      })(DocumentLink || (exports3.DocumentLink = DocumentLink = {}));
      var SelectionRange;
      (function(SelectionRange2) {
        function create(range, parent) {
          return { range, parent };
        }
        SelectionRange2.create = create;
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && Range.is(candidate.range) && (candidate.parent === void 0 || SelectionRange2.is(candidate.parent));
        }
        SelectionRange2.is = is;
      })(SelectionRange || (exports3.SelectionRange = SelectionRange = {}));
      var SemanticTokenTypes;
      (function(SemanticTokenTypes2) {
        SemanticTokenTypes2["namespace"] = "namespace";
        SemanticTokenTypes2["type"] = "type";
        SemanticTokenTypes2["class"] = "class";
        SemanticTokenTypes2["enum"] = "enum";
        SemanticTokenTypes2["interface"] = "interface";
        SemanticTokenTypes2["struct"] = "struct";
        SemanticTokenTypes2["typeParameter"] = "typeParameter";
        SemanticTokenTypes2["parameter"] = "parameter";
        SemanticTokenTypes2["variable"] = "variable";
        SemanticTokenTypes2["property"] = "property";
        SemanticTokenTypes2["enumMember"] = "enumMember";
        SemanticTokenTypes2["event"] = "event";
        SemanticTokenTypes2["function"] = "function";
        SemanticTokenTypes2["method"] = "method";
        SemanticTokenTypes2["macro"] = "macro";
        SemanticTokenTypes2["keyword"] = "keyword";
        SemanticTokenTypes2["modifier"] = "modifier";
        SemanticTokenTypes2["comment"] = "comment";
        SemanticTokenTypes2["string"] = "string";
        SemanticTokenTypes2["number"] = "number";
        SemanticTokenTypes2["regexp"] = "regexp";
        SemanticTokenTypes2["operator"] = "operator";
        SemanticTokenTypes2["decorator"] = "decorator";
      })(SemanticTokenTypes || (exports3.SemanticTokenTypes = SemanticTokenTypes = {}));
      var SemanticTokenModifiers;
      (function(SemanticTokenModifiers2) {
        SemanticTokenModifiers2["declaration"] = "declaration";
        SemanticTokenModifiers2["definition"] = "definition";
        SemanticTokenModifiers2["readonly"] = "readonly";
        SemanticTokenModifiers2["static"] = "static";
        SemanticTokenModifiers2["deprecated"] = "deprecated";
        SemanticTokenModifiers2["abstract"] = "abstract";
        SemanticTokenModifiers2["async"] = "async";
        SemanticTokenModifiers2["modification"] = "modification";
        SemanticTokenModifiers2["documentation"] = "documentation";
        SemanticTokenModifiers2["defaultLibrary"] = "defaultLibrary";
      })(SemanticTokenModifiers || (exports3.SemanticTokenModifiers = SemanticTokenModifiers = {}));
      var SemanticTokens;
      (function(SemanticTokens2) {
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && (candidate.resultId === void 0 || typeof candidate.resultId === "string") && Array.isArray(candidate.data) && (candidate.data.length === 0 || typeof candidate.data[0] === "number");
        }
        SemanticTokens2.is = is;
      })(SemanticTokens || (exports3.SemanticTokens = SemanticTokens = {}));
      var InlineValueText;
      (function(InlineValueText2) {
        function create(range, text) {
          return { range, text };
        }
        InlineValueText2.create = create;
        function is(value) {
          var candidate = value;
          return candidate !== void 0 && candidate !== null && Range.is(candidate.range) && Is.string(candidate.text);
        }
        InlineValueText2.is = is;
      })(InlineValueText || (exports3.InlineValueText = InlineValueText = {}));
      var InlineValueVariableLookup;
      (function(InlineValueVariableLookup2) {
        function create(range, variableName, caseSensitiveLookup) {
          return { range, variableName, caseSensitiveLookup };
        }
        InlineValueVariableLookup2.create = create;
        function is(value) {
          var candidate = value;
          return candidate !== void 0 && candidate !== null && Range.is(candidate.range) && Is.boolean(candidate.caseSensitiveLookup) && (Is.string(candidate.variableName) || candidate.variableName === void 0);
        }
        InlineValueVariableLookup2.is = is;
      })(InlineValueVariableLookup || (exports3.InlineValueVariableLookup = InlineValueVariableLookup = {}));
      var InlineValueEvaluatableExpression;
      (function(InlineValueEvaluatableExpression2) {
        function create(range, expression) {
          return { range, expression };
        }
        InlineValueEvaluatableExpression2.create = create;
        function is(value) {
          var candidate = value;
          return candidate !== void 0 && candidate !== null && Range.is(candidate.range) && (Is.string(candidate.expression) || candidate.expression === void 0);
        }
        InlineValueEvaluatableExpression2.is = is;
      })(InlineValueEvaluatableExpression || (exports3.InlineValueEvaluatableExpression = InlineValueEvaluatableExpression = {}));
      var InlineValueContext;
      (function(InlineValueContext2) {
        function create(frameId, stoppedLocation) {
          return { frameId, stoppedLocation };
        }
        InlineValueContext2.create = create;
        function is(value) {
          var candidate = value;
          return Is.defined(candidate) && Range.is(value.stoppedLocation);
        }
        InlineValueContext2.is = is;
      })(InlineValueContext || (exports3.InlineValueContext = InlineValueContext = {}));
      var InlayHintKind;
      (function(InlayHintKind2) {
        InlayHintKind2.Type = 1;
        InlayHintKind2.Parameter = 2;
        function is(value) {
          return value === 1 || value === 2;
        }
        InlayHintKind2.is = is;
      })(InlayHintKind || (exports3.InlayHintKind = InlayHintKind = {}));
      var InlayHintLabelPart;
      (function(InlayHintLabelPart2) {
        function create(value) {
          return { value };
        }
        InlayHintLabelPart2.create = create;
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && (candidate.tooltip === void 0 || Is.string(candidate.tooltip) || MarkupContent.is(candidate.tooltip)) && (candidate.location === void 0 || Location.is(candidate.location)) && (candidate.command === void 0 || Command.is(candidate.command));
        }
        InlayHintLabelPart2.is = is;
      })(InlayHintLabelPart || (exports3.InlayHintLabelPart = InlayHintLabelPart = {}));
      var InlayHint;
      (function(InlayHint2) {
        function create(position2, label, kind) {
          var result = { position: position2, label };
          if (kind !== void 0) {
            result.kind = kind;
          }
          return result;
        }
        InlayHint2.create = create;
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && Position2.is(candidate.position) && (Is.string(candidate.label) || Is.typedArray(candidate.label, InlayHintLabelPart.is)) && (candidate.kind === void 0 || InlayHintKind.is(candidate.kind)) && candidate.textEdits === void 0 || Is.typedArray(candidate.textEdits, TextEdit.is) && (candidate.tooltip === void 0 || Is.string(candidate.tooltip) || MarkupContent.is(candidate.tooltip)) && (candidate.paddingLeft === void 0 || Is.boolean(candidate.paddingLeft)) && (candidate.paddingRight === void 0 || Is.boolean(candidate.paddingRight));
        }
        InlayHint2.is = is;
      })(InlayHint || (exports3.InlayHint = InlayHint = {}));
      var StringValue;
      (function(StringValue2) {
        function createSnippet(value) {
          return { kind: "snippet", value };
        }
        StringValue2.createSnippet = createSnippet;
      })(StringValue || (exports3.StringValue = StringValue = {}));
      var InlineCompletionItem;
      (function(InlineCompletionItem2) {
        function create(insertText, filterText, range, command) {
          return { insertText, filterText, range, command };
        }
        InlineCompletionItem2.create = create;
      })(InlineCompletionItem || (exports3.InlineCompletionItem = InlineCompletionItem = {}));
      var InlineCompletionList;
      (function(InlineCompletionList2) {
        function create(items) {
          return { items };
        }
        InlineCompletionList2.create = create;
      })(InlineCompletionList || (exports3.InlineCompletionList = InlineCompletionList = {}));
      var InlineCompletionTriggerKind;
      (function(InlineCompletionTriggerKind2) {
        InlineCompletionTriggerKind2.Invoked = 0;
        InlineCompletionTriggerKind2.Automatic = 1;
      })(InlineCompletionTriggerKind || (exports3.InlineCompletionTriggerKind = InlineCompletionTriggerKind = {}));
      var SelectedCompletionInfo;
      (function(SelectedCompletionInfo2) {
        function create(range, text) {
          return { range, text };
        }
        SelectedCompletionInfo2.create = create;
      })(SelectedCompletionInfo || (exports3.SelectedCompletionInfo = SelectedCompletionInfo = {}));
      var InlineCompletionContext;
      (function(InlineCompletionContext2) {
        function create(triggerKind, selectedCompletionInfo) {
          return { triggerKind, selectedCompletionInfo };
        }
        InlineCompletionContext2.create = create;
      })(InlineCompletionContext || (exports3.InlineCompletionContext = InlineCompletionContext = {}));
      var WorkspaceFolder;
      (function(WorkspaceFolder2) {
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && URI.is(candidate.uri) && Is.string(candidate.name);
        }
        WorkspaceFolder2.is = is;
      })(WorkspaceFolder || (exports3.WorkspaceFolder = WorkspaceFolder = {}));
      exports3.EOL = ["\n", "\r\n", "\r"];
      var TextDocument2;
      (function(TextDocument3) {
        function create(uri, languageId, version, content) {
          return new FullTextDocument2(uri, languageId, version, content);
        }
        TextDocument3.create = create;
        function is(value) {
          var candidate = value;
          return Is.defined(candidate) && Is.string(candidate.uri) && (Is.undefined(candidate.languageId) || Is.string(candidate.languageId)) && Is.uinteger(candidate.lineCount) && Is.func(candidate.getText) && Is.func(candidate.positionAt) && Is.func(candidate.offsetAt) ? true : false;
        }
        TextDocument3.is = is;
        function applyEdits(document, edits) {
          var text = document.getText();
          var sortedEdits = mergeSort2(edits, function(a, b) {
            var diff = a.range.start.line - b.range.start.line;
            if (diff === 0) {
              return a.range.start.character - b.range.start.character;
            }
            return diff;
          });
          var lastModifiedOffset = text.length;
          for (var i = sortedEdits.length - 1; i >= 0; i--) {
            var e = sortedEdits[i];
            var startOffset = document.offsetAt(e.range.start);
            var endOffset = document.offsetAt(e.range.end);
            if (endOffset <= lastModifiedOffset) {
              text = text.substring(0, startOffset) + e.newText + text.substring(endOffset, text.length);
            } else {
              throw new Error("Overlapping edit");
            }
            lastModifiedOffset = startOffset;
          }
          return text;
        }
        TextDocument3.applyEdits = applyEdits;
        function mergeSort2(data, compare) {
          if (data.length <= 1) {
            return data;
          }
          var p = data.length / 2 | 0;
          var left = data.slice(0, p);
          var right = data.slice(p);
          mergeSort2(left, compare);
          mergeSort2(right, compare);
          var leftIdx = 0;
          var rightIdx = 0;
          var i = 0;
          while (leftIdx < left.length && rightIdx < right.length) {
            var ret = compare(left[leftIdx], right[rightIdx]);
            if (ret <= 0) {
              data[i++] = left[leftIdx++];
            } else {
              data[i++] = right[rightIdx++];
            }
          }
          while (leftIdx < left.length) {
            data[i++] = left[leftIdx++];
          }
          while (rightIdx < right.length) {
            data[i++] = right[rightIdx++];
          }
          return data;
        }
      })(TextDocument2 || (exports3.TextDocument = TextDocument2 = {}));
      var FullTextDocument2 = (
        /** @class */
        (function() {
          function FullTextDocument3(uri, languageId, version, content) {
            this._uri = uri;
            this._languageId = languageId;
            this._version = version;
            this._content = content;
            this._lineOffsets = void 0;
          }
          Object.defineProperty(FullTextDocument3.prototype, "uri", {
            get: function() {
              return this._uri;
            },
            enumerable: false,
            configurable: true
          });
          Object.defineProperty(FullTextDocument3.prototype, "languageId", {
            get: function() {
              return this._languageId;
            },
            enumerable: false,
            configurable: true
          });
          Object.defineProperty(FullTextDocument3.prototype, "version", {
            get: function() {
              return this._version;
            },
            enumerable: false,
            configurable: true
          });
          FullTextDocument3.prototype.getText = function(range) {
            if (range) {
              var start = this.offsetAt(range.start);
              var end = this.offsetAt(range.end);
              return this._content.substring(start, end);
            }
            return this._content;
          };
          FullTextDocument3.prototype.update = function(event, version) {
            this._content = event.text;
            this._version = version;
            this._lineOffsets = void 0;
          };
          FullTextDocument3.prototype.getLineOffsets = function() {
            if (this._lineOffsets === void 0) {
              var lineOffsets = [];
              var text = this._content;
              var isLineStart = true;
              for (var i = 0; i < text.length; i++) {
                if (isLineStart) {
                  lineOffsets.push(i);
                  isLineStart = false;
                }
                var ch = text.charAt(i);
                isLineStart = ch === "\r" || ch === "\n";
                if (ch === "\r" && i + 1 < text.length && text.charAt(i + 1) === "\n") {
                  i++;
                }
              }
              if (isLineStart && text.length > 0) {
                lineOffsets.push(text.length);
              }
              this._lineOffsets = lineOffsets;
            }
            return this._lineOffsets;
          };
          FullTextDocument3.prototype.positionAt = function(offset2) {
            offset2 = Math.max(Math.min(offset2, this._content.length), 0);
            var lineOffsets = this.getLineOffsets();
            var low = 0, high = lineOffsets.length;
            if (high === 0) {
              return Position2.create(0, offset2);
            }
            while (low < high) {
              var mid = Math.floor((low + high) / 2);
              if (lineOffsets[mid] > offset2) {
                high = mid;
              } else {
                low = mid + 1;
              }
            }
            var line = low - 1;
            return Position2.create(line, offset2 - lineOffsets[line]);
          };
          FullTextDocument3.prototype.offsetAt = function(position2) {
            var lineOffsets = this.getLineOffsets();
            if (position2.line >= lineOffsets.length) {
              return this._content.length;
            } else if (position2.line < 0) {
              return 0;
            }
            var lineOffset = lineOffsets[position2.line];
            var nextLineOffset = position2.line + 1 < lineOffsets.length ? lineOffsets[position2.line + 1] : this._content.length;
            return Math.max(Math.min(lineOffset + position2.character, nextLineOffset), lineOffset);
          };
          Object.defineProperty(FullTextDocument3.prototype, "lineCount", {
            get: function() {
              return this.getLineOffsets().length;
            },
            enumerable: false,
            configurable: true
          });
          return FullTextDocument3;
        })()
      );
      var Is;
      (function(Is2) {
        var toString = Object.prototype.toString;
        function defined(value) {
          return typeof value !== "undefined";
        }
        Is2.defined = defined;
        function undefined2(value) {
          return typeof value === "undefined";
        }
        Is2.undefined = undefined2;
        function boolean(value) {
          return value === true || value === false;
        }
        Is2.boolean = boolean;
        function string2(value) {
          return toString.call(value) === "[object String]";
        }
        Is2.string = string2;
        function number(value) {
          return toString.call(value) === "[object Number]";
        }
        Is2.number = number;
        function numberRange(value, min, max) {
          return toString.call(value) === "[object Number]" && min <= value && value <= max;
        }
        Is2.numberRange = numberRange;
        function integer2(value) {
          return toString.call(value) === "[object Number]" && -2147483648 <= value && value <= 2147483647;
        }
        Is2.integer = integer2;
        function uinteger2(value) {
          return toString.call(value) === "[object Number]" && 0 <= value && value <= 2147483647;
        }
        Is2.uinteger = uinteger2;
        function func(value) {
          return toString.call(value) === "[object Function]";
        }
        Is2.func = func;
        function objectLiteral(value) {
          return value !== null && typeof value === "object";
        }
        Is2.objectLiteral = objectLiteral;
        function typedArray(value, check) {
          return Array.isArray(value) && value.every(check);
        }
        Is2.typedArray = typedArray;
      })(Is || (Is = {}));
    });
  }
});

// node_modules/vscode-languageserver-protocol/lib/common/messages.js
var require_messages2 = __commonJS({
  "node_modules/vscode-languageserver-protocol/lib/common/messages.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ProtocolNotificationType = exports2.ProtocolNotificationType0 = exports2.ProtocolRequestType = exports2.ProtocolRequestType0 = exports2.RegistrationType = exports2.MessageDirection = void 0;
    var vscode_jsonrpc_1 = require_main();
    var MessageDirection;
    (function(MessageDirection2) {
      MessageDirection2["clientToServer"] = "clientToServer";
      MessageDirection2["serverToClient"] = "serverToClient";
      MessageDirection2["both"] = "both";
    })(MessageDirection || (exports2.MessageDirection = MessageDirection = {}));
    var RegistrationType = class {
      constructor(method) {
        this.method = method;
      }
    };
    exports2.RegistrationType = RegistrationType;
    var ProtocolRequestType0 = class extends vscode_jsonrpc_1.RequestType0 {
      constructor(method) {
        super(method);
      }
    };
    exports2.ProtocolRequestType0 = ProtocolRequestType0;
    var ProtocolRequestType = class extends vscode_jsonrpc_1.RequestType {
      constructor(method) {
        super(method, vscode_jsonrpc_1.ParameterStructures.byName);
      }
    };
    exports2.ProtocolRequestType = ProtocolRequestType;
    var ProtocolNotificationType0 = class extends vscode_jsonrpc_1.NotificationType0 {
      constructor(method) {
        super(method);
      }
    };
    exports2.ProtocolNotificationType0 = ProtocolNotificationType0;
    var ProtocolNotificationType = class extends vscode_jsonrpc_1.NotificationType {
      constructor(method) {
        super(method, vscode_jsonrpc_1.ParameterStructures.byName);
      }
    };
    exports2.ProtocolNotificationType = ProtocolNotificationType;
  }
});

// node_modules/vscode-languageserver-protocol/lib/common/utils/is.js
var require_is3 = __commonJS({
  "node_modules/vscode-languageserver-protocol/lib/common/utils/is.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.objectLiteral = exports2.typedArray = exports2.stringArray = exports2.array = exports2.func = exports2.error = exports2.number = exports2.string = exports2.boolean = void 0;
    function boolean(value) {
      return value === true || value === false;
    }
    exports2.boolean = boolean;
    function string2(value) {
      return typeof value === "string" || value instanceof String;
    }
    exports2.string = string2;
    function number(value) {
      return typeof value === "number" || value instanceof Number;
    }
    exports2.number = number;
    function error(value) {
      return value instanceof Error;
    }
    exports2.error = error;
    function func(value) {
      return typeof value === "function";
    }
    exports2.func = func;
    function array(value) {
      return Array.isArray(value);
    }
    exports2.array = array;
    function stringArray(value) {
      return array(value) && value.every((elem) => string2(elem));
    }
    exports2.stringArray = stringArray;
    function typedArray(value, check) {
      return Array.isArray(value) && value.every(check);
    }
    exports2.typedArray = typedArray;
    function objectLiteral(value) {
      return value !== null && typeof value === "object";
    }
    exports2.objectLiteral = objectLiteral;
  }
});

// node_modules/vscode-languageserver-protocol/lib/common/protocol.implementation.js
var require_protocol_implementation = __commonJS({
  "node_modules/vscode-languageserver-protocol/lib/common/protocol.implementation.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ImplementationRequest = void 0;
    var messages_1 = require_messages2();
    var ImplementationRequest;
    (function(ImplementationRequest2) {
      ImplementationRequest2.method = "textDocument/implementation";
      ImplementationRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      ImplementationRequest2.type = new messages_1.ProtocolRequestType(ImplementationRequest2.method);
    })(ImplementationRequest || (exports2.ImplementationRequest = ImplementationRequest = {}));
  }
});

// node_modules/vscode-languageserver-protocol/lib/common/protocol.typeDefinition.js
var require_protocol_typeDefinition = __commonJS({
  "node_modules/vscode-languageserver-protocol/lib/common/protocol.typeDefinition.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TypeDefinitionRequest = void 0;
    var messages_1 = require_messages2();
    var TypeDefinitionRequest;
    (function(TypeDefinitionRequest2) {
      TypeDefinitionRequest2.method = "textDocument/typeDefinition";
      TypeDefinitionRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      TypeDefinitionRequest2.type = new messages_1.ProtocolRequestType(TypeDefinitionRequest2.method);
    })(TypeDefinitionRequest || (exports2.TypeDefinitionRequest = TypeDefinitionRequest = {}));
  }
});

// node_modules/vscode-languageserver-protocol/lib/common/protocol.workspaceFolder.js
var require_protocol_workspaceFolder = __commonJS({
  "node_modules/vscode-languageserver-protocol/lib/common/protocol.workspaceFolder.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DidChangeWorkspaceFoldersNotification = exports2.WorkspaceFoldersRequest = void 0;
    var messages_1 = require_messages2();
    var WorkspaceFoldersRequest;
    (function(WorkspaceFoldersRequest2) {
      WorkspaceFoldersRequest2.method = "workspace/workspaceFolders";
      WorkspaceFoldersRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      WorkspaceFoldersRequest2.type = new messages_1.ProtocolRequestType0(WorkspaceFoldersRequest2.method);
    })(WorkspaceFoldersRequest || (exports2.WorkspaceFoldersRequest = WorkspaceFoldersRequest = {}));
    var DidChangeWorkspaceFoldersNotification;
    (function(DidChangeWorkspaceFoldersNotification2) {
      DidChangeWorkspaceFoldersNotification2.method = "workspace/didChangeWorkspaceFolders";
      DidChangeWorkspaceFoldersNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      DidChangeWorkspaceFoldersNotification2.type = new messages_1.ProtocolNotificationType(DidChangeWorkspaceFoldersNotification2.method);
    })(DidChangeWorkspaceFoldersNotification || (exports2.DidChangeWorkspaceFoldersNotification = DidChangeWorkspaceFoldersNotification = {}));
  }
});

// node_modules/vscode-languageserver-protocol/lib/common/protocol.configuration.js
var require_protocol_configuration = __commonJS({
  "node_modules/vscode-languageserver-protocol/lib/common/protocol.configuration.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ConfigurationRequest = void 0;
    var messages_1 = require_messages2();
    var ConfigurationRequest;
    (function(ConfigurationRequest2) {
      ConfigurationRequest2.method = "workspace/configuration";
      ConfigurationRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      ConfigurationRequest2.type = new messages_1.ProtocolRequestType(ConfigurationRequest2.method);
    })(ConfigurationRequest || (exports2.ConfigurationRequest = ConfigurationRequest = {}));
  }
});

// node_modules/vscode-languageserver-protocol/lib/common/protocol.colorProvider.js
var require_protocol_colorProvider = __commonJS({
  "node_modules/vscode-languageserver-protocol/lib/common/protocol.colorProvider.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ColorPresentationRequest = exports2.DocumentColorRequest = void 0;
    var messages_1 = require_messages2();
    var DocumentColorRequest;
    (function(DocumentColorRequest2) {
      DocumentColorRequest2.method = "textDocument/documentColor";
      DocumentColorRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      DocumentColorRequest2.type = new messages_1.ProtocolRequestType(DocumentColorRequest2.method);
    })(DocumentColorRequest || (exports2.DocumentColorRequest = DocumentColorRequest = {}));
    var ColorPresentationRequest;
    (function(ColorPresentationRequest2) {
      ColorPresentationRequest2.method = "textDocument/colorPresentation";
      ColorPresentationRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      ColorPresentationRequest2.type = new messages_1.ProtocolRequestType(ColorPresentationRequest2.method);
    })(ColorPresentationRequest || (exports2.ColorPresentationRequest = ColorPresentationRequest = {}));
  }
});

// node_modules/vscode-languageserver-protocol/lib/common/protocol.foldingRange.js
var require_protocol_foldingRange = __commonJS({
  "node_modules/vscode-languageserver-protocol/lib/common/protocol.foldingRange.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.FoldingRangeRefreshRequest = exports2.FoldingRangeRequest = void 0;
    var messages_1 = require_messages2();
    var FoldingRangeRequest;
    (function(FoldingRangeRequest2) {
      FoldingRangeRequest2.method = "textDocument/foldingRange";
      FoldingRangeRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      FoldingRangeRequest2.type = new messages_1.ProtocolRequestType(FoldingRangeRequest2.method);
    })(FoldingRangeRequest || (exports2.FoldingRangeRequest = FoldingRangeRequest = {}));
    var FoldingRangeRefreshRequest;
    (function(FoldingRangeRefreshRequest2) {
      FoldingRangeRefreshRequest2.method = `workspace/foldingRange/refresh`;
      FoldingRangeRefreshRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      FoldingRangeRefreshRequest2.type = new messages_1.ProtocolRequestType0(FoldingRangeRefreshRequest2.method);
    })(FoldingRangeRefreshRequest || (exports2.FoldingRangeRefreshRequest = FoldingRangeRefreshRequest = {}));
  }
});

// node_modules/vscode-languageserver-protocol/lib/common/protocol.declaration.js
var require_protocol_declaration = __commonJS({
  "node_modules/vscode-languageserver-protocol/lib/common/protocol.declaration.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DeclarationRequest = void 0;
    var messages_1 = require_messages2();
    var DeclarationRequest;
    (function(DeclarationRequest2) {
      DeclarationRequest2.method = "textDocument/declaration";
      DeclarationRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      DeclarationRequest2.type = new messages_1.ProtocolRequestType(DeclarationRequest2.method);
    })(DeclarationRequest || (exports2.DeclarationRequest = DeclarationRequest = {}));
  }
});

// node_modules/vscode-languageserver-protocol/lib/common/protocol.selectionRange.js
var require_protocol_selectionRange = __commonJS({
  "node_modules/vscode-languageserver-protocol/lib/common/protocol.selectionRange.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.SelectionRangeRequest = void 0;
    var messages_1 = require_messages2();
    var SelectionRangeRequest;
    (function(SelectionRangeRequest2) {
      SelectionRangeRequest2.method = "textDocument/selectionRange";
      SelectionRangeRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      SelectionRangeRequest2.type = new messages_1.ProtocolRequestType(SelectionRangeRequest2.method);
    })(SelectionRangeRequest || (exports2.SelectionRangeRequest = SelectionRangeRequest = {}));
  }
});

// node_modules/vscode-languageserver-protocol/lib/common/protocol.progress.js
var require_protocol_progress = __commonJS({
  "node_modules/vscode-languageserver-protocol/lib/common/protocol.progress.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.WorkDoneProgressCancelNotification = exports2.WorkDoneProgressCreateRequest = exports2.WorkDoneProgress = void 0;
    var vscode_jsonrpc_1 = require_main();
    var messages_1 = require_messages2();
    var WorkDoneProgress;
    (function(WorkDoneProgress2) {
      WorkDoneProgress2.type = new vscode_jsonrpc_1.ProgressType();
      function is(value) {
        return value === WorkDoneProgress2.type;
      }
      WorkDoneProgress2.is = is;
    })(WorkDoneProgress || (exports2.WorkDoneProgress = WorkDoneProgress = {}));
    var WorkDoneProgressCreateRequest;
    (function(WorkDoneProgressCreateRequest2) {
      WorkDoneProgressCreateRequest2.method = "window/workDoneProgress/create";
      WorkDoneProgressCreateRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      WorkDoneProgressCreateRequest2.type = new messages_1.ProtocolRequestType(WorkDoneProgressCreateRequest2.method);
    })(WorkDoneProgressCreateRequest || (exports2.WorkDoneProgressCreateRequest = WorkDoneProgressCreateRequest = {}));
    var WorkDoneProgressCancelNotification;
    (function(WorkDoneProgressCancelNotification2) {
      WorkDoneProgressCancelNotification2.method = "window/workDoneProgress/cancel";
      WorkDoneProgressCancelNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      WorkDoneProgressCancelNotification2.type = new messages_1.ProtocolNotificationType(WorkDoneProgressCancelNotification2.method);
    })(WorkDoneProgressCancelNotification || (exports2.WorkDoneProgressCancelNotification = WorkDoneProgressCancelNotification = {}));
  }
});

// node_modules/vscode-languageserver-protocol/lib/common/protocol.callHierarchy.js
var require_protocol_callHierarchy = __commonJS({
  "node_modules/vscode-languageserver-protocol/lib/common/protocol.callHierarchy.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.CallHierarchyOutgoingCallsRequest = exports2.CallHierarchyIncomingCallsRequest = exports2.CallHierarchyPrepareRequest = void 0;
    var messages_1 = require_messages2();
    var CallHierarchyPrepareRequest;
    (function(CallHierarchyPrepareRequest2) {
      CallHierarchyPrepareRequest2.method = "textDocument/prepareCallHierarchy";
      CallHierarchyPrepareRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      CallHierarchyPrepareRequest2.type = new messages_1.ProtocolRequestType(CallHierarchyPrepareRequest2.method);
    })(CallHierarchyPrepareRequest || (exports2.CallHierarchyPrepareRequest = CallHierarchyPrepareRequest = {}));
    var CallHierarchyIncomingCallsRequest;
    (function(CallHierarchyIncomingCallsRequest2) {
      CallHierarchyIncomingCallsRequest2.method = "callHierarchy/incomingCalls";
      CallHierarchyIncomingCallsRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      CallHierarchyIncomingCallsRequest2.type = new messages_1.ProtocolRequestType(CallHierarchyIncomingCallsRequest2.method);
    })(CallHierarchyIncomingCallsRequest || (exports2.CallHierarchyIncomingCallsRequest = CallHierarchyIncomingCallsRequest = {}));
    var CallHierarchyOutgoingCallsRequest;
    (function(CallHierarchyOutgoingCallsRequest2) {
      CallHierarchyOutgoingCallsRequest2.method = "callHierarchy/outgoingCalls";
      CallHierarchyOutgoingCallsRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      CallHierarchyOutgoingCallsRequest2.type = new messages_1.ProtocolRequestType(CallHierarchyOutgoingCallsRequest2.method);
    })(CallHierarchyOutgoingCallsRequest || (exports2.CallHierarchyOutgoingCallsRequest = CallHierarchyOutgoingCallsRequest = {}));
  }
});

// node_modules/vscode-languageserver-protocol/lib/common/protocol.semanticTokens.js
var require_protocol_semanticTokens = __commonJS({
  "node_modules/vscode-languageserver-protocol/lib/common/protocol.semanticTokens.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.SemanticTokensRefreshRequest = exports2.SemanticTokensRangeRequest = exports2.SemanticTokensDeltaRequest = exports2.SemanticTokensRequest = exports2.SemanticTokensRegistrationType = exports2.TokenFormat = void 0;
    var messages_1 = require_messages2();
    var TokenFormat;
    (function(TokenFormat2) {
      TokenFormat2.Relative = "relative";
    })(TokenFormat || (exports2.TokenFormat = TokenFormat = {}));
    var SemanticTokensRegistrationType;
    (function(SemanticTokensRegistrationType2) {
      SemanticTokensRegistrationType2.method = "textDocument/semanticTokens";
      SemanticTokensRegistrationType2.type = new messages_1.RegistrationType(SemanticTokensRegistrationType2.method);
    })(SemanticTokensRegistrationType || (exports2.SemanticTokensRegistrationType = SemanticTokensRegistrationType = {}));
    var SemanticTokensRequest;
    (function(SemanticTokensRequest2) {
      SemanticTokensRequest2.method = "textDocument/semanticTokens/full";
      SemanticTokensRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      SemanticTokensRequest2.type = new messages_1.ProtocolRequestType(SemanticTokensRequest2.method);
      SemanticTokensRequest2.registrationMethod = SemanticTokensRegistrationType.method;
    })(SemanticTokensRequest || (exports2.SemanticTokensRequest = SemanticTokensRequest = {}));
    var SemanticTokensDeltaRequest;
    (function(SemanticTokensDeltaRequest2) {
      SemanticTokensDeltaRequest2.method = "textDocument/semanticTokens/full/delta";
      SemanticTokensDeltaRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      SemanticTokensDeltaRequest2.type = new messages_1.ProtocolRequestType(SemanticTokensDeltaRequest2.method);
      SemanticTokensDeltaRequest2.registrationMethod = SemanticTokensRegistrationType.method;
    })(SemanticTokensDeltaRequest || (exports2.SemanticTokensDeltaRequest = SemanticTokensDeltaRequest = {}));
    var SemanticTokensRangeRequest;
    (function(SemanticTokensRangeRequest2) {
      SemanticTokensRangeRequest2.method = "textDocument/semanticTokens/range";
      SemanticTokensRangeRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      SemanticTokensRangeRequest2.type = new messages_1.ProtocolRequestType(SemanticTokensRangeRequest2.method);
      SemanticTokensRangeRequest2.registrationMethod = SemanticTokensRegistrationType.method;
    })(SemanticTokensRangeRequest || (exports2.SemanticTokensRangeRequest = SemanticTokensRangeRequest = {}));
    var SemanticTokensRefreshRequest;
    (function(SemanticTokensRefreshRequest2) {
      SemanticTokensRefreshRequest2.method = `workspace/semanticTokens/refresh`;
      SemanticTokensRefreshRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      SemanticTokensRefreshRequest2.type = new messages_1.ProtocolRequestType0(SemanticTokensRefreshRequest2.method);
    })(SemanticTokensRefreshRequest || (exports2.SemanticTokensRefreshRequest = SemanticTokensRefreshRequest = {}));
  }
});

// node_modules/vscode-languageserver-protocol/lib/common/protocol.showDocument.js
var require_protocol_showDocument = __commonJS({
  "node_modules/vscode-languageserver-protocol/lib/common/protocol.showDocument.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ShowDocumentRequest = void 0;
    var messages_1 = require_messages2();
    var ShowDocumentRequest;
    (function(ShowDocumentRequest2) {
      ShowDocumentRequest2.method = "window/showDocument";
      ShowDocumentRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      ShowDocumentRequest2.type = new messages_1.ProtocolRequestType(ShowDocumentRequest2.method);
    })(ShowDocumentRequest || (exports2.ShowDocumentRequest = ShowDocumentRequest = {}));
  }
});

// node_modules/vscode-languageserver-protocol/lib/common/protocol.linkedEditingRange.js
var require_protocol_linkedEditingRange = __commonJS({
  "node_modules/vscode-languageserver-protocol/lib/common/protocol.linkedEditingRange.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.LinkedEditingRangeRequest = void 0;
    var messages_1 = require_messages2();
    var LinkedEditingRangeRequest;
    (function(LinkedEditingRangeRequest2) {
      LinkedEditingRangeRequest2.method = "textDocument/linkedEditingRange";
      LinkedEditingRangeRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      LinkedEditingRangeRequest2.type = new messages_1.ProtocolRequestType(LinkedEditingRangeRequest2.method);
    })(LinkedEditingRangeRequest || (exports2.LinkedEditingRangeRequest = LinkedEditingRangeRequest = {}));
  }
});

// node_modules/vscode-languageserver-protocol/lib/common/protocol.fileOperations.js
var require_protocol_fileOperations = __commonJS({
  "node_modules/vscode-languageserver-protocol/lib/common/protocol.fileOperations.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.WillDeleteFilesRequest = exports2.DidDeleteFilesNotification = exports2.DidRenameFilesNotification = exports2.WillRenameFilesRequest = exports2.DidCreateFilesNotification = exports2.WillCreateFilesRequest = exports2.FileOperationPatternKind = void 0;
    var messages_1 = require_messages2();
    var FileOperationPatternKind;
    (function(FileOperationPatternKind2) {
      FileOperationPatternKind2.file = "file";
      FileOperationPatternKind2.folder = "folder";
    })(FileOperationPatternKind || (exports2.FileOperationPatternKind = FileOperationPatternKind = {}));
    var WillCreateFilesRequest;
    (function(WillCreateFilesRequest2) {
      WillCreateFilesRequest2.method = "workspace/willCreateFiles";
      WillCreateFilesRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      WillCreateFilesRequest2.type = new messages_1.ProtocolRequestType(WillCreateFilesRequest2.method);
    })(WillCreateFilesRequest || (exports2.WillCreateFilesRequest = WillCreateFilesRequest = {}));
    var DidCreateFilesNotification;
    (function(DidCreateFilesNotification2) {
      DidCreateFilesNotification2.method = "workspace/didCreateFiles";
      DidCreateFilesNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      DidCreateFilesNotification2.type = new messages_1.ProtocolNotificationType(DidCreateFilesNotification2.method);
    })(DidCreateFilesNotification || (exports2.DidCreateFilesNotification = DidCreateFilesNotification = {}));
    var WillRenameFilesRequest;
    (function(WillRenameFilesRequest2) {
      WillRenameFilesRequest2.method = "workspace/willRenameFiles";
      WillRenameFilesRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      WillRenameFilesRequest2.type = new messages_1.ProtocolRequestType(WillRenameFilesRequest2.method);
    })(WillRenameFilesRequest || (exports2.WillRenameFilesRequest = WillRenameFilesRequest = {}));
    var DidRenameFilesNotification;
    (function(DidRenameFilesNotification2) {
      DidRenameFilesNotification2.method = "workspace/didRenameFiles";
      DidRenameFilesNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      DidRenameFilesNotification2.type = new messages_1.ProtocolNotificationType(DidRenameFilesNotification2.method);
    })(DidRenameFilesNotification || (exports2.DidRenameFilesNotification = DidRenameFilesNotification = {}));
    var DidDeleteFilesNotification;
    (function(DidDeleteFilesNotification2) {
      DidDeleteFilesNotification2.method = "workspace/didDeleteFiles";
      DidDeleteFilesNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      DidDeleteFilesNotification2.type = new messages_1.ProtocolNotificationType(DidDeleteFilesNotification2.method);
    })(DidDeleteFilesNotification || (exports2.DidDeleteFilesNotification = DidDeleteFilesNotification = {}));
    var WillDeleteFilesRequest;
    (function(WillDeleteFilesRequest2) {
      WillDeleteFilesRequest2.method = "workspace/willDeleteFiles";
      WillDeleteFilesRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      WillDeleteFilesRequest2.type = new messages_1.ProtocolRequestType(WillDeleteFilesRequest2.method);
    })(WillDeleteFilesRequest || (exports2.WillDeleteFilesRequest = WillDeleteFilesRequest = {}));
  }
});

// node_modules/vscode-languageserver-protocol/lib/common/protocol.moniker.js
var require_protocol_moniker = __commonJS({
  "node_modules/vscode-languageserver-protocol/lib/common/protocol.moniker.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.MonikerRequest = exports2.MonikerKind = exports2.UniquenessLevel = void 0;
    var messages_1 = require_messages2();
    var UniquenessLevel;
    (function(UniquenessLevel2) {
      UniquenessLevel2.document = "document";
      UniquenessLevel2.project = "project";
      UniquenessLevel2.group = "group";
      UniquenessLevel2.scheme = "scheme";
      UniquenessLevel2.global = "global";
    })(UniquenessLevel || (exports2.UniquenessLevel = UniquenessLevel = {}));
    var MonikerKind;
    (function(MonikerKind2) {
      MonikerKind2.$import = "import";
      MonikerKind2.$export = "export";
      MonikerKind2.local = "local";
    })(MonikerKind || (exports2.MonikerKind = MonikerKind = {}));
    var MonikerRequest;
    (function(MonikerRequest2) {
      MonikerRequest2.method = "textDocument/moniker";
      MonikerRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      MonikerRequest2.type = new messages_1.ProtocolRequestType(MonikerRequest2.method);
    })(MonikerRequest || (exports2.MonikerRequest = MonikerRequest = {}));
  }
});

// node_modules/vscode-languageserver-protocol/lib/common/protocol.typeHierarchy.js
var require_protocol_typeHierarchy = __commonJS({
  "node_modules/vscode-languageserver-protocol/lib/common/protocol.typeHierarchy.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TypeHierarchySubtypesRequest = exports2.TypeHierarchySupertypesRequest = exports2.TypeHierarchyPrepareRequest = void 0;
    var messages_1 = require_messages2();
    var TypeHierarchyPrepareRequest;
    (function(TypeHierarchyPrepareRequest2) {
      TypeHierarchyPrepareRequest2.method = "textDocument/prepareTypeHierarchy";
      TypeHierarchyPrepareRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      TypeHierarchyPrepareRequest2.type = new messages_1.ProtocolRequestType(TypeHierarchyPrepareRequest2.method);
    })(TypeHierarchyPrepareRequest || (exports2.TypeHierarchyPrepareRequest = TypeHierarchyPrepareRequest = {}));
    var TypeHierarchySupertypesRequest;
    (function(TypeHierarchySupertypesRequest2) {
      TypeHierarchySupertypesRequest2.method = "typeHierarchy/supertypes";
      TypeHierarchySupertypesRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      TypeHierarchySupertypesRequest2.type = new messages_1.ProtocolRequestType(TypeHierarchySupertypesRequest2.method);
    })(TypeHierarchySupertypesRequest || (exports2.TypeHierarchySupertypesRequest = TypeHierarchySupertypesRequest = {}));
    var TypeHierarchySubtypesRequest;
    (function(TypeHierarchySubtypesRequest2) {
      TypeHierarchySubtypesRequest2.method = "typeHierarchy/subtypes";
      TypeHierarchySubtypesRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      TypeHierarchySubtypesRequest2.type = new messages_1.ProtocolRequestType(TypeHierarchySubtypesRequest2.method);
    })(TypeHierarchySubtypesRequest || (exports2.TypeHierarchySubtypesRequest = TypeHierarchySubtypesRequest = {}));
  }
});

// node_modules/vscode-languageserver-protocol/lib/common/protocol.inlineValue.js
var require_protocol_inlineValue = __commonJS({
  "node_modules/vscode-languageserver-protocol/lib/common/protocol.inlineValue.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.InlineValueRefreshRequest = exports2.InlineValueRequest = void 0;
    var messages_1 = require_messages2();
    var InlineValueRequest;
    (function(InlineValueRequest2) {
      InlineValueRequest2.method = "textDocument/inlineValue";
      InlineValueRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      InlineValueRequest2.type = new messages_1.ProtocolRequestType(InlineValueRequest2.method);
    })(InlineValueRequest || (exports2.InlineValueRequest = InlineValueRequest = {}));
    var InlineValueRefreshRequest;
    (function(InlineValueRefreshRequest2) {
      InlineValueRefreshRequest2.method = `workspace/inlineValue/refresh`;
      InlineValueRefreshRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      InlineValueRefreshRequest2.type = new messages_1.ProtocolRequestType0(InlineValueRefreshRequest2.method);
    })(InlineValueRefreshRequest || (exports2.InlineValueRefreshRequest = InlineValueRefreshRequest = {}));
  }
});

// node_modules/vscode-languageserver-protocol/lib/common/protocol.inlayHint.js
var require_protocol_inlayHint = __commonJS({
  "node_modules/vscode-languageserver-protocol/lib/common/protocol.inlayHint.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.InlayHintRefreshRequest = exports2.InlayHintResolveRequest = exports2.InlayHintRequest = void 0;
    var messages_1 = require_messages2();
    var InlayHintRequest;
    (function(InlayHintRequest2) {
      InlayHintRequest2.method = "textDocument/inlayHint";
      InlayHintRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      InlayHintRequest2.type = new messages_1.ProtocolRequestType(InlayHintRequest2.method);
    })(InlayHintRequest || (exports2.InlayHintRequest = InlayHintRequest = {}));
    var InlayHintResolveRequest;
    (function(InlayHintResolveRequest2) {
      InlayHintResolveRequest2.method = "inlayHint/resolve";
      InlayHintResolveRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      InlayHintResolveRequest2.type = new messages_1.ProtocolRequestType(InlayHintResolveRequest2.method);
    })(InlayHintResolveRequest || (exports2.InlayHintResolveRequest = InlayHintResolveRequest = {}));
    var InlayHintRefreshRequest;
    (function(InlayHintRefreshRequest2) {
      InlayHintRefreshRequest2.method = `workspace/inlayHint/refresh`;
      InlayHintRefreshRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      InlayHintRefreshRequest2.type = new messages_1.ProtocolRequestType0(InlayHintRefreshRequest2.method);
    })(InlayHintRefreshRequest || (exports2.InlayHintRefreshRequest = InlayHintRefreshRequest = {}));
  }
});

// node_modules/vscode-languageserver-protocol/lib/common/protocol.diagnostic.js
var require_protocol_diagnostic = __commonJS({
  "node_modules/vscode-languageserver-protocol/lib/common/protocol.diagnostic.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DiagnosticRefreshRequest = exports2.WorkspaceDiagnosticRequest = exports2.DocumentDiagnosticRequest = exports2.DocumentDiagnosticReportKind = exports2.DiagnosticServerCancellationData = void 0;
    var vscode_jsonrpc_1 = require_main();
    var Is = require_is3();
    var messages_1 = require_messages2();
    var DiagnosticServerCancellationData;
    (function(DiagnosticServerCancellationData2) {
      function is(value) {
        const candidate = value;
        return candidate && Is.boolean(candidate.retriggerRequest);
      }
      DiagnosticServerCancellationData2.is = is;
    })(DiagnosticServerCancellationData || (exports2.DiagnosticServerCancellationData = DiagnosticServerCancellationData = {}));
    var DocumentDiagnosticReportKind;
    (function(DocumentDiagnosticReportKind2) {
      DocumentDiagnosticReportKind2.Full = "full";
      DocumentDiagnosticReportKind2.Unchanged = "unchanged";
    })(DocumentDiagnosticReportKind || (exports2.DocumentDiagnosticReportKind = DocumentDiagnosticReportKind = {}));
    var DocumentDiagnosticRequest;
    (function(DocumentDiagnosticRequest2) {
      DocumentDiagnosticRequest2.method = "textDocument/diagnostic";
      DocumentDiagnosticRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      DocumentDiagnosticRequest2.type = new messages_1.ProtocolRequestType(DocumentDiagnosticRequest2.method);
      DocumentDiagnosticRequest2.partialResult = new vscode_jsonrpc_1.ProgressType();
    })(DocumentDiagnosticRequest || (exports2.DocumentDiagnosticRequest = DocumentDiagnosticRequest = {}));
    var WorkspaceDiagnosticRequest;
    (function(WorkspaceDiagnosticRequest2) {
      WorkspaceDiagnosticRequest2.method = "workspace/diagnostic";
      WorkspaceDiagnosticRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      WorkspaceDiagnosticRequest2.type = new messages_1.ProtocolRequestType(WorkspaceDiagnosticRequest2.method);
      WorkspaceDiagnosticRequest2.partialResult = new vscode_jsonrpc_1.ProgressType();
    })(WorkspaceDiagnosticRequest || (exports2.WorkspaceDiagnosticRequest = WorkspaceDiagnosticRequest = {}));
    var DiagnosticRefreshRequest;
    (function(DiagnosticRefreshRequest2) {
      DiagnosticRefreshRequest2.method = `workspace/diagnostic/refresh`;
      DiagnosticRefreshRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      DiagnosticRefreshRequest2.type = new messages_1.ProtocolRequestType0(DiagnosticRefreshRequest2.method);
    })(DiagnosticRefreshRequest || (exports2.DiagnosticRefreshRequest = DiagnosticRefreshRequest = {}));
  }
});

// node_modules/vscode-languageserver-protocol/lib/common/protocol.notebook.js
var require_protocol_notebook = __commonJS({
  "node_modules/vscode-languageserver-protocol/lib/common/protocol.notebook.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DidCloseNotebookDocumentNotification = exports2.DidSaveNotebookDocumentNotification = exports2.DidChangeNotebookDocumentNotification = exports2.NotebookCellArrayChange = exports2.DidOpenNotebookDocumentNotification = exports2.NotebookDocumentSyncRegistrationType = exports2.NotebookDocument = exports2.NotebookCell = exports2.ExecutionSummary = exports2.NotebookCellKind = void 0;
    var vscode_languageserver_types_1 = require_main2();
    var Is = require_is3();
    var messages_1 = require_messages2();
    var NotebookCellKind;
    (function(NotebookCellKind2) {
      NotebookCellKind2.Markup = 1;
      NotebookCellKind2.Code = 2;
      function is(value) {
        return value === 1 || value === 2;
      }
      NotebookCellKind2.is = is;
    })(NotebookCellKind || (exports2.NotebookCellKind = NotebookCellKind = {}));
    var ExecutionSummary;
    (function(ExecutionSummary2) {
      function create(executionOrder, success) {
        const result = { executionOrder };
        if (success === true || success === false) {
          result.success = success;
        }
        return result;
      }
      ExecutionSummary2.create = create;
      function is(value) {
        const candidate = value;
        return Is.objectLiteral(candidate) && vscode_languageserver_types_1.uinteger.is(candidate.executionOrder) && (candidate.success === void 0 || Is.boolean(candidate.success));
      }
      ExecutionSummary2.is = is;
      function equals(one, other) {
        if (one === other) {
          return true;
        }
        if (one === null || one === void 0 || other === null || other === void 0) {
          return false;
        }
        return one.executionOrder === other.executionOrder && one.success === other.success;
      }
      ExecutionSummary2.equals = equals;
    })(ExecutionSummary || (exports2.ExecutionSummary = ExecutionSummary = {}));
    var NotebookCell;
    (function(NotebookCell2) {
      function create(kind, document) {
        return { kind, document };
      }
      NotebookCell2.create = create;
      function is(value) {
        const candidate = value;
        return Is.objectLiteral(candidate) && NotebookCellKind.is(candidate.kind) && vscode_languageserver_types_1.DocumentUri.is(candidate.document) && (candidate.metadata === void 0 || Is.objectLiteral(candidate.metadata));
      }
      NotebookCell2.is = is;
      function diff(one, two) {
        const result = /* @__PURE__ */ new Set();
        if (one.document !== two.document) {
          result.add("document");
        }
        if (one.kind !== two.kind) {
          result.add("kind");
        }
        if (one.executionSummary !== two.executionSummary) {
          result.add("executionSummary");
        }
        if ((one.metadata !== void 0 || two.metadata !== void 0) && !equalsMetadata(one.metadata, two.metadata)) {
          result.add("metadata");
        }
        if ((one.executionSummary !== void 0 || two.executionSummary !== void 0) && !ExecutionSummary.equals(one.executionSummary, two.executionSummary)) {
          result.add("executionSummary");
        }
        return result;
      }
      NotebookCell2.diff = diff;
      function equalsMetadata(one, other) {
        if (one === other) {
          return true;
        }
        if (one === null || one === void 0 || other === null || other === void 0) {
          return false;
        }
        if (typeof one !== typeof other) {
          return false;
        }
        if (typeof one !== "object") {
          return false;
        }
        const oneArray = Array.isArray(one);
        const otherArray = Array.isArray(other);
        if (oneArray !== otherArray) {
          return false;
        }
        if (oneArray && otherArray) {
          if (one.length !== other.length) {
            return false;
          }
          for (let i = 0; i < one.length; i++) {
            if (!equalsMetadata(one[i], other[i])) {
              return false;
            }
          }
        }
        if (Is.objectLiteral(one) && Is.objectLiteral(other)) {
          const oneKeys = Object.keys(one);
          const otherKeys = Object.keys(other);
          if (oneKeys.length !== otherKeys.length) {
            return false;
          }
          oneKeys.sort();
          otherKeys.sort();
          if (!equalsMetadata(oneKeys, otherKeys)) {
            return false;
          }
          for (let i = 0; i < oneKeys.length; i++) {
            const prop = oneKeys[i];
            if (!equalsMetadata(one[prop], other[prop])) {
              return false;
            }
          }
        }
        return true;
      }
    })(NotebookCell || (exports2.NotebookCell = NotebookCell = {}));
    var NotebookDocument;
    (function(NotebookDocument2) {
      function create(uri, notebookType, version, cells) {
        return { uri, notebookType, version, cells };
      }
      NotebookDocument2.create = create;
      function is(value) {
        const candidate = value;
        return Is.objectLiteral(candidate) && Is.string(candidate.uri) && vscode_languageserver_types_1.integer.is(candidate.version) && Is.typedArray(candidate.cells, NotebookCell.is);
      }
      NotebookDocument2.is = is;
    })(NotebookDocument || (exports2.NotebookDocument = NotebookDocument = {}));
    var NotebookDocumentSyncRegistrationType;
    (function(NotebookDocumentSyncRegistrationType2) {
      NotebookDocumentSyncRegistrationType2.method = "notebookDocument/sync";
      NotebookDocumentSyncRegistrationType2.messageDirection = messages_1.MessageDirection.clientToServer;
      NotebookDocumentSyncRegistrationType2.type = new messages_1.RegistrationType(NotebookDocumentSyncRegistrationType2.method);
    })(NotebookDocumentSyncRegistrationType || (exports2.NotebookDocumentSyncRegistrationType = NotebookDocumentSyncRegistrationType = {}));
    var DidOpenNotebookDocumentNotification;
    (function(DidOpenNotebookDocumentNotification2) {
      DidOpenNotebookDocumentNotification2.method = "notebookDocument/didOpen";
      DidOpenNotebookDocumentNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      DidOpenNotebookDocumentNotification2.type = new messages_1.ProtocolNotificationType(DidOpenNotebookDocumentNotification2.method);
      DidOpenNotebookDocumentNotification2.registrationMethod = NotebookDocumentSyncRegistrationType.method;
    })(DidOpenNotebookDocumentNotification || (exports2.DidOpenNotebookDocumentNotification = DidOpenNotebookDocumentNotification = {}));
    var NotebookCellArrayChange;
    (function(NotebookCellArrayChange2) {
      function is(value) {
        const candidate = value;
        return Is.objectLiteral(candidate) && vscode_languageserver_types_1.uinteger.is(candidate.start) && vscode_languageserver_types_1.uinteger.is(candidate.deleteCount) && (candidate.cells === void 0 || Is.typedArray(candidate.cells, NotebookCell.is));
      }
      NotebookCellArrayChange2.is = is;
      function create(start, deleteCount, cells) {
        const result = { start, deleteCount };
        if (cells !== void 0) {
          result.cells = cells;
        }
        return result;
      }
      NotebookCellArrayChange2.create = create;
    })(NotebookCellArrayChange || (exports2.NotebookCellArrayChange = NotebookCellArrayChange = {}));
    var DidChangeNotebookDocumentNotification;
    (function(DidChangeNotebookDocumentNotification2) {
      DidChangeNotebookDocumentNotification2.method = "notebookDocument/didChange";
      DidChangeNotebookDocumentNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      DidChangeNotebookDocumentNotification2.type = new messages_1.ProtocolNotificationType(DidChangeNotebookDocumentNotification2.method);
      DidChangeNotebookDocumentNotification2.registrationMethod = NotebookDocumentSyncRegistrationType.method;
    })(DidChangeNotebookDocumentNotification || (exports2.DidChangeNotebookDocumentNotification = DidChangeNotebookDocumentNotification = {}));
    var DidSaveNotebookDocumentNotification;
    (function(DidSaveNotebookDocumentNotification2) {
      DidSaveNotebookDocumentNotification2.method = "notebookDocument/didSave";
      DidSaveNotebookDocumentNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      DidSaveNotebookDocumentNotification2.type = new messages_1.ProtocolNotificationType(DidSaveNotebookDocumentNotification2.method);
      DidSaveNotebookDocumentNotification2.registrationMethod = NotebookDocumentSyncRegistrationType.method;
    })(DidSaveNotebookDocumentNotification || (exports2.DidSaveNotebookDocumentNotification = DidSaveNotebookDocumentNotification = {}));
    var DidCloseNotebookDocumentNotification;
    (function(DidCloseNotebookDocumentNotification2) {
      DidCloseNotebookDocumentNotification2.method = "notebookDocument/didClose";
      DidCloseNotebookDocumentNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      DidCloseNotebookDocumentNotification2.type = new messages_1.ProtocolNotificationType(DidCloseNotebookDocumentNotification2.method);
      DidCloseNotebookDocumentNotification2.registrationMethod = NotebookDocumentSyncRegistrationType.method;
    })(DidCloseNotebookDocumentNotification || (exports2.DidCloseNotebookDocumentNotification = DidCloseNotebookDocumentNotification = {}));
  }
});

// node_modules/vscode-languageserver-protocol/lib/common/protocol.inlineCompletion.js
var require_protocol_inlineCompletion = __commonJS({
  "node_modules/vscode-languageserver-protocol/lib/common/protocol.inlineCompletion.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.InlineCompletionRequest = void 0;
    var messages_1 = require_messages2();
    var InlineCompletionRequest;
    (function(InlineCompletionRequest2) {
      InlineCompletionRequest2.method = "textDocument/inlineCompletion";
      InlineCompletionRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      InlineCompletionRequest2.type = new messages_1.ProtocolRequestType(InlineCompletionRequest2.method);
    })(InlineCompletionRequest || (exports2.InlineCompletionRequest = InlineCompletionRequest = {}));
  }
});

// node_modules/vscode-languageserver-protocol/lib/common/protocol.js
var require_protocol = __commonJS({
  "node_modules/vscode-languageserver-protocol/lib/common/protocol.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.WorkspaceSymbolRequest = exports2.CodeActionResolveRequest = exports2.CodeActionRequest = exports2.DocumentSymbolRequest = exports2.DocumentHighlightRequest = exports2.ReferencesRequest = exports2.DefinitionRequest = exports2.SignatureHelpRequest = exports2.SignatureHelpTriggerKind = exports2.HoverRequest = exports2.CompletionResolveRequest = exports2.CompletionRequest = exports2.CompletionTriggerKind = exports2.PublishDiagnosticsNotification = exports2.WatchKind = exports2.RelativePattern = exports2.FileChangeType = exports2.DidChangeWatchedFilesNotification = exports2.WillSaveTextDocumentWaitUntilRequest = exports2.WillSaveTextDocumentNotification = exports2.TextDocumentSaveReason = exports2.DidSaveTextDocumentNotification = exports2.DidCloseTextDocumentNotification = exports2.DidChangeTextDocumentNotification = exports2.TextDocumentContentChangeEvent = exports2.DidOpenTextDocumentNotification = exports2.TextDocumentSyncKind = exports2.TelemetryEventNotification = exports2.LogMessageNotification = exports2.ShowMessageRequest = exports2.ShowMessageNotification = exports2.MessageType = exports2.DidChangeConfigurationNotification = exports2.ExitNotification = exports2.ShutdownRequest = exports2.InitializedNotification = exports2.InitializeErrorCodes = exports2.InitializeRequest = exports2.WorkDoneProgressOptions = exports2.TextDocumentRegistrationOptions = exports2.StaticRegistrationOptions = exports2.PositionEncodingKind = exports2.FailureHandlingKind = exports2.ResourceOperationKind = exports2.UnregistrationRequest = exports2.RegistrationRequest = exports2.DocumentSelector = exports2.NotebookCellTextDocumentFilter = exports2.NotebookDocumentFilter = exports2.TextDocumentFilter = void 0;
    exports2.MonikerRequest = exports2.MonikerKind = exports2.UniquenessLevel = exports2.WillDeleteFilesRequest = exports2.DidDeleteFilesNotification = exports2.WillRenameFilesRequest = exports2.DidRenameFilesNotification = exports2.WillCreateFilesRequest = exports2.DidCreateFilesNotification = exports2.FileOperationPatternKind = exports2.LinkedEditingRangeRequest = exports2.ShowDocumentRequest = exports2.SemanticTokensRegistrationType = exports2.SemanticTokensRefreshRequest = exports2.SemanticTokensRangeRequest = exports2.SemanticTokensDeltaRequest = exports2.SemanticTokensRequest = exports2.TokenFormat = exports2.CallHierarchyPrepareRequest = exports2.CallHierarchyOutgoingCallsRequest = exports2.CallHierarchyIncomingCallsRequest = exports2.WorkDoneProgressCancelNotification = exports2.WorkDoneProgressCreateRequest = exports2.WorkDoneProgress = exports2.SelectionRangeRequest = exports2.DeclarationRequest = exports2.FoldingRangeRefreshRequest = exports2.FoldingRangeRequest = exports2.ColorPresentationRequest = exports2.DocumentColorRequest = exports2.ConfigurationRequest = exports2.DidChangeWorkspaceFoldersNotification = exports2.WorkspaceFoldersRequest = exports2.TypeDefinitionRequest = exports2.ImplementationRequest = exports2.ApplyWorkspaceEditRequest = exports2.ExecuteCommandRequest = exports2.PrepareRenameRequest = exports2.RenameRequest = exports2.PrepareSupportDefaultBehavior = exports2.DocumentOnTypeFormattingRequest = exports2.DocumentRangesFormattingRequest = exports2.DocumentRangeFormattingRequest = exports2.DocumentFormattingRequest = exports2.DocumentLinkResolveRequest = exports2.DocumentLinkRequest = exports2.CodeLensRefreshRequest = exports2.CodeLensResolveRequest = exports2.CodeLensRequest = exports2.WorkspaceSymbolResolveRequest = void 0;
    exports2.InlineCompletionRequest = exports2.DidCloseNotebookDocumentNotification = exports2.DidSaveNotebookDocumentNotification = exports2.DidChangeNotebookDocumentNotification = exports2.NotebookCellArrayChange = exports2.DidOpenNotebookDocumentNotification = exports2.NotebookDocumentSyncRegistrationType = exports2.NotebookDocument = exports2.NotebookCell = exports2.ExecutionSummary = exports2.NotebookCellKind = exports2.DiagnosticRefreshRequest = exports2.WorkspaceDiagnosticRequest = exports2.DocumentDiagnosticRequest = exports2.DocumentDiagnosticReportKind = exports2.DiagnosticServerCancellationData = exports2.InlayHintRefreshRequest = exports2.InlayHintResolveRequest = exports2.InlayHintRequest = exports2.InlineValueRefreshRequest = exports2.InlineValueRequest = exports2.TypeHierarchySupertypesRequest = exports2.TypeHierarchySubtypesRequest = exports2.TypeHierarchyPrepareRequest = void 0;
    var messages_1 = require_messages2();
    var vscode_languageserver_types_1 = require_main2();
    var Is = require_is3();
    var protocol_implementation_1 = require_protocol_implementation();
    Object.defineProperty(exports2, "ImplementationRequest", { enumerable: true, get: function() {
      return protocol_implementation_1.ImplementationRequest;
    } });
    var protocol_typeDefinition_1 = require_protocol_typeDefinition();
    Object.defineProperty(exports2, "TypeDefinitionRequest", { enumerable: true, get: function() {
      return protocol_typeDefinition_1.TypeDefinitionRequest;
    } });
    var protocol_workspaceFolder_1 = require_protocol_workspaceFolder();
    Object.defineProperty(exports2, "WorkspaceFoldersRequest", { enumerable: true, get: function() {
      return protocol_workspaceFolder_1.WorkspaceFoldersRequest;
    } });
    Object.defineProperty(exports2, "DidChangeWorkspaceFoldersNotification", { enumerable: true, get: function() {
      return protocol_workspaceFolder_1.DidChangeWorkspaceFoldersNotification;
    } });
    var protocol_configuration_1 = require_protocol_configuration();
    Object.defineProperty(exports2, "ConfigurationRequest", { enumerable: true, get: function() {
      return protocol_configuration_1.ConfigurationRequest;
    } });
    var protocol_colorProvider_1 = require_protocol_colorProvider();
    Object.defineProperty(exports2, "DocumentColorRequest", { enumerable: true, get: function() {
      return protocol_colorProvider_1.DocumentColorRequest;
    } });
    Object.defineProperty(exports2, "ColorPresentationRequest", { enumerable: true, get: function() {
      return protocol_colorProvider_1.ColorPresentationRequest;
    } });
    var protocol_foldingRange_1 = require_protocol_foldingRange();
    Object.defineProperty(exports2, "FoldingRangeRequest", { enumerable: true, get: function() {
      return protocol_foldingRange_1.FoldingRangeRequest;
    } });
    Object.defineProperty(exports2, "FoldingRangeRefreshRequest", { enumerable: true, get: function() {
      return protocol_foldingRange_1.FoldingRangeRefreshRequest;
    } });
    var protocol_declaration_1 = require_protocol_declaration();
    Object.defineProperty(exports2, "DeclarationRequest", { enumerable: true, get: function() {
      return protocol_declaration_1.DeclarationRequest;
    } });
    var protocol_selectionRange_1 = require_protocol_selectionRange();
    Object.defineProperty(exports2, "SelectionRangeRequest", { enumerable: true, get: function() {
      return protocol_selectionRange_1.SelectionRangeRequest;
    } });
    var protocol_progress_1 = require_protocol_progress();
    Object.defineProperty(exports2, "WorkDoneProgress", { enumerable: true, get: function() {
      return protocol_progress_1.WorkDoneProgress;
    } });
    Object.defineProperty(exports2, "WorkDoneProgressCreateRequest", { enumerable: true, get: function() {
      return protocol_progress_1.WorkDoneProgressCreateRequest;
    } });
    Object.defineProperty(exports2, "WorkDoneProgressCancelNotification", { enumerable: true, get: function() {
      return protocol_progress_1.WorkDoneProgressCancelNotification;
    } });
    var protocol_callHierarchy_1 = require_protocol_callHierarchy();
    Object.defineProperty(exports2, "CallHierarchyIncomingCallsRequest", { enumerable: true, get: function() {
      return protocol_callHierarchy_1.CallHierarchyIncomingCallsRequest;
    } });
    Object.defineProperty(exports2, "CallHierarchyOutgoingCallsRequest", { enumerable: true, get: function() {
      return protocol_callHierarchy_1.CallHierarchyOutgoingCallsRequest;
    } });
    Object.defineProperty(exports2, "CallHierarchyPrepareRequest", { enumerable: true, get: function() {
      return protocol_callHierarchy_1.CallHierarchyPrepareRequest;
    } });
    var protocol_semanticTokens_1 = require_protocol_semanticTokens();
    Object.defineProperty(exports2, "TokenFormat", { enumerable: true, get: function() {
      return protocol_semanticTokens_1.TokenFormat;
    } });
    Object.defineProperty(exports2, "SemanticTokensRequest", { enumerable: true, get: function() {
      return protocol_semanticTokens_1.SemanticTokensRequest;
    } });
    Object.defineProperty(exports2, "SemanticTokensDeltaRequest", { enumerable: true, get: function() {
      return protocol_semanticTokens_1.SemanticTokensDeltaRequest;
    } });
    Object.defineProperty(exports2, "SemanticTokensRangeRequest", { enumerable: true, get: function() {
      return protocol_semanticTokens_1.SemanticTokensRangeRequest;
    } });
    Object.defineProperty(exports2, "SemanticTokensRefreshRequest", { enumerable: true, get: function() {
      return protocol_semanticTokens_1.SemanticTokensRefreshRequest;
    } });
    Object.defineProperty(exports2, "SemanticTokensRegistrationType", { enumerable: true, get: function() {
      return protocol_semanticTokens_1.SemanticTokensRegistrationType;
    } });
    var protocol_showDocument_1 = require_protocol_showDocument();
    Object.defineProperty(exports2, "ShowDocumentRequest", { enumerable: true, get: function() {
      return protocol_showDocument_1.ShowDocumentRequest;
    } });
    var protocol_linkedEditingRange_1 = require_protocol_linkedEditingRange();
    Object.defineProperty(exports2, "LinkedEditingRangeRequest", { enumerable: true, get: function() {
      return protocol_linkedEditingRange_1.LinkedEditingRangeRequest;
    } });
    var protocol_fileOperations_1 = require_protocol_fileOperations();
    Object.defineProperty(exports2, "FileOperationPatternKind", { enumerable: true, get: function() {
      return protocol_fileOperations_1.FileOperationPatternKind;
    } });
    Object.defineProperty(exports2, "DidCreateFilesNotification", { enumerable: true, get: function() {
      return protocol_fileOperations_1.DidCreateFilesNotification;
    } });
    Object.defineProperty(exports2, "WillCreateFilesRequest", { enumerable: true, get: function() {
      return protocol_fileOperations_1.WillCreateFilesRequest;
    } });
    Object.defineProperty(exports2, "DidRenameFilesNotification", { enumerable: true, get: function() {
      return protocol_fileOperations_1.DidRenameFilesNotification;
    } });
    Object.defineProperty(exports2, "WillRenameFilesRequest", { enumerable: true, get: function() {
      return protocol_fileOperations_1.WillRenameFilesRequest;
    } });
    Object.defineProperty(exports2, "DidDeleteFilesNotification", { enumerable: true, get: function() {
      return protocol_fileOperations_1.DidDeleteFilesNotification;
    } });
    Object.defineProperty(exports2, "WillDeleteFilesRequest", { enumerable: true, get: function() {
      return protocol_fileOperations_1.WillDeleteFilesRequest;
    } });
    var protocol_moniker_1 = require_protocol_moniker();
    Object.defineProperty(exports2, "UniquenessLevel", { enumerable: true, get: function() {
      return protocol_moniker_1.UniquenessLevel;
    } });
    Object.defineProperty(exports2, "MonikerKind", { enumerable: true, get: function() {
      return protocol_moniker_1.MonikerKind;
    } });
    Object.defineProperty(exports2, "MonikerRequest", { enumerable: true, get: function() {
      return protocol_moniker_1.MonikerRequest;
    } });
    var protocol_typeHierarchy_1 = require_protocol_typeHierarchy();
    Object.defineProperty(exports2, "TypeHierarchyPrepareRequest", { enumerable: true, get: function() {
      return protocol_typeHierarchy_1.TypeHierarchyPrepareRequest;
    } });
    Object.defineProperty(exports2, "TypeHierarchySubtypesRequest", { enumerable: true, get: function() {
      return protocol_typeHierarchy_1.TypeHierarchySubtypesRequest;
    } });
    Object.defineProperty(exports2, "TypeHierarchySupertypesRequest", { enumerable: true, get: function() {
      return protocol_typeHierarchy_1.TypeHierarchySupertypesRequest;
    } });
    var protocol_inlineValue_1 = require_protocol_inlineValue();
    Object.defineProperty(exports2, "InlineValueRequest", { enumerable: true, get: function() {
      return protocol_inlineValue_1.InlineValueRequest;
    } });
    Object.defineProperty(exports2, "InlineValueRefreshRequest", { enumerable: true, get: function() {
      return protocol_inlineValue_1.InlineValueRefreshRequest;
    } });
    var protocol_inlayHint_1 = require_protocol_inlayHint();
    Object.defineProperty(exports2, "InlayHintRequest", { enumerable: true, get: function() {
      return protocol_inlayHint_1.InlayHintRequest;
    } });
    Object.defineProperty(exports2, "InlayHintResolveRequest", { enumerable: true, get: function() {
      return protocol_inlayHint_1.InlayHintResolveRequest;
    } });
    Object.defineProperty(exports2, "InlayHintRefreshRequest", { enumerable: true, get: function() {
      return protocol_inlayHint_1.InlayHintRefreshRequest;
    } });
    var protocol_diagnostic_1 = require_protocol_diagnostic();
    Object.defineProperty(exports2, "DiagnosticServerCancellationData", { enumerable: true, get: function() {
      return protocol_diagnostic_1.DiagnosticServerCancellationData;
    } });
    Object.defineProperty(exports2, "DocumentDiagnosticReportKind", { enumerable: true, get: function() {
      return protocol_diagnostic_1.DocumentDiagnosticReportKind;
    } });
    Object.defineProperty(exports2, "DocumentDiagnosticRequest", { enumerable: true, get: function() {
      return protocol_diagnostic_1.DocumentDiagnosticRequest;
    } });
    Object.defineProperty(exports2, "WorkspaceDiagnosticRequest", { enumerable: true, get: function() {
      return protocol_diagnostic_1.WorkspaceDiagnosticRequest;
    } });
    Object.defineProperty(exports2, "DiagnosticRefreshRequest", { enumerable: true, get: function() {
      return protocol_diagnostic_1.DiagnosticRefreshRequest;
    } });
    var protocol_notebook_1 = require_protocol_notebook();
    Object.defineProperty(exports2, "NotebookCellKind", { enumerable: true, get: function() {
      return protocol_notebook_1.NotebookCellKind;
    } });
    Object.defineProperty(exports2, "ExecutionSummary", { enumerable: true, get: function() {
      return protocol_notebook_1.ExecutionSummary;
    } });
    Object.defineProperty(exports2, "NotebookCell", { enumerable: true, get: function() {
      return protocol_notebook_1.NotebookCell;
    } });
    Object.defineProperty(exports2, "NotebookDocument", { enumerable: true, get: function() {
      return protocol_notebook_1.NotebookDocument;
    } });
    Object.defineProperty(exports2, "NotebookDocumentSyncRegistrationType", { enumerable: true, get: function() {
      return protocol_notebook_1.NotebookDocumentSyncRegistrationType;
    } });
    Object.defineProperty(exports2, "DidOpenNotebookDocumentNotification", { enumerable: true, get: function() {
      return protocol_notebook_1.DidOpenNotebookDocumentNotification;
    } });
    Object.defineProperty(exports2, "NotebookCellArrayChange", { enumerable: true, get: function() {
      return protocol_notebook_1.NotebookCellArrayChange;
    } });
    Object.defineProperty(exports2, "DidChangeNotebookDocumentNotification", { enumerable: true, get: function() {
      return protocol_notebook_1.DidChangeNotebookDocumentNotification;
    } });
    Object.defineProperty(exports2, "DidSaveNotebookDocumentNotification", { enumerable: true, get: function() {
      return protocol_notebook_1.DidSaveNotebookDocumentNotification;
    } });
    Object.defineProperty(exports2, "DidCloseNotebookDocumentNotification", { enumerable: true, get: function() {
      return protocol_notebook_1.DidCloseNotebookDocumentNotification;
    } });
    var protocol_inlineCompletion_1 = require_protocol_inlineCompletion();
    Object.defineProperty(exports2, "InlineCompletionRequest", { enumerable: true, get: function() {
      return protocol_inlineCompletion_1.InlineCompletionRequest;
    } });
    var TextDocumentFilter;
    (function(TextDocumentFilter2) {
      function is(value) {
        const candidate = value;
        return Is.string(candidate) || (Is.string(candidate.language) || Is.string(candidate.scheme) || Is.string(candidate.pattern));
      }
      TextDocumentFilter2.is = is;
    })(TextDocumentFilter || (exports2.TextDocumentFilter = TextDocumentFilter = {}));
    var NotebookDocumentFilter;
    (function(NotebookDocumentFilter2) {
      function is(value) {
        const candidate = value;
        return Is.objectLiteral(candidate) && (Is.string(candidate.notebookType) || Is.string(candidate.scheme) || Is.string(candidate.pattern));
      }
      NotebookDocumentFilter2.is = is;
    })(NotebookDocumentFilter || (exports2.NotebookDocumentFilter = NotebookDocumentFilter = {}));
    var NotebookCellTextDocumentFilter;
    (function(NotebookCellTextDocumentFilter2) {
      function is(value) {
        const candidate = value;
        return Is.objectLiteral(candidate) && (Is.string(candidate.notebook) || NotebookDocumentFilter.is(candidate.notebook)) && (candidate.language === void 0 || Is.string(candidate.language));
      }
      NotebookCellTextDocumentFilter2.is = is;
    })(NotebookCellTextDocumentFilter || (exports2.NotebookCellTextDocumentFilter = NotebookCellTextDocumentFilter = {}));
    var DocumentSelector;
    (function(DocumentSelector2) {
      function is(value) {
        if (!Array.isArray(value)) {
          return false;
        }
        for (let elem of value) {
          if (!Is.string(elem) && !TextDocumentFilter.is(elem) && !NotebookCellTextDocumentFilter.is(elem)) {
            return false;
          }
        }
        return true;
      }
      DocumentSelector2.is = is;
    })(DocumentSelector || (exports2.DocumentSelector = DocumentSelector = {}));
    var RegistrationRequest;
    (function(RegistrationRequest2) {
      RegistrationRequest2.method = "client/registerCapability";
      RegistrationRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      RegistrationRequest2.type = new messages_1.ProtocolRequestType(RegistrationRequest2.method);
    })(RegistrationRequest || (exports2.RegistrationRequest = RegistrationRequest = {}));
    var UnregistrationRequest;
    (function(UnregistrationRequest2) {
      UnregistrationRequest2.method = "client/unregisterCapability";
      UnregistrationRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      UnregistrationRequest2.type = new messages_1.ProtocolRequestType(UnregistrationRequest2.method);
    })(UnregistrationRequest || (exports2.UnregistrationRequest = UnregistrationRequest = {}));
    var ResourceOperationKind;
    (function(ResourceOperationKind2) {
      ResourceOperationKind2.Create = "create";
      ResourceOperationKind2.Rename = "rename";
      ResourceOperationKind2.Delete = "delete";
    })(ResourceOperationKind || (exports2.ResourceOperationKind = ResourceOperationKind = {}));
    var FailureHandlingKind;
    (function(FailureHandlingKind2) {
      FailureHandlingKind2.Abort = "abort";
      FailureHandlingKind2.Transactional = "transactional";
      FailureHandlingKind2.TextOnlyTransactional = "textOnlyTransactional";
      FailureHandlingKind2.Undo = "undo";
    })(FailureHandlingKind || (exports2.FailureHandlingKind = FailureHandlingKind = {}));
    var PositionEncodingKind;
    (function(PositionEncodingKind2) {
      PositionEncodingKind2.UTF8 = "utf-8";
      PositionEncodingKind2.UTF16 = "utf-16";
      PositionEncodingKind2.UTF32 = "utf-32";
    })(PositionEncodingKind || (exports2.PositionEncodingKind = PositionEncodingKind = {}));
    var StaticRegistrationOptions;
    (function(StaticRegistrationOptions2) {
      function hasId(value) {
        const candidate = value;
        return candidate && Is.string(candidate.id) && candidate.id.length > 0;
      }
      StaticRegistrationOptions2.hasId = hasId;
    })(StaticRegistrationOptions || (exports2.StaticRegistrationOptions = StaticRegistrationOptions = {}));
    var TextDocumentRegistrationOptions;
    (function(TextDocumentRegistrationOptions2) {
      function is(value) {
        const candidate = value;
        return candidate && (candidate.documentSelector === null || DocumentSelector.is(candidate.documentSelector));
      }
      TextDocumentRegistrationOptions2.is = is;
    })(TextDocumentRegistrationOptions || (exports2.TextDocumentRegistrationOptions = TextDocumentRegistrationOptions = {}));
    var WorkDoneProgressOptions;
    (function(WorkDoneProgressOptions2) {
      function is(value) {
        const candidate = value;
        return Is.objectLiteral(candidate) && (candidate.workDoneProgress === void 0 || Is.boolean(candidate.workDoneProgress));
      }
      WorkDoneProgressOptions2.is = is;
      function hasWorkDoneProgress(value) {
        const candidate = value;
        return candidate && Is.boolean(candidate.workDoneProgress);
      }
      WorkDoneProgressOptions2.hasWorkDoneProgress = hasWorkDoneProgress;
    })(WorkDoneProgressOptions || (exports2.WorkDoneProgressOptions = WorkDoneProgressOptions = {}));
    var InitializeRequest;
    (function(InitializeRequest2) {
      InitializeRequest2.method = "initialize";
      InitializeRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      InitializeRequest2.type = new messages_1.ProtocolRequestType(InitializeRequest2.method);
    })(InitializeRequest || (exports2.InitializeRequest = InitializeRequest = {}));
    var InitializeErrorCodes;
    (function(InitializeErrorCodes2) {
      InitializeErrorCodes2.unknownProtocolVersion = 1;
    })(InitializeErrorCodes || (exports2.InitializeErrorCodes = InitializeErrorCodes = {}));
    var InitializedNotification;
    (function(InitializedNotification2) {
      InitializedNotification2.method = "initialized";
      InitializedNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      InitializedNotification2.type = new messages_1.ProtocolNotificationType(InitializedNotification2.method);
    })(InitializedNotification || (exports2.InitializedNotification = InitializedNotification = {}));
    var ShutdownRequest;
    (function(ShutdownRequest2) {
      ShutdownRequest2.method = "shutdown";
      ShutdownRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      ShutdownRequest2.type = new messages_1.ProtocolRequestType0(ShutdownRequest2.method);
    })(ShutdownRequest || (exports2.ShutdownRequest = ShutdownRequest = {}));
    var ExitNotification;
    (function(ExitNotification2) {
      ExitNotification2.method = "exit";
      ExitNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      ExitNotification2.type = new messages_1.ProtocolNotificationType0(ExitNotification2.method);
    })(ExitNotification || (exports2.ExitNotification = ExitNotification = {}));
    var DidChangeConfigurationNotification;
    (function(DidChangeConfigurationNotification2) {
      DidChangeConfigurationNotification2.method = "workspace/didChangeConfiguration";
      DidChangeConfigurationNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      DidChangeConfigurationNotification2.type = new messages_1.ProtocolNotificationType(DidChangeConfigurationNotification2.method);
    })(DidChangeConfigurationNotification || (exports2.DidChangeConfigurationNotification = DidChangeConfigurationNotification = {}));
    var MessageType;
    (function(MessageType2) {
      MessageType2.Error = 1;
      MessageType2.Warning = 2;
      MessageType2.Info = 3;
      MessageType2.Log = 4;
      MessageType2.Debug = 5;
    })(MessageType || (exports2.MessageType = MessageType = {}));
    var ShowMessageNotification;
    (function(ShowMessageNotification2) {
      ShowMessageNotification2.method = "window/showMessage";
      ShowMessageNotification2.messageDirection = messages_1.MessageDirection.serverToClient;
      ShowMessageNotification2.type = new messages_1.ProtocolNotificationType(ShowMessageNotification2.method);
    })(ShowMessageNotification || (exports2.ShowMessageNotification = ShowMessageNotification = {}));
    var ShowMessageRequest;
    (function(ShowMessageRequest2) {
      ShowMessageRequest2.method = "window/showMessageRequest";
      ShowMessageRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      ShowMessageRequest2.type = new messages_1.ProtocolRequestType(ShowMessageRequest2.method);
    })(ShowMessageRequest || (exports2.ShowMessageRequest = ShowMessageRequest = {}));
    var LogMessageNotification;
    (function(LogMessageNotification2) {
      LogMessageNotification2.method = "window/logMessage";
      LogMessageNotification2.messageDirection = messages_1.MessageDirection.serverToClient;
      LogMessageNotification2.type = new messages_1.ProtocolNotificationType(LogMessageNotification2.method);
    })(LogMessageNotification || (exports2.LogMessageNotification = LogMessageNotification = {}));
    var TelemetryEventNotification;
    (function(TelemetryEventNotification2) {
      TelemetryEventNotification2.method = "telemetry/event";
      TelemetryEventNotification2.messageDirection = messages_1.MessageDirection.serverToClient;
      TelemetryEventNotification2.type = new messages_1.ProtocolNotificationType(TelemetryEventNotification2.method);
    })(TelemetryEventNotification || (exports2.TelemetryEventNotification = TelemetryEventNotification = {}));
    var TextDocumentSyncKind2;
    (function(TextDocumentSyncKind3) {
      TextDocumentSyncKind3.None = 0;
      TextDocumentSyncKind3.Full = 1;
      TextDocumentSyncKind3.Incremental = 2;
    })(TextDocumentSyncKind2 || (exports2.TextDocumentSyncKind = TextDocumentSyncKind2 = {}));
    var DidOpenTextDocumentNotification;
    (function(DidOpenTextDocumentNotification2) {
      DidOpenTextDocumentNotification2.method = "textDocument/didOpen";
      DidOpenTextDocumentNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      DidOpenTextDocumentNotification2.type = new messages_1.ProtocolNotificationType(DidOpenTextDocumentNotification2.method);
    })(DidOpenTextDocumentNotification || (exports2.DidOpenTextDocumentNotification = DidOpenTextDocumentNotification = {}));
    var TextDocumentContentChangeEvent;
    (function(TextDocumentContentChangeEvent2) {
      function isIncremental(event) {
        let candidate = event;
        return candidate !== void 0 && candidate !== null && typeof candidate.text === "string" && candidate.range !== void 0 && (candidate.rangeLength === void 0 || typeof candidate.rangeLength === "number");
      }
      TextDocumentContentChangeEvent2.isIncremental = isIncremental;
      function isFull(event) {
        let candidate = event;
        return candidate !== void 0 && candidate !== null && typeof candidate.text === "string" && candidate.range === void 0 && candidate.rangeLength === void 0;
      }
      TextDocumentContentChangeEvent2.isFull = isFull;
    })(TextDocumentContentChangeEvent || (exports2.TextDocumentContentChangeEvent = TextDocumentContentChangeEvent = {}));
    var DidChangeTextDocumentNotification;
    (function(DidChangeTextDocumentNotification2) {
      DidChangeTextDocumentNotification2.method = "textDocument/didChange";
      DidChangeTextDocumentNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      DidChangeTextDocumentNotification2.type = new messages_1.ProtocolNotificationType(DidChangeTextDocumentNotification2.method);
    })(DidChangeTextDocumentNotification || (exports2.DidChangeTextDocumentNotification = DidChangeTextDocumentNotification = {}));
    var DidCloseTextDocumentNotification;
    (function(DidCloseTextDocumentNotification2) {
      DidCloseTextDocumentNotification2.method = "textDocument/didClose";
      DidCloseTextDocumentNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      DidCloseTextDocumentNotification2.type = new messages_1.ProtocolNotificationType(DidCloseTextDocumentNotification2.method);
    })(DidCloseTextDocumentNotification || (exports2.DidCloseTextDocumentNotification = DidCloseTextDocumentNotification = {}));
    var DidSaveTextDocumentNotification;
    (function(DidSaveTextDocumentNotification2) {
      DidSaveTextDocumentNotification2.method = "textDocument/didSave";
      DidSaveTextDocumentNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      DidSaveTextDocumentNotification2.type = new messages_1.ProtocolNotificationType(DidSaveTextDocumentNotification2.method);
    })(DidSaveTextDocumentNotification || (exports2.DidSaveTextDocumentNotification = DidSaveTextDocumentNotification = {}));
    var TextDocumentSaveReason;
    (function(TextDocumentSaveReason2) {
      TextDocumentSaveReason2.Manual = 1;
      TextDocumentSaveReason2.AfterDelay = 2;
      TextDocumentSaveReason2.FocusOut = 3;
    })(TextDocumentSaveReason || (exports2.TextDocumentSaveReason = TextDocumentSaveReason = {}));
    var WillSaveTextDocumentNotification;
    (function(WillSaveTextDocumentNotification2) {
      WillSaveTextDocumentNotification2.method = "textDocument/willSave";
      WillSaveTextDocumentNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      WillSaveTextDocumentNotification2.type = new messages_1.ProtocolNotificationType(WillSaveTextDocumentNotification2.method);
    })(WillSaveTextDocumentNotification || (exports2.WillSaveTextDocumentNotification = WillSaveTextDocumentNotification = {}));
    var WillSaveTextDocumentWaitUntilRequest;
    (function(WillSaveTextDocumentWaitUntilRequest2) {
      WillSaveTextDocumentWaitUntilRequest2.method = "textDocument/willSaveWaitUntil";
      WillSaveTextDocumentWaitUntilRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      WillSaveTextDocumentWaitUntilRequest2.type = new messages_1.ProtocolRequestType(WillSaveTextDocumentWaitUntilRequest2.method);
    })(WillSaveTextDocumentWaitUntilRequest || (exports2.WillSaveTextDocumentWaitUntilRequest = WillSaveTextDocumentWaitUntilRequest = {}));
    var DidChangeWatchedFilesNotification2;
    (function(DidChangeWatchedFilesNotification3) {
      DidChangeWatchedFilesNotification3.method = "workspace/didChangeWatchedFiles";
      DidChangeWatchedFilesNotification3.messageDirection = messages_1.MessageDirection.clientToServer;
      DidChangeWatchedFilesNotification3.type = new messages_1.ProtocolNotificationType(DidChangeWatchedFilesNotification3.method);
    })(DidChangeWatchedFilesNotification2 || (exports2.DidChangeWatchedFilesNotification = DidChangeWatchedFilesNotification2 = {}));
    var FileChangeType;
    (function(FileChangeType2) {
      FileChangeType2.Created = 1;
      FileChangeType2.Changed = 2;
      FileChangeType2.Deleted = 3;
    })(FileChangeType || (exports2.FileChangeType = FileChangeType = {}));
    var RelativePattern;
    (function(RelativePattern2) {
      function is(value) {
        const candidate = value;
        return Is.objectLiteral(candidate) && (vscode_languageserver_types_1.URI.is(candidate.baseUri) || vscode_languageserver_types_1.WorkspaceFolder.is(candidate.baseUri)) && Is.string(candidate.pattern);
      }
      RelativePattern2.is = is;
    })(RelativePattern || (exports2.RelativePattern = RelativePattern = {}));
    var WatchKind;
    (function(WatchKind2) {
      WatchKind2.Create = 1;
      WatchKind2.Change = 2;
      WatchKind2.Delete = 4;
    })(WatchKind || (exports2.WatchKind = WatchKind = {}));
    var PublishDiagnosticsNotification;
    (function(PublishDiagnosticsNotification2) {
      PublishDiagnosticsNotification2.method = "textDocument/publishDiagnostics";
      PublishDiagnosticsNotification2.messageDirection = messages_1.MessageDirection.serverToClient;
      PublishDiagnosticsNotification2.type = new messages_1.ProtocolNotificationType(PublishDiagnosticsNotification2.method);
    })(PublishDiagnosticsNotification || (exports2.PublishDiagnosticsNotification = PublishDiagnosticsNotification = {}));
    var CompletionTriggerKind;
    (function(CompletionTriggerKind2) {
      CompletionTriggerKind2.Invoked = 1;
      CompletionTriggerKind2.TriggerCharacter = 2;
      CompletionTriggerKind2.TriggerForIncompleteCompletions = 3;
    })(CompletionTriggerKind || (exports2.CompletionTriggerKind = CompletionTriggerKind = {}));
    var CompletionRequest;
    (function(CompletionRequest2) {
      CompletionRequest2.method = "textDocument/completion";
      CompletionRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      CompletionRequest2.type = new messages_1.ProtocolRequestType(CompletionRequest2.method);
    })(CompletionRequest || (exports2.CompletionRequest = CompletionRequest = {}));
    var CompletionResolveRequest;
    (function(CompletionResolveRequest2) {
      CompletionResolveRequest2.method = "completionItem/resolve";
      CompletionResolveRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      CompletionResolveRequest2.type = new messages_1.ProtocolRequestType(CompletionResolveRequest2.method);
    })(CompletionResolveRequest || (exports2.CompletionResolveRequest = CompletionResolveRequest = {}));
    var HoverRequest;
    (function(HoverRequest2) {
      HoverRequest2.method = "textDocument/hover";
      HoverRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      HoverRequest2.type = new messages_1.ProtocolRequestType(HoverRequest2.method);
    })(HoverRequest || (exports2.HoverRequest = HoverRequest = {}));
    var SignatureHelpTriggerKind;
    (function(SignatureHelpTriggerKind2) {
      SignatureHelpTriggerKind2.Invoked = 1;
      SignatureHelpTriggerKind2.TriggerCharacter = 2;
      SignatureHelpTriggerKind2.ContentChange = 3;
    })(SignatureHelpTriggerKind || (exports2.SignatureHelpTriggerKind = SignatureHelpTriggerKind = {}));
    var SignatureHelpRequest;
    (function(SignatureHelpRequest2) {
      SignatureHelpRequest2.method = "textDocument/signatureHelp";
      SignatureHelpRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      SignatureHelpRequest2.type = new messages_1.ProtocolRequestType(SignatureHelpRequest2.method);
    })(SignatureHelpRequest || (exports2.SignatureHelpRequest = SignatureHelpRequest = {}));
    var DefinitionRequest;
    (function(DefinitionRequest2) {
      DefinitionRequest2.method = "textDocument/definition";
      DefinitionRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      DefinitionRequest2.type = new messages_1.ProtocolRequestType(DefinitionRequest2.method);
    })(DefinitionRequest || (exports2.DefinitionRequest = DefinitionRequest = {}));
    var ReferencesRequest;
    (function(ReferencesRequest2) {
      ReferencesRequest2.method = "textDocument/references";
      ReferencesRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      ReferencesRequest2.type = new messages_1.ProtocolRequestType(ReferencesRequest2.method);
    })(ReferencesRequest || (exports2.ReferencesRequest = ReferencesRequest = {}));
    var DocumentHighlightRequest;
    (function(DocumentHighlightRequest2) {
      DocumentHighlightRequest2.method = "textDocument/documentHighlight";
      DocumentHighlightRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      DocumentHighlightRequest2.type = new messages_1.ProtocolRequestType(DocumentHighlightRequest2.method);
    })(DocumentHighlightRequest || (exports2.DocumentHighlightRequest = DocumentHighlightRequest = {}));
    var DocumentSymbolRequest;
    (function(DocumentSymbolRequest2) {
      DocumentSymbolRequest2.method = "textDocument/documentSymbol";
      DocumentSymbolRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      DocumentSymbolRequest2.type = new messages_1.ProtocolRequestType(DocumentSymbolRequest2.method);
    })(DocumentSymbolRequest || (exports2.DocumentSymbolRequest = DocumentSymbolRequest = {}));
    var CodeActionRequest;
    (function(CodeActionRequest2) {
      CodeActionRequest2.method = "textDocument/codeAction";
      CodeActionRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      CodeActionRequest2.type = new messages_1.ProtocolRequestType(CodeActionRequest2.method);
    })(CodeActionRequest || (exports2.CodeActionRequest = CodeActionRequest = {}));
    var CodeActionResolveRequest;
    (function(CodeActionResolveRequest2) {
      CodeActionResolveRequest2.method = "codeAction/resolve";
      CodeActionResolveRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      CodeActionResolveRequest2.type = new messages_1.ProtocolRequestType(CodeActionResolveRequest2.method);
    })(CodeActionResolveRequest || (exports2.CodeActionResolveRequest = CodeActionResolveRequest = {}));
    var WorkspaceSymbolRequest;
    (function(WorkspaceSymbolRequest2) {
      WorkspaceSymbolRequest2.method = "workspace/symbol";
      WorkspaceSymbolRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      WorkspaceSymbolRequest2.type = new messages_1.ProtocolRequestType(WorkspaceSymbolRequest2.method);
    })(WorkspaceSymbolRequest || (exports2.WorkspaceSymbolRequest = WorkspaceSymbolRequest = {}));
    var WorkspaceSymbolResolveRequest;
    (function(WorkspaceSymbolResolveRequest2) {
      WorkspaceSymbolResolveRequest2.method = "workspaceSymbol/resolve";
      WorkspaceSymbolResolveRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      WorkspaceSymbolResolveRequest2.type = new messages_1.ProtocolRequestType(WorkspaceSymbolResolveRequest2.method);
    })(WorkspaceSymbolResolveRequest || (exports2.WorkspaceSymbolResolveRequest = WorkspaceSymbolResolveRequest = {}));
    var CodeLensRequest;
    (function(CodeLensRequest2) {
      CodeLensRequest2.method = "textDocument/codeLens";
      CodeLensRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      CodeLensRequest2.type = new messages_1.ProtocolRequestType(CodeLensRequest2.method);
    })(CodeLensRequest || (exports2.CodeLensRequest = CodeLensRequest = {}));
    var CodeLensResolveRequest;
    (function(CodeLensResolveRequest2) {
      CodeLensResolveRequest2.method = "codeLens/resolve";
      CodeLensResolveRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      CodeLensResolveRequest2.type = new messages_1.ProtocolRequestType(CodeLensResolveRequest2.method);
    })(CodeLensResolveRequest || (exports2.CodeLensResolveRequest = CodeLensResolveRequest = {}));
    var CodeLensRefreshRequest;
    (function(CodeLensRefreshRequest2) {
      CodeLensRefreshRequest2.method = `workspace/codeLens/refresh`;
      CodeLensRefreshRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      CodeLensRefreshRequest2.type = new messages_1.ProtocolRequestType0(CodeLensRefreshRequest2.method);
    })(CodeLensRefreshRequest || (exports2.CodeLensRefreshRequest = CodeLensRefreshRequest = {}));
    var DocumentLinkRequest;
    (function(DocumentLinkRequest2) {
      DocumentLinkRequest2.method = "textDocument/documentLink";
      DocumentLinkRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      DocumentLinkRequest2.type = new messages_1.ProtocolRequestType(DocumentLinkRequest2.method);
    })(DocumentLinkRequest || (exports2.DocumentLinkRequest = DocumentLinkRequest = {}));
    var DocumentLinkResolveRequest;
    (function(DocumentLinkResolveRequest2) {
      DocumentLinkResolveRequest2.method = "documentLink/resolve";
      DocumentLinkResolveRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      DocumentLinkResolveRequest2.type = new messages_1.ProtocolRequestType(DocumentLinkResolveRequest2.method);
    })(DocumentLinkResolveRequest || (exports2.DocumentLinkResolveRequest = DocumentLinkResolveRequest = {}));
    var DocumentFormattingRequest;
    (function(DocumentFormattingRequest2) {
      DocumentFormattingRequest2.method = "textDocument/formatting";
      DocumentFormattingRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      DocumentFormattingRequest2.type = new messages_1.ProtocolRequestType(DocumentFormattingRequest2.method);
    })(DocumentFormattingRequest || (exports2.DocumentFormattingRequest = DocumentFormattingRequest = {}));
    var DocumentRangeFormattingRequest;
    (function(DocumentRangeFormattingRequest2) {
      DocumentRangeFormattingRequest2.method = "textDocument/rangeFormatting";
      DocumentRangeFormattingRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      DocumentRangeFormattingRequest2.type = new messages_1.ProtocolRequestType(DocumentRangeFormattingRequest2.method);
    })(DocumentRangeFormattingRequest || (exports2.DocumentRangeFormattingRequest = DocumentRangeFormattingRequest = {}));
    var DocumentRangesFormattingRequest;
    (function(DocumentRangesFormattingRequest2) {
      DocumentRangesFormattingRequest2.method = "textDocument/rangesFormatting";
      DocumentRangesFormattingRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      DocumentRangesFormattingRequest2.type = new messages_1.ProtocolRequestType(DocumentRangesFormattingRequest2.method);
    })(DocumentRangesFormattingRequest || (exports2.DocumentRangesFormattingRequest = DocumentRangesFormattingRequest = {}));
    var DocumentOnTypeFormattingRequest;
    (function(DocumentOnTypeFormattingRequest2) {
      DocumentOnTypeFormattingRequest2.method = "textDocument/onTypeFormatting";
      DocumentOnTypeFormattingRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      DocumentOnTypeFormattingRequest2.type = new messages_1.ProtocolRequestType(DocumentOnTypeFormattingRequest2.method);
    })(DocumentOnTypeFormattingRequest || (exports2.DocumentOnTypeFormattingRequest = DocumentOnTypeFormattingRequest = {}));
    var PrepareSupportDefaultBehavior;
    (function(PrepareSupportDefaultBehavior2) {
      PrepareSupportDefaultBehavior2.Identifier = 1;
    })(PrepareSupportDefaultBehavior || (exports2.PrepareSupportDefaultBehavior = PrepareSupportDefaultBehavior = {}));
    var RenameRequest;
    (function(RenameRequest2) {
      RenameRequest2.method = "textDocument/rename";
      RenameRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      RenameRequest2.type = new messages_1.ProtocolRequestType(RenameRequest2.method);
    })(RenameRequest || (exports2.RenameRequest = RenameRequest = {}));
    var PrepareRenameRequest;
    (function(PrepareRenameRequest2) {
      PrepareRenameRequest2.method = "textDocument/prepareRename";
      PrepareRenameRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      PrepareRenameRequest2.type = new messages_1.ProtocolRequestType(PrepareRenameRequest2.method);
    })(PrepareRenameRequest || (exports2.PrepareRenameRequest = PrepareRenameRequest = {}));
    var ExecuteCommandRequest;
    (function(ExecuteCommandRequest2) {
      ExecuteCommandRequest2.method = "workspace/executeCommand";
      ExecuteCommandRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      ExecuteCommandRequest2.type = new messages_1.ProtocolRequestType(ExecuteCommandRequest2.method);
    })(ExecuteCommandRequest || (exports2.ExecuteCommandRequest = ExecuteCommandRequest = {}));
    var ApplyWorkspaceEditRequest;
    (function(ApplyWorkspaceEditRequest2) {
      ApplyWorkspaceEditRequest2.method = "workspace/applyEdit";
      ApplyWorkspaceEditRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      ApplyWorkspaceEditRequest2.type = new messages_1.ProtocolRequestType("workspace/applyEdit");
    })(ApplyWorkspaceEditRequest || (exports2.ApplyWorkspaceEditRequest = ApplyWorkspaceEditRequest = {}));
  }
});

// node_modules/vscode-languageserver-protocol/lib/common/connection.js
var require_connection2 = __commonJS({
  "node_modules/vscode-languageserver-protocol/lib/common/connection.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createProtocolConnection = void 0;
    var vscode_jsonrpc_1 = require_main();
    function createProtocolConnection(input, output, logger, options) {
      if (vscode_jsonrpc_1.ConnectionStrategy.is(options)) {
        options = { connectionStrategy: options };
      }
      return (0, vscode_jsonrpc_1.createMessageConnection)(input, output, logger, options);
    }
    exports2.createProtocolConnection = createProtocolConnection;
  }
});

// node_modules/vscode-languageserver-protocol/lib/common/api.js
var require_api2 = __commonJS({
  "node_modules/vscode-languageserver-protocol/lib/common/api.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.LSPErrorCodes = exports2.createProtocolConnection = void 0;
    __exportStar(require_main(), exports2);
    __exportStar(require_main2(), exports2);
    __exportStar(require_messages2(), exports2);
    __exportStar(require_protocol(), exports2);
    var connection_1 = require_connection2();
    Object.defineProperty(exports2, "createProtocolConnection", { enumerable: true, get: function() {
      return connection_1.createProtocolConnection;
    } });
    var LSPErrorCodes;
    (function(LSPErrorCodes2) {
      LSPErrorCodes2.lspReservedErrorRangeStart = -32899;
      LSPErrorCodes2.RequestFailed = -32803;
      LSPErrorCodes2.ServerCancelled = -32802;
      LSPErrorCodes2.ContentModified = -32801;
      LSPErrorCodes2.RequestCancelled = -32800;
      LSPErrorCodes2.lspReservedErrorRangeEnd = -32800;
    })(LSPErrorCodes || (exports2.LSPErrorCodes = LSPErrorCodes = {}));
  }
});

// node_modules/vscode-languageserver-protocol/lib/node/main.js
var require_main3 = __commonJS({
  "node_modules/vscode-languageserver-protocol/lib/node/main.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createProtocolConnection = void 0;
    var node_1 = require_node();
    __exportStar(require_node(), exports2);
    __exportStar(require_api2(), exports2);
    function createProtocolConnection(input, output, logger, options) {
      return (0, node_1.createMessageConnection)(input, output, logger, options);
    }
    exports2.createProtocolConnection = createProtocolConnection;
  }
});

// node_modules/vscode-languageserver/lib/common/utils/uuid.js
var require_uuid = __commonJS({
  "node_modules/vscode-languageserver/lib/common/utils/uuid.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.generateUuid = exports2.parse = exports2.isUUID = exports2.v4 = exports2.empty = void 0;
    var ValueUUID = class {
      constructor(_value) {
        this._value = _value;
      }
      asHex() {
        return this._value;
      }
      equals(other) {
        return this.asHex() === other.asHex();
      }
    };
    var V4UUID = class _V4UUID extends ValueUUID {
      static _oneOf(array) {
        return array[Math.floor(array.length * Math.random())];
      }
      static _randomHex() {
        return _V4UUID._oneOf(_V4UUID._chars);
      }
      constructor() {
        super([
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          "-",
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          "-",
          "4",
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          "-",
          _V4UUID._oneOf(_V4UUID._timeHighBits),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          "-",
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex()
        ].join(""));
      }
    };
    V4UUID._chars = ["0", "1", "2", "3", "4", "5", "6", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"];
    V4UUID._timeHighBits = ["8", "9", "a", "b"];
    exports2.empty = new ValueUUID("00000000-0000-0000-0000-000000000000");
    function v4() {
      return new V4UUID();
    }
    exports2.v4 = v4;
    var _UUIDPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    function isUUID(value) {
      return _UUIDPattern.test(value);
    }
    exports2.isUUID = isUUID;
    function parse(value) {
      if (!isUUID(value)) {
        throw new Error("invalid uuid");
      }
      return new ValueUUID(value);
    }
    exports2.parse = parse;
    function generateUuid() {
      return v4().asHex();
    }
    exports2.generateUuid = generateUuid;
  }
});

// node_modules/vscode-languageserver/lib/common/progress.js
var require_progress = __commonJS({
  "node_modules/vscode-languageserver/lib/common/progress.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.attachPartialResult = exports2.ProgressFeature = exports2.attachWorkDone = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var uuid_1 = require_uuid();
    var WorkDoneProgressReporterImpl = class _WorkDoneProgressReporterImpl {
      constructor(_connection, _token) {
        this._connection = _connection;
        this._token = _token;
        _WorkDoneProgressReporterImpl.Instances.set(this._token, this);
      }
      begin(title, percentage, message, cancellable) {
        let param = {
          kind: "begin",
          title,
          percentage,
          message,
          cancellable
        };
        this._connection.sendProgress(vscode_languageserver_protocol_1.WorkDoneProgress.type, this._token, param);
      }
      report(arg0, arg1) {
        let param = {
          kind: "report"
        };
        if (typeof arg0 === "number") {
          param.percentage = arg0;
          if (arg1 !== void 0) {
            param.message = arg1;
          }
        } else {
          param.message = arg0;
        }
        this._connection.sendProgress(vscode_languageserver_protocol_1.WorkDoneProgress.type, this._token, param);
      }
      done() {
        _WorkDoneProgressReporterImpl.Instances.delete(this._token);
        this._connection.sendProgress(vscode_languageserver_protocol_1.WorkDoneProgress.type, this._token, { kind: "end" });
      }
    };
    WorkDoneProgressReporterImpl.Instances = /* @__PURE__ */ new Map();
    var WorkDoneProgressServerReporterImpl = class extends WorkDoneProgressReporterImpl {
      constructor(connection2, token) {
        super(connection2, token);
        this._source = new vscode_languageserver_protocol_1.CancellationTokenSource();
      }
      get token() {
        return this._source.token;
      }
      done() {
        this._source.dispose();
        super.done();
      }
      cancel() {
        this._source.cancel();
      }
    };
    var NullProgressReporter = class {
      constructor() {
      }
      begin() {
      }
      report() {
      }
      done() {
      }
    };
    var NullProgressServerReporter = class extends NullProgressReporter {
      constructor() {
        super();
        this._source = new vscode_languageserver_protocol_1.CancellationTokenSource();
      }
      get token() {
        return this._source.token;
      }
      done() {
        this._source.dispose();
      }
      cancel() {
        this._source.cancel();
      }
    };
    function attachWorkDone(connection2, params) {
      if (params === void 0 || params.workDoneToken === void 0) {
        return new NullProgressReporter();
      }
      const token = params.workDoneToken;
      delete params.workDoneToken;
      return new WorkDoneProgressReporterImpl(connection2, token);
    }
    exports2.attachWorkDone = attachWorkDone;
    var ProgressFeature = (Base) => {
      return class extends Base {
        constructor() {
          super();
          this._progressSupported = false;
        }
        initialize(capabilities) {
          super.initialize(capabilities);
          if (capabilities?.window?.workDoneProgress === true) {
            this._progressSupported = true;
            this.connection.onNotification(vscode_languageserver_protocol_1.WorkDoneProgressCancelNotification.type, (params) => {
              let progress = WorkDoneProgressReporterImpl.Instances.get(params.token);
              if (progress instanceof WorkDoneProgressServerReporterImpl || progress instanceof NullProgressServerReporter) {
                progress.cancel();
              }
            });
          }
        }
        attachWorkDoneProgress(token) {
          if (token === void 0) {
            return new NullProgressReporter();
          } else {
            return new WorkDoneProgressReporterImpl(this.connection, token);
          }
        }
        createWorkDoneProgress() {
          if (this._progressSupported) {
            const token = (0, uuid_1.generateUuid)();
            return this.connection.sendRequest(vscode_languageserver_protocol_1.WorkDoneProgressCreateRequest.type, { token }).then(() => {
              const result = new WorkDoneProgressServerReporterImpl(this.connection, token);
              return result;
            });
          } else {
            return Promise.resolve(new NullProgressServerReporter());
          }
        }
      };
    };
    exports2.ProgressFeature = ProgressFeature;
    var ResultProgress;
    (function(ResultProgress2) {
      ResultProgress2.type = new vscode_languageserver_protocol_1.ProgressType();
    })(ResultProgress || (ResultProgress = {}));
    var ResultProgressReporterImpl = class {
      constructor(_connection, _token) {
        this._connection = _connection;
        this._token = _token;
      }
      report(data) {
        this._connection.sendProgress(ResultProgress.type, this._token, data);
      }
    };
    function attachPartialResult(connection2, params) {
      if (params === void 0 || params.partialResultToken === void 0) {
        return void 0;
      }
      const token = params.partialResultToken;
      delete params.partialResultToken;
      return new ResultProgressReporterImpl(connection2, token);
    }
    exports2.attachPartialResult = attachPartialResult;
  }
});

// node_modules/vscode-languageserver/lib/common/configuration.js
var require_configuration = __commonJS({
  "node_modules/vscode-languageserver/lib/common/configuration.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ConfigurationFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var Is = require_is();
    var ConfigurationFeature = (Base) => {
      return class extends Base {
        getConfiguration(arg) {
          if (!arg) {
            return this._getConfiguration({});
          } else if (Is.string(arg)) {
            return this._getConfiguration({ section: arg });
          } else {
            return this._getConfiguration(arg);
          }
        }
        _getConfiguration(arg) {
          let params = {
            items: Array.isArray(arg) ? arg : [arg]
          };
          return this.connection.sendRequest(vscode_languageserver_protocol_1.ConfigurationRequest.type, params).then((result) => {
            if (Array.isArray(result)) {
              return Array.isArray(arg) ? result : result[0];
            } else {
              return Array.isArray(arg) ? [] : null;
            }
          });
        }
      };
    };
    exports2.ConfigurationFeature = ConfigurationFeature;
  }
});

// node_modules/vscode-languageserver/lib/common/workspaceFolder.js
var require_workspaceFolder = __commonJS({
  "node_modules/vscode-languageserver/lib/common/workspaceFolder.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.WorkspaceFoldersFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var WorkspaceFoldersFeature = (Base) => {
      return class extends Base {
        constructor() {
          super();
          this._notificationIsAutoRegistered = false;
        }
        initialize(capabilities) {
          super.initialize(capabilities);
          let workspaceCapabilities = capabilities.workspace;
          if (workspaceCapabilities && workspaceCapabilities.workspaceFolders) {
            this._onDidChangeWorkspaceFolders = new vscode_languageserver_protocol_1.Emitter();
            this.connection.onNotification(vscode_languageserver_protocol_1.DidChangeWorkspaceFoldersNotification.type, (params) => {
              this._onDidChangeWorkspaceFolders.fire(params.event);
            });
          }
        }
        fillServerCapabilities(capabilities) {
          super.fillServerCapabilities(capabilities);
          const changeNotifications = capabilities.workspace?.workspaceFolders?.changeNotifications;
          this._notificationIsAutoRegistered = changeNotifications === true || typeof changeNotifications === "string";
        }
        getWorkspaceFolders() {
          return this.connection.sendRequest(vscode_languageserver_protocol_1.WorkspaceFoldersRequest.type);
        }
        get onDidChangeWorkspaceFolders() {
          if (!this._onDidChangeWorkspaceFolders) {
            throw new Error("Client doesn't support sending workspace folder change events.");
          }
          if (!this._notificationIsAutoRegistered && !this._unregistration) {
            this._unregistration = this.connection.client.register(vscode_languageserver_protocol_1.DidChangeWorkspaceFoldersNotification.type);
          }
          return this._onDidChangeWorkspaceFolders.event;
        }
      };
    };
    exports2.WorkspaceFoldersFeature = WorkspaceFoldersFeature;
  }
});

// node_modules/vscode-languageserver/lib/common/callHierarchy.js
var require_callHierarchy = __commonJS({
  "node_modules/vscode-languageserver/lib/common/callHierarchy.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.CallHierarchyFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var CallHierarchyFeature = (Base) => {
      return class extends Base {
        get callHierarchy() {
          return {
            onPrepare: (handler) => {
              return this.connection.onRequest(vscode_languageserver_protocol_1.CallHierarchyPrepareRequest.type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params), void 0);
              });
            },
            onIncomingCalls: (handler) => {
              const type = vscode_languageserver_protocol_1.CallHierarchyIncomingCallsRequest.type;
              return this.connection.onRequest(type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params), this.attachPartialResultProgress(type, params));
              });
            },
            onOutgoingCalls: (handler) => {
              const type = vscode_languageserver_protocol_1.CallHierarchyOutgoingCallsRequest.type;
              return this.connection.onRequest(type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params), this.attachPartialResultProgress(type, params));
              });
            }
          };
        }
      };
    };
    exports2.CallHierarchyFeature = CallHierarchyFeature;
  }
});

// node_modules/vscode-languageserver/lib/common/semanticTokens.js
var require_semanticTokens = __commonJS({
  "node_modules/vscode-languageserver/lib/common/semanticTokens.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.SemanticTokensBuilder = exports2.SemanticTokensDiff = exports2.SemanticTokensFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var SemanticTokensFeature = (Base) => {
      return class extends Base {
        get semanticTokens() {
          return {
            refresh: () => {
              return this.connection.sendRequest(vscode_languageserver_protocol_1.SemanticTokensRefreshRequest.type);
            },
            on: (handler) => {
              const type = vscode_languageserver_protocol_1.SemanticTokensRequest.type;
              return this.connection.onRequest(type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params), this.attachPartialResultProgress(type, params));
              });
            },
            onDelta: (handler) => {
              const type = vscode_languageserver_protocol_1.SemanticTokensDeltaRequest.type;
              return this.connection.onRequest(type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params), this.attachPartialResultProgress(type, params));
              });
            },
            onRange: (handler) => {
              const type = vscode_languageserver_protocol_1.SemanticTokensRangeRequest.type;
              return this.connection.onRequest(type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params), this.attachPartialResultProgress(type, params));
              });
            }
          };
        }
      };
    };
    exports2.SemanticTokensFeature = SemanticTokensFeature;
    var SemanticTokensDiff = class {
      constructor(originalSequence, modifiedSequence) {
        this.originalSequence = originalSequence;
        this.modifiedSequence = modifiedSequence;
      }
      computeDiff() {
        const originalLength = this.originalSequence.length;
        const modifiedLength = this.modifiedSequence.length;
        let startIndex = 0;
        while (startIndex < modifiedLength && startIndex < originalLength && this.originalSequence[startIndex] === this.modifiedSequence[startIndex]) {
          startIndex++;
        }
        if (startIndex < modifiedLength && startIndex < originalLength) {
          let originalEndIndex = originalLength - 1;
          let modifiedEndIndex = modifiedLength - 1;
          while (originalEndIndex >= startIndex && modifiedEndIndex >= startIndex && this.originalSequence[originalEndIndex] === this.modifiedSequence[modifiedEndIndex]) {
            originalEndIndex--;
            modifiedEndIndex--;
          }
          if (originalEndIndex < startIndex || modifiedEndIndex < startIndex) {
            originalEndIndex++;
            modifiedEndIndex++;
          }
          const deleteCount = originalEndIndex - startIndex + 1;
          const newData = this.modifiedSequence.slice(startIndex, modifiedEndIndex + 1);
          if (newData.length === 1 && newData[0] === this.originalSequence[originalEndIndex]) {
            return [
              { start: startIndex, deleteCount: deleteCount - 1 }
            ];
          } else {
            return [
              { start: startIndex, deleteCount, data: newData }
            ];
          }
        } else if (startIndex < modifiedLength) {
          return [
            { start: startIndex, deleteCount: 0, data: this.modifiedSequence.slice(startIndex) }
          ];
        } else if (startIndex < originalLength) {
          return [
            { start: startIndex, deleteCount: originalLength - startIndex }
          ];
        } else {
          return [];
        }
      }
    };
    exports2.SemanticTokensDiff = SemanticTokensDiff;
    var SemanticTokensBuilder = class {
      constructor() {
        this._prevData = void 0;
        this.initialize();
      }
      initialize() {
        this._id = Date.now();
        this._prevLine = 0;
        this._prevChar = 0;
        this._data = [];
        this._dataLen = 0;
      }
      push(line, char, length, tokenType, tokenModifiers) {
        let pushLine = line;
        let pushChar = char;
        if (this._dataLen > 0) {
          pushLine -= this._prevLine;
          if (pushLine === 0) {
            pushChar -= this._prevChar;
          }
        }
        this._data[this._dataLen++] = pushLine;
        this._data[this._dataLen++] = pushChar;
        this._data[this._dataLen++] = length;
        this._data[this._dataLen++] = tokenType;
        this._data[this._dataLen++] = tokenModifiers;
        this._prevLine = line;
        this._prevChar = char;
      }
      get id() {
        return this._id.toString();
      }
      previousResult(id) {
        if (this.id === id) {
          this._prevData = this._data;
        }
        this.initialize();
      }
      build() {
        this._prevData = void 0;
        return {
          resultId: this.id,
          data: this._data
        };
      }
      canBuildEdits() {
        return this._prevData !== void 0;
      }
      buildEdits() {
        if (this._prevData !== void 0) {
          return {
            resultId: this.id,
            edits: new SemanticTokensDiff(this._prevData, this._data).computeDiff()
          };
        } else {
          return this.build();
        }
      }
    };
    exports2.SemanticTokensBuilder = SemanticTokensBuilder;
  }
});

// node_modules/vscode-languageserver/lib/common/showDocument.js
var require_showDocument = __commonJS({
  "node_modules/vscode-languageserver/lib/common/showDocument.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ShowDocumentFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var ShowDocumentFeature = (Base) => {
      return class extends Base {
        showDocument(params) {
          return this.connection.sendRequest(vscode_languageserver_protocol_1.ShowDocumentRequest.type, params);
        }
      };
    };
    exports2.ShowDocumentFeature = ShowDocumentFeature;
  }
});

// node_modules/vscode-languageserver/lib/common/fileOperations.js
var require_fileOperations = __commonJS({
  "node_modules/vscode-languageserver/lib/common/fileOperations.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.FileOperationsFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var FileOperationsFeature = (Base) => {
      return class extends Base {
        onDidCreateFiles(handler) {
          return this.connection.onNotification(vscode_languageserver_protocol_1.DidCreateFilesNotification.type, (params) => {
            handler(params);
          });
        }
        onDidRenameFiles(handler) {
          return this.connection.onNotification(vscode_languageserver_protocol_1.DidRenameFilesNotification.type, (params) => {
            handler(params);
          });
        }
        onDidDeleteFiles(handler) {
          return this.connection.onNotification(vscode_languageserver_protocol_1.DidDeleteFilesNotification.type, (params) => {
            handler(params);
          });
        }
        onWillCreateFiles(handler) {
          return this.connection.onRequest(vscode_languageserver_protocol_1.WillCreateFilesRequest.type, (params, cancel) => {
            return handler(params, cancel);
          });
        }
        onWillRenameFiles(handler) {
          return this.connection.onRequest(vscode_languageserver_protocol_1.WillRenameFilesRequest.type, (params, cancel) => {
            return handler(params, cancel);
          });
        }
        onWillDeleteFiles(handler) {
          return this.connection.onRequest(vscode_languageserver_protocol_1.WillDeleteFilesRequest.type, (params, cancel) => {
            return handler(params, cancel);
          });
        }
      };
    };
    exports2.FileOperationsFeature = FileOperationsFeature;
  }
});

// node_modules/vscode-languageserver/lib/common/linkedEditingRange.js
var require_linkedEditingRange = __commonJS({
  "node_modules/vscode-languageserver/lib/common/linkedEditingRange.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.LinkedEditingRangeFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var LinkedEditingRangeFeature = (Base) => {
      return class extends Base {
        onLinkedEditingRange(handler) {
          return this.connection.onRequest(vscode_languageserver_protocol_1.LinkedEditingRangeRequest.type, (params, cancel) => {
            return handler(params, cancel, this.attachWorkDoneProgress(params), void 0);
          });
        }
      };
    };
    exports2.LinkedEditingRangeFeature = LinkedEditingRangeFeature;
  }
});

// node_modules/vscode-languageserver/lib/common/typeHierarchy.js
var require_typeHierarchy = __commonJS({
  "node_modules/vscode-languageserver/lib/common/typeHierarchy.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TypeHierarchyFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var TypeHierarchyFeature = (Base) => {
      return class extends Base {
        get typeHierarchy() {
          return {
            onPrepare: (handler) => {
              return this.connection.onRequest(vscode_languageserver_protocol_1.TypeHierarchyPrepareRequest.type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params), void 0);
              });
            },
            onSupertypes: (handler) => {
              const type = vscode_languageserver_protocol_1.TypeHierarchySupertypesRequest.type;
              return this.connection.onRequest(type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params), this.attachPartialResultProgress(type, params));
              });
            },
            onSubtypes: (handler) => {
              const type = vscode_languageserver_protocol_1.TypeHierarchySubtypesRequest.type;
              return this.connection.onRequest(type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params), this.attachPartialResultProgress(type, params));
              });
            }
          };
        }
      };
    };
    exports2.TypeHierarchyFeature = TypeHierarchyFeature;
  }
});

// node_modules/vscode-languageserver/lib/common/inlineValue.js
var require_inlineValue = __commonJS({
  "node_modules/vscode-languageserver/lib/common/inlineValue.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.InlineValueFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var InlineValueFeature = (Base) => {
      return class extends Base {
        get inlineValue() {
          return {
            refresh: () => {
              return this.connection.sendRequest(vscode_languageserver_protocol_1.InlineValueRefreshRequest.type);
            },
            on: (handler) => {
              return this.connection.onRequest(vscode_languageserver_protocol_1.InlineValueRequest.type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params));
              });
            }
          };
        }
      };
    };
    exports2.InlineValueFeature = InlineValueFeature;
  }
});

// node_modules/vscode-languageserver/lib/common/foldingRange.js
var require_foldingRange = __commonJS({
  "node_modules/vscode-languageserver/lib/common/foldingRange.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.FoldingRangeFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var FoldingRangeFeature = (Base) => {
      return class extends Base {
        get foldingRange() {
          return {
            refresh: () => {
              return this.connection.sendRequest(vscode_languageserver_protocol_1.FoldingRangeRefreshRequest.type);
            },
            on: (handler) => {
              const type = vscode_languageserver_protocol_1.FoldingRangeRequest.type;
              return this.connection.onRequest(type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params), this.attachPartialResultProgress(type, params));
              });
            }
          };
        }
      };
    };
    exports2.FoldingRangeFeature = FoldingRangeFeature;
  }
});

// node_modules/vscode-languageserver/lib/common/inlayHint.js
var require_inlayHint = __commonJS({
  "node_modules/vscode-languageserver/lib/common/inlayHint.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.InlayHintFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var InlayHintFeature = (Base) => {
      return class extends Base {
        get inlayHint() {
          return {
            refresh: () => {
              return this.connection.sendRequest(vscode_languageserver_protocol_1.InlayHintRefreshRequest.type);
            },
            on: (handler) => {
              return this.connection.onRequest(vscode_languageserver_protocol_1.InlayHintRequest.type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params));
              });
            },
            resolve: (handler) => {
              return this.connection.onRequest(vscode_languageserver_protocol_1.InlayHintResolveRequest.type, (params, cancel) => {
                return handler(params, cancel);
              });
            }
          };
        }
      };
    };
    exports2.InlayHintFeature = InlayHintFeature;
  }
});

// node_modules/vscode-languageserver/lib/common/diagnostic.js
var require_diagnostic = __commonJS({
  "node_modules/vscode-languageserver/lib/common/diagnostic.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DiagnosticFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var DiagnosticFeature = (Base) => {
      return class extends Base {
        get diagnostics() {
          return {
            refresh: () => {
              return this.connection.sendRequest(vscode_languageserver_protocol_1.DiagnosticRefreshRequest.type);
            },
            on: (handler) => {
              return this.connection.onRequest(vscode_languageserver_protocol_1.DocumentDiagnosticRequest.type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params), this.attachPartialResultProgress(vscode_languageserver_protocol_1.DocumentDiagnosticRequest.partialResult, params));
              });
            },
            onWorkspace: (handler) => {
              return this.connection.onRequest(vscode_languageserver_protocol_1.WorkspaceDiagnosticRequest.type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params), this.attachPartialResultProgress(vscode_languageserver_protocol_1.WorkspaceDiagnosticRequest.partialResult, params));
              });
            }
          };
        }
      };
    };
    exports2.DiagnosticFeature = DiagnosticFeature;
  }
});

// node_modules/vscode-languageserver/lib/common/textDocuments.js
var require_textDocuments = __commonJS({
  "node_modules/vscode-languageserver/lib/common/textDocuments.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TextDocuments = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var TextDocuments2 = class {
      /**
       * Create a new text document manager.
       */
      constructor(configuration) {
        this._configuration = configuration;
        this._syncedDocuments = /* @__PURE__ */ new Map();
        this._onDidChangeContent = new vscode_languageserver_protocol_1.Emitter();
        this._onDidOpen = new vscode_languageserver_protocol_1.Emitter();
        this._onDidClose = new vscode_languageserver_protocol_1.Emitter();
        this._onDidSave = new vscode_languageserver_protocol_1.Emitter();
        this._onWillSave = new vscode_languageserver_protocol_1.Emitter();
      }
      /**
       * An event that fires when a text document managed by this manager
       * has been opened.
       */
      get onDidOpen() {
        return this._onDidOpen.event;
      }
      /**
       * An event that fires when a text document managed by this manager
       * has been opened or the content changes.
       */
      get onDidChangeContent() {
        return this._onDidChangeContent.event;
      }
      /**
       * An event that fires when a text document managed by this manager
       * will be saved.
       */
      get onWillSave() {
        return this._onWillSave.event;
      }
      /**
       * Sets a handler that will be called if a participant wants to provide
       * edits during a text document save.
       */
      onWillSaveWaitUntil(handler) {
        this._willSaveWaitUntil = handler;
      }
      /**
       * An event that fires when a text document managed by this manager
       * has been saved.
       */
      get onDidSave() {
        return this._onDidSave.event;
      }
      /**
       * An event that fires when a text document managed by this manager
       * has been closed.
       */
      get onDidClose() {
        return this._onDidClose.event;
      }
      /**
       * Returns the document for the given URI. Returns undefined if
       * the document is not managed by this instance.
       *
       * @param uri The text document's URI to retrieve.
       * @return the text document or `undefined`.
       */
      get(uri) {
        return this._syncedDocuments.get(uri);
      }
      /**
       * Returns all text documents managed by this instance.
       *
       * @return all text documents.
       */
      all() {
        return Array.from(this._syncedDocuments.values());
      }
      /**
       * Returns the URIs of all text documents managed by this instance.
       *
       * @return the URI's of all text documents.
       */
      keys() {
        return Array.from(this._syncedDocuments.keys());
      }
      /**
       * Listens for `low level` notification on the given connection to
       * update the text documents managed by this instance.
       *
       * Please note that the connection only provides handlers not an event model. Therefore
       * listening on a connection will overwrite the following handlers on a connection:
       * `onDidOpenTextDocument`, `onDidChangeTextDocument`, `onDidCloseTextDocument`,
       * `onWillSaveTextDocument`, `onWillSaveTextDocumentWaitUntil` and `onDidSaveTextDocument`.
       *
       * Use the corresponding events on the TextDocuments instance instead.
       *
       * @param connection The connection to listen on.
       */
      listen(connection2) {
        connection2.__textDocumentSync = vscode_languageserver_protocol_1.TextDocumentSyncKind.Incremental;
        const disposables = [];
        disposables.push(connection2.onDidOpenTextDocument((event) => {
          const td = event.textDocument;
          const document = this._configuration.create(td.uri, td.languageId, td.version, td.text);
          this._syncedDocuments.set(td.uri, document);
          const toFire = Object.freeze({ document });
          this._onDidOpen.fire(toFire);
          this._onDidChangeContent.fire(toFire);
        }));
        disposables.push(connection2.onDidChangeTextDocument((event) => {
          const td = event.textDocument;
          const changes = event.contentChanges;
          if (changes.length === 0) {
            return;
          }
          const { version } = td;
          if (version === null || version === void 0) {
            throw new Error(`Received document change event for ${td.uri} without valid version identifier`);
          }
          let syncedDocument = this._syncedDocuments.get(td.uri);
          if (syncedDocument !== void 0) {
            syncedDocument = this._configuration.update(syncedDocument, changes, version);
            this._syncedDocuments.set(td.uri, syncedDocument);
            this._onDidChangeContent.fire(Object.freeze({ document: syncedDocument }));
          }
        }));
        disposables.push(connection2.onDidCloseTextDocument((event) => {
          let syncedDocument = this._syncedDocuments.get(event.textDocument.uri);
          if (syncedDocument !== void 0) {
            this._syncedDocuments.delete(event.textDocument.uri);
            this._onDidClose.fire(Object.freeze({ document: syncedDocument }));
          }
        }));
        disposables.push(connection2.onWillSaveTextDocument((event) => {
          let syncedDocument = this._syncedDocuments.get(event.textDocument.uri);
          if (syncedDocument !== void 0) {
            this._onWillSave.fire(Object.freeze({ document: syncedDocument, reason: event.reason }));
          }
        }));
        disposables.push(connection2.onWillSaveTextDocumentWaitUntil((event, token) => {
          let syncedDocument = this._syncedDocuments.get(event.textDocument.uri);
          if (syncedDocument !== void 0 && this._willSaveWaitUntil) {
            return this._willSaveWaitUntil(Object.freeze({ document: syncedDocument, reason: event.reason }), token);
          } else {
            return [];
          }
        }));
        disposables.push(connection2.onDidSaveTextDocument((event) => {
          let syncedDocument = this._syncedDocuments.get(event.textDocument.uri);
          if (syncedDocument !== void 0) {
            this._onDidSave.fire(Object.freeze({ document: syncedDocument }));
          }
        }));
        return vscode_languageserver_protocol_1.Disposable.create(() => {
          disposables.forEach((disposable) => disposable.dispose());
        });
      }
    };
    exports2.TextDocuments = TextDocuments2;
  }
});

// node_modules/vscode-languageserver/lib/common/notebook.js
var require_notebook = __commonJS({
  "node_modules/vscode-languageserver/lib/common/notebook.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.NotebookDocuments = exports2.NotebookSyncFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var textDocuments_1 = require_textDocuments();
    var NotebookSyncFeature = (Base) => {
      return class extends Base {
        get synchronization() {
          return {
            onDidOpenNotebookDocument: (handler) => {
              return this.connection.onNotification(vscode_languageserver_protocol_1.DidOpenNotebookDocumentNotification.type, (params) => {
                handler(params);
              });
            },
            onDidChangeNotebookDocument: (handler) => {
              return this.connection.onNotification(vscode_languageserver_protocol_1.DidChangeNotebookDocumentNotification.type, (params) => {
                handler(params);
              });
            },
            onDidSaveNotebookDocument: (handler) => {
              return this.connection.onNotification(vscode_languageserver_protocol_1.DidSaveNotebookDocumentNotification.type, (params) => {
                handler(params);
              });
            },
            onDidCloseNotebookDocument: (handler) => {
              return this.connection.onNotification(vscode_languageserver_protocol_1.DidCloseNotebookDocumentNotification.type, (params) => {
                handler(params);
              });
            }
          };
        }
      };
    };
    exports2.NotebookSyncFeature = NotebookSyncFeature;
    var CellTextDocumentConnection = class _CellTextDocumentConnection {
      onDidOpenTextDocument(handler) {
        this.openHandler = handler;
        return vscode_languageserver_protocol_1.Disposable.create(() => {
          this.openHandler = void 0;
        });
      }
      openTextDocument(params) {
        this.openHandler && this.openHandler(params);
      }
      onDidChangeTextDocument(handler) {
        this.changeHandler = handler;
        return vscode_languageserver_protocol_1.Disposable.create(() => {
          this.changeHandler = handler;
        });
      }
      changeTextDocument(params) {
        this.changeHandler && this.changeHandler(params);
      }
      onDidCloseTextDocument(handler) {
        this.closeHandler = handler;
        return vscode_languageserver_protocol_1.Disposable.create(() => {
          this.closeHandler = void 0;
        });
      }
      closeTextDocument(params) {
        this.closeHandler && this.closeHandler(params);
      }
      onWillSaveTextDocument() {
        return _CellTextDocumentConnection.NULL_DISPOSE;
      }
      onWillSaveTextDocumentWaitUntil() {
        return _CellTextDocumentConnection.NULL_DISPOSE;
      }
      onDidSaveTextDocument() {
        return _CellTextDocumentConnection.NULL_DISPOSE;
      }
    };
    CellTextDocumentConnection.NULL_DISPOSE = Object.freeze({ dispose: () => {
    } });
    var NotebookDocuments = class {
      constructor(configurationOrTextDocuments) {
        if (configurationOrTextDocuments instanceof textDocuments_1.TextDocuments) {
          this._cellTextDocuments = configurationOrTextDocuments;
        } else {
          this._cellTextDocuments = new textDocuments_1.TextDocuments(configurationOrTextDocuments);
        }
        this.notebookDocuments = /* @__PURE__ */ new Map();
        this.notebookCellMap = /* @__PURE__ */ new Map();
        this._onDidOpen = new vscode_languageserver_protocol_1.Emitter();
        this._onDidChange = new vscode_languageserver_protocol_1.Emitter();
        this._onDidSave = new vscode_languageserver_protocol_1.Emitter();
        this._onDidClose = new vscode_languageserver_protocol_1.Emitter();
      }
      get cellTextDocuments() {
        return this._cellTextDocuments;
      }
      getCellTextDocument(cell) {
        return this._cellTextDocuments.get(cell.document);
      }
      getNotebookDocument(uri) {
        return this.notebookDocuments.get(uri);
      }
      getNotebookCell(uri) {
        const value = this.notebookCellMap.get(uri);
        return value && value[0];
      }
      findNotebookDocumentForCell(cell) {
        const key = typeof cell === "string" ? cell : cell.document;
        const value = this.notebookCellMap.get(key);
        return value && value[1];
      }
      get onDidOpen() {
        return this._onDidOpen.event;
      }
      get onDidSave() {
        return this._onDidSave.event;
      }
      get onDidChange() {
        return this._onDidChange.event;
      }
      get onDidClose() {
        return this._onDidClose.event;
      }
      /**
       * Listens for `low level` notification on the given connection to
       * update the notebook documents managed by this instance.
       *
       * Please note that the connection only provides handlers not an event model. Therefore
       * listening on a connection will overwrite the following handlers on a connection:
       * `onDidOpenNotebookDocument`, `onDidChangeNotebookDocument`, `onDidSaveNotebookDocument`,
       *  and `onDidCloseNotebookDocument`.
       *
       * @param connection The connection to listen on.
       */
      listen(connection2) {
        const cellTextDocumentConnection = new CellTextDocumentConnection();
        const disposables = [];
        disposables.push(this.cellTextDocuments.listen(cellTextDocumentConnection));
        disposables.push(connection2.notebooks.synchronization.onDidOpenNotebookDocument((params) => {
          this.notebookDocuments.set(params.notebookDocument.uri, params.notebookDocument);
          for (const cellTextDocument of params.cellTextDocuments) {
            cellTextDocumentConnection.openTextDocument({ textDocument: cellTextDocument });
          }
          this.updateCellMap(params.notebookDocument);
          this._onDidOpen.fire(params.notebookDocument);
        }));
        disposables.push(connection2.notebooks.synchronization.onDidChangeNotebookDocument((params) => {
          const notebookDocument = this.notebookDocuments.get(params.notebookDocument.uri);
          if (notebookDocument === void 0) {
            return;
          }
          notebookDocument.version = params.notebookDocument.version;
          const oldMetadata = notebookDocument.metadata;
          let metadataChanged = false;
          const change = params.change;
          if (change.metadata !== void 0) {
            metadataChanged = true;
            notebookDocument.metadata = change.metadata;
          }
          const opened = [];
          const closed = [];
          const data = [];
          const text = [];
          if (change.cells !== void 0) {
            const changedCells = change.cells;
            if (changedCells.structure !== void 0) {
              const array = changedCells.structure.array;
              notebookDocument.cells.splice(array.start, array.deleteCount, ...array.cells !== void 0 ? array.cells : []);
              if (changedCells.structure.didOpen !== void 0) {
                for (const open of changedCells.structure.didOpen) {
                  cellTextDocumentConnection.openTextDocument({ textDocument: open });
                  opened.push(open.uri);
                }
              }
              if (changedCells.structure.didClose) {
                for (const close of changedCells.structure.didClose) {
                  cellTextDocumentConnection.closeTextDocument({ textDocument: close });
                  closed.push(close.uri);
                }
              }
            }
            if (changedCells.data !== void 0) {
              const cellUpdates = new Map(changedCells.data.map((cell) => [cell.document, cell]));
              for (let i = 0; i <= notebookDocument.cells.length; i++) {
                const change2 = cellUpdates.get(notebookDocument.cells[i].document);
                if (change2 !== void 0) {
                  const old = notebookDocument.cells.splice(i, 1, change2);
                  data.push({ old: old[0], new: change2 });
                  cellUpdates.delete(change2.document);
                  if (cellUpdates.size === 0) {
                    break;
                  }
                }
              }
            }
            if (changedCells.textContent !== void 0) {
              for (const cellTextDocument of changedCells.textContent) {
                cellTextDocumentConnection.changeTextDocument({ textDocument: cellTextDocument.document, contentChanges: cellTextDocument.changes });
                text.push(cellTextDocument.document.uri);
              }
            }
          }
          this.updateCellMap(notebookDocument);
          const changeEvent = { notebookDocument };
          if (metadataChanged) {
            changeEvent.metadata = { old: oldMetadata, new: notebookDocument.metadata };
          }
          const added = [];
          for (const open of opened) {
            added.push(this.getNotebookCell(open));
          }
          const removed = [];
          for (const close of closed) {
            removed.push(this.getNotebookCell(close));
          }
          const textContent = [];
          for (const change2 of text) {
            textContent.push(this.getNotebookCell(change2));
          }
          if (added.length > 0 || removed.length > 0 || data.length > 0 || textContent.length > 0) {
            changeEvent.cells = { added, removed, changed: { data, textContent } };
          }
          if (changeEvent.metadata !== void 0 || changeEvent.cells !== void 0) {
            this._onDidChange.fire(changeEvent);
          }
        }));
        disposables.push(connection2.notebooks.synchronization.onDidSaveNotebookDocument((params) => {
          const notebookDocument = this.notebookDocuments.get(params.notebookDocument.uri);
          if (notebookDocument === void 0) {
            return;
          }
          this._onDidSave.fire(notebookDocument);
        }));
        disposables.push(connection2.notebooks.synchronization.onDidCloseNotebookDocument((params) => {
          const notebookDocument = this.notebookDocuments.get(params.notebookDocument.uri);
          if (notebookDocument === void 0) {
            return;
          }
          this._onDidClose.fire(notebookDocument);
          for (const cellTextDocument of params.cellTextDocuments) {
            cellTextDocumentConnection.closeTextDocument({ textDocument: cellTextDocument });
          }
          this.notebookDocuments.delete(params.notebookDocument.uri);
          for (const cell of notebookDocument.cells) {
            this.notebookCellMap.delete(cell.document);
          }
        }));
        return vscode_languageserver_protocol_1.Disposable.create(() => {
          disposables.forEach((disposable) => disposable.dispose());
        });
      }
      updateCellMap(notebookDocument) {
        for (const cell of notebookDocument.cells) {
          this.notebookCellMap.set(cell.document, [cell, notebookDocument]);
        }
      }
    };
    exports2.NotebookDocuments = NotebookDocuments;
  }
});

// node_modules/vscode-languageserver/lib/common/moniker.js
var require_moniker = __commonJS({
  "node_modules/vscode-languageserver/lib/common/moniker.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.MonikerFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var MonikerFeature = (Base) => {
      return class extends Base {
        get moniker() {
          return {
            on: (handler) => {
              const type = vscode_languageserver_protocol_1.MonikerRequest.type;
              return this.connection.onRequest(type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params), this.attachPartialResultProgress(type, params));
              });
            }
          };
        }
      };
    };
    exports2.MonikerFeature = MonikerFeature;
  }
});

// node_modules/vscode-languageserver/lib/common/server.js
var require_server = __commonJS({
  "node_modules/vscode-languageserver/lib/common/server.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createConnection = exports2.combineFeatures = exports2.combineNotebooksFeatures = exports2.combineLanguagesFeatures = exports2.combineWorkspaceFeatures = exports2.combineWindowFeatures = exports2.combineClientFeatures = exports2.combineTracerFeatures = exports2.combineTelemetryFeatures = exports2.combineConsoleFeatures = exports2._NotebooksImpl = exports2._LanguagesImpl = exports2.BulkUnregistration = exports2.BulkRegistration = exports2.ErrorMessageTracker = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var Is = require_is();
    var UUID = require_uuid();
    var progress_1 = require_progress();
    var configuration_1 = require_configuration();
    var workspaceFolder_1 = require_workspaceFolder();
    var callHierarchy_1 = require_callHierarchy();
    var semanticTokens_1 = require_semanticTokens();
    var showDocument_1 = require_showDocument();
    var fileOperations_1 = require_fileOperations();
    var linkedEditingRange_1 = require_linkedEditingRange();
    var typeHierarchy_1 = require_typeHierarchy();
    var inlineValue_1 = require_inlineValue();
    var foldingRange_1 = require_foldingRange();
    var inlayHint_1 = require_inlayHint();
    var diagnostic_1 = require_diagnostic();
    var notebook_1 = require_notebook();
    var moniker_1 = require_moniker();
    function null2Undefined(value) {
      if (value === null) {
        return void 0;
      }
      return value;
    }
    var ErrorMessageTracker = class {
      constructor() {
        this._messages = /* @__PURE__ */ Object.create(null);
      }
      /**
       * Add a message to the tracker.
       *
       * @param message The message to add.
       */
      add(message) {
        let count = this._messages[message];
        if (!count) {
          count = 0;
        }
        count++;
        this._messages[message] = count;
      }
      /**
       * Send all tracked messages to the connection's window.
       *
       * @param connection The connection established between client and server.
       */
      sendErrors(connection2) {
        Object.keys(this._messages).forEach((message) => {
          connection2.window.showErrorMessage(message);
        });
      }
    };
    exports2.ErrorMessageTracker = ErrorMessageTracker;
    var RemoteConsoleImpl = class {
      constructor() {
      }
      rawAttach(connection2) {
        this._rawConnection = connection2;
      }
      attach(connection2) {
        this._connection = connection2;
      }
      get connection() {
        if (!this._connection) {
          throw new Error("Remote is not attached to a connection yet.");
        }
        return this._connection;
      }
      fillServerCapabilities(_capabilities) {
      }
      initialize(_capabilities) {
      }
      error(message) {
        this.send(vscode_languageserver_protocol_1.MessageType.Error, message);
      }
      warn(message) {
        this.send(vscode_languageserver_protocol_1.MessageType.Warning, message);
      }
      info(message) {
        this.send(vscode_languageserver_protocol_1.MessageType.Info, message);
      }
      log(message) {
        this.send(vscode_languageserver_protocol_1.MessageType.Log, message);
      }
      debug(message) {
        this.send(vscode_languageserver_protocol_1.MessageType.Debug, message);
      }
      send(type, message) {
        if (this._rawConnection) {
          this._rawConnection.sendNotification(vscode_languageserver_protocol_1.LogMessageNotification.type, { type, message }).catch(() => {
            (0, vscode_languageserver_protocol_1.RAL)().console.error(`Sending log message failed`);
          });
        }
      }
    };
    var _RemoteWindowImpl = class {
      constructor() {
      }
      attach(connection2) {
        this._connection = connection2;
      }
      get connection() {
        if (!this._connection) {
          throw new Error("Remote is not attached to a connection yet.");
        }
        return this._connection;
      }
      initialize(_capabilities) {
      }
      fillServerCapabilities(_capabilities) {
      }
      showErrorMessage(message, ...actions) {
        let params = { type: vscode_languageserver_protocol_1.MessageType.Error, message, actions };
        return this.connection.sendRequest(vscode_languageserver_protocol_1.ShowMessageRequest.type, params).then(null2Undefined);
      }
      showWarningMessage(message, ...actions) {
        let params = { type: vscode_languageserver_protocol_1.MessageType.Warning, message, actions };
        return this.connection.sendRequest(vscode_languageserver_protocol_1.ShowMessageRequest.type, params).then(null2Undefined);
      }
      showInformationMessage(message, ...actions) {
        let params = { type: vscode_languageserver_protocol_1.MessageType.Info, message, actions };
        return this.connection.sendRequest(vscode_languageserver_protocol_1.ShowMessageRequest.type, params).then(null2Undefined);
      }
    };
    var RemoteWindowImpl = (0, showDocument_1.ShowDocumentFeature)((0, progress_1.ProgressFeature)(_RemoteWindowImpl));
    var BulkRegistration;
    (function(BulkRegistration2) {
      function create() {
        return new BulkRegistrationImpl();
      }
      BulkRegistration2.create = create;
    })(BulkRegistration || (exports2.BulkRegistration = BulkRegistration = {}));
    var BulkRegistrationImpl = class {
      constructor() {
        this._registrations = [];
        this._registered = /* @__PURE__ */ new Set();
      }
      add(type, registerOptions) {
        const method = Is.string(type) ? type : type.method;
        if (this._registered.has(method)) {
          throw new Error(`${method} is already added to this registration`);
        }
        const id = UUID.generateUuid();
        this._registrations.push({
          id,
          method,
          registerOptions: registerOptions || {}
        });
        this._registered.add(method);
      }
      asRegistrationParams() {
        return {
          registrations: this._registrations
        };
      }
    };
    var BulkUnregistration;
    (function(BulkUnregistration2) {
      function create() {
        return new BulkUnregistrationImpl(void 0, []);
      }
      BulkUnregistration2.create = create;
    })(BulkUnregistration || (exports2.BulkUnregistration = BulkUnregistration = {}));
    var BulkUnregistrationImpl = class {
      constructor(_connection, unregistrations) {
        this._connection = _connection;
        this._unregistrations = /* @__PURE__ */ new Map();
        unregistrations.forEach((unregistration) => {
          this._unregistrations.set(unregistration.method, unregistration);
        });
      }
      get isAttached() {
        return !!this._connection;
      }
      attach(connection2) {
        this._connection = connection2;
      }
      add(unregistration) {
        this._unregistrations.set(unregistration.method, unregistration);
      }
      dispose() {
        let unregistrations = [];
        for (let unregistration of this._unregistrations.values()) {
          unregistrations.push(unregistration);
        }
        let params = {
          unregisterations: unregistrations
        };
        this._connection.sendRequest(vscode_languageserver_protocol_1.UnregistrationRequest.type, params).catch(() => {
          this._connection.console.info(`Bulk unregistration failed.`);
        });
      }
      disposeSingle(arg) {
        const method = Is.string(arg) ? arg : arg.method;
        const unregistration = this._unregistrations.get(method);
        if (!unregistration) {
          return false;
        }
        let params = {
          unregisterations: [unregistration]
        };
        this._connection.sendRequest(vscode_languageserver_protocol_1.UnregistrationRequest.type, params).then(() => {
          this._unregistrations.delete(method);
        }, (_error) => {
          this._connection.console.info(`Un-registering request handler for ${unregistration.id} failed.`);
        });
        return true;
      }
    };
    var RemoteClientImpl = class {
      attach(connection2) {
        this._connection = connection2;
      }
      get connection() {
        if (!this._connection) {
          throw new Error("Remote is not attached to a connection yet.");
        }
        return this._connection;
      }
      initialize(_capabilities) {
      }
      fillServerCapabilities(_capabilities) {
      }
      register(typeOrRegistrations, registerOptionsOrType, registerOptions) {
        if (typeOrRegistrations instanceof BulkRegistrationImpl) {
          return this.registerMany(typeOrRegistrations);
        } else if (typeOrRegistrations instanceof BulkUnregistrationImpl) {
          return this.registerSingle1(typeOrRegistrations, registerOptionsOrType, registerOptions);
        } else {
          return this.registerSingle2(typeOrRegistrations, registerOptionsOrType);
        }
      }
      registerSingle1(unregistration, type, registerOptions) {
        const method = Is.string(type) ? type : type.method;
        const id = UUID.generateUuid();
        let params = {
          registrations: [{ id, method, registerOptions: registerOptions || {} }]
        };
        if (!unregistration.isAttached) {
          unregistration.attach(this.connection);
        }
        return this.connection.sendRequest(vscode_languageserver_protocol_1.RegistrationRequest.type, params).then((_result) => {
          unregistration.add({ id, method });
          return unregistration;
        }, (_error) => {
          this.connection.console.info(`Registering request handler for ${method} failed.`);
          return Promise.reject(_error);
        });
      }
      registerSingle2(type, registerOptions) {
        const method = Is.string(type) ? type : type.method;
        const id = UUID.generateUuid();
        let params = {
          registrations: [{ id, method, registerOptions: registerOptions || {} }]
        };
        return this.connection.sendRequest(vscode_languageserver_protocol_1.RegistrationRequest.type, params).then((_result) => {
          return vscode_languageserver_protocol_1.Disposable.create(() => {
            this.unregisterSingle(id, method).catch(() => {
              this.connection.console.info(`Un-registering capability with id ${id} failed.`);
            });
          });
        }, (_error) => {
          this.connection.console.info(`Registering request handler for ${method} failed.`);
          return Promise.reject(_error);
        });
      }
      unregisterSingle(id, method) {
        let params = {
          unregisterations: [{ id, method }]
        };
        return this.connection.sendRequest(vscode_languageserver_protocol_1.UnregistrationRequest.type, params).catch(() => {
          this.connection.console.info(`Un-registering request handler for ${id} failed.`);
        });
      }
      registerMany(registrations) {
        let params = registrations.asRegistrationParams();
        return this.connection.sendRequest(vscode_languageserver_protocol_1.RegistrationRequest.type, params).then(() => {
          return new BulkUnregistrationImpl(this._connection, params.registrations.map((registration) => {
            return { id: registration.id, method: registration.method };
          }));
        }, (_error) => {
          this.connection.console.info(`Bulk registration failed.`);
          return Promise.reject(_error);
        });
      }
    };
    var _RemoteWorkspaceImpl = class {
      constructor() {
      }
      attach(connection2) {
        this._connection = connection2;
      }
      get connection() {
        if (!this._connection) {
          throw new Error("Remote is not attached to a connection yet.");
        }
        return this._connection;
      }
      initialize(_capabilities) {
      }
      fillServerCapabilities(_capabilities) {
      }
      applyEdit(paramOrEdit) {
        function isApplyWorkspaceEditParams(value) {
          return value && !!value.edit;
        }
        let params = isApplyWorkspaceEditParams(paramOrEdit) ? paramOrEdit : { edit: paramOrEdit };
        return this.connection.sendRequest(vscode_languageserver_protocol_1.ApplyWorkspaceEditRequest.type, params);
      }
    };
    var RemoteWorkspaceImpl = (0, fileOperations_1.FileOperationsFeature)((0, workspaceFolder_1.WorkspaceFoldersFeature)((0, configuration_1.ConfigurationFeature)(_RemoteWorkspaceImpl)));
    var TracerImpl = class {
      constructor() {
        this._trace = vscode_languageserver_protocol_1.Trace.Off;
      }
      attach(connection2) {
        this._connection = connection2;
      }
      get connection() {
        if (!this._connection) {
          throw new Error("Remote is not attached to a connection yet.");
        }
        return this._connection;
      }
      initialize(_capabilities) {
      }
      fillServerCapabilities(_capabilities) {
      }
      set trace(value) {
        this._trace = value;
      }
      log(message, verbose) {
        if (this._trace === vscode_languageserver_protocol_1.Trace.Off) {
          return;
        }
        this.connection.sendNotification(vscode_languageserver_protocol_1.LogTraceNotification.type, {
          message,
          verbose: this._trace === vscode_languageserver_protocol_1.Trace.Verbose ? verbose : void 0
        }).catch(() => {
        });
      }
    };
    var TelemetryImpl = class {
      constructor() {
      }
      attach(connection2) {
        this._connection = connection2;
      }
      get connection() {
        if (!this._connection) {
          throw new Error("Remote is not attached to a connection yet.");
        }
        return this._connection;
      }
      initialize(_capabilities) {
      }
      fillServerCapabilities(_capabilities) {
      }
      logEvent(data) {
        this.connection.sendNotification(vscode_languageserver_protocol_1.TelemetryEventNotification.type, data).catch(() => {
          this.connection.console.log(`Sending TelemetryEventNotification failed`);
        });
      }
    };
    var _LanguagesImpl = class {
      constructor() {
      }
      attach(connection2) {
        this._connection = connection2;
      }
      get connection() {
        if (!this._connection) {
          throw new Error("Remote is not attached to a connection yet.");
        }
        return this._connection;
      }
      initialize(_capabilities) {
      }
      fillServerCapabilities(_capabilities) {
      }
      attachWorkDoneProgress(params) {
        return (0, progress_1.attachWorkDone)(this.connection, params);
      }
      attachPartialResultProgress(_type, params) {
        return (0, progress_1.attachPartialResult)(this.connection, params);
      }
    };
    exports2._LanguagesImpl = _LanguagesImpl;
    var LanguagesImpl = (0, foldingRange_1.FoldingRangeFeature)((0, moniker_1.MonikerFeature)((0, diagnostic_1.DiagnosticFeature)((0, inlayHint_1.InlayHintFeature)((0, inlineValue_1.InlineValueFeature)((0, typeHierarchy_1.TypeHierarchyFeature)((0, linkedEditingRange_1.LinkedEditingRangeFeature)((0, semanticTokens_1.SemanticTokensFeature)((0, callHierarchy_1.CallHierarchyFeature)(_LanguagesImpl)))))))));
    var _NotebooksImpl = class {
      constructor() {
      }
      attach(connection2) {
        this._connection = connection2;
      }
      get connection() {
        if (!this._connection) {
          throw new Error("Remote is not attached to a connection yet.");
        }
        return this._connection;
      }
      initialize(_capabilities) {
      }
      fillServerCapabilities(_capabilities) {
      }
      attachWorkDoneProgress(params) {
        return (0, progress_1.attachWorkDone)(this.connection, params);
      }
      attachPartialResultProgress(_type, params) {
        return (0, progress_1.attachPartialResult)(this.connection, params);
      }
    };
    exports2._NotebooksImpl = _NotebooksImpl;
    var NotebooksImpl = (0, notebook_1.NotebookSyncFeature)(_NotebooksImpl);
    function combineConsoleFeatures(one, two) {
      return function(Base) {
        return two(one(Base));
      };
    }
    exports2.combineConsoleFeatures = combineConsoleFeatures;
    function combineTelemetryFeatures(one, two) {
      return function(Base) {
        return two(one(Base));
      };
    }
    exports2.combineTelemetryFeatures = combineTelemetryFeatures;
    function combineTracerFeatures(one, two) {
      return function(Base) {
        return two(one(Base));
      };
    }
    exports2.combineTracerFeatures = combineTracerFeatures;
    function combineClientFeatures(one, two) {
      return function(Base) {
        return two(one(Base));
      };
    }
    exports2.combineClientFeatures = combineClientFeatures;
    function combineWindowFeatures(one, two) {
      return function(Base) {
        return two(one(Base));
      };
    }
    exports2.combineWindowFeatures = combineWindowFeatures;
    function combineWorkspaceFeatures(one, two) {
      return function(Base) {
        return two(one(Base));
      };
    }
    exports2.combineWorkspaceFeatures = combineWorkspaceFeatures;
    function combineLanguagesFeatures(one, two) {
      return function(Base) {
        return two(one(Base));
      };
    }
    exports2.combineLanguagesFeatures = combineLanguagesFeatures;
    function combineNotebooksFeatures(one, two) {
      return function(Base) {
        return two(one(Base));
      };
    }
    exports2.combineNotebooksFeatures = combineNotebooksFeatures;
    function combineFeatures(one, two) {
      function combine(one2, two2, func) {
        if (one2 && two2) {
          return func(one2, two2);
        } else if (one2) {
          return one2;
        } else {
          return two2;
        }
      }
      let result = {
        __brand: "features",
        console: combine(one.console, two.console, combineConsoleFeatures),
        tracer: combine(one.tracer, two.tracer, combineTracerFeatures),
        telemetry: combine(one.telemetry, two.telemetry, combineTelemetryFeatures),
        client: combine(one.client, two.client, combineClientFeatures),
        window: combine(one.window, two.window, combineWindowFeatures),
        workspace: combine(one.workspace, two.workspace, combineWorkspaceFeatures),
        languages: combine(one.languages, two.languages, combineLanguagesFeatures),
        notebooks: combine(one.notebooks, two.notebooks, combineNotebooksFeatures)
      };
      return result;
    }
    exports2.combineFeatures = combineFeatures;
    function createConnection2(connectionFactory, watchDog, factories) {
      const logger = factories && factories.console ? new (factories.console(RemoteConsoleImpl))() : new RemoteConsoleImpl();
      const connection2 = connectionFactory(logger);
      logger.rawAttach(connection2);
      const tracer = factories && factories.tracer ? new (factories.tracer(TracerImpl))() : new TracerImpl();
      const telemetry = factories && factories.telemetry ? new (factories.telemetry(TelemetryImpl))() : new TelemetryImpl();
      const client = factories && factories.client ? new (factories.client(RemoteClientImpl))() : new RemoteClientImpl();
      const remoteWindow = factories && factories.window ? new (factories.window(RemoteWindowImpl))() : new RemoteWindowImpl();
      const workspace = factories && factories.workspace ? new (factories.workspace(RemoteWorkspaceImpl))() : new RemoteWorkspaceImpl();
      const languages = factories && factories.languages ? new (factories.languages(LanguagesImpl))() : new LanguagesImpl();
      const notebooks = factories && factories.notebooks ? new (factories.notebooks(NotebooksImpl))() : new NotebooksImpl();
      const allRemotes = [logger, tracer, telemetry, client, remoteWindow, workspace, languages, notebooks];
      function asPromise(value) {
        if (value instanceof Promise) {
          return value;
        } else if (Is.thenable(value)) {
          return new Promise((resolve, reject) => {
            value.then((resolved) => resolve(resolved), (error) => reject(error));
          });
        } else {
          return Promise.resolve(value);
        }
      }
      let shutdownHandler = void 0;
      let initializeHandler = void 0;
      let exitHandler = void 0;
      let protocolConnection = {
        listen: () => connection2.listen(),
        sendRequest: (type, ...params) => connection2.sendRequest(Is.string(type) ? type : type.method, ...params),
        onRequest: (type, handler) => connection2.onRequest(type, handler),
        sendNotification: (type, param) => {
          const method = Is.string(type) ? type : type.method;
          return connection2.sendNotification(method, param);
        },
        onNotification: (type, handler) => connection2.onNotification(type, handler),
        onProgress: connection2.onProgress,
        sendProgress: connection2.sendProgress,
        onInitialize: (handler) => {
          initializeHandler = handler;
          return {
            dispose: () => {
              initializeHandler = void 0;
            }
          };
        },
        onInitialized: (handler) => connection2.onNotification(vscode_languageserver_protocol_1.InitializedNotification.type, handler),
        onShutdown: (handler) => {
          shutdownHandler = handler;
          return {
            dispose: () => {
              shutdownHandler = void 0;
            }
          };
        },
        onExit: (handler) => {
          exitHandler = handler;
          return {
            dispose: () => {
              exitHandler = void 0;
            }
          };
        },
        get console() {
          return logger;
        },
        get telemetry() {
          return telemetry;
        },
        get tracer() {
          return tracer;
        },
        get client() {
          return client;
        },
        get window() {
          return remoteWindow;
        },
        get workspace() {
          return workspace;
        },
        get languages() {
          return languages;
        },
        get notebooks() {
          return notebooks;
        },
        onDidChangeConfiguration: (handler) => connection2.onNotification(vscode_languageserver_protocol_1.DidChangeConfigurationNotification.type, handler),
        onDidChangeWatchedFiles: (handler) => connection2.onNotification(vscode_languageserver_protocol_1.DidChangeWatchedFilesNotification.type, handler),
        __textDocumentSync: void 0,
        onDidOpenTextDocument: (handler) => connection2.onNotification(vscode_languageserver_protocol_1.DidOpenTextDocumentNotification.type, handler),
        onDidChangeTextDocument: (handler) => connection2.onNotification(vscode_languageserver_protocol_1.DidChangeTextDocumentNotification.type, handler),
        onDidCloseTextDocument: (handler) => connection2.onNotification(vscode_languageserver_protocol_1.DidCloseTextDocumentNotification.type, handler),
        onWillSaveTextDocument: (handler) => connection2.onNotification(vscode_languageserver_protocol_1.WillSaveTextDocumentNotification.type, handler),
        onWillSaveTextDocumentWaitUntil: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.WillSaveTextDocumentWaitUntilRequest.type, handler),
        onDidSaveTextDocument: (handler) => connection2.onNotification(vscode_languageserver_protocol_1.DidSaveTextDocumentNotification.type, handler),
        sendDiagnostics: (params) => connection2.sendNotification(vscode_languageserver_protocol_1.PublishDiagnosticsNotification.type, params),
        onHover: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.HoverRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), void 0);
        }),
        onCompletion: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.CompletionRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onCompletionResolve: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.CompletionResolveRequest.type, handler),
        onSignatureHelp: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.SignatureHelpRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), void 0);
        }),
        onDeclaration: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.DeclarationRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onDefinition: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.DefinitionRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onTypeDefinition: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.TypeDefinitionRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onImplementation: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.ImplementationRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onReferences: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.ReferencesRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onDocumentHighlight: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.DocumentHighlightRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onDocumentSymbol: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.DocumentSymbolRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onWorkspaceSymbol: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.WorkspaceSymbolRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onWorkspaceSymbolResolve: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.WorkspaceSymbolResolveRequest.type, handler),
        onCodeAction: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.CodeActionRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onCodeActionResolve: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.CodeActionResolveRequest.type, (params, cancel) => {
          return handler(params, cancel);
        }),
        onCodeLens: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.CodeLensRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onCodeLensResolve: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.CodeLensResolveRequest.type, (params, cancel) => {
          return handler(params, cancel);
        }),
        onDocumentFormatting: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.DocumentFormattingRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), void 0);
        }),
        onDocumentRangeFormatting: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.DocumentRangeFormattingRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), void 0);
        }),
        onDocumentOnTypeFormatting: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.DocumentOnTypeFormattingRequest.type, (params, cancel) => {
          return handler(params, cancel);
        }),
        onRenameRequest: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.RenameRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), void 0);
        }),
        onPrepareRename: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.PrepareRenameRequest.type, (params, cancel) => {
          return handler(params, cancel);
        }),
        onDocumentLinks: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.DocumentLinkRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onDocumentLinkResolve: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.DocumentLinkResolveRequest.type, (params, cancel) => {
          return handler(params, cancel);
        }),
        onDocumentColor: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.DocumentColorRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onColorPresentation: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.ColorPresentationRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onFoldingRanges: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.FoldingRangeRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onSelectionRanges: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.SelectionRangeRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onExecuteCommand: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.ExecuteCommandRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), void 0);
        }),
        dispose: () => connection2.dispose()
      };
      for (let remote of allRemotes) {
        remote.attach(protocolConnection);
      }
      connection2.onRequest(vscode_languageserver_protocol_1.InitializeRequest.type, (params) => {
        watchDog.initialize(params);
        if (Is.string(params.trace)) {
          tracer.trace = vscode_languageserver_protocol_1.Trace.fromString(params.trace);
        }
        for (let remote of allRemotes) {
          remote.initialize(params.capabilities);
        }
        if (initializeHandler) {
          let result = initializeHandler(params, new vscode_languageserver_protocol_1.CancellationTokenSource().token, (0, progress_1.attachWorkDone)(connection2, params), void 0);
          return asPromise(result).then((value) => {
            if (value instanceof vscode_languageserver_protocol_1.ResponseError) {
              return value;
            }
            let result2 = value;
            if (!result2) {
              result2 = { capabilities: {} };
            }
            let capabilities = result2.capabilities;
            if (!capabilities) {
              capabilities = {};
              result2.capabilities = capabilities;
            }
            if (capabilities.textDocumentSync === void 0 || capabilities.textDocumentSync === null) {
              capabilities.textDocumentSync = Is.number(protocolConnection.__textDocumentSync) ? protocolConnection.__textDocumentSync : vscode_languageserver_protocol_1.TextDocumentSyncKind.None;
            } else if (!Is.number(capabilities.textDocumentSync) && !Is.number(capabilities.textDocumentSync.change)) {
              capabilities.textDocumentSync.change = Is.number(protocolConnection.__textDocumentSync) ? protocolConnection.__textDocumentSync : vscode_languageserver_protocol_1.TextDocumentSyncKind.None;
            }
            for (let remote of allRemotes) {
              remote.fillServerCapabilities(capabilities);
            }
            return result2;
          });
        } else {
          let result = { capabilities: { textDocumentSync: vscode_languageserver_protocol_1.TextDocumentSyncKind.None } };
          for (let remote of allRemotes) {
            remote.fillServerCapabilities(result.capabilities);
          }
          return result;
        }
      });
      connection2.onRequest(vscode_languageserver_protocol_1.ShutdownRequest.type, () => {
        watchDog.shutdownReceived = true;
        if (shutdownHandler) {
          return shutdownHandler(new vscode_languageserver_protocol_1.CancellationTokenSource().token);
        } else {
          return void 0;
        }
      });
      connection2.onNotification(vscode_languageserver_protocol_1.ExitNotification.type, () => {
        try {
          if (exitHandler) {
            exitHandler();
          }
        } finally {
          if (watchDog.shutdownReceived) {
            watchDog.exit(0);
          } else {
            watchDog.exit(1);
          }
        }
      });
      connection2.onNotification(vscode_languageserver_protocol_1.SetTraceNotification.type, (params) => {
        tracer.trace = vscode_languageserver_protocol_1.Trace.fromString(params.value);
      });
      return protocolConnection;
    }
    exports2.createConnection = createConnection2;
  }
});

// node_modules/vscode-languageserver/lib/node/files.js
var require_files = __commonJS({
  "node_modules/vscode-languageserver/lib/node/files.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.resolveModulePath = exports2.FileSystem = exports2.resolveGlobalYarnPath = exports2.resolveGlobalNodePath = exports2.resolve = exports2.uriToFilePath = void 0;
    var url = require("url");
    var path = require("path");
    var fs = require("fs");
    var child_process_1 = require("child_process");
    function uriToFilePath(uri) {
      let parsed = url.parse(uri);
      if (parsed.protocol !== "file:" || !parsed.path) {
        return void 0;
      }
      let segments = parsed.path.split("/");
      for (var i = 0, len = segments.length; i < len; i++) {
        segments[i] = decodeURIComponent(segments[i]);
      }
      if (process.platform === "win32" && segments.length > 1) {
        let first = segments[0];
        let second = segments[1];
        if (first.length === 0 && second.length > 1 && second[1] === ":") {
          segments.shift();
        }
      }
      return path.normalize(segments.join("/"));
    }
    exports2.uriToFilePath = uriToFilePath;
    function isWindows() {
      return process.platform === "win32";
    }
    function resolve(moduleName, nodePath, cwd, tracer) {
      const nodePathKey = "NODE_PATH";
      const app = [
        "var p = process;",
        "p.on('message',function(m){",
        "if(m.c==='e'){",
        "p.exit(0);",
        "}",
        "else if(m.c==='rs'){",
        "try{",
        "var r=require.resolve(m.a);",
        "p.send({c:'r',s:true,r:r});",
        "}",
        "catch(err){",
        "p.send({c:'r',s:false});",
        "}",
        "}",
        "});"
      ].join("");
      return new Promise((resolve2, reject) => {
        let env = process.env;
        let newEnv = /* @__PURE__ */ Object.create(null);
        Object.keys(env).forEach((key) => newEnv[key] = env[key]);
        if (nodePath && fs.existsSync(nodePath)) {
          if (newEnv[nodePathKey]) {
            newEnv[nodePathKey] = nodePath + path.delimiter + newEnv[nodePathKey];
          } else {
            newEnv[nodePathKey] = nodePath;
          }
          if (tracer) {
            tracer(`NODE_PATH value is: ${newEnv[nodePathKey]}`);
          }
        }
        newEnv["ELECTRON_RUN_AS_NODE"] = "1";
        try {
          let cp = (0, child_process_1.fork)("", [], {
            cwd,
            env: newEnv,
            execArgv: ["-e", app]
          });
          if (cp.pid === void 0) {
            reject(new Error(`Starting process to resolve node module  ${moduleName} failed`));
            return;
          }
          cp.on("error", (error) => {
            reject(error);
          });
          cp.on("message", (message2) => {
            if (message2.c === "r") {
              cp.send({ c: "e" });
              if (message2.s) {
                resolve2(message2.r);
              } else {
                reject(new Error(`Failed to resolve module: ${moduleName}`));
              }
            }
          });
          let message = {
            c: "rs",
            a: moduleName
          };
          cp.send(message);
        } catch (error) {
          reject(error);
        }
      });
    }
    exports2.resolve = resolve;
    function resolveGlobalNodePath(tracer) {
      let npmCommand = "npm";
      const env = /* @__PURE__ */ Object.create(null);
      Object.keys(process.env).forEach((key) => env[key] = process.env[key]);
      env["NO_UPDATE_NOTIFIER"] = "true";
      const options = {
        encoding: "utf8",
        env
      };
      if (isWindows()) {
        npmCommand = "npm.cmd";
        options.shell = true;
      }
      let handler = () => {
      };
      try {
        process.on("SIGPIPE", handler);
        let stdout = (0, child_process_1.spawnSync)(npmCommand, ["config", "get", "prefix"], options).stdout;
        if (!stdout) {
          if (tracer) {
            tracer(`'npm config get prefix' didn't return a value.`);
          }
          return void 0;
        }
        let prefix = stdout.trim();
        if (tracer) {
          tracer(`'npm config get prefix' value is: ${prefix}`);
        }
        if (prefix.length > 0) {
          if (isWindows()) {
            return path.join(prefix, "node_modules");
          } else {
            return path.join(prefix, "lib", "node_modules");
          }
        }
        return void 0;
      } catch (err) {
        return void 0;
      } finally {
        process.removeListener("SIGPIPE", handler);
      }
    }
    exports2.resolveGlobalNodePath = resolveGlobalNodePath;
    function resolveGlobalYarnPath(tracer) {
      let yarnCommand = "yarn";
      let options = {
        encoding: "utf8"
      };
      if (isWindows()) {
        yarnCommand = "yarn.cmd";
        options.shell = true;
      }
      let handler = () => {
      };
      try {
        process.on("SIGPIPE", handler);
        let results = (0, child_process_1.spawnSync)(yarnCommand, ["global", "dir", "--json"], options);
        let stdout = results.stdout;
        if (!stdout) {
          if (tracer) {
            tracer(`'yarn global dir' didn't return a value.`);
            if (results.stderr) {
              tracer(results.stderr);
            }
          }
          return void 0;
        }
        let lines = stdout.trim().split(/\r?\n/);
        for (let line of lines) {
          try {
            let yarn = JSON.parse(line);
            if (yarn.type === "log") {
              return path.join(yarn.data, "node_modules");
            }
          } catch (e) {
          }
        }
        return void 0;
      } catch (err) {
        return void 0;
      } finally {
        process.removeListener("SIGPIPE", handler);
      }
    }
    exports2.resolveGlobalYarnPath = resolveGlobalYarnPath;
    var FileSystem;
    (function(FileSystem2) {
      let _isCaseSensitive = void 0;
      function isCaseSensitive() {
        if (_isCaseSensitive !== void 0) {
          return _isCaseSensitive;
        }
        if (process.platform === "win32") {
          _isCaseSensitive = false;
        } else {
          _isCaseSensitive = !fs.existsSync(__filename.toUpperCase()) || !fs.existsSync(__filename.toLowerCase());
        }
        return _isCaseSensitive;
      }
      FileSystem2.isCaseSensitive = isCaseSensitive;
      function isParent(parent, child) {
        if (isCaseSensitive()) {
          return path.normalize(child).indexOf(path.normalize(parent)) === 0;
        } else {
          return path.normalize(child).toLowerCase().indexOf(path.normalize(parent).toLowerCase()) === 0;
        }
      }
      FileSystem2.isParent = isParent;
    })(FileSystem || (exports2.FileSystem = FileSystem = {}));
    function resolveModulePath(workspaceRoot, moduleName, nodePath, tracer) {
      if (nodePath) {
        if (!path.isAbsolute(nodePath)) {
          nodePath = path.join(workspaceRoot, nodePath);
        }
        return resolve(moduleName, nodePath, nodePath, tracer).then((value) => {
          if (FileSystem.isParent(nodePath, value)) {
            return value;
          } else {
            return Promise.reject(new Error(`Failed to load ${moduleName} from node path location.`));
          }
        }).then(void 0, (_error) => {
          return resolve(moduleName, resolveGlobalNodePath(tracer), workspaceRoot, tracer);
        });
      } else {
        return resolve(moduleName, resolveGlobalNodePath(tracer), workspaceRoot, tracer);
      }
    }
    exports2.resolveModulePath = resolveModulePath;
  }
});

// node_modules/vscode-languageserver-protocol/node.js
var require_node2 = __commonJS({
  "node_modules/vscode-languageserver-protocol/node.js"(exports2, module2) {
    "use strict";
    module2.exports = require_main3();
  }
});

// node_modules/vscode-languageserver/lib/common/inlineCompletion.proposed.js
var require_inlineCompletion_proposed = __commonJS({
  "node_modules/vscode-languageserver/lib/common/inlineCompletion.proposed.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.InlineCompletionFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var InlineCompletionFeature = (Base) => {
      return class extends Base {
        get inlineCompletion() {
          return {
            on: (handler) => {
              return this.connection.onRequest(vscode_languageserver_protocol_1.InlineCompletionRequest.type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params));
              });
            }
          };
        }
      };
    };
    exports2.InlineCompletionFeature = InlineCompletionFeature;
  }
});

// node_modules/vscode-languageserver/lib/common/api.js
var require_api3 = __commonJS({
  "node_modules/vscode-languageserver/lib/common/api.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ProposedFeatures = exports2.NotebookDocuments = exports2.TextDocuments = exports2.SemanticTokensBuilder = void 0;
    var semanticTokens_1 = require_semanticTokens();
    Object.defineProperty(exports2, "SemanticTokensBuilder", { enumerable: true, get: function() {
      return semanticTokens_1.SemanticTokensBuilder;
    } });
    var ic = require_inlineCompletion_proposed();
    __exportStar(require_main3(), exports2);
    var textDocuments_1 = require_textDocuments();
    Object.defineProperty(exports2, "TextDocuments", { enumerable: true, get: function() {
      return textDocuments_1.TextDocuments;
    } });
    var notebook_1 = require_notebook();
    Object.defineProperty(exports2, "NotebookDocuments", { enumerable: true, get: function() {
      return notebook_1.NotebookDocuments;
    } });
    __exportStar(require_server(), exports2);
    var ProposedFeatures2;
    (function(ProposedFeatures3) {
      ProposedFeatures3.all = {
        __brand: "features",
        languages: ic.InlineCompletionFeature
      };
    })(ProposedFeatures2 || (exports2.ProposedFeatures = ProposedFeatures2 = {}));
  }
});

// node_modules/vscode-languageserver/lib/node/main.js
var require_main4 = __commonJS({
  "node_modules/vscode-languageserver/lib/node/main.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createConnection = exports2.Files = void 0;
    var node_util_1 = require("node:util");
    var Is = require_is();
    var server_1 = require_server();
    var fm = require_files();
    var node_1 = require_node2();
    __exportStar(require_node2(), exports2);
    __exportStar(require_api3(), exports2);
    var Files;
    (function(Files2) {
      Files2.uriToFilePath = fm.uriToFilePath;
      Files2.resolveGlobalNodePath = fm.resolveGlobalNodePath;
      Files2.resolveGlobalYarnPath = fm.resolveGlobalYarnPath;
      Files2.resolve = fm.resolve;
      Files2.resolveModulePath = fm.resolveModulePath;
    })(Files || (exports2.Files = Files = {}));
    var _protocolConnection;
    function endProtocolConnection() {
      if (_protocolConnection === void 0) {
        return;
      }
      try {
        _protocolConnection.end();
      } catch (_err) {
      }
    }
    var _shutdownReceived = false;
    var exitTimer = void 0;
    function setupExitTimer() {
      const argName = "--clientProcessId";
      function runTimer(value) {
        try {
          let processId = parseInt(value);
          if (!isNaN(processId)) {
            exitTimer = setInterval(() => {
              try {
                process.kill(processId, 0);
              } catch (ex) {
                endProtocolConnection();
                process.exit(_shutdownReceived ? 0 : 1);
              }
            }, 3e3);
          }
        } catch (e) {
        }
      }
      for (let i = 2; i < process.argv.length; i++) {
        let arg = process.argv[i];
        if (arg === argName && i + 1 < process.argv.length) {
          runTimer(process.argv[i + 1]);
          return;
        } else {
          let args = arg.split("=");
          if (args[0] === argName) {
            runTimer(args[1]);
          }
        }
      }
    }
    setupExitTimer();
    var watchDog = {
      initialize: (params) => {
        const processId = params.processId;
        if (Is.number(processId) && exitTimer === void 0) {
          setInterval(() => {
            try {
              process.kill(processId, 0);
            } catch (ex) {
              process.exit(_shutdownReceived ? 0 : 1);
            }
          }, 3e3);
        }
      },
      get shutdownReceived() {
        return _shutdownReceived;
      },
      set shutdownReceived(value) {
        _shutdownReceived = value;
      },
      exit: (code) => {
        endProtocolConnection();
        process.exit(code);
      }
    };
    function createConnection2(arg1, arg2, arg3, arg4) {
      let factories;
      let input;
      let output;
      let options;
      if (arg1 !== void 0 && arg1.__brand === "features") {
        factories = arg1;
        arg1 = arg2;
        arg2 = arg3;
        arg3 = arg4;
      }
      if (node_1.ConnectionStrategy.is(arg1) || node_1.ConnectionOptions.is(arg1)) {
        options = arg1;
      } else {
        input = arg1;
        output = arg2;
        options = arg3;
      }
      return _createConnection(input, output, options, factories);
    }
    exports2.createConnection = createConnection2;
    function _createConnection(input, output, options, factories) {
      let stdio = false;
      if (!input && !output && process.argv.length > 2) {
        let port = void 0;
        let pipeName = void 0;
        let argv = process.argv.slice(2);
        for (let i = 0; i < argv.length; i++) {
          let arg = argv[i];
          if (arg === "--node-ipc") {
            input = new node_1.IPCMessageReader(process);
            output = new node_1.IPCMessageWriter(process);
            break;
          } else if (arg === "--stdio") {
            stdio = true;
            input = process.stdin;
            output = process.stdout;
            break;
          } else if (arg === "--socket") {
            port = parseInt(argv[i + 1]);
            break;
          } else if (arg === "--pipe") {
            pipeName = argv[i + 1];
            break;
          } else {
            var args = arg.split("=");
            if (args[0] === "--socket") {
              port = parseInt(args[1]);
              break;
            } else if (args[0] === "--pipe") {
              pipeName = args[1];
              break;
            }
          }
        }
        if (port) {
          let transport = (0, node_1.createServerSocketTransport)(port);
          input = transport[0];
          output = transport[1];
        } else if (pipeName) {
          let transport = (0, node_1.createServerPipeTransport)(pipeName);
          input = transport[0];
          output = transport[1];
        }
      }
      var commandLineMessage = "Use arguments of createConnection or set command line parameters: '--node-ipc', '--stdio' or '--socket={number}'";
      if (!input) {
        throw new Error("Connection input stream is not set. " + commandLineMessage);
      }
      if (!output) {
        throw new Error("Connection output stream is not set. " + commandLineMessage);
      }
      if (Is.func(input.read) && Is.func(input.on)) {
        let inputStream = input;
        inputStream.on("end", () => {
          endProtocolConnection();
          process.exit(_shutdownReceived ? 0 : 1);
        });
        inputStream.on("close", () => {
          endProtocolConnection();
          process.exit(_shutdownReceived ? 0 : 1);
        });
      }
      const connectionFactory = (logger) => {
        const result = (0, node_1.createProtocolConnection)(input, output, logger, options);
        if (stdio) {
          patchConsole(logger);
        }
        return result;
      };
      return (0, server_1.createConnection)(connectionFactory, watchDog, factories);
    }
    function patchConsole(logger) {
      function serialize(args) {
        return args.map((arg) => typeof arg === "string" ? arg : (0, node_util_1.inspect)(arg)).join(" ");
      }
      const counters = /* @__PURE__ */ new Map();
      console.assert = function assert(assertion, ...args) {
        if (assertion) {
          return;
        }
        if (args.length === 0) {
          logger.error("Assertion failed");
        } else {
          const [message, ...rest] = args;
          logger.error(`Assertion failed: ${message} ${serialize(rest)}`);
        }
      };
      console.count = function count(label = "default") {
        const message = String(label);
        let counter = counters.get(message) ?? 0;
        counter += 1;
        counters.set(message, counter);
        logger.log(`${message}: ${message}`);
      };
      console.countReset = function countReset(label) {
        if (label === void 0) {
          counters.clear();
        } else {
          counters.delete(String(label));
        }
      };
      console.debug = function debug(...args) {
        logger.log(serialize(args));
      };
      console.dir = function dir(arg, options) {
        logger.log((0, node_util_1.inspect)(arg, options));
      };
      console.log = function log(...args) {
        logger.log(serialize(args));
      };
      console.error = function error(...args) {
        logger.error(serialize(args));
      };
      console.trace = function trace(...args) {
        const stack = new Error().stack.replace(/(.+\n){2}/, "");
        let message = "Trace";
        if (args.length !== 0) {
          message += `: ${serialize(args)}`;
        }
        logger.log(`${message}
${stack}`);
      };
      console.warn = function warn(...args) {
        logger.warn(serialize(args));
      };
    }
  }
});

// node_modules/vscode-languageserver/node.js
var require_node3 = __commonJS({
  "node_modules/vscode-languageserver/node.js"(exports2, module2) {
    "use strict";
    module2.exports = require_main4();
  }
});

// dist/src/lsp/server.js
var import_node = __toESM(require_node3(), 1);
var import_url = require("url");

// node_modules/vscode-languageserver-textdocument/lib/esm/main.js
var FullTextDocument = class _FullTextDocument {
  constructor(uri, languageId, version, content) {
    this._uri = uri;
    this._languageId = languageId;
    this._version = version;
    this._content = content;
    this._lineOffsets = void 0;
  }
  get uri() {
    return this._uri;
  }
  get languageId() {
    return this._languageId;
  }
  get version() {
    return this._version;
  }
  getText(range) {
    if (range) {
      const start = this.offsetAt(range.start);
      const end = this.offsetAt(range.end);
      return this._content.substring(start, end);
    }
    return this._content;
  }
  update(changes, version) {
    for (const change of changes) {
      if (_FullTextDocument.isIncremental(change)) {
        const range = getWellformedRange(change.range);
        const startOffset = this.offsetAt(range.start);
        const endOffset = this.offsetAt(range.end);
        this._content = this._content.substring(0, startOffset) + change.text + this._content.substring(endOffset, this._content.length);
        const startLine = Math.max(range.start.line, 0);
        const endLine = Math.max(range.end.line, 0);
        let lineOffsets = this._lineOffsets;
        const addedLineOffsets = computeLineOffsets(change.text, false, startOffset);
        if (endLine - startLine === addedLineOffsets.length) {
          for (let i = 0, len = addedLineOffsets.length; i < len; i++) {
            lineOffsets[i + startLine + 1] = addedLineOffsets[i];
          }
        } else {
          if (addedLineOffsets.length < 1e4) {
            lineOffsets.splice(startLine + 1, endLine - startLine, ...addedLineOffsets);
          } else {
            this._lineOffsets = lineOffsets = lineOffsets.slice(0, startLine + 1).concat(addedLineOffsets, lineOffsets.slice(endLine + 1));
          }
        }
        const diff = change.text.length - (endOffset - startOffset);
        if (diff !== 0) {
          for (let i = startLine + 1 + addedLineOffsets.length, len = lineOffsets.length; i < len; i++) {
            lineOffsets[i] = lineOffsets[i] + diff;
          }
        }
      } else if (_FullTextDocument.isFull(change)) {
        this._content = change.text;
        this._lineOffsets = void 0;
      } else {
        throw new Error("Unknown change event received");
      }
    }
    this._version = version;
  }
  getLineOffsets() {
    if (this._lineOffsets === void 0) {
      this._lineOffsets = computeLineOffsets(this._content, true);
    }
    return this._lineOffsets;
  }
  positionAt(offset2) {
    offset2 = Math.max(Math.min(offset2, this._content.length), 0);
    const lineOffsets = this.getLineOffsets();
    let low = 0, high = lineOffsets.length;
    if (high === 0) {
      return { line: 0, character: offset2 };
    }
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (lineOffsets[mid] > offset2) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }
    const line = low - 1;
    offset2 = this.ensureBeforeEOL(offset2, lineOffsets[line]);
    return { line, character: offset2 - lineOffsets[line] };
  }
  offsetAt(position2) {
    const lineOffsets = this.getLineOffsets();
    if (position2.line >= lineOffsets.length) {
      return this._content.length;
    } else if (position2.line < 0) {
      return 0;
    }
    const lineOffset = lineOffsets[position2.line];
    if (position2.character <= 0) {
      return lineOffset;
    }
    const nextLineOffset = position2.line + 1 < lineOffsets.length ? lineOffsets[position2.line + 1] : this._content.length;
    const offset2 = Math.min(lineOffset + position2.character, nextLineOffset);
    return this.ensureBeforeEOL(offset2, lineOffset);
  }
  ensureBeforeEOL(offset2, lineOffset) {
    while (offset2 > lineOffset && isEOL(this._content.charCodeAt(offset2 - 1))) {
      offset2--;
    }
    return offset2;
  }
  get lineCount() {
    return this.getLineOffsets().length;
  }
  static isIncremental(event) {
    const candidate = event;
    return candidate !== void 0 && candidate !== null && typeof candidate.text === "string" && candidate.range !== void 0 && (candidate.rangeLength === void 0 || typeof candidate.rangeLength === "number");
  }
  static isFull(event) {
    const candidate = event;
    return candidate !== void 0 && candidate !== null && typeof candidate.text === "string" && candidate.range === void 0 && candidate.rangeLength === void 0;
  }
};
var TextDocument;
(function(TextDocument2) {
  function create(uri, languageId, version, content) {
    return new FullTextDocument(uri, languageId, version, content);
  }
  TextDocument2.create = create;
  function update2(document, changes, version) {
    if (document instanceof FullTextDocument) {
      document.update(changes, version);
      return document;
    } else {
      throw new Error("TextDocument.update: document must be created by TextDocument.create");
    }
  }
  TextDocument2.update = update2;
  function applyEdits(document, edits) {
    const text = document.getText();
    const sortedEdits = mergeSort(edits.map(getWellformedEdit), (a, b) => {
      const diff = a.range.start.line - b.range.start.line;
      if (diff === 0) {
        return a.range.start.character - b.range.start.character;
      }
      return diff;
    });
    let lastModifiedOffset = 0;
    const spans = [];
    for (const e of sortedEdits) {
      const startOffset = document.offsetAt(e.range.start);
      if (startOffset < lastModifiedOffset) {
        throw new Error("Overlapping edit");
      } else if (startOffset > lastModifiedOffset) {
        spans.push(text.substring(lastModifiedOffset, startOffset));
      }
      if (e.newText.length) {
        spans.push(e.newText);
      }
      lastModifiedOffset = document.offsetAt(e.range.end);
    }
    spans.push(text.substr(lastModifiedOffset));
    return spans.join("");
  }
  TextDocument2.applyEdits = applyEdits;
})(TextDocument || (TextDocument = {}));
function mergeSort(data, compare) {
  if (data.length <= 1) {
    return data;
  }
  const p = data.length / 2 | 0;
  const left = data.slice(0, p);
  const right = data.slice(p);
  mergeSort(left, compare);
  mergeSort(right, compare);
  let leftIdx = 0;
  let rightIdx = 0;
  let i = 0;
  while (leftIdx < left.length && rightIdx < right.length) {
    const ret = compare(left[leftIdx], right[rightIdx]);
    if (ret <= 0) {
      data[i++] = left[leftIdx++];
    } else {
      data[i++] = right[rightIdx++];
    }
  }
  while (leftIdx < left.length) {
    data[i++] = left[leftIdx++];
  }
  while (rightIdx < right.length) {
    data[i++] = right[rightIdx++];
  }
  return data;
}
function computeLineOffsets(text, isAtLineStart, textOffset = 0) {
  const result = isAtLineStart ? [textOffset] : [];
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (isEOL(ch)) {
      if (ch === 13 && i + 1 < text.length && text.charCodeAt(i + 1) === 10) {
        i++;
      }
      result.push(textOffset + i + 1);
    }
  }
  return result;
}
function isEOL(char) {
  return char === 13 || char === 10;
}
function getWellformedRange(range) {
  const start = range.start;
  const end = range.end;
  if (start.line > end.line || start.line === end.line && start.character > end.character) {
    return { start: end, end: start };
  }
  return range;
}
function getWellformedEdit(textEdit) {
  const range = getWellformedRange(textEdit.range);
  if (range !== textEdit.range) {
    return { newText: textEdit.newText, range };
  }
  return textEdit;
}

// dist/src/lsp/server.js
var import_node2 = __toESM(require_node3(), 1);

// dist/src/ast/tokens.js
function getTokenPosition(t) {
  return {
    line: t.line,
    column: t.column,
    start: t.start,
    end: t.end
  };
}
var TokenKind;
(function(TokenKind2) {
  TokenKind2["Kind_Illegal"] = "Kind_Illegal";
  TokenKind2["Kind_EOF"] = "Kind_EOF";
  TokenKind2["Kind_Identifier"] = "Kind_Identifier";
  TokenKind2["Kind_IntegerLiteral"] = "Kind_IntegerLiteral";
  TokenKind2["Kind_FloatLiteral"] = "Kind_FloatLiteral";
  TokenKind2["Kind_BooleanLiteral"] = "Kind_BooleanLiteral";
  TokenKind2["Kind_StringLiteral"] = "Kind_StringLiteral";
  TokenKind2["Kind_CharacterLiteral"] = "Kind_CharacterLiteral";
  TokenKind2["Kind_LineComment"] = "Kind_LineComment";
  TokenKind2["Kind_BlockComment"] = "Kind_BlockComment";
  TokenKind2["Keyword_Function"] = "Keyword_Function";
  TokenKind2["Keyword_Return"] = "Keyword_Return";
  TokenKind2["Keyword_Const"] = "Keyword_Const";
  TokenKind2["Keyword_Let"] = "Keyword_Let";
  TokenKind2["Keyword_If"] = "Keyword_If";
  TokenKind2["Keyword_Else"] = "Keyword_Else";
  TokenKind2["Keyword_While"] = "Keyword_While";
  TokenKind2["Keyword_For"] = "Keyword_For";
  TokenKind2["Keyword_Switch"] = "Keyword_Switch";
  TokenKind2["Keyword_Continue"] = "Keyword_Continue";
  TokenKind2["Keyword_Case"] = "Keyword_Case";
  TokenKind2["Keyword_Default"] = "Keyword_Default";
  TokenKind2["Keyword_Break"] = "Keyword_Break";
  TokenKind2["Keyword_Type"] = "Keyword_Type";
  TokenKind2["Keyword_Error"] = "Keyword_Error";
  TokenKind2["Keyword_As"] = "Keyword_As";
  TokenKind2["Keyword_Forward"] = "Keyword_Forward";
  TokenKind2["Keyword_Check"] = "Keyword_Check";
  TokenKind2["Keyword_Edit"] = "Keyword_Edit";
  TokenKind2["Keyword_New"] = "Keyword_New";
  TokenKind2["Keyword_Clone"] = "Keyword_Clone";
  TokenKind2["Keyword_Move"] = "Keyword_Move";
  TokenKind2["Keyword_Unique"] = "Keyword_Unique";
  TokenKind2["Keyword_Heap"] = "Keyword_Heap";
  TokenKind2["Keyword_Struct"] = "Keyword_Struct";
  TokenKind2["Keyword_Enum"] = "Keyword_Enum";
  TokenKind2["Keyword_Union"] = "Keyword_Union";
  TokenKind2["Symbol_LeftParen"] = "Symbol_LeftParen";
  TokenKind2["Symbol_RightParen"] = "Symbol_RightParen";
  TokenKind2["Symbol_LeftBrace"] = "Symbol_LeftBrace";
  TokenKind2["Symbol_RightBrace"] = "Symbol_RightBrace";
  TokenKind2["Symbol_LeftBracket"] = "Symbol_LeftBracket";
  TokenKind2["Symbol_RightBracket"] = "Symbol_RightBracket";
  TokenKind2["Symbol_Colon"] = "Symbol_Colon";
  TokenKind2["Symbol_Semicolon"] = "Symbol_Semicolon";
  TokenKind2["Symbol_Comma"] = "Symbol_Comma";
  TokenKind2["Symbol_Plus"] = "Symbol_Plus";
  TokenKind2["Symbol_Minus"] = "Symbol_Minus";
  TokenKind2["Symbol_Asterisk"] = "Symbol_Asterisk";
  TokenKind2["Symbol_FSlash"] = "Symbol_FSlash";
  TokenKind2["Symbol_Percent"] = "Symbol_Percent";
  TokenKind2["Symbol_Less"] = "Symbol_Less";
  TokenKind2["Symbol_LessEq"] = "Symbol_LessEq";
  TokenKind2["Symbol_Greater"] = "Symbol_Greater";
  TokenKind2["Symbol_GreaterEq"] = "Symbol_GreaterEq";
  TokenKind2["Symbol_Equals"] = "Symbol_Equals";
  TokenKind2["Symbol_Equality"] = "Symbol_Equality";
  TokenKind2["Symbol_NotEquals"] = "Symbol_NotEquals";
  TokenKind2["Symbol_Not"] = "Symbol_Not";
  TokenKind2["Symbol_LogicalAnd"] = "Symbol_LogicalAnd";
  TokenKind2["Symbol_LogicalOr"] = "Symbol_LogicalOr";
  TokenKind2["Symbol_Pipe"] = "Symbol_Pipe";
  TokenKind2["Symbol_Ampersand"] = "Symbol_Ampersand";
  TokenKind2["Symbol_Caret"] = "Symbol_Caret";
  TokenKind2["Symbol_Tilde"] = "Symbol_Tilde";
  TokenKind2["Symbol_ShiftLeft"] = "Symbol_ShiftLeft";
  TokenKind2["Symbol_ShiftRight"] = "Symbol_ShiftRight";
  TokenKind2["Symbol_PlusEquals"] = "Symbol_PlusEquals";
  TokenKind2["Symbol_MinusEquals"] = "Symbol_MinusEquals";
  TokenKind2["Symbol_AsteriskEquals"] = "Symbol_AsteriskEquals";
  TokenKind2["Symbol_FSlashEquals"] = "Symbol_FSlashEquals";
  TokenKind2["Symbol_PercentEquals"] = "Symbol_PercentEquals";
  TokenKind2["Symbol_AmpersandEquals"] = "Symbol_AmpersandEquals";
  TokenKind2["Symbol_PipeEquals"] = "Symbol_PipeEquals";
  TokenKind2["Symbol_CaretEquals"] = "Symbol_CaretEquals";
  TokenKind2["Symbol_ShiftLeftEquals"] = "Symbol_ShiftLeftEquals";
  TokenKind2["Symbol_ShiftRightEquals"] = "Symbol_ShiftRightEquals";
  TokenKind2["Symbol_Increment"] = "Symbol_Increment";
  TokenKind2["Symbol_Decrement"] = "Symbol_Decrement";
  TokenKind2["Symbol_Dot"] = "Symbol_Dot";
  TokenKind2["Symbol_Range"] = "Symbol_Range";
  TokenKind2["Symbol_Ellipsis"] = "Symbol_Ellipsis";
})(TokenKind || (TokenKind = {}));
function string(kind) {
  switch (kind) {
    case TokenKind.Kind_Illegal:
      return "illegal";
    case TokenKind.Kind_EOF:
      return "end of file";
    case TokenKind.Kind_Identifier:
      return "identifier";
    case TokenKind.Kind_IntegerLiteral:
      return "integer literal";
    case TokenKind.Kind_FloatLiteral:
      return "float literal";
    case TokenKind.Kind_BooleanLiteral:
      return "boolean literal";
    case TokenKind.Kind_StringLiteral:
      return "string literal";
    case TokenKind.Kind_CharacterLiteral:
      return "character literal";
    case TokenKind.Kind_LineComment:
      return "line comment";
    case TokenKind.Kind_BlockComment:
      return "block comment";
    case TokenKind.Keyword_Function:
      return "function";
    case TokenKind.Keyword_Return:
      return "return";
    case TokenKind.Keyword_Const:
      return "const";
    case TokenKind.Keyword_Let:
      return "let";
    case TokenKind.Keyword_If:
      return "if";
    case TokenKind.Keyword_Else:
      return "else";
    case TokenKind.Keyword_While:
      return "while";
    case TokenKind.Keyword_For:
      return "for";
    case TokenKind.Keyword_Switch:
      return "switch";
    case TokenKind.Keyword_Continue:
      return "continue";
    case TokenKind.Keyword_Case:
      return "case";
    case TokenKind.Keyword_Default:
      return "default";
    case TokenKind.Keyword_Break:
      return "break";
    case TokenKind.Keyword_Type:
      return "type";
    case TokenKind.Keyword_Error:
      return "error";
    case TokenKind.Keyword_As:
      return "as";
    case TokenKind.Keyword_Forward:
      return "forward";
    case TokenKind.Keyword_Check:
      return "check";
    case TokenKind.Keyword_Edit:
      return "edit";
    case TokenKind.Keyword_New:
      return "new";
    case TokenKind.Keyword_Clone:
      return "clone";
    case TokenKind.Keyword_Move:
      return "move";
    case TokenKind.Keyword_Unique:
      return "unique";
    case TokenKind.Keyword_Heap:
      return "heap";
    case TokenKind.Keyword_Struct:
      return "struct";
    case TokenKind.Keyword_Union:
      return "union";
    case TokenKind.Keyword_Enum:
      return "enum";
    case TokenKind.Symbol_LeftParen:
      return "(";
    case TokenKind.Symbol_RightParen:
      return ")";
    case TokenKind.Symbol_LeftBrace:
      return "{";
    case TokenKind.Symbol_RightBrace:
      return "}";
    case TokenKind.Symbol_LeftBracket:
      return "[";
    case TokenKind.Symbol_RightBracket:
      return "]";
    case TokenKind.Symbol_Colon:
      return ":";
    case TokenKind.Symbol_Semicolon:
      return ";";
    case TokenKind.Symbol_Comma:
      return ",";
    case TokenKind.Symbol_Plus:
      return "+";
    case TokenKind.Symbol_Minus:
      return "-";
    case TokenKind.Symbol_Asterisk:
      return "*";
    case TokenKind.Symbol_FSlash:
      return "/";
    case TokenKind.Symbol_Percent:
      return "%";
    case TokenKind.Symbol_Less:
      return "<";
    case TokenKind.Symbol_LessEq:
      return "<=";
    case TokenKind.Symbol_Greater:
      return ">";
    case TokenKind.Symbol_GreaterEq:
      return ">=";
    case TokenKind.Symbol_Equals:
      return "=";
    case TokenKind.Symbol_Equality:
      return "==";
    case TokenKind.Symbol_NotEquals:
      return "!=";
    case TokenKind.Symbol_Not:
      return "!";
    case TokenKind.Symbol_LogicalAnd:
      return "&&";
    case TokenKind.Symbol_LogicalOr:
      return "||";
    case TokenKind.Symbol_Pipe:
      return "|";
    case TokenKind.Symbol_Ampersand:
      return "&";
    case TokenKind.Symbol_Caret:
      return "^";
    case TokenKind.Symbol_Tilde:
      return "~";
    case TokenKind.Symbol_ShiftLeft:
      return "<<";
    case TokenKind.Symbol_ShiftRight:
      return ">>";
    case TokenKind.Symbol_PlusEquals:
      return "+=";
    case TokenKind.Symbol_MinusEquals:
      return "-=";
    case TokenKind.Symbol_AsteriskEquals:
      return "*=";
    case TokenKind.Symbol_FSlashEquals:
      return "/=";
    case TokenKind.Symbol_PercentEquals:
      return "%=";
    case TokenKind.Symbol_AmpersandEquals:
      return "&=";
    case TokenKind.Symbol_PipeEquals:
      return "|=";
    case TokenKind.Symbol_CaretEquals:
      return "^=";
    case TokenKind.Symbol_ShiftLeftEquals:
      return "<<=";
    case TokenKind.Symbol_ShiftRightEquals:
      return ">>=";
    case TokenKind.Symbol_Increment:
      return "++";
    case TokenKind.Symbol_Decrement:
      return "--";
    case TokenKind.Symbol_Dot:
      return ".";
    case TokenKind.Symbol_Range:
      return "..";
    case TokenKind.Symbol_Ellipsis:
      return "...";
    default:
      return "unknown";
  }
}
function getTokenKind(s) {
  switch (s) {
    case "function":
      return TokenKind.Keyword_Function;
    case "return":
      return TokenKind.Keyword_Return;
    case "const":
      return TokenKind.Keyword_Const;
    case "let":
      return TokenKind.Keyword_Let;
    case "if":
      return TokenKind.Keyword_If;
    case "else":
      return TokenKind.Keyword_Else;
    case "while":
      return TokenKind.Keyword_While;
    case "for":
      return TokenKind.Keyword_For;
    case "switch":
      return TokenKind.Keyword_Switch;
    case "case":
      return TokenKind.Keyword_Case;
    case "default":
      return TokenKind.Keyword_Default;
    case "continue":
      return TokenKind.Keyword_Continue;
    case "break":
      return TokenKind.Keyword_Break;
    case "type":
      return TokenKind.Keyword_Type;
    case "error":
      return TokenKind.Keyword_Error;
    case "as":
      return TokenKind.Keyword_As;
    case "forward":
      return TokenKind.Keyword_Forward;
    case "check":
      return TokenKind.Keyword_Check;
    case "edit":
      return TokenKind.Keyword_Edit;
    case "new":
      return TokenKind.Keyword_New;
    case "clone":
      return TokenKind.Keyword_Clone;
    case "move":
      return TokenKind.Keyword_Move;
    case "unique":
      return TokenKind.Keyword_Unique;
    case "heap":
      return TokenKind.Keyword_Heap;
    case "struct":
      return TokenKind.Keyword_Struct;
    case "union":
      return TokenKind.Keyword_Union;
    case "enum":
      return TokenKind.Keyword_Enum;
    case "true":
    case "false":
      return TokenKind.Kind_BooleanLiteral;
    case "(":
      return TokenKind.Symbol_LeftParen;
    case ")":
      return TokenKind.Symbol_RightParen;
    case "{":
      return TokenKind.Symbol_LeftBrace;
    case "}":
      return TokenKind.Symbol_RightBrace;
    case "[":
      return TokenKind.Symbol_LeftBracket;
    case "]":
      return TokenKind.Symbol_RightBracket;
    case ":":
      return TokenKind.Symbol_Colon;
    case ";":
      return TokenKind.Symbol_Semicolon;
    case ",":
      return TokenKind.Symbol_Comma;
    case "+":
      return TokenKind.Symbol_Plus;
    case "-":
      return TokenKind.Symbol_Minus;
    case "*":
      return TokenKind.Symbol_Asterisk;
    case "/":
      return TokenKind.Symbol_FSlash;
    case "%":
      return TokenKind.Symbol_Percent;
    case "<":
      return TokenKind.Symbol_Less;
    case "<=":
      return TokenKind.Symbol_LessEq;
    case ">":
      return TokenKind.Symbol_Greater;
    case ">=":
      return TokenKind.Symbol_GreaterEq;
    case "=":
      return TokenKind.Symbol_Equals;
    case "==":
      return TokenKind.Symbol_Equality;
    case "!=":
      return TokenKind.Symbol_NotEquals;
    case "!":
      return TokenKind.Symbol_Not;
    case "&&":
      return TokenKind.Symbol_LogicalAnd;
    case "||":
      return TokenKind.Symbol_LogicalOr;
    case "|":
      return TokenKind.Symbol_Pipe;
    case "&":
      return TokenKind.Symbol_Ampersand;
    case "^":
      return TokenKind.Symbol_Caret;
    case "~":
      return TokenKind.Symbol_Tilde;
    case "<<":
      return TokenKind.Symbol_ShiftLeft;
    case ">>":
      return TokenKind.Symbol_ShiftRight;
    case "+=":
      return TokenKind.Symbol_PlusEquals;
    case "-=":
      return TokenKind.Symbol_MinusEquals;
    case "*=":
      return TokenKind.Symbol_AsteriskEquals;
    case "++":
      return TokenKind.Symbol_Increment;
    case "--":
      return TokenKind.Symbol_Decrement;
    case ".":
      return TokenKind.Symbol_Dot;
    case "..":
      return TokenKind.Symbol_Range;
    case "...":
      return TokenKind.Symbol_Ellipsis;
    default:
      return TokenKind.Kind_Identifier;
  }
}

// dist/src/ast/types.js
function Position(line, column, start, end) {
  return {
    line,
    column,
    start,
    end
  };
}
function CreateIdentifier(name, position2) {
  return { name, kind: "identifier", position: position2 };
}
function CreateType(name, value, position2, arrayLengths) {
  return {
    kind: "type",
    name: { name, kind: "identifier" },
    arrayLengths,
    value,
    position: position2
  };
}
var TypeDeclKind;
(function(TypeDeclKind2) {
  TypeDeclKind2[TypeDeclKind2["Alias"] = 0] = "Alias";
  TypeDeclKind2[TypeDeclKind2["Struct"] = 1] = "Struct";
  TypeDeclKind2[TypeDeclKind2["Enum"] = 2] = "Enum";
  TypeDeclKind2[TypeDeclKind2["Union"] = 3] = "Union";
})(TypeDeclKind || (TypeDeclKind = {}));
var TypeValue;
(function(TypeValue2) {
  TypeValue2["Type_Int32"] = "Type_Int32";
  TypeValue2["Type_Int64"] = "Type_Int64";
  TypeValue2["Type_Int16"] = "Type_Int16";
  TypeValue2["Type_Int8"] = "Type_Int8";
  TypeValue2["Type_UInt32"] = "Type_UInt32";
  TypeValue2["Type_UInt64"] = "Type_UInt64";
  TypeValue2["Type_UInt16"] = "Type_UInt16";
  TypeValue2["Type_UInt8"] = "Type_UInt8";
  TypeValue2["Type_IntSize"] = "Type_IntSize";
  TypeValue2["Type_UIntSize"] = "Type_UIntSize";
  TypeValue2["Type_Char"] = "Type_Char";
  TypeValue2["Type_Bool"] = "Type_Bool";
  TypeValue2["Type_String"] = "Type_String";
  TypeValue2["Type_Float32"] = "Type_Float32";
  TypeValue2["Type_Float64"] = "Type_Float64";
  TypeValue2["Type_Owned"] = "Type_Owned";
  TypeValue2["TypeCustom"] = "TypeCustom";
  TypeValue2["TypeGeneric"] = "TypeGeneric";
  TypeValue2["TypeInvalid"] = "TypeInvalid";
})(TypeValue || (TypeValue = {}));

// dist/src/diagnostics/diagnostics.js
var import_fs = require("fs");
function Error2(filepath, kind, position2, message) {
  return {
    filepath,
    kind,
    position: position2,
    message
  };
}
function getLineByNumber(filePath, targetLine) {
  const file = (0, import_fs.readFileSync)(filePath, "utf-8");
  const lines = file.split(/\r?\n/);
  return lines[targetLine - 1];
}
function getColumnIndex(filePath, charIndex) {
  const file = (0, import_fs.readFileSync)(filePath, "utf-8");
  const lineStart = file.lastIndexOf("\n", charIndex - 1) + 1;
  return charIndex - lineStart;
}
var Diagnostics = class {
  fileName;
  errors;
  constructor(fileName) {
    this.fileName = fileName;
    this.errors = [];
  }
  /** Appends an error to the collection. */
  addError(e) {
    this.errors.push(e);
  }
  /**
   * Renders one error as a multi-line, human-readable snippet: the message,
   * the file:line:col location, the offending source line, and a caret run
   * (`^`) underlining the exact span the error covers.
   */
  format(e) {
    const line = getLineByNumber(e.filepath, e.position.line) ?? "";
    const startIndex = Math.max(0, getColumnIndex(e.filepath, e.position.start));
    const requestedLength = Math.max(1, e.position.end - e.position.start);
    const underlineLength = Math.max(1, Math.min(requestedLength, line.length - startIndex || 1));
    return `${e.kind} error: ${e.message}
at ${e.filepath}:${e.position.line}:${e.position.column}
      |
    ${e.position.line} |	${line}
      |	${" ".repeat(startIndex)}${"^".repeat(underlineLength)}`;
  }
};

// dist/src/analysis/analyzer.js
var SymbolKind;
(function(SymbolKind2) {
  SymbolKind2[SymbolKind2["SymbolTypeStructDecl"] = 0] = "SymbolTypeStructDecl";
  SymbolKind2[SymbolKind2["SymbolTypeEnumDecl"] = 1] = "SymbolTypeEnumDecl";
  SymbolKind2[SymbolKind2["SymbolTypeUnionDecl"] = 2] = "SymbolTypeUnionDecl";
  SymbolKind2[SymbolKind2["SymbolTypsAliasDecl"] = 3] = "SymbolTypsAliasDecl";
  SymbolKind2[SymbolKind2["SymbolFuncDecl"] = 4] = "SymbolFuncDecl";
  SymbolKind2[SymbolKind2["SymbolFileConst"] = 5] = "SymbolFileConst";
  SymbolKind2[SymbolKind2["SymbolLocalConst"] = 6] = "SymbolLocalConst";
  SymbolKind2[SymbolKind2["SymbolLocalLet"] = 7] = "SymbolLocalLet";
  SymbolKind2[SymbolKind2["SymbolParameter"] = 8] = "SymbolParameter";
})(SymbolKind || (SymbolKind = {}));
var Flow;
(function(Flow2) {
  Flow2[Flow2["FlowReturns"] = 0] = "FlowReturns";
  Flow2[Flow2["FlowBreaks"] = 1] = "FlowBreaks";
  Flow2[Flow2["FlowContinues"] = 2] = "FlowContinues";
  Flow2[Flow2["FlowErrored"] = 3] = "FlowErrored";
})(Flow || (Flow = {}));
var BlockKind;
(function(BlockKind2) {
  BlockKind2[BlockKind2["FunctionBlock"] = 0] = "FunctionBlock";
  BlockKind2[BlockKind2["IfBlock"] = 1] = "IfBlock";
  BlockKind2[BlockKind2["ForBlock"] = 2] = "ForBlock";
  BlockKind2[BlockKind2["WhileBlock"] = 3] = "WhileBlock";
  BlockKind2[BlockKind2["CaseBlock"] = 4] = "CaseBlock";
  BlockKind2[BlockKind2["SwitchBlock"] = 5] = "SwitchBlock";
})(BlockKind || (BlockKind = {}));

// dist/src/analysis/scope.js
var Scope = class {
  parent;
  //parent scope can be empty for global scope
  symbols;
  methods;
  activeFunction;
  constructor(parent) {
    this.parent = parent;
    this.symbols = /* @__PURE__ */ new Map();
    this.methods = parent?.methods ?? /* @__PURE__ */ new Map();
    this.activeFunction = parent?.activeFunction;
  }
  /** Declares a symbol in this scope. */
  addSymbol(s) {
    this.symbols.set(s.name, s);
  }
  getSymbol(name) {
    let found = this.symbols.get(name);
    if (!found) {
      if (this.parent) {
        found = this.parent.getSymbol(name);
      }
    }
    return found;
  }
  addMethod(typeName, name, signature) {
    const methods = this.methods.get(typeName) ?? /* @__PURE__ */ new Map();
    if (methods.has(name))
      return false;
    methods.set(name, signature);
    this.methods.set(typeName, methods);
    return true;
  }
  getMethod(typeName, name) {
    return this.methods.get(typeName)?.get(name);
  }
  visibleSymbols() {
    const result = /* @__PURE__ */ new Map();
    for (let scope = this; scope; scope = scope.parent) {
      scope.symbols.forEach((symbol, name) => {
        if (!result.has(name))
          result.set(name, symbol);
      });
    }
    return [...result.values()];
  }
};

// dist/src/ast/string_literals.js
function decodeStringLiteral(value) {
  const body = value.slice(1, -1);
  let decoded = "";
  for (let i = 0; i < body.length; i++) {
    const current = body[i];
    if (current != "\\") {
      const codePoint = body.codePointAt(i);
      decoded += String.fromCodePoint(codePoint);
      if (codePoint > 65535)
        i++;
      continue;
    }
    const escaped = body[++i];
    switch (escaped) {
      case "n":
        decoded += "\n";
        break;
      case "r":
        decoded += "\r";
        break;
      case "t":
        decoded += "	";
        break;
      case "0":
        decoded += "\0";
        break;
      case "\\":
        decoded += "\\";
        break;
      case '"':
        decoded += '"';
        break;
      case "'":
        decoded += "'";
        break;
      case "\n":
        break;
      case "u": {
        if (body[i + 1] != "{") {
          decoded += "u";
          break;
        }
        const close = body.indexOf("}", i + 2);
        if (close < 0) {
          decoded += "u";
          break;
        }
        const codePoint = Number.parseInt(body.slice(i + 2, close), 16);
        const validScalar = Number.isInteger(codePoint) && codePoint <= 1114111 && !(codePoint >= 55296 && codePoint <= 57343);
        decoded += validScalar ? String.fromCodePoint(codePoint) : "\uFFFD";
        i = close;
        break;
      }
      case "x": {
        const hex = body.slice(i + 1, i + 3);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          decoded += String.fromCharCode(Number.parseInt(hex, 16));
          i += 2;
        } else {
          decoded += "x";
        }
        break;
      }
      default:
        decoded += escaped ?? "\\";
    }
  }
  return decoded;
}

// dist/src/analysis/type_analyzer.js
var TypeAnalyzer = class {
  diagnostics;
  constructor(diagnostics) {
    this.diagnostics = diagnostics;
  }
  /** Whether a type is the parser's placeholder for an omitted annotation. */
  isInvalidType(t) {
    return t.value == TypeValue.TypeInvalid;
  }
  /** Whether a type still needs symbol-table resolution. */
  isCustomType(t) {
    return t.value == TypeValue.TypeCustom;
  }
  /** Replaces generic placeholders in a type, including its fields and nested arguments. */
  substituteType(type, bindings) {
    if (type.value == TypeValue.TypeGeneric) {
      const binding = bindings.get(type.name.name);
      if (!binding)
        return structuredClone(type);
      const resolved2 = structuredClone(binding);
      if (type.arrayLengths?.length) {
        resolved2.arrayLengths = [
          ...type.arrayLengths,
          ...resolved2.arrayLengths ?? []
        ];
      }
      if (type.slice)
        resolved2.slice = true;
      resolved2.reference = type.reference || resolved2.reference;
      resolved2.edit = type.edit || resolved2.edit;
      return resolved2;
    }
    const resolved = structuredClone(type);
    resolved.typeParameters = type.typeParameters?.map((parameter) => this.substituteType(parameter, bindings));
    resolved.fields = type.fields?.map((field) => ({
      name: field.name,
      type: this.substituteType(field.type, bindings)
    }));
    resolved.unionVariants = type.unionVariants?.map((variant) => this.substituteType(variant, bindings));
    return resolved;
  }
  /** Resolves a primitive type name; unrecognized names remain custom types. */
  resolveTypeValue(t) {
    switch (t.name.name) {
      case "int8":
        return TypeValue.Type_Int8;
      case "int16":
        return TypeValue.Type_Int16;
      case "int32":
        return TypeValue.Type_Int32;
      case "int64":
        return TypeValue.Type_Int64;
      case "uint8":
        return TypeValue.Type_UInt8;
      case "uint16":
        return TypeValue.Type_UInt16;
      case "uint32":
        return TypeValue.Type_UInt32;
      case "uint64":
        return TypeValue.Type_UInt64;
      case "intsize":
        return TypeValue.Type_IntSize;
      case "uintsize":
        return TypeValue.Type_UIntSize;
      case "char":
        return TypeValue.Type_Char;
      case "float32":
        return TypeValue.Type_Float32;
      case "float64":
        return TypeValue.Type_Float64;
      case "bool":
        return TypeValue.Type_Bool;
      case "string":
      case "stringview":
        return TypeValue.Type_String;
      case "owned":
        return TypeValue.Type_Owned;
    }
    return TypeValue.TypeCustom;
  }
  /** Returns whether a type resolves to one of Delta's built-in primitives. */
  isValidPrimitiveType(t) {
    return [
      TypeValue.Type_Int32,
      TypeValue.Type_Int64,
      TypeValue.Type_Int16,
      TypeValue.Type_Int8,
      TypeValue.Type_UInt32,
      TypeValue.Type_UInt64,
      TypeValue.Type_UInt16,
      TypeValue.Type_UInt8,
      TypeValue.Type_IntSize,
      TypeValue.Type_UIntSize,
      TypeValue.Type_Char,
      TypeValue.Type_Float32,
      TypeValue.Type_Float64,
      TypeValue.Type_Bool,
      TypeValue.Type_String
    ].includes(this.resolveTypeValue(t));
  }
  /** Checks both the element type and every static-array dimension. */
  arrayTypesMatch(t1, t2) {
    return this.typesMatch(t1, t2) && this.arrayDimensionsMatch(t1, t2);
  }
  /** Checks only the ordered static-array extents. */
  arrayDimensionsMatch(t1, t2) {
    if (!!t1.slice != !!t2.slice)
      return false;
    const dimensions1 = t1.arrayLengths ?? [];
    const dimensions2 = t2.arrayLengths ?? [];
    return dimensions1.length == dimensions2.length && dimensions1.every((length, index) => length == dimensions2[index]);
  }
  /*
   * Check if t2 ownes a value of type t1
   * e.g. t1 is payload and t2 is owned<payload>
   * */
  isOwnedType(t1, t2) {
    if (t2.value != TypeValue.Type_Owned) {
      return false;
    }
    if (t1.name.name != t2.typeParameters[0]?.name.name) {
      return false;
    }
    return true;
  }
  /** Derives the operational ownership tier transitively through aliases and fields. */
  ownershipTier(t, scope, seen = /* @__PURE__ */ new Set()) {
    if (t.reference)
      return "copyable";
    if (t.value == TypeValue.Type_Owned) {
      const inner = t.typeParameters?.[0];
      return inner && this.ownershipTier(inner, scope, seen) == "unique" ? "unique" : "cloneable";
    }
    if (t.value != TypeValue.TypeCustom)
      return "copyable";
    if (seen.has(t.name.name))
      return "copyable";
    seen.add(t.name.name);
    const symbol = scope.getSymbol(t.name.name);
    if (!symbol)
      return "copyable";
    if (symbol.kind == SymbolKind.SymbolTypsAliasDecl && symbol.type) {
      return this.ownershipTier(symbol.type, scope, seen);
    }
    if (symbol.declaration?.kind == "type_declaration" && symbol.declaration.unique)
      return "unique";
    let tier = "copyable";
    for (const field of symbol.type?.fields ?? t.fields ?? []) {
      const fieldTier = this.ownershipTier(field.type, scope, new Set(seen));
      if (fieldTier == "unique")
        return "unique";
      if (fieldTier == "cloneable")
        tier = "cloneable";
    }
    return tier;
  }
  /**
   * Tests declaration compatibility before conversion rules are considered.
   * `float32` intentionally accepts both float types; custom types compare
   * by name, while resolved primitive types compare by their type value.
   */
  typesMatch(t1, t2) {
    if (!!t1.reference != !!t2.reference || !!t1.edit != !!t2.edit)
      return false;
    if (!!t1.slice != !!t2.slice)
      return false;
    if (this.isOwnedType(t1, t2)) {
      return true;
    }
    if (t1.value == TypeValue.Type_Owned || t2.value == TypeValue.Type_Owned) {
      return t1.value == t2.value && (t1.typeParameters?.length ?? 0) == 1 && (t2.typeParameters?.length ?? 0) == 1 && this.typesMatch(t1.typeParameters[0], t2.typeParameters[0]);
    }
    if (t1.name.name == "float32") {
      return ["float32", "float64"].includes(t2.name.name);
    }
    if (t1.value == TypeValue.TypeGeneric || t2.value == TypeValue.TypeGeneric) {
      return t1.name.name == t2.name.name;
    }
    if ([t1.value, t2.value].includes(TypeValue.TypeCustom)) {
      const typeParameters1 = t1.typeParameters ?? [];
      const typeParameters2 = t2.typeParameters ?? [];
      return t1.name.name == t2.name.name && typeParameters1.length == typeParameters2.length && typeParameters1.every((type, index) => this.typesMatch(type, typeParameters2[index]));
    }
    return t1.value == t2.value;
  }
  isIndirection(t) {
    return t.value == TypeValue.Type_Owned;
  }
  displayName(t) {
    const suffix = t.slice ? "[]" : (t.arrayLengths ?? []).map((length) => `[${length}]`).join("");
    if (this.isIndirection(t)) {
      const arguments_ = t.typeParameters ?? [];
      return `${t.name.name}<${arguments_.map((argument) => this.displayName(argument)).join(", ")}>${suffix}`;
    }
    if (t.typeParameters?.length) {
      return `${t.name.name}<${t.typeParameters.map((argument) => this.displayName(argument)).join(", ")}>${suffix}`;
    }
    return `${t.name.name}${suffix}`;
  }
  /** Whether `t2` is declared as one of union type `t1`'s variants. */
  isUnionVariant(t1, t2) {
    return t1.unionVariants?.map((x) => x.name.name).includes(t2.name.name);
  }
  /**
   * Determines alias compatibility using the scope's type symbols. Enums
   * intentionally behave as aliases of `int32` for declaration checking.
   */
  isAliasOf(t1, t2, scope) {
    if (this.isIndirection(t1) || this.isIndirection(t2)) {
      return this.typesMatch(t1, t2);
    }
    if (!!t1.slice != !!t2.slice)
      return false;
    if ((t1.arrayLengths?.length || t2.arrayLengths?.length) && !this.arrayDimensionsMatch(t1, t2)) {
      return false;
    }
    if (t1.kind == "enum" && t2.value == TypeValue.Type_Int32 || t2.kind == "enum" && t1.value == TypeValue.Type_Int32) {
      return true;
    }
    const canonical = (type) => {
      let name = type.name.name;
      const seen = /* @__PURE__ */ new Set();
      while (!seen.has(name)) {
        seen.add(name);
        const symbol = scope.getSymbol(name);
        if (symbol?.kind != SymbolKind.SymbolTypsAliasDecl || !symbol.type)
          break;
        name = symbol.type.name.name;
      }
      return name;
    };
    if (canonical(t1) != canonical(t2))
      return false;
    const arguments1 = t1.typeParameters ?? [];
    const arguments2 = t2.typeParameters ?? [];
    if (arguments1.length || arguments2.length) {
      return arguments1.length == arguments2.length && arguments1.every((argument, index) => this.typesMatch(argument, arguments2[index]));
    }
    return true;
  }
  /** Whether an expression has the syntactic shape of a negative integer literal. */
  isNegativeInteger(e) {
    return e.kind == "unary_expression" && e.operand.kind == "integer_literal";
  }
  /**
   * Checks an integer literal against the inclusive bounds of `t`. Values
   * are parsed as `bigint` so the 64-bit limits are represented exactly.
   */
  checkIntegerRange(t, literal) {
    const value = BigInt(parseInt(literal.value));
    return this.isInteger(t) && value >= this.getMinIntegerValue(t) && value <= this.getMaxIntegerValue(t);
  }
  /** Returns whether a type is any signed or unsigned integer type. */
  isInteger(t) {
    return t.value.startsWith("Type_Int") || t.value.startsWith("Type_UInt") || t.kind == "enum";
  }
  /** Returns whether a type is of a signed integer . */
  isSignedInteger(t) {
    return t.value.startsWith("Type_Int");
  }
  /** Returns whether a type is a floating-point type (`float32`/`float64`). */
  isFloat(t) {
    return t.value.startsWith("Type_Float");
  }
  /**
   * Returns the bit width of an integer type, for both signed and unsigned
   * variants. `IntSize`/`UIntSize` are pointer-width and reported as 64 to
   * match the 64-bit lowering target. Returns 0 for non-integer types.
   */
  sizeOf(t) {
    if (t.kind == "enum") {
      return 32;
    }
    switch (t.value) {
      case TypeValue.Type_Int8:
      case TypeValue.Type_UInt8:
        return 8;
      case TypeValue.Type_Int16:
      case TypeValue.Type_UInt16:
        return 16;
      case TypeValue.Type_Int32:
      case TypeValue.Type_UInt32:
        return 32;
      case TypeValue.Type_Int64:
      case TypeValue.Type_UInt64:
      case TypeValue.Type_IntSize:
      case TypeValue.Type_UIntSize:
        return 64;
      default:
        return 0;
    }
  }
  /**
   * Returns the maximum representable value for an integer type `t` as a
   * `bigint`, so the 64-bit bounds are exact.
   *
   * `IntSize`/`UIntSize` are treated as 64-bit (the MVP target per §5.14).
   * Returns `0n` for non-integer types.
   */
  getMaxIntegerValue(t) {
    switch (t.value) {
      case TypeValue.Type_Int8:
        return 2n ** 7n - 1n;
      // 127
      case TypeValue.Type_Int16:
        return 2n ** 15n - 1n;
      // 32_767
      case TypeValue.Type_Int32:
        return 2n ** 31n - 1n;
      // 2_147_483_647
      case TypeValue.Type_Int64:
      case TypeValue.Type_IntSize:
        return 2n ** 63n - 1n;
      // 9_223_372_036_854_775_807
      case TypeValue.Type_UInt8:
        return 2n ** 8n - 1n;
      // 255
      case TypeValue.Type_UInt16:
        return 2n ** 16n - 1n;
      // 65_535
      case TypeValue.Type_UInt32:
        return 2n ** 32n - 1n;
      // 4_294_967_295
      case TypeValue.Type_UInt64:
      case TypeValue.Type_UIntSize:
        return 2n ** 64n - 1n;
      // 18_446_744_073_709_551_615
      default:
        return 0n;
    }
  }
  /**
   * Returns the minimum representable value for an integer type `t` as a
   * `bigint`. Unsigned types have a minimum of `0n`; signed types have
   * `-2^(bits-1)`.
   *
   * `IntSize`/`UIntSize` are treated as 64-bit (the MVP target per §5.14).
   * Returns `0n` for non-integer types.
   */
  getMinIntegerValue(t) {
    switch (t.value) {
      case TypeValue.Type_Int8:
        return -(2n ** 7n);
      // -128
      case TypeValue.Type_Int16:
        return -(2n ** 15n);
      // -32_768
      case TypeValue.Type_Int32:
        return -(2n ** 31n);
      // -2_147_483_648
      case TypeValue.Type_Int64:
      case TypeValue.Type_IntSize:
        return -(2n ** 63n);
      // -9_223_372_036_854_775_808
      case TypeValue.Type_UInt8:
      case TypeValue.Type_UInt16:
      case TypeValue.Type_UInt32:
      case TypeValue.Type_UInt64:
      case TypeValue.Type_UIntSize:
        return 0n;
      // unsigned types start at 0
      default:
        return 0n;
    }
  }
};

// dist/src/analysis/expression_analyzer.js
var ExpressionAnalyzer = class {
  diagnostics;
  typeAnalyzer;
  constructor(diagnostics) {
    this.diagnostics = diagnostics;
    this.typeAnalyzer = new TypeAnalyzer(diagnostics);
  }
  /** Returns whether an expression has the requested AST kind. */
  isKind(e, kind) {
    return e.kind == kind;
  }
  /** Infers an expression type and records diagnostics for invalid expressions. */
  analyze(e, scope, expectedType) {
    if (!e) {
      return CreateType("invalid", TypeValue.TypeInvalid);
    }
    let expressionType = this.inferType(e, scope, expectedType);
    expressionType = this.coerceToExpectedSlice(e, expressionType, expectedType, scope);
    e.expressionType = expressionType;
    return expressionType;
  }
  /**
   * Treats an owned expression as its pointee when the surrounding syntax
   * consumes a value rather than the owning handle. Codegen uses the marker
   * to insert the corresponding pointer reads.
   */
  dereferenceOwnedValue(e, type) {
    let valueType = type;
    let depth = 0;
    while (valueType.value == TypeValue.Type_Owned && valueType.typeParameters?.[0]) {
      valueType = valueType.typeParameters[0];
      depth++;
    }
    if (depth > 0)
      e.implicitDereference = depth;
    return valueType;
  }
  /** Infers the type returned by {@link analyze} before it is stored on the expression. */
  inferType(e, scope, expectedType) {
    switch (e.kind) {
      case "identifier":
        const s = scope.getSymbol(e.name);
        if (!s) {
          this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.position, "unknown identifier: use of undeclared name `" + e.name + "`"));
          return CreateType("invalid", TypeValue.TypeInvalid);
        }
        if (s.pendingResult) {
          this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.position, `binding \`${s.name}\` is pending from \`as ${s.pendingResult}\`; check or forward the result before reading it`));
          return CreateType("invalid", TypeValue.TypeInvalid);
        }
        if (s.moved == "moved" || s.moved == "maybe") {
          this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.position, s.moved == "maybe" ? `\`${s.name}\` may have been moved on some paths and cannot be used here` : `\`${s.name}\` has been moved and cannot be used`));
          return CreateType("invalid", TypeValue.TypeInvalid);
        }
        if (s.kind == SymbolKind.SymbolTypeEnumDecl) {
          return s.type;
        }
        if (!s.assigned && s.kind != SymbolKind.SymbolParameter && !s.type?.arrayLengths?.length) {
          this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.position, "binding " + s.name + " is uninitialized and hence cannot be used here"));
          return CreateType("invalid", TypeValue.TypeInvalid);
        }
        if (s.type?.value == TypeValue.TypeCustom && !s.type.fields && !s.type.typeParameters?.length) {
          const typeSym = scope.getSymbol(s.type.name.name);
          if (!typeSym) {
            return CreateType("invalid", TypeValue.TypeInvalid);
          }
          const resolved = structuredClone(typeSym.type);
          resolved.reference = s.type.reference;
          resolved.edit = s.type.edit;
          return resolved;
        }
        return s.type;
      case "integer_literal":
        return CreateType("int32", TypeValue.Type_Int32);
      case "float_literal":
        return CreateType("float64", TypeValue.Type_Float64);
      case "boolean_literal":
        return CreateType("bool", TypeValue.Type_Bool);
      case "string_literal":
        return CreateType("string", TypeValue.Type_String);
      case "move_expression":
        return this.analyzeMoveExpression(e, scope);
      case "clone_expression":
        return this.analyzeCloneExpression(e, scope);
      case "new_expression":
        const innerType = this.analyze(e.expression, scope);
        let ownedType = CreateType("owned", TypeValue.Type_Owned);
        ownedType.typeParameters = [innerType];
        return ownedType;
      case "function_call_expression":
        return this.analyzeFunctionCallExpression(scope, e) ?? CreateType("invalid", TypeValue.TypeInvalid);
      case "binary_expression":
        return this.analyzeBinaryExpression(scope, e) ?? CreateType("invalid", TypeValue.TypeInvalid);
      case "unary_expression":
        return this.analyzeUnaryExpression(scope, e) ?? CreateType("invalid", TypeValue.TypeInvalid);
      case "char_literal":
        return CreateType("char", TypeValue.Type_Char);
      case "object_literal":
        return this.analyzeObjectLiteral(e, scope);
      case "member_access_expression":
        e.receiverType = this.analyze(e.receiver, scope);
        return this.analyzeMemberAccessExpression(e, scope) ?? CreateType("invalid", TypeValue.TypeInvalid);
      case "array_literal_expression":
        return this.analyzeArrayLiteralExpression(e, scope, expectedType);
      case "index_expression":
        return this.analyzeIndexExpression(e, scope);
      default:
        return CreateType("invalid", TypeValue.TypeInvalid);
    }
  }
  analyzeMoveExpression(e, scope) {
    if (e.source.kind != "identifier") {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.position, "move requires a whole mutable binding, not a field, borrow, or temporary"));
      return CreateType("invalid", TypeValue.TypeInvalid);
    }
    const symbol = scope.getSymbol(e.source.name);
    if (!symbol)
      return this.analyze(e.source, scope);
    if (!symbol.assigned) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.position, `binding ${symbol.name} is uninitialized and cannot be moved`));
      return CreateType("invalid", TypeValue.TypeInvalid);
    }
    if (symbol.moved == "moved" || symbol.moved == "maybe")
      return this.analyze(e.source, scope);
    if ([SymbolKind.SymbolLocalConst, SymbolKind.SymbolFileConst].includes(symbol.kind)) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.position, `const symbol ${symbol.name} cannot be moved`));
      return CreateType("invalid", TypeValue.TypeInvalid);
    }
    if (symbol.type?.reference) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.position, `${symbol.name} is a borrowed reference and cannot be moved`));
      return CreateType("invalid", TypeValue.TypeInvalid);
    }
    symbol.moved = "moved";
    symbol.movePosition = e.position;
    return symbol.type ?? CreateType("invalid", TypeValue.TypeInvalid);
  }
  analyzeCloneExpression(e, scope) {
    const sourceType = this.analyze(e.source, scope);
    if (sourceType.value == TypeValue.TypeInvalid)
      return sourceType;
    const valueType = { ...sourceType, reference: false, edit: false };
    if (this.typeAnalyzer.ownershipTier(valueType, scope) == "unique") {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.position, `expression of type ${valueType.name.name} is unique and cannot be cloned`));
      return CreateType("invalid", TypeValue.TypeInvalid);
    }
    return valueType;
  }
  analyzeIndexExpression(e, scope) {
    const expr = e;
    const receiverType = structuredClone(this.dereferenceOwnedValue(expr.receiver, this.analyze(expr.receiver, scope)));
    if (receiverType.value == TypeValue.TypeInvalid)
      return receiverType;
    const arrayLength = receiverType.arrayLengths?.[0];
    if (arrayLength === void 0 && !receiverType.slice) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.position, "cannot access index, receiver expression resolves to a non-array binding"));
      return CreateType("invalid", TypeValue.TypeInvalid);
    }
    const indexType = this.analyze(expr.index, scope);
    if (indexType.value == TypeValue.TypeInvalid)
      return indexType;
    const idxTypeValue = indexType.value;
    const contextualIntegerLiteral = expr.index.kind == "integer_literal";
    if (idxTypeValue != TypeValue.Type_UIntSize && !contextualIntegerLiteral) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", expr.index.position, "array index must have type uintsize"));
      return CreateType("invalid", TypeValue.TypeInvalid);
    }
    if (arrayLength !== void 0 && expr.index.kind == "integer_literal" && parseInt(expr.index.value) >= arrayLength) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", expr.index.position, "cannot access index out of array bounds"));
      return CreateType("invalid", TypeValue.TypeInvalid);
    }
    if (expr.index.kind == "identifier") {
      const symbol = scope.getSymbol(expr.index.name);
      if (!symbol) {
        this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", expr.index.position, "unknown identifier: " + expr.index.name));
        return CreateType("invalid", TypeValue.TypeInvalid);
      }
      if (!!symbol.value && symbol.value.kind == "integer_literal") {
        const indexValue = parseInt(symbol.value.value);
        if (arrayLength !== void 0 && indexValue >= arrayLength) {
          this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", expr.index.position, "cannot access index out of array bounds"));
          return CreateType("invalid", TypeValue.TypeInvalid);
        }
      }
    }
    if (receiverType.slice) {
      receiverType.slice = false;
      receiverType.reference = false;
      receiverType.edit = false;
    } else {
      receiverType.arrayLengths = receiverType.arrayLengths?.slice(1);
      if (receiverType.arrayLengths?.length == 0) {
        delete receiverType.arrayLengths;
      }
    }
    return receiverType;
  }
  analyzeArrayLiteralExpression(e, scope, expectedType) {
    const expr = e;
    const expectedSlice = expectedType?.slice && !expectedType.reference ? { ...structuredClone(expectedType), reference: false, edit: false } : void 0;
    if (expectedSlice) {
      const elementType = {
        ...structuredClone(expectedSlice),
        slice: false,
        arrayLengths: void 0,
        reference: false,
        edit: false
      };
      for (const element of expr.elements) {
        let actualType = this.analyze(element, scope, elementType);
        if (element.kind == "integer_literal" && this.typeAnalyzer.isInteger(elementType) && this.typeAnalyzer.isInteger(actualType) && this.typeAnalyzer.checkIntegerRange(elementType, element)) {
          actualType = structuredClone(elementType);
          element.expressionType = actualType;
        }
        if (!this.typeAnalyzer.typesMatch(elementType, actualType) && !this.typeAnalyzer.isAliasOf(elementType, actualType, scope)) {
          this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", element.position, `invalid type for slice element, want ${this.typeAnalyzer.displayName(elementType)}, got ${this.typeAnalyzer.displayName(actualType)}`));
          return CreateType("invalid", TypeValue.TypeInvalid);
        }
      }
      const sourceType = structuredClone(elementType);
      sourceType.arrayLengths = [expr.elements.length];
      e.sliceConversion = {
        sourceType,
        targetType: structuredClone(expectedSlice)
      };
      return expectedSlice;
    }
    if (expr.elements.length == 0) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.position, "cannot infer the element type of an empty array literal; add a slice annotation such as `T[]`"));
      return CreateType("invalid", TypeValue.TypeInvalid);
    }
    const firstElement = expr.elements[0];
    if (!firstElement) {
      return CreateType("invalid", TypeValue.TypeInvalid);
    }
    let firstElementType = structuredClone(this.analyze(firstElement, scope));
    if (firstElementType.value == TypeValue.TypeInvalid)
      return firstElementType;
    for (const element of expr.elements.slice(1)) {
      const elementT = this.analyze(element, scope);
      if (elementT.value == TypeValue.TypeInvalid)
        return elementT;
      if (!this.typeAnalyzer.arrayTypesMatch(elementT, firstElementType)) {
        this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", element.position, `invalid type for array element, want ${firstElementType.name.name}, got ${elementT.name.name}`));
        return CreateType("invalid", TypeValue.TypeInvalid);
      }
    }
    firstElementType.arrayLengths = [
      expr.elements.length,
      ...firstElementType.arrayLengths ?? []
    ];
    return firstElementType;
  }
  /** Applies the implicit fixed-array-to-slice view conversion in a typed value context. */
  coerceToExpectedSlice(expression, actualType, expectedType, scope) {
    if (!expectedType?.slice || expectedType.reference || actualType.value == TypeValue.TypeInvalid || actualType.slice) {
      return actualType;
    }
    if (actualType.arrayLengths?.length != 1)
      return actualType;
    const expectedElement = {
      ...structuredClone(expectedType),
      slice: false,
      arrayLengths: void 0,
      reference: false,
      edit: false
    };
    const actualElement = {
      ...structuredClone(actualType),
      slice: false,
      arrayLengths: void 0,
      reference: false,
      edit: false
    };
    if (!this.typeAnalyzer.typesMatch(expectedElement, actualElement) && !this.typeAnalyzer.isAliasOf(expectedElement, actualElement, scope)) {
      return actualType;
    }
    const targetType = {
      ...structuredClone(expectedType),
      reference: false,
      edit: false
    };
    expression.sliceConversion = {
      sourceType: structuredClone(actualType),
      targetType: structuredClone(targetType)
    };
    return targetType;
  }
  /** Infers the concrete element type represented by a wrapped generic such as `T[]`. */
  inferGenericArgument(template, valueType) {
    const inferred = structuredClone(valueType);
    if (template.slice) {
      if (!valueType.slice)
        return;
      inferred.slice = false;
    }
    const templateDimensions = template.arrayLengths ?? [];
    const valueDimensions = valueType.arrayLengths ?? [];
    if (templateDimensions.length && !templateDimensions.every((length, dimension) => valueDimensions[dimension] == length)) {
      return;
    }
    if (templateDimensions.length) {
      const remainingDimensions = valueDimensions.slice(templateDimensions.length);
      inferred.arrayLengths = remainingDimensions.length ? remainingDimensions : void 0;
    }
    inferred.reference = false;
    inferred.edit = false;
    return inferred;
  }
  /**
   * Analyzes an object literal against its declared struct and returns its
   * resolved type. Every required field must appear once, no unknown fields
   * are allowed, and each value must match the corresponding field type.
   */
  analyzeObjectLiteral(e, scope) {
    const typeSym = scope.getSymbol(e.type.name.name);
    if (!typeSym) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.type.name.position ?? e.type.position ?? e.position, "unknown type identifier: " + e.type.name.name));
      return CreateType("invalid", TypeValue.TypeInvalid);
    }
    let targetSym = typeSym;
    const seenAliases = /* @__PURE__ */ new Set();
    while (targetSym.kind == SymbolKind.SymbolTypsAliasDecl && targetSym.type && !seenAliases.has(targetSym.name)) {
      seenAliases.add(targetSym.name);
      const next2 = scope.getSymbol(targetSym.type.name.name);
      if (!next2)
        break;
      targetSym = next2;
    }
    const target = structuredClone(targetSym.type);
    target.name = structuredClone(e.type.name);
    e.type = target;
    const supplied = /* @__PURE__ */ new Set();
    const concreteTypesMap = /* @__PURE__ */ new Map();
    const inferGenericFieldArgument = (template, valueType) => {
      const inferred = structuredClone(valueType);
      if (template.slice) {
        if (!valueType.slice)
          return;
        inferred.slice = false;
      }
      const templateDimensions = template.arrayLengths ?? [];
      const valueDimensions = valueType.arrayLengths ?? [];
      if (templateDimensions.length && !templateDimensions.every((length, dimension) => valueDimensions[dimension] == length)) {
        return;
      }
      if (templateDimensions.length) {
        const remainingDimensions = valueDimensions.slice(templateDimensions.length);
        inferred.arrayLengths = remainingDimensions.length ? remainingDimensions : void 0;
      }
      inferred.reference = false;
      inferred.edit = false;
      return inferred;
    };
    const provide = (name, haveT, namePosition, valuePosition = namePosition) => {
      if (supplied.has(name)) {
        this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", namePosition, "duplicate field(s) in object literal: " + name));
        return false;
      }
      const field = target.fields?.find((candidate) => candidate.name.name == name);
      if (!field) {
        this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", namePosition, "unknown fields in object literal: " + name));
        return false;
      }
      let wantT = field.type;
      if (wantT.value == TypeValue.TypeGeneric) {
        const index = target.typeParameters?.findIndex((parameter) => parameter.name.name == wantT.name.name) ?? -1;
        const inferredArgument = inferGenericFieldArgument(field.type, haveT);
        let genericArgument = e.genericTypes?.[index] ?? inferredArgument;
        if (genericArgument?.value == TypeValue.TypeCustom && inferredArgument?.value == TypeValue.TypeGeneric && genericArgument.name.name == inferredArgument.name.name) {
          genericArgument = inferredArgument;
        }
        if (genericArgument) {
          wantT = this.typeAnalyzer.substituteType(field.type, /* @__PURE__ */ new Map([[field.type.name.name, genericArgument]]));
        }
        e.genericTypes ??= [];
        if (index >= 0 && genericArgument)
          e.genericTypes[index] = genericArgument;
        if (genericArgument && genericArgument.value != TypeValue.TypeGeneric) {
          concreteTypesMap.set(field.type.name.name, [genericArgument]);
        }
      }
      if (!this.typeAnalyzer.arrayTypesMatch(haveT, wantT) && !this.typeAnalyzer.isAliasOf(wantT, haveT, scope)) {
        this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", valuePosition, `value of member ${name} does not match the required type, want ${this.typeAnalyzer.displayName(wantT)}, got ${this.typeAnalyzer.displayName(haveT)}`));
        return false;
      }
      supplied.add(name);
      return true;
    };
    for (const element of e.elements) {
      if (element.kind == "spread_element") {
        const spreadT = this.analyze(element.source, scope);
        if (spreadT.value == TypeValue.TypeInvalid)
          return spreadT;
        const resolvedSpread = spreadT.fields ? spreadT : scope.getSymbol(spreadT.name.name)?.type;
        if (!resolvedSpread?.fields) {
          this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", element.position, `cannot spread non-record type ${spreadT.name.name}`));
          return CreateType("invalid", TypeValue.TypeInvalid);
        }
        for (const field2 of resolvedSpread.fields) {
          if (!provide(field2.name.name, field2.type, element.position))
            return CreateType("invalid", TypeValue.TypeInvalid);
        }
        continue;
      }
      const field = target.fields?.find((candidate) => candidate.name.name == element.field.name.name);
      if (element.field.value.kind == "object_literal" && field && !element.field.value.type.name.name) {
        element.field.value.type = structuredClone(field.type);
      }
      let haveT = this.analyze(element.field.value, scope, field?.type);
      if (haveT.value == TypeValue.TypeInvalid)
        return haveT;
      if (field && this.typeAnalyzer.isIndirection(field.type) && element.field.value.kind == "identifier" && this.typeAnalyzer.isIndirection(haveT)) {
        const source = scope.getSymbol(element.field.value.name);
        const directAllocation = source?.declaration?.kind == "variable_declaration_statement" && source.declaration.value?.kind == "new_expression";
        if (!directAllocation) {
          this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", element.field.value.position, `owned field ${element.field.name.name} requires move or a direct-new staging owner`));
          return CreateType("invalid", TypeValue.TypeInvalid);
        }
        element.field.value.ownershipTransfer = true;
        source.moved = "moved";
        source.movePosition = element.field.value.position;
      }
      if (element.field.value.kind == "new_expression" && field && this.typeAnalyzer.isIndirection(field.type)) {
        const expectedInner = field.type.typeParameters?.[0];
        const actualInner = haveT.typeParameters?.[0];
        if (expectedInner && actualInner && (this.typeAnalyzer.typesMatch(expectedInner, actualInner) || this.typeAnalyzer.isAliasOf(expectedInner, actualInner, scope))) {
          haveT = structuredClone(field.type);
          element.field.value.expressionType = haveT;
        }
      }
      if (!provide(element.field.name.name, haveT, element.position, element.field.value.position))
        return CreateType("invalid", TypeValue.TypeInvalid);
    }
    const missing = (target.fields ?? []).map((field) => field.name.name).filter((name) => !supplied.has(name));
    if (missing.length) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.position, "missing field(s) in object literal: " + missing.join(", ")));
      return CreateType("invalid", TypeValue.TypeInvalid);
    }
    e.concreteTypeMap = concreteTypesMap;
    const genericBindings = /* @__PURE__ */ new Map();
    (target.typeParameters ?? []).forEach((parameter, index) => {
      const argument = e.genericTypes?.[index];
      if (argument)
        genericBindings.set(parameter.name.name, argument);
    });
    e.type = this.typeAnalyzer.substituteType(target, genericBindings);
    e.type.name = structuredClone(target.name);
    e.type.typeParameters = e.genericTypes;
    const structDeclaration = targetSym.declaration;
    if (structDeclaration?.kind == "type_declaration" && structDeclaration.declKind == TypeDeclKind.Struct) {
      const struct = structDeclaration.declaration;
      struct.concreteTypesMap ??= /* @__PURE__ */ new Map();
      for (const [genericName, concreteTypes] of concreteTypesMap) {
        const recordedTypes = struct.concreteTypesMap.get(genericName) ?? [];
        for (const concreteType of concreteTypes) {
          if (concreteType.value == TypeValue.TypeGeneric)
            continue;
          if (!recordedTypes.some((recordedType) => this.typeAnalyzer.typesMatch(recordedType, concreteType))) {
            recordedTypes.push(concreteType);
          }
        }
        struct.concreteTypesMap.set(genericName, recordedTypes);
      }
    }
    return e.type;
  }
  /**
   * Resolves a member access on a struct or enum. Union members cannot be
   * accessed directly; enum members evaluate to `int32`.
   */
  analyzeMemberAccessExpression(e, scope) {
    let receiverT = e.receiverType;
    if (receiverT.value == TypeValue.TypeInvalid)
      return receiverT;
    if (receiverT.value == TypeValue.Type_Owned) {
      receiverT = receiverT.typeParameters[0];
    }
    if (receiverT.value == TypeValue.TypeCustom && !receiverT.fields) {
      const typeSymbol = scope.getSymbol(receiverT.name.name);
      if (typeSymbol?.type) {
        const arrayLengths = receiverT.arrayLengths;
        const slice = receiverT.slice;
        const declaredTypeParameters = typeSymbol.type.typeParameters ?? [];
        const bindings = /* @__PURE__ */ new Map();
        declaredTypeParameters.forEach((parameter, index) => {
          const typeArgument = receiverT.typeParameters?.[index];
          if (typeArgument) {
            bindings.set(parameter.name.name, typeArgument);
          }
        });
        receiverT = this.typeAnalyzer.substituteType(typeSymbol.type, bindings);
        receiverT.arrayLengths = arrayLengths ?? receiverT.arrayLengths;
        receiverT.slice = slice ?? receiverT.slice;
      }
    }
    if (receiverT.kind == "union") {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.receiver.position, "cannot access member of union " + receiverT.name.name));
      return;
    }
    if (receiverT.kind == "enum") {
      const memberT2 = receiverT.variants?.find((x) => x.name.name == e.member.name);
      if (!memberT2) {
        this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.member.position ?? e.position, `enum ${receiverT.name.name} has no variant \`${e.member.name}\``));
        return;
      }
      e.enumMember = true;
      return CreateType("int32", TypeValue.Type_Int32);
    }
    if (receiverT.arrayLengths?.length && e.member.name == "length") {
      return CreateType("uintsize", TypeValue.Type_UIntSize);
    }
    if (receiverT.slice && ["length", "size"].includes(e.member.name)) {
      return CreateType("uintsize", TypeValue.Type_UIntSize);
    }
    if (receiverT.value == TypeValue.Type_String && e.member.name == "length") {
      return CreateType("uintsize", TypeValue.Type_UIntSize);
    }
    const memberT = receiverT.fields?.find((x) => x.name.name == e.member.name);
    if (!memberT) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.member.position ?? e.position, `type ${receiverT.name.name} has no member \`${e.member.name}\``));
      return;
    }
    return structuredClone(memberT.type);
  }
  /**
   * Infers a unary expression's operand type and validates its operator.
   * `!` needs `bool`; `-` and `~` reject `bool`; `++` and `--` require a
   * mutable integer binding.
   */
  analyzeUnaryExpression(scope, e) {
    const unaryExpr = e;
    const operandT = this.dereferenceOwnedValue(unaryExpr.operand, this.analyze(unaryExpr.operand, scope));
    unaryExpr.type = operandT.name.name;
    if (operandT.value == TypeValue.TypeInvalid)
      return operandT;
    if (unaryExpr.operator == string(TokenKind.Symbol_Not)) {
      if (operandT.value != TypeValue.Type_Bool) {
        this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.position, `unary operation '!' expects a bool operand, found \`${operandT.name.name}\``));
        return;
      }
    }
    if ([string(TokenKind.Symbol_Minus), string(TokenKind.Symbol_Tilde)].includes(unaryExpr.operator) && operandT.value == TypeValue.Type_Bool) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.position, `unary operation \`${unaryExpr.operator}\` expects a numeric operand such as int32, found bool`));
      return;
    }
    if ([string(TokenKind.Symbol_Increment), string(TokenKind.Symbol_Decrement)].includes(unaryExpr.operator)) {
      const operandTValue = operandT.value;
      if (!operandTValue.startsWith("Type_Int") && !operandTValue.startsWith("Type_UInt")) {
        this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.position, "operand must be an integer binding"));
        return;
      }
      if (unaryExpr.operand.kind == "identifier") {
        const symbol = scope.getSymbol(unaryExpr.operand.name);
        if (!symbol) {
          this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.position, "unknown symbol: " + unaryExpr.operand.name));
          return;
        }
        if (symbol.kind == SymbolKind.SymbolLocalConst || symbol.kind == SymbolKind.SymbolFileConst) {
          this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.position, "cannot modify const binding " + unaryExpr.operand.name));
          return;
        }
      }
    }
    return operandT;
  }
  /** Returns whether an expression is an integer literal. */
  isIntegerLiteral(x) {
    return x.kind == "integer_literal";
  }
  /** Returns whether an expression is a floating-point literal. */
  isFloatLiteral(x) {
    return x.kind == "float_literal";
  }
  /** Resolves a string expression whose complete value is known during analysis. */
  constantStringValue(expression, scope, seen = /* @__PURE__ */ new Set()) {
    if (expression.kind == "string_literal") {
      return decodeStringLiteral(expression.value);
    }
    if (expression.kind == "binary_expression" && expression.operator == "+") {
      if (expression.constantStringValue !== void 0) {
        return expression.constantStringValue;
      }
      const left = this.constantStringValue(expression.left, scope, new Set(seen));
      const right = this.constantStringValue(expression.right, scope, new Set(seen));
      return left !== void 0 && right !== void 0 ? left + right : void 0;
    }
    if (expression.kind != "identifier" || seen.has(expression.name)) {
      return;
    }
    const symbol = scope.getSymbol(expression.name);
    if (!symbol?.value || ![SymbolKind.SymbolLocalConst, SymbolKind.SymbolFileConst].includes(symbol.kind)) {
      return;
    }
    seen.add(expression.name);
    return this.constantStringValue(symbol.value, scope, seen);
  }
  /**
   * Validates a binary expression. Comparisons produce `bool`; other
   * operators produce the shared operand type when their operands match.
   */
  analyzeBinaryExpression(scope, e) {
    const binaryExpr = e;
    const leftT = this.dereferenceOwnedValue(binaryExpr.left, this.analyze(binaryExpr.left, scope));
    const rightT = this.dereferenceOwnedValue(binaryExpr.right, this.analyze(binaryExpr.right, scope));
    binaryExpr.types = {
      leftT: leftT.name.name,
      rightT: rightT.name.name
    };
    if ([leftT.value, rightT.value].includes(TypeValue.TypeInvalid))
      return CreateType("invalid", TypeValue.TypeInvalid);
    const operator = binaryExpr.operator;
    const logical = ["&&", "||"].includes(operator);
    const equality = ["==", "!="].includes(operator);
    const ordered = ["<", "<=", ">", ">="].includes(operator);
    const arithmetic = ["+", "-", "*", "/", "%"].includes(operator);
    const bitwise = ["&", "|", "^", "<<", ">>"].includes(operator);
    const literalCompatible = (this.isIntegerLiteral(binaryExpr.left) || this.isIntegerLiteral(binaryExpr.right)) && this.typeAnalyzer.isInteger(leftT) && this.typeAnalyzer.isInteger(rightT) || (this.isFloatLiteral(binaryExpr.left) || this.isFloatLiteral(binaryExpr.right)) && this.typeAnalyzer.isFloat(leftT) && this.typeAnalyzer.isFloat(rightT);
    const matches = this.typeAnalyzer.typesMatch(leftT, rightT) || literalCompatible || this.typeAnalyzer.isAliasOf(leftT, rightT, scope) || this.typeAnalyzer.isAliasOf(rightT, leftT, scope);
    const fail = (message) => {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.position, message));
      return;
    };
    if (operator == "+" && leftT.value == TypeValue.Type_String && rightT.value == TypeValue.Type_String) {
      const left = this.constantStringValue(binaryExpr.left, scope);
      const right = this.constantStringValue(binaryExpr.right, scope);
      if (left === void 0 || right === void 0) {
        return fail("runtime string concatenation requires owned storage; use dynamicstring.concat(...) instead");
      }
      binaryExpr.constantStringValue = left + right;
      return CreateType("string", TypeValue.Type_String);
    }
    if (logical) {
      if (leftT.value != TypeValue.Type_Bool || rightT.value != TypeValue.Type_Bool) {
        return fail(`binary operation \`${operator}\` expects bool operands, found \`${leftT.name.name}\`, and \`${rightT.name.name}\``);
      }
      return CreateType("bool", TypeValue.Type_Bool);
    }
    if (equality) {
      if (!matches || leftT.value == TypeValue.Type_String || leftT.value == TypeValue.TypeCustom && leftT.kind != "enum") {
        return fail(`binary operation \`${operator}\` cannot be compared with mismatched operand types \`${leftT.name.name}\` and \`${rightT.name.name}\``);
      }
      return CreateType("bool", TypeValue.Type_Bool);
    }
    if (ordered) {
      const orderable = this.typeAnalyzer.isInteger(leftT) || this.typeAnalyzer.isFloat(leftT) || leftT.value == TypeValue.Type_Char || leftT.kind == "enum";
      if (!matches || !orderable)
        return fail(`operand types \`${leftT.name.name}\` and \`${rightT.name.name}\` cannot be compared with \`${operator}\``);
      return CreateType("bool", TypeValue.Type_Bool);
    }
    if (arithmetic) {
      const numeric = this.typeAnalyzer.isInteger(leftT) && this.typeAnalyzer.isInteger(rightT) || this.typeAnalyzer.isFloat(leftT) && this.typeAnalyzer.isFloat(rightT);
      if (!matches || !numeric)
        return fail(`binary operation \`${operator}\` expects matching numeric operands, found \`${leftT.name.name}\`, and \`${rightT.name.name}\``);
      return leftT;
    }
    if (bitwise) {
      if (!matches || !this.typeAnalyzer.isInteger(leftT) || !this.typeAnalyzer.isInteger(rightT)) {
        return fail(`binary operation \`${operator}\` expects matching integer operands, found \`${leftT.name.name}\`, and \`${rightT.name.name}\``);
      }
      return leftT;
    }
    return fail(`unknown binary operator \`${operator}\``);
  }
  /**
   * Resolves a function call and checks its argument count and types. When
   * no function symbol exists, a primitive-named callee is treated as a
   * conversion and returns the converted type.
   */
  analyzeFunctionCallExpression(scope, e) {
    if (e.callee.kind == "member_access_expression") {
      return this.analyzeMethodCall(scope, e, e.callee);
    }
    const calleeName = e.callee.kind == "identifier" ? e.callee.name : "";
    const sym = calleeName ? scope.getSymbol(calleeName) : void 0;
    if (sym) {
      if (!sym.signature) {
        this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.position, sym.name + " is not callable"));
        return CreateType("invalid", TypeValue.TypeInvalid);
      }
      const paramCount = sym.signature.parameters.length;
      const argCount = e.arguments.length;
      e.resolvedParameterTypes = sym.signature.parameters.map((parameter) => parameter.type);
      let concreteTypesMap = /* @__PURE__ */ new Map();
      const typeParameters = sym.signature.typeParameters ?? [];
      const genericTypes = e.genericTypes ??= [];
      if (paramCount != argCount) {
        this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.position, `function ${sym.name} expects ${paramCount} arguments, found ${argCount}`));
        return CreateType("invalid", TypeValue.TypeInvalid);
      }
      const borrowUses = /* @__PURE__ */ new Map();
      e.arguments.forEach((argument2, index) => {
        const parameter = sym.signature?.parameters[index]?.type;
        if (!parameter?.reference)
          return;
        const root = this.rootIdentifier(argument2);
        if (!root)
          return;
        const use = borrowUses.get(root) ?? { count: 0, edit: false };
        use.count++;
        use.edit ||= !!parameter.edit;
        borrowUses.set(root, use);
      });
      for (const [root, use] of borrowUses) {
        if (use.edit && use.count > 1) {
          this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.position, `cannot borrow ${root} as edit & while it is also borrowed elsewhere in the same call; a mutable borrow must be exclusive`));
        }
      }
      e.arguments.forEach((x, i) => {
        const parameterTemplate = sym.signature?.parameters[i]?.type;
        let wantT2 = parameterTemplate;
        if (parameterTemplate?.value == TypeValue.TypeGeneric) {
          const typeIndex = typeParameters.findIndex((typeParameter) => typeParameter.name.name == parameterTemplate.name.name);
          const explicitType = genericTypes[typeIndex];
          if (explicitType) {
            wantT2 = this.typeAnalyzer.substituteType(parameterTemplate, /* @__PURE__ */ new Map([[parameterTemplate.name.name, explicitType]]));
          }
        }
        if (x.kind == "object_literal" && wantT2 && !x.type.name.name)
          x.type = structuredClone(wantT2);
        let argT2 = this.analyze(x, scope, wantT2);
        if (argT2.value == TypeValue.TypeInvalid)
          return;
        if (wantT2?.value == TypeValue.TypeCustom && wantT2.typeParameters?.length) {
          wantT2.typeParameters.forEach((typeArgument, argumentIndex) => {
            if (typeArgument.value != TypeValue.TypeGeneric) {
              return;
            }
            const inferredType = argT2.typeParameters?.[argumentIndex];
            if (!inferredType) {
              return;
            }
            const typeIndex = typeParameters.findIndex((typeParameter) => typeParameter.name.name == typeArgument.name.name);
            genericTypes[typeIndex] ??= inferredType;
            concreteTypesMap.set(typeArgument.name.name, [genericTypes[typeIndex]]);
          });
        }
        if (parameterTemplate?.value == TypeValue.TypeGeneric) {
          const typeIndex = typeParameters.findIndex((typeParameter) => typeParameter.name.name == parameterTemplate.name.name);
          let concreteType = genericTypes[typeIndex];
          if (!concreteType) {
            concreteType = this.inferGenericArgument(parameterTemplate, argT2);
            if (concreteType)
              genericTypes[typeIndex] = concreteType;
          }
          if (concreteType) {
            wantT2 = this.typeAnalyzer.substituteType(parameterTemplate, /* @__PURE__ */ new Map([[parameterTemplate.name.name, concreteType]]));
          }
          if (concreteType) {
            if (concreteTypesMap.has(parameterTemplate.name.name)) {
              concreteTypesMap.get(parameterTemplate.name.name)?.push(concreteType);
            } else {
              concreteTypesMap.set(parameterTemplate.name.name, [concreteType]);
            }
          }
        }
        if (wantT2?.value == TypeValue.TypeCustom) {
          const typeSymbol = scope.getSymbol(wantT2.name.name);
          if (!typeSymbol) {
            this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", x.position, "unknown type identifier: " + wantT2.name.name));
            return;
          }
          if (!typeSymbol.type) {
            return;
          }
          const bindings = /* @__PURE__ */ new Map();
          typeSymbol.type.typeParameters?.forEach((typeParameter, index) => {
            let typeArgument = wantT2?.typeParameters?.[index];
            if (typeArgument?.value == TypeValue.TypeGeneric) {
              const genericIndex = typeParameters.findIndex((parameter) => parameter.name.name == typeArgument?.name.name);
              typeArgument = genericTypes[genericIndex];
            }
            if (typeArgument) {
              bindings.set(typeParameter.name.name, typeArgument);
            }
          });
          wantT2 = this.typeAnalyzer.substituteType(typeSymbol.type, bindings);
        }
        if (this.typeAnalyzer.isIndirection(argT2)) {
          const pointee = argT2.typeParameters?.[0];
          if (pointee && wantT2 && (this.typeAnalyzer.typesMatch(wantT2, pointee) || this.typeAnalyzer.isAliasOf(wantT2, pointee, scope))) {
            argT2 = pointee;
          }
        }
        if (sym.signature?.parameters[i]?.type.reference) {
          const referenceTemplate = sym.signature.parameters[i].type;
          const declaredReference = {
            ...wantT2 ?? referenceTemplate,
            reference: referenceTemplate.reference,
            edit: referenceTemplate.edit
          };
          const root = this.rootIdentifier(x);
          if (!root) {
            this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", x.position, "cannot pass a function call or temporary as a borrowed reference"));
            return;
          }
          const rootSymbol = scope.getSymbol(root);
          if (declaredReference.edit && (rootSymbol?.kind == SymbolKind.SymbolLocalConst || rootSymbol?.kind == SymbolKind.SymbolFileConst || rootSymbol?.kind == SymbolKind.SymbolParameter && !rootSymbol.type?.edit || argT2.reference && !argT2.edit)) {
            this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", x.position, `cannot upgrade read-only or const borrow ${root} to edit capability`));
            return;
          }
          if (!this.referenceCompatible(declaredReference, argT2, scope)) {
            this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", x.position, `argument ${i + 1} of function ${calleeName} has type \`${argT2.name.name}\`, want \`${declaredReference.name.name}\``));
          }
          return;
        }
        if (x.kind != "move_expression" && this.typeAnalyzer.ownershipTier(argT2, scope) != "copyable") {
          const tier = this.typeAnalyzer.ownershipTier(argT2, scope);
          this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", x.position, tier == "unique" ? `cannot pass ${argT2.name.name} as value because it is unique; use move` : `cannot pass ${argT2.name.name} as value because it is non-copyable; use move`));
          return;
        }
        if (this.typeAnalyzer.arrayTypesMatch(wantT2, argT2)) {
          return;
        }
        if (x.kind == "integer_literal" && this.typeAnalyzer.isInteger(wantT2) && this.typeAnalyzer.isInteger(argT2) && this.typeAnalyzer.checkIntegerRange(wantT2, x)) {
          return;
        }
        if (this.typeAnalyzer.isAliasOf(wantT2, argT2, scope)) {
          return;
        }
        this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", x.position, `argument ${i + 1} of function ${calleeName} has type \`${this.typeAnalyzer.displayName(argT2)}\`, want \`${this.typeAnalyzer.displayName(wantT2)}\``));
      });
      let returnType = sym.signature.returnTypes[0];
      if (returnType?.value == TypeValue.TypeGeneric) {
        const typeIndex = typeParameters.findIndex((x) => x.name.name == returnType?.name.name);
        returnType = genericTypes[typeIndex];
      }
      const missingTypeArgument = typeParameters.some((_, index) => !genericTypes[index]);
      if (genericTypes.length != typeParameters.length || missingTypeArgument) {
        this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.position, `mismatched type parameter count, want ${typeParameters.length}, got ${genericTypes.length}`));
        return CreateType("invalid", TypeValue.TypeInvalid);
      }
      const returnTypeBindings = /* @__PURE__ */ new Map();
      typeParameters.forEach((typeParameter, index) => {
        returnTypeBindings.set(typeParameter.name.name, genericTypes[index]);
      });
      if (returnType) {
        returnType = this.typeAnalyzer.substituteType(returnType, returnTypeBindings);
        this.recordConcreteStructInstantiation(returnType, scope);
      }
      const declaration = sym.signature.declaration;
      declaration.concreteTypesMap ??= /* @__PURE__ */ new Map();
      for (const [genericName, concreteTypes] of concreteTypesMap) {
        const recordedTypes = declaration.concreteTypesMap.get(genericName) ?? [];
        for (const concreteType of concreteTypes) {
          if (!recordedTypes.some((recordedType) => this.typeAnalyzer.typesMatch(recordedType, concreteType))) {
            recordedTypes.push(concreteType);
          }
        }
        declaration.concreteTypesMap.set(genericName, recordedTypes);
      }
      return returnType ?? CreateType("void", TypeValue.TypeInvalid, e.position);
    }
    const convSig = this.getConverterFunction(calleeName);
    if (!convSig) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.position, "unknown function: " + calleeName));
      return CreateType("invalid", TypeValue.TypeInvalid);
    }
    if (e.arguments.length != 1) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.position, `conversion ${calleeName} expects 1 argument, found ${e.arguments.length}`));
      return CreateType("invalid", TypeValue.TypeInvalid);
    }
    const argument = e.arguments[0];
    const argT = this.dereferenceOwnedValue(argument, this.analyze(argument, scope));
    if (argT.value == TypeValue.TypeInvalid)
      return argT;
    const wantT = convSig.parameters[0].type;
    e.conversion = { fromType: argT.name.name, toType: calleeName };
    const valid = this.typeAnalyzer.isInteger(argT) && this.typeAnalyzer.isInteger(wantT) || this.typeAnalyzer.isFloat(argT) && this.typeAnalyzer.isInteger(wantT) || this.typeAnalyzer.isInteger(argT) && this.typeAnalyzer.isFloat(wantT) || this.typeAnalyzer.isFloat(argT) && this.typeAnalyzer.isFloat(wantT) || this.typeAnalyzer.isInteger(argT) && wantT.value == TypeValue.Type_Char;
    if (!valid) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", e.position, "conversion from " + argT.name.name + " to " + wantT.name.name + " is not allowed"));
      return CreateType("invalid", TypeValue.TypeInvalid);
    }
    return convSig.returnTypes[0];
  }
  analyzeMethodCall(scope, call, member) {
    const receiverType = this.analyze(member.receiver, scope);
    if (receiverType.value == TypeValue.TypeInvalid)
      return receiverType;
    let recordType = receiverType;
    if (recordType.value == TypeValue.Type_Owned)
      recordType = recordType.typeParameters?.[0] ?? recordType;
    const typeSymbol = scope.getSymbol(recordType.name.name);
    if (typeSymbol?.kind == SymbolKind.SymbolTypsAliasDecl && typeSymbol.type)
      recordType = typeSymbol.type;
    const signature = scope.getMethod(recordType.name.name, member.member.name);
    if (!signature) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", member.position, recordType.value == TypeValue.TypeGeneric ? `type parameter ${recordType.name.name} has no known method \`${member.member.name}\`` : `type ${recordType.name.name} has no method \`${member.member.name}\``));
      return CreateType("invalid", TypeValue.TypeInvalid);
    }
    this.recordConcreteStructInstantiation(recordType, scope);
    if (member.member.name == "dispose") {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", member.position, `dispose method on ${recordType.name.name} cannot be called manually`));
      return CreateType("invalid", TypeValue.TypeInvalid);
    }
    if (signature.receiverEdit) {
      const root = this.rootIdentifier(member.receiver);
      const symbol = root ? scope.getSymbol(root) : void 0;
      if (receiverType.reference && !receiverType.edit) {
        this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", member.position, `read-only receiver lacks edit capability for method ${member.member.name}`));
      } else if (symbol && [
        SymbolKind.SymbolLocalConst,
        SymbolKind.SymbolFileConst,
        SymbolKind.SymbolParameter
      ].includes(symbol.kind)) {
        this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", member.position, `cannot call edit method ${member.member.name} on const receiver ${root}`));
      }
    }
    if (call.arguments.length != signature.parameters.length) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", call.position, `argument count mismatch for method ${member.member.name}, need ${signature.parameters.length}, got ${call.arguments.length}`));
      return CreateType("invalid", TypeValue.TypeInvalid);
    }
    const methodTypeParameters = signature.typeParameters ?? [];
    const bindings = /* @__PURE__ */ new Map();
    const receiverTypeParameters = typeSymbol?.type?.typeParameters ?? [];
    receiverTypeParameters.forEach((parameter, index) => {
      const concreteType = recordType.typeParameters?.[index];
      if (concreteType && methodTypeParameters.some((methodParameter) => methodParameter.name.name == parameter.name.name)) {
        bindings.set(parameter.name.name, concreteType);
      }
    });
    const explicitTypeArguments = call.genericTypes ?? [];
    if (explicitTypeArguments.length && explicitTypeArguments.length != methodTypeParameters.length) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", call.position, `method ${member.member.name} expects ${methodTypeParameters.length} type argument(s), found ${explicitTypeArguments.length}`));
      return CreateType("invalid", TypeValue.TypeInvalid);
    }
    let invalidTypeArgument = false;
    explicitTypeArguments.forEach((typeArgument, index) => {
      const parameter = methodTypeParameters[index];
      if (!parameter)
        return;
      const receiverBinding = bindings.get(parameter.name.name);
      if (receiverBinding && !this.typeAnalyzer.typesMatch(receiverBinding, typeArgument)) {
        this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", call.position, `type argument ${this.typeAnalyzer.displayName(typeArgument)} conflicts with receiver type ${this.typeAnalyzer.displayName(receiverBinding)} for ${parameter.name.name}`));
        invalidTypeArgument = true;
        return;
      }
      bindings.set(parameter.name.name, typeArgument);
    });
    if (invalidTypeArgument)
      return CreateType("invalid", TypeValue.TypeInvalid);
    let invalidArgument = false;
    const resolvedParameters = signature.parameters.map((parameter) => ({
      ...parameter,
      type: this.typeAnalyzer.substituteType(parameter.type, bindings)
    }));
    call.arguments.forEach((argument, index) => {
      const expected = resolvedParameters[index].type;
      if (argument.kind == "object_literal" && !argument.type.name.name)
        argument.type = structuredClone(expected);
      const actual = this.analyze(argument, scope, expected);
      if (actual.value == TypeValue.TypeInvalid) {
        invalidArgument = true;
        return;
      }
      if (!this.referenceCompatible(expected, actual, scope)) {
        this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", argument.position, `argument ${index + 1} of method ${member.member.name} requires type ${expected.name.name}, got ${actual.name.name}`));
        invalidArgument = true;
      }
    });
    if (invalidArgument)
      return CreateType("invalid", TypeValue.TypeInvalid);
    const missingTypeParameter = methodTypeParameters.find((parameter) => !bindings.has(parameter.name.name));
    if (missingTypeParameter) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", call.position, `cannot infer type argument ${missingTypeParameter.name.name} for method ${member.member.name}`));
      return CreateType("invalid", TypeValue.TypeInvalid);
    }
    const concreteTypes = methodTypeParameters.map((parameter) => bindings.get(parameter.name.name));
    if (methodTypeParameters.length)
      call.genericTypes = concreteTypes;
    const declaration = signature.declaration;
    if (declaration && methodTypeParameters.length) {
      declaration.concreteTypesMap ??= /* @__PURE__ */ new Map();
      methodTypeParameters.forEach((parameter, index) => {
        const concreteType = concreteTypes[index];
        const recorded = declaration.concreteTypesMap.get(parameter.name.name) ?? [];
        if (concreteType.value != TypeValue.TypeGeneric && !recorded.some((type) => this.typeAnalyzer.typesMatch(type, concreteType))) {
          recorded.push(concreteType);
        }
        declaration.concreteTypesMap.set(parameter.name.name, recorded);
      });
    }
    call.resolvedErrorTypes = signature.errorTypes.map((type) => this.typeAnalyzer.substituteType(type, bindings));
    call.resolvedParameterTypes = resolvedParameters.map((parameter) => parameter.type);
    call.resolvedReceiverType = recordType.name.name;
    call.resolvedReceiverParameter = signature.receiverType ? this.typeAnalyzer.substituteType(signature.receiverType, bindings) : void 0;
    member.receiverType = receiverType;
    const returnType = signature.returnTypes[0] ? this.typeAnalyzer.substituteType(signature.returnTypes[0], bindings) : CreateType("void", TypeValue.TypeInvalid, call.position);
    this.recordConcreteStructInstantiation(returnType, scope);
    return returnType;
  }
  recordConcreteStructInstantiation(type, scope) {
    if (type.value != TypeValue.TypeCustom || !type.typeParameters?.length)
      return;
    const symbol = scope.getSymbol(type.name.name);
    const declaration = symbol?.declaration?.kind == "type_declaration" && symbol.declaration.declKind == TypeDeclKind.Struct ? symbol.declaration.declaration : void 0;
    if (!declaration?.typeParameters?.length)
      return;
    declaration.concreteTypesMap ??= /* @__PURE__ */ new Map();
    declaration.typeParameters.forEach((parameter, index) => {
      const concreteType = type.typeParameters?.[index];
      if (!concreteType || concreteType.value == TypeValue.TypeGeneric)
        return;
      const recorded = declaration.concreteTypesMap.get(parameter.name.name) ?? [];
      if (!recorded.some((candidate) => this.typeAnalyzer.typesMatch(candidate, concreteType))) {
        recorded.push(concreteType);
      }
      declaration.concreteTypesMap.set(parameter.name.name, recorded);
    });
  }
  rootIdentifier(expression) {
    if (expression.kind == "identifier")
      return expression.name;
    if (expression.kind == "member_access_expression" || expression.kind == "index_expression")
      return this.rootIdentifier(expression.receiver);
    return void 0;
  }
  referenceCompatible(expected, actual, scope) {
    const expectedBase = { ...expected, reference: false, edit: false };
    const actualBase = { ...actual, reference: false, edit: false };
    return this.typeAnalyzer.arrayTypesMatch(expectedBase, actualBase) || this.typeAnalyzer.isAliasOf(expectedBase, actualBase, scope) || this.typeAnalyzer.isAliasOf(actualBase, expectedBase, scope);
  }
  /**
   * Synthesizes the single-argument signature used for primitive conversion
   * calls, such as `int32(value)`.
   */
  getConverterFunction(name) {
    const value = this.typeAnalyzer.resolveTypeValue(CreateType(name, TypeValue.TypeInvalid));
    if (value == TypeValue.TypeCustom || value == TypeValue.TypeInvalid || [TypeValue.Type_Bool, TypeValue.Type_String, TypeValue.Type_Owned].includes(value)) {
      return;
    }
    const converted = CreateType(name, value);
    return {
      name,
      returnTypes: [converted],
      errorTypes: [],
      parameters: [
        {
          position: { line: 0, column: 0, start: 0, end: 0 },
          name: { kind: "identifier", name: "value" },
          type: converted
        }
      ]
    };
  }
};

// dist/src/analysis/statements/assignment_statement.js
var AssignmentStatementAnalyzer = class {
  diagnostics;
  expr;
  types;
  constructor(diagnostics) {
    this.diagnostics = diagnostics;
    this.expr = new ExpressionAnalyzer(diagnostics);
    this.types = new TypeAnalyzer(diagnostics);
  }
  analyze(s, context, scope) {
    const getRootName = (expression) => {
      if (expression.kind == "identifier")
        return expression.name;
      if (expression.kind == "member_access_expression") {
        return getRootName(expression.receiver);
      }
      if (expression.kind == "index_expression") {
        return getRootName(expression.receiver);
      }
      return "";
    };
    const rootName = getRootName(s.root);
    const symbol = scope.getSymbol(rootName);
    if (!symbol) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", s.position, "unknown identifier '" + rootName + "'"));
      return;
    }
    let readOnlyMemberMessage;
    let readOnlyMemberPosition = s.position;
    if (s.root.kind == "member_access_expression") {
      const receiverType = this.expr.analyze(s.root.receiver, scope);
      readOnlyMemberPosition = s.root.member.position ?? s.position;
      if (s.root.member.name == "length" && receiverType.value == TypeValue.Type_String) {
        readOnlyMemberMessage = "string length is read-only";
      } else if (["length", "size"].includes(s.root.member.name) && receiverType.slice) {
        readOnlyMemberMessage = "slice length is read-only";
      }
    }
    if (readOnlyMemberMessage) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", readOnlyMemberPosition, readOnlyMemberMessage));
      return;
    }
    if (symbol.kind == SymbolKind.SymbolLocalConst || symbol.kind == SymbolKind.SymbolFileConst) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", s.position, "cannot assign to const binding '" + rootName + "'"));
      return;
    }
    if (symbol.kind == SymbolKind.SymbolParameter && !symbol.type?.edit) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", s.position, "cannot assign to const function parameter '" + rootName + "'"));
      return;
    }
    if (symbol.kind == SymbolKind.SymbolFuncDecl) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", s.position, "cannot assign to function '" + rootName + "'"));
      return;
    }
    let wantT = s.root.kind == "identifier" ? symbol.type : this.expr.analyze(s.root, scope);
    if (!wantT || wantT.value == TypeValue.TypeInvalid) {
      return;
    }
    if (s.target.kind == "move_expression" && s.target.source.kind == "identifier" && s.root.kind == "identifier" && s.target.source.name == s.root.name) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", s.position, `cannot move ${s.root.name} into itself`));
      return;
    }
    if (s.target.kind == "object_literal" && wantT && !s.target.type.name.name) {
      s.target.type = structuredClone(wantT);
    }
    let haveT = s.operator ? this.expr.analyze({
      kind: "binary_expression",
      position: s.operatorPosition ?? s.position,
      operator: s.operator.slice(0, -1),
      left: s.root,
      right: s.target
    }, scope) : this.expr.analyze(s.target, scope, wantT);
    let pointeeT = wantT;
    while (this.types.isIndirection(pointeeT) && pointeeT.typeParameters?.[0]) {
      pointeeT = pointeeT.typeParameters[0];
    }
    const writesPointee = pointeeT != wantT && (this.types.arrayTypesMatch(pointeeT, haveT) || this.types.isAliasOf(pointeeT, haveT, scope) || s.target.kind == "integer_literal" && this.types.isInteger(pointeeT) && this.types.isInteger(haveT) && this.types.checkIntegerRange(pointeeT, s.target));
    if (writesPointee || s.operator && s.root.implicitDereference) {
      wantT = this.expr.dereferenceOwnedValue(s.root, wantT);
    }
    if (!s.operator && this.types.isIndirection(haveT)) {
      const pointee = haveT.typeParameters?.[0];
      if (pointee && (this.types.typesMatch(wantT, pointee) || this.types.isAliasOf(wantT, pointee, scope))) {
        haveT = this.expr.dereferenceOwnedValue(s.target, haveT);
      }
    }
    if (["identifier", "member_access_expression", "index_expression"].includes(s.target.kind)) {
      const tier = this.types.ownershipTier(haveT, scope);
      if (tier != "copyable") {
        const source = s.target.kind == "identifier" ? ` ${s.target.name}` : "";
        this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", s.target.position, tier == "unique" ? `cannot copy non-copyable unique value${source}; move a whole mutable binding instead` : `cannot copy non-copyable value${source}; use move on a whole binding or clone this value`));
        return;
      }
    }
    if (haveT.value != TypeValue.TypeInvalid && !this.types.arrayTypesMatch(wantT, haveT) && !this.types.isAliasOf(wantT, haveT, scope) && !(wantT.kind == "union" && this.types.isUnionVariant(wantT, haveT)) && !(s.target.kind == "integer_literal" && this.types.isInteger(wantT) && this.types.isInteger(haveT) && this.types.checkIntegerRange(wantT, s.target))) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", s.target.position, `assignment type mismatch: expected \`${wantT.name.name}\`, got \`${haveT.name.name}\``));
      return;
    }
    if (s.root.kind == "identifier") {
      symbol.moved = "active";
      symbol.value = void 0;
    }
    if (s.root.kind == "identifier")
      symbol.assigned = true;
    if (!context.scopedAssignments.includes(symbol.name)) {
      context.scopedAssignments.push(symbol.name);
    }
    if (!symbol.assigned && s.root.kind == "member_access_expression") {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", s.position, "partial initialization of struct is not allowed, " + rootName + " is still uninitialized"));
    }
    return;
  }
};

// dist/src/analysis/statements/block_statement.js
var BlockStatementAnalyzer = class {
  diagnostics;
  analyzeStatement;
  constructor(diagnostics, analyzeStatement) {
    this.diagnostics = diagnostics;
    this.analyzeStatement = analyzeStatement;
  }
  analyze(b, context, scope) {
    let unreachable = false;
    b.statements.forEach((statement) => {
      if (unreachable) {
        this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", statement.position, "unreachable code"));
        return;
      }
      this.analyzeStatement(statement, context, scope);
      unreachable = this.statementDiverges(statement);
    });
    return;
  }
  blockDiverges(block) {
    return block.statements.some((statement) => this.statementDiverges(statement));
  }
  statementDiverges(statement) {
    if (["return_statement", "return_error_statement"].includes(statement.kind))
      return true;
    if (statement.kind == "break_statement" || statement.kind == "continue_statement") {
      return statement.validDivergence === true;
    }
    if (statement.kind == "block_statement")
      return this.blockDiverges(statement);
    if (statement.kind == "if_statement") {
      return !!statement.elseBlock && this.blockDiverges(statement.thenBlock) && this.blockDiverges(statement.elseBlock);
    }
    if (statement.kind == "switch_statement") {
      const casesReturn = statement.cases.every((item) => this.blockDiverges({ ...item.body, kind: "block_statement" }));
      const exhaustiveEnum = statement.scrutinee.expressionType?.kind == "enum" && statement.cases.reduce((count, item) => count + item.labels.length, 0) >= (statement.scrutinee.expressionType.variants?.length ?? Infinity);
      return casesReturn && (exhaustiveEnum || !!statement.default && this.blockDiverges({ ...statement.default.body, kind: "block_statement" }));
    }
    return false;
  }
};

// dist/src/analysis/statements/control_flow_statement.js
var ControlFlowStatementAnalyzer = class {
  diagnostics;
  constructor(diagnostics) {
    this.diagnostics = diagnostics;
  }
  analyze(s, context) {
    if (s.kind == "break_statement") {
      s.validDivergence = context.loopDepth != 0;
      if (s.validDivergence)
        return;
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", s.position, "break outside a loop statement is not allowed"));
      return;
    }
    if (s.kind == "continue_statement") {
      s.validDivergence = context.loopDepth != 0;
      if (context.loopDepth == 0) {
        this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", s.position, "continue outside a loop is not allowed"));
      }
    }
    return;
  }
};

// dist/src/analysis/statements/expression_statement.js
var ExpressionStatementAnalyzer = class {
  diagnostics;
  expressionAnalyzer;
  constructor(diagnostics, expressionAnalyzer) {
    this.diagnostics = diagnostics;
    this.expressionAnalyzer = expressionAnalyzer;
  }
  analyze(s, scope) {
    this.expressionAnalyzer.analyze(s.expression, scope);
    return;
  }
};

// dist/src/analysis/statements/for_statement.js
var ForStatementAnalyzer = class {
  diagnostics;
  expressionAnalyzer;
  blockAnalyzer;
  analyzeStatement;
  constructor(diagnostics, expressionAnalyzer, blockAnalyzer, analyzeStatement) {
    this.diagnostics = diagnostics;
    this.expressionAnalyzer = expressionAnalyzer;
    this.blockAnalyzer = blockAnalyzer;
    this.analyzeStatement = analyzeStatement;
  }
  analyze(s, context, scope) {
    const loopScope = new Scope(scope);
    if (s.declaration)
      this.analyzeStatement(s.declaration, context, loopScope);
    const conditionType = s.condition ? this.expressionAnalyzer.dereferenceOwnedValue(s.condition, this.expressionAnalyzer.analyze(s.condition, loopScope)) : void 0;
    if (s.condition && conditionType?.value != TypeValue.TypeInvalid && conditionType?.value != TypeValue.Type_Bool) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", s.condition.position, "condition in for loop must evaluate to a bool"));
    }
    if (s.modifier)
      this.expressionAnalyzer.analyze(s.modifier, loopScope);
    const outer = scope.visibleSymbols();
    const before = new Map(outer.map((symbol) => [symbol, { moved: symbol.moved ?? "active", assigned: symbol.assigned }]));
    const loopContext = { ...context, loopDepth: context.loopDepth + 1 };
    this.blockAnalyzer.analyze(s.body, loopContext, loopScope);
    for (const symbol of outer) {
      const previous2 = before.get(symbol);
      if (previous2.moved == "active" && symbol.moved != "active" && symbol.moved !== void 0) {
        this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", symbol.movePosition ?? s.position, `\`${symbol.name}\` may have been moved on a previous loop iteration; revive it before the loop back-edge`));
      }
      symbol.moved = previous2.moved;
      symbol.assigned = previous2.assigned;
    }
    return;
  }
};

// dist/src/analysis/statements/if_statement.js
var IfStatementAnalyzer = class {
  diagnostics;
  expressionAnalyzer;
  blockAnalyzer;
  constructor(diagnostics, expressionAnalyzer, blockAnalyzer) {
    this.diagnostics = diagnostics;
    this.expressionAnalyzer = expressionAnalyzer;
    this.blockAnalyzer = blockAnalyzer;
  }
  analyze(s, context, scope) {
    const conditionType = this.expressionAnalyzer.dereferenceOwnedValue(s.condition, this.expressionAnalyzer.analyze(s.condition, scope));
    if (conditionType.value != TypeValue.TypeInvalid && conditionType.value != TypeValue.Type_Bool) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", s.condition.position, "condition inside if statement must evaluate to a bool"));
    }
    const symbols = scope.visibleSymbols();
    const before = new Map(symbols.map((symbol) => [symbol, { moved: symbol.moved ?? "active", assigned: symbol.assigned }]));
    const ifContext = { ...context, kind: BlockKind.IfBlock, scopedAssignments: [] };
    this.blockAnalyzer.analyze(s.thenBlock, ifContext, new Scope(scope));
    const thenState = new Map(symbols.map((symbol) => [symbol, { moved: symbol.moved ?? "active", assigned: symbol.assigned }]));
    symbols.forEach((symbol) => {
      symbol.moved = before.get(symbol).moved;
      symbol.assigned = before.get(symbol).assigned;
    });
    let elseState = before;
    if (s.elseBlock) {
      this.blockAnalyzer.analyze(s.elseBlock, { ...ifContext, scopedAssignments: [] }, new Scope(scope));
      elseState = new Map(symbols.map((symbol) => [symbol, { moved: symbol.moved ?? "active", assigned: symbol.assigned }]));
    }
    const thenDiverges = this.blockAnalyzer.blockDiverges(s.thenBlock);
    const elseDiverges = !!s.elseBlock && this.blockAnalyzer.blockDiverges(s.elseBlock);
    for (const symbol of symbols) {
      const left = thenState.get(symbol);
      const right = elseState.get(symbol);
      if (thenDiverges && !elseDiverges) {
        symbol.moved = right.moved;
        symbol.assigned = right.assigned;
      } else if (elseDiverges && !thenDiverges) {
        symbol.moved = left.moved;
        symbol.assigned = left.assigned;
      } else {
        symbol.moved = left.moved == right.moved ? left.moved : "maybe";
        symbol.assigned = !!left.assigned && !!right.assigned;
      }
    }
    return;
  }
};

// dist/src/analysis/statements/return_statement.js
var ReturnStatementAnalyzer = class {
  diagnostics;
  expr;
  typeAnalyzer;
  constructor(diagnostics, expr, typeAnalyzer) {
    this.diagnostics = diagnostics;
    this.expr = expr;
    this.typeAnalyzer = typeAnalyzer;
  }
  analyze(s, context, scope) {
    const values = s.expressions ?? (s.expression ? [s.expression] : []);
    const returnTypes = context.function.signature?.returnTypes ?? [];
    if (values.length != returnTypes.length) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", s.position, `return arity mismatch: expected ${returnTypes.length} value(s), got ${values.length}`));
      context.returns = true;
      return;
    }
    values.forEach((expression, index) => {
      let retT = returnTypes[index];
      if (retT.value == TypeValue.TypeInvalid || retT.value == TypeValue.TypeCustom && !scope.getSymbol(retT.name.name))
        return;
      if (expression.kind == "object_literal" && !expression.type.name.name) {
        expression.type = structuredClone(retT);
      }
      let exprT = this.expr.analyze(expression, scope, retT);
      if (exprT.value == TypeValue.TypeInvalid)
        return;
      if (this.typeAnalyzer.isIndirection(exprT)) {
        const pointee = exprT.typeParameters?.[0];
        if (pointee && (this.typeAnalyzer.typesMatch(retT, pointee) || this.typeAnalyzer.isAliasOf(retT, pointee, scope))) {
          exprT = this.expr.dereferenceOwnedValue(expression, exprT);
        }
      }
      if (expression.kind == "function_call_expression" && expression.resolvedErrorTypes?.length) {
        this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", expression.position, "fallible method call must be handled with `as result` before return"));
        return;
      }
      if (expression.kind == "identifier" && this.typeAnalyzer.ownershipTier(exprT, scope) != "copyable") {
        const symbol = scope.getSymbol(expression.name);
        if (symbol?.kind == SymbolKind.SymbolFileConst) {
          this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", expression.position, `cannot transfer non-copyable global ${expression.name}; return a clone instead`));
          return;
        }
      }
      if ((expression.kind == "member_access_expression" || expression.kind == "index_expression") && this.typeAnalyzer.ownershipTier(exprT, scope) != "copyable") {
        this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", expression.position, "cannot transfer a non-copyable field or indexed element; return `clone` of the value instead"));
        return;
      }
      if (retT.value == TypeValue.TypeCustom) {
        const typeSymbol = scope.getSymbol(retT.name.name);
        if (typeSymbol?.type) {
          const bindings = /* @__PURE__ */ new Map();
          typeSymbol.type.typeParameters?.forEach((parameter, argumentIndex) => {
            const argument = retT.typeParameters?.[argumentIndex];
            if (argument)
              bindings.set(parameter.name.name, argument);
          });
          retT = this.typeAnalyzer.substituteType(typeSymbol.type, bindings);
        }
      }
      if (!this.typeAnalyzer.typesMatch(exprT, retT) && !this.typeAnalyzer.isAliasOf(retT, exprT, scope) && !(retT.kind == "union" && this.typeAnalyzer.isUnionVariant(retT, exprT)) && !(expression.kind == "integer_literal" && this.typeAnalyzer.isInteger(retT) && this.typeAnalyzer.isInteger(exprT) && this.typeAnalyzer.checkIntegerRange(retT, expression))) {
        this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", expression.position, `mismatched types in return statement, want ${retT.name.name}, got ${exprT.name.name}`));
      }
    });
    context.returns = true;
    return;
  }
};

// dist/src/analysis/statements/switch_statement.js
var SwitchStatementAnalyzer = class {
  diagnostics;
  expressionAnalyzer;
  typeAnalyzer;
  blockAnalyzer;
  constructor(diagnostics, expressionAnalyzer, typeAnalyzer, blockAnalyzer) {
    this.diagnostics = diagnostics;
    this.expressionAnalyzer = expressionAnalyzer;
    this.typeAnalyzer = typeAnalyzer;
    this.blockAnalyzer = blockAnalyzer;
  }
  analyze(s, context, scope) {
    const scrutineeT = this.expressionAnalyzer.dereferenceOwnedValue(s.scrutinee, this.expressionAnalyzer.analyze(s.scrutinee, scope));
    if (scrutineeT.value == TypeValue.TypeInvalid)
      return;
    if (!this.isSwitchable(scrutineeT)) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", s.scrutinee.position, `cannot switch on type ${scrutineeT.name.name}, must be an int or char`));
      return;
    }
    if (scrutineeT.kind == "enum" && scrutineeT.variants?.length != s.cases.length && s.default?.body.statements.length == 0) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", s.position, `all variants of enum \`${scrutineeT.name.name}\` are not being checked, must include default statement`));
      return;
    }
    const seenLabels = /* @__PURE__ */ new Map();
    for (const caseObj of s.cases) {
      for (const label of caseObj.labels) {
        const labelT = this.expressionAnalyzer.analyze(label, scope);
        if (!this.typeAnalyzer.typesMatch(labelT, scrutineeT)) {
          if (this.typeAnalyzer.isInteger(labelT) && this.typeAnalyzer.isInteger(scrutineeT)) {
            if (!this.isSigned(scrutineeT) && label.value.startsWith("-")) {
              this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", label.position, "incompatible type in case"));
              return;
            }
            if (this.typeAnalyzer.sizeOf(scrutineeT) >= this.typeAnalyzer.sizeOf(labelT))
              continue;
          }
          this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", label.position, `case label does not match scrutinee type; want ${scrutineeT.name.name}, got ${labelT.name.name}`));
          return;
        }
        const key = label.kind == "integer_literal" ? "int:" + label.value : "char:" + label.value;
        if (seenLabels.has(key)) {
          this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", label.position, "duplicate label detected"));
          return;
        }
        seenLabels.set(key, true);
      }
    }
    if (scrutineeT.kind != "enum" && s.default?.body.statements.length == 0) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", s.scrutinee.position, "missing default statement"));
      return;
    }
    for (const caseObj of s.cases) {
      const caseCtx = context;
      caseCtx.switch = true;
      this.blockAnalyzer.analyze(caseObj.body, caseCtx, new Scope(scope));
    }
    if (s.default?.body.statements.length > 0) {
      const defaultCtx = context;
      defaultCtx.switch = true;
      this.blockAnalyzer.analyze(s.default.body, defaultCtx, new Scope(scope));
    }
    return;
  }
  /** Returns whether a type is allowed as a switch scrutinee. */
  isSwitchable(t) {
    return t.kind == "enum" || this.typeAnalyzer.isInteger(t) || t.value == TypeValue.Type_Char;
  }
  /** Returns whether an integer-like type accepts negative case labels. */
  isSigned(t) {
    return this.typeAnalyzer.isInteger(t) && !t.value.startsWith("Type_U");
  }
};

// dist/src/analysis/statements/variable_declaration.js
var VariableDeclarationStatementAnalyzer = class {
  diagnostics;
  typeAnalyzer;
  expr;
  constructor(diagnostics) {
    this.diagnostics = diagnostics;
    this.typeAnalyzer = new TypeAnalyzer(diagnostics);
    this.expr = new ExpressionAnalyzer(diagnostics);
  }
  analyze(s, scope) {
    if (scope.getSymbol(s.name.name)) {
      this.addError(s, "duplicate identifier " + s.name.name + " in this scope");
      return;
    }
    if (this.typeAnalyzer.isIndirection(s.type) && s.value?.kind != "new_expression") {
      this.addError(s, "indirection types are only permitted in record fields and function parameters; a local staging handle must be initialized directly with `new`", s.type.position);
      return;
    }
    let wantT = this.resolveDeclaredType(s, scope);
    if (!wantT) {
      this.register(s, scope, CreateType("invalid", TypeValue.TypeInvalid));
      return;
    }
    if (!s.value) {
      this.register(s, scope, wantT);
      return;
    }
    if (s.value.kind == "object_literal" && !s.value.type.name.name && !this.typeAnalyzer.isInvalidType(wantT)) {
      s.value.type = structuredClone(wantT);
    }
    let haveT = this.expr.analyze(s.value, scope, this.typeAnalyzer.isInvalidType(wantT) ? void 0 : wantT);
    if (s.value.kind == "new_expression" && this.typeAnalyzer.isIndirection(wantT)) {
      const expectedInner = wantT.typeParameters?.[0];
      const actualInner = haveT.typeParameters?.[0];
      if (expectedInner && actualInner && (this.typeAnalyzer.typesMatch(expectedInner, actualInner) || this.typeAnalyzer.isAliasOf(expectedInner, actualInner, scope))) {
        haveT = structuredClone(wantT);
        s.value.expressionType = haveT;
      }
    }
    if (s.value.kind != "new_expression" && s.value.kind != "move_expression" && s.value.kind != "clone_expression" && this.typeAnalyzer.isIndirection(haveT)) {
      const pointee = haveT.typeParameters?.[0];
      if (pointee && (this.typeAnalyzer.isInvalidType(wantT) || this.typeAnalyzer.typesMatch(wantT, pointee) || this.typeAnalyzer.isAliasOf(wantT, pointee, scope))) {
        haveT = this.expr.dereferenceOwnedValue(s.value, haveT);
      }
    }
    if (this.typeAnalyzer.isInvalidType(haveT)) {
      this.register(s, scope, wantT);
      return;
    }
    if (this.typeAnalyzer.isCustomType(haveT) && !scope.getSymbol(haveT.name.name)) {
      this.addError(s, "unknown type identifier: " + haveT.name.name);
      return;
    }
    if (this.typeAnalyzer.isInvalidType(wantT)) {
      wantT = haveT;
      s.type = haveT;
    }
    if (["identifier", "member_access_expression", "index_expression"].includes(s.value.kind)) {
      const tier = this.typeAnalyzer.ownershipTier(haveT, scope);
      if (tier != "copyable") {
        this.addError(s, tier == "unique" ? `type ${haveT.name.name} is unique and cannot be copied; move a whole mutable binding instead` : `type ${haveT.name.name} is non-copyable; use move on a whole binding or clone this value`, s.value.position);
        this.register(s, scope, wantT);
        return;
      }
    }
    this.register(s, scope, wantT);
    if (!this.isValidEnumInitializer(s, wantT)) {
      return;
    }
    if (wantT.kind == "enum")
      return;
    if (wantT.arrayLengths?.length || haveT.arrayLengths?.length) {
      if (this.typeAnalyzer.arrayTypesMatch(wantT, haveT)) {
        return;
      }
      if (!this.typeAnalyzer.arrayDimensionsMatch(wantT, haveT)) {
        this.addError(s, "length of array literal value does not match with declared type", s.value.position);
        return;
      }
      if (this.typeAnalyzer.isInteger(haveT) && this.typeAnalyzer.isInteger(wantT)) {
        this.checkIntegerConversion(s, wantT);
        return;
      }
      this.addError(s, "type of array literal does not match with the declared type", s.value.position);
      return;
    }
    if (this.typeAnalyzer.typesMatch(wantT, haveT)) {
      this.checkMatchingIntegerInitializer(s, wantT, haveT, scope);
      return;
    }
    if (this.typeAnalyzer.isInteger(haveT) && this.typeAnalyzer.isInteger(wantT)) {
      this.checkIntegerConversion(s, wantT);
      return;
    }
    if (this.typeAnalyzer.isFloat(haveT) && this.typeAnalyzer.isFloat(wantT) && s.value.kind == "float_literal" || this.typeAnalyzer.isInteger(haveT) && this.typeAnalyzer.isFloat(wantT) || this.typeAnalyzer.isFloat(haveT) && this.typeAnalyzer.isInteger(wantT)) {
      return;
    }
    if (this.typeAnalyzer.isAliasOf(wantT, haveT, scope) || this.typeAnalyzer.isAliasOf(haveT, wantT, scope) || wantT.kind == "union" && this.typeAnalyzer.isUnionVariant(wantT, haveT)) {
      return;
    }
    this.addConversionError(s, wantT, haveT);
  }
  resolveDeclaredType(s, scope) {
    if (s.type.arrayLengths?.some((length) => length == 0)) {
      this.addError(s, "zero length arrays types are not allowed!", s.type.position);
      return;
    }
    if (this.typeAnalyzer.isIndirection(s.type)) {
      return this.validateIndirectionType(s.type, s, scope) ? s.type : void 0;
    }
    if (!this.typeAnalyzer.isCustomType(s.type)) {
      return s.type;
    }
    const typeArguments = s.type.typeParameters;
    let type = scope.getSymbol(s.type.name.name)?.type;
    if (!type) {
      if (s.type.value != TypeValue.TypeGeneric) {
        this.addError(s, "unknown type identifier " + s.type.name.name, s.type.position);
        return;
      } else {
        type = s.type;
      }
    }
    const declaredTypeParameters = type.typeParameters ?? [];
    if (declaredTypeParameters.length != (typeArguments?.length ?? 0)) {
      this.addError(s, `mismatched type argument count, want ${declaredTypeParameters.length}, got ${typeArguments?.length ?? 0}`, s.type.position);
      return;
    }
    const bindings = /* @__PURE__ */ new Map();
    declaredTypeParameters.forEach((parameter, index) => {
      bindings.set(parameter.name.name, typeArguments[index]);
    });
    const resolvedType = this.typeAnalyzer.substituteType(type, bindings);
    resolvedType.arrayLengths = s.type.arrayLengths ?? resolvedType.arrayLengths;
    resolvedType.slice = s.type.slice ?? resolvedType.slice;
    resolvedType.typeParameters = typeArguments;
    s.type = resolvedType;
    return resolvedType;
  }
  validateIndirectionType(type, statement, scope) {
    const arguments_ = type.typeParameters ?? [];
    if (arguments_.length != 1) {
      this.addError(statement, `${type.name.name}<T> requires exactly one type argument`, type.position);
      return false;
    }
    const inner = arguments_[0];
    if (inner.name.name == "void") {
      this.addError(statement, "cannot allocate void", inner.position ?? type.position);
      return false;
    }
    if (this.typeAnalyzer.isIndirection(inner)) {
      return this.validateIndirectionType(inner, statement, scope);
    }
    if (inner.value != TypeValue.TypeGeneric && !this.typeAnalyzer.isValidPrimitiveType(inner) && !scope.getSymbol(inner.name.name)) {
      this.addError(statement, "unknown type identifier: " + inner.name.name, inner.position ?? type.position);
      return false;
    }
    return true;
  }
  register(s, scope, type) {
    scope.addSymbol({
      name: s.name.name,
      kind: s.file ? SymbolKind.SymbolFileConst : s.mutable ? SymbolKind.SymbolLocalLet : SymbolKind.SymbolLocalConst,
      type,
      assigned: !!s.value,
      value: s.value,
      declaration: s,
      moved: "active"
    });
  }
  isValidEnumInitializer(s, wantT) {
    if (wantT.kind != "enum" || !s.value) {
      return true;
    }
    if (s.value.kind == "integer_literal") {
      const literal = s.value;
      const variant = wantT.variants?.find((x) => x.value.value == literal.value);
      if (variant) {
        return true;
      }
      this.addError(s, "illegal member variant value " + literal.value + " for enum " + wantT.name.name);
      return false;
    }
    if (s.value.kind == "identifier") {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", s.value.position, "cannot determine valid literal member variant for enum " + wantT.name.name));
      return false;
    }
    return true;
  }
  checkMatchingIntegerInitializer(s, wantT, haveT, scope) {
    if (!this.typeAnalyzer.isInteger(haveT) || !this.typeAnalyzer.isInteger(wantT) || !s.value) {
      return;
    }
    if (s.value.kind == "unary_expression" && s.value.operator == string(TokenKind.Symbol_Minus)) {
      const operandType = this.expr.analyze(s.value.operand, scope);
      if (operandType.value.startsWith("Type_U")) {
        this.addError(s, "unary - is not allowed on unsigned type " + operandType.name.name, s.value.position);
      }
      return;
    }
    if (s.value.kind == "integer_literal" && !this.typeAnalyzer.checkIntegerRange(wantT, s.value)) {
      this.addIntegerRangeError(s, wantT, s.value);
    }
  }
  checkIntegerConversion(s, wantT) {
    if (!s.value || s.value.kind != "integer_literal" && s.value.kind != "unary_expression") {
      return;
    }
    if (s.value.kind == "integer_literal") {
      if (!this.typeAnalyzer.checkIntegerRange(wantT, s.value)) {
        this.addIntegerRangeError(s, wantT, s.value);
      }
      return;
    }
    if (s.value.operand.kind != "integer_literal") {
      return;
    }
    const negativeLiteral = {
      ...s.value.operand,
      value: "-" + s.value.operand.value
    };
    if (!this.typeAnalyzer.checkIntegerRange(wantT, negativeLiteral)) {
      this.addIntegerRangeError(s, wantT, s.value.operand);
    }
  }
  addConversionError(s, wantT, haveT) {
    const message = wantT.value == TypeValue.Type_Bool ? `type mismatch: no implicit conversion from \`${this.typeAnalyzer.displayName(haveT)}\` to \`${this.typeAnalyzer.displayName(wantT)}\`;` : `type mismatch: no implicit conversion from \`${this.typeAnalyzer.displayName(haveT)}\` to \`${this.typeAnalyzer.displayName(wantT)}\`; use an explicit cast \`${this.typeAnalyzer.displayName(wantT)}(x)\``;
    this.addError(s, message, s.value?.position);
  }
  addIntegerRangeError(s, type, literal) {
    this.addError(s, `integer literal \`${literal.value}\` does not fit in \`${type.name.name}\``, literal.position);
  }
  addError(s, message, position2 = s.position) {
    this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", position2, message));
  }
};

// dist/src/analysis/statements/while_statement.js
var WhileStatementAnalyzer = class {
  diagnostics;
  expressionAnalyzer;
  blockAnalyzer;
  constructor(diagnostics, expressionAnalyzer, blockAnalyzer) {
    this.diagnostics = diagnostics;
    this.expressionAnalyzer = expressionAnalyzer;
    this.blockAnalyzer = blockAnalyzer;
  }
  analyze(statement, context, scope) {
    const conditionType = this.expressionAnalyzer.dereferenceOwnedValue(statement.condition, this.expressionAnalyzer.analyze(statement.condition, scope));
    if (conditionType.value != TypeValue.TypeInvalid && conditionType.value != TypeValue.Type_Bool) {
      this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", statement.condition.position, "condition inside while statment must evaluate to a boolean"));
    }
    const outer = scope.visibleSymbols();
    const before = new Map(outer.map((symbol) => [symbol, { moved: symbol.moved ?? "active", assigned: symbol.assigned }]));
    const loopContext = { ...context, loopDepth: context.loopDepth + 1 };
    this.blockAnalyzer.analyze(statement.body, loopContext, new Scope(scope));
    for (const symbol of outer) {
      const previous2 = before.get(symbol);
      if (previous2.moved == "active" && symbol.moved != "active" && symbol.moved !== void 0) {
        this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", symbol.movePosition ?? statement.position, `\`${symbol.name}\` may have been moved on a previous loop iteration; revive it before the loop back-edge`));
      }
      symbol.moved = previous2.moved;
      symbol.assigned = previous2.assigned;
    }
    return;
  }
};

// dist/src/analysis/statements/statement.js
var StatementAnalyzer = class {
  diagnostics;
  typeAnalyzer;
  expressionAnalyzer;
  variableAnalyzer;
  assignmentAnalyzer;
  whileAnalyzer;
  forAnalyzer;
  expressionStatementAnalyzer;
  switchAnalyzer;
  ifAnalyzer;
  returnAnalyzer;
  controlFlowAnalyzer;
  blockAnalyzer;
  constructor(diagnostics) {
    this.diagnostics = diagnostics;
    const typeAnalyzer = new TypeAnalyzer(diagnostics);
    this.typeAnalyzer = typeAnalyzer;
    this.expressionAnalyzer = new ExpressionAnalyzer(diagnostics);
    this.blockAnalyzer = new BlockStatementAnalyzer(diagnostics, (statement, context, scope) => this.analyze(statement, context, scope));
    this.variableAnalyzer = new VariableDeclarationStatementAnalyzer(diagnostics);
    this.assignmentAnalyzer = new AssignmentStatementAnalyzer(diagnostics);
    this.whileAnalyzer = new WhileStatementAnalyzer(diagnostics, this.expressionAnalyzer, this.blockAnalyzer);
    this.forAnalyzer = new ForStatementAnalyzer(diagnostics, this.expressionAnalyzer, this.blockAnalyzer, (statement, context, scope) => this.analyze(statement, context, scope));
    this.expressionStatementAnalyzer = new ExpressionStatementAnalyzer(diagnostics, this.expressionAnalyzer);
    this.switchAnalyzer = new SwitchStatementAnalyzer(diagnostics, this.expressionAnalyzer, typeAnalyzer, this.blockAnalyzer);
    this.ifAnalyzer = new IfStatementAnalyzer(diagnostics, this.expressionAnalyzer, this.blockAnalyzer);
    this.returnAnalyzer = new ReturnStatementAnalyzer(diagnostics, this.expressionAnalyzer, typeAnalyzer);
    this.controlFlowAnalyzer = new ControlFlowStatementAnalyzer(diagnostics);
  }
  analyze(s, context, scope) {
    switch (s.kind) {
      case "variable_declaration_statement": {
        this.variableAnalyzer.analyze(s, scope);
        if (s.asResult && s.value) {
          this.bindResult(s.asResult, s.value, scope.getSymbol(s.name.name)?.type, [s.name.name], context, scope);
        } else if (s.value) {
          this.rejectUnboundFallible(s.value, scope);
        }
        return;
      }
      case "assignment_statement": {
        this.assignmentAnalyzer.analyze(s, context, scope);
        if (s.asResult) {
          const successType = s.target.expressionType ?? this.expressionAnalyzer.analyze(s.target, scope);
          const root = this.rootName(s.root);
          this.bindResult(s.asResult, s.target, successType, root ? [root] : [], context, scope);
        } else {
          this.rejectUnboundFallible(s.target, scope);
        }
        return;
      }
      case "while_statement":
        this.whileAnalyzer.analyze(s, context, scope);
        return;
      case "switch_statement":
        this.switchAnalyzer.analyze(s, context, scope);
        return;
      case "if_statement":
        this.ifAnalyzer.analyze(s, context, scope);
        return;
      case "for_statement":
        this.forAnalyzer.analyze(s, context, scope);
        return;
      case "break_statement":
      case "continue_statement":
        this.controlFlowAnalyzer.analyze(s, context);
        return;
      case "return_statement":
        this.returnAnalyzer.analyze(s, context, scope);
        return;
      case "return_error_statement":
        this.analyzeReturnError(s, context, scope);
        return;
      case "check_block_statement":
        this.analyzeCheck(s, context, scope);
        return;
      case "forward_statement":
        this.analyzeForward(s, context, scope);
        return;
      case "expression_statement":
        this.expressionStatementAnalyzer.analyze(s, scope);
        if (s.asResult) {
          const successType = s.expression.expressionType ?? this.expressionAnalyzer.analyze(s.expression, scope);
          this.bindResult(s.asResult, s.expression, successType, [], context, scope);
        } else {
          this.rejectUnboundFallible(s.expression, scope);
        }
        return;
    }
  }
  analyzeBlock(b, context, scope) {
    this.blockAnalyzer.analyze(b, context, scope);
  }
  bindResult(binding, expression, successType, bindings, context, scope) {
    const errorTypes = this.fallibleErrorTypes(expression, scope);
    if (!errorTypes.length) {
      this.addError(binding.position, "this expression cannot fail; remove `as result`");
      return;
    }
    if (context.pendingResults.has(binding.resultName.name)) {
      this.addError(binding.position, `result name \`${binding.resultName.name}\` is already live`);
      return;
    }
    binding.successType = successType;
    binding.errorTypes = errorTypes;
    const pending = {
      name: binding.resultName.name,
      position: binding.position,
      bindings,
      successType,
      errorTypes,
      handledErrorTypes: /* @__PURE__ */ new Set()
    };
    context.pendingResults.set(binding.resultName.name, pending);
    bindings.forEach((name) => {
      const symbol = scope.getSymbol(name);
      if (symbol)
        symbol.pendingResult = binding.resultName.name;
    });
  }
  fallibleErrorTypes(expression, scope) {
    if (expression.kind == "new_expression") {
      return [CreateType("AllocError", TypeValue.TypeCustom, expression.position)];
    }
    if (expression.kind == "clone_expression") {
      const clonedType = expression.expressionType ?? expression.source.expressionType;
      return clonedType && this.typeAnalyzer.ownershipTier(clonedType, scope) == "cloneable" ? [CreateType("AllocError", TypeValue.TypeCustom, expression.position)] : [];
    }
    if (expression.kind == "function_call_expression") {
      if (expression.resolvedErrorTypes?.length)
        return expression.resolvedErrorTypes;
      const calleeName = expression.callee.kind == "identifier" ? expression.callee.name : "";
      const called = calleeName ? scope.getSymbol(calleeName) : void 0;
      if (called?.signature?.errorTypes.length)
        return called.signature.errorTypes;
      if (expression.conversion && this.isTrappingConversion(expression.conversion)) {
        return [CreateType("NarrowingError", TypeValue.TypeCustom, expression.position)];
      }
      return [];
    }
    if (expression.kind == "binary_expression") {
      if (expression.constantStringValue !== void 0)
        return [];
      const name = ["/", "%"].includes(expression.operator) ? "DivideByZeroError" : ["<<", ">>"].includes(expression.operator) ? "ShiftCountError" : ["+", "-", "*"].includes(expression.operator) ? "OverflowError" : void 0;
      return name ? [CreateType(name, TypeValue.TypeCustom, expression.position)] : [];
    }
    return [];
  }
  isTrappingConversion(conversion) {
    const fromFloat = conversion.fromType.startsWith("float");
    const toFloat = conversion.toType.startsWith("float");
    if (fromFloat && !toFloat)
      return true;
    if (!fromFloat && toFloat)
      return false;
    const fromWidth = this.primitiveWidth(conversion.fromType);
    const toWidth = this.primitiveWidth(conversion.toType);
    const fromUnsigned = conversion.fromType.startsWith("uint");
    const toUnsigned = conversion.toType.startsWith("uint");
    return toWidth < fromWidth || fromUnsigned != toUnsigned;
  }
  primitiveWidth(name) {
    if (name == "intsize" || name == "uintsize")
      return 64;
    const match = name.match(/(8|16|32|64)$/);
    return match ? Number(match[1]) : 32;
  }
  rejectUnboundFallible(expression, scope) {
    if (expression.kind != "function_call_expression")
      return;
    if (expression.resolvedErrorTypes?.length) {
      const methodName = expression.callee.kind == "member_access_expression" ? expression.callee.member.name : "method";
      this.addError(expression.position, `fallible call to \`${methodName}\` must be followed by \`as result\``);
      return;
    }
    const calleeName = expression.callee.kind == "identifier" ? expression.callee.name : "";
    const signature = calleeName ? scope.getSymbol(calleeName)?.signature : void 0;
    if (!signature?.errorTypes.length)
      return;
    this.addError(expression.position, `fallible call to \`${calleeName}\` must be followed by \`as result\``);
  }
  analyzeCheck(statement, context, scope) {
    const pending = context.pendingResults.get(statement.resultName.name);
    if (!pending) {
      this.addError(statement.position, `check \`${statement.resultName.name}\` has no matching \`as result\` binding`);
      return;
    }
    const errorNames = pending.errorTypes.map((type) => type.name.name);
    const selected = statement.errorType?.name.name;
    if (errorNames.length > 1 && !selected) {
      this.addError(statement.position, `result \`${pending.name}\` can return multiple errors; use one typed check per error, such as \`check ${pending.name} as ${errorNames[0]} { ... }\``);
      return;
    }
    if (selected && !errorNames.includes(selected)) {
      this.addError(statement.errorType.position ?? statement.position, `\`${selected}\` is not an error returned by result \`${pending.name}\``);
      return;
    }
    if (selected && pending.handledErrorTypes.has(selected)) {
      this.addError(statement.errorType.position ?? statement.position, `error \`${selected}\` is already checked for result \`${pending.name}\``);
      return;
    }
    this.blockAnalyzer.analyze(statement.body, context, new Scope(scope));
    if (!this.blockDiverges(statement.body)) {
      this.addError(statement.position, "every path in a check block must diverge");
      return;
    }
    if (selected)
      pending.handledErrorTypes.add(selected);
    else
      pending.errorTypes.forEach((type) => pending.handledErrorTypes.add(type.name.name));
    statement.dischargesResult = pending.errorTypes.every((type) => pending.handledErrorTypes.has(type.name.name));
    if (statement.dischargesResult)
      this.discharge(pending, context, scope);
  }
  analyzeForward(statement, context, scope) {
    const pending = context.pendingResults.get(statement.resultName.name);
    if (!pending) {
      this.addError(statement.position, `forward \`${statement.resultName.name}\` has no matching \`as result\` binding`);
      return;
    }
    const enclosing = context.function.signature?.errorTypes ?? [];
    const remaining = pending.errorTypes.filter((errorType) => !pending.handledErrorTypes.has(errorType.name.name));
    const missing = remaining.find((errorType) => !enclosing.some((allowed) => allowed.name.name == errorType.name.name));
    if (missing) {
      this.addError(statement.position, `cannot forward \`${missing.name.name}\`; it is not in this function's error set`);
      return;
    }
    this.discharge(pending, context, scope);
  }
  discharge(pending, context, scope) {
    pending.bindings.forEach((name) => {
      const symbol = scope.getSymbol(name);
      if (symbol?.pendingResult == pending.name)
        symbol.pendingResult = void 0;
    });
    context.pendingResults.delete(pending.name);
  }
  analyzeReturnError(statement, context, scope) {
    const allowed = context.function.signature?.errorTypes ?? [];
    if (!allowed.length) {
      this.addError(statement.position, "cannot return error: enclosing function has no declared error set");
      return;
    }
    const values = statement.values ?? [statement.value];
    if (values.length != 1) {
      this.addError(statement.position, `error return arity mismatch: expected 1 value, got ${values.length}`);
      return;
    }
    const value = values[0];
    let match;
    if (value.kind == "object_literal") {
      const actualFields = value.elements.filter((element) => element.kind == "field_init").map((element) => element.field.name.name).sort();
      match = allowed.find((candidate) => {
        const fields = (scope.getSymbol(candidate.name.name)?.type?.fields ?? []).map((field) => field.name.name).sort();
        return fields.length == actualFields.length && fields.every((field, index) => field == actualFields[index]);
      });
      if (match) {
        value.type = structuredClone(match);
        this.expressionAnalyzer.analyze(value, scope);
      }
    } else {
      const actual = this.expressionAnalyzer.analyze(value, scope);
      match = allowed.find((candidate) => this.typeAnalyzer.typesMatch(candidate, actual) || this.typeAnalyzer.isAliasOf(candidate, actual, scope));
    }
    if (!match) {
      this.addError(value.position, "returned error value does not match any type in the function's error set");
      return;
    }
    statement.resolvedErrorType = match;
    statement.resolvedErrorTypes = [match];
    context.returns = true;
  }
  blockDiverges(block) {
    for (const statement of block.statements) {
      if (this.statementDiverges(statement))
        return true;
    }
    return false;
  }
  statementDiverges(statement) {
    if (["return_statement", "return_error_statement"].includes(statement.kind))
      return true;
    if (statement.kind == "break_statement" || statement.kind == "continue_statement") {
      return statement.validDivergence === true;
    }
    if (statement.kind == "block_statement")
      return this.blockDiverges(statement);
    if (statement.kind == "if_statement") {
      return !!statement.elseBlock && this.blockDiverges(statement.thenBlock) && this.blockDiverges(statement.elseBlock);
    }
    if (statement.kind == "switch_statement") {
      const casesReturn = statement.cases.every((item) => this.blockDiverges({ ...item.body, kind: "block_statement" }));
      const exhaustiveEnum = statement.scrutinee.expressionType?.kind == "enum" && statement.cases.reduce((count, item) => count + item.labels.length, 0) >= (statement.scrutinee.expressionType.variants?.length ?? Infinity);
      return casesReturn && (exhaustiveEnum || !!statement.default && this.blockDiverges({ ...statement.default.body, kind: "block_statement" }));
    }
    return false;
  }
  rootName(expression) {
    if (expression.kind == "identifier")
      return expression.name;
    if (expression.kind == "member_access_expression" || expression.kind == "index_expression") {
      return this.rootName(expression.receiver);
    }
    return "";
  }
  addError(position2, message) {
    this.diagnostics.addError(Error2(this.diagnostics.fileName, "semantic", position2, message));
  }
};

// dist/src/analysis/declarations.js
var DeclarationAnalyzer = class {
  ast;
  diagnostics;
  globalScope;
  statementAnalyzer;
  typeAnalyzer;
  variableAnalyzer;
  constructor(ast, diagnostics, globalScope) {
    this.ast = ast;
    this.diagnostics = diagnostics;
    this.globalScope = globalScope;
    this.statementAnalyzer = new StatementAnalyzer(diagnostics);
    this.typeAnalyzer = new TypeAnalyzer(diagnostics);
    this.variableAnalyzer = new VariableDeclarationStatementAnalyzer(diagnostics);
  }
  /** Registers every named type before signatures and bodies are resolved. */
  registerTypes() {
    this.ast.declarations.forEach((decl) => {
      if (decl.kind == "type_declaration")
        this.analyzeTypeDeclaration(decl);
    });
  }
  /** Runs graph-wide validation that requires all type names to be known. */
  finish() {
    this.detectTypeCycles();
    this.flattenCompositions();
  }
  /** First pass: make every function signature visible for recursive calls. */
  registerFunctions() {
    this.ast.declarations.forEach((decl) => {
      if (decl.kind != "function_declaration")
        return;
      if (decl.receiver)
        return;
      if (this.globalScope.getSymbol(decl.name.name)) {
        this.diagnostics.addError(Error2(this.ast.fileName, "semantic", decl.name.position ?? decl.position, "`" + decl.name.name + "` is declared more than once"));
        return;
      }
      this.globalScope.addSymbol({
        name: decl.name.name,
        kind: SymbolKind.SymbolFuncDecl,
        signature: {
          name: decl.name.name,
          returnTypes: decl.returnTypes,
          errorTypes: decl.errorTypes,
          parameters: decl.parameters,
          declaration: decl,
          typeParameters: decl.typeParameters
        }
      });
    });
  }
  /** Registers and validates receiver functions after record shapes are complete. */
  registerMethods() {
    for (const declaration of this.ast.declarations) {
      if (declaration.kind != "function_declaration" || !declaration.receiver)
        continue;
      const receiver = declaration.receiver;
      if (!receiver.type.reference) {
        this.diagnostics.addError(Error2(this.ast.fileName, "semantic", receiver.position, "method receiver must be a reference (`&T` or `edit &T`)"));
        continue;
      }
      let receiverType = this.globalScope.getSymbol(receiver.type.name.name);
      while (receiverType?.kind == SymbolKind.SymbolTypsAliasDecl && receiverType.type) {
        receiverType = this.globalScope.getSymbol(receiverType.type.name.name);
      }
      if (receiverType?.kind != SymbolKind.SymbolTypeStructDecl || !receiverType.type) {
        this.diagnostics.addError(Error2(this.ast.fileName, "semantic", receiver.position, `method receiver must be a record type, got ${receiver.type.name.name}`));
        continue;
      }
      const recordName = receiverType.name;
      if (receiverType.type.fields?.some((field) => field.name.name == declaration.name.name)) {
        this.diagnostics.addError(Error2(this.ast.fileName, "semantic", declaration.name.position ?? declaration.position, `method ${declaration.name.name} collides with field ${declaration.name.name} on type ${recordName}`));
        continue;
      }
      if (declaration.name.name == "dispose") {
        const typeDeclaration = receiverType.declaration?.kind == "type_declaration" ? receiverType.declaration : void 0;
        if (!typeDeclaration?.unique)
          this.diagnostics.addError(Error2(this.ast.fileName, "semantic", declaration.name.position ?? declaration.position, `dispose method is allowed only on an explicit unique type ${recordName}`));
        if (!receiver.type.edit)
          this.diagnostics.addError(Error2(this.ast.fileName, "semantic", receiver.position, `dispose receiver must be an editable reference; use edit &${recordName}`));
        if (declaration.parameters.length)
          this.diagnostics.addError(Error2(this.ast.fileName, "semantic", declaration.parameters[0].position, "parameters in dispose method are not allowed"));
        if (declaration.errorTypes.length)
          this.diagnostics.addError(Error2(this.ast.fileName, "semantic", declaration.errorTypes[0].position ?? declaration.position, "dispose method cannot have an error channel"));
        if (declaration.returnTypes.length)
          this.diagnostics.addError(Error2(this.ast.fileName, "semantic", declaration.returnTypes[0].position ?? declaration.position, "dispose method must be void"));
      }
      const resolvedReceiver = structuredClone(receiverType.type);
      resolvedReceiver.reference = true;
      resolvedReceiver.edit = !!receiver.type.edit;
      const signature = {
        name: declaration.name.name,
        returnTypes: declaration.returnTypes,
        errorTypes: declaration.errorTypes,
        parameters: declaration.parameters,
        declaration,
        typeParameters: declaration.typeParameters,
        receiverType: resolvedReceiver,
        receiverName: receiver.name.name,
        receiverEdit: !!receiver.type.edit
      };
      if (!this.globalScope.addMethod(recordName, declaration.name.name, signature)) {
        this.diagnostics.addError(Error2(this.ast.fileName, "semantic", declaration.name.position ?? declaration.position, `duplicate method ${declaration.name.name} on type ${recordName}`));
      }
    }
  }
  /** Second pass: analyze a top-level type, variable, or function declaration. */
  analyze(decl) {
    switch (decl.kind) {
      case "type_declaration":
        return;
      case "variable_declaration_statement":
        this.variableAnalyzer.analyze(decl, this.globalScope);
        return;
      case "function_declaration":
        this.analyzeFunctionDeclaration(decl);
    }
  }
  /** Validates a function signature and delegates its body to the statement layer. */
  analyzeFunctionDeclaration(decl) {
    const functionScope = new Scope(this.globalScope);
    functionScope.activeFunction = decl;
    let methodSignature;
    if (decl.receiver) {
      const receiverSymbol = this.globalScope.getSymbol(decl.receiver.type.name.name);
      const recordName = receiverSymbol?.kind == SymbolKind.SymbolTypsAliasDecl ? receiverSymbol.type?.name.name : decl.receiver.type.name.name;
      methodSignature = recordName ? this.globalScope.getMethod(recordName, decl.name.name) : void 0;
      if (methodSignature?.receiverType) {
        functionScope.addSymbol({
          name: decl.receiver.name.name,
          kind: methodSignature.receiverEdit ? SymbolKind.SymbolLocalLet : SymbolKind.SymbolLocalConst,
          type: methodSignature.receiverType,
          assigned: true,
          moved: "active"
        });
      }
    }
    if (decl.receiver && !methodSignature)
      return;
    decl.parameters.forEach((parameter) => {
      if (functionScope.getSymbol(parameter.name.name)) {
        this.diagnostics.addError(Error2(this.ast.fileName, "semantic", parameter.position, "redeclared parameter " + parameter.name.name));
        return;
      }
      if (!this.isValidFunctionSignatureType(parameter.type, decl, parameter.position, "parameter")) {
        functionScope.addSymbol({
          name: parameter.name.name,
          kind: SymbolKind.SymbolParameter,
          type: { ...parameter.type, value: TypeValue.TypeInvalid },
          assigned: true,
          moved: "active"
        });
        return;
      }
      functionScope.addSymbol({
        name: parameter.name.name,
        kind: SymbolKind.SymbolParameter,
        type: parameter.type,
        assigned: true,
        moved: "active"
      });
    });
    decl.returnTypes.forEach((type, index) => {
      if (this.isValidFunctionSignatureType(type, decl, type.position ?? decl.position, "return")) {
        return;
      }
      decl.returnTypes[index] = { ...type, value: TypeValue.TypeInvalid };
    });
    const normalizedErrors = [];
    decl.errorTypes.forEach((type) => {
      if (this.typeAnalyzer.isValidPrimitiveType(type)) {
        this.diagnostics.addError(Error2(this.ast.fileName, "semantic", type.position, `error type \`${type.name.name}\` must be a declared record type`));
        return;
      }
      const errorSymbol = this.globalScope.getSymbol(type.name.name);
      if (!errorSymbol) {
        this.diagnostics.addError(Error2(this.ast.fileName, "semantic", type.position, "unknown type identifier: " + type.name.name));
        return;
      }
      if (errorSymbol.kind != SymbolKind.SymbolTypeStructDecl) {
        this.diagnostics.addError(Error2(this.ast.fileName, "semantic", type.position, `error type \`${type.name.name}\` must be a declared record type`));
        return;
      }
      if (!normalizedErrors.some((entry) => entry.name.name == type.name.name)) {
        normalizedErrors.push({ ...type, kind: "struct" });
      }
    });
    decl.errorTypes = normalizedErrors;
    const symbol = decl.receiver ? { name: decl.name.name, kind: SymbolKind.SymbolFuncDecl, signature: methodSignature } : this.globalScope.getSymbol(decl.name.name);
    if (symbol?.signature)
      symbol.signature.errorTypes = normalizedErrors;
    if (!decl.receiver && decl.name.name == "main" && !this.verifyMainFunctionSignature(symbol?.signature)) {
      this.diagnostics.addError(Error2(this.ast.fileName, "semantic", decl.name.position ?? decl.position, "`main` must be declared at top level as `function main(): uint8`"));
      return;
    }
    const context = {
      kind: BlockKind.FunctionBlock,
      function: symbol,
      returns: false,
      loopDepth: 0,
      switch: false,
      scopedAssignments: [],
      pendingResults: /* @__PURE__ */ new Map()
    };
    this.statementAnalyzer.analyzeBlock(decl.body, context, functionScope);
    for (const pending of context.pendingResults.values()) {
      const missing = pending.errorTypes.map((type) => type.name.name).filter((name) => !pending.handledErrorTypes.has(name));
      this.diagnostics.addError(Error2(this.ast.fileName, "semantic", pending.position, `fallible result \`${pending.name}\` is not fully handled; missing check${missing.length == 1 ? "" : "s"} for ${missing.map((name) => `\`${name}\``).join(", ")}`));
    }
    if (decl.returnTypes.length > 0 && !this.statementAnalyzer.blockDiverges(decl.body)) {
      this.diagnostics.addError(Error2(this.ast.fileName, "semantic", decl.name.position ?? decl.position, `missing return: function ${decl.name.name} must return a value on all reachable paths`));
    }
    return;
  }
  /**
   * Validates a type that appears in a function signature. Named types must
   * resolve to a type declaration, whereas generic types must be declared by
   * this function's own type-parameter list.
   */
  isValidFunctionSignatureType(type, decl, position2, usage) {
    if (this.typeAnalyzer.isIndirection(type)) {
      if (usage == "return") {
        this.diagnostics.addError(Error2(this.ast.fileName, "semantic", type.position ?? position2, "indirection types are only permitted in record fields and function parameters"));
        return false;
      }
      return this.validateIndirectionType(type, type.position ?? position2);
    }
    if (this.typeAnalyzer.isValidPrimitiveType(type)) {
      return true;
    }
    if (type.value == TypeValue.TypeGeneric) {
      const declared = decl.typeParameters?.some((typeParameter) => typeParameter.name.name == type.name.name);
      if (declared) {
        return true;
      }
      this.diagnostics.addError(Error2(this.ast.fileName, "semantic", position2, "undeclared type parameter: " + type.name.name));
      return false;
    }
    if (type.value == TypeValue.TypeCustom) {
      const symbol = this.globalScope.getSymbol(type.name.name);
      const isTypeDeclaration = symbol !== void 0 && [
        SymbolKind.SymbolTypeStructDecl,
        SymbolKind.SymbolTypeEnumDecl,
        SymbolKind.SymbolTypeUnionDecl,
        SymbolKind.SymbolTypsAliasDecl
      ].includes(symbol.kind);
      if (isTypeDeclaration) {
        return true;
      }
      this.diagnostics.addError(Error2(this.ast.fileName, "semantic", position2, "unknown type identifier: " + type.name.name));
      return false;
    }
    this.diagnostics.addError(Error2(this.ast.fileName, "semantic", position2, `invalid ${usage} type: ` + type.name.name));
    return false;
  }
  /** Checks the required zero-argument, non-error `uint8` main signature. */
  verifyMainFunctionSignature(signature) {
    return signature.parameters.length == 0 && signature.errorTypes.length == 0 && signature.returnTypes.length == 1 && signature.returnTypes[0]?.value == TypeValue.Type_UInt8;
  }
  /** Registers union, enum, struct, and alias declarations in the global scope. */
  analyzeTypeDeclaration(decl) {
    if (this.globalScope.getSymbol(decl.name.name)) {
      this.diagnostics.addError(Error2(this.ast.fileName, "semantic", decl.name.position ?? decl.position, "duplicate type declaration: " + decl.name.name));
      return;
    }
    if (decl.declKind == TypeDeclKind.Union) {
      const value2 = decl.declaration;
      for (const variant of value2.variants) {
        const unknownType = this.findUnknownDeclaredType(variant, value2.typeParameters);
        if (unknownType) {
          this.diagnostics.addError(Error2(this.ast.fileName, "semantic", unknownType.position ?? decl.position, "unknown type identifier: " + unknownType.name.name));
          return;
        }
      }
      if (this.hasDuplicates(value2.variants.map((variant) => variant.name), decl, "variant")) {
        return;
      }
      this.globalScope.addSymbol({
        name: decl.name.name,
        kind: SymbolKind.SymbolTypeUnionDecl,
        type: {
          name: value2.name,
          unionVariants: value2.variants,
          typeParameters: value2.typeParameters,
          kind: "union",
          custom: true,
          value: TypeValue.TypeCustom
        }
      });
      return;
    }
    if (decl.declKind == TypeDeclKind.Enum) {
      const value2 = decl.declaration;
      if (this.hasDuplicates(value2.variants.map((variant) => variant.name), decl, "variant"))
        return;
      this.globalScope.addSymbol({
        name: decl.name.name,
        kind: SymbolKind.SymbolTypeEnumDecl,
        type: {
          name: value2.name,
          variants: value2.variants,
          kind: "enum",
          custom: true,
          value: TypeValue.TypeCustom
        }
      });
      return;
    }
    if (decl.declKind == TypeDeclKind.Struct) {
      const value2 = decl.declaration;
      for (const field of value2.fields) {
        if (this.typeAnalyzer.isIndirection(field.type) && !this.validateIndirectionType(field.type, field.type.position ?? field.name.position ?? decl.position)) {
          return;
        }
        if (!this.isDeclaredFieldType(field.type, value2.typeParameters)) {
          const position2 = field.type.position ?? field.name.position ?? decl.position;
          this.diagnostics.addError(Error2(this.ast.fileName, "semantic", position2, "unknown type identifier: " + field.type.name.name));
          return;
        }
        if (field.type.arrayLengths?.some((length) => length == 0)) {
          this.diagnostics.addError(Error2(this.ast.fileName, "semantic", field.type.position ?? field.name.position ?? decl.position, "zero length arrays types are not allowed!"));
          return;
        }
        if (field.type.name.name == "void") {
          this.diagnostics.addError(Error2(this.ast.fileName, "semantic", field.type.position ?? field.name.position ?? decl.position, "void is not a valid struct field type"));
          return;
        }
      }
      if (this.hasDuplicates(value2.fields.map((field) => field.name), decl, "field"))
        return;
      this.globalScope.addSymbol({
        name: decl.name.name,
        kind: SymbolKind.SymbolTypeStructDecl,
        declaration: decl,
        type: {
          name: value2.name,
          fields: value2.fields,
          typeParameters: value2.typeParameters,
          kind: "struct",
          custom: true,
          value: TypeValue.TypeCustom
        }
      });
      return;
    }
    const value = decl.declaration;
    this.globalScope.addSymbol({
      name: decl.name.name,
      kind: SymbolKind.SymbolTypsAliasDecl,
      declaration: decl,
      type: value.target
    });
  }
  /** Finds the first undeclared name in a union variant and its type arguments. */
  findUnknownDeclaredType(type, typeParameters) {
    const isTypeParameter = typeParameters?.some((parameter) => parameter.name.name == type.name.name);
    const symbol = this.globalScope.getSymbol(type.name.name);
    const isDeclaredTypeSymbol = symbol !== void 0 && [
      SymbolKind.SymbolTypeStructDecl,
      SymbolKind.SymbolTypeEnumDecl,
      SymbolKind.SymbolTypeUnionDecl,
      SymbolKind.SymbolTypsAliasDecl
    ].includes(symbol.kind);
    const isDeclaredType = isDeclaredTypeSymbol || this.ast.declarations.some((declaration) => declaration.kind == "type_declaration" && declaration.name.name == type.name.name);
    if (!isTypeParameter && !this.typeAnalyzer.isValidPrimitiveType(type) && !isDeclaredType) {
      return type;
    }
    for (const argument of type.typeParameters ?? []) {
      const unknownType = this.findUnknownDeclaredType(argument, typeParameters);
      if (unknownType)
        return unknownType;
    }
    return void 0;
  }
  isDeclaredFieldType(type, typeParameters) {
    if (this.typeAnalyzer.isIndirection(type))
      return true;
    if (this.typeAnalyzer.isValidPrimitiveType(type))
      return true;
    if (type.value == TypeValue.TypeGeneric && typeParameters?.some((parameter) => parameter.name.name == type.name.name)) {
      return true;
    }
    return this.ast.declarations.some((declaration) => declaration.kind == "type_declaration" && declaration.name.name == type.name.name);
  }
  validateIndirectionType(type, position2) {
    const arguments_ = type.typeParameters ?? [];
    if (arguments_.length != 1) {
      this.diagnostics.addError(Error2(this.ast.fileName, "semantic", position2, `${type.name.name}<T> requires exactly one type argument`));
      return false;
    }
    const inner = arguments_[0];
    if (inner.name.name == "void") {
      this.diagnostics.addError(Error2(this.ast.fileName, "semantic", inner.position ?? position2, "cannot allocate void"));
      return false;
    }
    if (this.typeAnalyzer.isIndirection(inner)) {
      return this.validateIndirectionType(inner, inner.position ?? position2);
    }
    const declared = this.ast.declarations.some((declaration) => declaration.kind == "type_declaration" && declaration.name.name == inner.name.name);
    if (inner.value != TypeValue.TypeGeneric && !this.typeAnalyzer.isValidPrimitiveType(inner) && !declared) {
      this.diagnostics.addError(Error2(this.ast.fileName, "semantic", inner.position ?? position2, "unknown type identifier: " + inner.name.name));
      return false;
    }
    return true;
  }
  detectTypeCycles() {
    const declarations = /* @__PURE__ */ new Map();
    for (const declaration of this.ast.declarations) {
      if (declaration.kind == "type_declaration")
        declarations.set(declaration.name.name, declaration);
    }
    const state2 = /* @__PURE__ */ new Map();
    const stack = [];
    const reported = /* @__PURE__ */ new Set();
    const edges = (declaration) => {
      if (declaration.declKind == TypeDeclKind.Alias) {
        return [declaration.declaration.target.name.name];
      }
      if (declaration.declKind != TypeDeclKind.Struct)
        return [];
      const struct = declaration.declaration;
      return [
        ...struct.fields.filter((field) => !this.typeAnalyzer.isIndirection(field.type) && !field.type.reference).map((field) => field.type.name.name),
        ...(struct.compositions ?? []).map((type) => type.name.name)
      ];
    };
    const visit = (name) => {
      const declaration = declarations.get(name);
      if (!declaration || state2.get(name) == 2)
        return;
      if (state2.get(name) == 1) {
        const start = stack.indexOf(name);
        const cycle = [...stack.slice(start), name];
        const key = [...new Set(cycle)].sort().join("|");
        if (!reported.has(key)) {
          reported.add(key);
          this.diagnostics.addError(Error2(this.ast.fileName, "semantic", declaration.name.position ?? declaration.position, `type cycle has infinite size: ${cycle.join(" -> ")}; use owned<T> to break the cycle`));
        }
        return;
      }
      state2.set(name, 1);
      stack.push(name);
      edges(declaration).forEach(visit);
      stack.pop();
      state2.set(name, 2);
    };
    declarations.forEach((_, name) => visit(name));
  }
  flattenCompositions() {
    const resolving = /* @__PURE__ */ new Set();
    const cache = /* @__PURE__ */ new Map();
    const resolve = (name) => {
      if (cache.has(name))
        return structuredClone(cache.get(name));
      if (resolving.has(name))
        return [];
      const symbol = this.globalScope.getSymbol(name);
      const declaration = symbol?.declaration;
      if (symbol?.kind == SymbolKind.SymbolTypsAliasDecl && symbol.type)
        return resolve(symbol.type.name.name);
      if (declaration?.kind != "type_declaration" || declaration.declKind != TypeDeclKind.Struct)
        return [];
      resolving.add(name);
      const struct = declaration.declaration;
      for (const composition of struct.compositions ?? []) {
        const operand = this.globalScope.getSymbol(composition.name.name);
        const isRecord = operand?.kind == SymbolKind.SymbolTypeStructDecl || operand?.kind == SymbolKind.SymbolTypsAliasDecl;
        if (!isRecord) {
          this.diagnostics.addError(Error2(this.ast.fileName, "semantic", composition.position ?? declaration.position, `non struct type ${composition.name.name} cannot be used in composition`));
        }
      }
      const fields = [
        ...(struct.compositions ?? []).flatMap((composition) => resolve(composition.name.name)),
        ...struct.fields
      ];
      resolving.delete(name);
      const duplicate = fields.find((field, index) => fields.findIndex((other) => other.name.name == field.name.name) != index);
      if (duplicate) {
        this.diagnostics.addError(Error2(this.ast.fileName, "semantic", duplicate.name.position ?? declaration.position, `duplicate field collision in composition: ${duplicate.name.name}`));
      }
      cache.set(name, fields);
      struct.fields = fields;
      if (symbol?.type)
        symbol.type.fields = fields;
      return structuredClone(fields);
    };
    for (const declaration of this.ast.declarations) {
      if (declaration.kind == "type_declaration" && declaration.declKind == TypeDeclKind.Struct)
        resolve(declaration.name.name);
    }
  }
  hasDuplicates(names, decl, noun) {
    const duplicates = names.filter((name, index) => names.findIndex((candidate) => candidate.name == name.name) != index);
    if (duplicates.length == 0)
      return false;
    this.diagnostics.addError(Error2(this.ast.fileName, "semantic", duplicates[0].position ?? decl.name.position ?? decl.position, "duplicate " + noun + "(s) detected: " + duplicates.map((name) => name.name).join(", ")));
    return true;
  }
};

// dist/src/analysis/core.js
var AnalyzerCore = class {
  ast;
  diagnostics;
  globalScope;
  declarationAnalyzer;
  constructor(ast, diagnostics, globalScope = new Scope()) {
    this.ast = ast;
    this.diagnostics = diagnostics;
    this.globalScope = globalScope;
    this.declarationAnalyzer = new DeclarationAnalyzer(ast, diagnostics, this.globalScope);
  }
  /** Registers functions first, then analyzes every declaration. */
  analyze() {
    this.declarationAnalyzer.registerTypes();
    this.declarationAnalyzer.finish();
    this.declarationAnalyzer.registerMethods();
    this.declarationAnalyzer.registerFunctions();
    this.ast.declarations.forEach((declaration) => this.declarationAnalyzer.analyze(declaration));
    return this.globalScope;
  }
};

// dist/src/ast/documentation.js
function isDocumentationComment(token) {
  return token.kind === TokenKind.Kind_LineComment && token.value.startsWith("///") || token.kind === TokenKind.Kind_BlockComment && token.value.startsWith("/**");
}
function tokenEndLine(token) {
  return token.line + (token.value.match(/\n/g)?.length ?? 0);
}
function documentationCommentText(token) {
  if (token.kind === TokenKind.Kind_LineComment) {
    return token.value.slice(3).replace(/^ /, "");
  }
  const body = token.value.slice(3, token.value.endsWith("*/") ? -2 : void 0);
  let lines = body.replace(/\r\n?/g, "\n").split("\n");
  lines = lines.map((line) => {
    const starred = line.match(/^[ \t]*\*(?: ?)(.*)$/);
    return starred ? starred[1] : line;
  });
  while (lines.length && lines[0].trim() === "")
    lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === "")
    lines.pop();
  const indents = lines.filter((line) => line.trim().length > 0).map((line) => line.match(/^[ \t]*/)?.[0].length ?? 0);
  const commonIndent = indents.length ? Math.min(...indents) : 0;
  if (commonIndent)
    lines = lines.map((line) => line.slice(commonIndent));
  if (lines.length) {
    lines[0] = lines[0].replace(/^[ \t]+/, "");
    lines[lines.length - 1] = lines[lines.length - 1].replace(/[ \t]+$/, "");
  }
  return lines.join("\n");
}
function documentationFromComments(tokens) {
  const documentation = tokens.map(documentationCommentText).join("\n");
  return documentation.length ? documentation : void 0;
}
function documentationBefore(tokens, declarationIndex) {
  const declaration = tokens[declarationIndex];
  if (!declaration)
    return void 0;
  const comments = [];
  let laterLine = declaration.line;
  for (let index = declarationIndex - 1; index >= 0; index--) {
    const token = tokens[index];
    if (!isDocumentationComment(token) || laterLine - tokenEndLine(token) > 1)
      break;
    comments.unshift(token);
    laterLine = token.line;
  }
  return documentationFromComments(comments);
}

// dist/src/ast/parser.js
var Parser = class {
  pos = 0;
  tokens;
  diagnostics;
  filepath;
  typeDecls;
  objectValueDecls;
  objectNonValueDecls;
  constructor(filepath, d) {
    this.diagnostics = d;
    this.tokens = [];
    this.filepath = filepath;
    this.typeDecls = /* @__PURE__ */ new Map();
    this.objectValueDecls = /* @__PURE__ */ new Map();
    this.objectNonValueDecls = /* @__PURE__ */ new Map();
  }
  /** Advances the cursor by one and returns the now-current token. */
  advance() {
    const currentToken = this.tokens[this.pos];
    this.pos++;
    return currentToken;
  }
  /**
   * Asserts the current token is of `kind`. On match, consumes it and returns
   * it; otherwise records `message` as an error at the previous token's
   * position and returns `undefined` without advancing.
   */
  expect(kind, message) {
    const currentToken = this.tokens[this.pos];
    if (currentToken?.kind != kind) {
      const token = currentToken ?? this.tokens[this.pos - 1];
      const { line, column, start, end } = token;
      this.diagnostics.addError(Error2(this.filepath, "parser", Position(line, column, start, end), message));
      return;
    } else {
      this.pos++;
    }
    return currentToken;
  }
  /** Returns the token at the cursor without consuming it. */
  current() {
    return this.tokens[this.pos];
  }
  /** Peeks at the next token and returns it without advancing the cursor. */
  peek() {
    if (this.current().kind != TokenKind.Kind_EOF) {
      return this.tokens[this.pos + 1];
    }
    return this.current();
  }
  /** Snapshots the current token's source span as a {@link Position}. */
  getCurrentPosition() {
    return {
      start: this.current().start,
      end: this.current().end,
      line: this.current().line,
      column: this.current().column
    };
  }
  /** Consumes any run of line or block comment tokens at the cursor. */
  skipComments() {
    while (this.current().kind == TokenKind.Kind_LineComment || this.current().kind == TokenKind.Kind_BlockComment) {
      this.advance();
    }
  }
  /**
   * Consumes comments at the cursor and returns Markdown from the final
   * contiguous documentation-comment run when it directly precedes the next
   * token. Ordinary comments and blank lines break the association.
   */
  takeDocumentationComments() {
    let comments = [];
    while (this.current().kind == TokenKind.Kind_LineComment || this.current().kind == TokenKind.Kind_BlockComment) {
      const comment = this.advance();
      if (!isDocumentationComment(comment)) {
        comments = [];
        continue;
      }
      const previous2 = comments[comments.length - 1];
      if (previous2 && comment.line - tokenEndLine(previous2) > 1)
        comments = [];
      comments.push(comment);
    }
    const last = comments[comments.length - 1];
    if (!last || this.current().line - tokenEndLine(last) > 1)
      return void 0;
    return documentationFromComments(comments);
  }
  /** Parses fixed-array extents or the terminal slice suffix following a type name. */
  parseArraySuffixes() {
    const arrayLengths = [];
    let slice = false;
    while (this.current().kind == TokenKind.Symbol_LeftBracket) {
      this.advance();
      if (this.current().kind == TokenKind.Symbol_RightBracket) {
        if (slice || arrayLengths.length) {
          this.diagnostics.addError(Error2(this.filepath, "parser", this.getCurrentPosition(), "a slice type `T[]` cannot be combined with fixed-array extents"));
          return;
        }
        slice = true;
        this.advance();
        continue;
      }
      if (slice) {
        this.diagnostics.addError(Error2(this.filepath, "parser", this.getCurrentPosition(), "a slice type `T[]` cannot be combined with fixed-array extents"));
        return;
      }
      const length = this.expect(TokenKind.Kind_IntegerLiteral, "array length expected, must be an integer literal");
      if (!length) {
        return;
      }
      if (!this.expect(TokenKind.Symbol_RightBracket, "] symbol expected")) {
        return;
      }
      arrayLengths.push(parseInt(length.value));
    }
    return { arrayLengths, slice };
  }
  /** Parses a source type, including references, indirection, generics, and arrays. */
  parseTypeReference(typeParameters) {
    let edit = false;
    let reference = false;
    if (this.current().kind == TokenKind.Keyword_Edit) {
      edit = true;
      this.advance();
    }
    if (this.current().kind == TokenKind.Symbol_Ampersand) {
      reference = true;
      this.advance();
    }
    if (edit && !reference) {
      this.diagnostics.addError(Error2(this.filepath, "parser", this.getCurrentPosition(), "`edit` may only qualify a reference (`edit &T`)"));
      return;
    }
    const token = this.current();
    if (token.kind != TokenKind.Kind_Identifier && token.kind != TokenKind.Keyword_Heap) {
      this.diagnostics.addError(Error2(this.filepath, "parser", this.getCurrentPosition(), "type identifier expected"));
      return;
    }
    this.advance();
    const nameParts = [token.kind == TokenKind.Keyword_Heap ? "owned" : token.value];
    while (this.current().kind == TokenKind.Symbol_Dot) {
      this.advance();
      const member = this.current();
      if (member.kind != TokenKind.Kind_Identifier && member.kind != TokenKind.Keyword_Const) {
        this.diagnostics.addError(Error2(this.filepath, "parser", this.getCurrentPosition(), "type identifier expected after ."));
        return;
      }
      this.advance();
      nameParts.push(member.value);
    }
    const sourceName = nameParts.join(".");
    let type = CreateType(sourceName, this.resolveTypeValue(sourceName), getTokenPosition(token));
    const parameter = typeParameters?.find((candidate) => candidate.name.name == sourceName);
    if (parameter)
      type = { ...parameter, position: getTokenPosition(token) };
    if (this.current().kind == TokenKind.Symbol_Less) {
      const arguments_ = this.parseTypeParams(false);
      if (!arguments_)
        return;
      type.typeParameters = arguments_.map((argument) => this.resolveFunctionTypeParameters(argument, typeParameters));
    } else if (token.kind == TokenKind.Keyword_Heap) {
      this.diagnostics.addError(Error2(this.filepath, "parser", getTokenPosition(token), "owned type requires one type argument"));
      return;
    }
    const arraySuffixes = this.parseArraySuffixes();
    if (!arraySuffixes)
      return;
    type.arrayLengths = arraySuffixes.arrayLengths.length ? arraySuffixes.arrayLengths : void 0;
    type.slice = arraySuffixes.slice || void 0;
    type.reference = reference;
    type.edit = edit;
    return type;
  }
  /**
   * Parses a parenthesized, comma-separated parameter list of the form
   * `(name: Type, …)`. Returns an empty list for `()`, or `undefined` if any
   * expected token is missing. Leaves the cursor just past the closing `)`.
   */
  parseFuncParams(typeParams) {
    const params = [];
    if (!this.expect(TokenKind.Symbol_LeftParen, "( symbol expected")) {
      return;
    }
    if (this.current().kind == TokenKind.Symbol_RightParen) {
      this.advance();
      return params;
    }
    while (this.current().kind != TokenKind.Symbol_RightParen) {
      if (this.current().kind == TokenKind.Symbol_Ellipsis) {
        this.diagnostics.addError(Error2(this.filepath, "parser", this.getCurrentPosition(), "variadic parameters are not supported; declare a slice parameter such as `items: T[]` instead"));
        return;
      }
      const p = this.expect(TokenKind.Kind_Identifier, "identifier expected");
      if (!p || !this.expect(TokenKind.Symbol_Colon, ": symbol expected"))
        return;
      const t = this.parseTypeReference(typeParams);
      if (!t)
        return;
      this.objectNonValueDecls.set(p.value, t.name.name);
      params.push({
        position: getTokenPosition(p),
        name: CreateIdentifier(p.value, getTokenPosition(p)),
        type: t
      });
      if (this.current().kind == TokenKind.Symbol_Comma) {
        this.advance();
        continue;
      }
      if (this.current().kind != TokenKind.Symbol_RightParen) {
        this.diagnostics.addError(Error2(this.filepath, "parser", this.getCurrentPosition(), ", or ) expected"));
        return;
      }
    }
    this.advance();
    return params;
  }
  /**
   * Parses a function's return type. `void` yields an empty list, signalling
   * no return value. Currently only a single type is supported.
   */
  parseFuncReturnTypes(typeParams) {
    const returns = [];
    while (true) {
      const returnType = this.parseTypeReference(typeParams);
      if (!returnType)
        return;
      if (returnType.name.name == "void") {
        if (returns.length) {
          this.diagnostics.addError(Error2(this.filepath, "parser", returnType.position, "void cannot be combined with another return type"));
          return;
        }
        return [];
      }
      returns.push(returnType);
      if (this.current().kind != TokenKind.Symbol_Comma)
        break;
      this.advance();
    }
    return returns;
  }
  /**
   * Parses a function's error type for the channel-style error model. `void`
   * yields an empty list, signalling the function cannot fail. Currently only
   * a single type is supported.
   */
  parseFuncErrorTypes() {
    const errors = [];
    while (true) {
      const errorType = this.parseTypeReference();
      if (!errorType)
        return;
      errors.push(errorType);
      if (this.current().kind != TokenKind.Symbol_Comma)
        break;
      this.advance();
    }
    return errors;
  }
  parseTypeParams(decl) {
    this.advance();
    const types = [];
    while (this.current().kind != TokenKind.Symbol_Greater && this.current().kind != TokenKind.Symbol_ShiftRight) {
      if (decl && this.current().kind == TokenKind.Symbol_Ellipsis) {
        this.diagnostics.addError(Error2(this.filepath, "parser", this.getCurrentPosition(), "variadic type parameters are not supported"));
        return;
      }
      const tName = this.expect(TokenKind.Kind_Identifier, "type identifier expected");
      if (!tName) {
        return;
      }
      const nameParts = [tName.value];
      while (this.current().kind == TokenKind.Symbol_Dot) {
        this.advance();
        const member = this.current();
        if (member.kind != TokenKind.Kind_Identifier && member.kind != TokenKind.Keyword_Const) {
          this.diagnostics.addError(Error2(this.filepath, "parser", this.getCurrentPosition(), "type identifier expected after ."));
          return;
        }
        this.advance();
        nameParts.push(member.value);
      }
      const sourceName = nameParts.join(".");
      const type = CreateType(sourceName, decl ? TypeValue.TypeGeneric : this.resolveTypeValue(sourceName), getTokenPosition(tName));
      if (decl && this.current().kind == TokenKind.Symbol_Colon) {
        this.diagnostics.addError(Error2(this.filepath, "parser", this.getCurrentPosition(), `type parameter bounds are not supported; declare \`${sourceName}\` without a constraint`));
        return;
      }
      if (!decl && this.current().kind == TokenKind.Symbol_Less) {
        type.typeParameters = this.parseTypeParams(false);
        if (!type.typeParameters) {
          return;
        }
      }
      if (!decl) {
        const arraySuffixes = this.parseArraySuffixes();
        if (!arraySuffixes) {
          return;
        }
        type.arrayLengths = arraySuffixes.arrayLengths.length ? arraySuffixes.arrayLengths : void 0;
        type.slice = arraySuffixes.slice || void 0;
      }
      types.push(type);
      if (this.current().kind == TokenKind.Symbol_Comma) {
        this.advance();
        continue;
      }
    }
    if (this.current().kind == TokenKind.Symbol_ShiftRight) {
      const secondClose = { ...this.current(), kind: TokenKind.Symbol_Greater, value: ">" };
      this.current().kind = TokenKind.Symbol_Greater;
      this.current().value = ">";
      this.tokens.splice(this.pos + 1, 0, secondClose);
    }
    this.advance();
    if (decl) {
      const seenTypeParameters = /* @__PURE__ */ new Set();
      const duplicateTypeParameter = types.find((type) => {
        if (seenTypeParameters.has(type.name.name)) {
          return true;
        }
        seenTypeParameters.add(type.name.name);
        return false;
      });
      if (duplicateTypeParameter) {
        this.diagnostics.addError(Error2(this.filepath, "parser", duplicateTypeParameter.position, "duplicate type parameter: " + duplicateTypeParameter.name.name));
        return;
      }
    }
    return types;
  }
  /** Reclassifies nested type arguments that refer to a function's `<T>` list. */
  resolveFunctionTypeParameters(type, typeParameters) {
    const typeParameter = typeParameters?.find((parameter) => parameter.name.name == type.name.name);
    if (typeParameter) {
      return { ...typeParameter, position: type.position };
    }
    type.typeParameters = type.typeParameters?.map((argument) => this.resolveFunctionTypeParameters(argument, typeParameters));
    return type;
  }
  /**
   * Parses a full function declaration: the `function` keyword, name,
   * parameter list, an optional `:` return type, and the body block. Assumes
   * the cursor is on the `function` keyword.
   */
  parseFuncDecl() {
    const fnPos = this.getCurrentPosition();
    this.advance();
    let receiver;
    if (this.current().kind == TokenKind.Symbol_LeftParen) {
      const parsed = this.parseFuncParams();
      if (!parsed)
        return;
      if (parsed.length != 1) {
        this.diagnostics.addError(Error2(this.filepath, "parser", fnPos, "a receiver clause must contain exactly one binding"));
        return;
      }
      receiver = parsed[0];
    }
    const fnName = this.expect(TokenKind.Kind_Identifier, "identifier expected");
    if (!fnName) {
      return;
    }
    let typeparams = [];
    if (this.current().kind == TokenKind.Symbol_Less) {
      typeparams = this.parseTypeParams(true);
      if (!typeparams) {
        return;
      }
    }
    if (receiver) {
      receiver.type = this.resolveFunctionTypeParameters(receiver.type, typeparams);
    }
    const params = this.parseFuncParams(typeparams);
    if (!params) {
      return;
    }
    let returnTypes = [];
    let errorTypes = [];
    if (this.current().kind == TokenKind.Symbol_Colon) {
      this.advance();
      let rt = this.parseFuncReturnTypes(typeparams);
      if (!rt) {
        return;
      }
      returnTypes = rt;
    } else if (this.current().kind == TokenKind.Kind_Identifier) {
      this.diagnostics.addError(Error2(this.filepath, "parser", this.getCurrentPosition(), `invalid symbol ${this.current().value}, symbol : expected`));
      return;
    }
    if (this.current().kind == TokenKind.Symbol_Pipe) {
      this.advance();
      const parsedErrors = this.parseFuncErrorTypes();
      if (!parsedErrors)
        return;
      errorTypes = parsedErrors;
    }
    if (this.current().kind == TokenKind.Symbol_Semicolon) {
      const semicolon = this.advance();
      this.diagnostics.addError(Error2(this.filepath, "parser", getTokenPosition(semicolon), "a function declaration requires a body"));
      return;
    }
    const blockContext = {
      fnContext: {
        typeParams: typeparams
      }
    };
    const block = this.parseBlockStmt(blockContext);
    if (!block) {
      return;
    }
    return {
      position: fnPos,
      kind: "function_declaration",
      name: CreateIdentifier(fnName.value, getTokenPosition(fnName)),
      parameters: params,
      typeParameters: typeparams,
      returnTypes,
      errorTypes,
      body: block,
      receiver
    };
  }
  /**
   * Parses a `return <expr>;` statement. The expression is currently a
   * placeholder integer literal until expression parsing is implemented.
   */
  parseReturnStmt(_blockContext) {
    const keyword = this.advance();
    if (this.current().kind == TokenKind.Keyword_Error) {
      this.advance();
      if (!this.expect(TokenKind.Keyword_As, "keyword as expected"))
        return;
      const values = [];
      while (true) {
        let value;
        if (this.current().kind == TokenKind.Symbol_LeftBrace) {
          value = this.parseObjectLiteralExpression(CreateIdentifier(""));
        } else {
          value = this.parseExpression();
        }
        if (!value)
          return;
        values.push(value);
        if (this.current().kind != TokenKind.Symbol_Comma)
          break;
        this.advance();
      }
      if (!this.expect(TokenKind.Symbol_Semicolon, "; expected"))
        return;
      return {
        kind: "return_error_statement",
        position: getTokenPosition(keyword),
        value: values[0],
        values
      };
    }
    if (this.current().kind == TokenKind.Symbol_Semicolon) {
      this.advance();
      return {
        kind: "return_statement",
        position: getTokenPosition(keyword)
      };
    }
    const expressions = [];
    while (true) {
      const expr = this.parseExpression();
      if (!expr)
        return;
      expressions.push(expr);
      if (this.current().kind != TokenKind.Symbol_Comma)
        break;
      this.advance();
    }
    if (!this.expect(TokenKind.Symbol_Semicolon, "; expected")) {
      return;
    }
    return {
      kind: "return_statement",
      position: Position(keyword.line, keyword.column, keyword.start, keyword.end),
      expression: expressions[0],
      expressions
    };
  }
  /** Parses the optional `as resultName` suffix shared by fallible statement forms. */
  parseAsResultBinding() {
    if (this.current().kind != TokenKind.Keyword_As)
      return;
    const keyword = this.advance();
    const name = this.expect(TokenKind.Kind_Identifier, "result identifier expected after as");
    if (!name)
      return;
    return {
      kind: "as_result_binding",
      position: getTokenPosition(keyword),
      resultName: CreateIdentifier(name.value)
    };
  }
  parseCheckBlockStatement(blockContext) {
    const keyword = this.advance();
    const name = this.expect(TokenKind.Kind_Identifier, "result identifier expected after check");
    if (!name)
      return;
    let errorType;
    if (this.current().kind == TokenKind.Keyword_As) {
      this.advance();
      const typeName = this.expect(TokenKind.Kind_Identifier, "error type identifier expected after as");
      if (!typeName)
        return;
      errorType = {
        position: getTokenPosition(typeName),
        kind: "type",
        name: CreateIdentifier(typeName.value),
        value: this.resolveTypeValue(typeName.value)
      };
    }
    const body = this.parseBlockStmt(blockContext);
    if (!body)
      return;
    return {
      kind: "check_block_statement",
      position: getTokenPosition(keyword),
      resultName: CreateIdentifier(name.value),
      errorType,
      body
    };
  }
  parseForwardStatement() {
    const keyword = this.advance();
    const name = this.expect(TokenKind.Kind_Identifier, "result identifier expected after forward");
    if (!name)
      return;
    if (!this.expect(TokenKind.Symbol_Semicolon, "; expected"))
      return;
    return {
      kind: "forward_statement",
      position: getTokenPosition(keyword),
      resultName: CreateIdentifier(name.value)
    };
  }
  resolveSpreadLiteralFields() {
    const name = this.expect(TokenKind.Kind_Identifier, "identifier expected");
    if (!name) {
      return;
    }
    const objectLiteralValue = this.objectValueDecls.get(name.value);
    if (!objectLiteralValue) {
      const nonValue = this.objectNonValueDecls.get(name.value);
      if (!nonValue) {
        return;
      }
      const typeDecl = this.typeDecls.get(nonValue);
      if (!typeDecl) {
        return;
      }
      return typeDecl.declaration.fields.map((x) => {
        return {
          name: x.name,
          value: {
            position: getTokenPosition(name),
            kind: "member_access_expression",
            receiver: {
              position: getTokenPosition(name),
              kind: "identifier",
              name: name.value
            },
            member: x.name
          }
        };
      });
    }
    return objectLiteralValue.elements.map((x) => {
      const fieldInit = x;
      return {
        name: fieldInit.field.name,
        value: fieldInit.field.value
      };
    });
  }
  parseObjectLiteralExpression(expr, typeArgs) {
    const objectType = {
      name: expr,
      kind: "type",
      value: TypeValue.TypeCustom,
      typeParameters: typeArgs
    };
    const elements = [];
    const leftBrace = this.advance();
    while (this.current().kind != TokenKind.Symbol_RightBrace) {
      if (this.current().kind == TokenKind.Symbol_Ellipsis) {
        const spread = this.advance();
        const source = this.parseExpression();
        if (!source)
          return;
        elements.push({
          position: getTokenPosition(spread),
          kind: "spread_element",
          source
        });
      } else {
        const field = this.current().kind == TokenKind.Keyword_Error ? this.advance() : this.expect(TokenKind.Kind_Identifier, "identifier expected");
        if (!field || !this.expect(TokenKind.Symbol_Colon, ": expected"))
          return;
        const value = this.parseExpression();
        if (!value)
          return;
        elements.push({
          position: getTokenPosition(field),
          kind: "field_init",
          field: { name: CreateIdentifier(field.value, getTokenPosition(field)), value }
        });
      }
      if (this.current().kind == TokenKind.Symbol_RightBrace) {
        break;
      }
      if (this.current().kind == TokenKind.Symbol_Comma) {
        this.advance();
        continue;
      }
      this.diagnostics.addError(Error2(this.filepath, "parser", this.getCurrentPosition(), ", or } expected"));
      return;
    }
    this.advance();
    return {
      type: objectType,
      position: getTokenPosition(leftBrace),
      kind: "object_literal",
      genericTypes: typeArgs,
      concreteTypeMap: /* @__PURE__ */ new Map(),
      elements
    };
  }
  parseArrayLiteralExpression(position2) {
    let elements = [];
    while (this.current().kind != TokenKind.Symbol_RightBracket) {
      const element = this.parseExpression();
      if (!element) {
        return;
      }
      elements.push(element);
      if (this.current().kind == TokenKind.Symbol_Comma) {
        this.advance();
      }
    }
    this.advance();
    return {
      position: position2,
      kind: "array_literal_expression",
      elements
    };
  }
  /**
   * Parses a primary (atomic) expression: an identifier, an integer/float/
   * boolean literal, or — as a fallback — a nested expression. This is the
   * lowest rung of the expression grammar.
   */
  parsePrimaryExpression() {
    const token = this.advance();
    switch (token.kind) {
      case TokenKind.Keyword_New:
        const inner = this.parseExpression();
        if (!inner) {
          return;
        }
        return {
          position: getTokenPosition(token),
          kind: "new_expression",
          expression: inner
        };
      case TokenKind.Symbol_LeftBrace:
        this.pos--;
        return this.parseObjectLiteralExpression(CreateIdentifier(""));
      case TokenKind.Symbol_LeftBracket:
        const arrayLiteral = this.parseArrayLiteralExpression(getTokenPosition(token));
        if (!arrayLiteral) {
          return;
        }
        return arrayLiteral;
      case TokenKind.Symbol_LeftParen:
        const expr = this.parseExpression();
        if (!expr) {
          return;
        }
        if (!this.expect(TokenKind.Symbol_RightParen, ") symbol expected")) {
          return;
        }
        return expr;
      case TokenKind.Kind_Identifier:
        if (this.current().kind == TokenKind.Symbol_LeftBrace) {
          return this.parseObjectLiteralExpression({
            position: getTokenPosition(token),
            kind: "identifier",
            name: token.value
          });
        }
        return {
          position: getTokenPosition(token),
          kind: "identifier",
          name: token.value
        };
      case TokenKind.Kind_IntegerLiteral:
        return {
          position: getTokenPosition(token),
          kind: "integer_literal",
          value: token.value
        };
      case TokenKind.Kind_FloatLiteral:
        return {
          position: getTokenPosition(token),
          kind: "float_literal",
          value: token.value
        };
      case TokenKind.Kind_BooleanLiteral:
        return {
          position: getTokenPosition(token),
          kind: "boolean_literal",
          value: token.value
        };
      case TokenKind.Kind_CharacterLiteral:
        return {
          position: getTokenPosition(token),
          kind: "char_literal",
          value: token.value
        };
      case TokenKind.Kind_StringLiteral:
        return {
          position: getTokenPosition(token),
          kind: "string_literal",
          value: token.value
        };
      default:
        return this.parseExpression();
    }
  }
  parseFunctionCallTypeArguments() {
    return this.parseTypeParams(false);
  }
  /**
   * Parses a call's argument list `(...)` given the already-parsed `callee`,
   * and wraps them into a {@link FunctionCallExpression}. Assumes the cursor
   * is on the opening `(`.
   */
  parseFunctionCallExpression(callee, typeArguments) {
    let typeArgs = typeArguments;
    if (!this.expect(TokenKind.Symbol_LeftParen, "( symbol expected")) {
      return;
    }
    const args = [];
    if (this.current().kind != TokenKind.Symbol_RightParen) {
      const p1 = this.parseExpression();
      if (!p1) {
        return;
      }
      args.push(p1);
      while (this.current().kind == TokenKind.Symbol_Comma) {
        this.advance();
        const p = this.parseExpression();
        if (!p) {
          return;
        }
        args.push(p);
        this.skipComments();
      }
    }
    if (!this.expect(TokenKind.Symbol_RightParen, ") symbol expected")) {
      return;
    }
    callee = {
      kind: "function_call_expression",
      position: callee.position,
      callee,
      arguments: args,
      genericTypes: typeArgs,
      concreteTypeMap: /* @__PURE__ */ new Map()
    };
    this.skipComments();
    return callee;
  }
  parseMemberAccessExpression(expr) {
    this.advance();
    const member = this.expect(TokenKind.Kind_Identifier, "identifier expected");
    if (!member) {
      return;
    }
    return {
      position: getTokenPosition(member),
      kind: "member_access_expression",
      receiver: expr,
      receiverType: CreateType("invalid", TypeValue.TypeInvalid),
      member: CreateIdentifier(member.value)
    };
  }
  /** Returns the dotted spelling of an identifier/member chain. */
  qualifiedExpressionName(expr) {
    if (expr.kind == "identifier")
      return expr.name;
    if (expr.kind != "member_access_expression")
      return;
    const receiver = this.qualifiedExpressionName(expr.receiver);
    return receiver ? `${receiver}.${expr.member.name}` : void 0;
  }
  /** Distinguishes `f<T>(...)` / `T<U> { ... }` from an ordinary comparison. */
  genericSuffixAhead() {
    if (this.current().kind != TokenKind.Symbol_Less)
      return void 0;
    let depth = 0;
    for (let index = this.pos; index < this.tokens.length; index++) {
      const kind = this.tokens[index].kind;
      if (kind == TokenKind.Symbol_Less) {
        depth++;
        continue;
      }
      if (kind == TokenKind.Symbol_Greater) {
        depth--;
        if (depth == 0) {
          const suffix = this.tokens[index + 1]?.kind;
          return suffix == TokenKind.Symbol_LeftParen || suffix == TokenKind.Symbol_LeftBrace ? suffix : void 0;
        }
        continue;
      }
      if (kind == TokenKind.Symbol_ShiftRight) {
        depth -= 2;
        if (depth <= 0) {
          const suffix = this.tokens[index + 1]?.kind;
          return suffix == TokenKind.Symbol_LeftParen || suffix == TokenKind.Symbol_LeftBrace ? suffix : void 0;
        }
        continue;
      }
      if (kind != TokenKind.Kind_Identifier && kind != TokenKind.Kind_IntegerLiteral && kind != TokenKind.Symbol_Comma && kind != TokenKind.Symbol_LeftBracket && kind != TokenKind.Symbol_RightBracket)
        return void 0;
    }
    return void 0;
  }
  /**
   * Parses a postfix expression: a primary expression optionally followed by
   * a call `(...)`. Currently the call suffix applies only to identifiers.
   */
  parsePostfixExpression() {
    const expr = this.parsePrimaryExpression();
    if (!expr) {
      return;
    }
    let final = expr;
    while (true) {
      if (this.current().kind == TokenKind.Symbol_Dot) {
        const member = this.parseMemberAccessExpression(final);
        if (!member) {
          return;
        }
        final = member;
        continue;
      }
      if (final.kind == "member_access_expression" && this.current().kind == TokenKind.Symbol_LeftBrace) {
        const qualifiedName = this.qualifiedExpressionName(final);
        if (!qualifiedName)
          return;
        const literal = this.parseObjectLiteralExpression(CreateIdentifier(qualifiedName, final.position));
        if (!literal)
          return;
        final = literal;
        continue;
      }
      const genericSuffix = final.kind == "identifier" || final.kind == "member_access_expression" ? this.genericSuffixAhead() : void 0;
      if ((final.kind == "identifier" || final.kind == "member_access_expression") && genericSuffix) {
        const typeArguments = this.parseFunctionCallTypeArguments();
        if (!typeArguments)
          return;
        if (genericSuffix == TokenKind.Symbol_LeftBrace) {
          const qualifiedName = this.qualifiedExpressionName(final);
          if (!qualifiedName)
            return;
          const literal = this.parseObjectLiteralExpression(CreateIdentifier(qualifiedName, final.position), typeArguments);
          if (!literal)
            return;
          final = literal;
        } else {
          const func = this.parseFunctionCallExpression(final, typeArguments);
          if (!func)
            return;
          final = func;
        }
        continue;
      }
      if ((final.kind == "identifier" || final.kind == "member_access_expression") && this.current().kind == TokenKind.Symbol_LeftParen) {
        const func = this.parseFunctionCallExpression(final, final.kind == "identifier" ? final.typeArguments : void 0);
        if (!func) {
          return;
        }
        final = func;
        continue;
      }
      if (this.current().kind != TokenKind.Symbol_LeftBracket) {
        break;
      }
      this.advance();
      const index = this.parseExpression();
      if (!index) {
        return;
      }
      if (!this.expect(TokenKind.Symbol_RightBracket, "] symbol expected")) {
        return;
      }
      final = {
        position: final.position,
        kind: "index_expression",
        receiver: final,
        index
      };
    }
    if (this.current().kind == TokenKind.Symbol_Increment || this.current().kind == TokenKind.Symbol_Decrement) {
      return {
        kind: "unary_expression",
        position: expr.position,
        operator: this.advance().value,
        operand: expr
      };
    }
    return final;
  }
  /**
   * Parses a unary expression: a prefix operator (`!`, `-`, `~`) applied to a
   * postfix expression, or just a postfix expression when no operator leads.
   */
  parseUnaryExpression() {
    if (this.current().kind == TokenKind.Keyword_Move || this.current().kind == TokenKind.Keyword_Clone) {
      const operator = this.advance();
      const source = this.parseUnaryExpression();
      if (!source)
        return;
      return operator.kind == TokenKind.Keyword_Move ? { position: getTokenPosition(operator), kind: "move_expression", source } : { position: getTokenPosition(operator), kind: "clone_expression", source };
    }
    if ([TokenKind.Symbol_Not, TokenKind.Symbol_Minus, TokenKind.Symbol_Tilde].includes(this.current().kind)) {
      const operator = this.advance();
      const operand = this.parsePostfixExpression();
      if (!operand) {
        return;
      }
      return {
        position: getTokenPosition(operator),
        kind: "unary_expression",
        operator: operator.value,
        operand
      };
    }
    const expr = this.parsePostfixExpression();
    if (!expr) {
      return;
    }
    return expr;
  }
  /**
   * Parses an additive expression: a unary expression optionally followed by
   * a `+`/`-` operator and a right-hand unary expression.
   */
  parseAdditiveExpression() {
    let left = this.parseMultiplicativeExpression();
    if (!left) {
      return;
    }
    this.skipComments();
    while ([TokenKind.Symbol_Plus, TokenKind.Symbol_Minus].includes(this.current().kind)) {
      const operator = this.advance();
      const right = this.parseMultiplicativeExpression();
      if (!right) {
        return;
      }
      left = {
        position: getTokenPosition(operator),
        kind: "binary_expression",
        left,
        right,
        operator: operator.value
      };
      this.skipComments();
    }
    return left;
  }
  parseMultiplicativeExpression() {
    let left = this.parseUnaryExpression();
    if (!left) {
      return;
    }
    this.skipComments();
    while ([TokenKind.Symbol_Asterisk, TokenKind.Symbol_FSlash, TokenKind.Symbol_Percent].includes(this.current().kind)) {
      const operator = this.advance();
      const right = this.parseUnaryExpression();
      if (!right) {
        return;
      }
      left = {
        position: getTokenPosition(operator),
        kind: "binary_expression",
        left,
        right,
        operator: operator.value
      };
      this.skipComments();
    }
    return left;
  }
  parseShiftExpression() {
    let left = this.parseAdditiveExpression();
    if (!left) {
      return;
    }
    this.skipComments();
    while ([TokenKind.Symbol_ShiftLeft, TokenKind.Symbol_ShiftRight].includes(this.current().kind)) {
      const operator = this.advance();
      const right = this.parseAdditiveExpression();
      if (!right) {
        return;
      }
      left = {
        position: getTokenPosition(operator),
        kind: "binary_expression",
        left,
        right,
        operator: operator.value
      };
      this.skipComments();
    }
    return left;
  }
  parseRelationalExpression() {
    let left = this.parseShiftExpression();
    if (!left) {
      return;
    }
    this.skipComments();
    while ([
      TokenKind.Symbol_Less,
      TokenKind.Symbol_LessEq,
      TokenKind.Symbol_Greater,
      TokenKind.Symbol_GreaterEq
    ].includes(this.current().kind)) {
      const operator = this.advance();
      const right = this.parseShiftExpression();
      if (!right) {
        return;
      }
      left = {
        position: getTokenPosition(operator),
        kind: "binary_expression",
        left,
        right,
        operator: operator.value
      };
      this.skipComments();
    }
    return left;
  }
  parseEqualityExpression() {
    let left = this.parseRelationalExpression();
    if (!left) {
      return;
    }
    this.skipComments();
    while ([TokenKind.Symbol_Equality, TokenKind.Symbol_NotEquals].includes(this.current().kind)) {
      const operator = this.advance();
      const right = this.parseRelationalExpression();
      if (!right) {
        return;
      }
      left = {
        position: getTokenPosition(operator),
        kind: "binary_expression",
        left,
        right,
        operator: operator.value
      };
      this.skipComments();
    }
    return left;
  }
  parseBitwiseAndExpression() {
    let left = this.parseEqualityExpression();
    if (!left) {
      return;
    }
    this.skipComments();
    while (this.current().kind == TokenKind.Symbol_Ampersand) {
      const operator = this.advance();
      const right = this.parseEqualityExpression();
      if (!right) {
        return;
      }
      left = {
        position: getTokenPosition(operator),
        kind: "binary_expression",
        left,
        right,
        operator: operator.value
      };
      this.skipComments();
    }
    return left;
  }
  parseBitwiseXorExpression() {
    let left = this.parseBitwiseAndExpression();
    if (!left) {
      return;
    }
    this.skipComments();
    while (this.current().kind == TokenKind.Symbol_Caret) {
      const operator = this.advance();
      const right = this.parseBitwiseAndExpression();
      if (!right) {
        return;
      }
      left = {
        position: getTokenPosition(operator),
        kind: "binary_expression",
        left,
        right,
        operator: operator.value
      };
      this.skipComments();
    }
    return left;
  }
  parseBitwiseOrExpression() {
    let left = this.parseBitwiseXorExpression();
    if (!left)
      return;
    this.skipComments();
    while (this.current().kind == TokenKind.Symbol_Pipe) {
      const operator = this.advance();
      const right = this.parseBitwiseXorExpression();
      if (!right)
        return;
      left = {
        position: getTokenPosition(operator),
        kind: "binary_expression",
        left,
        right,
        operator: operator.value
      };
      this.skipComments();
    }
    return left;
  }
  parseLogicalAndExpression() {
    let left = this.parseBitwiseOrExpression();
    if (!left)
      return;
    this.skipComments();
    while (this.current().kind == TokenKind.Symbol_LogicalAnd) {
      const operator = this.advance();
      const right = this.parseBitwiseOrExpression();
      if (!right)
        return;
      left = {
        position: getTokenPosition(operator),
        kind: "binary_expression",
        left,
        right,
        operator: operator.value
      };
      this.skipComments();
    }
    return left;
  }
  parseLogicalOrExpression() {
    let left = this.parseLogicalAndExpression();
    if (!left)
      return;
    this.skipComments();
    while (this.current().kind == TokenKind.Symbol_LogicalOr) {
      const operator = this.advance();
      const right = this.parseLogicalAndExpression();
      if (!right)
        return;
      left = {
        position: getTokenPosition(operator),
        kind: "binary_expression",
        left,
        right,
        operator: operator.value
      };
      this.skipComments();
    }
    return left;
  }
  /**
   * Entry point for expression parsing. Delegates to the lowest-precedence
   * rung ({@link parseComparisionExpression}), which recurses down through the
   * precedence chain.
   */
  // IN_PROGRESS: add expression parsing
  parseExpression() {
    return this.parseLogicalOrExpression();
  }
  /**
   * Maps a type's source name (`int32`, `float64`, `bool`, …) to its
   * {@link TypeValue}. Unknown names resolve to {@link TypeValue.TypeInvalid}.
   */
  resolveTypeValue(name) {
    switch (name) {
      case "int8":
        return TypeValue.Type_Int8;
      case "int16":
        return TypeValue.Type_Int16;
      case "int32":
        return TypeValue.Type_Int32;
      case "int64":
        return TypeValue.Type_Int64;
      case "uint8":
        return TypeValue.Type_UInt8;
      case "uint16":
        return TypeValue.Type_UInt16;
      case "uint32":
        return TypeValue.Type_UInt32;
      case "uint64":
        return TypeValue.Type_UInt64;
      case "intsize":
        return TypeValue.Type_IntSize;
      case "uintsize":
        return TypeValue.Type_UIntSize;
      case "char":
        return TypeValue.Type_Char;
      case "float32":
        return TypeValue.Type_Float32;
      case "float64":
        return TypeValue.Type_Float64;
      case "bool":
        return TypeValue.Type_Bool;
      case "string":
        return TypeValue.Type_String;
      case "owned":
        return TypeValue.Type_Owned;
    }
    return TypeValue.TypeCustom;
  }
  /**
   * Parses a `let`/`const` variable declaration: `<modifier> name: Type` with
   * an optional `= <expr>` initializer, terminated by `;`. A `const` requires
   * an initializer; a `let` may omit it. `file` marks whether the declaration
   * is at file (module) scope rather than inside a function body.
   */
  parseVariableDeclarationStmt(file, blockContext) {
    const modifier = this.advance();
    if (this.current().kind != TokenKind.Kind_Identifier) {
      this.diagnostics.addError(Error2(this.filepath, "parser", this.getCurrentPosition(), "identifier expected here"));
      return;
    }
    const varNameIdent = this.advance();
    if (this.current().kind == TokenKind.Symbol_Equals) {
      this.advance();
      const value2 = this.parseExpression();
      if (!value2) {
        return;
      }
      if (value2.kind == "new_expression" && this.current().kind == TokenKind.Kind_Identifier && this.current().value == "in") {
        const unsupported = this.advance();
        this.diagnostics.addError(Error2(this.filepath, "parser", getTokenPosition(unsupported), "custom allocators are not supported"));
        if (this.current().kind == TokenKind.Kind_Identifier)
          this.advance();
      }
      const hasAsResult2 = this.current().kind == TokenKind.Keyword_As;
      const asResult2 = this.parseAsResultBinding();
      if (hasAsResult2 && !asResult2)
        return;
      if (!this.expect(TokenKind.Symbol_Semicolon, "; expected")) {
        return;
      }
      if (value2.kind == "object_literal") {
        this.objectValueDecls.set(varNameIdent.value, value2);
      }
      return {
        file,
        kind: "variable_declaration_statement",
        mutable: modifier.kind == TokenKind.Keyword_Let,
        type: CreateType("invalid", TypeValue.TypeInvalid, this.getCurrentPosition()),
        name: CreateIdentifier(varNameIdent.value, getTokenPosition(varNameIdent)),
        position: getTokenPosition(varNameIdent),
        value: value2,
        asResult: asResult2
      };
    }
    if (!this.expect(TokenKind.Symbol_Colon, ": expected")) {
      return;
    }
    let typeParams = blockContext?.fnContext?.typeParams;
    const varType = this.parseTypeReference(typeParams);
    if (!varType)
      return;
    if (this.current().kind == TokenKind.Symbol_Semicolon && modifier.value != "let") {
      this.diagnostics.addError(Error2(this.filepath, "parser", getTokenPosition(this.current()), "const declaration requires an initializer"));
      return;
    }
    if (this.current().kind == TokenKind.Symbol_Semicolon && modifier.value == "let") {
      this.advance();
      return {
        file,
        kind: "variable_declaration_statement",
        mutable: true,
        name: CreateIdentifier(varNameIdent.value, getTokenPosition(varNameIdent)),
        type: varType,
        position: getTokenPosition(varNameIdent)
      };
    }
    if (!this.expect(TokenKind.Symbol_Equals, "= expected")) {
      return;
    }
    const value = this.parseExpression();
    if (!value) {
      return;
    }
    if (value.kind == "new_expression" && this.current().kind == TokenKind.Kind_Identifier && this.current().value == "in") {
      const unsupported = this.advance();
      this.diagnostics.addError(Error2(this.filepath, "parser", getTokenPosition(unsupported), "custom allocators are not supported"));
      if (this.current().kind == TokenKind.Kind_Identifier)
        this.advance();
    }
    const hasAsResult = this.current().kind == TokenKind.Keyword_As;
    const asResult = this.parseAsResultBinding();
    if (hasAsResult && !asResult)
      return;
    if (!this.expect(TokenKind.Symbol_Semicolon, "; expected")) {
      return;
    }
    if (value.kind == "object_literal") {
      this.objectValueDecls.set(varNameIdent.value, value);
    }
    return {
      file,
      kind: "variable_declaration_statement",
      mutable: modifier.kind == TokenKind.Keyword_Let,
      name: CreateIdentifier(varNameIdent.value, getTokenPosition(varNameIdent)),
      type: varType,
      position: getTokenPosition(varNameIdent),
      value,
      asResult
    };
  }
  parseIfStatement(blockContext) {
    const keyword = this.advance();
    if (!this.expect(TokenKind.Symbol_LeftParen, "( expected")) {
      return;
    }
    const condition = this.parseExpression();
    if (!condition) {
      return;
    }
    if (!this.expect(TokenKind.Symbol_RightParen, ") expected")) {
      return;
    }
    const thenBlock = this.parseBlockStmt(blockContext);
    if (!thenBlock) {
      return;
    }
    let elseBlock;
    if (this.current().kind == TokenKind.Keyword_Else) {
      this.advance();
      elseBlock = this.parseBlockStmt(blockContext);
    }
    return {
      kind: "if_statement",
      position: getTokenPosition(keyword),
      condition,
      thenBlock,
      elseBlock
    };
  }
  parseWhileStatement(blockContext) {
    const keyword = this.advance();
    if (!this.expect(TokenKind.Symbol_LeftParen, "( expected")) {
      return;
    }
    const condition = this.parseExpression();
    if (!condition) {
      return;
    }
    if (!this.expect(TokenKind.Symbol_RightParen, ") expected")) {
      return;
    }
    const body = this.parseBlockStmt(blockContext);
    if (!body) {
      return;
    }
    return {
      kind: "while_statement",
      position: getTokenPosition(keyword),
      condition,
      body
    };
  }
  parseForStatement(blockContext) {
    const keyword = this.advance();
    if (!this.expect(TokenKind.Symbol_LeftParen, "( expected")) {
      return;
    }
    let decl;
    if (this.current().kind == TokenKind.Symbol_Semicolon) {
      this.advance();
    } else {
      decl = this.parseVariableDeclarationStmt(false, blockContext);
    }
    let condition;
    if (this.current().kind == TokenKind.Symbol_Semicolon) {
      this.advance();
      condition = {
        position: getTokenPosition(keyword),
        kind: "boolean_literal",
        value: "true"
      };
    } else {
      condition = this.parseExpression();
      if (!this.expect(TokenKind.Symbol_Semicolon, "; expected")) {
        return;
      }
    }
    let modifier;
    if (this.current().kind == TokenKind.Symbol_RightParen) {
      this.advance();
    } else {
      modifier = this.parseExpression();
      if (!this.expect(TokenKind.Symbol_RightParen, ") expected")) {
        return;
      }
    }
    const body = this.parseBlockStmt(blockContext);
    if (!body) {
      return;
    }
    return {
      position: getTokenPosition(keyword),
      kind: "for_statement",
      declaration: decl,
      condition,
      modifier,
      body
    };
  }
  parseSwitchStatement(blockContext) {
    const keyword = this.advance();
    if (!this.expect(TokenKind.Symbol_LeftParen, "symbol ( expected")) {
      return;
    }
    let cases = [];
    let defaultCaseValue = {
      position: this.getCurrentPosition(),
      labels: [],
      body: {
        kind: "case_block_statement",
        statements: [],
        position: this.getCurrentPosition()
      }
    };
    this.skipComments();
    const scrutinee = this.parseExpression();
    if (!scrutinee) {
      this.diagnostics.addError(Error2(this.filepath, "parser", this.getCurrentPosition(), "failed to parse switch expression"));
      return;
    }
    this.skipComments();
    if (!this.expect(TokenKind.Symbol_RightParen, "symbol ) expected")) {
      return;
    }
    this.skipComments();
    if (!this.expect(TokenKind.Symbol_LeftBrace, "symbol { expected")) {
      return;
    }
    while (this.current().kind != TokenKind.Symbol_RightBrace) {
      this.skipComments();
      if (this.current().kind != TokenKind.Keyword_Case && this.current().kind != TokenKind.Keyword_Default) {
        this.diagnostics.addError(Error2(this.filepath, "parser", this.getCurrentPosition(), "keyword `case` or `default` expected"));
        return;
      }
      if (this.current().kind == TokenKind.Keyword_Default) {
        break;
      }
      this.advance();
      let caseValue = {
        position: this.getCurrentPosition(),
        labels: [],
        body: {
          kind: "case_block_statement",
          statements: [],
          position: this.getCurrentPosition()
        }
      };
      let label = this.parseExpression();
      if (!label) {
        return;
      }
      switch (label.kind) {
        case "unary_expression":
          if (label.operator == string(TokenKind.Symbol_Minus) && label.operand.kind == "integer_literal") {
            caseValue.labels.push({
              position: label.position,
              kind: "integer_literal",
              value: "-" + label.operand.value
            });
          } else {
            this.diagnostics.addError(Error2(this.filepath, "parser", this.getCurrentPosition(), "case labels must be integer or char literals"));
            return;
          }
          break;
        case "integer_literal":
          caseValue.labels.push(label);
          break;
        case "char_literal":
          caseValue.labels.push(label);
          break;
        case "member_access_expression":
          if (label.receiver.kind == "identifier") {
            const decl = this.typeDecls.get(label.receiver.name);
            if (!decl) {
              break;
            }
            if (decl.declKind != TypeDeclKind.Enum) {
              break;
            }
            const labelValue = decl.declaration.variants.find((x) => x.name.name == label.member.name)?.value;
            caseValue.labels.push(labelValue);
            break;
          }
        default:
          this.diagnostics.addError(Error2(this.filepath, "parser", this.getCurrentPosition(), "case labels must be integer or char literals"));
          return;
      }
      if (this.current().kind == TokenKind.Symbol_Comma) {
        while (this.current().kind != TokenKind.Symbol_Colon) {
          this.advance();
          label = this.parseExpression();
          if (!label) {
            return;
          }
          switch (label.kind) {
            case "unary_expression":
              if (label.operator == string(TokenKind.Symbol_Minus) && label.operand.kind == "integer_literal") {
                caseValue.labels.push({
                  kind: "integer_literal",
                  value: "-" + label.operand.value
                });
              } else {
                this.diagnostics.addError(Error2(this.filepath, "parser", this.getCurrentPosition(), "case labels must be integer or char literals"));
                return;
              }
              break;
            case "integer_literal":
              caseValue.labels.push(label);
              break;
            case "char_literal":
              caseValue.labels.push(label);
              break;
            case "member_access_expression":
              if (label.receiver.kind == "identifier") {
                const decl = this.typeDecls.get(label.receiver.name);
                if (!decl) {
                  break;
                }
                if (decl.declKind != TypeDeclKind.Enum) {
                  break;
                }
                const labelValue = decl.declaration.variants.find((x) => x.name.name == label.member.name)?.value;
                caseValue.labels.push(labelValue);
                break;
              }
            default:
              this.diagnostics.addError(Error2(this.filepath, "parser", this.getCurrentPosition(), "case labels must be integer or char literals"));
              return;
          }
        }
      }
      if (!this.expect(TokenKind.Symbol_Colon, ": expected")) {
        return;
      }
      const caseBlock = this.parseCaseBlockStatement(blockContext);
      if (!caseBlock) {
        return;
      }
      caseValue.body = caseBlock;
      cases.push(caseValue);
      if (this.current().kind == TokenKind.Keyword_Case) {
        continue;
      }
    }
    if (this.current().kind == TokenKind.Keyword_Default) {
      this.advance();
      if (!this.expect(TokenKind.Symbol_Colon, ": expected")) {
        return;
      }
      const defaultBlock = this.parseCaseBlockStatement(blockContext);
      if (!defaultBlock) {
        return;
      }
      defaultCaseValue.body = defaultBlock;
    }
    this.advance();
    return {
      kind: "switch_statement",
      position: getTokenPosition(keyword),
      cases,
      scrutinee,
      default: defaultCaseValue
    };
  }
  parseCaseBlockStatement(blockContext) {
    const statements = [];
    while (this.current().kind != TokenKind.Keyword_Case && this.current().kind != TokenKind.Keyword_Default && this.current().kind != TokenKind.Symbol_RightBrace) {
      if (this.current().kind == TokenKind.Kind_EOF) {
        this.diagnostics.addError(Error2(this.filepath, "parser", this.getCurrentPosition(), "reached the end of file while parsing"));
        return;
      }
      this.skipComments();
      const stmt = this.parseStmt(blockContext);
      if (!stmt) {
        return;
      }
      statements.push(stmt);
    }
    return {
      kind: "case_block_statement",
      statements,
      position: this.getCurrentPosition()
    };
  }
  /** Dispatches on the current token to parse a single statement. */
  parseStmt(blockContext) {
    let statement;
    this.skipComments();
    if (this.current().kind == TokenKind.Keyword_Break) {
      const keyword = this.advance();
      if (!this.expect(TokenKind.Symbol_Semicolon, "; expected")) {
        return;
      }
      this.skipComments();
      return {
        kind: "break_statement",
        position: getTokenPosition(keyword)
      };
    }
    if (this.current().kind == TokenKind.Keyword_Continue) {
      const keyword = this.advance();
      if (!this.expect(TokenKind.Symbol_Semicolon, "; expected")) {
        return;
      }
      this.skipComments();
      return {
        kind: "continue_statement",
        position: getTokenPosition(keyword)
      };
    }
    if (this.current().kind == TokenKind.Keyword_Check) {
      return this.parseCheckBlockStatement(blockContext);
    }
    if (this.current().kind == TokenKind.Keyword_Forward) {
      return this.parseForwardStatement();
    }
    if (this.current().kind == TokenKind.Keyword_Const || this.current().kind == TokenKind.Keyword_Let) {
      statement = this.parseVariableDeclarationStmt(false, blockContext);
      if (statement == void 0) {
        return;
      }
      return statement;
    }
    if (this.current().kind == TokenKind.Keyword_Return) {
      statement = this.parseReturnStmt(blockContext);
      this.skipComments();
      if (!statement) {
        return;
      }
      return statement;
    }
    if (this.current().kind == TokenKind.Keyword_If) {
      statement = this.parseIfStatement(blockContext);
      this.skipComments();
      if (!statement) {
        return;
      }
      return statement;
    }
    if (this.current().kind == TokenKind.Keyword_While) {
      statement = this.parseWhileStatement(blockContext);
      this.skipComments();
      if (!statement) {
        return;
      }
      return statement;
    }
    if (this.current().kind == TokenKind.Keyword_Switch) {
      statement = this.parseSwitchStatement(blockContext);
      this.skipComments();
      if (!statement) {
        return;
      }
      return statement;
    }
    if (this.current().kind == TokenKind.Keyword_For) {
      statement = this.parseForStatement(blockContext);
      this.skipComments();
      if (!statement) {
        return;
      }
      return statement;
    }
    const expr = this.parseExpression();
    if (!expr) {
      return;
    }
    const assignmentOperators = [
      TokenKind.Symbol_Equals,
      TokenKind.Symbol_PlusEquals,
      TokenKind.Symbol_MinusEquals,
      TokenKind.Symbol_AsteriskEquals,
      TokenKind.Symbol_FSlashEquals,
      TokenKind.Symbol_PercentEquals,
      TokenKind.Symbol_AmpersandEquals,
      TokenKind.Symbol_PipeEquals,
      TokenKind.Symbol_CaretEquals,
      TokenKind.Symbol_ShiftLeftEquals,
      TokenKind.Symbol_ShiftRightEquals
    ];
    if (assignmentOperators.includes(this.current().kind)) {
      const operator = this.advance();
      const rhs = this.parseExpression();
      if (!rhs) {
        return;
      }
      const hasAsResult2 = this.current().kind == TokenKind.Keyword_As;
      const asResult2 = this.parseAsResultBinding();
      if (hasAsResult2 && !asResult2)
        return;
      if (!this.expect(TokenKind.Symbol_Semicolon, "; symbol expected")) {
        return;
      }
      return {
        position: expr.position,
        kind: "assignment_statement",
        root: expr,
        target: rhs,
        operator: operator.value == "=" ? void 0 : operator.value,
        operatorPosition: getTokenPosition(operator),
        asResult: asResult2
      };
    }
    const hasAsResult = this.current().kind == TokenKind.Keyword_As;
    const asResult = this.parseAsResultBinding();
    if (hasAsResult && !asResult)
      return;
    if (!this.expect(TokenKind.Symbol_Semicolon, "; symbol expected")) {
      return;
    }
    return {
      kind: "expression_statement",
      expression: expr,
      position: expr.position,
      asResult
    };
  }
  /**
   * Parses a `{ … }` block: statements until the closing brace. Reports an
   * error and bails if end-of-file is reached before the block is closed.
   */
  parseBlockStmt(blockContext) {
    const statements = [];
    const leftBrace = this.expect(TokenKind.Symbol_LeftBrace, "{ symbol expected");
    if (!leftBrace) {
      return;
    }
    while (this.current().kind != TokenKind.Symbol_RightBrace) {
      if (this.current().kind == TokenKind.Kind_EOF) {
        this.diagnostics.addError(Error2(this.filepath, "parser", this.getCurrentPosition(), "reached the end of file while parsing"));
        return;
      }
      this.skipComments();
      const stmt = this.parseStmt(blockContext);
      if (!stmt) {
        return;
      }
      statements.push(stmt);
    }
    this.advance();
    return {
      kind: "block_statement",
      statements,
      position: getTokenPosition(leftBrace)
    };
  }
  resolveTypeDeclName(name) {
    return this.typeDecls.get(name);
  }
  resolveSpreadFields() {
    this.advance();
    const name = this.expect(TokenKind.Kind_Identifier, "identifier expected here");
    if (!name) {
      return;
    }
    const typedecl = this.resolveTypeDeclName(name.value);
    if (!typedecl) {
      return;
    }
    if (this.current().kind == TokenKind.Symbol_Comma) {
      this.advance();
    }
    return typedecl.declaration.fields;
  }
  resolveIntersectionFields() {
    const name = this.advance();
    if (!name) {
      return;
    }
    let typedecl = this.resolveTypeDeclName(name.value);
    if (!typedecl) {
      this.diagnostics.addError(Error2(this.filepath, "parser", this.getCurrentPosition(), "non struct type " + name.value + " cannot be used here"));
      this.advance();
      return;
    }
    return typedecl.declaration.fields;
  }
  parseStructDeclaration() {
    let declaration = {
      name: { kind: "identifier", name: "" },
      fields: [],
      compositions: []
    };
    const name = this.expect(TokenKind.Kind_Identifier, "identifier expected here");
    if (!name) {
      return;
    }
    declaration.name = CreateIdentifier(name.value, getTokenPosition(name));
    let typeParams;
    if (this.current().kind == TokenKind.Symbol_Less) {
      typeParams = this.parseTypeParams(true);
      if (!typeParams) {
        return;
      }
    }
    if (!this.expect(TokenKind.Symbol_Equals, "= symbol expected")) {
      return;
    }
    if (this.current().kind == TokenKind.Kind_Identifier) {
      const operand = this.advance();
      declaration.compositions.push(CreateType(operand.value, TypeValue.TypeCustom, getTokenPosition(operand)));
      if (!this.expect(TokenKind.Symbol_Ampersand, "& symbol expected")) {
        return;
      }
    }
    if (!this.expect(TokenKind.Symbol_LeftBrace, "{ symbol expected")) {
      return;
    }
    if (this.current().kind == TokenKind.Symbol_Ellipsis) {
      this.advance();
      const spreadName = this.expect(TokenKind.Kind_Identifier, "record type expected after ...");
      if (!spreadName)
        return;
      declaration.compositions.push(CreateType(spreadName.value, TypeValue.TypeCustom, getTokenPosition(spreadName)));
      if (this.current().kind == TokenKind.Symbol_Comma || this.current().kind == TokenKind.Symbol_Semicolon)
        this.advance();
    }
    while (this.current().kind != TokenKind.Symbol_RightBrace) {
      let fieldName = { name: "", kind: "identifier" };
      let fieldType = CreateType("", TypeValue.TypeInvalid, this.getCurrentPosition());
      const name2 = this.current().kind == TokenKind.Keyword_Error ? this.advance() : this.expect(TokenKind.Kind_Identifier, "identifier expected here");
      if (!name2) {
        return;
      }
      fieldName = CreateIdentifier(name2.value, getTokenPosition(name2));
      if (!this.expect(TokenKind.Symbol_Colon, ": symbol expected")) {
        return;
      }
      const parsedFieldType = this.parseTypeReference(typeParams);
      if (!parsedFieldType)
        return;
      fieldType = parsedFieldType;
      declaration.fields.push({ name: fieldName, type: fieldType });
      if (this.current().kind == TokenKind.Symbol_RightBrace) {
        break;
      }
      if (this.current().kind == TokenKind.Symbol_Comma) {
        this.advance();
        continue;
      }
      if (this.current().kind == TokenKind.Symbol_Semicolon) {
        this.advance();
        continue;
      }
    }
    this.advance();
    if (!this.expect(TokenKind.Symbol_Semicolon, "; symbol expected")) {
      return;
    }
    declaration.typeParameters = typeParams;
    return declaration;
  }
  parseEnumDeclaration() {
    let declaration = {
      name: { name: "", kind: "identifier" },
      variants: []
    };
    const name = this.expect(TokenKind.Kind_Identifier, "identifier expected here");
    if (!name) {
      return;
    }
    declaration.name = CreateIdentifier(name.value, getTokenPosition(name));
    if (!this.expect(TokenKind.Symbol_Equals, "= symbol expected")) {
      return;
    }
    if (!this.expect(TokenKind.Symbol_LeftBrace, "{ symbol expected")) {
      return;
    }
    let valueRequired = false;
    let currentValue = 0;
    while (this.current().kind != TokenKind.Symbol_RightBrace) {
      const n = this.expect(TokenKind.Kind_Identifier, "identifier expected");
      if (!n) {
        return;
      }
      if (this.current().kind == TokenKind.Symbol_Colon && !valueRequired) {
        valueRequired = true;
      }
      if (valueRequired == true) {
        if (!this.expect(TokenKind.Symbol_Colon, "cannot have implicit value for enum variant here")) {
          return;
        }
        const v = this.expect(TokenKind.Kind_IntegerLiteral, "integer literal expected");
        if (!v) {
          return;
        }
        declaration.variants.push({
          name: CreateIdentifier(n.value, getTokenPosition(n)),
          value: {
            position: getTokenPosition(v),
            kind: "integer_literal",
            value: v.value
          }
        });
      } else {
        declaration.variants.push({
          name: CreateIdentifier(n.value, getTokenPosition(n)),
          value: {
            position: getTokenPosition(n),
            kind: "integer_literal",
            value: currentValue.toString()
          }
        });
      }
      if (this.current().kind == TokenKind.Symbol_RightBrace) {
        break;
      }
      if (this.current().kind == TokenKind.Symbol_Comma) {
        this.advance();
        currentValue++;
        continue;
      }
    }
    this.advance();
    if (!this.expect(TokenKind.Symbol_Semicolon, "; symbol expected")) {
      return;
    }
    return {
      name: declaration.name,
      position: getTokenPosition(name),
      kind: "type_declaration",
      declaration,
      declKind: TypeDeclKind.Enum
    };
  }
  parseUnionDeclaration() {
    let declaration = {
      name: { name: "", kind: "identifier" },
      variants: []
    };
    const name = this.expect(TokenKind.Kind_Identifier, "identifier expected here");
    if (!name) {
      return;
    }
    declaration.name = CreateIdentifier(name.value, getTokenPosition(name));
    if (this.current().kind == TokenKind.Symbol_Less) {
      declaration.typeParameters = this.parseTypeParams(true);
      if (!declaration.typeParameters) {
        return;
      }
    }
    if (!this.expect(TokenKind.Symbol_Equals, "= symbol expected")) {
      return;
    }
    while (true) {
      const variantName = this.expect(TokenKind.Kind_Identifier, "identifier expected here");
      if (!variantName) {
        return;
      }
      const variant = CreateType(variantName.value, this.resolveTypeValue(variantName.value), getTokenPosition(variantName));
      if (this.current().kind == TokenKind.Symbol_Less) {
        variant.typeParameters = this.parseTypeParams(false);
        if (!variant.typeParameters) {
          return;
        }
      }
      declaration.variants.push(variant);
      if (this.current().kind != TokenKind.Symbol_Pipe) {
        break;
      }
      this.advance();
    }
    if (!this.expect(TokenKind.Symbol_Semicolon, "; symbol expected")) {
      return;
    }
    return {
      kind: "type_declaration",
      declKind: TypeDeclKind.Union,
      position: getTokenPosition(name),
      name: declaration.name,
      declaration
    };
  }
  parseTypeDeclaration(unique = false) {
    this.advance();
    const declKind = this.advance();
    if (declKind.kind == TokenKind.Kind_Identifier) {
      if (!this.expect(TokenKind.Symbol_Equals, "= symbol expected")) {
        return;
      }
      if (this.current().kind == TokenKind.Symbol_LeftBrace) {
        this.advance();
        const fields = [];
        const compositions = [];
        while (this.current().kind != TokenKind.Symbol_RightBrace) {
          if (this.current().kind == TokenKind.Symbol_Ellipsis) {
            this.advance();
            const spreadName = this.expect(TokenKind.Kind_Identifier, "record type expected after ...");
            if (!spreadName)
              return;
            compositions.push(CreateType(spreadName.value, TypeValue.TypeCustom, getTokenPosition(spreadName)));
            if (this.current().kind == TokenKind.Symbol_Semicolon || this.current().kind == TokenKind.Symbol_Comma)
              this.advance();
            continue;
          }
          const fieldName = this.expect(TokenKind.Kind_Identifier, "field identifier expected");
          if (!fieldName || !this.expect(TokenKind.Symbol_Colon, ": symbol expected"))
            return;
          const fieldType = this.parseTypeReference();
          if (!fieldType)
            return;
          fields.push({
            name: CreateIdentifier(fieldName.value, getTokenPosition(fieldName)),
            type: fieldType
          });
          if (this.current().kind == TokenKind.Symbol_Comma || this.current().kind == TokenKind.Symbol_Semicolon)
            this.advance();
        }
        this.advance();
        if (!this.expect(TokenKind.Symbol_Semicolon, "; expected"))
          return;
        const declaration2 = {
          position: getTokenPosition(declKind),
          kind: "type_declaration",
          name: CreateIdentifier(declKind.value, getTokenPosition(declKind)),
          declKind: TypeDeclKind.Struct,
          declaration: {
            name: CreateIdentifier(declKind.value, getTokenPosition(declKind)),
            fields,
            compositions
          },
          unique
        };
        this.typeDecls.set(declKind.value, declaration2);
        return declaration2;
      }
      const target = this.expect(TokenKind.Kind_Identifier, "identifier expected");
      if (!target) {
        return;
      }
      if (this.current().kind == TokenKind.Symbol_Ampersand) {
        const fields = [];
        const compositions = [
          CreateType(target.value, TypeValue.TypeCustom, getTokenPosition(target))
        ];
        while (this.current().kind == TokenKind.Symbol_Ampersand) {
          this.advance();
          const operand = this.expect(TokenKind.Kind_Identifier, "record type expected after &");
          if (!operand)
            return;
          compositions.push(CreateType(operand.value, TypeValue.TypeCustom, getTokenPosition(operand)));
        }
        if (!this.expect(TokenKind.Symbol_Semicolon, "; expected"))
          return;
        const declaration2 = {
          position: getTokenPosition(declKind),
          kind: "type_declaration",
          name: CreateIdentifier(declKind.value, getTokenPosition(declKind)),
          declKind: TypeDeclKind.Struct,
          declaration: {
            name: CreateIdentifier(declKind.value, getTokenPosition(declKind)),
            fields,
            compositions
          },
          unique
        };
        this.typeDecls.set(declKind.value, declaration2);
        return declaration2;
      }
      if (!this.expect(TokenKind.Symbol_Semicolon, "; expected")) {
        return;
      }
      const declaration = {
        position: getTokenPosition(declKind),
        kind: "type_declaration",
        name: CreateIdentifier(declKind.value, getTokenPosition(declKind)),
        declKind: TypeDeclKind.Alias,
        declaration: {
          target: CreateType(target.value, this.resolveTypeValue(target.value), getTokenPosition(target))
        },
        unique
      };
      this.typeDecls.set(declKind.value, declaration);
      return declaration;
    }
    if (declKind.kind == TokenKind.Keyword_Struct) {
      const decl = this.parseStructDeclaration();
      if (!decl) {
        return;
      }
      const typeDecl = {
        position: getTokenPosition(declKind),
        kind: "type_declaration",
        name: decl.name,
        declKind: TypeDeclKind.Struct,
        declaration: decl,
        unique
      };
      this.typeDecls.set(decl.name.name, typeDecl);
      return typeDecl;
    }
    if (declKind.kind == TokenKind.Keyword_Enum) {
      const decl = this.parseEnumDeclaration();
      if (!decl) {
        return;
      }
      this.typeDecls.set(decl.name.name, decl);
      return decl;
    }
    if (declKind.kind == TokenKind.Keyword_Union) {
      const decl = this.parseUnionDeclaration();
      if (!decl) {
        return;
      }
      this.typeDecls.set(decl.name.name, decl);
      return decl;
    }
    this.diagnostics.addError(Error2(this.filepath, "parser", this.getCurrentPosition(), "invalid type kind specifier: " + declKind.value));
    return;
  }
  /**
   * Parses every top-level declaration until end-of-file. Only `function`
   * declarations are recognized today; any other leading token is an error.
   */
  parseDecls() {
    const decls = [];
    while (this.current().kind != TokenKind.Kind_EOF) {
      const documentation = this.takeDocumentationComments();
      if (this.current().kind == TokenKind.Kind_EOF) {
        break;
      }
      if (this.current().kind == TokenKind.Keyword_Type || this.current().kind == TokenKind.Keyword_Unique) {
        const declarationStart = this.pos;
        const unique = this.current().kind == TokenKind.Keyword_Unique;
        if (unique) {
          this.advance();
          if (!this.expect(TokenKind.Keyword_Type, "type expected after unique"))
            continue;
          this.pos--;
        }
        const decl = this.parseTypeDeclaration(unique);
        if (!decl) {
          this.synchronizeTopLevel(declarationStart);
          continue;
        }
        decl.documentation = documentation;
        decls.push(decl);
        continue;
      }
      if (this.current().kind == TokenKind.Keyword_Let) {
        const declarationStart = this.pos;
        this.diagnostics.addError(Error2(this.filepath, "parser", this.getCurrentPosition(), "`let` is not allowed at file scope; use `const`"));
        this.synchronizeTopLevel(declarationStart);
        continue;
      }
      if (this.current().kind == TokenKind.Keyword_Const) {
        const declarationStart = this.pos;
        const decl = this.parseVariableDeclarationStmt(true);
        if (!decl) {
          this.synchronizeTopLevel(declarationStart);
          continue;
        }
        decl.documentation = documentation;
        decls.push(decl);
        continue;
      }
      if (this.current().kind == TokenKind.Keyword_Function) {
        const declarationStart = this.pos;
        const decl = this.parseFuncDecl();
        if (!decl) {
          this.synchronizeTopLevel(declarationStart);
          continue;
        }
        decl.documentation = documentation;
        decls.push(decl);
        continue;
      } else {
        this.diagnostics.addError(Error2(this.filepath, "parser", this.getCurrentPosition(), "keyword function, type or const expected"));
        this.skipLine();
      }
    }
    return decls;
  }
  /**
   * Error-recovery helper: advances the cursor past the rest of the current
   * source line so parsing can resume at the next line after a failure.
   */
  skipLine() {
    const line = this.current().line;
    while (this.current().kind != TokenKind.Kind_EOF && this.current().line == line) {
      this.advance();
    }
  }
  /**
   * Resumes after a malformed top-level declaration without interpreting
   * its remaining fields or body statements as new declarations.
   */
  synchronizeTopLevel(declarationStart) {
    let braceDepth = 0;
    let sawBrace = false;
    for (let index = declarationStart; index < this.pos; index++) {
      const kind = this.tokens[index]?.kind;
      if (kind == TokenKind.Symbol_LeftBrace) {
        braceDepth++;
        sawBrace = true;
      } else if (kind == TokenKind.Symbol_RightBrace && braceDepth > 0) {
        braceDepth--;
      }
    }
    const startsDeclaration = (kind) => [
      TokenKind.Keyword_Type,
      TokenKind.Keyword_Unique,
      TokenKind.Keyword_Const,
      TokenKind.Keyword_Function
    ].includes(kind);
    while (this.current().kind != TokenKind.Kind_EOF) {
      const token = this.current();
      if (braceDepth == 0 && this.pos > declarationStart && startsDeclaration(token.kind)) {
        return;
      }
      if (token.kind == TokenKind.Symbol_LeftBrace) {
        sawBrace = true;
        braceDepth++;
      } else if (token.kind == TokenKind.Symbol_RightBrace) {
        if (braceDepth == 0) {
          this.advance();
          if (this.current().kind == TokenKind.Symbol_Semicolon)
            this.advance();
          return;
        }
        braceDepth--;
        if (sawBrace && braceDepth == 0) {
          this.advance();
          if (this.current().kind == TokenKind.Symbol_Semicolon)
            this.advance();
          return;
        }
      } else if (!sawBrace && token.kind == TokenKind.Symbol_Semicolon) {
        this.advance();
        return;
      }
      this.advance();
    }
  }
  /**
   * Entry point: parses one file's token stream into a {@link Module}.
   * Returns `undefined` if parsing failed (errors are on {@link Diagnostics}).
   */
  parse(tokens) {
    this.tokens = tokens;
    const decls = this.parseDecls();
    if (!decls) {
      return;
    }
    return {
      fileName: this.filepath,
      declarations: decls
    };
  }
};

// dist/src/ast/tokenizer.js
var NUL = "\0";
var Tokenizer = class {
  source;
  pos = 0;
  line = 1;
  column = 1;
  constructor(source) {
    this.source = source;
  }
  tokenize() {
    const tokens = [];
    while (!this.isAtEnd()) {
      const token = this.scanToken();
      if (token !== null) {
        tokens.push(token);
      }
    }
    tokens.push(this.makeEofToken());
    return tokens;
  }
  log(tokens) {
    console.log(tokens.map((x) => ({
      kind: x.kind,
      value: x.value,
      start: x.start,
      end: x.end
    })));
  }
  /** Scans a single token, or returns null when only whitespace was consumed. */
  scanToken() {
    this.skipWhitespace();
    if (this.isAtEnd()) {
      return null;
    }
    const startPos = this.pos;
    const startLine = this.line;
    const startColumn = this.column;
    const c = this.advance();
    if (this.isAlpha(c)) {
      while (this.isAlphaNumeric(this.peek())) {
        this.advance();
      }
      const lexeme = this.source.slice(startPos, this.pos);
      return this.finish(getTokenKind(lexeme), startPos, startLine, startColumn);
    }
    if (this.isDigit(c)) {
      return this.scanNumber(startPos, startLine, startColumn);
    }
    switch (c) {
      case '"':
        return this.scanQuotedLiteral('"', TokenKind.Kind_StringLiteral, startPos, startLine, startColumn);
      case "'":
        return this.scanSingleQuotedLiteral(startPos, startLine, startColumn);
      case "(":
        return this.finish(TokenKind.Symbol_LeftParen, startPos, startLine, startColumn);
      case ")":
        return this.finish(TokenKind.Symbol_RightParen, startPos, startLine, startColumn);
      case "{":
        return this.finish(TokenKind.Symbol_LeftBrace, startPos, startLine, startColumn);
      case "}":
        return this.finish(TokenKind.Symbol_RightBrace, startPos, startLine, startColumn);
      case "[":
        return this.finish(TokenKind.Symbol_LeftBracket, startPos, startLine, startColumn);
      case "]":
        return this.finish(TokenKind.Symbol_RightBracket, startPos, startLine, startColumn);
      case ":":
        return this.finish(TokenKind.Symbol_Colon, startPos, startLine, startColumn);
      case ";":
        return this.finish(TokenKind.Symbol_Semicolon, startPos, startLine, startColumn);
      case ",":
        return this.finish(TokenKind.Symbol_Comma, startPos, startLine, startColumn);
      case "%":
        if (this.match("="))
          return this.finish(TokenKind.Symbol_PercentEquals, startPos, startLine, startColumn);
        return this.finish(TokenKind.Symbol_Percent, startPos, startLine, startColumn);
      case "^":
        if (this.match("="))
          return this.finish(TokenKind.Symbol_CaretEquals, startPos, startLine, startColumn);
        return this.finish(TokenKind.Symbol_Caret, startPos, startLine, startColumn);
      case "~":
        return this.finish(TokenKind.Symbol_Tilde, startPos, startLine, startColumn);
      case "+":
        if (this.match("+"))
          return this.finish(TokenKind.Symbol_Increment, startPos, startLine, startColumn);
        if (this.match("="))
          return this.finish(TokenKind.Symbol_PlusEquals, startPos, startLine, startColumn);
        return this.finish(TokenKind.Symbol_Plus, startPos, startLine, startColumn);
      case "-":
        if (this.match("-"))
          return this.finish(TokenKind.Symbol_Decrement, startPos, startLine, startColumn);
        if (this.match("="))
          return this.finish(TokenKind.Symbol_MinusEquals, startPos, startLine, startColumn);
        return this.finish(TokenKind.Symbol_Minus, startPos, startLine, startColumn);
      case "*":
        if (this.match("="))
          return this.finish(TokenKind.Symbol_AsteriskEquals, startPos, startLine, startColumn);
        return this.finish(TokenKind.Symbol_Asterisk, startPos, startLine, startColumn);
      case "/":
        if (this.peek() === "/")
          return this.scanLineComment(startPos, startLine, startColumn);
        if (this.peek() === "*")
          return this.scanBlockComment(startPos, startLine, startColumn);
        if (this.match("="))
          return this.finish(TokenKind.Symbol_FSlashEquals, startPos, startLine, startColumn);
        return this.finish(TokenKind.Symbol_FSlash, startPos, startLine, startColumn);
      case "<":
        if (this.match("<")) {
          if (this.match("="))
            return this.finish(TokenKind.Symbol_ShiftLeftEquals, startPos, startLine, startColumn);
          return this.finish(TokenKind.Symbol_ShiftLeft, startPos, startLine, startColumn);
        }
        if (this.match("="))
          return this.finish(TokenKind.Symbol_LessEq, startPos, startLine, startColumn);
        return this.finish(TokenKind.Symbol_Less, startPos, startLine, startColumn);
      case ">":
        if (this.match(">")) {
          if (this.match("="))
            return this.finish(TokenKind.Symbol_ShiftRightEquals, startPos, startLine, startColumn);
          return this.finish(TokenKind.Symbol_ShiftRight, startPos, startLine, startColumn);
        }
        if (this.match("="))
          return this.finish(TokenKind.Symbol_GreaterEq, startPos, startLine, startColumn);
        return this.finish(TokenKind.Symbol_Greater, startPos, startLine, startColumn);
      case "=":
        if (this.match("="))
          return this.finish(TokenKind.Symbol_Equality, startPos, startLine, startColumn);
        return this.finish(TokenKind.Symbol_Equals, startPos, startLine, startColumn);
      case "!":
        if (this.match("="))
          return this.finish(TokenKind.Symbol_NotEquals, startPos, startLine, startColumn);
        return this.finish(TokenKind.Symbol_Not, startPos, startLine, startColumn);
      case "&":
        if (this.match("&"))
          return this.finish(TokenKind.Symbol_LogicalAnd, startPos, startLine, startColumn);
        if (this.match("="))
          return this.finish(TokenKind.Symbol_AmpersandEquals, startPos, startLine, startColumn);
        return this.finish(TokenKind.Symbol_Ampersand, startPos, startLine, startColumn);
      case "|":
        if (this.match("|"))
          return this.finish(TokenKind.Symbol_LogicalOr, startPos, startLine, startColumn);
        if (this.match("="))
          return this.finish(TokenKind.Symbol_PipeEquals, startPos, startLine, startColumn);
        return this.finish(TokenKind.Symbol_Pipe, startPos, startLine, startColumn);
      case ".":
        if (this.peek() === "." && this.peek(1) === ".") {
          this.advance();
          this.advance();
          return this.finish(TokenKind.Symbol_Ellipsis, startPos, startLine, startColumn);
        }
        if (this.match("."))
          return this.finish(TokenKind.Symbol_Range, startPos, startLine, startColumn);
        return this.finish(TokenKind.Symbol_Dot, startPos, startLine, startColumn);
      default:
        return this.finish(TokenKind.Kind_Illegal, startPos, startLine, startColumn);
    }
  }
  scanNumber(startPos, startLine, startColumn) {
    if (this.source[startPos] === "0") {
      const prefix = this.peek();
      if (prefix === "b" || prefix === "B") {
        this.advance();
        if (!this.scanDigitsWithSeparators((c) => this.isBinaryDigit(c))) {
          return this.finish(TokenKind.Kind_Illegal, startPos, startLine, startColumn);
        }
        return this.finish(TokenKind.Kind_IntegerLiteral, startPos, startLine, startColumn);
      }
      if (prefix === "o" || prefix === "O") {
        this.advance();
        if (!this.scanDigitsWithSeparators((c) => this.isOctalDigit(c))) {
          return this.finish(TokenKind.Kind_Illegal, startPos, startLine, startColumn);
        }
        return this.finish(TokenKind.Kind_IntegerLiteral, startPos, startLine, startColumn);
      }
      if (prefix === "x" || prefix === "X") {
        this.advance();
        if (!this.scanDigitsWithSeparators((c) => this.isHexDigit(c))) {
          return this.finish(TokenKind.Kind_Illegal, startPos, startLine, startColumn);
        }
        return this.finish(TokenKind.Kind_IntegerLiteral, startPos, startLine, startColumn);
      }
    }
    if (!this.scanRemainingDigitsWithSeparators((c) => this.isDigit(c))) {
      return this.finish(TokenKind.Kind_Illegal, startPos, startLine, startColumn);
    }
    let isFloat = false;
    if (this.peek() === "." && this.isDigit(this.peek(1))) {
      isFloat = true;
      this.advance();
      if (!this.scanDigitsWithSeparators((c) => this.isDigit(c))) {
        return this.finish(TokenKind.Kind_Illegal, startPos, startLine, startColumn);
      }
    }
    if (this.peek() === "e" || this.peek() === "E") {
      const signOffset = this.peek(1) === "+" || this.peek(1) === "-" ? 2 : 1;
      if (this.isDigit(this.peek(signOffset))) {
        isFloat = true;
        this.advance();
        if (this.peek() === "+" || this.peek() === "-") {
          this.advance();
        }
        if (!this.scanDigitsWithSeparators((c) => this.isDigit(c))) {
          return this.finish(TokenKind.Kind_Illegal, startPos, startLine, startColumn);
        }
      }
    }
    const kind = isFloat ? TokenKind.Kind_FloatLiteral : TokenKind.Kind_IntegerLiteral;
    return this.finish(kind, startPos, startLine, startColumn);
  }
  scanQuotedLiteral(delimiter, kind, startPos, startLine, startColumn) {
    while (!this.isAtEnd()) {
      const c = this.peek();
      if (c === delimiter) {
        this.advance();
        return this.finish(kind, startPos, startLine, startColumn);
      }
      if (c === "\n") {
        break;
      }
      if (c === "\\") {
        this.advance();
      }
      this.advance();
    }
    return this.finish(TokenKind.Kind_Illegal, startPos, startLine, startColumn);
  }
  /**
   * Single quotes support strings while retaining the existing one-scalar
   * character literal syntax. Empty and multi-scalar bodies are strings.
   */
  scanSingleQuotedLiteral(startPos, startLine, startColumn) {
    const token = this.scanQuotedLiteral("'", TokenKind.Kind_StringLiteral, startPos, startLine, startColumn);
    if (token.kind == TokenKind.Kind_Illegal) {
      return token;
    }
    token.kind = this.countQuotedScalars(token.value) == 1 ? TokenKind.Kind_CharacterLiteral : TokenKind.Kind_StringLiteral;
    return token;
  }
  /** Counts source scalars, treating each escape sequence as one scalar. */
  countQuotedScalars(value) {
    const body = value.slice(1, -1);
    let count = 0;
    for (let i = 0; i < body.length; count++) {
      if (body[i] == "\\") {
        i++;
        if (body[i] == "u" && body[i + 1] == "{") {
          i += 2;
          while (i < body.length && body[i] != "}")
            i++;
          if (i < body.length)
            i++;
        } else if (body[i] == "x") {
          i = Math.min(body.length, i + 3);
        } else {
          i++;
        }
        continue;
      }
      const codePoint = body.codePointAt(i);
      i += codePoint > 65535 ? 2 : 1;
    }
    return count;
  }
  scanLineComment(startPos, startLine, startColumn) {
    while (!this.isAtEnd() && this.peek() !== "\n") {
      this.advance();
    }
    return this.finish(TokenKind.Kind_LineComment, startPos, startLine, startColumn);
  }
  scanBlockComment(startPos, startLine, startColumn) {
    this.advance();
    while (!this.isAtEnd()) {
      if (this.peek() === "*" && this.peek(1) === "/") {
        this.advance();
        this.advance();
        return this.finish(TokenKind.Kind_BlockComment, startPos, startLine, startColumn);
      }
      this.advance();
    }
    return this.finish(TokenKind.Kind_Illegal, startPos, startLine, startColumn);
  }
  // --- low-level scanning helpers -----------------------------------------
  finish(kind, startPos, startLine, startColumn) {
    const value = this.source.slice(startPos, this.pos);
    return {
      kind,
      value,
      line: startLine,
      column: startColumn,
      start: startPos,
      end: this.pos
    };
  }
  makeEofToken() {
    return {
      kind: TokenKind.Kind_EOF,
      value: "",
      line: this.line,
      column: this.column,
      start: this.pos,
      end: this.pos
    };
  }
  skipWhitespace() {
    while (!this.isAtEnd()) {
      const c = this.peek();
      if (c === " " || c === "	" || c === "\r" || c === "\n") {
        this.advance();
      } else {
        break;
      }
    }
  }
  advance() {
    const c = this.source[this.pos] ?? NUL;
    this.pos++;
    if (c === "\n") {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return c;
  }
  /** Returns true and consumes one char when it equals `expected`. */
  match(expected) {
    if (this.peek() !== expected) {
      return false;
    }
    this.advance();
    return true;
  }
  peek(offset2 = 0) {
    return this.source[this.pos + offset2] ?? NUL;
  }
  isAtEnd() {
    return this.pos >= this.source.length;
  }
  scanDigitsWithSeparators(isValidDigit) {
    if (!isValidDigit(this.peek())) {
      this.consumeNumericTail();
      return false;
    }
    this.advance();
    return this.scanRemainingDigitsWithSeparators(isValidDigit);
  }
  scanRemainingDigitsWithSeparators(isValidDigit) {
    while (true) {
      if (isValidDigit(this.peek())) {
        this.advance();
        continue;
      }
      if (this.peek() === "_") {
        this.advance();
        if (!isValidDigit(this.peek())) {
          this.consumeNumericTail();
          return false;
        }
        this.advance();
        continue;
      }
      return true;
    }
  }
  consumeNumericTail() {
    while (this.isAlphaNumeric(this.peek())) {
      this.advance();
    }
  }
  isBinaryDigit(c) {
    return c === "0" || c === "1";
  }
  isOctalDigit(c) {
    return c >= "0" && c <= "7";
  }
  isHexDigit(c) {
    return this.isDigit(c) || c >= "a" && c <= "f" || c >= "A" && c <= "F";
  }
  isDigit(c) {
    return c >= "0" && c <= "9";
  }
  isAlpha(c) {
    return c >= "a" && c <= "z" || c >= "A" && c <= "Z" || c === "_";
  }
  isAlphaNumeric(c) {
    return this.isAlpha(c) || this.isDigit(c);
  }
};

// dist/src/compiler/pipeline.js
function compileSource(source, fileName) {
  const diagnostics = new Diagnostics(fileName);
  const ast = new Parser(fileName, diagnostics).parse(new Tokenizer(source).tokenize());
  if (!ast)
    return { diagnostics: diagnostics.errors };
  const globalScope = new AnalyzerCore(ast, diagnostics).analyze();
  return { ast, diagnostics: diagnostics.errors, globalScope };
}

// dist/src/lsp/source-index.js
function symbolMarkdown(symbol) {
  const detail = symbol.signature ?? `${symbol.kind} ${symbol.name}${symbol.type ? `: ${symbol.type}` : ""}`;
  const signature = `\`\`\`delta
${detail}
\`\`\``;
  return symbol.documentation ? `${signature}

${symbol.documentation}` : signature;
}
var LexicalScope = class {
  start;
  end;
  parent;
  symbols = /* @__PURE__ */ new Map();
  children = [];
  constructor(start, end, parent) {
    this.start = start;
    this.end = end;
    this.parent = parent;
  }
  contains(offset2) {
    return this.start <= offset2 && offset2 <= this.end;
  }
  findScope(offset2) {
    return this.children.find((child) => child.contains(offset2))?.findScope(offset2) ?? this;
  }
  lookup(name) {
    return this.symbols.get(name) ?? this.parent?.lookup(name);
  }
};
var isTrivia = (token) => token?.kind === TokenKind.Kind_LineComment || token?.kind === TokenKind.Kind_BlockComment;
function previous(tokens, index) {
  for (let i = index - 1; i >= 0; i--)
    if (!isTrivia(tokens[i]))
      return i;
  return -1;
}
function next(tokens, index) {
  for (let i = index + 1; i < tokens.length; i++)
    if (!isTrivia(tokens[i]))
      return i;
  return -1;
}
function scopeFor(root, offset2) {
  return root.findScope(offset2);
}
var SourceIndex = class {
  source;
  uri;
  tokens;
  root;
  structs = /* @__PURE__ */ new Map();
  constructor(source, uri) {
    this.source = source;
    this.uri = uri;
    this.tokens = new Tokenizer(source).tokenize().filter((token) => token.kind !== TokenKind.Kind_EOF);
    this.root = new LexicalScope(0, source.length);
    this.buildScopes();
    this.indexDeclarations();
    this.indexResultBindings();
  }
  buildScopes() {
    const stack = [this.root];
    for (const token of this.tokens) {
      if (token.kind === TokenKind.Symbol_LeftBrace) {
        const parent = stack[stack.length - 1];
        const scope = new LexicalScope(token.start, this.source.length, parent);
        parent.children.push(scope);
        stack.push(scope);
      } else if (token.kind === TokenKind.Symbol_RightBrace && stack.length > 1) {
        stack.pop().end = token.end;
      }
    }
  }
  add(symbol) {
    symbol.scope.symbols.set(symbol.name, symbol);
  }
  /**
   * Finds documentation before a declaration, including comments placed
   * before a `unique` modifier.
   */
  documentationAt(index) {
    const direct = documentationBefore(this.tokens, index);
    if (direct)
      return direct;
    let cursor = previous(this.tokens, index);
    while (cursor >= 0 && this.tokens[cursor].kind === TokenKind.Keyword_Unique) {
      const documentation = documentationBefore(this.tokens, cursor);
      if (documentation)
        return documentation;
      cursor = previous(this.tokens, cursor);
    }
    return void 0;
  }
  indexDeclarations() {
    for (let i = 0; i < this.tokens.length; i++) {
      if (this.tokens[i].kind === TokenKind.Keyword_Type)
        this.indexType(i);
    }
    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[i];
      if (token.kind === TokenKind.Keyword_Function)
        this.indexFunction(i);
      if (token.kind === TokenKind.Keyword_Const || token.kind === TokenKind.Keyword_Let)
        this.indexVariable(i);
    }
  }
  text(start, end) {
    const first = this.tokens[start];
    const last = this.tokens[end];
    return first && last ? this.source.slice(first.start, last.end) : "";
  }
  typeTextAfter(nameIndex, stopKinds) {
    const colon = next(this.tokens, nameIndex);
    if (this.tokens[colon]?.kind !== TokenKind.Symbol_Colon)
      return void 0;
    const start = next(this.tokens, colon);
    if (start < 0)
      return void 0;
    let angle = 0;
    let square = 0;
    let end = start;
    for (let i = start; i < this.tokens.length; i++) {
      const kind = this.tokens[i].kind;
      if (kind === TokenKind.Symbol_Less)
        angle++;
      else if (kind === TokenKind.Symbol_Greater && angle > 0)
        angle--;
      else if (kind === TokenKind.Symbol_LeftBracket)
        square++;
      else if (kind === TokenKind.Symbol_RightBracket && square > 0)
        square--;
      if (angle === 0 && square === 0 && stopKinds.includes(kind))
        break;
      end = i;
    }
    return this.text(start, end).trim();
  }
  matchingAngle(open) {
    return this.match(open, TokenKind.Symbol_Less, TokenKind.Symbol_Greater);
  }
  typeParameterNames(open, close) {
    const names = [];
    let expectName = true;
    let nested = 0;
    for (let i = open + 1; i < close; i++) {
      const token = this.tokens[i];
      if (token.kind === TokenKind.Symbol_Less)
        nested++;
      else if (token.kind === TokenKind.Symbol_Greater && nested > 0)
        nested--;
      else if (nested === 0 && token.kind === TokenKind.Symbol_Comma)
        expectName = true;
      else if (expectName && token.kind === TokenKind.Kind_Identifier) {
        names.push(token.value);
        expectName = false;
      }
    }
    return names;
  }
  indexFunction(index) {
    let nameIndex = next(this.tokens, index);
    let receiverName;
    let receiverType;
    if (this.tokens[nameIndex]?.kind === TokenKind.Symbol_LeftParen) {
      const receiverClose = this.match(nameIndex, TokenKind.Symbol_LeftParen, TokenKind.Symbol_RightParen);
      if (receiverClose < 0)
        return;
      const receiverNameIndex = next(this.tokens, nameIndex);
      receiverName = this.tokens[receiverNameIndex];
      if (receiverName?.kind !== TokenKind.Kind_Identifier)
        return;
      receiverType = this.typeTextAfter(receiverNameIndex, [TokenKind.Symbol_RightParen]);
      if (!receiverType)
        return;
      nameIndex = next(this.tokens, receiverClose);
    }
    const name = this.tokens[nameIndex];
    if (!name || name.kind !== TokenKind.Kind_Identifier)
      return;
    let open = next(this.tokens, nameIndex);
    let typeParameters;
    if (this.tokens[open]?.kind === TokenKind.Symbol_Less) {
      const closeTypes = this.matchingAngle(open);
      if (closeTypes < 0)
        return;
      typeParameters = this.typeParameterNames(open, closeTypes);
      open = next(this.tokens, closeTypes);
    }
    if (this.tokens[open]?.kind !== TokenKind.Symbol_LeftParen)
      return;
    const close = this.match(open, TokenKind.Symbol_LeftParen, TokenKind.Symbol_RightParen);
    if (close < 0)
      return;
    let returnType;
    let errorTypes;
    const afterClose = next(this.tokens, close);
    if (this.tokens[afterClose]?.kind === TokenKind.Symbol_Colon) {
      const start = next(this.tokens, afterClose);
      let cursor = start;
      let angle = 0;
      while (cursor >= 0 && cursor < this.tokens.length) {
        const kind = this.tokens[cursor].kind;
        if (kind === TokenKind.Symbol_Less)
          angle++;
        else if (kind === TokenKind.Symbol_Greater && angle > 0)
          angle--;
        if (angle === 0 && (kind === TokenKind.Symbol_Pipe || kind === TokenKind.Symbol_LeftBrace))
          break;
        cursor++;
      }
      if (cursor > start)
        returnType = this.text(start, cursor - 1).trim();
      if (this.tokens[cursor]?.kind === TokenKind.Symbol_Pipe) {
        const errorStart = next(this.tokens, cursor);
        let errorEnd = errorStart;
        while (errorEnd < this.tokens.length && this.tokens[errorEnd].kind !== TokenKind.Symbol_LeftBrace)
          errorEnd++;
        errorTypes = this.tokens.slice(errorStart, errorEnd).filter((token) => token.kind === TokenKind.Kind_Identifier).map((token) => token.value);
      }
    }
    const parameters = [];
    for (let i = open + 1; i < close; i++) {
      const parameter = this.tokens[i];
      if (parameter.kind !== TokenKind.Kind_Identifier)
        continue;
      const type = this.typeTextAfter(i, [
        TokenKind.Symbol_Comma,
        TokenKind.Symbol_RightParen
      ]);
      if (!type)
        continue;
      parameters.push(`${parameter.value}: ${type}`);
    }
    let terminator = close + 1;
    while (terminator < this.tokens.length && ![TokenKind.Symbol_LeftBrace, TokenKind.Symbol_Semicolon].includes(this.tokens[terminator].kind)) {
      terminator++;
    }
    const bodyOpen = this.tokens[terminator]?.kind === TokenKind.Symbol_LeftBrace ? terminator : -1;
    const requirementEnd = this.tokens[terminator]?.kind === TokenKind.Symbol_Semicolon ? terminator : -1;
    const signatureStart = index;
    const symbol = {
      name: name.value,
      kind: receiverType ? "method" : "function",
      type: returnType,
      signature: bodyOpen >= 0 ? this.source.slice(this.tokens[signatureStart].start, this.tokens[bodyOpen].start).trim() : requirementEnd >= 0 ? this.source.slice(this.tokens[signatureStart].start, this.tokens[requirementEnd].end).trim() : `function ${name.value}${typeParameters?.length ? `<${typeParameters.join(", ")}>` : ""}(${parameters.join(", ")})${returnType ? `: ${returnType}` : ""}`,
      documentation: this.documentationAt(index),
      typeParameters,
      errorTypes,
      uri: this.uri,
      token: name,
      scope: this.root
    };
    if (receiverType) {
      const receiverInfo = this.structs.get(this.baseTypeName(receiverType));
      if (receiverInfo && !receiverInfo.fields.some((member) => member.name === name.value)) {
        receiverInfo.fields.push(symbol);
      }
    } else {
      this.add(symbol);
    }
    if (bodyOpen < 0)
      return;
    const functionScope = scopeFor(this.root, this.tokens[bodyOpen].start + 1);
    if (receiverName && receiverType) {
      this.add({
        name: receiverName.value,
        kind: "parameter",
        type: receiverType,
        token: receiverName,
        scope: functionScope,
        uri: this.uri
      });
    }
    for (let i = open + 1; i < close; i++) {
      const parameter = this.tokens[i];
      const type = this.typeTextAfter(i, [
        TokenKind.Symbol_Comma,
        TokenKind.Symbol_RightParen
      ]);
      if (parameter.kind === TokenKind.Kind_Identifier && type) {
        this.add({
          name: parameter.value,
          kind: "parameter",
          type,
          token: parameter,
          scope: functionScope,
          uri: this.uri
        });
      }
    }
  }
  indexVariable(index) {
    const nameIndex = next(this.tokens, index);
    const name = this.tokens[nameIndex];
    if (!name || name.kind !== TokenKind.Kind_Identifier)
      return;
    const scope = scopeFor(this.root, name.start);
    const type = this.typeTextAfter(nameIndex, [TokenKind.Symbol_Equals, TokenKind.Symbol_Semicolon]) ?? this.inferVariableType(nameIndex, scope);
    this.add({
      name: name.value,
      kind: "variable",
      type,
      signature: `${this.tokens[index].value} ${name.value}${type ? `: ${type}` : ""}`,
      documentation: this.documentationAt(index),
      uri: this.uri,
      token: name,
      scope
    });
  }
  inferVariableType(nameIndex, scope) {
    const equals = next(this.tokens, nameIndex);
    if (this.tokens[equals]?.kind !== TokenKind.Symbol_Equals)
      return void 0;
    const valueIndex = next(this.tokens, equals);
    const value = this.tokens[valueIndex];
    if (!value)
      return void 0;
    switch (value.kind) {
      case TokenKind.Kind_IntegerLiteral:
        return "int32";
      case TokenKind.Kind_FloatLiteral:
        return "float64";
      case TokenKind.Kind_BooleanLiteral:
        return "bool";
      case TokenKind.Kind_StringLiteral:
        return "string";
      case TokenKind.Kind_CharacterLiteral:
        return "char";
      case TokenKind.Kind_Identifier:
        if (this.tokens[next(this.tokens, valueIndex)]?.kind === TokenKind.Symbol_Dot && this.tokens[next(this.tokens, next(this.tokens, valueIndex))]?.value === "length" && scope.lookup(value.value)?.type === "string") {
          return "uintsize";
        }
        if (this.tokens[next(this.tokens, valueIndex)]?.kind === TokenKind.Symbol_LeftBrace)
          return value.value;
        if (this.tokens[next(this.tokens, valueIndex)]?.kind === TokenKind.Symbol_LeftParen)
          return scope.lookup(value.value)?.type;
        return scope.lookup(value.value)?.type;
      default:
        return void 0;
    }
  }
  indexType(index) {
    let cursor = next(this.tokens, index);
    if (this.tokens[cursor]?.kind === TokenKind.Keyword_Struct || this.tokens[cursor]?.kind === TokenKind.Keyword_Enum || this.tokens[cursor]?.kind === TokenKind.Keyword_Union)
      cursor = next(this.tokens, cursor);
    const name = this.tokens[cursor];
    if (!name || name.kind !== TokenKind.Kind_Identifier)
      return;
    const isStruct = this.tokens[previous(this.tokens, cursor)]?.kind === TokenKind.Keyword_Struct;
    let afterName = next(this.tokens, cursor);
    let typeParameters;
    if (this.tokens[afterName]?.kind === TokenKind.Symbol_Less) {
      const closeTypes = this.matchingAngle(afterName);
      if (closeTypes < 0)
        return;
      typeParameters = this.typeParameterNames(afterName, closeTypes);
      afterName = next(this.tokens, closeTypes);
    }
    const declarationEnd = this.tokens.findIndex((token, i) => i > cursor && token.kind === TokenKind.Symbol_Semicolon);
    const signatureStart = index;
    const symbol = {
      name: name.value,
      kind: "type",
      type: `${name.value}${typeParameters?.length ? `<${typeParameters.join(", ")}>` : ""}`,
      signature: declarationEnd >= 0 ? this.source.slice(this.tokens[signatureStart].start, this.tokens[declarationEnd].end) : void 0,
      documentation: this.documentationAt(index),
      typeParameters,
      uri: this.uri,
      token: name,
      scope: this.root
    };
    this.add(symbol);
    const info = { fields: [] };
    this.structs.set(name.value, info);
    const equals = afterName;
    const target = this.tokens[next(this.tokens, equals)];
    if (!isStruct && this.tokens[equals]?.kind === TokenKind.Symbol_Equals && target?.kind === TokenKind.Kind_Identifier) {
      info.aliasOf = target.value;
      return;
    }
    if (!isStruct)
      return;
    const open = this.tokens.findIndex((token, i) => i > cursor && token.kind === TokenKind.Symbol_LeftBrace);
    if (open < 0)
      return;
    const close = this.match(open, TokenKind.Symbol_LeftBrace, TokenKind.Symbol_RightBrace);
    if (close < 0)
      return;
    for (let i = open + 1; i < close; i++) {
      const field = this.tokens[i];
      const type = this.typeTextAfter(i, [
        TokenKind.Symbol_Comma,
        TokenKind.Symbol_RightBrace
      ]);
      if (field.kind !== TokenKind.Kind_Identifier || !type)
        continue;
      const fieldSymbol = {
        name: field.value,
        kind: "field",
        type,
        token: field,
        scope: this.root,
        uri: this.uri
      };
      info.fields.push(fieldSymbol);
    }
  }
  indexResultBindings() {
    for (let i = 0; i < this.tokens.length; i++) {
      if (this.tokens[i].kind !== TokenKind.Keyword_As)
        continue;
      const nameIndex = next(this.tokens, i);
      const name = this.tokens[nameIndex];
      if (!name || name.kind !== TokenKind.Kind_Identifier)
        continue;
      if (this.tokens[previous(this.tokens, i)]?.kind === TokenKind.Keyword_Error)
        continue;
      let statementStart = i - 1;
      while (statementStart >= 0 && ![
        TokenKind.Symbol_Semicolon,
        TokenKind.Symbol_LeftBrace,
        TokenKind.Symbol_RightBrace
      ].includes(this.tokens[statementStart].kind)) {
        statementStart--;
      }
      const statementTokens = this.tokens.slice(statementStart + 1, i);
      if (statementTokens.some((token) => token.kind === TokenKind.Keyword_Check))
        continue;
      let sourceFunction;
      const closeCall = previous(this.tokens, i);
      if (this.tokens[closeCall]?.kind === TokenKind.Symbol_RightParen) {
        let depth = 0;
        for (let cursor = closeCall; cursor >= statementStart; cursor--) {
          const kind = this.tokens[cursor].kind;
          if (kind === TokenKind.Symbol_RightParen)
            depth++;
          else if (kind === TokenKind.Symbol_LeftParen && --depth === 0) {
            let calleeIndex = previous(this.tokens, cursor);
            if (this.tokens[calleeIndex]?.kind === TokenKind.Symbol_Greater) {
              let angleDepth = 0;
              for (let typeCursor = calleeIndex; typeCursor >= 0; typeCursor--) {
                const typeKind = this.tokens[typeCursor].kind;
                if (typeKind === TokenKind.Symbol_Greater)
                  angleDepth++;
                else if (typeKind === TokenKind.Symbol_Less && --angleDepth === 0) {
                  calleeIndex = previous(this.tokens, typeCursor);
                  break;
                }
              }
            }
            const callee = this.tokens[calleeIndex];
            if (callee?.kind === TokenKind.Kind_Identifier) {
              sourceFunction = this.root.lookup(callee.value);
            }
            break;
          }
        }
      }
      const channels = [
        sourceFunction?.type ?? "success",
        ...sourceFunction?.errorTypes ?? []
      ];
      this.add({
        name: name.value,
        kind: "variable",
        type: `result<${channels.join(" | ")}>`,
        signature: `result ${name.value}: ${channels.join(" | ")}`,
        token: name,
        uri: this.uri,
        scope: scopeFor(this.root, name.start)
      });
    }
  }
  match(open, left, right) {
    let depth = 0;
    for (let i = open; i < this.tokens.length; i++) {
      if (this.tokens[i].kind === left)
        depth++;
      if (this.tokens[i].kind === right && --depth === 0)
        return i;
    }
    return -1;
  }
  tokenAt(offset2) {
    return this.tokens.findIndex((token) => token.start <= offset2 && offset2 < token.end);
  }
  resolveAt(offset2) {
    const index = this.tokenAt(offset2);
    if (index < 0)
      return void 0;
    const token = this.tokens[index];
    if (token.kind !== TokenKind.Kind_Identifier)
      return void 0;
    for (const info of this.structs.values()) {
      const declaredMember = info.fields.find((member) => member.token.start === token.start);
      if (declaredMember)
        return declaredMember;
    }
    if (this.tokens[next(this.tokens, index)]?.kind === TokenKind.Symbol_Colon) {
      const field = this.resolveObjectField(index);
      if (field)
        return field;
    }
    if (this.tokens[previous(this.tokens, index)]?.kind === TokenKind.Symbol_Dot)
      return this.resolveMember(index);
    return scopeFor(this.root, token.start).lookup(token.value);
  }
  resolveObjectField(fieldIndex) {
    const brace = this.enclosingLeftBrace(fieldIndex);
    if (brace < 0)
      return void 0;
    const typeName = this.objectTypeBeforeBrace(brace);
    if (!typeName)
      return void 0;
    return this.fieldsFor(typeName).find((field) => field.name === this.tokens[fieldIndex].value);
  }
  enclosingLeftBrace(index) {
    let depth = 0;
    for (let cursor = index - 1; cursor >= 0; cursor--) {
      const kind = this.tokens[cursor].kind;
      if (kind === TokenKind.Symbol_RightBrace)
        depth++;
      else if (kind === TokenKind.Symbol_LeftBrace) {
        if (depth === 0)
          return cursor;
        depth--;
      }
    }
    return -1;
  }
  objectTypeBeforeBrace(brace) {
    const before = previous(this.tokens, brace);
    const token = this.tokens[before];
    if (!token)
      return void 0;
    if (token.kind === TokenKind.Kind_Identifier)
      return token.value;
    if (token.kind === TokenKind.Symbol_Greater || token.kind === TokenKind.Symbol_ShiftRight) {
      let depth = 0;
      for (let cursor = before; cursor >= 0; cursor--) {
        const kind = this.tokens[cursor].kind;
        if (kind === TokenKind.Symbol_Greater)
          depth++;
        else if (kind === TokenKind.Symbol_ShiftRight)
          depth += 2;
        else if (kind === TokenKind.Symbol_Less && --depth === 0) {
          const owner = this.tokens[previous(this.tokens, cursor)];
          return owner?.kind === TokenKind.Kind_Identifier ? owner.value : void 0;
        }
      }
    }
    if (token.kind === TokenKind.Symbol_Colon) {
      const outerField = this.resolveObjectField(previous(this.tokens, before));
      return outerField?.type;
    }
    if (token.kind !== TokenKind.Symbol_Equals)
      return void 0;
    let statementStart = before - 1;
    while (statementStart >= 0 && ![
      TokenKind.Symbol_Semicolon,
      TokenKind.Symbol_LeftBrace,
      TokenKind.Symbol_RightBrace
    ].includes(this.tokens[statementStart].kind)) {
      statementStart--;
    }
    for (let cursor = statementStart + 1; cursor < before; cursor++) {
      if (this.tokens[cursor].kind !== TokenKind.Symbol_Colon)
        continue;
      const annotated = this.tokens[next(this.tokens, cursor)];
      if (annotated?.kind === TokenKind.Kind_Identifier)
        return annotated.value;
    }
    const assigned = previous(this.tokens, before);
    return this.resolveToken(assigned)?.type;
  }
  resolveMember(memberIndex) {
    const receiverIndex = previous(this.tokens, previous(this.tokens, memberIndex));
    if (receiverIndex < 0)
      return void 0;
    const receiver = this.resolveToken(receiverIndex);
    const type = receiver?.type ?? receiver?.name;
    return type ? this.fieldsFor(type).find((field) => field.name === this.tokens[memberIndex].value) : void 0;
  }
  resolveToken(index) {
    const token = this.tokens[index];
    if (!token || token.kind !== TokenKind.Kind_Identifier)
      return void 0;
    if (this.tokens[previous(this.tokens, index)]?.kind === TokenKind.Symbol_Dot)
      return this.resolveMember(index);
    return scopeFor(this.root, token.start).lookup(token.value);
  }
  fieldsFor(typeName) {
    const seen = /* @__PURE__ */ new Set();
    let type = this.baseTypeName(typeName);
    while (!seen.has(type)) {
      seen.add(type);
      const info = this.structs.get(type);
      if (!info)
        return [];
      if (info.fields.length)
        return info.fields;
      if (!info.aliasOf)
        return [];
      type = info.aliasOf;
    }
    return [];
  }
  /** Removes access and indirection wrappers to find the member-bearing record. */
  baseTypeName(typeName) {
    let type = typeName.trim().replace(/^edit\s+/, "").replace(/^&\s*/, "");
    const indirection = type.match(/^owned\s*<\s*(.+)\s*>$/);
    if (indirection)
      type = indirection[1];
    return type.replace(/<.*>$/, "").replace(/\[.*$/, "").trim();
  }
  completions(offset2) {
    let index = this.tokens.findIndex((token) => token.start <= offset2 && offset2 < token.end);
    if (index >= 0 && this.tokens[index].kind === TokenKind.Kind_Identifier && this.tokens[index].start < offset2)
      index = previous(this.tokens, index);
    else
      index = this.tokens.reduce((best, token, i) => token.end <= offset2 ? i : best, -1);
    if (this.tokens[index]?.kind === TokenKind.Symbol_Dot) {
      const receiver = this.resolveToken(previous(this.tokens, index));
      return receiver ? this.fieldsFor(receiver.type ?? receiver.name) : [];
    }
    const visible = [];
    for (let scope = scopeFor(this.root, offset2); scope; scope = scope.parent)
      visible.push(...scope.symbols.values());
    return [...new Map(visible.map((symbol) => [symbol.name, symbol])).values()];
  }
  isMemberCompletion(offset2) {
    let index = this.tokens.findIndex((token) => token.start <= offset2 && offset2 < token.end);
    if (index >= 0 && this.tokens[index].kind === TokenKind.Kind_Identifier && this.tokens[index].start < offset2)
      index = previous(this.tokens, index);
    else
      index = this.tokens.reduce((best, token, i) => token.end <= offset2 ? i : best, -1);
    return this.tokens[index]?.kind === TokenKind.Symbol_Dot;
  }
};

// dist/src/lsp/version.js
var LSP_VERSION = "0.3.27";

// dist/src/lsp/server.js
var documents = new import_node2.TextDocuments(TextDocument);
var states = /* @__PURE__ */ new Map();
var connection = (0, import_node.createConnection)(import_node.ProposedFeatures.all, process.stdin, process.stdout);
var keywords = [
  "function",
  "return",
  "const",
  "let",
  "if",
  "else",
  "while",
  "for",
  "switch",
  "case",
  "default",
  "type",
  "struct",
  "enum",
  "union",
  "as",
  "check",
  "forward",
  "error",
  "break",
  "continue",
  "new",
  "move",
  "clone",
  "edit",
  "unique",
  "heap",
  "owned"
];
var primitives = [
  "int8",
  "int16",
  "int32",
  "int64",
  "uint8",
  "uint16",
  "uint32",
  "uint64",
  "intsize",
  "uintsize",
  "float32",
  "float64",
  "bool",
  "char",
  "string",
  "stringview",
  "void"
];
function offset(document, position2) {
  return document.offsetAt(position2);
}
function position(document, sourceOffset) {
  return document.positionAt(sourceOffset);
}
function documentPath(document) {
  if (!document.uri.startsWith("file:"))
    return void 0;
  try {
    return (0, import_url.fileURLToPath)(document.uri);
  } catch {
    return void 0;
  }
}
function lspDiagnostics(document) {
  const result = compileSource(document.getText(), documentPath(document) ?? document.uri);
  return result.diagnostics.map((error) => ({
    severity: import_node.DiagnosticSeverity.Error,
    range: {
      start: position(document, error.position.start),
      end: position(document, error.position.end)
    },
    source: "delta",
    message: error.message
  }));
}
function update(document) {
  const index = new SourceIndex(document.getText(), documentPath(document) ?? document.uri);
  states.set(document.uri, { index });
  connection.sendDiagnostics({ uri: document.uri, diagnostics: lspDiagnostics(document) });
}
function state(uri) {
  return states.get(uri);
}
function completionKind(symbol) {
  switch (symbol.kind) {
    case "function":
      return import_node.CompletionItemKind.Function;
    case "type":
      return import_node.CompletionItemKind.Struct;
    case "field":
      return import_node.CompletionItemKind.Field;
    case "method":
      return import_node.CompletionItemKind.Method;
    case "parameter":
      return import_node.CompletionItemKind.Variable;
    default:
      return import_node.CompletionItemKind.Variable;
  }
}
connection.onInitialize(() => {
  return {
    capabilities: {
      textDocumentSync: import_node.TextDocumentSyncKind.Incremental,
      hoverProvider: true,
      definitionProvider: true,
      completionProvider: { triggerCharacters: ["."] }
    },
    serverInfo: { name: "delta-language-server", version: LSP_VERSION }
  };
});
connection.onNotification(import_node.DidChangeWatchedFilesNotification.type, () => {
  for (const document of documents.all())
    update(document);
});
documents.onDidOpen((event) => update(event.document));
documents.onDidChangeContent((event) => update(event.document));
documents.onDidClose((event) => {
  states.delete(event.document.uri);
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});
connection.onHover((params) => {
  const document = documents.get(params.textDocument.uri);
  const index = state(params.textDocument.uri)?.index;
  if (!document || !index)
    return null;
  const symbol = index.resolveAt(offset(document, params.position));
  if (!symbol)
    return null;
  const hover = {
    contents: { kind: import_node.MarkupKind.Markdown, value: symbolMarkdown(symbol) }
  };
  if (!symbol.uri || symbol.uri === params.textDocument.uri) {
    hover.range = {
      start: position(document, symbol.token.start),
      end: position(document, symbol.token.end)
    };
  }
  return hover;
});
connection.onDefinition((params) => {
  const document = documents.get(params.textDocument.uri);
  const index = state(params.textDocument.uri)?.index;
  if (!document || !index)
    return null;
  const symbol = index.resolveAt(offset(document, params.position));
  if (!symbol)
    return null;
  return {
    uri: symbol.uri ?? params.textDocument.uri,
    range: {
      start: { line: symbol.token.line - 1, character: symbol.token.column - 1 },
      end: {
        line: symbol.token.line - 1,
        character: symbol.token.column - 1 + symbol.token.value.length
      }
    }
  };
});
connection.onCompletion((params) => {
  const document = documents.get(params.textDocument.uri);
  const index = state(params.textDocument.uri)?.index;
  if (!document || !index)
    return [];
  const completionOffset = offset(document, params.position);
  const symbols = index.completions(completionOffset);
  const symbolItems = symbols.map((symbol) => ({
    label: symbol.name,
    kind: completionKind(symbol),
    detail: symbol.signature ?? symbol.type,
    documentation: { kind: import_node.MarkupKind.Markdown, value: symbolMarkdown(symbol) }
  }));
  if (index.isMemberCompletion(offset(document, params.position)))
    return symbolItems;
  return [
    ...symbolItems,
    ...keywords.map((label) => ({ label, kind: import_node.CompletionItemKind.Keyword })),
    ...primitives.map((label) => ({ label, kind: import_node.CompletionItemKind.TypeParameter }))
  ];
});
function startLanguageServer() {
  documents.listen(connection);
  connection.listen();
}

// dist/src/lsp/main.js
startLanguageServer();
