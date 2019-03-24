//#region UTILITIES
function asArrayOfKeys(value) {
    if (typeof value == 'string') return value.split(',');
    if (Array.isArray(value)) return value;
    return Object.keys(value);
}

function asArrayOfInt(value) {
    return (value || '').split(',').map(o => parseInt(o));
}

function hasRuntimeError() {
    var hasError = !!chrome.runtime.lastError;
    if (hasError) console.error('Runtime error', chrome.runtime.lastError);
    return hasError;
}
//#endregion

//#region URLINFO
function UrlInfo(url) {
    var len, i1, i2, i3, i4, i5;
    this.url = url;
    this.search = this.hash = '';
    len = url.length;
    i1 = url.indexOf('://') + 3;
    i2 = url.indexOf('/', i1);
    if (i2 < 0) i2 = len;
    this.hostname = url.substring(i1, i2);
    i3 = url.indexOf('?', i2);
    i4 = url.indexOf('#', i2);
    if (i4 >= 0) this.hash = url.substring(i4);
    else i4 = len;
    if (i3 >= 0 && i3 < i4) this.search = url.substring(i3, i4);
    else i3 = i4;
    this.pathname = url.substring(i2, i3);
    i5 = url.lastIndexOf('/', i3);
    this.filename = url.substring(i5 + 1, i3);
}
Object.defineProperty(UrlInfo.prototype, 'parameters', {
    get: function() {
        if (!this.__parameters) {
            this.__parameters = {};
            if (this.search) this.search.substr(1).split('&').forEach(item => {
                var p = item.split('=');
                this.__parameters[decodeURIComponent(p[0])] = p.length > 1 ? decodeURIComponent(p[1]) : true;
            });
        }
        return this.__parameters;
    }
});
//#endregion

//#region LOCALIZATION
var localeId = chrome.i18n.getUILanguage();

function getMessage(id, ...args) {
    return chrome.i18n.getMessage(id, args);
}

function formatNumber(value, decimalDigits) {
    var options = undefined;
    if (typeof value == 'string') value = parseFloat(value);
    if (typeof value != 'number' || !isFinite(value)) return '';
    if (decimalDigits !== undefined) options = {
        minimumFractionDigits: decimalDigits,
        maximumFractionDigits: decimalDigits
    };
    return value.toLocaleString(localeId, options);
}

var {
    formatDate,
    formatDateTime,
    formatDateTimeFull
} = (function() {
    function getFormatter(fn, options) {
        return function(value) {
            if (typeof value == 'string') value = parseInt(value);
            if (typeof value == 'number') value = new Date(value < 1e10 ? value * 1000 : value);
            return value instanceof Date ? fn.call(value, localeId, options) : '';
        }
    }
    return {
        formatDate: getFormatter(Date.prototype.toLocaleDateString),
        formatDateTime: getFormatter(Date.prototype.toLocaleString, {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric'
        }),
        formatDateTimeFull: getFormatter(Date.prototype.toLocaleString)
    };
})();
//#endregion

//#region HTML UTILITIES
var {
    getType,
    getTemplateFunction,
    html,
    htmlBr,
    Raw
} = (function() {
    var htmlEntities = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;',
            '\n': '<br>'
        },
        htmlReplacer = c => htmlEntities[c],
        getType = o => o === null ? 'null' : (o === undefined ? 'undefined' : o.constructor.name),
        reClass = /[\.#]?[^\s#.]+/g,
        reStyle = /^(.*?)(\s+!important\s*)?$/;

    function Raw(text) {
        if (this instanceof Raw) this.text = String(text);
        else return new Raw(text);
    }
    Raw.prototype.toString = function() {
        return this.text;
    };

    var defaultEncoder = (o, e) => typeof o == 'string' ? o : e(String(o)),
        defaultStringEncoder = o => o,
        defaultEncoders = {
            'Raw': o => o.text,
            'null': o => '',
            'undefined': o => '',
            'String': defaultStringEncoder,
            'Array': (o, e) => o.map(u => e(u)).join(''),
            '*': defaultEncoder
        };

    function getTemplateFunction(encoders) {
        encoders = Object.assign({}, defaultEncoders, encoders);
        let encode = o => (encoders[getType(o)] || (typeof o == 'string' ? defaultStringEncoder : encoders['*'] || defaultEncoder))(o, encode);
        let fn = function(strings, ...values) {
            var len = values.length;
            return new Raw(Array.isArray(strings) && 'raw' in strings ? strings.map((s, i) => i >= len ? s : s + encode(values[i])).join('') : encode(strings));
        };
        fn.encoders = encoders;
        return fn;
    }

    return {
        getType: getType,
        getTemplateFunction: getTemplateFunction,
        html: getTemplateFunction({
            'String': o => o.replace(/[&<>'"]/g, htmlReplacer)
        }),
        htmlBr: getTemplateFunction({
            'String': o => o.replace(/[&<>'"\n]/g, htmlReplacer)
        }),
        Raw: Raw
    };
})();
//#endregion