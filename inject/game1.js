/*global chrome Html*/
// TOP PAGE
let prefs, handlers, msgHandlers, originalHeight, header, pageType, cdn_root;
let menu, loadCompleted, styleLoaded;
let lastFullWindow = undefined;
let isOk = false;
let msgQueue = [];
let hasCore = false;

function getUnixTime() { return Math.floor(Date.now() / 1000); }
function getFullWindow() { return prefs.fullWindow && loadCompleted; }
function sendPreference(name, value) { if (name in prefs) chrome.storage.local.set({ [name]: value }); }
function setFlag(name, value) { document.documentElement.setAttribute('DAF--' + name.toLowerCase().replace(/@/g, '_'), String(typeof value == 'boolean' ? +value : value ?? '')); }
function forward(action, data) { chrome.runtime.sendMessage(Object.assign({}, data, { action: 'forward', real_action: action })); }
function getSound(name) { return !name || !cdn_root ? null : cdn_root + (name.startsWith('@') ? 'mobile/sounds/all/' + name.substring(1) : 'webgl_client/embedded_assets/sounds/' + name) + '.mp3'; }
function getWrappedText(text, max = 60) {
	return String(text ?? '').split('\n').map(line => {
		let c = 0;
		return line.split(/\s+/).map(t => (c && c + t.length + 1 > max) ? (c = t.length, '\n' + t) : (t = (c ? ' ' : '') + t, c = c + t.length, t)).join('');
	}).join('\n');
}

function getMessage(id, ...args) {
	const $L = prefs.language;
	if (getMessage.$L !== $L) {
		const $M = getMessage.$M = {}, split = (key) => chrome.i18n.getMessage(key).split('|'), m0 = split('en'), m1 = split(getMessage.$L = $L);
		split('keys').forEach((key, index) => $M[key] = m1[index] || m0[index]);
	}
	return (getMessage.$M[id.toLowerCase()] || '').replace(/\^\d/g, t => { const n = +t[1] - 1; return n >= 0 && n < args.length ? args[n] : ''; });
}

let resizeCount = 2, resizeHandler = 0;
function onResize() {
	const fullWindow = getFullWindow();
	const headerHeight = header ? header.getBoundingClientRect().height : 0;
	if (resizeHandler) clearTimeout(resizeHandler);
	resizeHandler = 0;
	let iframe, height;
	if (pageType === 'facebook1') {
		iframe = document.getElementById('iframe_canvas');
		originalHeight = originalHeight || iframe.offsetHeight;
		height = (fullWindow ? (window.innerHeight - (prefs.fullWindowHeader ? headerHeight : 0)) : Math.max(1100, prefs['@bodyHeight'] || originalHeight)) + 'px';
	} else if (pageType === 'portal') {
		iframe = document.getElementsByClassName('game-iframe game-iframe--da')[0];
		height = fullWindow ? (window.innerHeight - (prefs.fullWindowHeader ? headerHeight : 0)) + 'px' : '';
	} else return;
	if (height != iframe.style.height) {
		iframe.style.height = height;
		resizeCount = 2;
	}
	if (resizeCount > 0) {
		resizeCount--;
		resizeHandler = setTimeout(onResize, 5000);
	}
}

function onFullWindow() {
	const fullWindow = getFullWindow();
	document.documentElement.classList.toggle('DAF-fullwindow', fullWindow);
	document.documentElement.classList.toggle('DAF-fullwindowside', prefs.fullWindowSide);
	if (pageType !== 'facebook1' && pageType !== 'portal') return;
	let flagHide = fullWindow;
	const fn = el => el && (el.style.display = flagHide ? 'none' : '');
	Array.from(document.querySelectorAll('#pagelet_dock,#footer')).forEach(fn);
	Array.from(document.querySelectorAll('._fbCanvas__playerTopBarCloseBtn')).forEach(el => fn(el.parentElement));
	flagHide = fullWindow && !prefs.fullWindowHeader;
	fn(header);
	flagHide = fullWindow || prefs.fullWindowSide;
	fn(document.querySelector('#rightCol'));
	document.body.style.overflowY = fullWindow ? 'hidden' : '';
	const s = [fullWindow, prefs.fullWindowHeader, prefs.fullWindowSide].join();
	if (s != lastFullWindow) {
		lastFullWindow = s;
		onResize();
	}
}

function setBadge({ selector, text, title, active }) {
	const badge = menu && menu.querySelector(selector);
	if (!badge) return;
	Html.set(badge, Html(text || ''));
	badge.title = title || '';
	badge.classList.toggle('DAF-badge-on', !!active);
}

function playSound(sound, volume = 100) {
	if (!sound || !volume) return;
	volume = +volume / 100;
	const last = playSound.last = playSound.last || {};
	if (last.sound == sound && (!last.ended || last.ended + 5 > getUnixTime())) return;
	if (last.audio) try { last.audio.pause(); } catch (e) { }
	const audio = last.audio = new Audio(last.sound = sound);
	audio.volume = volume;
	last.ended = 0;
	audio.play().then(_ => 0).finally(_ => {
		if (audio == last.audio) {
			last.audio = null;
			last.ended = getUnixTime();
		}
	});
}

const setBadgeLuckyCards = (function () {
	let badge, nextTime, handler;
	function setText() {
		if (handler) clearTimeout(handler);
		handler = 0;
		if (!nextTime) return;
		const now = getUnixTime();
		let diff = nextTime - now;
		let text = getMessage('repeat_ready');
		if (diff > 0) {
			handler = setTimeout(setText, 1000 - Date.now() % 1000);
			text = String(diff % 60).padStart(2, '0');
			diff = (diff - diff % 60) / 60;
			if (diff) {
				text = String(diff % 60).padStart(2, '0') + ':' + text;
				diff = (diff - diff % 60) / 60;
				if (diff) text = String(diff).padStart(2, '0') + ':' + text;
			}
		}
		Html.set(badge, Html(text));
	}
	return function setBadgeLuckyCards({ active, sound, volume, next }) {
		active = !!active;
		badge = menu.querySelector('.DAF-badge-luckycards');
		const wasActive = badge.classList.contains('DAF-badge-on');
		badge.classList.toggle('DAF-badge-on', active);
		nextTime = active ? next : 0;
		if (active && !wasActive) {
			badge.classList.add('animate');
			playSound(sound, volume);
		}
		setText();
	};
})();

function setBadgeWindmills({ active, sound, volume }) {
	active = !!active;
	const badge = menu.querySelector('.DAF-badge-windmills');
	const wasActive = badge.classList.contains('DAF-badge-on');
	badge.classList.toggle('DAF-badge-on', active);
	if (active && !wasActive) {
		badge.classList.add('animate');
		playSound(sound, volume);
	}
}

function setBadgeProductions({ caravan, kitchen, foundry, sound, volume }) {
	function setProduction(selector, data, flagActive) {
		const badge = menu.querySelector(selector);
		const wasActive = badge.classList.contains('DAF-badge-on');
		const prevNum = +badge.textContent || 0;
		const currNum = +data.num;
		const isActive = currNum > 0;
		Html.set(badge, Html(currNum));
		badge.classList.toggle('DAF-badge-on', isActive);
		const flag = prefs.badgeProductions && flagActive && isActive && (!wasActive || prevNum < currNum);
		if (flag) badge.classList.add('animate');
		return flag;
	}
	let flag = false;
	flag |= setProduction('.DAF-badge-p-c', caravan, prefs.badgeCaravan);
	flag |= setProduction('.DAF-badge-p-k', kitchen, prefs.badgeKitchen);
	flag |= setProduction('.DAF-badge-p-f', foundry, prefs.badgeFoundry);
	if (flag && prefs.badgeProductionsSound) playSound(sound, volume);
}

function setBadgeRepeatables({ list, sound, volume }) {
	const ADD = 1000;
	const badge = menu.querySelector('.DAF-badge-rep');
	list = Array.isArray(list) ? list : [];
	list.forEach((item, index) => item.index = index);
	badge.querySelectorAll('[data-lid]').forEach((div, index) => {
		const lid = +div.getAttribute('data-lid');
		const item = list.find(item => +item.lid == lid);
		if (item) item.index = ADD + index;
	});
	badge.classList.toggle('DAF-badge-on', list.length > 0);
	const MAXVISIBLE = 8;
	const numVisible = list.length > 3 ? 1 : list.length;
	list.sort((a, b) => a.index - b.index);
	const counter = (className, num, addTitle) => {
		const rest = list.slice(num);
		const flag = rest.length > 0;
		const title = flag && addTitle ? rest.map(data => `${data.name} (${data.rname})`).join('\n') : '';
		return `<span class="${className}" style="${flag ? '' : 'display:none'}" title="${Html(title)}">${flag ? '+' + rest.length : ''}</span>`;
	};
	const html = `<b>` + list.map((item, index) => {
		const title = `${item.name}\n${getMessage(item.rid ? 'gui_region' : 'gui_event')}: ${item.rname}`;
		const style = `background-image:url(${item.image})${index >= MAXVISIBLE ? ';display:none' : ''}`;
		const className = `${item.isNew ? 'new' : ''} ${index >= numVisible ? 'on-hover' : ''}`;
		return `<div data-lid="${item.lid}" class="${className}" title="${Html(title)}" style="${style}"></div>`;
	}).join('') + counter('no-hover', numVisible) + counter('on-hover', MAXVISIBLE, true) + `</b>`;
	Html.set(badge, html);
	const isNew = list.find(item => item.index < ADD);
	if (isNew) {
		if (prefs.badgeRepeatables) playSound(sound, volume);
		badge.classList.add('animate');
	}
}

function updateAdsInfo(data) {
	const li = menu.querySelector('[data-action="ads"]');
	const flag = data?.items?.length;
	li.style.display = flag ? '' : 'none';
	if (flag) {
		Html.set(li.querySelector('tbody'), data.items.map(item => Html`<tr><td>${item.text}</td><td>${item.limit}</td><td>${item.date}</td></tr>`).join(''));
		Html.set(li.querySelector('.total'), data.total);
	}
}

function updateGCStatus(data) {
	if (!menu) return;
	const el = menu.querySelector('[data-value=status]');
	Html.set(el, Html(data.count ? getMessage('godchild_stat', data.count, data.max) : getMessage('menu_gccollected')));
	el.title = data.nexttxt || '';
	el.style.display = '';
	setBadge({ selector: '.DAF-badge-gc-counter', text: data.count, title: data.nexttxt, active: data.count > 0 });
}

let searchHandler, searchInput;
function search() {
	if (searchHandler) clearTimeout(searchHandler);
	searchHandler = setTimeout(() => {
		const container = menu.querySelector('.DAF-search-results');
		container.style.display = 'none';
		Html.set(container, '');
		const text = searchInput.value.trim();
		if (text) chrome.runtime.sendMessage({ action: 'searchNeighbor', text }, ({ count, list }) => {
			if (chrome.runtime.lastError) return;
			const gm = (id) => Html(getMessage(id));
			let html = `<table class="DAF-table">`;
			if (list.length) {
				html += `
<thead><tr><td colspan="2">${gm('gui_neighbour')}</td>
<td class="DAF-visit"></td>
<td class="DAF-search-region" title="${gm('gui_region')}"></td>
<td class="DAF-search-level" title="${gm('gui_level')}"></td></tr></thead>
<tbody>`;
				list.forEach(pal => {
					html += `<tr data-id="${pal.id}">`;
					html += `<td><img src="${pal.pic || `https://graph.facebook.com/v2.8/${pal.fb_id}/picture`}"></td>`;
					html += `<td>`;
					if (!pal.furl || pal.fn != pal.name) {
						html += `${Html(pal.name)}`;
						if (pal.fn) {
							html += `<br>`;
							if (!pal.furl) html += `<i>${Html(pal.fn)}</i>`;
						}
					}
					if (pal.furl && pal.fn) {
						html += `<a data-target="_blank" href="${Html(pal.furl)}">${Html(pal.fn)}</a>`;
					}
					html += `</td>`;
					html += `<td class="DAF-visit"><a data-action="visit" title="${gm('gui_visitcamp')}"></a></td>`;
					html += `<td><img height="32" data-src="${Html(pal.rimage)}" title="${Html(pal.rname)}"></td>`;
					html += `<td>${Html(pal.level)}</td>`;
					html += `</tr>`;
				});
				html += `</tbody>`;
				if (count - list.length > 0) html += `<tfoot><tr><th colspan="5">${gm('gui_toomanyresults')} (${count})</th></tr></tfoot>`;
			} else {
				html += `<tfoot><tr><th>${Html(getMessage('gui_noresults'))}</th></tr></tfoot>`;
			}
			html += `</table>`;
			Html.set(container, html);
			container.querySelectorAll('img[data-src]').forEach(img => {
				const src = img.getAttribute('data-src');
				img.src = src[0] == '/' ? chrome.runtime.getURL(src) : src;
			});
			container.style.display = 'block';
		});
	}, 500);
}

function createMenu() {
	Html.addStylesheet(chrome.runtime.getURL('inject/game_menu.css'), () => { styleLoaded = true; showMenu(); });
	const gm = (id) => Html.br(getMessage(id));
	const gm0 = (id) => Html(getMessage(id).split('\n')[0]);
	const getMessage1 = (id) => {
		const t = getMessage(id), i = t.indexOf('\n');
		return t.substr(i + 1);
	};
	const gmSound = Html(getMessage1('options_badgesound'));
	let html = `
<ul class="DAF-menu">
<li data-action="about"><b>&nbsp;</b>
	<div><span>${gm('ext_name')}</span><br><span>${gm('ext_title')}</span></div>
</li>
<li data-action="search"><b>&nbsp;</b>
	<div><span>${gm('gui_search')}</span><input type="text">
	<div class="DAF-search-results"></div>
	</div>
</li>
<li data-action="fullWindow"><b data-pref="fullWindow">&nbsp;</b>
	<div>
		<i data-pref="fullWindow">${gm('menu_fullwindow')}</i>
		<i data-pref="fullWindowLock">${gm('menu_fullwindowlock')}</i>
		<br>
		<i data-pref="fullWindowHeader">${gm('menu_fullwindowheader')}</i>
		<i data-pref="fullWindowSide">${gm('menu_fullwindowside')}</i>
		<i style="display:none" data-pref="resetFullWindow">${gm('menu_resetfullwindow')}</i>
	</div>
</li>
<li data-action="gc"><b>&nbsp;</b>
	<div>
		<span data-value="status" style="display:none"></span>
		<br>
		<i data-pref="gcTable">${gm('menu_gctable')}</i>
		<i data-pref="gcTableCounter">${gm('menu_gctablecounter')}</i>
		<i data-pref="gcTableRegion">${gm('menu_gctableregion')}</i>
		<br>
		<i data-pref="autoGC">${gm0('options_autogc')}</i>
		<br>
		<i data-pref="noGCPopup">${gm0('options_nogcpopup')}</i>
	</div>
</li>
<li data-action="badges"><b>&nbsp;</b>
	<div>
		<span>${gm('options_section_badges')}</span>
		<u>
		<i data-pref="badgeServerEnergy" style="display:none">${gm0('options_badgeserverenergy')}</i>
		<i data-pref="badgeGcCounter">${gm0('options_badgegccounter')}</i>
		<i data-pref="badgeGcEnergy">${gm0('options_badgegcenergy')}</i>
		</u>
		<u class="squared">
		<i data-pref="badgeProductions">${gm0('options_badgeproductions')}</i>
		<i data-pref="badgeCaravan" title="" class="hue2">${gm0('tab_caravan')}</i>
		<i data-pref="badgeKitchen" title="" class="hue2">${gm0('tab_kitchen')}</i>
		<i data-pref="badgeFoundry" title="" class="hue2">${gm0('tab_foundry')}</i>
		<i data-pref="badgeProductionsSound" class="hue" title="${gmSound}">${gm0('options_badgesound')}</i>
		</u>
		<u class="squared">
		<i data-pref="badgeRepeatables">${gm0('options_badgerepeatables')}</i>
		<i data-pref="badgeRepeatablesSound" class="hue" title="${gmSound}">${gm0('options_badgesound')}</i>
		</u>
		<u class="squared">
		<i data-pref="badgeLuckyCards">${gm0('options_badgeluckycards')}</i>
		<i data-pref="badgeLuckyCardsSound" class="hue" title="${gmSound}">${gm0('options_badgesound')}</i>
		</u>
		<u class="squared">
		<i data-pref="badgeWindmills">${gm0('options_badgewindmills')}</i>
		<i data-pref="badgeWindmillsSound" class="hue" title="${gmSound}">${gm0('options_badgesound')}</i>
		</u>
	</div>
</li>
<li data-action="ads" style="display:none"><b>&nbsp;</b>
	<div>
		<span>${gm('camp_ads_limit')}</span><br>
		<p class="DAF-ads_limit_warning">${gm('camp_ads_limit_info')}<br>${gm('camp_ads_limit_info2')}</p>
		<table class="DAF-table">
			<thead><tr><td>${gm('gui_type')}</td><td>${gm('gui_limit')}</td><td>${gm('gui_date')}</td></tr></thead>
			<tbody></tbody>
			<tfoot><tr><td>${gm('camp_total')}</td><td class="total"></td><td></td></tr></tfoot>
		</table>
	</div>
</li>
<li data-action="options" style="display:none"><b>&nbsp;</b>
	<div>
		<span>${gm0('options_hmain')}</span>
		<u><i data-pref="hFlashAdSound">Flash Ad Sound</i>
		<i data-pref="hReward">${gm0('options_hreward')}</i></u>
		<u><i data-pref="hGCCluster">${gm0('options_hgccluster')}</i>
		<i data-pref="hScroll">${gm0('options_hscroll')}</i></u>
		<u class="squared">
		<i data-pref="hLootCount">${gm0('options_hlootcount')}</i>
		<i data-pref="hLootZoom">${gm0('options_hlootzoom')}</i>
		<i data-pref="hLootFast">${gm0('options_hlootfast')}</i>
		</u>
		<u class="squared">
		<i data-pref="hFood" class="squared-right">${gm0('options_hfood')}</i>
		<select data-pref="hFoodNum">
			<option value="avg">${gm('gui_average')}</option>
			<option value="min">${gm('gui_minimum')}</option>
			<option value="0">1 = ${gm('gui_maximum')}</option>
			${[...Array(19).keys()].map(i => `<option value="${i + 1}">${i + 2}</option>`).join('')}
		</select>
		</u>
		<u><i data-pref="hSpeed">${gm0('options_hspeed')}</i>
		<i data-pref="hQueue">${gm0('options_hqueue')}</i></u>
	</div>
</li>
<li data-action="reloadGame"><b>&nbsp;</b>
	<div>
		<span>${gm('menu_reloadgame')}</span>
		<br>
		<i data-value="switch">${gm(pageType == 'portal' ? 'menu_switchfacebook' : 'menu_switchportal')}</i>
	</div>
</li>
</ul>
<div class="DAF-badges">
	<b data-close class="DAF-badge-energy DAF-badge-img"></b>
	<b class="DAF-badge-gc-counter DAF-badge-img"></b>
	<b class="DAF-badge-gc-energy DAF-badge-img"></b>
	<b data-animate class="DAF-badge-windmills DAF-badge-img" title="${gm('camp_needs_windmills')}"></b>
	<b data-animate class="DAF-badge-p-c DAF-badge-img" title="${gm('tab_caravan')}">0</b>
	<b data-animate class="DAF-badge-p-k DAF-badge-img" title="${gm('tab_kitchen')}">0</b>
	<b data-animate class="DAF-badge-p-f DAF-badge-img" title="${gm('tab_foundry')}">0</b>
	<b data-animate class="DAF-badge-luckycards DAF-badge-img" title="${gm0('options_badgeluckycards')}"></b>
	<div data-animate class="DAF-badge-rep"></div>
</div>
`;
	// remove spaces
	html = html.replace(/>\s+/g, '>');
	menu = Html.get(`<div class="DAF-menu-container" style="display:none">${html}</div>`)[0];
	document.body.appendChild(menu);
	for (const el of Array.from(menu.querySelectorAll('[data-pref]'))) {
		const prefName = el.getAttribute('data-pref');
		if (!el.hasAttribute('title')) el.title = getMessage1('options_' + prefName.toLowerCase());
	}
	menu.querySelectorAll('[title]').forEach(el => el.title = getWrappedText(el.title));
	searchInput = menu.querySelector('[data-action="search"] input');
	searchInput.addEventListener('input', search);
	searchInput.addEventListener('keydown', event => {
		if (event.which == 27) document.activeElement.blur();
	});
	menu.addEventListener('click', onMenuClick);
	menu.querySelectorAll('select[data-pref]').forEach(el => {
		el.addEventListener('change', onMenuClick);
		el.addEventListener('click', (event) => {
			event.stopPropagation();
			event.preventDefault();
		});
	});
	menu.querySelectorAll('.DAF-badges [data-animate]').forEach(badge => {
		badge.addEventListener('mouseenter', () => badge.classList.remove('animate'));
	});
	menu.querySelectorAll('.DAF-badges [data-close]').forEach(badge => {
		badge.addEventListener('click', () => badge.classList.remove('DAF-badge-on'));
	});
}

function showMenu() {
	if (loadCompleted && styleLoaded) menu.style.display = '';
}

function updateMenu(prefName) {
	if (!menu) return;
	Array.from(menu.querySelectorAll('[data-pref' + (prefName ? '="' + prefName + '"' : '') + ']')).forEach(el => {
		const prefName = el.getAttribute('data-pref');
		if (el.tagName === 'SELECT') { el.value = prefs[prefName]; return; }
		const prefValue = el.getAttribute('data-pref-value');
		const isOn = prefValue ? prefValue == prefs[prefName] : !!prefs[prefName];
		el.classList.toggle('DAF-on', isOn);
	});
	const divBadges = menu.querySelector('.DAF-badges');
	const names = prefName ? [prefName] : Object.keys(prefs);
	names.filter(prefName => prefName.startsWith('badge')).forEach(prefName => divBadges.classList.toggle('DAF-' + prefName.toLowerCase(), !!prefs[prefName]));
}

function onMenuClick(e) {
	const target = e.target;
	if (!target || target.tagName == 'DIV') return;
	let action = null;
	let parent = target;
	while (parent && parent !== menu && !(action = parent.getAttribute('data-action')))
		parent = parent.parentNode;
	switch (action) {
		case 'about':
			chrome.runtime.sendMessage({ action: 'showGUI' });
			break;
		case 'fullWindow':
		case 'gc': {
			const name = target.getAttribute('data-pref') || action;
			sendPreference(name, !prefs[name]);
			break;
		}
		case 'options':
		case 'badges': {
			const name = target.getAttribute('data-pref');
			if (name) {
				let value;
				if (target.tagName === 'SELECT') value = target.value;
				else {
					const s = target.getAttribute('data-pref-value');
					value = s === null ? !prefs[name] : (isFinite(+s) ? +s : s);
				}
				sendPreference(name, value);
			}
			break;
		}
		case 'reloadGame': {
			let value = target.getAttribute('data-value');
			const portal = (pageType == 'portal') ^ (value === 'switch');
			value += ' ' + (portal ? 'portal' : 'facebook');
			chrome.runtime.sendMessage({ action: 'reloadGame', value: value });
			break;
		}
		case 'visit':
			setFlag('@screen', 'visiting');
			forward('visit', { id: parent.parentNode.parentNode.getAttribute('data-id') });
			break;
	}
}

function docReady(fn) {
	if (document.readyState === "complete" || document.readyState === "interactive") setTimeout(fn, 1);
	else document.addEventListener('DOMContentLoaded', fn);
}

function onMessageQueue(request, sender) {
	if (request && request.action) msgQueue.push(request);
}

function onMessage(request, sender) {
	const action = request && request.action;
	if (!action) return;
	if (!isOk && (action == 'generator' || action == 'enter_mine' || action == 'visit_camp')) {
		isOk = true;
		menu.classList.add('ok');
	}
	try {
		if (action in msgHandlers) msgHandlers[action](request);
	} catch (e) {
		console.error('onMessage', e, request, sender);
	}
}

function init() {
	handlers = {};
	msgHandlers = {};
	prefs = {};
	let site;
	if (location.host.startsWith('portal.')) site = 'Portal';
	else if (location.host.startsWith('apps.facebook.')) site = 'Facebook';
	else return;
	chrome.runtime.onMessage.addListener(onMessageQueue);
	chrome.runtime.sendMessage({ action: 'gameStarted', site });
	docReady(initDOM);
}

function setKeepElements() {
	document.querySelectorAll('div[role=banner] ~ div').forEach(div => {
		if (div.querySelector('iframe,[role="dialog"]')) div.setAttribute('DAF-keep', '1');
	});
}

let pageTypeSent = false;
function detectPageType() {
	pageType = 'unknown';
	if (document.getElementById('pagelet_bluebar')) {
		pageType = 'facebook1';
		header = document.getElementById('pagelet_bluebar');
	} else if (document.querySelector('div[role=banner]')) {
		const iframe = document.querySelector('#iframe_canvas iframe');
		if (iframe) {
			iframe.style.display = 'block';
			pageType = 'facebook2';
			setKeepElements();
		}
	} else if (document.getElementById('skrollr-body')) {
		pageType = 'portal';
		header = document.getElementById('header');
	}
	['unknown', 'facebook1', 'facebook2', 'portal'].forEach(t => document.documentElement.classList.toggle('DAF-' + t, t === pageType));
}
function sendPageType() {
	pageTypeSent = true;
	forward('game1', { pageType, ok: pageType != 'unknown' });
}

function initDOM() {
	chrome.runtime.onMessage.removeListener(onMessageQueue);
	const _msgQueue = msgQueue;
	msgQueue = null;
	detectPageType();

	const addPrefs = names => names.split(',').forEach(name => prefs[name] = undefined);
	addPrefs('language,resetFullWindow,fullWindow,fullWindowHeader,fullWindowSide,fullWindowLock,fullWindowTimeout');
	addPrefs('autoClick,autoGC,noGCPopup,gcTable,gcTableCounter,gcTableRegion,@bodyHeight');
	addPrefs('badgeServerEnergy,badgeGcCounter,badgeGcEnergy,badgeProductions,badgeProductionsSound,badgeCaravan,badgeKitchen,badgeFoundry');
	addPrefs('badgeRepeatables,badgeRepeatablesSound,badgeLuckyCards,badgeLuckyCardsSound,badgeWindmills,badgeWindmillsSound');
	addPrefs('@extra,@screen,hSpeed,hLootCount,hLootZoom,hLootFast,hFood,hFoodNum,hQueue,hScroll,hReward,hGCCluster');
	addPrefs('hFlashAdSound,hFlashAdSoundName,hFlashAdVolume');

	const prefFlags = new Set(['@screen']);
	function setPref(name, value) {
		if (!(name in prefs)) return;
		prefs[name] = value;
		if (prefFlags.has(name)) setFlag(name, value);
		if (name in handlers) handlers[name](value);
		updateMenu(name);
	}

	chrome.runtime.sendMessage({ action: 'getPrefs', keys: Object.keys(prefs) }, function (response) {
		if (chrome.runtime.lastError) {
			console.error('Error retrieving preferences');
			return;
		}
		Object.keys(response).forEach(name => setPref(name, response[name]));

		chrome.runtime.onMessage.addListener(onMessage);

		// track preference changes
		chrome.storage.onChanged.addListener(function (changes, area) {
			if (area != 'local') return;
			for (const name in changes) setPref(name, changes[name].newValue);
		});

		msgHandlers['sendValue'] = (request) => setPref(request.name, request.value);

		handlers['@extra'] = (value) => {
			const values = (value || '').split(',');
			if (values.includes('@core')) hasCore = true;
			const options = menu.querySelector('[data-action="options"]');
			options.querySelectorAll('[data-pref]').forEach(el => {
				if (values.includes(el.getAttribute('data-pref'))) return;
				const parent = el.parentElement;
				el.remove();
				if (!parent.firstElementChild) parent.remove();
			});
			if(!options.querySelector('[data-pref]')) options.remove();
			else options.style.removeProperty('display');
		}
		handlers['fullWindow'] = onFullWindow;
		handlers['fullWindowHeader'] = onFullWindow;
		handlers['fullWindowSide'] = onFullWindow;
		msgHandlers['cdn_root'] = (request) => {
			const root = request.data?.cdn_root;
			if (root) cdn_root = root;
		};
		msgHandlers['generator'] = () => {
			if (loadCompleted) return;
			delete msgHandlers['generator'];
			loadCompleted = true;
			onFullWindow();
			showMenu();
			chrome.runtime.sendMessage({ action: 'getGCInfo' }, function (result) { updateGCStatus(result); });
			let count = 3, interval = setInterval(function() {
				chrome.runtime.sendMessage({ action: 'getAdsInfo' }, function (result) {
					if (result?.items?.length || --count < 0) clearInterval(interval);
					updateAdsInfo(result);
				});
			}, 10000);
		};
		setTimeout(msgHandlers['generator'], 15000);
		msgHandlers['friend_child_charge'] = (request) => updateGCStatus(request.data);
		msgHandlers['ads_info'] = (request) => updateAdsInfo(request.data);
		msgHandlers['gc-energy'] = (request) => {
			const energy = (request.data && +request.data.energy) || 0;
			setBadge({ selector: '.DAF-badge-gc-energy', text: energy, title: (request.data && request.data.title) || getMessage('gui_energy'), active: energy > 0 });
		};
		msgHandlers['repeatables'] = (request) => setBadgeRepeatables(request.data);
		msgHandlers['luckycards'] = (request) => setBadgeLuckyCards(request.data);
		msgHandlers['windmills'] = (request) => setBadgeWindmills(request.data);
		msgHandlers['productions'] = (request) => setBadgeProductions(request.data);
		msgHandlers['serverEnergy'] = (request) => setBadge({ selector: '.DAF-badge-energy', text: request.data.energy, active: true });
		msgHandlers['game2'] = () => {
			if (pageType === 'unknown') detectPageType();
			sendPageType();
		};
		msgHandlers['wallpost'] = () => {
			if (pageType !== 'facebook2') return;
			let count = 10;
			const handler = setInterval(() => count-- < 0 ? clearInterval(handler) : setKeepElements(), 500);
		};
		msgHandlers['hFlashAd'] = () => prefs.hFlashAdSound && playSound(getSound(prefs.hFlashAdSoundName), prefs.hFlashAdVolume);
		window.addEventListener('resize', onResize);
		onFullWindow();
		createMenu();
		updateMenu();
		_msgQueue.forEach(request => onMessage(request, null, null));
		const updatePageType = () => {
			if (pageType !== 'unknown') return;
			detectPageType();
			if (pageTypeSent && pageType !== 'unknown') sendPageType();
		};
		[10, 25, 40].forEach(t => setTimeout(updatePageType, t * 1000));
	});
}

init();