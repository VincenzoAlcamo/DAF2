/*global chrome Html Dialog CF*/

const options = {
	linkGrabEnabled: true,
	linkGrabButton: 2,
	linkGrabKey: 0,
	linkGrabBadge: true,
	linkGrabHotKey: 'G',
	shorten: 'a',
	language: 'en'
};

const LEFT_BUTTON = 0;
const KEY_ESC = '\x1b';
const KEY_A = 'A';
const KEY_C = 'C';
const KEY_F = 'F';
const KEY_I = 'I';
const KEY_P = 'P';
const KEY_R = 'R';
const KEY_S = 'S';
const KEY_T = 'T';
const KEY_L = 'L';
const OS_WIN = 1;
const OS_LINUX = 0;

const os = ((navigator.appVersion.indexOf('Win') == -1) ? OS_LINUX : OS_WIN);

let box = null;
let flagBox = false;
let flagActive = false;
let stopMenu = false;
let keyPressed = 0;
let mouseButton = -1;
let countLabel = null;
let scrollHandle = 0;
let autoSend = false;
let autoSendHandler = null;
let autoSendLinks = {};
let showId = true;
let links = [];
let linkCount, oldLabel, mouseX, mouseY, startX, startY, autoOpenElement, autoOpenCount, flagLinks;
let badge, lastMouseMove;
const sent = {};

const getMessage = Dialog.getMessage;

function addListeners(obj, ...args) {
	args.forEach(fn => obj.addEventListener(fn.name, fn, true));
}

function addPassiveListeners(obj, ...args) {
	args.forEach(fn => obj.addEventListener(fn.name, fn, { passive: true, capture: true }));
}

function removeListeners(obj, ...args) {
	args.forEach(fn => obj.removeEventListener(fn.name, fn, true));
}

function setShowId() {
	document.body.classList.toggle('DAF-show-id', showId);
}

// eslint-disable-next-line no-unused-vars
function initialize() {
	CF.language = Dialog.language;
	if (CF.process(CF.MBASIC)) return;
	badge = Html.get('<div class="DAF-lg-badge"></div>')[0];
	document.body.appendChild(badge);
	window.addEventListener('mousemove', (event) => { lastMouseMove = event; });
	setLanguage();
	Html.addStylesheet(chrome.runtime.getURL('inject/linkgrabber.css'));
	setShowId();
	addListeners(window, mousedown, keydown, keyup, blur, contextmenu);
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
	const key = +options.linkGrabKey;
	if (key) {
		let s = String.fromCharCode(key);
		if (key == 16) s = getMessage('options_modifier_shift');
		if (key == 17) s = getMessage('options_modifier_ctrl');
		if (key == 18) s = getMessage('options_modifier_alt');
		htm += Html`${s} + `;
	}
	htm += Html`${gm0('options_linkgrabbutton')} (${getMessage(['options_button_left', 'options_button_middle', 'options_button_right'][options.linkGrabButton])})`;
	htm += Html`<br>${getMessage('options_modifier_alt')} + ${options.linkGrabHotKey}`;
	htm += Html`</div>`;
	Html.set(badge, htm);
	badge.style.display = options.linkGrabBadge ? '' : 'none';
}

function allowSelection() {
	return options.linkGrabEnabled && mouseButton == options.linkGrabButton && keyPressed == options.linkGrabKey;
}

function setPosition(el, x, y, width, height) {
	el.style.left = x + 'px';
	el.style.top = y + 'px';
	if (width !== undefined) {
		el.style.width = width + 'px';
		el.style.height = height + 'px';
	}
}

function mousedown(event) {
	const key = keyPressed;
	// stop will reset keyPressed
	stop();
	keyPressed = key;

	mouseButton = event.button;

	// turn on menu for windows
	if (os === OS_WIN) stopMenu = false;

	if (!allowSelection()) return;

	// don't prevent for windows right click as it breaks spell checker
	// do prevent for left as otherwise the page becomes highlighted
	if (os == OS_LINUX || (os == OS_WIN && mouseButton == LEFT_BUTTON)) preventEscalation(event);

	// update position
	startX = event.pageX, startY = event.pageY;
	mouseX = event.clientX, mouseY = event.clientY;

	activate();
}

function activate() {
	flagActive = true;

	// create the box
	if (box == null) {
		box = Html.get(`<span class="DAF-selector" style="visibility:hidden"></span>`)[0];
		document.body.appendChild(box);
		countLabel = Html.get(`<span class="DAF-counter" style="visibility:hidden"></span>`)[0];
		document.body.appendChild(countLabel);
	}

	updateBox();

	// setup mouse move and mouse up
	addListeners(window, mousemove, mouseup, mouseout);
	addPassiveListeners(window, mousewheel);
}


function mousemove(event) {
	preventEscalation(event);
	if (flagBox || allowSelection()) {
		if (startX === undefined) { startX = event.pageX, startY = event.pageY; flagBox = flagLinks = true; }
		mouseX = event.clientX, mouseY = event.clientY;

		// let el = document.elementsFromPoint(mouseX, mouseY).find(el => el !== box && el !== countLabel);
		// if (el && el.getAttribute('role') == 'button' && el.firstElementChild == null && el.innerText.indexOf('...') >= 0) {
		//     // More... button in new layout
		// } else if (!el || !el.className.match(/\b(UFIPagerLink|fss|see_more_link_inner|UFIReplySocialSentenceLinkText)\b/)) el = null;
		const el = document.elementsFromPoint(mouseX, mouseY).find(el => {
			if (el === box || el === countLabel) return false;
			if (el.getAttribute('role') == 'button' && el.firstElementChild == null) {
				if (el.innerText.indexOf('...') >= 0) return true;
				let prev = el.previousSibling;
				let max = 3;
				while (prev && prev.nodeType == Node.TEXT_NODE && max-- > 0) {
					if (prev.textContent.indexOf('\u2026') >= 0) return true;
					prev = prev.previousSibling;
				}
			}
			return String(el.className).match(/\b(UFIPagerLink|fss|see_more_link_inner|UFIReplySocialSentenceLinkText)\b/);
		});
		if (autoOpenElement !== el) {
			if (autoOpenElement && autoOpenCount <= 0) {
				flagLinks = true;
				linkCount = 0;
			}
			autoOpenCount = 5;
		}
		autoOpenElement = el;

		updateBox();
		detect();
	}
}

function updateBox() {
	if (startX === undefined) return;
	let x = mouseX + window.scrollX;
	let y = mouseY + window.scrollY;
	const width = Math.max(document.documentElement['clientWidth'], document.body['scrollWidth'], document.documentElement['scrollWidth'], document.body['offsetWidth'], document.documentElement['offsetWidth']);
	const height = Math.max(document.documentElement['clientHeight'], document.body['scrollHeight'], document.documentElement['scrollHeight'], document.body['offsetHeight'], document.documentElement['offsetHeight']);
	x = Math.min(x, width - 7);
	y = Math.min(y, height - 7);

	box.x1 = Math.min(startX, x);
	box.x2 = Math.max(startX, x);
	box.y1 = Math.min(startY, y);
	box.y2 = Math.max(startY, y);
	setPosition(box, box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);

	let cx = x;
	if (y <= startY) cx -= Math.floor(countLabel.offsetWidth / 2);
	else if (x <= startX) cx -= countLabel.offsetWidth;
	setPosition(countLabel, cx, y - countLabel.offsetHeight);
}

function mousewheel(event) {
	if (flagBox || allowSelection()) {
		mouseX = event.clientX, mouseY = event.clientY;
		updateBox();
		detect();
	}
}

function mouseout(event) {
	mousemove(event);
}

function preventEscalation(event) {
	event.stopPropagation();
	event.preventDefault();
}

function mouseup(event) {
	preventEscalation(event);
	if (!flagBox) stop();
}

function start() {
	flagLinks = false;

	// stop user from selecting text/elements
	document.body.style.userSelect = 'none';
	// turn on the box
	box.style.visibility = countLabel.style.visibility = 'visible';
	flagBox = true;

	const oldBoxes = {};
	Array.from(document.querySelectorAll('.DAF-box')).forEach(div => oldBoxes[div.textContent] = div);

	links = document.links;
	linkCount = links.length;
	const offsetLeft = window.scrollX;
	const offsetTop = window.scrollY;
	links = Array.from(links).filter(a => {
		if (a.href.indexOf('diggysadventure') < 0) return false;

		const rect = a.getBoundingClientRect();
		if (rect.height > 0) {
			const left = offsetLeft + rect.left;
			const top = offsetTop + rect.top;
			const daf = {
				x1: Math.floor(left),
				y1: Math.floor(top),
				x2: Math.floor(left + rect.width),
				y2: Math.floor(top + rect.height),
				box: a.daf && a.daf.box
			};
			a.daf = daf;
			if (daf.box) {
				delete oldBoxes[daf.box.textContent];
				setPosition(daf.box, daf.x1, daf.y1 - 1, daf.x2 - daf.x1 + 2, daf.y2 - daf.y1 + 2);
			}
			return true;
		}

		return false;
	});

	Object.values(oldBoxes).forEach(div => div.remove());

	// turn off menu for windows so mouse up doesn't trigger context menu
	if (os == OS_WIN) stopMenu = true;
}

function stop() {
	if (detectHandler) { clearTimeout(detectHandler); detectHandler = 0; }
	if (flagActive) removeListeners(window, mousemove, mouseup, mousewheel, mouseout);
	flagActive = false;

	if (scrollHandle) clearInterval(scrollHandle);
	scrollHandle = 0;

	document.body.style.userSelect = '';
	if (flagBox) box.style.visibility = countLabel.style.visibility = 'hidden';
	flagBox = false;

	// remove the link boxes
	Array.from(document.links).filter(a => a && a.daf).forEach(a => delete a.daf);
	Array.from(document.querySelectorAll('.DAF-box')).forEach(div => div.remove());
	links = [];

	flagLinks = false;
	mouseButton = -1;
	keyPressed = 0;
}

function scroll() {
	const y = mouseY;
	const win_height = window.innerHeight;

	function scrollPage(speed, direction) {
		const value = (speed < 2 ? 60 : (speed < 10 ? 30 : 10)) * direction;
		window.scrollBy(0, value);
		updateBox();
		detect();
	}
	if (y > win_height - 20) scrollPage(win_height - y, 1);
	else if (window.scrollY > 0 && y < 20) scrollPage(y, -1);
	else if (autoOpenElement && (autoOpenCount--) == 0) {
		try {
			autoOpenElement.click();
			flagLinks = true;
		} catch (e) { }
	}
}

let detectHandler = 0;
function detect() {
	if (!detectHandler) detectHandler = setTimeout(detectDelayed, 200);
}
function detectDelayed() {
	detectHandler = 0;
	if (!flagBox) {
		if (box.x2 - box.x1 < 5 && box.y2 - box.y1 < 5) return;
		flagLinks = true;
	}
	if (flagLinks || linkCount != document.links.length) start();

	if (!scrollHandle) scrollHandle = setInterval(scroll, 100);

	let count = 0, total = 0, toSend = 0;
	const hash = {};
	for (const a of links) {
		const daf = a.daf;
		let selected = false;
		if (daf.y1 <= box.y2 && daf.y2 >= box.y1 && daf.x1 <= box.x2 && daf.x2 >= box.x1) {
			if (!('data' in daf)) {
				let href = a.href;
				if (href.endsWith('/diggysadventure/?hc_location=ufi')) href = a.textContent;
				const result = LinkData.getLinkData(href);
				daf.data = result.length ? result[0] : null;
			}
			if (daf.data) {
				selected = true;
				if (daf.box == null) {
					daf.box = Html.get(`<span class="DAF-box">${daf.data.id}</span>`)[0];
					document.body.appendChild(daf.box);
					setPosition(daf.box, daf.x1, daf.y1 - 1, daf.x2 - daf.x1 + 2, daf.y2 - daf.y1 + 2);
				}
				total++;
				const id = daf.data.id;
				if (autoSend && !(id in sent) && !(id in autoSendLinks)) {
					autoSendLinks[id] = daf.data;
					toSend++;
				}
				if (!(id in hash)) {
					hash[id] = true;
					count++;
				}
			}
		}
		if (daf.selected !== selected) {
			daf.selected = selected;
			if (daf.box) daf.box.style.visibility = daf.selected ? 'visible' : 'hidden';
		}
	}

	let text = getMessage('linkgrabber_selected', count, total);
	if (count > 0) {
		text += `\n${KEY_C}/${KEY_F}/${KEY_P} = ${getMessage('linkgrabber_fn_copy')}`;
		text += `\n${KEY_S} = ${getMessage('linkgrabber_fn_send')}`;
	}
	text += `\n${KEY_A} = ${getMessage('linkgrabber_fn_autosend')} [${getMessage(autoSend ? 'menu_on' : 'menu_off')}]`;
	text += `\n${KEY_I} = ${getMessage('linkgrabber_fn_showid')} [${getMessage(showId ? 'menu_on' : 'menu_off')}]`;
	text += `\n${KEY_R} = ${getMessage('linkgrabber_fn_refresh')}`;
	if (count == 0) {
		text += `\n\n${KEY_T} = ${getMessage('friendship_collectfriends')}`;
		text += `\n${KEY_L} = ${getMessage('friendship_collectfriends')}: ${getMessage('friendship_partial')}`;
	}
	text += `\nESC = ${getMessage('linkgrabber_fn_cancel')}`;
	if (text != oldLabel) countLabel.innerText = oldLabel = text;
	if (toSend) {
		if (autoSendHandler) clearTimeout(autoSendHandler);
		autoSendHandler = setTimeout(sendLinks, 500);
	}
}

function sendLinks() {
	if (autoSendHandler) clearTimeout(autoSendHandler);
	autoSendHandler = null;
	collectData(true).filter(l => !(l.id in sent)).forEach(l => autoSendLinks[l.id] = l);
	const values = Object.values(autoSendLinks);
	autoSendLinks = {};
	if (!values.length) return;
	const showSendResult = (count, total) => Dialog(Dialog.TOAST).show({ text: getMessage('linkgrabber_added', count, total) });
	values.forEach(l => sent[l.id] = true);
	chrome.runtime.sendMessage({ action: 'addRewardLinks', values }, (count) => !chrome.runtime.lastError && showSendResult(count, values.length));
}

const fnHandlers = {
	[KEY_ESC]: () => stop(),
	[KEY_R]: () => { start(); detect(); },
	[KEY_I]: () => { showId = !showId; setShowId(); detect(); },
	[KEY_A]: () => { autoSend = !autoSend; detect(); },
	[KEY_C]: () => copyLinksToClipboard(),
	[KEY_F]: () => copyLinksToClipboard(3),
	[KEY_P]: () => copyLinksToClipboard(2),
	[KEY_T]: () => { stop(); askCollect(); },
	[KEY_L]: () => { stop(); askCollect(true); },
	[KEY_S]: () => sendLinks(false)
};

function keydown(event) {
	if (keyPressed == event.keyCode) return;
	keyPressed = event.keyCode;
	if (os == OS_LINUX && keyPressed == options.linkGrabKey) stopMenu = true;
	if (!flagActive) {
		if (event.code == 'Key' + options.linkGrabHotKey && !event.shiftKey && event.altKey && !event.ctrlKey) {
			preventEscalation(event);
			startX = undefined;
			if (lastMouseMove) {
				startX = lastMouseMove.pageX, startY = lastMouseMove.pageY;
				mouseX = lastMouseMove.clientX, mouseY = lastMouseMove.clientY;
			}
			activate();
			if (startX !== undefined) {
				flagBox = flagLinks = true;
				detectDelayed();
			}
		}
		return;
	}
	const keyChar = String.fromCharCode(keyPressed);
	if (keyChar in fnHandlers) {
		event.keyCode = 0;
		preventEscalation(event);
		fnHandlers[keyChar](event);
	}
}

function blur(_event) {
	remove_key();
}

function keyup(_event) {
	remove_key();
}

function remove_key() {
	// turn menu on for linux
	if (os == OS_LINUX) stopMenu = false;
	keyPressed = 0;
}

function contextmenu(event) {
	if (stopMenu) event.preventDefault();
	stopMenu = false;
}

//#region LINK HELPER FUNCTIONS
const LinkData = (function () {
	const reLink1 = /https?:\/\/l\.facebook\.com\/l.php\?u=([^&\s]+)(&|\s|$)/g;
	const reLink2 = /https?:\/\/diggysadventure\.com\/miner\/wallpost_link.php\S*[?&]url=([^&\s]+)(&\S*|\s|$)/g;
	const reFacebook = /https?:\/\/apps\.facebook\.com\/diggysadventure\/wallpost\.php\?wp_id=(\d+)&fb_type=(standard|portal)&wp_sig=([0-9a-z]+)/g;
	const rePortal = /https?:\/\/portal\.pixelfederation\.com\/(([^/]+\/)?gift|wallpost)\/diggysadventure\?params=(([0-9a-zA-Z\-_]|%2B|%2F)+(%3D){0,2})/g;

	function getLinkData(href) {
		const result = [];
		const hash = {};
		let match, data;

		function getObj(id, typ, sig) {
			if (id in hash) return null;
			hash[id] = true;
			return {
				id: id,
				typ: typ,
				sig: sig
			};
		}
		const urls = [href];
		const push = (v) => urls.push(v, decodeURIComponent(v));
		href.replace(reLink1, (a, b) => {
			const url = decodeURIComponent(b);
			urls.push(url);
			url.replace(reLink2, (a, b, c) => push(decodeURIComponent(b) + c));
		});
		href.replace(reLink2, (a, b, c) => push(decodeURIComponent(b) + c));
		href = urls.join(' ');
		if (href.indexOf('://apps.facebook.com/') > 0) {
			reFacebook.lastIndex = 0;
			while ((match = reFacebook.exec(href))) {
				data = getObj(match[1], match[2], match[3]);
				if (data) result.push(data);
			}
		}
		if (href.indexOf('://portal.pixelfederation.com/') > 0) {
			rePortal.lastIndex = 0;
			while ((match = rePortal.exec(href))) {
				try {
					const params = decodeURIComponent(match[3]).replace(/-/g, '+').replace(/_/g, '/');
					const payload = atob(params);
					const json = JSON.parse(payload);
					if (json.wp_id && json.fb_type && json.wp_sig) {
						data = getObj(json.wp_id, json.fb_type, json.wp_sig);
						if (data) result.push(data);
					}
				} catch (e) { }
			}
		}
		return result;
	}

	function getLink(data, convert = 0) {
		if ((data.typ == 'portal' && convert == 0) || convert == 2) {
			const json = JSON.stringify({
				action: 'wallpost',
				wp_id: data.id,
				fb_type: data.typ,
				wp_sig: data.sig
			});
			return 'https://portal.pixelfederation.com/wallpost/diggysadventure?params=' + encodeURIComponent(btoa(json));
		}
		const url = 'https://apps.facebook.com/diggysadventure/wallpost.php?wp_id=' + encodeURIComponent(data.id) + '&fb_type=' + encodeURIComponent(data.typ) + '&wp_sig=' + encodeURIComponent(data.sig);
		return convert == 1 ? url : 'https://diggysadventure.com/miner/wallpost_link.php?url=' + encodeURIComponent(url);
	}

	const separators = ['.', ')', '-'];
	const prefixes = ['1', '0', 'l', 'u'];
	function optionsToString(options) {
		const obj = options || {}, prefix = +obj.prefix;
		return [
			['k', 'o', '', 'f'][+obj.convert] || '', +obj.sort == 1 ? 'a' : +obj.sort == 2 && 'd', prefix > 0 && prefix <= prefixes.length && prefixes[prefix - 1],
			+obj.newline && 'n', !+obj.addspace && 't', separators.indexOf(obj.separator) >= 0 && obj.separator
		].filter(v => v).join('');
	}

	function stringToOptions(text) {
		text = String(text || '').toLowerCase();
		const has = (c) => text.indexOf(c) >= 0;
		return {
			convert: has('o') ? 1 : (has('f') ? 3 : (has('k') ? 0 : 2)), sort: has('a') ? 1 : (has('d') ? 2 : 0), prefix: prefixes.findIndex(has) + 1,
			separator: separators.find(has) || '', newline: has('n'), addspace: !has('t')
		};
	}

	function format(arr, options) {
		if (typeof options === 'string') options = stringToOptions(options);
		if (options.sort) arr.sort((a, b) => +a.id - +b.id);
		if (options.sort == 2) arr.reverse();
		const suffix = options.newline ? '\n' : '';
		const padLength = options.prefix == 2 ? Math.max(1, Math.floor(Math.log10(arr.length))) + 1 : 1;
		arr = arr.map((item, index) => {
			let prefix = '';
			const text = getLink(item, options.convert);
			if (options.prefix == 3 || options.prefix == 4) {
				let s = '';
				for (; ;) {
					s = String.fromCharCode(65 + index % 26) + s;
					index = Math.floor(index / 26) - 1;
					if (index < 0) break;
				}
				if (options.prefix == 3) s = s.toLowerCase();
				prefix += s;
			} else if (options.prefix) {
				prefix += (index + 1).toString().padStart(padLength, '0');
			}
			if (options.separator) prefix += options.separator;
			if (prefix && (options.addspace || prefix.match(/[a-z]$/i))) prefix += ' ';
			return prefix + text + suffix;
		});
		return arr.join('\n');
	}

	return { getLinkData, getLink, format, optionsToString, stringToOptions };
})();
//#endregion

function collectData(flagGetUserData) {
	const values = [];
	const reCid = /hovercard(\/user)?\.php\?id=(\d+)/;
	let cid, cnm;

	function getActor(actors) {
		cid = cnm = undefined;
		let invalid = false;
		for (const actor of actors) {
			const hovercard = actor.getAttribute('data-hovercard');
			if (!hovercard) continue;
			const match = hovercard.match(reCid);
			if (!match) continue;
			cid = match[2];
			for (let node = actor.firstChild; node; node = node.nextSibling) {
				const text = node.nodeType == Node.TEXT_NODE ? node.textContent.trim() : '';
				if (text != '') {
					if (text.indexOf('://') >= 0) invalid = true;
					else {
						cnm = text;
						invalid = false;
						break;
					}
				}
			}
			if (invalid) {
				cid = undefined;
				actor.classList.add('DAF-invalid');
			}
			if (cnm) break;
		}
	}
	const hash = {};
	for (const a of links) {
		let data = a.daf && a.daf.selected && a.daf.data;
		if (!data) continue;
		const existing = hash[data.id];
		if (existing && (!flagGetUserData || existing.cid)) continue;
		data = existing || data;
		hash[data.id] = data;
		if (!existing) values.push(data);
		if (flagGetUserData) {
			let parent = a.parentNode;
			for (let depth = 12; parent && depth > 0; depth--) {
				getActor(parent.querySelectorAll('[data-hovercard]:not(.DAF-invalid)'));
				if (cid && (!data.cid || data.cid == cid)) {
					data.cid = cid;
					if (cnm) data.cnm = cnm;
				}
				if (data.cnm) break;
				parent = parent.parentNode;
			}
		}
	}
	return values;
}

function copyLinksToClipboard(convert) {
	const values = collectData();
	stop();
	if (values.length) {
		const formatOptions = LinkData.stringToOptions(options.shorten);
		if (convert == 1 || convert == 2 || convert == 2) formatOptions.convert = convert;
		const text = LinkData.format(values, formatOptions) + '\n';
		copyToClipboard(text);
		Dialog(Dialog.TOAST).show({
			text: getMessage('linkgrabber_copied', values.length)
		});
	}
}

function copyToClipboard(str, mimeType = 'text/plain') {
	function oncopy(event) {
		event.clipboardData.setData(mimeType, str);
		event.preventDefault();
	}
	document.addEventListener('copy', oncopy);
	document.execCommand('copy', false, null);
	document.removeEventListener('copy', oncopy);
}

function askCollect(isPartial) {
	CF.language = Dialog.language;
	CF.autoClose = false;
	CF.forcePartial = CF.autoConfirm = CF.keepCollected = isPartial;
	if (isPartial) return CF.process();
	const html = `<p style="text-align:center">${Html.br(getMessage('friendship_confirmwarning'))}</p>`;
	const dialog = Dialog(Dialog.MODAL);
	dialog.show({ title: getMessage('friendship_collectfriends'), html, style: [Dialog.CRITICAL, Dialog.CONFIRM, Dialog.CANCEL] },
		(method) => {
			dialog.remove();
			if (method == Dialog.CONFIRM) CF.process();
		}
	);
}
