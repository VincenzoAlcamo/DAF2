/*global chrome*/
// Inject stylesheet
if (!document.getElementById('DAF-md-style'))
    document.head.appendChild(Object.assign(document.createElement('link'), {
        id: 'DAF-md-style',
        type: 'text/css',
        rel: 'stylesheet',
        href: chrome.extension ? chrome.extension.getURL('css/Dialog.css') : 'Dialog.css'
    }));

function Dialog(mode = Dialog.MODAL) {
    if (!(this instanceof Dialog)) return new Dialog(mode);
    this.mode = mode;
}
// static methods
Object.assign(Dialog, {
    MODAL: Symbol(),
    WAIT: Symbol(),
    TOAST: Symbol(),
    CRITICAL: 'critical',
    WIDEST: 'widest',
    OK: 'ok',
    CONFIRM: 'confirm',
    YES: 'yes',
    NO: 'no',
    CANCEL: 'cancel',
    CLOSE: 'close',
    AUTORUN: 'autorun',
    htmlEncodeBr: function (text) {
        return text === undefined || text === null ? '' : String(text).replace(/[&<>'"\n]/g, c => c == '\n' ? '<br>' : '&#' + c.charCodeAt(0) + ';');
    },
    language: 'en',
    getMessage: function getMessage(id, ...args) {
        let text = chrome.i18n.getMessage(Dialog.language + '@' + id, args);
        if (text == '' && Dialog.language != 'en') text = chrome.i18n.getMessage('en@' + id, args);
        return text;
    },
    onkeydown: function (event) {
        if (event.keyCode == 27 && this.cancelable) {
            this.runCallback(Dialog.CANCEL);
        }
    }
});
// class methods
Object.defineProperty(Dialog.prototype, 'visible', {
    set: function (visible) {
        this.getElement().classList.toggle('DAF-md-show', !!visible);
        if (visible && !this.onkeydown && this.cancelable) {
            this.onkeydown = Dialog.onkeydown.bind(this);
            window.addEventListener('keydown', this.onkeydown, true);
        } else if (!visible && this.onkeydown) {
            window.removeEventListener('keydown', this.onkeydown, true);
            delete this.onkeydown;
        }
    },
    get: function () {
        return this.element ? this.element.classList.contains('DAF-md-show') : false;
    }
});
Object.assign(Dialog.prototype, {
    delay: 5000,
    remove: function () {
        if (this.element) this.element.parentNode.removeChild(this.element);
        delete this.element;
        return this;
    },
    create: function (force) {
        if (!this.element || force) {
            this.remove();
            this.element = document.createElement('div');
            this.element.className = 'DAF-dialog DAF-md-superscale ' + (this.mode === Dialog.TOAST ? 'DAF-toast' : 'DAF-modal') + (this.mode === Dialog.WAIT ? ' DAF-md-wait' : '');
            // We stopped using a CSS transform (that blurs the text)
            const button = action => `<button value="${action}">${Dialog.getMessage('dialog_' + action)}</button>`;
            this.element.innerHTML = `<div class="DAF-md-box"><form action="#" method="get" class="DAF-md-content">
            <div class="DAF-md-title"></div><div class="DAF-md-body"></div>
            <div class="DAF-md-footer">${[Dialog.OK, Dialog.CONFIRM, Dialog.YES, Dialog.NO, Dialog.CANCEL, Dialog.CLOSE].map(button).join('')}</div></form></div>`;
            this.form = this.element.getElementsByTagName('form')[0];
            document.body.appendChild(this.element);
        }
        return this;
    },
    getElement: function () {
        return this.create().element;
    },
    show: function (options, callback) {
        var o = Object.assign({}, this.defaults, options);
        if (this.mode === Dialog.WAIT) {
            o.title = Dialog.getMessage('dialog_pleasewait');
            o.style = [Dialog.CRITICAL];
            o.cancelable = false;
        }
        this.cancelable = 'cancelable' in o ? !!o.cancelable : true;
        this.callback = callback;
        this.lastStyle = o.style || (this.mode === Dialog.TOAST ? [] : [Dialog.CONFIRM]);
        this.visible = true;
        this.setTitle(o.title);
        if (o.html) this.setHtml(o.html);
        else this.setText(o.text);

        var element = this.element;
        var elements = [];
        for (let tagName of ['BUTTON', 'INPUT', 'TEXTAREA']) elements = elements.concat(Array.from(element.getElementsByTagName(tagName)));
        element = elements.find(el => o.defaultButton == (el.tagName == 'BUTTON' ? el.value.toLowerCase() : el.name));
        if (element) setTimeout(() => element.focus(), 100);
        if (this.mode === Dialog.TOAST) {
            this.delay = o.delay || this.delay;
            if (this.removeTimer) clearTimeout(this.removeTimer);
            this.removeTimer = setTimeout(() => {
                this.visible = false;
                this.removeTimer = setTimeout(() => {
                    delete this.removeTimer;
                    this.remove();
                }, 500);
            }, this.delay);
        }
        if (this.lastStyle.includes(Dialog.AUTORUN)) this.runCallback(Dialog.AUTORUN, null, true);
        return this;
    },
    runCallback: function (method, input, flagNoHide) {
        let dialog = this;
        let params = dialog.getParams(method);
        if (input) params.input = input;
        if (!flagNoHide) dialog.hide();
        if (dialog.callback) setTimeout(() => dialog.callback(method, dialog.getParams(method)), flagNoHide ? 0 : 100);
    },
    hide: function () {
        this.visible = false;
        return this;
    },
    setTitle: function (title) {
        var el = this.create().element.getElementsByClassName('DAF-md-title')[0];
        if (el) {
            el.innerHTML = Dialog.htmlEncodeBr(title);
            el.style.display = title ? '' : 'none';
        }
        return this;
    },
    setHtml: function (html) {
        var el = this.create().element.getElementsByClassName('DAF-md-body')[0];
        if (el) {
            el.innerHTML = html;
            el.style.display = el.firstChild ? '' : 'none';
        }
        return this.setStyle();
    },
    setText: function (text) {
        if (this.mode === Dialog.WAIT && !this.visible)
            return this.show({
                text: text
            });
        return this.setHtml(Dialog.htmlEncodeBr(text));
    },
    setStyle: function (style) {
        if (style === null || style === undefined) style = this.lastStyle;
        style = this.lastStyle = style instanceof Array ? style : String(style).split(/,|\s/);
        style = style.map(method => method.toLowerCase());
        for (let tag of [Dialog.CRITICAL, Dialog.WIDEST]) this.getElement().classList.toggle('DAF-md-' + tag, style.includes(tag));
        let dialog = this;
        for (let input of this.element.querySelectorAll('button,[data-method]')) {
            let isInput = input.getAttribute('data-method');
            let method = isInput ? input.getAttribute('data-method') : input.value.toLowerCase();
            input.style.display = isInput || style.includes(method) ? '' : 'none';
            if (!input.getAttribute('hasListener')) {
                input.setAttribute('hasListener', '1');
                let eventName = input.tagName == 'BUTTON' || input.getAttribute('type') == 'button' ? 'click' : 'input';
                input.addEventListener(eventName, function (event) {
                    event.stopPropagation();
                    event.preventDefault();
                    dialog.runCallback(method, input, isInput);
                });
            }
        }
        return this;
    },
    getParams: function (method) {
        var params = {};
        if (method) params.method = method;

        function add(name, value) {
            if (name in params) {
                var prev = params[name];
                if (Array.isArray(prev)) prev.push(value);
                else params[name] = [prev, value];
            } else params[name] = value;
        }
        Array.from(this.form.elements).forEach(e => {
            var name = e.name;
            var value = e.value;
            var type = e.tagName == 'INPUT' ? e.type.toUpperCase() : e.tagName;
            switch (type) {
                case 'TEXT':
                case 'TEXTAREA':
                case 'NUMBER':
                    add(name, value);
                    break;
                case 'RADIO':
                case 'CHECKBOX':
                    if (e.checked) add(name, value);
                    break;
                case 'SELECT':
                    value = Array.from(e.selectedOptions).map(item => item.value);
                    if (value.length == 1) add(name, value[0]);
                    else if (value.length > 1) add(name, value);
                    break;
            }
        });
        return params;
    }
});