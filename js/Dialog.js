/*global chrome Html*/
// Inject stylesheet
if (!document.getElementById('DAF-md-style')) {
	const link = Html.addStylesheet(chrome.runtime ? chrome.runtime.getURL('css/Dialog.css') : 'Dialog.css');
	link.id = 'DAF-md-style';
}

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
	HIDE: 'hide',
	AUTORUN: 'autorun',
	language: 'en',
	getMessage: function getMessage(id, ...args) {
		const $L = Dialog.language;
		if (getMessage.$L !== $L) {
			const $M = getMessage.$M = {}, split = (key) => chrome.i18n.getMessage(key).split('|'), m0 = split('en'), m1 = split(getMessage.$L = $L);
			split('keys').forEach((key, index) => $M[key] = m1[index] || m0[index]);
		}
		return (getMessage.$M[id.toLowerCase()] || '').replace(/\^\d/g, t => { const n = +t[1] - 1; return n >= 0 && n < args.length ? args[n] : ''; });
	},
	onkeydown(event) {
		if (event.keyCode == 27 && this.cancelable) {
			this.runCallback(Dialog.CANCEL);
		}
	}
});
// class methods
Object.defineProperty(Dialog.prototype, 'visible', {
	set(visible) {
		this.getElement().classList.toggle('DAF-md-show', !!visible);
		if (visible && !this.onkeydown && this.cancelable) {
			this.onkeydown = Dialog.onkeydown.bind(this);
			window.addEventListener('keydown', this.onkeydown, true);
		} else if (!visible) {
			if (this.onkeydown) {
				window.removeEventListener('keydown', this.onkeydown, true);
				delete this.onkeydown;
			}
			if (this.autoRemove) {
				if (this.removeTimer) clearTimeout(this.removeTimer);
				this.removeTimer = setTimeout(() => this.remove(), 500);
			}
		}
	},
	get() {
		return this.element ? this.element.classList.contains('DAF-md-show') : false;
	}
});
Object.assign(Dialog.prototype, {
	delay: 5000,
	remove() {
		if (this.element) this.element.parentNode.removeChild(this.element);
		delete this.element;
		return this;
	},
	create(force) {
		if (!this.element || force) {
			this.remove();
			// We stopped using a CSS transform (that blurs the text)
			const button = action => `<button data-method="${action}">${Dialog.getMessage('dialog_' + action)}</button>`;
			const htm = `<div class="DAF-dialog DAF-md-superscale ${this.mode === Dialog.TOAST ? 'DAF-toast' : 'DAF-modal'}${this.mode === Dialog.WAIT ? ' DAF-md-wait' : ''}">
            <div class="DAF-md-box"><form action="#" method="get" class="DAF-md-content">
            <div class="DAF-md-title"><button title="${Dialog.getMessage('dialog_close')}" data-method="${Dialog.CLOSE}"></button><button data-method="${Dialog.HIDE}"></button><div></div></div><div class="DAF-md-body"></div>
            <div class="DAF-md-footer">${[Dialog.OK, Dialog.CONFIRM, Dialog.YES, Dialog.NO, Dialog.CANCEL].map(button).join('')}</div></form></div></div>`;
			this.element = Html.get(htm)[0];
			this.element.querySelectorAll('button').forEach(el => el.classList.add('DAF-core'));
			this.form = this.element.getElementsByTagName('form')[0];
			document.body.appendChild(this.element);
		}
		return this;
	},
	getElement() {
		return this.create().element;
	},
	show(options, callback) {
		const o = Object.assign({}, this.defaults, options);
		if (this.mode === Dialog.WAIT) {
			o.title = Dialog.getMessage('dialog_pleasewait');
			o.style = [Dialog.CRITICAL, Dialog.HIDE];
			o.cancelable = false;
		}
		this.cancelable = 'cancelable' in o ? !!o.cancelable : true;
		this.callback = callback;
		this.lastStyle = o.style || (this.mode === Dialog.TOAST ? [] : [Dialog.CONFIRM]);
		this.visible = true;
		this.setTitle(o.title);
		if (o.html) this.setHtml(o.html);
		else this.setText(o.text);

		let element = this.element;
		let elements = [];
		for (const tagName of ['BUTTON', 'INPUT', 'TEXTAREA']) elements = elements.concat(Array.from(element.getElementsByTagName(tagName)));
		element = elements.find(el => o.defaultButton == (el.tagName == 'BUTTON' ? el.value.toLowerCase() : el.name));
		if (element) setTimeout(() => element.focus(), 100);
		if (this.mode === Dialog.TOAST) {
			this.delay = o.delay || this.delay;
			this.autoRemove = true;
			if (this.removeTimer) clearTimeout(this.removeTimer);
			this.removeTimer = setTimeout(() => {
				delete this.removeTimer;
				this.visible = false;
			}, this.delay);
		}
		this.clearAuto();
		if (o.auto) {
			const autoMethod = o.auto.toLowerCase();
			this.autoInput = this.inputs[autoMethod];
			if (this.autoInput) {
				let timeout = +o.timeout;
				timeout = isFinite(timeout) && timeout > 0 ? timeout : 10;
				const fn = () => {
					if (timeout > 0) {
						this.autoInput.setAttribute('timer', timeout--);
						if (this.autoTimer) clearTimeout(this.autoTimer);
						return this.autoTimer = setTimeout(fn, 1000);
					}
					this.runCallback(autoMethod, this.autoInput, this.autoInput.classList.contains('DAF-keep-open'));
				};
				fn();
			}
		}
		if (this.lastStyle.includes(Dialog.AUTORUN)) this.runCallback(Dialog.AUTORUN, null, true);
		return this;
	},
	clearAuto() {
		if (this.autoInput) this.autoInput.removeAttribute('timer');
		delete this.autoInput;
		if (this.autoTimer) clearTimeout(this.autoTimer);
		delete this.autoTimer;
	},
	runCallback(method, input, flagNoHide) {
		const dialog = this;
		const params = dialog.getParams(method);
		if (input) params.input = input;
		if (!flagNoHide) { dialog.hide(); dialog.clearAuto(); }
		if (dialog.callback) setTimeout(() => dialog.callback(method, dialog.getParams(method)), flagNoHide ? 0 : 100);
	},
	hide() {
		this.visible = false;
		return this;
	},
	setTitle(title) {
		const el = this.create().element.querySelector('.DAF-md-title div');
		if (el) {
			Html.set(el, String(Html.br(title)).replace(/\v([^\v]*)/g, '<sub>$1</sub>'));
			el.parentNode.classList.toggle('empty', !title);
		}
		return this;
	},
	setHtml(html) {
		const el = this.create().element.getElementsByClassName('DAF-md-body')[0];
		const footer = this.element.querySelector('.DAF-md-footer');
		if (footer) footer.querySelectorAll(':not(.DAF-core)').forEach(el => el.remove());
		if (el) {
			Html.set(el, html);
			el.style.display = el.firstChild ? '' : 'none';
			if (footer) {
				const first = footer.firstChild;
				el.querySelectorAll('.DAF-on-footer').forEach(el => {
					el.classList.remove('DAF-core'); // Just in case...
					footer.insertBefore(el, first);
				});
			}
		}
		return this.setStyle();
	},
	setText(text) {
		if (this.mode === Dialog.WAIT && !this.visible)
			return this.show({
				text: text
			});
		return this.setHtml(Html.br(text));
	},
	setStyle(style) {
		if (style === null || style === undefined) style = this.lastStyle;
		style = this.lastStyle = (style instanceof Array ? style.join() : String(style)).toLowerCase().split(/,|\s/);
		for (const tag of [Dialog.CRITICAL, Dialog.WIDEST, Dialog.CLOSE]) this.getElement().classList.toggle('DAF-md-' + tag, style.includes(tag));
		const dialog = this;
		dialog.inputs = {};
		for (const input of this.element.querySelectorAll('[data-method]')) {
			const isCore = input.classList.contains('DAF-core');
			const method = input.getAttribute('data-method').toLowerCase();
			dialog.inputs[method] = input;
			input.removeAttribute('timer');
			input.style.display = !isCore || style.includes(method) ? '' : 'none';
			if (!input.getAttribute('hasListener')) {
				input.setAttribute('hasListener', '1');
				const eventName = input.tagName == 'BUTTON' || input.getAttribute('type') == 'button' ? 'click' : 'input';
				input.addEventListener(eventName, function (event) {
					event.stopPropagation();
					event.preventDefault();
					if (method == Dialog.HIDE) {
						dialog.element.classList.toggle('DAF-md-hidden');
						return;
					}
					dialog.runCallback(method, input, input.tagName !== 'BUTTON');
				});
			}
		}
		return this;
	},
	getParams(method) {
		const params = {};
		if (method) params.method = method;

		function add(name, value) {
			if (name in params) {
				const prev = params[name];
				if (Array.isArray(prev)) prev.push(value);
				else params[name] = [prev, value];
			} else params[name] = value;
		}
		Array.from(this.form.elements).forEach(e => {
			// DOMPurify does not allow some names, so we have to use a custom attribute
			const name = e.getAttribute('data-name') || e.name;
			let value = e.value;
			const type = e.tagName == 'INPUT' ? e.type.toUpperCase() : e.tagName;
			switch (type) {
				case 'TEXT':
				case 'TEXTAREA':
				case 'NUMBER':
				case 'DATE':
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