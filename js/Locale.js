/*global chrome*/
// eslint-disable-next-line no-unused-vars
const Locale = (function() {
    var localeId;
    var relativeTimeFormat;

    function getLocale() {
        return localeId;
    }

    function setLocale(id) {
        localeId = id;
        relativeTimeFormat = new Intl.RelativeTimeFormat(localeId, {
            numeric: 'auto',
            style: 'narrow'
        });
    }

    setLocale(chrome.i18n.getUILanguage());

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

    function getDate(value) {
        if (value instanceof Date) return value;
        if (typeof value == 'string') value = parseInt(value);
        if (typeof value == 'number') value = new Date(value < 1e10 ? value * 1000 : value);
        return value;
    }

    function getFormatter(format) {
        let options = {};
        for(let c of format.split('')) {
            var name = {
                y: 'year',
                m: 'month',
                d: 'day',
                H: 'hour',
                M: 'minute',
                S: 'second'
            }[c];
            if(name) options[name] = name == 'month' ? 'short' : 'numeric';
            if(c == 'H' || c == 'M' || c == 'S') options.hour12 = false;
        }
        return function(value) {
            value = getDate(value);
            return value instanceof Date ? value.toLocaleString(localeId, options) : '';
        };
    }

    function getNumDays(d1, d2) {
        d1 = getDate(d1);
        if (!(d1 instanceof Date)) return null;
        if (d2 === undefined) d2 = new Date();
        if (!(d2 instanceof Date)) return null;
        d1.setHours(0, 0, 0, 0);
        d2.setHours(0, 0, 0, 0);
        var num = d1 - d2;
        return Math.floor(num / (86400 * 1000)); // Fix bug by rounding down (floor)
    }

    return {
        getLocale: getLocale,
        setLocale: setLocale,
        getMessage: function(id, ...args) {
            return chrome.i18n.getMessage(id, args);
        },
        formatNumber: formatNumber,
        getDate: getDate,
        formatDayMonth: getFormatter('md'),
        formatDate: getFormatter('ymd'),
        formatDateTime: getFormatter('ymdHM'),
        formatDateTimeFull: getFormatter('ymdHMS'),
        formatTime: getFormatter('HM'),
        formatTimeFull: getFormatter('HMS'),
        getNumDays: getNumDays,
        formatDays: (d1, d2) => {
            var num = getNumDays(d1, d2);
            return num === null ? '' : relativeTimeFormat.format(num, 'days');
        }
    };
})();