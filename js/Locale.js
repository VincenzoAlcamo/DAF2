/*global chrome*/
// eslint-disable-next-line no-unused-vars
const Locale = (function () {
    let localeId;
    let relativeTimeFormat;
    let listFormat;

    function getLocale() {
        return localeId;
    }

    function setLocale(id) {
        localeId = id;
        relativeTimeFormat = new Intl.RelativeTimeFormat(localeId, {
            numeric: 'auto',
            style: 'narrow'
        });
        if ('ListFormat' in Intl) {
            listFormat = new Intl.ListFormat(localeId, {
                style: 'short',
                type: 'unit'
            });
        } else {
            listFormat = {
                format: list => [].concat(list).join(', ')
            };
        }
    }

    setLocale(chrome.i18n.getUILanguage());

    function formatList(list) {
        list = list.map(v => (v === null || v === undefined) ? '' : (typeof v == 'string' ? v : String(v)));
        return listFormat.format(list);
    }

    function formatNumber(value, decimalDigits) {
        let options = undefined;
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
        const options = {};
        for (const c of format.split('')) {
            const name = {
                y: 'year',
                m: 'month',
                d: 'day',
                H: 'hour',
                M: 'minute',
                S: 'second'
            }[c];
            if (name) options[name] = name == 'month' ? 'short' : 'numeric';
            // if (c == 'H' || c == 'M' || c == 'S') options.hour12 = false;
        }
        return function (value) {
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
        const num = d1 - d2;
        return Math.floor(num / (86400 * 1000)); // Fix bug by rounding down (floor)
    }

    return {
        getLocale: getLocale,
        setLocale: setLocale,
        formatList: formatList,
        formatNumber: formatNumber,
        getDate: getDate,
        formatDayMonth: getFormatter('md'),
        formatYear: getFormatter('y'),
        formatDate: getFormatter('ymd'),
        formatDateTime: getFormatter('ymdHM'),
        formatDateTimeFull: getFormatter('ymdHMS'),
        formatTime: getFormatter('HM'),
        formatTimeFull: getFormatter('HMS'),
        getNumDays: getNumDays,
        formatDaysNum: num => num === null ? '' : relativeTimeFormat.format(num, 'days'),
        formatDays: (d1, d2) => Locale.formatDaysNum(getNumDays(d1, d2))
    };
})();