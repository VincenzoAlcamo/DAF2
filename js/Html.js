/*global DOMPurify*/
// eslint-disable-next-line no-unused-vars
const Html = (function () {
	function HtmlRaw(text) {
		if (this instanceof HtmlRaw) this.text = (text === null || text === undefined) ? '' : String(text);
		else return new HtmlRaw(text);
	}
	HtmlRaw.prototype.toString = function () { return this.text; };

	const htmlEntities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;', '\n': '<br>' };
	const replacer = (c) => htmlEntities[c];

	function getTemplateFunction(re) {
		const encode = (v) => (v === null || v === undefined) ? '' : (v instanceof HtmlRaw) ? v.text : (typeof v == 'string' ? v : String(v)).replace(re, replacer);
		return function (strings, ...values) {
			const len = values.length;
			// Was called as template function or as plain function
			return new HtmlRaw(Array.isArray(strings) && 'raw' in strings ? strings.map((s, i) => i >= len ? s : s + encode(values[i])).join('') : encode(strings));
		};
	}

	const Html = getTemplateFunction(/[&<>'"]/g);
	Html.encode = Html;
	Html.raw = HtmlRaw;
	Html.br = getTemplateFunction(/[&<>'"\n]/g);

	// const parser = new DOMParser();
	// const parse = (html) => document.importNode(parser.parseFromString(html, 'text/html').body, true);
	DOMPurify.addHook('afterSanitizeAttributes', function (node) {
		// set all elements owning target and having the attribute `data-target`=_blank
		if ('target' in node && node.getAttribute('data-target') === '_blank') {
			node.removeAttribute('data-target');
			node.setAttribute('target', '_blank');
			node.setAttribute('rel', 'noopener noreferrer');
		}
	});
	const parse = (html) => DOMPurify.sanitize(html, { RETURN_DOM: true, RETURN_DOM_IMPORT: true });
	Html.get = (html) => {
		if (!html) return [];
		html = String(html);
		let container;
		if (html.substr(0, 3) === '<tr') container = parse(`<table>${html}</table>`).querySelector('tbody');
		else container = parse(html);
		return Array.from(container.childNodes);
	};
	Html.set = (parent, html) => {
		Array.from(parent.childNodes).forEach(c => c.remove());
		Html.get(html).forEach(c => parent.appendChild(c));
	};

	Html.addStylesheet = function (href, onLoad) {
		const link = document.createElement('link');
		link.type = 'text/css';
		link.rel = 'stylesheet';
		link.href = href;
		if (onLoad) link.addEventListener('load', onLoad);
		return document.head.appendChild(link);
	};

	return Html;
})();