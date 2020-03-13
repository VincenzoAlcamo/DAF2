// eslint-disable-next-line no-unused-vars
const Html = (function () {
    function HtmlRaw(text) {
        if (this instanceof HtmlRaw) this.text = (text === null || text === undefined) ? '' : String(text);
        else return new HtmlRaw(text);
    }
    HtmlRaw.prototype.toString = function () {
        return this.text;
    };

    const htmlEntities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
        '\n': '<br>'
    };
    const replacer = (c) => htmlEntities[c];

    function getTemplateFunction(re) {
        function encode(v) {
            return (v === null || v === undefined) ? '' : (v instanceof HtmlRaw) ? v.text : (typeof v == 'string' ? v : String(v)).replace(re, replacer);
        }
        return function (strings, ...values) {
            var len = values.length;
            // Was called as template function or as plain function
            return new HtmlRaw(Array.isArray(strings) && 'raw' in strings ? strings.map((s, i) => i >= len ? s : s + encode(values[i])).join('') : encode(strings));
        };
    }

    const Html = getTemplateFunction(/[&<>'"]/g);
    Html.encode = Html;
    Html.raw = HtmlRaw;
    Html.br = getTemplateFunction(/[&<>'"\n]/g);

    return Html;
})();