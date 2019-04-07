/*global chrome*/
/*
 ** dialog.js
 */

// Inject stylesheet
if (!document.getElementById('DAF-md-style'))
    document.head.appendChild(Object.assign(document.createElement('link'), {
        id: 'DAF-md-style',
        type: 'text/css',
        rel: 'stylesheet',
        href: chrome.extension ? chrome.extension.getURL('css/dialog.css') : 'dialog.css'
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
    OK: 'ok',
    CONFIRM: 'confirm',
    YES: 'yes',
    NO: 'no',
    CANCEL: 'cancel',
    escapeHtml: (function() {
        var re = /[&<>'"]/g;
        var o = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '\'': '&#39;',
            '"': '&quot;'
        };
        return function(value) {
            value = typeof value == 'string' ? value : (value ? value.toString() : '');
            return value.replace(re, c => o[c]);
        };
    })(),
    escapeHtmlBr: function(value) {
        return Dialog.escapeHtml(value).replace(/\n/g, '<br>');
    },
    getMessage: function(message, subs = null) {
        return chrome.i18n ? Dialog.escapeHtmlBr(chrome.i18n.getMessage(message, subs)) : message;
    },
    onkeydown: function(event) {
        if (event.keyCode == 27 && this.cancelable) {
            this.hide().runCallback(Dialog.CANCEL);
        }
    }
});
// class methods
Object.defineProperty(Dialog.prototype, 'visible', {
    set: function(visible) {
        this.getElement().classList.toggle('DAF-md-show', !!visible);
        if (visible && !this.onkeydown && this.cancelable) {
            this.onkeydown = Dialog.onkeydown.bind(this);
            window.addEventListener('keydown', this.onkeydown, true);
        } else if (!visible && this.onkeydown) {
            window.removeEventListener('keydown', this.onkeydown, true);
            delete this.onkeydown;
        }
    },
    get: function() {
        return this.element ? this.element.classList.contains('DAF-md-show') : false;
    }
});
Object.assign(Dialog.prototype, {
    delay: 5000,
    remove: function() {
        if (this.element) this.element.parentNode.removeChild(this.element);
        delete this.element;
        return this;
    },
    create: function(force) {
        if (!this.element || force) {
            this.remove();
            this.element = document.createElement('div');
            this.element.className = 'DAF-dialog DAF-md-superscale ' + (this.mode === Dialog.TOAST ? 'DAF-toast' : 'DAF-modal') + (this.mode === Dialog.WAIT ? ' DAF-md-wait' : '');
            this.element.innerHTML = [
                '<div class="DAF-md-box"><div class="DAF-md-content"><div class="DAF-md-title"></div><form action="#" method="get"><div class="DAF-md-body"></div><div class="DAF-md-footer">',
                '<button value="ok">', Dialog.getMessage('dialog_ok') + '</button>',
                '<button value="confirm">', Dialog.getMessage('dialog_confirm') + '</button>',
                '<button value="yes">', Dialog.getMessage('dialog_yes') + '</button>',
                '<button value="no">', Dialog.getMessage('dialog_no') + '</button>',
                '<button value="cancel">', Dialog.getMessage('dialog_cancel') + '</button>',
                '</div></form></div></div></div>'
            ].join('');
            this.form = this.element.getElementsByTagName('form')[0];
            document.body.appendChild(this.element);
        }
        return this;
    },
    getElement: function() {
        return this.create().element;
    },
    show: function(options, callback) {
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

        var element = this.element,
            elements = [];
        ['BUTTON', 'INPUT', 'TEXTAREA'].forEach(tagName => {
            elements = elements.concat(Array.from(element.getElementsByTagName(tagName)));
        });
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
        return this;
    },
    runCallback: function(method) {
        var dialog = this;
        if (dialog.callback) setTimeout(() => dialog.callback(method, dialog.getParams(method)), 100);
    },
    hide: function() {
        this.visible = false;
        return this;
    },
    setTitle: function(title) {
        var el = this.create().element.getElementsByClassName('DAF-md-title')[0];
        if (el) {
            el.innerHTML = Dialog.escapeHtmlBr(title);
            el.style.display = title ? '' : 'none';
        }
        return this;
    },
    setHtml: function(html) {
        var el = this.create().element.getElementsByClassName('DAF-md-body')[0];
        if (el) {
            el.innerHTML = html;
            el.style.display = el.firstChild ? '' : 'none';
        }
        return this.setStyle();
    },
    setText: function(text) {
        if (this.mode === Dialog.WAIT && !this.visible)
            return this.show({
                text: text
            });
        return this.setHtml(Dialog.escapeHtmlBr(text));
    },
    setStyle: function(style) {
        if (style === null || style === undefined) style = this.lastStyle;
        style = this.lastStyle = style instanceof Array ? style : String(style).split(/,|\s/);
        style = style.map(method => method.toLowerCase());
        this.getElement().classList.toggle('DAF-md-critical', style.indexOf(Dialog.CRITICAL) >= 0);
        Array.from(this.element.getElementsByTagName('button')).forEach(button => {
            var dialog = this,
                method = button.value.toLowerCase();
            button.style.display = style.indexOf(method) >= 0 ? '' : 'none';
            if (!button.getAttribute('hasListener')) {
                button.setAttribute('hasListener', '1');
                button.addEventListener('click', function(event) {
                    event.stopPropagation();
                    event.preventDefault();
                    dialog.hide().runCallback(method);
                });
            }
        });
        return this;
    },
    getParams: function(method) {
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
/*
 ** END
 *******************************************************************************/