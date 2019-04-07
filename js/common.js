//#region UTILITIES
// function asArrayOfKeys(value) {
//     if (typeof value == 'string') return value.split(',');
//     if (Array.isArray(value)) return value;
//     return Object.keys(value);
// }

// function asArrayOfInt(value) {
//     return (value || '').split(',').map(o => parseInt(o));
// }

// function hasRuntimeError() {
//     var hasError = !!chrome.runtime.lastError;
//     if (hasError) console.error('Runtime error', chrome.runtime.lastError);
//     return hasError;
// }
//#endregion

//#region URLINFO
// function UrlInfo(url) {
//     var len, i1, i2, i3, i4, i5;
//     this.url = url;
//     this.search = this.hash = '';
//     len = url.length;
//     i1 = url.indexOf('://') + 3;
//     i2 = url.indexOf('/', i1);
//     if (i2 < 0) i2 = len;
//     this.hostname = url.substring(i1, i2);
//     i3 = url.indexOf('?', i2);
//     i4 = url.indexOf('#', i2);
//     if (i4 >= 0) this.hash = url.substring(i4);
//     else i4 = len;
//     if (i3 >= 0 && i3 < i4) this.search = url.substring(i3, i4);
//     else i3 = i4;
//     this.pathname = url.substring(i2, i3);
//     i5 = url.lastIndexOf('/', i3);
//     this.filename = url.substring(i5 + 1, i3);
// }
// Object.defineProperty(UrlInfo.prototype, 'parameters', {
//     get: function() {
//         if (!this.__parameters) {
//             this.__parameters = {};
//             if (this.search) this.search.substr(1).split('&').forEach(item => {
//                 var p = item.split('=');
//                 this.__parameters[decodeURIComponent(p[0])] = p.length > 1 ? decodeURIComponent(p[1]) : true;
//             });
//         }
//         return this.__parameters;
//     }
// });
//#endregion

//#region LOCALIZATION
// var localeId = chrome.i18n.getUILanguage();

// function formatNumber(value, decimalDigits) {
//     var options = undefined;
//     if (typeof value == 'string') value = parseFloat(value);
//     if (typeof value != 'number' || !isFinite(value)) return '';
//     if (decimalDigits !== undefined) options = {
//         minimumFractionDigits: decimalDigits,
//         maximumFractionDigits: decimalDigits
//     };
//     return value.toLocaleString(localeId, options);
// }

// var {
//     formatDate,
//     formatDateTime,
//     formatDateTimeFull,
//     getNumDays,
//     formatDays
// } = (function() {
//     function getDate(value) {
//         if (value instanceof Date) return value;
//         if (typeof value == 'string') value = parseInt(value);
//         if (typeof value == 'number') value = new Date(value < 1e10 ? value * 1000 : value);
//         return value;
//     }

//     function getFormatter(fn, options) {
//         return function(value) {
//             value = getDate(value);
//             return value instanceof Date ? fn.call(value, localeId, options) : '';
//         };
//     }
//     var relativeTimeFormat = new Intl.RelativeTimeFormat(localeId, {
//         numeric: 'auto',
//         style: 'narrow'
//     });

//     function getNumDays(d1, d2) {
//         var d1 = getDate(d1);
//         if (!(d1 instanceof Date)) return null;
//         if (d2 === undefined) d2 = new Date();
//         if (!(d2 instanceof Date)) return null;
//         d1.setHours(0, 0, 0, 0);
//         d2.setHours(0, 0, 0, 0);
//         var num = d1 - d2;
//         return Math.floor(num / (86400 * 1000)); // Fix bug by rounding down (floor)
//     }
//     return {
//         formatDate: getFormatter(Date.prototype.toLocaleDateString),
//         formatDateTime: getFormatter(Date.prototype.toLocaleString, {
//             year: 'numeric',
//             month: 'numeric',
//             day: 'numeric',
//             hour: 'numeric',
//             minute: 'numeric'
//         }),
//         formatDateTimeFull: getFormatter(Date.prototype.toLocaleString),
//         getNumDays: getNumDays,
//         formatDays: (d1, d2) => {
//             var num = getNumDays(d1, d2);
//             return num === null ? '' : relativeTimeFormat.format(num, 'days');
//         }
//     };
// })();
//#endregion

//#region HTML UTILITIES
// var {
//     getType,
//     getTemplateFunction,
//     html,
//     htmlBr,
//     HtmlRaw
// } = (function() {
//     var htmlEntities = {
//             '&': '&amp;',
//             '<': '&lt;',
//             '>': '&gt;',
//             '\'': '&#39;',
//             '"': '&quot;',
//             '\n': '<br>'
//         },
//         htmlReplacer = c => htmlEntities[c],
//         getType = o => o === null ? 'null' : (o === undefined ? 'undefined' : o.constructor.name);

//     function HtmlRaw(text) {
//         if (this instanceof HtmlRaw) this.text = String(text);
//         else return new HtmlRaw(text);
//     }
//     HtmlRaw.prototype.toString = function() {
//         return this.text;
//     };

//     var defaultEncoder = (o, e) => typeof o == 'string' ? o : e(String(o)),
//         defaultStringEncoder = o => o,
//         defaultEncoders = {
//             'HtmlRaw': o => o.text,
//             'null': _o => '',
//             'undefined': _o => '',
//             'String': defaultStringEncoder,
//             'Array': (o, e) => o.map(u => e(u)).join(''),
//             '*': defaultEncoder
//         };

//     function getTemplateFunction(encoders) {
//         encoders = Object.assign({}, defaultEncoders, encoders);
//         let encode = o => (encoders[getType(o)] || (typeof o == 'string' ? defaultStringEncoder : encoders['*'] || defaultEncoder))(o, encode);
//         let fn = function(strings, ...values) {
//             var len = values.length;
//             return new HtmlRaw(Array.isArray(strings) && 'raw' in strings ? strings.map((s, i) => i >= len ? s : s + encode(values[i])).join('') : encode(strings));
//         };
//         fn.encoders = encoders;
//         return fn;
//     }

//     return {
//         getType: getType,
//         getTemplateFunction: getTemplateFunction,
//         html: getTemplateFunction({
//             'String': o => o.replace(/[&<>'"]/g, htmlReplacer)
//         }),
//         htmlBr: getTemplateFunction({
//             'String': o => o.replace(/[&<>'"\n]/g, htmlReplacer)
//         }),
//         HtmlRaw: HtmlRaw
//     };
// })();
//#endregion