/*global chrome Html*/
// GAME PAGE
let prefs, handlers, msgHandlers, miner, postMessage;
let gcTable, gcTableStyle;
let loadCompleted, game1Received, pageType;
let lastFullWindow = false;

function getFullWindow() { return prefs.fullWindow && game1Received && loadCompleted; }
function sendValue(name, value) { chrome.runtime.sendMessage({ action: 'sendValue', name: name, value: prefs[name] = value }); }
function sendPreference(name, value) { if (name in prefs) chrome.storage.local.set({ [name]: value }); }
function forceResize(delay = 0) { setTimeout(() => window.dispatchEvent(new Event('resize')), delay); }
function setFlag(name, value) { document.documentElement.setAttribute('DAF--' + name.toLowerCase().replace(/@/g, '_'), String(typeof value == 'boolean' ? +value : value ?? '')); }
function forward(action, data) { chrome.runtime.sendMessage(Object.assign({}, data, { action: 'forward', real_action: action })); }

function sendMinerPosition() {
	// Send some values to the top window
	const name = '@bodyHeight';
	const value = Math.floor(document.getElementById('footer').getBoundingClientRect().bottom);
	if (prefs[name] !== value && value > 0) sendValue(name, value);
}

function getMessage(id, ...args) {
	const $L = prefs.language;
	if (getMessage.$L !== $L) {
		const $M = getMessage.$M = {}, split = (key) => chrome.i18n.getMessage(key).split('|'), m0 = split('en'), m1 = split(getMessage.$L = $L);
		split('keys').forEach((key, index) => $M[key] = m1[index] || m0[index]);
	}
	return (getMessage.$M[id.toLowerCase()] || '').replace(/\^\d/g, t => { const n = +t[1] - 1; return n >= 0 && n < args.length ? args[n] : ''; });
}

let resizeHandler = 0;
function onResize() {
	const fullWindow = getFullWindow();
	if (resizeHandler) clearTimeout(resizeHandler);
	resizeHandler = 0;
	if (gcTable) {
		gcTable.style.overflowX = 'auto';
		gcTable.style.width = fullWindow ? window.innerWidth : '100%';
	}
	sendMinerPosition();
}

function createScript(code) {
	const script = document.createElement('script');
	script.type = 'text/javascript';
	script.appendChild(document.createTextNode(code));
	return script;
}

function onFullWindow() {
	const fullWindow = getFullWindow();
	const fn = el => el && (el.style.display = fullWindow ? 'none' : '');
	if (fullWindow != lastFullWindow) {
		lastFullWindow = fullWindow;
		setFlag('fullWindow', fullWindow);
		document.body.style.backgroundColor = fullWindow ? '#000' : '';
		document.body.style.overflow = fullWindow ? 'hidden' : '';
		Array.from(document.querySelectorAll('.header-menu,#gems_banner,.cp_banner .bottom_banner,#bottom_news,#footer,.client-type-switch,.news')).forEach(fn);
		forceResize(1000);
	}
}

function gcTable_isEmpty() {
	return gcTable.childNodes.length <= 1;
}

function gcTable_remove(div) {
	if (!gcTable) return;
	const fullWindow = getFullWindow();
	const heightBefore = gcTable.offsetHeight;
	if (div) {
		div.parentNode.removeChild(div);
		Html.set(gcTable.firstChild.firstChild, Html(gcTable.childNodes.length - 1));
		const heightAfter = gcTable.offsetHeight;
		// scrollbar was hidden and we are in full window?
		if (heightBefore > heightAfter && fullWindow) {
			// Force Resize is currently disabled because it causes the game's neighbour list to reset position
			// instead, we keep the space for the scrollbar
			gcTable.style.overflowX = 'scroll';
		}
	}
	// handle case where the table is empty
	if (gcTable_isEmpty()) {
		if (gcTable.style.display != 'none') {
			gcTable.style.display = 'none';
			if (fullWindow) forceResize();
		}
	}
}

function ongcTable(forceRefresh = false, simulate = 0) {
	const show = prefs.gcTable;
	// If table is present, we just show/hide it
	if (gcTable && gcTable_isEmpty() && !forceRefresh) {
		// handle case where the table is empty
		gcTable_remove(null);
	} else if (gcTable && !forceRefresh) {
		gcTable.style.display = show ? 'block' : 'none';
		if (getFullWindow()) forceResize();
		// If table is not present and we need to show it, we must retrieve the neighbours first
	} else if (show) {
		chrome.runtime.sendMessage({ action: 'getGCList', simulate: simulate }, function updateGCTable(result) {
			if (gcTable) while (gcTable.firstChild) gcTable.firstChild.remove();
			const list = (result && result.list) || [];
			const max = (result && result.max) || 0;
			const regions = (result && result.regions) || {};
			if (!gcTable) {
				gcTable = Html.get(`<div class="DAF-gc-bar DAF-gc-flipped" style="display:none"></div>`)[0];
				miner.parentNode.insertBefore(gcTable, miner.nextSibling);
				gcTable.addEventListener('click', function (e) {
					for (let div = e.target; div && div !== gcTable; div = div.parentNode)
						if (div.id && div.id.startsWith('DAF-gc_')) {
							const id = +div.id.substring(7);
							if (e.ctrlKey) gcTable_remove(div);
							else postMessage({ action: 'visit', id });
							return;
						}
				});
			}
			let htm = '';
			htm += `<div class="DAF-gc-count"><div>${list.length}</div><div>/</div><div>${max}</div></div>`;
			list.forEach(item => {
				const id = 'DAF-gc_' + item.id;
				const className = 'DAF-gc-pal DAF-gc-reg' + item.region;
				const style = `background-image:url(${item.pic || 'https://graph.facebook.com/v2.8/' + item.fb_id + '/picture'})`;
				let fullName = item.name;
				if (item.surname) fullName += ' ' + item.surname;
				const title = fullName + '\n' + getMessage('gui_region') + ': ' + (regions[item.region] || item.region);
				htm += `<div id="${id}" class="${className}" style="${style}" title="${Html(title)}">`;
				htm += `<div style="${item.id == 1 ? 'visibility:hidden' : ''}">${item.level}</div>`;
				htm += `<div>${Html(item.name)}</div>`;
				htm += `</div>`;
			});
			Html.set(gcTable, htm);
			setgcTableOptions();
			if (gcTable_isEmpty()) return gcTable_remove(null);
			setTimeout(function () {
				gcTable.style.display = '';
				if (getFullWindow()) forceResize(0);
			}, gcTableStyle ? 500 : 2000);
		});
	}
}

function setgcTableOptions() {
	if (gcTable) {
		gcTable.classList.toggle('DAF-gc-show-region', !!prefs.gcTableRegion);
	}
}

function interceptData() {
	const code = `
(function() {
	let parser = null;
	function parseXml(text) {
		if (!text) return null;
		if (!parser) parser = new DOMParser();
		const root = parser.parseFromString(text, 'text/xml')?.documentElement;
		return root ? parse(root) : null;
		function parse(parent) {
			const item = {};
			function add(name, value) {
				if (name in item) {
					const old = item[name];
					if (Array.isArray(old)) old.push(value);
					else item[name] = [old, value];
				} else item[name] = value;
			}
			for (let child = parent.firstElementChild; child; child = child.nextElementSibling)
				add(child.nodeName, child.firstElementChild ? parse(child) : child.textContent);
			return item;
		}
	}
	const XHR = XMLHttpRequest.prototype;
	const send = XHR.send;
	const open = XHR.open;
	function getString(b) {
		let s = '';
		let i = 0;
		const max = b.length;
		while (i < max) {
			const c = b[i++];
			if (c < 128) {
				if (c == 0) { break; }
				s += String.fromCodePoint(c);
			} else if (c < 224) {
				const code = (c & 63) << 6 | b[i++] & 127;
				s += String.fromCodePoint(code);
			} else if (c < 240) {
				const c2 = b[i++];
				const code1 = (c & 31) << 12 | (c2 & 127) << 6 | b[i++] & 127;
				s += String.fromCodePoint(code1);
			} else {
				const c21 = b[i++];
				const c3 = b[i++];
				const u = (c & 15) << 18 | (c21 & 127) << 12 | (c3 & 127) << 6 | b[i++] & 127;
				s += String.fromCodePoint(u);
			}
		}
		return s;
	}
	XHR.open = function(method, url) {
		this.url = url;
		return open.apply(this, arguments);
	}
	XHR.send = function() {
		let kind, lang, player_id, xml;
		const dispatch = (type) => {
			let response = null;
			if (type == 'ok') {
				const result = this.response;
				if (result === null) response = null;
				else if (typeof result == 'string') response = result;
				else if (result.bytes instanceof Uint8Array) response = getString(result.bytes);
				else console.log('daf_xhr: invalid response');
			}
			const event = new CustomEvent('daf_xhr', { detail: { type, kind, lang, player_id, xml, response } });
			document.dispatchEvent(event);
		}
		if (this.url.indexOf('/graph.facebook.com') > 0) {
			kind = 'graph';
			this.addEventListener('load', () => dispatch('ok'));
			return send.apply(this, arguments);
		} else if (this.url.indexOf('/generator.php') > 0) {
			kind = 'generator';
			try { lang = gamevars.lang; } catch(e) { }
		} else if (this.url.indexOf('/synchronize.php') > 0) kind = 'synchronize';
		else if (this.url.indexOf('/server-api/teams/my') > 0) kind = 'team';
		if (kind) {
			if (kind == 'generator' || kind == 'synchronize') {
				for (const item of (arguments[0] || '').split('&')) {
					const p = item.split('=');
					const key = decodeURIComponent(p[0]);
					if (key == 'player_id') player_id = decodeURIComponent(p[1]);
					else if (key == 'xml') xml = parseXml(decodeURIComponent(p[1]));
				}
			}
			const error = () => dispatch('error');
			dispatch('send');
			this.addEventListener('load', () => dispatch('ok'));
			this.addEventListener('error', error);
			this.addEventListener('abort', error);
			this.addEventListener('timeout', error);
		}
		return send.apply(this, arguments);
	};
})();
`;
	document.head.prepend(createScript(code));
	document.addEventListener('daf_xhr', function (event) {
		chrome.runtime.sendMessage(Object.assign({}, event.detail, { action: 'daf_xhr' }));
	});
}

function init() {
	miner = document.getElementById('miner') || document.getElementById('canvas');
	// Set body height to 100% so we can use height:100% in miner
	document.body.style.height = '100%';
	// insert link for condensed font
	Html.addStylesheet(chrome.runtime.getURL('inject/game_gctable.css'), () => { gcTableStyle = true; });
	interceptData();

	handlers = {};
	msgHandlers = {};
	prefs = {};
	const addPrefs = names => names.split(',').forEach(name => prefs[name] = undefined);
	addPrefs('language,resetFullWindow,fullWindow,fullWindowHeader,fullWindowSide,fullWindowLock,fullWindowTimeout');
	addPrefs('autoClick,autoGC,noGCPopup,gcTable,gcTableCounter,gcTableRegion,@bodyHeight');
	addPrefs('@super,@extra,hMain,hSpeed,hLootCount,hLootZoom,hLootFast,hFood,hFoodNum,hQueue,hScroll,hReward');

	const prefFlags = new Set(['noGCPopup', 'hSpeed', 'hLootCount', 'hLootZoom', 'hLootFast', 'hFood', 'hFoodNum', 'hQueue', 'hScroll', 'hReward']);
	function setPref(name, value) {
		if (!(name in prefs)) return;
		prefs[name] = value;
		if (prefFlags.has(name)) setFlag(name, value);
		if (name in handlers) handlers[name]();
	}

	chrome.runtime.sendMessage({ action: 'getPrefs', keys: Object.keys(prefs) }, function (response) {
		if (chrome.runtime.lastError) {
			console.error('Error retrieving preferences');
			return;
		}
		Object.keys(response).forEach(name => setPref(name, response[name]));

		// track preference changes
		chrome.storage.onChanged.addListener(function (changes, area) {
			if (area != 'local') return;
			for (const name in changes) setPref(name, changes[name].newValue);
		});

		chrome.runtime.onMessage.addListener(function (request, sender) {
			try {
				const action = request && request.action;
				if (action in msgHandlers) msgHandlers[action](request);
			} catch (e) {
				console.error('onMessage', e, request, sender);
			}
		});

		handlers['fullWindow'] = onFullWindow;
		handlers['gcTable'] = ongcTable;
		handlers['gcTableRegion'] = setgcTableOptions;
		ongcTable();
		msgHandlers['game1'] = (request) => {
			pageType = request.pageType;
			game1Received = !!request.ok;
			onFullWindow();
		};
		msgHandlers['generator'] = () => {
			if (loadCompleted) return;
			delete msgHandlers['generator'];
			loadCompleted = true;
			onFullWindow();
			ongcTable(true);
		};
		setTimeout(msgHandlers['generator'], 10000);
		msgHandlers['friend_child_charge'] = (request) => {
			gcTable_remove(document.getElementById('DAF-gc_' + request.data.id));
			if (prefs.autoGC && request.data.skip) {
				const eventConfig = { clientX: 35, clientY: Math.floor(miner.offsetHeight / 2 + miner.offsetTop), buttons: 1 };
				miner.dispatchEvent(new MouseEvent('mousedown', eventConfig));
				setTimeout(() => miner.dispatchEvent(new MouseEvent('mouseup', eventConfig)), 250);
			}
		};
		window.addEventListener('resize', onResize);
		sendMinerPosition();
		onFullWindow();
		const key = Math.floor(Math.random() * 36 ** 8).toString(36).padStart(8, '0');
		postMessage = (data) => window.postMessage(Object.assign(data, { key: key }), window.location.href);
		msgHandlers['visit'] = request => postMessage({ action: 'visit', id: request.id });
		window.addEventListener('message', function (event) {
			const data = event.data;
			if (event.source != window || !data || data.key != key) return;
			if (data.action == 'exitFullWindow' && !prefs.fullWindowLock) sendPreference('fullWindow', false);
			if (data.action == 'wallpost' && pageType == 'facebook2') forward('wallpost');
			if (data.action == 'sendValue') sendValue(data.name, data.value);
			if (data.action == 'hFlashAd') forward(data.action, data);
		});
		let code = `
const key = "${key}";
let visit = () => {};
window.addEventListener('message', function (event) {
	const data = event.data;
	if (event.source != window || !data || data.key != key) return;
	if (data.action == 'visit') visit(+data.id);
});

const getFlag = (name) => document.documentElement.getAttribute('DAF--' + name.toLowerCase());
const hasFlag = (name) => getFlag(name) == '1';
const postMessage = (data) => window.postMessage(Object.assign(data, { key: key }), window.location.href);

const isDAFFullWindow = () => hasFlag('fullWindow');
const _isFullScreen = window.isFullScreen;
window.isFullScreen = () => isDAFFullWindow() || _isFullScreen();
const _exitFullscreen = window.exitFullscreen;
window.exitFullscreen = () => {
	if (!isDAFFullWindow()) return _exitFullscreen();
	postMessage({ action: "exitFullWindow" });
};

let bypassFB = false;
const _getFBApi = window.getFBApi;
window.getFBApi = function() {
	const result = bypassFB ? { ui: function() {} } : _getFBApi();
	bypassFB = false;
	return result;
};
const _userRequest = window.userRequest;
window.userRequest = function(recipients, req_type) {
	bypassFB = hasFlag('noGCPopup');
	const result = _userRequest(recipients, req_type);
	bypassFB = false;
	return result;
};

const _wallpost = window.wallpost;
window.wallpost = function() {
	postMessage({ action: "wallpost" });
	_wallpost();
};
`;

	if (prefs.hMain) code += `
const isSuper = ${prefs['@super'] ? 'true' : 'false'};
let extras = [];
const $hxClasses = window.$hxClasses;

const core = $hxClasses?.["com.pixelfederation.diggy.Core"];
let currentScreen = null;
const getActiveScreen = () => {
	let screen = core?.instance?._screenManager?.getActiveScreen();
	let visited = null;
	if (screen == 'campLowerScreen' || screen == 'campUpperScreen') {
		visited = core.instance._gameManagers?._friendsManager?.getVisitedFriend()?.getId();
		if (visited) screen += 'Visit';
	}
	const popups = core.instance?._popupManager?._visiblePopups;
	const popup = popups?.length > 0 ? popups[popups.length - 1] : null;
	const dialog = popup ? popup._popupId?.Id || popup._name : null;
	return { screen, visited, dialog };
}
visit = (id) => {
	currentScreen = null;
	const fm = core?.instance?._gameManagers._friendsManager;
	const info = getActiveScreen();
	if (fm && id > 0 && !info.dialog && ['friendsScreen', 'campLowerScreenVisit', 'campUpperScreenVisit'].includes(info.screen) && id !== info.visited) fm.visitFriend(id);
};
if (core) {
	extras.push('@core');

	setInterval(() => {
		const info = getActiveScreen();
		const value = info.screen + '.' + info.dialog;
		const screen = value + '.' + info.visited;
		if (screen !== currentScreen) {
			currentScreen = screen;
			postMessage({ action: "sendValue", name: '@screen', value });
		}
	}, 1000);
}

const rp = $hxClasses?.["com.pixelfederation.diggy.screens.popup.RedeemEnterCodePopup"];
if (rp) {
	extras.push('hReward');
	const _keyDownHandler = rp.prototype.keyDownHandler;
	rp.prototype.keyDownHandler = function(p_event) {
		if (p_event.keyCode >= 65 && p_event.keyCode <= 90 && hasFlag('hReward')) p_event = { keyCode: p_event.keyCode, key: p_event.key.toUpperCase() };
		return _keyDownHandler.call(this, p_event);
	};
}

const gcr = $hxClasses?.["com.pixelfederation.diggy.game.character.Character"];
if (gcr) {
	extras.push('hSpeed');
	const getSpeed = (p_core, val, def) => {
		const hasSpeedUp = hasFlag('hSpeed') && p_core.getInventoryManager().getSpeedupCtrlRemainingTime() > 0;
		return hasSpeedUp ? Math.min(val * (isSuper ? 0.3 : 0.6), def) : def;
	}

	const _getSpeed = gcr.getSpeed;
	gcr.getSpeed = function(p_core) {
		return getSpeed(p_core, 0.24, _getSpeed.apply(this, arguments));
	};

	const _breakTile = gcr.prototype.breakTile;
	gcr.prototype.breakTile = function(p_tileDef, p_digTime) {
		return _breakTile.call(this, p_tileDef, getSpeed(this._core, 0.15, p_digTime));
	};
}

const mr = $hxClasses?.["com.pixelfederation.diggy.game.mine.MineRenderer"];
if (mr) {
	extras.push('hQueue');

	let maxQueue, wasActive;
	const _mouseMove_handler = mr.prototype.mouseMove_handler;
	mr.prototype.mouseMove_handler = function(e) {
		const { _lastMineTileOver: o, _character: c } = this;
		const n = _mouseMove_handler.apply(this, arguments);
		const t = this._lastMineTileOver;
		const isActive = hasFlag('hQueue');
		if (isActive !== wasActive) {
			wasActive = isActive;
			maxQueue = maxQueue || c.diggingQueue._maxQueue;
			c.diggingQueue._maxQueue = isActive ? 20 : maxQueue;
		}
		if (isActive && t && o !== t && e.shiftKey && (t.isBreakable() || t.isUsable())) c.go(t);
	};
}

const cus = $hxClasses?.["com.pixelfederation.diggy.screens.campUpper.CampUpperScreenWeb"];
if (cus) {
	extras.push('hScroll');
	let firstTime = true;
	const _resizeUI = cus.prototype.resizeUI;
	cus.prototype.resizeUI = function() {
		_resizeUI.apply(this, arguments);
		if (firstTime) {
			firstTime = false;
			Object.defineProperty(this._dragManager.__proto__, '_autoPan', {
				get() {
					return hasFlag('hScroll') ? false : this.__autoPan;
				},
				set(newValue) {
                    this.__autoPan = newValue;
				},
				enumerable: true,
				configurable: true,
			});
			if (hasFlag('hScroll')) this._dragManager.setAutoPan(false);
		}
	};

	if (isSuper) {
		const _addGodChild = cus.prototype.addGodChild;
		cus.prototype.addGodChild = function() {
			var t = this.NPC_POSITIONS;
			this.NPC_POSITIONS = Array.from(t).fill(-240);
			const result = _addGodChild.apply(this, arguments);
			this.NPC_POSITIONS = t;
			return result;
		};
	}
}

const dc = $hxClasses?.["com.pixelfederation.diggy.game.custom.DecalContainer"];
if (dc) {
	extras.push('hLootCount');
	extras.push('hLootFast');
	var _createDropCount = dc.prototype.createDropCount;
	dc.prototype.createDropCount = function(p_x,p_y,p_item,p_scaleX,p_scaleY,p_texture,p_target,p_screenType,p_showText) {
		if (p_screenType === 'mineScreen' && hasFlag('hLootCount')) p_showText = true;
		const dp = this.dropLootDecalPool, dp_getNext = dp?.getNext;
		if (dp && p_screenType === 'mineScreen' && hasFlag('hLootFast')) dp.getNext = function() { return null; };
		// Fix bug in game code that exhausts the pool
		const tp = this.textDecalPool, tp_getNext = tp?.getNext;
		if (tp && !p_showText) tp.getNext = function() { return null; };
		const result = _createDropCount.apply(this, arguments);
		if (dp) dp.getNext = dp_getNext;
		if (tp) tp.getNext = tp_getNext;
		return result;
	};

	extras.push('hLootZoom');
	var _getScaleFromScreenType = dc.prototype.getScaleFromScreenType;
	dc.prototype.getScaleFromScreenType = function(p_screenType) {
		if (p_screenType === 'mineScreen' && hasFlag('hLootZoom')) return this._core.getMineCamera().g2d_contextCamera.scaleX;
		return _getScaleFromScreenType.apply(this, arguments);
	};
}

const nop = $hxClasses?.["com.pixelfederation.diggy.screens.popup.NoenergyPopup"];
if (nop) {
	extras.push('hFood', 'hFoodNum');
	const _initUsableFromStorage = nop.prototype.initUsableFromStorage;
	nop.prototype.initUsableFromStorage = function() {
		if (!hasFlag('hFood')) return _initUsableFromStorage.apply(this, arguments);
		this._myUsableFromStorageId = this._myUsableFromStorageCount = this._myUsableFromStorageValue = 0;
		const _usablesLoader = this._core.getLoadersManager()._usablesLoader;
		const usables = this._core.getInventoryManager().getUsables()
			.filter(obj => _usablesLoader.getAction(obj.id) == 'add_stamina')
			.map(obj => [obj, _usablesLoader.getValue(obj.id)])
			.sort((a,b) => b[1] - a[1]);
		let index = 0;
		const what = getFlag('hFoodNum');
		if (what == 'min') index = usables.length - 1;
		else if (what == 'avg') index = Math.floor((usables.length - 1) / 2);
		else if (isFinite(+what)) index = +what;
		index = Math.min(usables.length - 1, Math.max(0, index))
		if (index < usables.length) {
			const [obj, value] = usables[index];
			this._myUsableFromStorageId = obj.id;
			this._myUsableFromStorageValue = value;
			this._myUsableFromStorageCount = this._core.getInventoryManager().getItemAmount(obj.item_type, obj.id);
		}
	};
}

const uib = $hxClasses?.["com.pixelfederation.diggy.ui.hud.UISpecialButtons"];
if (uib) {
	extras.push('hFlashAdSound');
	let _show;
	function show() {
		postMessage({ action: 'hFlashAd' });
		return _show.apply(this, arguments);
	}
	const _createFlashAdButton = uib.prototype.createFlashAdButton;
	uib.prototype.createFlashAdButton = function() {
		const result = _createFlashAdButton.apply(this, arguments);
		const btn = this._flashAdButton?._flashAdButtonIcon;
		if (btn && btn.show !== show) { _show = btn.show; btn.show = show; }
		return result;
	};
}

if (extras.length) postMessage({ action: "sendValue", name: '@extra', value: extras.join() });
`;
		code = `(function(){${code}})();`
		document.head.appendChild(createScript(code));
		forward('game2', { ok: true });
	});
}

init();