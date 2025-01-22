/*global chrome Html Dialog CF*/

const options = {
	linkGrabEnabled: true,
	linkGrabBadge: true,
	linkGrabHotKey: 'G',
	language: 'en'
};

let badge, keyPressed;

const getMessage = Dialog.getMessage;

function addListeners(obj, ...args) {
	args.forEach(fn => obj.addEventListener(fn.name, fn, true));
}

function removeListeners(obj, ...args) {
	args.forEach(fn => obj.removeEventListener(fn.name, fn, true));
}

function initialize() {
	CF.language = Dialog.language;
	if (CF.process(CF.MBASIC)) return;
	badge = Html.get('<div class="DAF-lg-badge"></div>')[0];
	document.body.appendChild(badge);
	setLanguage();
	Html.addStylesheet(chrome.runtime.getURL('inject/linkgrabber.css'));
	addListeners(window, keydown, keyup);
	// track preference changes
	chrome.storage.onChanged.addListener(function (changes, area) {
		if (area != 'local') return;
		for (const name in changes) options[name] = changes[name].newValue;
		setLanguage();
	});
}

function setLanguage() {
	const gm0 = (key) => getMessage(key).split('\n')[0];
	Dialog.language = options.language;
	let htm = Html`<div class="title">${gm0('options_linkgrabenabled')}</div><div class="info">`;
	htm += Html`${getMessage('options_modifier_alt')} + ${options.linkGrabHotKey}`;
	htm += Html`</div>`;
	Html.set(badge, htm);
	badge.style.display = options.linkGrabBadge ? '' : 'none';
}

function keydown(event) {
	if (keyPressed == event.keyCode) return;
	keyPressed = event.keyCode;
	if (event.code == 'Key' + options.linkGrabHotKey && !event.shiftKey && event.altKey && !event.ctrlKey) {
		event.stopPropagation();
		event.preventDefault();
		CF.language = Dialog.language;
		CF.autoClose = CF.forcePartial = CF.autoConfirm = CF.keepCollected = false;
		CF.auto = 'partial';
		CF.process();
	}
}

function keyup(_event) {
	keyPressed = 0;
}
