const {
    // eslint-disable-next-line no-unused-vars
    HtmlRaw,
    // eslint-disable-next-line no-unused-vars
    Html,
    // eslint-disable-next-line no-unused-vars
    HtmlBr
} = (function() {

    var htmlEntities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
        '\n': '<br>'
    };

    function replacer(c) {
        return htmlEntities[c];
    }

    function HtmlRaw(text) {
        if (this instanceof HtmlRaw) this.text = String(text);
        else return new HtmlRaw(text);
    }
    HtmlRaw.prototype.toString = function() {
        return this.text;
    };

    function getTemplateFunction(re) {
        function encode(v) {
            return (v === null || v === undefined) ? '' : (v instanceof HtmlRaw) ? v.text : (typeof v == 'string' ? v : String(v)).replace(re, replacer);
        }
        return function(strings, ...values) {
            var len = values.length;
            // Was called as template function or as plain function
            return new HtmlRaw(Array.isArray(strings) && 'raw' in strings ? strings.map((s, i) => i >= len ? s : s + encode(values[i])).join('') : encode(strings));
        };
    }

    var Html = getTemplateFunction(/[&<>'"]/g);
    var HtmlBr = getTemplateFunction(/[&<>'"\n]/g);

    return {
        HtmlRaw: HtmlRaw,
        Html: Html,
        HtmlBr: HtmlBr
    };
})();