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