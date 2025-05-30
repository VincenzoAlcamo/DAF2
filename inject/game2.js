// Add intercept code
var script = document.createElement('script');
script.type = 'text/javascript';
script.src = chrome.runtime.getURL('inject/game0.js');
if (!document.documentElement.dataset.daf2Setup) document.documentElement.appendChild(script);

function setupMessaging(src, color, dst) {
	const logPrefix = `%c ${src.toUpperCase()} %c`;
	const logColor = `background-color:${color};color:white`;
	const log = function (...data) {
		if (typeof data[0] === 'string') data[0] = logPrefix + ' ' + data[0];
		else data.unshift(logPrefix);
		data.splice(1, 0, logColor, 'background-color:transparent;color:inherit');
		return console.log.apply(console, data);
	};
	log('started');

	const Prefs = {};
	const handlers = {};
	handlers['@prefs'] = (request) => {
		const values = request.values || {};
		Object.assign(Prefs, values);
		dispatch({ action: 'pref:*', values });
		Object.entries(values).forEach(([key, value]) => dispatch({ action: 'pref:' + key, value }));
	};
	const dispatch = (request, sender) => {
		const action = request?.action;
		try { return action in handlers ? handlers[action](request, sender) : void 0; } catch (e) {}
	};
	const makeRequest = (action, data) => (typeof action === 'string' ? { action, ...data } : action);
	const notSupported = () => { throw 'Not supported'; };
	let [sendPage, send, setPreference] = [notSupported, notSupported, notSupported];
	if (dst) {
		window.addEventListener('message', (event) => event.source === window && event.data?.src === dst && dispatch(event.data.request));
		sendPage = (...args) => window.postMessage({ src, request: makeRequest(...args) }, window.location.href);
	}
	if (src !== 'game0') {
		chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
			const response = dispatch(request, sender);
			if (response instanceof Promise) {
				response.then(sendResponse);
				return true;
			}
			if (response !== undefined) sendResponse(response);
		});
		send = async (...args) => {
			return new Promise((resolve, reject) => {
				chrome.runtime.sendMessage(makeRequest(...args), (response) => {
					if (!chrome.runtime.lastError) resolve(response);
				});
			});
		};
		setPreference = (name, value) => chrome.storage.local.set({ [name]: value });
		chrome.storage.local.get(null, function (values) {
			dispatch({ action: '@prefs', values });
			chrome.storage.onChanged.addListener((changes, area) => {
				if (area != 'local') return;
				const values = {};
				Object.entries(changes).forEach(([key, change]) => (values[key] = change.newValue));
				dispatch({ action: '@prefs', values });
			});
		});
	}

	return { Msg: { dispatch, send, sendPage, handlers }, Prefs, setPreference, log };
}

const { Msg, Prefs, setPreference, log } = setupMessaging('game2', 'purple', 'game0');

// These will be initialized later
let menu, site, miner, cdn_root, gcTable, container, hasGenerator;
let isAutoQueueEnabled, isAccessibilityKeysEnabled;

const getExtensionUrl = (resource) => chrome.runtime.getURL(resource);
const getUnixTime = () => Math.floor(Date.now() / 1000);
function getSound(name) {
	return !name || !cdn_root
		? null
		: cdn_root +
				(name.startsWith('@')
					? 'mobile/sounds/all/' + name.substring(1)
					: 'webgl_client/embedded_assets/sounds/' + name) +
				'.mp3';
}
const toggleAutoDig = (reason) => Msg.sendPage('toggleAutoDig');
const sendKeyCode = (code) => Msg.sendPage('keyCode', { code });

init();

function getMessage(id, ...args) {
	const $L = Prefs.language || 'en';
	if (getMessage.$L !== $L) {
		const $M = (getMessage.$M = {}),
			split = (key) => chrome.i18n.getMessage(key).split('|'),
			m0 = split('en'),
			m1 = split((getMessage.$L = $L));
		split('keys').forEach((key, index) => ($M[key] = m1[index] || m0[index]));
	}
	return (getMessage.$M[id.toLowerCase()] || '').replace(/\^\d/g, (t) => {
		const n = +t[1] - 1;
		return n >= 0 && n < args.length ? args[n] : '';
	});
}

function setScreen(value) {
	container.setAttribute('daf-screen', value);
}

function init() {
	Msg.send('forward', { real_action: 'gameStarted' });

	window.addEventListener('DOMContentLoaded', () => {
		miner = document.getElementById('canvas');
		container = Html.get(`<div class="DAF-container"><div class="DAF-menu-container" style="display:none"></div></div>`)[0];
		miner.parentNode.insertBefore(container, miner);
		container.appendChild(miner);
		container.style.setProperty('--canvas-h', miner.offsetHeight + 'px');
		menu = container.querySelector('.DAF-menu-container');

		Msg.sendPage('@prefs', { values: Prefs });
		Msg.sendPage('enableGame');

		Msg.handlers['daf_xhr'] = (request) => void Msg.send(request);
		Msg.handlers['generator'] = async (request) => {
			const data = request.data || {};
			hasGenerator = true;
			document.documentElement.classList.toggle('DAF-fullwindow', Prefs.fullWindow);
			cdn_root ||= data.cdn_root;
			Msg.dispatch({ action: '@prefs', values: { isSuper: data.isSuper }});
			site = (data.site || 'portal').toLowerCase();
			const el = menu.querySelector('[data-value="switch"');
			if (el) Html.set(el, Html.br(getMessage(site == 'portal' ? 'menu_switchfacebook' : 'menu_switchportal')));
			menu.classList.add(site);
			menu.classList.add('ok');
			let count = 3;
			const interval = setInterval(async () => {
				const result = await Msg.send('getAdsInfo');
				if (result?.items?.length || --count < 0) clearInterval(interval);
				updateAdsInfo(result);
			}, 10000);
			gcTable_updateStatus(await Msg.send('getGCInfo'));
			gcTable_show(true);
			enableEventHandler();
		};

		Msg.sendPage('enableXhr');

		Html.addStylesheet(getExtensionUrl('inject/game_menu.css'), () => (menu.style.display = ''));
		createMenu();
		setupHotKeyHandlers();

		Msg.handlers['screen'] = (request) => void setScreen(request.value);
		Msg.handlers['hFlashAd'] = () => {
			if (Prefs.hFlashAdSound) playSound(getSound(Prefs.hFlashAdSoundName), Prefs.hFlashAdVolume);
		};
		Msg.handlers['hEnergyMax'] = () => {
			if (Prefs.hEnergyMaxSound) playSound(getSound(Prefs.hEnergyMaxSoundName), Prefs.hEnergyMaxVolume);
		};
		Msg.handlers['toggleAutoDig'] = () => void toggleAutoDig('page1');
		Msg.handlers['keyCode'] = (request) => void sendKeyCode(request.code);
		Msg.handlers['autoDig'] = (request) => {
			Prefs.hAutoDig = !!request.flag;
			updateMenu('hAutoDig');
		}

		Msg.handlers['showMailsButton'] = () => void setShowMailsButton(true);

		if (Prefs.hMain) {
			menu.querySelector('.DAF-badge-extra').classList.add('DAF-badge-on');
			Msg.handlers['extra'] = (request) => void setExtra(request.value);
			Msg.sendPage('enableExtra');
		}

		Msg.handlers['pref:*'] = (request) => {
			Msg.sendPage('@prefs', { values: request.values });
			updateMenu();
			gcTable_setOptions();
			document.documentElement.classList.toggle('DAF-fullwindow', hasGenerator && Prefs.fullWindow);
			document.documentElement.classList.toggle('DAF-adsopacity', Prefs.adsOpacity);
			container.classList.toggle('DAF-hidemenu', Prefs.hideMenu);
		};
		Msg.handlers['pref:language'] = () => {
			translateMenu();
			Msg.sendPage('messages', {
				locked: getMessage('gui_locked').toUpperCase(),
				unlock: getMessage('gui_unlock').toUpperCase()
			});
		};

		Msg.handlers['pref:gcTable'] = () => void gcTable_show();
		Html.addStylesheet(chrome.runtime.getURL('inject/game_gctable.css'));
		gcTable_show();

		Msg.handlers['repeatables'] = (request) => void setBadgeRepeatables(request.data);
		Msg.handlers['luckycards'] = (request) => void setBadgeLuckyCards(request.data);
		Msg.handlers['petshop'] = (request) => void setBadgePetShop(request.data);
		Msg.handlers['windmills'] = (request) => void setBadgeWindmills(request.data);
		Msg.handlers['productions'] = (request) => void setBadgeProductions(request.data);
		Msg.handlers['serverEnergy'] = (request) =>
			void setBadge({ selector: '.DAF-badge-energy', text: request.data.energy, active: true });
		Msg.handlers['gc-energy'] = (request) => {
			const energy = (request.data && +request.data.energy) || 0;
			setBadge({
				selector: '.DAF-badge-gc-energy',
				text: energy,
				title: (request.data && request.data.title) || getMessage('gui_energy'),
				active: energy > 0
			});
		};
		Msg.handlers['friend_child_charge'] = (request) => {
			gcTable_updateStatus(request.data);
			gcTable_remove(document.getElementById('DAF-gc_' + request.data.id));
			if (Prefs.autoGC && request.data.skip) {
				const rect = miner.getBoundingClientRect();
				const eventConfig = { clientX: 35, clientY: Math.floor(rect.top + rect.height / 2), buttons: 1 };
				miner.dispatchEvent(new MouseEvent('mousedown', eventConfig));
				setTimeout(() => miner.dispatchEvent(new MouseEvent('mouseup', eventConfig)), 250);
			}
		};

		Msg.handlers['ads_info'] = (request) => void updateAdsInfo(request.data);

		Msg.handlers['*wallpost'] = ()  => void Msg.send('forward', { real_action: 'wallpost' });
	});
}

async function setExtra(extra) {
	log('extra received = "%s"', extra);
	const values = String(extra ?? '').split(',');
	const options = menu.querySelector('[data-action="options"]');
	options.querySelectorAll('[data-pref]').forEach((el) => {
		if (values.includes(el.getAttribute('data-pref'))) return;
		const parent = el.parentElement;
		el.remove();
		if (!parent.firstElementChild) parent.remove();
	});
	const hasExtra = !!options.querySelector('[data-pref]');
	menu.classList.toggle('hasExtra', hasExtra);
	if (!hasExtra) options.remove();
	else {
		menu.querySelector('.DAF-badge-extra')?.remove();
		options.style.removeProperty('display');
	}
	menu.querySelector('.DAF-badges').classList.toggle('DAF-hasQueue', values.includes('hQueue'));
	menu.querySelector('.DAF-badges').classList.toggle('DAF-hasAutoDig', values.includes('hAutoDig'));
	enableEventHandler();
}

function enableEventHandler() {
	isAutoQueueEnabled = hasGenerator && menu.querySelector('[data-pref="hAutoQueue"]');
	isAccessibilityKeysEnabled = hasGenerator && menu.querySelector('[data-pref="hKeys"]');
	if (hasGenerator) Msg.send('forward', { real_action: 'enableEventHandler', isAutoQueueEnabled, isAccessibilityKeysEnabled });
}

function getWrappedText(text, max = 60) {
	return String(text ?? '')
		.split('\n')
		.map((line) => {
			let c = 0;
			return line
				.split(/\s+/)
				.map((t) => {
					if (c && c + t.length + 1 > max) {
						c = t.length;
						return '\n' + t;
					} else {
						t = c ? ' ' + t : t;
						c += t.length;
						return t;
					}
				})
				.join('');
		})
		.join('\n');
}

function createMenu() {
	let html = `
<ul class="DAF-menu">
<li data-action="about"><b>&nbsp;</b>
	<div><span data-text="ext_name"></span><br><span data-text="ext_title"></span></div>
</li>
<li data-action="search"><b>&nbsp;</b>
	<div><span data-text="gui_search"></span><input type="text">
	<div class="DAF-search-results"></div>
	</div>
</li>
<li data-action="fullWindow"><b data-pref="fullWindow">&nbsp;</b>
	<div>
		<u>
		<i data-pref="fullWindow"></i>
		<i data-pref="fullWindowSide"></i>
		</u>
		<u><i data-pref="hideMenu"></i></u>
		<u><i data-pref="adsOpacity"></i></u>
	</div>
</li>
<li data-action="gc"><b>&nbsp;</b>
	<div>
		<span data-value="status" style="display:none"></span>
		<u class="squared">
		<i data-pref="gcTable"></i>
		<i data-pref="gcTableCounter"></i>
		<i data-pref="gcTableRegion"></i>
		</u>
		<u><i data-pref="autoGC"></i></u>
		<u><i data-pref="noGCPopup"></i></u>
	</div>
</li>
<li data-action="badges"><b>&nbsp;</b>
	<div>
		<span data-text="options_section_badges"></span>
		<u>
		<i data-pref="badgeGcCounter"></i>
		<i data-pref="badgeGcEnergy"></i>
		</u>
		<u class="squared">
		<i data-pref="badgeProductions"></i>
		<i data-pref="badgeCaravan" title="" class="hue2" data-text="tab_caravan"></i>
		<i data-pref="badgeKitchen" title="" class="hue2" data-text="tab_kitchen"></i>
		<i data-pref="badgeFoundry" title="" class="hue2" data-text="tab_foundry"></i>
		<i data-pref="badgeProductionsSound" class="hue" data-title="options_badgesound:1" data-text="options_badgesound:0"></i>
		</u>
		<u class="squared">
		<i data-pref="badgeRepeatables"></i>
		<i data-pref="badgeRepeatablesSound" class="hue" data-title="options_badgesound:1" data-text="options_badgesound:0"></i>
		</u>
		<u class="squared">
		<i data-pref="badgeLuckyCards"></i>
		<i data-pref="badgeLuckyCardsSound" class="hue" data-title="options_badgesound:1" data-text="options_badgesound:0"></i>
		</u>
		<u class="squared">
		<i data-pref="badgeWindmills"></i>
		<i data-pref="badgeWindmillsSound" class="hue" data-title="options_badgesound:1" data-text="options_badgesound:0"></i>
		</u>
		<u class="squared">
		<i data-pref="badgePetShop"></i>
		<i data-pref="badgePetShopSound" class="hue" data-title="options_badgesound:1" data-text="options_badgesound:0"></i>
		</u>
	</div>
</li>
<li data-action="ads" style="display:none"><b>&nbsp;</b>
	<div>
		<span data-text="camp_ads_limit"></span><br>
		<p class="DAF-ads_limit_warning" data-text="camp_ads_limit_info+camp_ads_limit_info2"></p>
		<table class="DAF-table">
			<thead><tr><td data-text="gui_type"></td><td data-text="gui_limit"></td><td data-text="gui_date"></td></tr></thead>
			<tbody></tbody>
			<tfoot><tr><td data-text="camp_total"></td><td class="total"></td><td></td></tr></tfoot>
		</table>
	</div>
</li>
<li data-action="options" style="display:none"><b>&nbsp;</b>
	<div>
		<span data-text="options_hmain:0"></span>
		<u><i data-pref="hFlashAdSound" data-title="options_hflashad:1" data-text="options_hflashad:0"></i>
		<i data-pref="hEnergyMaxSound" data-title="options_henergymax:1" data-text="options_henergymax:0"></i></u>
		<u><i data-pref="hGCCluster"></i><i data-pref="hFastLuckyCards"></i></u>
		<u><i data-pref="hScroll"></i>
		<i data-pref="hInstantCamera"></i></u>
		<u class="squared">
		<i data-text="gui_loot" class="no-click"></i>
		<i data-pref="hLootFew"></i>
		<i data-pref="hLootCount"></i>
		<i data-pref="hLootZoom"></i>
		<i data-pref="hLootFast"></i>
		</u>
		<u class="squared">
		<i data-pref="hFood" class="squared-right"></i>
		<select data-pref="hFoodNum">
			<option value="avg" data-text="gui_average"></option>
			<option value="min" data-text="gui_minimum"></option>
			<option value="0" data-text="1 = gui_maximum"></option>
		</select>
		</u>
		<u class="squared">
			<i data-pref="hQueue"></i>
			<i data-pref="hAutoQueue"></i>
		</u>
		<u class="squared"><i class="no-click" data-text="gui_pet"></i>
		<i data-pref="hPetFollow"></i>
		<i data-pref="hPetSpeed" data-title="options_hspeed:1" data-text="options_hspeed:0"></i></u>
		<u><i data-pref="hSpeed"></i><i data-pref="hLockCaravan"></i></u>
		<u class="squared"><i class="no-click" data-text="@Initial popups"></i>
		<i data-pref="hNoMails" data-text="@Skip"></i>
		<span data-action="showMails" style="display:none" data-title="@Show initial popups">Show</span>
		</u>
		<u><i data-pref="hKeys"></i><i data-pref="hAutoDig" data-text="@Auto Dig"></i></u>
	</div>
</li>
<li data-action="reloadGame"><b>&nbsp;</b>
	<div>
		<span data-text="menu_reloadgame"></span>
		<br>
		<i data-value="switch"></i>
	</div>
</li>
</ul>
<div class="DAF-badges">
	<b data-close class="DAF-badge-extra DAF-badge-img" data-title="options_hmain_disabled">EXTRA</b>
	<b data-close class="DAF-badge-energy DAF-badge-img"></b>
	<b class="DAF-badge-gc-counter DAF-badge-img"></b>
	<b class="DAF-badge-gc-energy DAF-badge-img"></b>
	<b data-animate class="DAF-badge-windmills DAF-badge-img" data-title="camp_needs_windmills"></b>
	<b data-animate class="DAF-badge-p-c DAF-badge-img" data-title="tab_caravan">0</b>
	<b data-animate class="DAF-badge-p-k DAF-badge-img" data-title="tab_kitchen">0</b>
	<b data-animate class="DAF-badge-p-f DAF-badge-img" data-title="tab_foundry">0</b>
	<b data-animate class="DAF-badge-luckycards DAF-badge-img" data-title="options_badgeluckycards:0"></b>
	<b data-animate class="DAF-badge-petshop DAF-badge-img" data-title="options_badgepetshop:0"></b>
	<b class="DAF-badge-autoqueue DAF-badge-img" data-title="options_hautoqueue">AUTO QUEUE</b>
	<b class="DAF-badge-autodig DAF-badge-img">AUTO DIG</b>
	<div data-animate class="DAF-badge-rep"></div>
</div>
`;
	// remove spaces
	html = html.replace(/>\s+/g, '>');
	Html.set(menu, html);
	// menu.querySelector('[data-pref="hAutoDig"]')?.remove();
	const select = menu.querySelector('[data-pref="hFoodNum"]');
	[...Array(19).keys()].forEach(i => select.add(new Option(i + 2, i + 1)));
	menu.querySelector('[data-value="switch"]').setAttribute('data-text', site == 'portal' ? 'menu_switchfacebook' : 'menu_switchportal');
	translateMenu();
	setupSearch();
	menu.addEventListener('click', onMenuClick);
	menu.querySelectorAll('select[data-pref]').forEach((el) => {
		el.addEventListener('change', onMenuClick);
		el.addEventListener('click', (event) => {
			event.stopPropagation();
			event.preventDefault();
		});
	});
	menu.querySelectorAll('.DAF-badges [data-animate]').forEach((badge) => {
		badge.addEventListener('mouseenter', () => badge.classList.remove('animate'));
	});
	menu.querySelectorAll('.DAF-badges [data-close]').forEach((badge) => {
		badge.addEventListener('click', () => badge.classList.remove('DAF-badge-on'));
	});
	menu.querySelectorAll('.DAF-badges .DAF-badge-autodig').forEach((badge) => {
		badge.addEventListener('click', () => toggleAutoDig('badge'));
	});

	updateMenu();
}

function translateMenu() {
	const getText = (value, wrapped) => {
		const text = value.charAt(0) === '@' ? value.substring(1) : value.replace(/\+/g, '\n').replace(/([a-z][a-z0-9_]+)(:(0|1))?/g, function (_, key, _, transform) {
			let text = getMessage(key);
			if (transform) {
				const i = text.indexOf('\n');
				text = transform == '0' ? text.substring(0, i) : text.substring(i + 1);
			}
			return text;
		});
		return wrapped ? getWrappedText(text) : text;
	};
	for (const el of Array.from(menu.querySelectorAll('[data-title]'))) el.title = getText(el.getAttribute('data-title'), true);
	for (const el of Array.from(menu.querySelectorAll('[data-text]'))) Html.set(el, Html.br(getText(el.getAttribute('data-text'))));
	for (const el of Array.from(menu.querySelectorAll('[data-pref]'))) {
		const msg = 'options_' + el.getAttribute('data-pref').toLowerCase();
		if (!el.hasAttribute('data-title')) el.title = getText(msg + ':1', true);
		if (el.tagName === 'I' && !el.hasAttribute('data-text')) Html.set(el, Html.br(getText(msg + ':0')));
	}
}

function setupSearch() {
	const searchInput = menu.querySelector('[data-action="search"] input');
	let searchHandler;
	searchInput.addEventListener('input', () => {
		if (searchHandler) clearTimeout(searchHandler);
		searchHandler = setTimeout(executeSearch, 500);
	});
	searchInput.addEventListener('keydown', (event) => {
		if (event.code === 'Escape') document.activeElement.blur();
		if (event.code === 'Backspace') event.stopPropagation();
	});
	async function executeSearch() {
		searchHandler = null;
		const container = menu.querySelector('.DAF-search-results');
		container.style.display = 'none';
		Html.set(container, '');
		const text = searchInput.value.trim();
		if (!text) return;
		const { count, list } = await Msg.send('searchNeighbor', { text });
		const gm = (id) => Html(getMessage(id));
		let html = `<table class="DAF-table">`;
		if (list.length) {
			html += `
<thead><tr><td colspan="2">${gm('gui_neighbour')}</td>
<td class="DAF-visit"></td>
<td class="DAF-search-region" title="${gm('gui_region')}"></td>
<td class="DAF-search-level" title="${gm('gui_level')}"></td></tr></thead>
<tbody>`;
			list.forEach((pal) => {
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
			if (count - list.length > 0)
				html += `<tfoot><tr><th colspan="5">${gm('gui_toomanyresults')} (${count})</th></tr></tfoot>`;
		} else {
			html += `<tfoot><tr><th>${Html(getMessage('gui_noresults'))}</th></tr></tfoot>`;
		}
		html += `</table>`;
		Html.set(container, html);
		container.querySelectorAll('img[data-src]').forEach((img) => {
			const src = img.getAttribute('data-src');
			img.src = src[0] == '/' ? getExtensionUrl(src) : src;
		});
		container.style.display = 'block';
	}
}

function updateMenu(prefName) {
	if (!menu) return;
	Array.from(menu.querySelectorAll('[data-pref' + (prefName ? '="' + prefName + '"' : '') + ']')).forEach((el) => {
		const prefName = el.getAttribute('data-pref');
		if (el.tagName === 'SELECT') {
			el.value = Prefs[prefName];
			return;
		}
		const prefValue = el.getAttribute('data-pref-value');
		const isOn = prefValue ? prefValue == Prefs[prefName] : !!Prefs[prefName];
		el.classList.toggle('DAF-on', isOn);
	});
	const divBadges = menu.querySelector('.DAF-badges');
	const names = prefName ? [prefName] : Object.keys(Prefs);
	names
		.filter((prefName) => prefName.startsWith('badge') || prefName === 'hQueue' || prefName === 'hAutoQueue' || prefName === 'hAutoDig')
		.forEach((prefName) => divBadges.classList.toggle('DAF-' + prefName.toLowerCase(), !!Prefs[prefName]));
}

function setShowMailsButton(flag) {
	const button = menu.querySelector('[data-action="showMails"]');
	if (button) button.style.display = flag ? '' : 'none';
}

function onMenuClick(e) {
	const target = e.target;
	if (!target || target.tagName == 'DIV') return;
	let action = null;
	let parent = target;
	while (parent && parent !== menu && !(action = parent.getAttribute('data-action'))) parent = parent.parentNode;
	switch (action) {
		case 'about':
			Msg.send('showGUI');
			break;
		case 'fullWindow':
		case 'gc': {
			const name = target.getAttribute('data-pref') || action;
			setPreference(name, !Prefs[name]);
			break;
		}
		case 'options':
		case 'badges': {
			const name = target.getAttribute('data-pref');
			if (name === 'hAutoDig') {
				toggleAutoDig('menu');
			} else if (name) {
				let value;
				if (target.tagName === 'SELECT') value = target.value;
				else {
					const s = target.getAttribute('data-pref-value');
					value = s === null ? !Prefs[name] : isFinite(+s) ? +s : s;
				}
				setPreference(name, value);
			}
			break;
		}
		case 'reloadGame': {
			let value = target.getAttribute('data-value');
			const portal = (site == 'portal') ^ (value === 'switch');
			value += ' ' + (portal ? 'portal' : 'facebook');
			Msg.send('reloadGame', { value });
			break;
		}
		case 'visit':
			setScreen('visiting');
			Msg.sendPage('visit', { id: parent.parentNode.parentNode.getAttribute('data-id') });
			break;
		case 'showMails':
			setShowMailsButton(false);
			Msg.sendPage('showMails');
			break;
	}
}

function setBadge({ selector, text, title, active }) {
	const badge = menu && menu.querySelector(selector);
	if (!badge) return;
	Html.set(badge, Html(text || ''));
	badge.title = title || '';
	badge.classList.toggle('DAF-badge-on', !!active);
}

async function playSound(sound, volume = 100) {
	if (!sound || !volume) return;
	volume = +volume / 100;
	const last = (playSound.last = playSound.last || {});
	if (last.sound == sound && (!last.ended || last.ended + 5 > getUnixTime())) return;
	if (last.audio)
		try {
			last.audio.pause();
		} catch (e) {}
	const audio = (last.audio = new Audio((last.sound = sound)));
	audio.volume = volume;
	last.ended = 0;
	try {
		await audio.play();
	} catch (error) {
	} finally {
		if (audio == last.audio) {
			last.audio = null;
			last.ended = getUnixTime();
		}
	}
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
			handler = setTimeout(setText, 1000 - (Date.now() % 1000));
			text = String(diff % 60).padStart(2, '0');
			diff = (diff - (diff % 60)) / 60;
			if (diff) {
				text = String(diff % 60).padStart(2, '0') + ':' + text;
				diff = (diff - (diff % 60)) / 60;
				if (diff) text = String(diff).padStart(2, '0') + ':' + text;
			}
		}
		Html.set(badge, Html(text));
	}
	return function setBadgeLuckyCards({ active, sound, volume, next, name }) {
		active = !!active;
		badge = menu.querySelector('.DAF-badge-luckycards');
		if (name) {
			badge.classList.toggle('DAF-badge-on', true);
			Html.set(badge, Html(name));
			if (handler) clearTimeout(handler);
			handler = setTimeout(() => badge.classList.toggle('DAF-badge-on', false), 5000);
			return;
		}
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

function setBadgePetShop({ active, sound, volume }) {
	active = !!active;
	badge = menu.querySelector('.DAF-badge-petshop');
	const wasActive = badge.classList.contains('DAF-badge-on');
	badge.classList.toggle('DAF-badge-on', active);
	if (active && !wasActive) {
		badge.classList.add('animate');
		playSound(sound, volume);
	}
	Html.set(badge, Html(getMessage('repeat_ready')));
}

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
		const flag = Prefs.badgeProductions && flagActive && isActive && (!wasActive || prevNum < currNum);
		if (flag) badge.classList.add('animate');
		return flag;
	}
	let flag = false;
	flag |= setProduction('.DAF-badge-p-c', caravan, Prefs.badgeCaravan);
	flag |= setProduction('.DAF-badge-p-k', kitchen, Prefs.badgeKitchen);
	flag |= setProduction('.DAF-badge-p-f', foundry, Prefs.badgeFoundry);
	if (flag && Prefs.badgeProductionsSound) playSound(sound, volume);
}

function setBadgeRepeatables({ list, sound, volume }) {
	const ADD = 1000;
	const badge = menu.querySelector('.DAF-badge-rep');
	list = Array.isArray(list) ? list : [];
	list.forEach((item, index) => (item.index = index));
	badge.querySelectorAll('[data-lid]').forEach((div, index) => {
		const lid = +div.getAttribute('data-lid');
		const item = list.find((item) => +item.lid == lid);
		if (item) item.index = ADD + index;
	});
	badge.classList.toggle('DAF-badge-on', list.length > 0);
	const MAXVISIBLE = 8;
	const numVisible = list.length > 3 ? 1 : list.length;
	list.sort((a, b) => a.index - b.index);
	const counter = (className, num, addTitle) => {
		const rest = list.slice(num);
		const flag = rest.length > 0;
		const title = flag && addTitle ? rest.map((data) => `${data.name} (${data.rname})`).join('\n') : '';
		return `<span class="${className}" style="${flag ? '' : 'display:none'}" title="${Html(title)}">${
			flag ? '+' + rest.length : ''
		}</span>`;
	};
	const html =
		`<b>` +
		list
			.map((item, index) => {
				const title = `${item.name}\n${getMessage(item.rid ? 'gui_region' : 'gui_event')}: ${item.rname}`;
				const style = `background-image:url(${item.image})${index >= MAXVISIBLE ? ';display:none' : ''}`;
				const className = `${item.isNew ? 'new' : ''} ${index >= numVisible ? 'on-hover' : ''}`;
				return `<div data-lid="${item.lid}" class="${className}" title="${Html(
					title
				)}" style="${style}"></div>`;
			})
			.join('') +
		counter('no-hover', numVisible) +
		counter('on-hover', MAXVISIBLE, true) +
		`</b>`;
	Html.set(badge, html);
	const isNew = list.find((item) => item.index < ADD);
	if (isNew) {
		if (Prefs.badgeRepeatables) playSound(sound, volume);
		badge.classList.add('animate');
	}
}

function updateAdsInfo(data) {
	const li = menu.querySelector('[data-action="ads"]');
	const flag = data?.items?.length;
	li.style.display = flag ? '' : 'none';
	if (flag) {
		Html.set(
			li.querySelector('tbody'),
			data.items
				.map((item) => Html`<tr><td>${item.text}</td><td>${item.limit}</td><td>${item.date}</td></tr>`)
				.join('')
		);
		Html.set(li.querySelector('.total'), data.total);
	}
}

function gcTable_updateStatus(data) {
	const el = menu.querySelector('[data-value=status]');
	Html.set(el, Html(data.count ? getMessage('godchild_stat', data.count, data.max) : getMessage('menu_gccollected')));
	el.title = data.nexttxt || '';
	el.style.display = '';
	setBadge({ selector: '.DAF-badge-gc-counter', text: data.count, title: data.nexttxt, active: data.count > 0 });
}
function gcTable_isEmpty() {
	return gcTable.childNodes.length <= 1;
}
function gcTable_remove(div) {
	if (gcTable) {
		const heightBefore = gcTable.offsetHeight;
		div?.remove();
		Html.set(gcTable.firstChild.firstChild, Html(gcTable.childNodes.length - 1));
		const heightAfter = gcTable.offsetHeight;
		// in fullscreen, instead of hiding the scrollbar, we make if always visible so the layout does not change
		if (!document.fullscreenElement) gcTable.style.overflowX = '';
		else if (heightBefore > heightAfter) gcTable.style.overflowX = 'scroll';
		// handle case where the table is empty
		if (gcTable_isEmpty() && gcTable.style.display != 'none') gcTable.style.display = 'none';
	}
}
async function gcTable_show(forceRefresh = false, simulate = 0) {
	const show = Prefs.gcTable;
	// If table is present, we just show/hide it
	if (gcTable && gcTable_isEmpty() && !forceRefresh) {
		// handle case where the table is empty
		gcTable_remove(null);
	} else if (gcTable && !forceRefresh) {
		gcTable.style.display = show ? 'block' : 'none';
		// If table is not present and we need to show it, we must retrieve the neighbours first
	} else if (show) {
		const result = await Msg.send('getGCList', { simulate: simulate });
		if (gcTable) Html.set(gcTable, '');
		const list = result?.list || [];
		const max = result?.max || 0;
		const regions = result?.regions || {};
		if (!gcTable) {
			gcTable = Html.get(`<div class="DAF-gc-bar DAF-gc-flipped"></div>`)[0];
			container.appendChild(gcTable);
			gcTable.addEventListener('click', function (e) {
				for (let div = e.target; div && div !== gcTable; div = div.parentNode)
					if (div.id && div.id.startsWith('DAF-gc_')) {
						const id = +div.id.substring(7);
						if (e.ctrlKey) gcTable_remove(div);
						else Msg.sendPage('visit', { id });
						return;
					}
			});
		}
		let htm = '';
		htm += `<div class="DAF-gc-count"><div>${list.length}</div><div>/</div><div>${max}</div></div>`;
		list.forEach((item) => {
			const id = 'DAF-gc_' + item.id;
			const className = 'DAF-gc-pal DAF-gc-reg' + item.region;
			const style = `background-image:url(${
				item.pic || 'https://graph.facebook.com/v2.8/' + item.fb_id + '/picture'
			})`;
			let fullName = item.name;
			if (item.surname) fullName += ' ' + item.surname;
			const title = fullName + '\n' + getMessage('gui_region') + ': ' + (regions[item.region] || item.region);
			htm += `<div id="${id}" class="${className}" style="${style}" title="${Html(title)}">`;
			htm += `<div style="${item.id == 1 ? 'visibility:hidden' : ''}">${item.level}</div>`;
			htm += `<div>${Html(item.name)}</div>`;
			htm += `</div>`;
		});
		Html.set(gcTable, htm);
		gcTable_setOptions();
		gcTable_remove(null);
	}
}
function gcTable_setOptions() {
	gcTable?.classList.toggle('withCounter', Prefs.gcTableCounter);
	gcTable?.classList.toggle('withRegion', Prefs.gcTableRegion);
}

const stopEvent = (event) => void (event.stopPropagation(), event.preventDefault());
const ARROWKEYS = { BracketLeft: 1, BracketRight: 1 };
'D,C'.split(',').forEach(s => ARROWKEYS['Key' + s] = 1);
'Left,Up,Down,Right'.split(',').forEach(s => ARROWKEYS['Arrow' + s] = 1);
'0,1,2,3,4,5,6,7,8,9,Subtract,Add,Divide'.split(',').forEach(s => ARROWKEYS['Numpad' + s] = 1);
function setupHotKeyHandlers() {
	let lastKeyCode;
	const toggleQueue = (event) => {
		stopEvent(event);
		setPreference('hAutoQueue', !Prefs['hAutoQueue']);
	};
	const onKeyDown = (event) => {
		const code = event.code;
		if (isAccessibilityKeysEnabled && Prefs.hKeys && !event.altKey && !event.shiftKey && !event.ctrlKey && code in ARROWKEYS) {
			const tag = document.activeElement?.tagName;
			if (tag == 'INPUT' || tag == 'SELECT') return;
			stopEvent(event);
			sendKeyCode(code);
			return;
		}
		if (lastKeyCode == code) return;
		lastKeyCode = code;
		if (event.altKey && !event.shiftKey && !event.ctrlKey) {
			if (code == 'Key' + Prefs.queueHotKey) {
				if (isAutoQueueEnabled) toggleQueue(event);
			} else if (Prefs.autoDigHotKey && code == 'Key' + Prefs.autoDigHotKey) {
				stopEvent(event);
				toggleAutoDig('key');
			}
		}
	};
	const onMouseUp = (event) => {
		if (isAutoQueueEnabled) {
			if (Prefs.queueMouseGesture == 1 && event.button == 1) toggleQueue(event);
			if (Prefs.queueMouseGesture == 2 && event.button == 0 && event.buttons == 2) toggleQueue(event);
		}
	};
	window.addEventListener('keydown', onKeyDown);
	window.addEventListener('keyup', () => void (lastKeyCode = 0));
	window.addEventListener('mouseup', onMouseUp, { capture: true });
}
