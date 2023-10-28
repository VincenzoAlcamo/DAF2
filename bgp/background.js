/*global chrome Parser UrlInfo idb Html Locale PackTiles*/
'use strict';

//#region MISCELLANEOUS
const SECONDS_IN_A_DAY = 86400;
const MINECACHE_LIMIT = 300;
const ADTYPE_LUCKYCARDS_OLD = 'wheel_of_fortune';
const ADTYPE_LUCKYCARDS = 'lucky_cards';

function hasRuntimeError(info) {
	// This is necessary to avoid unchecked runtime errors from Chrome
	const hasError = !!chrome.runtime.lastError;
	if (hasError) console.log(`[${info}] RUNTIME error: "${chrome.runtime.lastError.message}"`);
	return hasError;
}

function getUnixTime() { return Math.floor(Date.now() / 1000); }

function asArray(t) { return t ? [].concat(t) : []; }

let languageId = 'en';

function changeLocale(localeId) {
	Locale.setLocale(localeId ? languageId + '-' + localeId : chrome.i18n.getUILanguage());
}

function getMessage(id, ...args) {
	const $L = languageId;
	if (getMessage.$L !== $L) {
		const $M = getMessage.$M = {}, split = (key) => chrome.i18n.getMessage(key).split('|'), m0 = split('en'), m1 = split(getMessage.$L = $L);
		split('keys').forEach((key, index) => $M[key] = m1[index] || m0[index]);
	}
	return (getMessage.$M[id.toLowerCase()] || '').replace(/\^\d/g, t => { const n = +t[1] - 1; return n >= 0 && n < args.length ? args[n] : ''; });
}

// eslint-disable-next-line no-var
var Badge = {
	currentIcon: '',
	setIcon(color) {
		color = color[0].toUpperCase() + color.substr(1).toLowerCase();
		Badge.currentIcon = '/img/logo/icon' + color + '.png';
		chrome.browserAction.setIcon({
			path: Badge.currentIcon
		});
		return this;
	},
	setText(text) {
		chrome.browserAction.setBadgeText({
			text: text
		});
		return this;
	},
	setBackgroundColor(color) {
		chrome.browserAction.setBadgeBackgroundColor({
			color: color
		});
		return this;
	}
};
//#endregion

//#region PREFERENCES
// eslint-disable-next-line no-var
var Preferences = {
	handlers: {},
	getDefaults() {
		return {
			language: '',
			gameLanguage: '',
			locale: '',
			locales: '',
			disableAltGuard: false,
			injectGame: true,
			resetFullWindow: true,
			fullWindow: false,
			fullWindowHeader: false,
			fullWindowSide: false,
			fullWindowLock: false,
			fullWindowTimeout: 0,
			darkTheme: false,
			shrinkMenu: 0,
			autoClick: false,
			noGCPopup: false,
			autoGC: false,
			autoLogin: false,
			gcTable: false,
			gcTableCounter: true,
			gcTableRegion: true,
			pillarsXp: '',
			badgeGcCounter: true,
			badgeGcEnergy: true,
			badgeProductions: true,
			badgeProductionsOffset: 0,
			badgeProductionsSound: true,
			badgeProductionsSoundName: 'caravan_done',
			badgeProductionsVolume: 100,
			badgeCaravan: true,
			badgeKitchen: true,
			badgeFoundry: true,
			badgeRepeatables: true,
			badgeRepeatablesOffset: 0,
			badgeRepeatablesSound: true,
			badgeRepeatablesSoundName: 'ui_celebrate',
			badgeRepeatablesVolume: 100,
			badgeLuckyCards: true,
			badgeLuckyCardsOffset: 0,
			badgeLuckyCardsSound: true,
			badgeLuckyCardsSoundName: 'museum_done',
			badgeLuckyCardsVolume: 100,
			badgeServerEnergy: false,
			badgePetShop: true,
			badgePetShopSound: true,
			badgePetShopSoundName: 'ui_buy',
			badgePetShopVolume: 100,
			badgeWindmills: true,
			badgeWindmillsSound: true,
			badgeWindmillsSoundName: 'enter_location',
			badgeWindmillsVolume: 100,
			features: '',
			mapDownloadEvent: 'DAF2_maps/$event/$location',
			mapDownloadRegion: 'DAF2_maps/$region/$god/$location',
			matchByImage: true,
			mapShowRepeatables: true,
			mapSettings: '',
			fbFriendsPage: 0,
			linkGrabEnabled: false,
			linkGrabButton: 2,
			linkGrabKey: 0,
			linkGrabSort: 0,
			linkGrabConvert: 0,
			linkGrabBadge: true,
			linkGrabHotKey: 'G',
			shorten: '',
			rewardsRemoveDays: 7,
			rewardsClose: false,
			rewardsSummary: true,
			rewardsCloseExceptGems: true,
			rewardsCloseExceptErrors: true,
			repeatables: '',
			friendsCollectDate: 0,
			hMain: false,
			hSpeed: false,
			hQueue: false,
			hScroll: false,
			hReward: true,
			hLootCount: true,
			hLootZoom: true,
			hLootFast: false,
			hFood: false,
			hFoodNum: 0,
			hGCCluster: false,
			hFlashAdSound: false,
			hFlashAdSoundName: 'ui_buy',
			hFlashAdVolume: 100,
			hLockCaravan: false,
			hPetFollow: false,
			hPetSpeed: false,
			hInstantCamera: false,
		};
	},
	init: async function () {
		Preferences.values = Preferences.getDefaults();
		return new Promise(function (resolve, _reject) {
			const keysToRemove = [];
			const valuesToSet = Object.assign({}, Preferences.values);
			chrome.storage.local.get(null, function (values) {
				hasRuntimeError('PREF1');
				if ('hElastic' in values && !('hScroll' in values)) values['hScroll'] = values['hElastic'];
				for (const key of Object.keys(values)) {
					if (key in valuesToSet) {
						delete valuesToSet[key];
						Preferences.values[key] = values[key];
					} else {
						keysToRemove.push(key);
					}
				}
				if (keysToRemove.length) chrome.storage.local.remove(keysToRemove);
				if (Object.keys(valuesToSet).length) chrome.storage.local.set(valuesToSet, function () {
					hasRuntimeError('PREF2');
					resolve();
				});
				else resolve();
			});
		}).then(function () {
			// NOTE: old Firefox does not support chrome.storage.local.onChanged.addListener
			chrome.storage.onChanged.addListener(Preferences.onChanged);
		});
	},
	setHandler(action, callback) {
		Preferences.handlers[action] = callback;
	},
	onChanged(changes, area) {
		if (area != 'local') return;
		for (const name in changes)
			if (name in Preferences.values) {
				Preferences.values[name] = changes[name].newValue;
				if (name in Preferences.handlers) {
					try {
						Preferences.handlers[name](Preferences.values[name]);
					} catch (e) { }
				}
			}
	},
	getValue(name) {
		return Preferences.values[name];
	},
	setValue(name, value) {
		Preferences.setValues({
			[name]: value
		});
	},
	setValues(values) {
		if (!values) return;
		const data = {};
		for (const name of Object.keys(values)) {
			if (name in Preferences.values && Preferences.values[name] != values[name]) Preferences.values[name] = data[name] = values[name];
		}
		if (Object.keys(data).length) chrome.storage.local.set(data);
	},
	getValues(names) {
		let result = {};
		if (names) {
			for (const name of [].concat(names)) {
				if (name in Preferences.values) result[name] = Preferences.values[name];
			}
		} else result = Object.assign({}, Preferences.values);
		return result;
	},
};
//#endregion

//#region MESSAGE HANDLING
// eslint-disable-next-line no-var
var Message = {
	handlers: {},
	init() {
		chrome.runtime.onMessage.addListener(Message.onMessage);
	},
	setHandler(action, callback) {
		Message.handlers[action] = callback;
	},
	onMessage(request, sender, sendResponse) {
		if (request && request.action == 'capture') {
			chrome.tabs.captureVisibleTab(function (dataUrl) {
				sendResponse(hasRuntimeError('MESSAGE') ? '' : dataUrl);
			});
			return true;
		}
		if (request && request.action && request.action in Message.handlers) {
			try {
				const response = Message.handlers[request.action](request, sender);
				if (response instanceof Promise) {
					response.then(sendResponse);
					return true;
				}
				if (response !== undefined) sendResponse(response);
			} catch (e) {
				console.error('Message.onMessage', e, request, sender);
			}
		}
	}
};
//#endregion

//#region TAB LISTENER (WEBNAVIGATION)
function executeScriptPromise(tabId, params) {
	const asArray = (value) => value ? (Array.isArray(value) ? value : [value]) : [];
	const files = asArray(params.file), code = asArray(params.code);
	params = Object.assign({}, params);
	const nextFile = () => {
		delete params.file;
		delete params.code;
		if (files.length) params.file = files.shift();
		else if (code.length) params.code = code.shift();
		else return Promise.resolve();
		return new Promise((resolve, reject) => {
			chrome.tabs.executeScript(tabId, params, function () {
				if (chrome.runtime.lastError) {
					console.log(chrome.runtime.lastError);
					reject(chrome.runtime.lastError);
				}
				return nextFile();
			});
		});
	};
	return nextFile();
}

// eslint-disable-next-line no-var
var Tab = {
	gameTabId: null,
	guiTabId: null,
	GUI_URL: chrome.runtime.getURL('gui/gui.html'),
	tabExcluded: {},
	collectTabId: null,
	init() {
		chrome.tabs.onUpdated.addListener(Tab.onUpdated);
		chrome.tabs.onRemoved.addListener(Tab.onRemoved);

		// Add Link Grabber script to Facebook pages
		const fbFilters = {
			url: [
				{ hostEquals: 'www.facebook.com' },
				{ hostEquals: 'm.facebook.com' },
				{ hostEquals: 'mbasic.facebook.com' },
				{ hostEquals: 'web.facebook.com' }
			]
		};
		chrome.webNavigation.onDOMContentLoaded.addListener(Tab.onFBNavigation, fbFilters);

		// Add Reward Link script to Reward pages
		// Note: the same listener can be added only once, so we have to combine the two rules.
		const rewardLinkFilters = {
			url: [{
				hostEquals: 'diggysadventure.com',
				pathEquals: '/miner/wallpost.php'
			}, {
				hostEquals: 'game.diggysadventure.com',
				pathEquals: '/miner/wallpost.php'
			}, {
				hostEquals: 'portal.pixelfederation.com',
				pathEquals: '/_da/miner/wallpost.php'
			}]
		};
		chrome.webNavigation.onDOMContentLoaded.addListener(Tab.onRewardNavigation, rewardLinkFilters);

		return Tab.detectAll();
	},
	onRewardNavigation(details) {
		const params = { file: ['/inject/rewardlink.js'], runAt: 'document_end', allFrames: false, frameId: details.frameId };
		if (Preferences.getValue('rewardsSummary')) params.file.unshift('/js/purify.min.js');
		executeScriptPromise(details.tabId, params);
	},
	onFBNavigation(details) {
		const tabId = details.tabId;
		if (details.frameId == 0 && (Preferences.getValue('linkGrabEnabled') || tabId === Tab.collectTabId) && details.url.indexOf('/dialog/') < 0 && Tab.canBeInjected(tabId)) {
			console.log('Injecting LinkGrabber');
			const code = ['language', 'linkGrabButton', 'linkGrabKey', 'linkGrabSort', 'linkGrabConvert', 'linkGrabEnabled', 'linkGrabBadge', 'linkGrabHotKey', 'shorten'].map(key => {
				return 'options.' + key + '=' + JSON.stringify(Preferences.getValue(key)) + ';';
			}).join('') + 'initialize();';
			const params = {
				file: ['/js/purify.min.js', '/js/Html.js', '/js/Dialog.js', '/inject/collectfriends.js', '/inject/linkgrabber.js'],
				code,
				runAt: 'document_end', allFrames: false, frameId: 0
			};
			executeScriptPromise(tabId, params).then(() => executeScriptPromise(tabId, params));
		}
	},
	onRemoved(tabId, _removeInfo) {
		if (tabId == Tab.guiTabId) Tab.guiTabId = null;
		if (tabId == Tab.gameTabId) Tab.gameTabId = null;
	},
	onUpdated(tabId, changeInfo, tab) {
		if ('url' in changeInfo) Tab.detectTab(tab);
	},
	excludeFromInjection(tabId, flag = true) {
		if (flag) Tab.tabExcluded[tabId] = true;
		else delete Tab.tabExcluded[tabId];
	},
	canBeInjected(tabId) {
		return !(tabId in Tab.tabExcluded) && !(0 in Tab.tabExcluded);
	},
	detectTab(tab) {
		Tab.onRemoved(tab.id);
		const info = Tab.detect(tab.url);
		if (info.isGUI) Tab.guiTabId = tab.id;
		else if (info.isGame) Tab.gameTabId = tab.id;
	},
	detectAll() {
		Tab.guiTabId = Tab.gameTabId = null;
		return new Promise(function (resolve, _reject) {
			chrome.tabs.query({}, function (tabs) {
				tabs.forEach(Tab.detectTab);
				resolve();
			});
		});
	},
	detect(url) {
		const result = {};
		const urlInfo = new UrlInfo(url);
		if (url.indexOf(Tab.GUI_URL) == 0) {
			result.isGUI = true;
		} else if (urlInfo.hostname == 'apps.facebook.com') {
			if (urlInfo.pathname == '/diggysadventure/' || urlInfo.pathname == '/diggysadventure') {
				result.isGame = result.isFacebook = true;
			}
		} else if (urlInfo.hostname == 'portal.pixelfederation.com') {
			const arr = urlInfo.pathname.split('/');
			if (arr[2] == 'diggysadventure' && (!arr[3] || arr[3].startsWith('?') || arr[3].startsWith('#'))) {
				result.isGame = result.isPortal = true;
			}
		}
		return result;
	},
	showTab(kind, url, urlIfExist) {
		chrome.tabs.query({}, function (tabs) {
			const tab = tabs.find(tab => {
				return Tab.detect(tab.url)[kind];
			});
			if (tab) {
				chrome.windows.update(tab.windowId, {
					focused: true
				}, function () {
					const updateProperties = {
						active: true
					};
					if (urlIfExist) updateProperties.url = urlIfExist;
					chrome.tabs.update(tab.id, updateProperties);
				});
			} else {
				chrome.tabs.create({
					url: url,
					active: true
				});
			}
		});
	},
	showGUI() {
		Tab.showTab('isGUI', Tab.GUI_URL, null);
	},
	showGame(options) {
		let values = (options || '') + ' ' + (Data.generator ? Data.generator.game_site + ' ' + Data.generator.game_platform : '');
		values = values.toLowerCase().split(' ');
		const site = values.find(item => item == 'facebook' || item == 'portal');
		const url = (site == 'portal' ? 'https://portal.pixelfederation.com/diggysadventure/' : 'https://apps.facebook.com/diggysadventure/') + '?webgl';
		Tab.showTab('isGame', url, values.includes('keep') ? null : url);
	},
	focus(tabId, flag) {
		if (tabId) chrome.tabs.get(tabId, function (tab) {
			if (tab.windowId) chrome.windows.update(tab.windowId, {
				focused: flag
			});
		});
	},
	open(url, background = false) {
		chrome.tabs.create({
			url: url,
			active: !background
		});
	}
};
//#endregion

//#region DATA / GAME / PLAYER / LOCALIZATION
function Language(id, gameId, name, nameLocal, locales) {
	this.id = id;
	this.gameId = gameId;
	this.name = name;
	this.nameLocal = nameLocal;
	locales = locales.split(',');
	this.preferredLocale = locales[0];
	locales.sort();
	this.locales = locales;
}
// eslint-disable-next-line no-var
var Data = {
	db: null,
	REWARDLINKS_DAILY_LIMIT: 99,
	REWARDLINKS_VALIDITY_DAYS: 7,
	REWARDLINKS_REFRESH_HOURS: 22,
	REWARDLINKS_REMOVE_DAYS: 8,
	REWARDLINKS_HISTORY_MAXITEMS: 10000,
	GC_REFRESH_HOURS: 22,
	languages: [
		new Language('cs', 'CZ', 'Czech', '\u010ce\u0161tina', 'CZ'),
		new Language('da', 'DK', 'Danish', 'Dansk', 'DK'),
		new Language('de', 'DE', 'German', 'Deutsch', 'DE,AT,CH,LI,LU'),
		new Language('el', 'GR', 'Greek', '\u0395\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac' /* 'Ελληνικά' */, 'GR'),
		new Language('en', 'EN', 'English', 'English', 'US,AU,BZ,CA,GB,IE,IN,JM,MY,NZ,PH,SG,TT,ZA,ZW'),
		new Language('es', 'ES', 'Spanish (Castilian)', 'Espa\u00f1ol (Castellano)', 'ES,AR,BO,CL,CO,CR,DO,EC,GT,HN,MX,NI,PA,PE,PR,PY,SV,US,UY,VE'),
		new Language('fr', 'FR', 'French', 'Fran\u00e7ais', 'FR,BE,CA,CH,LU,MC'),
		new Language('hu', 'HU', 'Hungarian', 'Magyar', 'HU'),
		new Language('it', 'IT', 'Italian', 'Italiano', 'IT,CH'),
		new Language('nl', 'NL', 'Dutch ', 'Nederlands', 'NL,BE'),
		new Language('pl', 'PL', 'Polish', 'Polski', 'PL'),
		new Language('pt', 'PT', 'Portuguese (BR)', 'Portugu\u00eas (BR)', 'PT,BR'),
		new Language('ru', 'RU', 'Russian', '\u0420\u0443\u0441\u0441\u043a\u0438\u0439', 'RU,MD,UA'),
		new Language('sk', 'SK', 'Slovak', 'Sloven\u010dina', 'SK'),
		new Language('tr', 'TR', 'Turkish', 'T\u00fcrk\u00e7e', 'TR'),
		new Language('zh', 'ZH', 'Chinese', '中文', 'ZH'),
		// OTHER (GAME)
		new Language('bg', 'BG', 'Bulgarian', '\u0431\u044a\u043b\u0433\u0430\u0440\u0441\u043a\u0438' /* 'български' */, 'BG'),
		new Language('fi', 'FI', 'Finnish', 'Suomi', 'FI'),
		new Language('ro', 'RO', 'Romanian', 'Rom\u00e2n\u0103', 'RO,MD'),
		new Language('se', 'SE', 'Swedish', 'Svenska', 'SE,FI'),
	],
	guiLanguages: 'cs,da,de,el,en,es,fr,hu,it,nl,pl,pt,ru,sk,tr,zh'.split(','),
	acceptedLanguages: [],
	detectLanguage(lang) {
		return [].concat(lang, Data.acceptedLanguages)
			.map(id => {
				const match = String(id || '').match(/([a-z]+)[^a-z]?/i);
				return match ? match[1].toLowerCase() : '';
			}).find(id => Data.guiLanguages.includes(id)) || 'en';
	},
	setGenerator(generator) {
		generator = generator || {};
		// generator.versionParameter = generator.to_version ? '?ver=' + generator.to_version : '';
		generator.versionParameter = '';
		Data.generator = generator;
		Data.checkUser();
	},
	setTeam(team) {
		const playerId = team && team.me && team.me.player_id;
		const modified = playerId && Data.generator && playerId == Data.generator.player_id && JSON.stringify(Data.team) !== JSON.stringify(team);
		if (modified) Data.team = team;
		return modified;
	},
	init: async function () {
		await new Promise(function (resolve, _reject) {
			chrome.i18n.getAcceptLanguages(items => {
				if (!hasRuntimeError('DATA.INIT')) Data.acceptedLanguages = items;
				resolve();
			});
		});
		Data.db = await idb.open('DAF', 1, function (db) {
			switch (db.oldVersion) {
				case 0:
					db.createObjectStore('Files', {
						keyPath: 'id'
					});
					db.createObjectStore('Neighbours', {
						keyPath: 'id'
					});
					db.createObjectStore('Friends', {
						keyPath: 'id'
					});
					db.createObjectStore('RewardLinks', {
						keyPath: 'id'
					});
			}
		});
		const tx = Data.db.transaction(['Files', 'Neighbours', 'Friends', 'RewardLinks'], 'readonly');
		/*
		tx.objectStore('Files').iterateCursor(cursor => {
			if (!cursor) return;
			Data.storeGame(cursor.value);
			cursor.continue();
		});
		*/
		const admins = ',45380,93887,126394,160666,160699,272209,274394,300786,330575,341206,432156,583351,724532,1364119,1383237,2585017,\
2629798,2892099,2951695,3094381,3249234,3280114,3341311,3386911,3450569,3588711,3612676,3717410,3727387,3741439,3780544,3836341,3970499,\
4010790,4039296,4096091,4103286,4135364,4193131,4348337,4348743,4381557,4485902,4705505,4784487,4917095,4979156,5009209,5176586,5257073,\
5594921,5703231,5895942,6180698,6211963,6226998,6307883,6715455,6849088,7554792,9944465,10347656,10484489,10609447,10887338,11530133,14220776,\
15545185,16570740,17362365,18096732,19229879,19728318,20653338,20904021,21378282,24440023,29543778,30529001,33175578,34604764,35108410,\
38554475,41201728,42636008,43019564,44304045,46411248,';
		const p = v => parseInt(v, 36), has = n => !!String(Preferences.values.features).split(/\W/).find(v => p(v) == n);
		let isAdmin = false, isMapper = false, isSuper = false;
		Object.defineProperties(Data, {
			checkUser: {
				value() {
					const id = +(Data.generator && Data.generator.player_id) || -1;
					isAdmin = admins.indexOf(`,${id},`) >= 0 || has(id ^ p('admin'));
					isMapper = ',5703231,10484489,10609447,11530133,17362365,48599461,'.indexOf(`,${id},`) >= 0 || has(id ^ p('mapper'));
					isSuper = ',10484489,10609447,11530133,48599461,'.indexOf(`,${id},`) >= 0 || has(id ^ p('super'));
				}
			},
			isAdmin: { get() { return isAdmin; } },
			isMapper: { get() { return isMapper; } },
			isSuper: { get() { return isSuper; } },
		});
		Data.initCollections();
		Data.setGenerator();
		Data.files = {};
		Data.neighbours = {};
		Data.friends = {};
		Data.rewardLinks = {};
		Data.rewardLinksData = {
			id: 'data',
			first: 0,
			next: 0,
			count: 0,
			expired: 0
		};
		Data.rewardLinksHistory = [];
		Data.rewardLinksRecent = {}; // stored in-memory only
		Data.localization = {};
		Data.localization.cache = {};
		Data.friendsCollectDate = parseInt(Preferences.getValue('friendsCollectDate')) || 0;
		Data.repeatables = {};
		Data.pillars = {};
		Data.loc_prog = {};
		Data.team = null;
		tx.objectStore('Files').getAll().then(values => {
			const mineCache = Data.mineCache = {};
			let team = null;
			const handlers = {
				generator: (file) => Data.setGenerator(file.data),
				regions: (file) => Data.initRegions(file.data),
				team: (file) => team = file.data,
				localization: (file) => Data.storeLocalization(file),
				gcInfo: (_file) => Data.removegcInfo(),
				repeatables: (file) => Data.repeatables = file.data || {},
				expByMaterial: (file) => Data.pillars.expByMaterial = file.data,
				loc_prog: (file) => Data.loc_prog = file.data,
			};
			for (const file of values) {
				if (file.id in handlers) handlers[file.id](file);
				else if (file.id.startsWith('mine_')) {
					const { id: lid, level_id: fid } = file.data;
					mineCache[lid] = mineCache[lid] || {};
					mineCache[lid][fid] = file.data;
				}
			}
			Data.setTeam(team);
		});
		tx.objectStore('Neighbours').getAll().then(values => {
			for (const pal of values) {
				Data.convertNeighbourExtra(pal.extra);
				Data.neighbours[pal.id] = pal;
			}
		});
		tx.objectStore('Friends').getAll().then(values => {
			for (const friend of values) {
				// Convert object to smaller format
				delete friend.processed;
				friend.tc = friend.tc || friend.timeCreated;
				delete friend.timeCreated;
				Data.friends[friend.id] = friend;
			}
		});
		tx.objectStore('RewardLinks').getAll().then(values => {
			for (const rewardLink of values) {
				if (rewardLink.id == 'data') Data.rewardLinksData = rewardLink;
				else if (rewardLink.id == 'history') Data.rewardLinksHistory = rewardLink.history;
				else Data.rewardLinks[rewardLink.id] = rewardLink;
			}
		});
		await tx.complete;
		Data.removeExpiredRewardLinks();
		await new Promise(function (resolve, _reject) {
			chrome.management.getSelf(function (self) {
				Data.isDevelopment = self.installType == 'development';
				Data.version = self.version;
				resolve();
			});
		});
	},
	initCollections() {
		let col;

		function setItem(def_id, name_loc, mobile_asset) {
			if (!name_loc) return;
			const item = {};
			item.def_id = def_id;
			item.name_loc = name_loc;
			if (mobile_asset) item.mobile_asset = mobile_asset;
			col[item.def_id] = item;
		}

		// Skins
		col = {};
		'MAP005,MAP006,CT002,CT013,MAP018,CT012,CT011,MAP021,MAP038,CT014,CT013,CT016,MAP039,,MAP050'.split(',').forEach(function (name_loc, index) {
			setItem(index + 1, name_loc, '/img/skins/' + (index + 1) + '.png');
		});
		Data.colSkins = col;

		Data.region2Skin = [1, 2, 5, 8, 9, 13, 15];

		// Regions
		col = {};
		for (let region = Data.getMaxRegion(); region >= 1; region--) col[region] = Data.colSkins[Data.getSkinFromRegion(region)];
		col[0] = { def_id: 0, name_loc: 'GUI3619' };
		col[99] = { def_id: 99, name_loc: 'GUI4081', mobile_asset: 'region_99' };
		Data.colRegions = col;

		// Addon Buildings
		col = {};
		',,ABNA001,ABNA002,,ABNA004,ABNA005,,,,ABNA009'.split(',').forEach(function (name_loc, index) {
			setItem(index + 1, name_loc);
		});
		Data.colAddonBuildings = col;

		// Event pass xp
		col = {};
		setItem(1, 'GUI3165', 'loot_event_pass_xp_drop_1');
		Data.colEventpassXp = col;

		// Systems
		col = {};
		'GUI0064,GUI0065'.split(',').forEach(function (name_loc, index) {
			setItem(index + 1, name_loc, index == 0 ? 'loot_exp_webgl' : 'loot_energy');
		});
		Data.colSystems = col;
	},
	initRegions(data) {
		Object.values(data).forEach(item => {
			const { name_loc, icon_mobile_asset: mobile_asset } = item;
			const rid = +item.region_id;
			const skinId = +item.skin_id;
			if (!rid) return;
			Data.colRegions[rid] = { def_id: rid, name_loc, mobile_asset };
			Data.colSkins[skinId] = { def_id: skinId, name_loc, mobile_asset };
			Data.region2Skin[rid - 1] = skinId;
		});
	},
	showDBSize() {
		let db;
		const storesizes = [];

		function openDatabase() {
			return new Promise(function (resolve, _reject) {
				const dbname = 'DAF';
				const request = window.indexedDB.open(dbname);
				request.onsuccess = function (event) {
					db = event.target.result;
					resolve(db.objectStoreNames);
				};
			});
		}

		function getObjectStoreData(storename) {
			return new Promise(function (resolve, reject) {
				const trans = db.transaction(storename, IDBTransaction.READ_ONLY);
				const store = trans.objectStore(storename);
				const items = [];
				trans.oncomplete = function (_evt) {
					const szBytes = toSize(items);
					const szMBytes = (szBytes / 1024 / 1024).toFixed(2);
					storesizes.push({
						'Store Name': storename,
						'Items': items.length,
						'Size': szMBytes + 'MB (' + szBytes + ' bytes)'
					});
					resolve();
				};
				const cursorRequest = store.openCursor();
				cursorRequest.onerror = function (error) {
					reject(error);
				};
				cursorRequest.onsuccess = function (evt) {
					const cursor = evt.target.result;
					if (cursor) {
						items.push(cursor.value);
						cursor.continue();
					}
				};
			});
		}

		function toSize(items) {
			let size = 0;
			for (let i = 0; i < items.length; i++) {
				const objectSize = JSON.stringify(items[i]).length;
				size += objectSize * 2;
			}
			return size;
		}

		openDatabase().then(function (stores) {
			const PromiseArray = [];
			for (let i = 0; i < stores.length; i++) {
				PromiseArray.push(getObjectStoreData(stores[i]));
			}
			Promise.all(PromiseArray).then(function () {
				console.table(storesizes);
			});
		});
	},
	storeSimple(id, data) {
		const file = {};
		file.id = id;
		file.time = getUnixTime();
		file.data = data;
		Data.store(file);
	},
	store(file) {
		// console.log('Would store', file);
		if (!file.data) return;
		let tx;
		if (file.id == 'generator') {
			tx = Data.db.transaction(['Files', 'Neighbours'], 'readwrite');
			const neighbours = file.data.neighbours;
			delete file.data.neighbours;
			// Process un_gifts
			const un_gifts = file.data.un_gifts;
			Synchronize.processUnGift(un_gifts && un_gifts.item, +file.data.time, neighbours, file.data.f_actions);
			delete file.data.un_gifts;
			// Remove the player itself from the neighbors, but store their fb_id
			const pal = neighbours[file.data.player_id];
			file.data.fb_id = pal ? pal.fb_id : Data.generator && Data.generator.fb_id;
			delete neighbours[file.data.player_id];
			Data.neighbours = neighbours;
			Data.setGenerator(file.data);
			Data.loc_prog = {};
			const store = tx.objectStore('Neighbours');
			// We don't need to wait for the operation to be completed
			store.clear().then(() => store.bulkPut(Object.values(neighbours)));
			tx.objectStore('Files').put(file).then(() => {
				Data.checkLocalization('', file.data.game_language);
				Tab.detectAll().then(() => {
					Synchronize.signal('generator');
					Synchronize.signal('cdn_root', { cdn_root: file.data.cdn_root });
					Data.checkRepeatablesStatus();
					Data.checkLuckyCards();
					Data.checkProductions();
					Data.checkPetShop();
				});
			});
			// Reset some values and pre-load childs
			Synchronize.energyId = 0;
			Synchronize.repeatables = '';
			Data.getFile('childs');
			Data.getFile('productions');
			Data.getFile('special_weeks');
			Data.getFile('video_ads');
			Data.getFile('regions').then(data => {
				Data.store({ id: 'regions', data });
				Data.initRegions(data);
			});
		} else {
			if (file.id == 'localization') Data.storeLocalization(file);
			tx = Data.db.transaction('Files', 'readwrite');
			tx.objectStore('Files').put(file);
		}
		return tx.complete;
	},
	getLanguageIdFromUrl(url) {
		const match = url && url.match(/\/([A-Z][A-Z])\/localization\./);
		return match && match[1];
	},
	requiresFullLanguage: false,
	async checkLocalization(url, lang) {
		const changes = Data.generator && Data.generator.file_changes;
		if (!changes) return;
		let gameLanguage, version, find;
		if (+Data.generator.crowdin) {
			const hashUrl = Data.generator.cdn_root + 'localization_crowdin/hash_file.csv'  + '?ver=' + Data.generator.time;
			const response = await fetch(hashUrl);
			const text = await response.text();
			const lines = text.split('\n');
			find = (lang) => {
				const line = lines.find(s => s.substring(0, 2) == lang);
				if (line) {
					gameLanguage = lang;
					version = line.split(',')[1];
					url = Data.generator.cdn_root + 'localization_crowdin/' + gameLanguage.toUpperCase() + '/localization.csv?ver=' + version;
					return gameLanguage;
				}
			}
			find(Preferences.getValue('gameLanguage')) || find(Data.getLanguageIdFromUrl(url)) || find(lang) || find('EN');
		}
		if (!version) {
			const keys = Object.keys(changes).filter(key => key.endsWith('localization.csv'));
			find = (lang) => {
				const key = keys.find(key => Data.getLanguageIdFromUrl(key) == lang);
				if (key) {
					gameLanguage = lang;
					version = changes[key];
					url = Data.generator.cdn_root + key + '?ver=' + version;
					return gameLanguage;
				}
			};
			find(Preferences.getValue('gameLanguage')) || find(Data.getLanguageIdFromUrl(url)) || find(lang) || find('EN');
		}
		if (!version) return;
		const file = { id: 'localization', url, version, revision: Parser.parse_localization_revision, time: getUnixTime() };
		const id1 = [Data.localization.languageId, Data.localization.version, Data.localization.revision].join(',');
		const id2 = [gameLanguage, file.version, file.revision].join(',');
		if (id1 != id2 || (Data.requiresFullLanguage && Data.localization.data && !Data.localization.data.isFull)) {
			const response = await fetch(file.url);
			const text = await response.text();
			Parser.requiresFullLanguage = Data.requiresFullLanguage;
			file.data = Parser.parse(file.id, text);
			Data.store(file);
		}
	},
	storeLocalization(file) {
		if (file && file.data) {
			Data.localization = {
				data: file.data,
				cache: {},
				languageId: Data.getLanguageIdFromUrl(file.url),
				version: file.version,
				revision: file.revision
			};
			if (Preferences.getValue('gameLanguage') != Data.localization.languageId) {
				Preferences.setValue('gameLanguage', Data.localization.languageId);
			}
		}
	},
	getCampWindmillTime(camp) {
		let wmtime = 0;
		const wmduration = 7 * SECONDS_IN_A_DAY;
		if (camp && Array.isArray(camp.windmills) && camp.windmills.length >= +camp.windmill_limit) {
			// Take for each windmill the expiry date, then sort ascending
			const windmills = camp.windmills.map(wm => (wmduration + (+wm.activated)) || 0).sort();
			// If there are windmills in excess, considers only the first of the last "mindmill_limit" windmills
			wmtime = windmills[windmills.length - camp.windmill_limit];
		}
		return wmtime;
	},
	getRepeatables() {
		// Collect all repeatables in the game
		// Make sure that all files are loaded, before calling this method
		const events = Data.files.events;
		const repeatables = {};
		for (let rid = Data.getMaxRegion(); rid >= 0; rid--) {
			const locations = Data.files['locations_' + rid];
			if (!locations) return {};
			for (const loc of Object.values(locations)) {
				if (+loc.test || +loc.reset_cd <= 0 || ![].concat(loc.rotation).length) continue;
				// Additional checks
				if (+loc.req_quest_a == 1) continue;
				const eid = +loc.event_id || 0;
				const item = { id: +loc.def_id, cooldown: +loc.reset_cd, name: loc.name_loc, rid, image: loc.mobile_asset, rotation: {} };
				if (eid) {
					const event = events[eid];
					if (!event) continue;
					if ((',' + event.locations + ',' + event.extended_locations + ',').indexOf(',' + loc.def_id + ',') < 0) continue;
					item.eid = eid;
					item.ename = event.name_loc;
				}
				repeatables[item.id] = item;
				for (const rot of loc.rotation) {
					const copy = { level: +rot.level, progress: +rot.progress, chance: +rot.chance };
					item.rotation[copy.level] = copy;
				}
			}
		}
		// If something is changed, store the new value
		if (JSON.stringify(Data.repeatables) !== JSON.stringify(repeatables)) Data.storeSimple('repeatables', repeatables);
		Data.repeatables = repeatables;
		return repeatables;
	},
	timers: {},
	setTimer(fn, timeout) {
		const key = fn.name;
		const data = Data.timers[key] = Data.timers[key] || {};
		if (data.handle) clearTimeout(data.handle);
		delete data.handle;
		if (timeout > 0) {
			data.handle = setTimeout(() => { delete data.handle; fn(); }, timeout);
			data.nextTime = Date.now() + timeout;
		}
	},
	checkRepeatablesStatus() {
		const now = getUnixTime() + Synchronize.offset;
		const generator = Data.generator;
		const offset = parseInt(Preferences.getValue('badgeRepeatablesOffset'), 10) || 0;
		let time = +Infinity;
		const list = [];
		if (generator) String(Preferences.getValue('repeatables') || '').split(',').forEach(lid => {
			const rep = Data.repeatables[lid];
			if (!rep) return;
			const eid = rep.eid;
			if (eid > 0 && eid in generator.events && +generator.events[eid].finished <= now) return;
			const prog = Data.loc_prog[lid] || generator.loc_prog && generator.loc_prog[lid];
			if (!prog) return;
			const end = (+prog.cmpl || 0) + rep.cooldown - offset;
			if (end <= now) {
				const rep = Data.repeatables[lid];
				list.push({
					lid, rid: rep.rid, rname: rep.rid ? Data.getObjectName('region', rep.rid) : Data.getString(rep.ename),
					name: Data.getString(rep.name).replace(/\n/g, ' '), image: `${generator.cdn_root}mobile/graphics/map/${rep.image}.png`
				});
				return;
			}
			if (end < time) time = end;
		});
		Data.setTimer(Data.checkRepeatablesStatus, isFinite(time) ? (time - now) * 1000 : 0);
		Synchronize.signalRepeatables(list);
	},
	getLuckyCardsAd(setValue) {
		let ad = null;
		const generator = Data.generator;
		if (generator) {
			let video_ad = generator.video_ad;
			if (!video_ad) video_ad = generator.video_ad = {};
			let item = video_ad.item;
			if (!Array.isArray(item)) item = video_ad.item = [];
			ad = item.find(ad => ad.type == ADTYPE_LUCKYCARDS);
			if (!ad) item.push(ad = { type: ADTYPE_LUCKYCARDS });
			ad.watched_at = setValue || +ad.watched_at || 0;
		}
		return ad;
	},
	getVideoAd(type) {
		const videoads = Data.files.video_ads;
		return (videoads ? Object.values(videoads) : []).find(item => item.type == type);
	},
	getLuckyCardsVideoAd() {
		return this.getVideoAd(ADTYPE_LUCKYCARDS);
	},
	checkLuckyCards() {
		const ad = Data.getLuckyCardsAd();
		const videoad = Data.getLuckyCardsVideoAd();
		const offset = parseInt(Preferences.getValue('badgeLuckyCardsOffset'), 10) || 0;
		const now = getUnixTime() + offset;
		const cooldown = (videoad ? +videoad.daily_limit_cooldown || +videoad.cooldown_seconds : 0) || 8 * 3600;
		const next = ad ? cooldown + ad.watched_at - Synchronize.offset : 0;
		const diff = next - now;
		const active = diff <= 0;
		Data.setTimer(Data.checkLuckyCards, diff > 0 ? diff * 1000 : 0);
		Synchronize.signal('luckycards', Synchronize.expandDataWithSound({ active, next }, 'badgeLuckyCards'));
	},
	checkPetShop() {
		const now = getUnixTime();
		const cooldown = 147600; // Hack
		let next = 0;
		const market = asArray(Data.generator?.market).find(market => {
			const last = +market.last_refreshed_at || now;
			const starts = last + cooldown;
			if (!next || starts < next) next = starts;
			return starts <= now;
		});
		const diff = next - now;
		Data.setTimer(Data.checkPetShop, diff > 0 ? diff * 1000 : 0);
		Synchronize.signal('petshop', Synchronize.expandDataWithSound({ active: !!market }, 'badgePetShop'));
	},
	checkProductions() {
		const now = getUnixTime() + Synchronize.offset;
		let next = now + SECONDS_IN_A_DAY * 1000;
		const data = {};
		const expandData = (type, arr) => {
			const finishName = type == 'caravan' ? 'arrival' : 'finish';
			const sub = data[type] = { num: 0 };
			asArray(arr).forEach(o => {
				const time = +o[finishName];
				if (time <= now) sub.num++;
				if (time > now && time < next) next = time;
			});
		};
		expandData('caravan', Data.generator.caravans);
		expandData('kitchen', Data.generator.pots);
		expandData('foundry', Data.generator.anvils);
		const diff = next - now;
		Data.setTimer(Data.checkProductions, diff > 0 ? diff * 1000 : 0);
		Synchronize.signal('productions', Synchronize.expandDataWithSound(data, 'badgeProductions'));
	},
	getPillarsInfo() {
		// Collect all pillars in the game and compute XP by material
		// Make sure that all files are loaded, before calling this method
		const time = (Data.generator && Data.generator.time) || 0;
		if (time != Data.pillars.time) {
			// New logic using heuristic
			const expByMaterial = {};
			const sales = Object.values(Data.files['sales']).filter(sale => {
				// Must be a sale for decoration, non hidden, non-event with only one requirements
				if (sale.type != 'decoration' || +sale.hide != 0 || +sale.event_id != 0 || sale.requirements.length != 1) return false;
				const materialId = +sale.requirements[0].material_id;
				// Gem requirement is skipped
				if (materialId == 2) return false;
				// Use only the coin pillars (exclude Abu Simbel, etc)
				if (materialId == 1 && ![867, 1177].includes(+sale.object_id)) return false;
				// At least 100000 xp
				if (+sale.exp < 100000) return false;
				// Calculate experience for one unit of material
				const exp = +sale.exp / +sale.requirements[0].amount;
				// Store the biggest XP return
				expByMaterial[materialId] = Math.max(exp, expByMaterial[materialId] || 0);
				return true;
			}).map(sale => +sale.def_id);
			// sort descending by id (newer first)
			sales.sort((a, b) => a - b);
			// Using caravan information
			const caravans = {};
			(Object.values(Data.files['productions'] || {})).forEach(p => {
				if (p.type != 'destination') return;
				const cargo = asArray(p.cargo)[0];
				if (!cargo || cargo.type != 'system' || cargo.object_id != 1) return;
				let materialId = 0, amount = 0, hasTicket = false;
				asArray(p.requirements).forEach(r => {
					const id = +r.material_id;
					if (id == 347) { hasTicket = true; return; }
					amount = +r.amount;
					materialId = materialId ? -1 : id;
				});
				if (materialId > 0 && amount > 0) {
					const xp = Math.floor((+cargo.min + +cargo.max) / 2);
					const xpByUnit = Math.floor(xp / amount);
					const previous = caravans[materialId];
					if (!previous || previous.xpByUnit < xpByUnit || (previous.xpByUnit == xpByUnit && previous.xp < xp)) {
						caravans[materialId] = { xp, xpByUnit, amount, hasTicket };
					}
					if (materialId != 1) {
						const exp = Math.floor(xp / amount / (hasTicket ? 1.5 : 1));
						expByMaterial[materialId] = Math.max(exp, expByMaterial[materialId] || 0);
					}
				}
			});
			if (JSON.stringify(Data.pillars.expByMaterial) !== JSON.stringify(expByMaterial)) Data.storeSimple('expByMaterial', expByMaterial);
			Object.assign(Data.pillars, { time, expByMaterial, sales, caravans });
		}
		return Data.pillars;
	},
	//#region loc_prog
	getLocProg(lid) {
		let prog = Data.loc_prog[lid];
		if (!prog) {
			prog = { id: lid, prog: 0 };
			prog = Object.assign(prog, Data.generator && Data.generator.loc_prog && Data.generator.loc_prog[lid]);
			Data.loc_prog[lid] = prog;
		}
		return prog;
	},
	storeLocProgDelayed() {
		Data.storeSimple('loc_prog', Data.loc_prog);
	},
	storeLocProg() {
		Data.setTimer(Data.storeLocProgDelayed, 5000);
	},
	//#endregion
	//#region Neighbors
	getNeighbour(id) {
		return Data.neighbours[id];
	},
	getNeighbours() {
		return Data.neighbours;
	},
	saveNeighbourList: {},
	saveNeighbourDelayed() {
		const tx = Data.db.transaction('Neighbours', 'readwrite');
		tx.objectStore('Neighbours').bulkPut(Object.values(Data.saveNeighbourList));
		Data.saveNeighbourList = {};
	},
	saveNeighbour(neighbour) {
		if (!neighbour) return;
		const neighbours = [].concat(neighbour);
		if (!neighbours.length) return;
		Data.setTimer(Data.saveNeighbourDelayed, 500);
		neighbours.forEach(neighbour => Data.saveNeighbourList[neighbour.id] = neighbour);
	},
	convertNeighbourExtra(extra) {
		if (!extra) return;
		// Convert gifts to new compact format
		if (extra.gifts) {
			extra.g = extra.gifts.map(g => [g.id, g.gid, g.time]);
			delete extra.gifts;
		}
	},
	removegcInfo() {
		const tx = Data.db.transaction('Files', 'readwrite');
		tx.objectStore('Files').delete('gcInfo');
	},
	getGCInfo() {
		const data = {};
		const neighbours = Object.values(Data.neighbours);
		const realNeighbours = neighbours.length - 1;
		data.count = neighbours.filter(n => n.spawned).length;
		data.max = Math.min(realNeighbours, Math.floor(Math.sqrt(realNeighbours)) + 3) + 1;
		const pal = Data.neighbours[1];
		if (pal && pal.spawn_time) {
			const time = pal.spawn_time + Data.GC_REFRESH_HOURS * 3600;
			if (time > getUnixTime()) {
				data.next = time;
				data.nexttxt = getMessage('rewardlinks_nexttime', Locale.formatDateTime(time));
			}
		}
		return data;
	},
	//#endregion
	//#region Friends
	getFriend(id) {
		return Data.friends[id];
	},
	getFriends() {
		return Data.friends;
	},
	saveFriendList: {},
	removeFriendList: {},
	saveFriendDelayed() {
		const tx = Data.db.transaction('Friends', 'readwrite');
		const store = tx.objectStore('Friends');
		const items = Object.values(Data.saveFriendList);
		if (items.length) store.bulkPut(items);
		Data.saveFriendList = {};
		for (const item of Object.values(Data.removeFriendList)) store.delete(item.id);
		Data.removeFriendList = {};
	},
	saveFriend(friend, remove = false) {
		if (!friend) return;
		const friends = [].concat(friend);
		if (!friends.length) return;
		Data.setTimer(Data.saveFriendDelayed, 500);
		for (const f of friends) {
			if (remove) {
				Data.removeFriendList[f.id] = f;
				delete Data.saveFriendList[f.id];
				delete Data.friends[f.id];
			} else {
				Data.saveFriendList[f.id] = f;
				delete Data.removeFriendList[f.id];
				Data.friends[f.id] = f;
			}
		}
	},
	removeFriend(friend) {
		Data.saveFriend(friend, true);
	},
	friendsCaptured(data, partial, forceAnalyze) {
		if (!data) return;
		const newFriends = [].concat(data);
		if (newFriends.length == 0) return;
		const oldFriendsById = Object.assign({}, Data.getFriends());
		const oldFriendsByUri = {};
		const numBefore = Object.values(oldFriendsById).length;
		// We allow at most a loss of 5% of the current friends (or 10 if the player has less than 200 friends)
		const maxRemove = Math.max(10, Math.floor(numBefore * 0.05));
		Object.values(oldFriendsById).forEach(friend => oldFriendsByUri[friend.uri] = friend);
		const friends = {};
		const now = getUnixTime();
		// Determine if there is a common prefix for all names (must have at least 10 friends), so we can remove it
		let prefixLen = 0;
		while (newFriends.length >= 10) {
			prefixLen++;
			const prefix = newFriends[0].name.substr(0, prefixLen);
			const friend = newFriends.find(friend => friend.name.substr(0, prefixLen) !== prefix);
			if (friend) { prefixLen--; break; }
		}
		// We retain the old association (score and uid)
		for (const friend of newFriends) {
			if (prefixLen) friend.name = friend.name.substr(prefixLen);
			friend.tc = friend.lc = now;
			let oldFriend = oldFriendsById[friend.id];
			if (oldFriend) {
				delete oldFriendsById[oldFriend.id];
			} else {
				oldFriend = oldFriendsByUri[friend.uri];
			}
			if (oldFriend) {
				if (oldFriend.score) friend.score = oldFriend.score;
				if (oldFriend.uid) friend.uid = oldFriend.uid;
				if (oldFriend.tc) friend.tc = oldFriend.tc;
				if (oldFriend.note) friend.note = oldFriend.note;
				delete oldFriendsByUri[oldFriend.uri];
			}
			delete oldFriendsByUri[friend.uri];
			friends[friend.id] = friend;
		}
		if (partial || Object.values(oldFriendsById).length > maxRemove) {
			Data.saveFriend(Object.values(friends));
			Object.entries(oldFriendsById).forEach(([id, friend]) => friends[id] = friend);
		} else {
			// We remove all old friends
			Data.removeFriend(Object.values(oldFriendsById));
			Data.saveFriend(Object.values(friends));
		}
		Data.friends = friends;
		Data.friendsCollectDate = now;
		Preferences.setValue('friendsCollectDate', now);
		if (!partial || forceAnalyze) chrome.runtime.sendMessage({ action: 'friends_analyze' }, () => hasRuntimeError('FRIENDSCAPTURED'));
	},
	//#endregion
	//#region RewardLinks
	getRewardLink(id) {
		return Data.rewardLinks[id];
	},
	getRewardLinks() {
		return Data.rewardLinks;
	},
	saveRewardLinkList: {},
	removeRewardLinkList: {},
	saveRewardLinksHistory: false,
	saveRewardLinkDelayed() {
		const tx = Data.db.transaction('RewardLinks', 'readwrite');
		const store = tx.objectStore('RewardLinks');
		if (Data.saveRewardLinksHistory) {
			Data.saveRewardLinksHistory = false;
			if (Data.rewardLinksHistory.length > Data.REWARDLINKS_HISTORY_MAXITEMS) Data.rewardLinksHistory = Data.rewardLinksHistory.slice(-Data.REWARDLINKS_HISTORY_MAXITEMS);
			const item = {
				id: 'history',
				history: Data.rewardLinksHistory
			};
			Data.saveRewardLinkList[item.id] = item;
		}
		const items = Object.values(Data.saveRewardLinkList);
		if (items.length) store.bulkPut(items);
		Data.saveRewardLinkList = {};
		for (const item of Object.values(Data.removeRewardLinkList)) store.delete(item.id);
		Data.removeRewardLinkList = {};
	},
	saveRewardLink(rewardLink, remove = false) {
		if (!rewardLink) return;
		const rewardLinks = [].concat(rewardLink);
		if (!rewardLink.length) return;
		Data.setTimer(Data.saveRewardLinkDelayed, 500);
		for (const rl of rewardLinks) {
			if (remove) {
				const id = +rl.id;
				Data.removeRewardLinkList[rl.id] = rl;
				delete Data.saveRewardLinkList[id];
				delete Data.rewardLinks[id];
				if (!Data.rewardLinksHistory.includes(id)) {
					Data.rewardLinksHistory.push(id);
					Data.saveRewardLinksHistory = true;
				}
			} else {
				Data.saveRewardLinkList[rl.id] = rl;
				delete Data.removeRewardLinkList[rl.id];
				if (isFinite(+rl.id)) Data.rewardLinks[rl.id] = rl;
			}
		}
	},
	removeRewardLink(rewardLink) {
		Data.saveRewardLink(rewardLink, true);
	},
	removeExpiredRewardLinks() {
		const rewards = Object.values(Data.rewardLinks);
		// check expired
		let maxExpired = 0;
		let threshold = getUnixTime() - Data.REWARDLINKS_VALIDITY_DAYS * SECONDS_IN_A_DAY;
		for (const reward of rewards) {
			if (reward.adt <= threshold || reward.cmt == -1) maxExpired = Math.max(maxExpired, +reward.id);
		}
		if (maxExpired > Data.rewardLinksData.expired) {
			// this reward is expired and its id is greater than the last recorded one -> store it
			Data.rewardLinksData.expired = maxExpired;
			Data.saveRewardLink(Data.rewardLinksData);
		}
		// remove old links
		threshold = getUnixTime() - Data.REWARDLINKS_REMOVE_DAYS * SECONDS_IN_A_DAY;
		const rewardsToRemove = rewards.filter(reward => reward.adt <= threshold);
		Data.removeRewardLink(rewardsToRemove);
	},
	addRewardLinks(rewardsOrArray) {
		const arr = [].concat(rewardsOrArray);
		const now = getUnixTime();
		const rewardLinksData = Data.rewardLinksData;
		const rewardLinksHistory = Data.rewardLinksHistory;
		const rewardLinksRecent = Data.rewardLinksRecent;
		const removeThreshold = now - 3600;
		const data = {};
		let flagStoreData = false;
		let flagRefresh = false;
		// remove old "Recent" rewards older than one hour
		for (const id in Object.keys(rewardLinksRecent)) {
			if (rewardLinksRecent[id] < removeThreshold) delete rewardLinksRecent[id];
		}
		const expiredId = Data.rewardLinksData.expired || 0;
		const neighbours = Object.values(Data.neighbours || {});
		for (const reward of arr) {
			if (!reward || !reward.id) return;
			// do not process old links, except when collection was successful
			if (!rewardLinksHistory.includes(+reward.id) || reward.cmt > 0) {
				rewardLinksRecent[reward.id] = now;
				flagRefresh = true;
				let existingReward = Data.getRewardLink(reward.id);
				// store initial time of collection
				if (reward.cdt && reward.cmt > 0 && !rewardLinksData.first) {
					rewardLinksData.first = reward.cdt;
					flagStoreData = true;
				}
				// Find name (if possible)
				if (!reward.cnm && reward.cid && (!existingReward || !existingReward.cnm)) {
					const id = reward.cid;
					const pal = id && neighbours.find(pal => pal.fb_id === id || pal.fb_id2 === id);
					if (pal) {
						if (pal.name) reward.cnm = pal.name + ' ' + pal.surname;
						else if (pal.extra.fn) reward.cnm = pal.extra.fn;
					}
				}
				// We will add the reward if any one of these conditions is true:
				// - reward has a material, meaning it has been correctly collected
				// - existing reward does not exist
				// - reward has some info that is missing in then existing reward (collect date, user id, user name)
				if (!existingReward || reward.cmt > 0 ||
					(reward.cmt && !existingReward.cmt) ||
					(reward.cdt && !existingReward.cdt) ||
					(reward.cid && !existingReward.cid) ||
					(reward.cnm && !existingReward.cnm)) {
					existingReward = existingReward || {
						id: +reward.id,
						typ: reward.typ,
						sig: reward.sig,
						adt: reward.cdt || now
					};
					if (reward.cdt) existingReward.cdt = reward.cdt;
					if (reward.cmt) existingReward.cmt = reward.cmt;
					if (reward.cpi) existingReward.cpi = reward.cpi;
					if (existingReward.id <= expiredId && !existingReward.cmt) existingReward.cmt = -6;
					if (reward.cid) {
						// overwrite existing if owner id is different or existing has no owner name
						if (reward.cnm && (existingReward.cid != reward.cid || !existingReward.cnm)) existingReward.cnm = reward.cnm;
						existingReward.cid = reward.cid;
					} else if (reward.cnm && !existingReward.cnm) existingReward.cnm = reward.cnm;
					data[existingReward.id] = Data.rewardLinks[existingReward.id] = existingReward;
				}
			}
			// Daily max reached?
			let next = 0;
			if (reward.cmt == -3) {
				next = reward.next;
			} else if (reward.cmt > 0) {
				rewardLinksData.count = rewardLinksData.count + 1;
				flagStoreData = true;
				if (rewardLinksData.count == Data.REWARDLINKS_DAILY_LIMIT)
					next = rewardLinksData.first + Data.REWARDLINKS_REFRESH_HOURS * 3600;
			} else if (reward.cmt == -1 && +reward.id > +rewardLinksData.expired) {
				// this reward is expired and its id is greater than the last recorded one -> store it
				rewardLinksData.expired = +reward.id;
				flagStoreData = true;
			}
			if (next) {
				// round to the next minute
				next = next + (next % 60 ? 60 - next % 60 : 0);
				rewardLinksData.count = 0;
				rewardLinksData.next = next;
				rewardLinksData.first = 0;
				flagStoreData = true;
			}
		}

		const save = Object.values(data);
		const count = save.length;
		if (flagStoreData || count > 0) {
			if (flagStoreData) {
				save.push(rewardLinksData);
			}
			Data.saveRewardLink(save);
		}
		if (flagRefresh) {
			chrome.runtime.sendMessage({ action: 'rewards_update' }, () => hasRuntimeError('ADDREWARDLINKS'));
		}
		return count;
	},
	//#endregion
	//#region Game Messages
	getString(id) {
		return id in Data.localization.data ? Data.localization.data[id] : '#' + id;
	},
	objectCollections: {
		'region': () => Data.colRegions,
		'skin': () => Data.colSkins,
		'system': () => Data.colSystems,
		'addon_building': () => Data.colAddonBuildings,
		'material': () => Data.files.materials,
		'usable': () => Data.files.usables,
		'token': () => Data.files.tokens,
		'building': () => Data.files.buildings,
		'decoration': () => Data.files.decorations,
		'event': () => Data.files.events,
		'production': () => Data.files.productions,
		'tablet': () => Data.files.tablets,
		'windmill': () => Data.files.windmills,
		'collection': () => Data.files.collections,
		'artifact': () => Data.files.artifacts,
		'diggy_skin': () => Data.files.diggy_skins,
		'g_team': () => Data.files.g_teams,
		'photo': () => Data.files.photo_albums_photos,
	},
	getObjectCollection(type) {
		return type in Data.objectCollections ? Data.objectCollections[type]() : null;
	},
	getObject(type, id) {
		if (type == 'eventpass_xp') return Data.colEventpassXp[1];
		const col = Data.getObjectCollection(type);
		return col && col[id];
	},
	imageFolders: {
		windmill: 'windmills',
		region: 'gui',
		skin: 'gui',
		decoration: 'decorations',
		diggy_skin: 'gui/diggy_skin',
	},
	getObjectImage(type, id, small) {
		const item = Data.getObject(type, id);
		const asset = item && (type == 'windmill' ? 'greece_windmill' : (type == 'event' ? item.shop_icon_graphics : item.mobile_asset));
		if (!asset) return '';
		if (asset[0] == '/') return asset;
		const assetPath = item.asset_path || ('graphics/' + (Data.imageFolders[type] || 'all') + '/');
		const base = Data.generator.cdn_root + 'mobile/' + assetPath;
		const suffix = (small && (type == 'material' || type == 'usable' || type == 'token')) ? '_small' : '';
		return base + encodeURIComponent(asset) + suffix + '.png' + Data.generator.versionParameter;
	},
	getObjectName(type, id) {
		const item = Data.getObject(type, id);
		const name_loc = item && item.name_loc;
		if (type === 'photo') {
			const photoId = Data.getString('QINA590').toUpperCase() + ' #' + id;
			return photoId + (name_loc ? ' (' + Data.getString(name_loc) + ')' : '');
		}
		return name_loc ? Data.getString(name_loc) : '#' + type + id;
	},
	getObjectDesc(type, id) {
		const item = Data.getObject(type, id);
		const desc = item && item.desc;
		return desc ? Data.getString(desc) : '';
	},
	getRegionFromSkin(id) {
		return this.region2Skin.indexOf(id) + 1;
	},
	getSkinFromRegion(id) {
		return this.region2Skin[id - 1] || 0;
	},
	getMaxRegion() {
		return this.region2Skin.length;
	},
	getSound(name) {
		const cdn_root = Data.generator?.cdn_root;
		return !name || !cdn_root ? null : cdn_root + (name.startsWith('@') ? 'mobile/sounds/all/' + name.substring(1) : 'webgl_client/embedded_assets/sounds/' + name) + '.mp3';
	},
	//#endregion
	//#region LAST ENTERED MINE
	lastEnteredMine: null,
	lastEnteredMineProgress: null,
	lastViewedMine: null,
	mineCache: {},
	addMine(mine, progress) {
		const now = getUnixTime();
		const mines = asArray(mine).reverse();
		for (const mine of mines) {
			const { id: lid, level_id: fid } = mine;
			mine.time = now;
			let mines = Data.mineCache[lid];
			if (!mines) mines = Data.mineCache[lid] = {};
			const old = mines[fid];
			mines[fid] = mine;
			mine._p = mine._p || (old && old._p) || { links: {} };
			if (!mine.pet_feature && old && old.pet_feature) mine.pet_feature = old.pet_feature;
			if (mine.tiles) {
				const packed = PackTiles.pack(mine.tiles);
				delete mine.tiles;
				mine.packedTiles = packed;
				if (!mine._p.o) {
					const floor = asArray(mine.floor_progress || progress).find(t => +t.floor == fid);
					if ((floor && +floor.progress == 0)) {
						const o = mine._p.o = { packed };
						['beacons', 'entrances', 'exits', 'npcs', 'hints', 'drags', 'teleports', 'cur_column', 'cur_row'].forEach(key => o[key] = mine[key]);
					}
				}
			}
		}
		Data.saveMine(mine);
		const keys = Object.keys(Data.mineCache);
		if (keys.length <= MINECACHE_LIMIT) return;
		// Cache is at its limit, find the lowest used one
		const showRepeatables = Preferences.getValue('mapShowRepeatables');
		let removeId = 0, removeIsRep = false, removeTime = +Infinity;
		keys.forEach(lid => {
			const isRep = lid in Data.repeatables;
			if (!showRepeatables && !isRep && removeIsRep) return;
			const time = Object.values(Data.mineCache[lid]).reduce((time, mine) => Math.max(time, mine.time), 0);
			if (time > removeTime) return;
			removeId = lid;
			removeIsRep = isRep;
			removeTime = time;
		});
		Data.removeMine(Object.values(Data.mineCache[removeId]));
		delete Data.mineCache[removeId];
	},
	setLastEnteredMine(mine) {
		mine.entered = getUnixTime();
		let progress = mine.floor_progress;
		if (!progress && Data.lastEnteredMine && Data.lastEnteredMine.id == mine.id) progress = Data.lastEnteredMineProgress;
		Data.lastEnteredMine = mine;
		Data.lastEnteredMineProgress = progress;
		Data.lastViewedMine = null;
		Data.addMine(mine, Data.lastEnteredMineProgress);
	},
	saveMineList: {},
	saveMineHandler: 0,
	removeMineList: {},
	saveMineDelayed() {
		Data.saveMineHandler = 0;
		const toSave = Object.values(Data.saveMineList);
		Data.saveMineList = {};
		const toRemove = Object.keys(Data.removeMineList);
		Data.removeMineList = {};
		if (toSave.length > 0 || toRemove.length > 0) {
			const tx = Data.db.transaction('Files', 'readwrite');
			const store = tx.objectStore('Files');
			if (toSave.length) store.bulkPut(toSave);
			for (const key of toRemove) store.delete(key);
		}
	},
	saveMine(mine, remove = false) {
		const mines = asArray(mine);
		if (!mines.length) return;
		for (const mine of mines) {
			const id = 'mine_' + mine.id + '_' + mine.level_id;
			if (remove) {
				Data.removeMineList[id] = true;
				delete Data.saveMineList[id];
			} else {
				Data.saveMineList[id] = { id: id, data: mine };
				delete Data.removeMineList[id];
			}
		}
		if (!Data.saveMineHandler) Data.saveMineHandler = setTimeout(Data.saveMineDelayed, 10000);
	},
	removeMine(mine) {
		Data.saveMine(mine, true);
	},
	removeStoredMines(mineId) {
		asArray(mineId).forEach(lid => {
			if (!(lid in Data.mineCache)) return;
			Data.removeMine(Object.values(Data.mineCache[lid]));
			delete Data.mineCache[lid];
		});
	},
	//#endregion
	//#region ADS
	getAdsInfo() {
		const generator = Data.generator;
		const videoads = Data.files.video_ads;
		if (!videoads || !generator) return [];
		const counters = asArray(generator && generator.video_ad && generator.video_ad.item);
		let midnight = +generator.server_midnight - 86400;
		const now = getUnixTime();
		while (midnight + 86400 <= now) midnight += 86400;
		const offset = Synchronize.offset;
		const getProperCase = (value) => String(value || '').replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.substr(1).toLowerCase());
		const items = [], result = { items };
		let total = 0;
		Object.values(videoads).forEach(videoad => {
			const type = videoad.type, found = counters.find(item => item.type == type);
			if (!found || type == ADTYPE_LUCKYCARDS_OLD) return;
			const current = (found && +found.watched_at >= midnight && found.counter) || 0;
			total += current;
			const limit = `${Locale.formatNumber(current)} / ${Locale.formatNumber(+videoad.daily_limit)}`;
			items.push({ text: getProperCase(type.replace(/_/g, ' ')), limit, date: Locale.formatDateTimeFull(found && (found.watched_at - offset)) });
		});
		items.sort((a, b) => a.text.localeCompare(b.text));
		result.total = Locale.formatNumber(total);
		return result;
	},
	//#endregion
	//#region FILES
	unusedFiles: {
		'buildings_actions': true
	},
	checkFile(name, version) {
		const result = {};
		result.name = name;
		result.version = version;
		if (name.startsWith('floors_')) {
			result.fileName = 'json/floors/' + name + '.json';
			result.kind = 'json';
		} else {
			result.fileName = 'erik/';
			if (name.startsWith('locations_')) result.fileName += 'locations/';
			result.fileName += name + '.erik';
			result.kind = 'erik';
		}
		if (name in Data.unusedFiles) {
			result.data = {};
			return result;
		}
		if (version === undefined) {
			version = '1';
			if (Data.generator && Data.generator.file_changes && result.fileName in Data.generator.file_changes) version = String(Data.generator.file_changes[result.fileName]);
			result.version = version;
		}
		const file = Data.files[result.fileName];
		// If file in cache has the same version, return it
		result.data = file && file.version == version ? Data.files[name] : null;
		return result;
	},
	getFile: async function (name, version, noStore) {
		const file = Data.checkFile(name, version);
		if (file.data) return file.data;
		delete Data.files[file.name];
		delete Data.files[file.fileName];
		if (!Data.generator || !Data.generator.cdn_root) return Promise.reject('Data has not been loaded yet');
		file.url = Data.generator.cdn_root + file.fileName + '?ver=' + file.version;
		const response = await fetch(file.url);
		if (+response.status >= 400) throw `File cannot be load: "${file.url}"`;
		const text = await response.text();
		let data = Parser.parse(file.kind, text);
		if (!data) throw `File cannot be parsed: "${file.url}"`;
		if (file.kind == 'erik') {
			const keys = data.__keys.filter(key => key.startsWith('@'));
			delete data.__keys;
			const items = keys.length ? (Array.isArray(data) ? data : Object.values(data)) : null;
			for (const key of keys) {
				const key2 = key.substr(1);
				const detail = await Data.getFile(name + '_' + key2, undefined, true);
				// Expand key
				items.forEach(item => {
					const ids = (item[key] || '').split(',');
					const arr = [];
					for (const id of ids) {
						if (id && id in detail) arr.push(detail[id]);
					}
					delete item[key];
					item[key2] = arr;
				});
			}
		}
		const fixFn = Parser['fix_' + name];
		if (typeof fixFn == 'function') data = fixFn(data) || data;
		if (!noStore) {
			Data.files[name] = data;
			Data.files[file.fileName] = file;
		}
		return data;
	},
	isFasterProduction() {
		const weeks = Data.files.special_weeks;
		if (weeks !== Data.ifp_data) {
			Data.ifp_data = weeks;
			delete Data.ifp_start;
			Object.values(weeks).forEach(sw => {
				if (sw.type == 'prod_time') {
					const start = +sw.start;
					if (!Data.ifp_start || start > Data.ifp_start) {
						Data.ifp_start = start;
						Data.ifp_finish = +sw.finish;
					}
				}
			});
		}
		const start = Data.ifp_start;
		if (!start) return false;
		const now = getUnixTime();
		return now >= start && now < Data.ifp_finish;
	},
	getConfigValue(name, defaultValue = 0) {
		let result = NaN;
		try {
			const config = Data.files.configs[Data.generator.config_id];
			result = parseInt(config[name]);
		} catch (e) {
			result = NaN;
		}
		return isNaN(result) ? defaultValue : result;
	},
	//#endregion
};
//#endregion

//#region SYNCHRONIZE
// eslint-disable-next-line no-var
var Synchronize = {
	time: 0,
	offset: 0,
	init: async function () {
		//
	},
	delayedSignals: [],
	signal(action, data, delayed) {
		let message = action;
		if (typeof action == 'string') {
			message = {};
			message.action = action;
			if (data) message.data = data;
		}
		if (delayed) {
			if (delayed === 'single' && Synchronize.delayedSignals.find(msg => msg.action === message.action)) return;
			return Synchronize.delayedSignals.push(message);
		}
		chrome.runtime.sendMessage(message, () => hasRuntimeError('SYNC1'));
		if (Tab.gameTabId) chrome.tabs.sendMessage(Tab.gameTabId, message, () => hasRuntimeError('SYNC2'));
	},
	signalMineAction(data) {
		const mine = Data.lastEnteredMine;
		if (mine) {
			mine.time = getUnixTime();
			if (!mine.actions) mine.actions = [];
			if (data) mine.actions.push(data);
			Data.saveMine(mine);
			if (!Synchronize.delayedSignals.find(s => s.action == 'daf_mine_action')) Synchronize.delayedSignals.push({ action: 'daf_mine_action' });
		}
	},
	energyId: 0,
	signalEnergy(energy, pal) {
		const energyId = pal ? pal.id : 0;
		if (energyId != Synchronize.energyId) {
			Synchronize.energyId = energyId;
			let title = '';
			if (pal) {
				title += pal.name ? pal.name + ' ' + pal.surname : pal.extra.fn || 'Player ' + pal.id;
				title += `\n${getMessage('gui_level')}: ${Locale.formatNumber(pal.level)}`;
				title += `\n${getMessage('gui_region')}: ${Data.getObjectName('region', pal.region)}`;
				title += `\n${getMessage('gui_energy')}: ${Locale.formatNumber(energy)}`;
			}
			Synchronize.signal('gc-energy', { energy, title });
		}
	},
	expandDataWithSound(data, prefName) {
		data.volume = Preferences.getValue(prefName + 'Sound') ? parseInt(Preferences.getValue(prefName + 'Volume')) || 0 : 0;
		data.sound = data.volume ? Data.getSound(Preferences.getValue(prefName + 'SoundName')) : '';
		return data;
	},
	repeatables: '',
	signalRepeatables(list) {
		const repeatables = list.map(o => o.lid).join(',');
		if (repeatables != Synchronize.repeatables) {
			Synchronize.repeatables = repeatables;
			Synchronize.signal('repeatables', Synchronize.expandDataWithSound({ list }, 'badgeRepeatables'));
		}
	},
	process(posted, responseText) {
		if (!posted) return;

		const response = responseText && Parser.parse('any', responseText);
		Synchronize.time = Math.floor(response ? +response.time : +posted.client_time);
		Synchronize.offset = Synchronize.time - getUnixTime();

		Synchronize.delayedSignals = [];

		// const stamina = response && response.global ? response.global.stamina : -1;
		// if (stamina >= 0 && Preferences.getValue('badgeServerEnergy')) Synchronize.signal('serverEnergy', { energy: Locale.formatNumber(stamina) }, true);

		// un_gift
		const changed = Synchronize.processUnGift(response && response.global && response.global.un_gifts, Synchronize.time);
		Data.saveNeighbour(changed);

		// tasks
		let tasks = posted.task;
		tasks = tasks ? (Array.isArray(tasks) ? tasks : [tasks]) : [];
		let taskIndex = 0;
		for (const task of tasks) {
			const action = task.action;
			// console.log(`Action #${taskIndex} "${ action}"`);
			const fn = Synchronize.handlers[action];
			if (fn instanceof Function) {
				const taskName = 'task_' + taskIndex;
				try {
					fn(action, task, response && response[taskName], response);
				} catch (e) {
					console.error(action + '() ' + e.message);
				}
			}
			taskIndex++;
		}
		const sent = {};
		for (const message of Synchronize.delayedSignals) {
			const json = JSON.stringify(message);
			if (!(json in sent)) {
				sent[json] = true;
				Synchronize.signal(message);
			}
		}
	},
	lastTimeMined: 0,
	last_lid: 0,
	setLastLocation(lid) {
		if (lid <= 0) return null;
		this.last_lid = lid;
		return Data.getLocProg(lid);
	},
	setCustomList(action, task, taskResponse) {
		const neighbourId = task.neighbour_id;
		if (taskResponse.result == 'OK') {
			const c_list = action === 'cl_add' ? 1 : 0;
			const neighbour = Data.getNeighbour(neighbourId);
			if (!neighbour || neighbour.c_list === c_list) return;
			neighbour.c_list = c_list;
			Data.saveNeighbour(neighbour);
			Synchronize.signal(action, neighbourId);
		}
	},
	production(type, action, task) {
		let slotName, prodName, finishName = 'finish', arr;
		if (type == 'caravan') {
			slotName = 'caravan_id';
			prodName = 'dest_id';
			finishName = 'arrival';
			arr = Data.generator.caravans;
		} else if (type == 'kitchen') {
			slotName = 'pot_id';
			prodName = 'pot_recipe_id';
			arr = Data.generator.pots;
		} else if (type == 'foundry') {
			slotName = 'anvil_id';
			prodName = 'alloy_id';
			arr = Data.generator.anvils;
		} else return;
		const id = task[slotName], prod = asArray(arr).find(p => p[slotName] == id);
		if (!prod) return;
		if (action == 'unload') {
			prod.cargo = 0;
			Synchronize.signal('update_productions', null, 'single');
		} else if (action == 'start') {
			prod.cargo = 1;
			const prodId = prod[prodName] = +task[prodName];
			const items = Data.files.productions, item = items && items[prodId];
			prod[finishName] = item ? Math.floor(task.time) + Math.floor(+item.duration * (Data.isFasterProduction() ? 0.5 : 1)) : 0;
			Data.setTimer(Data.checkProductions, 1);
		} else if (action == 'cancel') {
			prod.cargo = 0;
			prod[finishName] = 0;
			Data.setTimer(Data.checkProductions, 1);
		} else if (action == 'speedup') {
			prod[finishName] = Math.floor(task.time);
			Data.setTimer(Data.checkProductions, 1);
		}
	},
	handlers: {
		'Market:Refresh': function(_action, task, _taskResponse, _response) {
			const marketId = task.DefId;
			const market = asArray(Data.generator.market).find(market => market.market_id == marketId);
			if (market) market.last_refreshed_at = Synchronize.time;
			Data.checkPetShop();
		},
		visit_camp(action, _task, taskResponse, _response) {
			if (!taskResponse || !taskResponse.camp) return;
			const neighbourId = taskResponse.neigh_id;
			const camp = Data.lastVisitedCamp = taskResponse.camp;
			const wmtime = Data.getCampWindmillTime(Data.lastVisitedCamp);
			Synchronize.signal('windmills', wmtime || neighbourId == 1 ? { active: 0 } : Synchronize.expandDataWithSound({ active: 1 }, 'badgeWindmills'));
			camp.neigh_id = neighbourId;
			camp.time = Synchronize.time;
			const pal = Data.getNeighbour(neighbourId);
			if (pal) {
				let energy = 0;
				if (camp && camp.children) {
					let total = 0;
					const childs = Data.files.childs;
					[].concat(camp.children).forEach(child => {
						const id = child.def_id;
						const qty = +child.amount;
						total += qty;
						if (childs && id in childs) energy += (qty * (+childs[id].friend_stamina || 0));
					});
					if (total == 5) pal.extra.gc = energy;
				}
				Synchronize.signalEnergy(energy, pal);
				pal.extra.lastVisit = Synchronize.time;
				let blocks = 144;
				for (let n of String(camp.lines_blocked || '').split(',')) {
					n = parseInt(n);
					if (isFinite(n)) blocks += n - 24;
				}
				pal.extra.blocks = blocks;
				pal.extra.wmtime = wmtime;
				Data.saveNeighbour(pal);
			}
			Synchronize.signal(action, neighbourId);
		},
		place_windmill(action, task, _taskResponse, _response) {
			const neighbourId = task.neigh_id;
			const time = Synchronize.time;
			const pal = Data.getNeighbour(neighbourId);
			if (Data.lastVisitedCamp && Data.lastVisitedCamp.neigh_id == neighbourId && pal && time) {
				let windmills = Data.lastVisitedCamp.windmills;
				windmills = Array.isArray(windmills) ? windmills : [];
				windmills.push({
					activated: time,
					provider: Data.generator.player_id
				});
				Data.lastVisitedCamp.windmills = windmills;
				const wmtime = Data.getCampWindmillTime(Data.lastVisitedCamp);
				if (wmtime !== pal.extra.wmtime) {
					pal.extra.wmtime = wmtime;
					Data.saveNeighbour(pal);
					Synchronize.signal(action, neighbourId, true);
				}
				if (wmtime) Synchronize.signal('windmills', { active: 0 });
			}
		},
		enter_mine(action, task, taskResponse, _response) {
			Synchronize.signalEnergy(0);
			Synchronize.signal('windmills', { active: 0 });
			const loc_id = +task.loc_id || 0;
			const prog = Synchronize.setLastLocation(loc_id);
			if (prog && taskResponse) {
				// console.log(Object.assign({}, prog), taskResponse, Data.repeatables && Data.repeatables[loc_id]);
				prog.lvl = +taskResponse.level_id;
				const reset = +taskResponse.reset_count;
				const rep = Data.repeatables && Data.repeatables[loc_id];
				if (rep) {
					// We have repeatables info => this is a repeatable
					// Marks as ready, since we just entered it
					prog.cmpl = 0;
					const fp = taskResponse.floor_progress;
					let floor = null;
					if (Array.isArray(fp)) floor = fp.find(t => +t.floor == prog.lvl);
					else if (fp && +fp.floor == prog.lvl) floor = fp;
					prog.prog = floor ? +floor.progress : 0;
				} else {
					// No repeatable info => alternative method
					// The reset count will increase when entering a refreshed repeatable
					if (reset > +prog.reset) {
						prog.cmpl = 0;
						prog.prog = 0;
					}
				}
				prog.reset = reset;
				Data.storeLocProg();
				Data.checkRepeatablesStatus();
				Data.setLastEnteredMine(taskResponse);
				Synchronize.signalMineAction();
				Synchronize.signal(action, taskResponse);
			}
		},
		change_level(action, task, taskResponse, _response) {
			const last = Data.lastEnteredMine;
			const next = taskResponse;
			let from, to;
			if (last && next && last.id == next.id) {
				from = `${task.direction == 'up' ? 'n' : 'x'}_${task.exit_id}`;
				to = `p_${taskResponse.cur_column}_${taskResponse.cur_row}`;
				last._p.links[from] = `${taskResponse.level_id}_${to}`;
			}
			Synchronize.signalMineAction({ action, exit_id: +task.exit_id, direction: task.direction });
			Data.setLastEnteredMine(taskResponse);
			// This must be done after the map has been added, so next._p is correctly set
			if (to) next._p.links[to] = `${last.level_id}_${from}`;
			Synchronize.signalMineAction();
			Synchronize.signal(action, taskResponse);
		},
		speedup_reset(_action, task, _taskResponse, _response) {
			const loc_id = +task.loc_id || 0;
			const prog = Synchronize.setLastLocation(loc_id);
			if (prog) {
				prog.prog = 0;
				const rep = Data.repeatables && Data.repeatables[loc_id];
				if (rep) {
					prog.cmpl = 0;
				}
				Data.storeLocProg();
				Data.checkRepeatablesStatus();
			}
		},
		mine(action, task, _taskResponse, _response) {
			Synchronize.lastTimeMined = Synchronize.time;
			const loc_id = Synchronize.last_lid;
			const prog = Synchronize.setLastLocation(loc_id);
			if (prog) {
				prog.prog = (+prog.prog || 0) + 1;
				const rep = Data.repeatables && Data.repeatables[loc_id];
				const rotation = rep && rep.rotation[prog.lvl];
				if (rotation && prog.prog >= rotation.progress) {
					prog.cmpl = Synchronize.time;
					Data.checkRepeatablesStatus();
				}
				Data.storeLocProg();
			}
			Synchronize.signalMineAction({ action, x: +task.column, y: +task.row, cx: +task.cur_column, cy: +task.cur_row });
		},
		drag_object(action, task, _taskResponse, _response) {
			Synchronize.signalMineAction({ action, x: +task.column, y: +task.row, direction: task.direction, type: task.type });
		},
		use_beacon(action, task, _taskResponse, _response) {
			Synchronize.signalMineAction({ action, x: +task.column, y: +task.row, cx: +task.cur_column, cy: +task.cur_row });
		},
		manipulate_object(action, task, _taskResponse, _response) {
			Synchronize.signalMineAction({ action, x: +task.column, y: +task.row, cx: +task.cur_column, cy: +task.cur_row, direction: task.direction });
		},
		pick_child(action, task, _taskResponse, _response) {
			Synchronize.signalMineAction({ action, x: +task.column, y: +task.row, cx: +task.cur_column, cy: +task.cur_row });
		},
		pick_npc(action, task, _taskResponse, _response) {
			Synchronize.signalMineAction({ action, x: +task.column, y: +task.row, cx: +task.cur_column, cy: +task.cur_row });
		},
		use_teleport(action, task, _taskResponse, _response) {
			Synchronize.signalMineAction({ action, x: +task.column, y: +task.row });
		},
		leave_mine(action, task, _taskResponse, _response) {
			Synchronize.signalMineAction({ action, loc_id: +task.loc_id, level: +task.level, cx: +task.cur_column, cy: +task.cur_row });
		},
		process_waiting_rewards(_action, _task, taskResponse, _response) {
			if (taskResponse && taskResponse.result == 'OK') {
				const type = taskResponse.video_ad_type;
				const items = asArray(Data.generator && Data.generator.video_ad && Data.generator.video_ad.item);
				const item = items.find(item => item.type == type);
				if (item) {
					item.counter = taskResponse.video_ad_counter;
					item.watched_at = taskResponse.video_ad_watched_at;
					item.stack_counter = taskResponse.video_ad_stack_counter;
				}
				if (type == ADTYPE_LUCKYCARDS) {
					Data.getLuckyCardsAd(+taskResponse.video_ad_watched_at);
					Data.checkLuckyCards();
				}
				Synchronize.signal('ads_info', Data.getAdsInfo());
			}
		},
		prod_unload_caravan: (_action, task) => Synchronize.production('caravan', 'unload', task),
		prod_send_caravan: (_action, task) => Synchronize.production('caravan', 'start', task),
		prod_return_caravan: (_action, task) => Synchronize.production('caravan', 'cancel', task),
		prod_speedup_caravan: (_action, task) => Synchronize.production('caravan', 'speedup', task),
		unload_pot_recipe: (_action, task) => Synchronize.production('kitchen', 'unload', task),
		start_pot_recipe: (_action, task) => Synchronize.production('kitchen', 'start', task),
		cancel_pot_recipe: (_action, task) => Synchronize.production('kitchen', 'cancel', task),
		speedup_pot_recipe: (_action, task) => Synchronize.production('kitchen', 'speedup', task),
		unload_anvil_alloy: (_action, task) => Synchronize.production('foundry', 'unload', task),
		start_anvil_alloy: (_action, task) => Synchronize.production('foundry', 'start', task),
		cancel_anvil_alloy: (_action, task) => Synchronize.production('foundry', 'cancel', task),
		speedup_anvil_alloy: (_action, task) => Synchronize.production('foundry', 'speedup', task),
		cl_add(action, task, taskResponse, _response) {
			Synchronize.setCustomList(action, task, taskResponse);
		},
		cl_remove(action, task, taskResponse, _response) {
			Synchronize.setCustomList(action, task, taskResponse);
		},
		friend_child_charge(action, task, _taskResponse, _response) {
			const neighbourId = task.neigh_id;
			const neighbour = Data.getNeighbour(neighbourId);
			if (neighbour && neighbour.spawned) {
				if (!('gcCount' in neighbour.extra)) neighbour.extra.gcCount = Data.getConfigValue('child_count', 5);
				if ((--neighbour.extra.gcCount) <= 0) {
					// Collected all of them!
					neighbour.spawned = 0;
					delete neighbour.extra.gcCount;
					const data = Data.getGCInfo();
					data.id = neighbourId;
					// We can autoskip if Mr.Bill or the neighbor does not need windmills
					// const camp = Data.lastVisitedCamp;
					// const needsWindmills = camp && camp.neigh_id == neighbourId && Data.getCampWindmillTime(camp) == 0;
					const needsWindmills = neighbour.extra.wmtime === 0;
					data.skip = neighbourId == 1 || !needsWindmills;
					Synchronize.signal(action, data);
				}
				Data.saveNeighbour(neighbour);
			}
		}
	},
	processUnGift(ungift, time, neighbours, factions) {
		ungift = ungift ? [].concat(ungift) : [];
		factions = factions ? [].concat(factions) : [];
		if (!neighbours) neighbours = Data.neighbours;
		time = +time;
		const changed = {};
		for (const item of ungift) {
			const giftId = +item.gift_id;
			const pal = neighbours[item.sender_id];
			if (!pal) continue;
			let gifts = pal.extra.g;
			if (gifts && gifts.find(item => item[0] == giftId)) continue;
			const gift = [giftId, +item.def_id, time];
			if (!gifts) gifts = pal.extra.g = [];
			gifts.push(gift);
			// Sort gifts by id (id is a sequence)
			gifts.sort((a, b) => a[0] - b[0]);
			// Store only the last 50 gifts
			if (gifts.length > 50) gifts = pal.extra.g = gifts.slice(-50);
			// Adjust the time (lower id must have a lower time)
			let lastTime = gifts[gifts.length - 1][2];
			for (let i = gifts.length - 2; i >= 0; i--) {
				let thisTime = gifts[i][2];
				if (thisTime >= lastTime) thisTime = gifts[i][2] = lastTime - 1;
				lastTime = thisTime;
			}
			changed[pal.id] = pal;
		}
		for (const item of factions) {
			if (item.type != 'friend_child') continue;
			const pal = neighbours[item.invoker_id];
			if (!pal) continue;
			pal.extra.lastGC = time;
			changed[pal.id] = pal;
		}
		return Object.values(changed);
	},
	processGraph(result) {
		try {
			const json = JSON.parse(result);
			if (json.id) {
				const pals = Object.values(Data.neighbours).filter(pal => {
					if (pal.fb_id !== json.id && pal.fb_id2 !== json.id) return false;
					let modified = false;
					if (json.name && !pal.extra.fn) {
						pal.extra.fn = json.name.replace(/\s+/g, ' ');
						modified = true;
					}
					if (json.first_name && pal.name !== json.first_name) {
						pal.name = json.first_name;
						modified = true;
					}
					if (json.last_name && pal.surname !== json.last_name) {
						pal.surname = json.last_name;
						modified = true;
					}
					return modified;
				});
				if (pals.length) Data.saveNeighbour(pals);
			}
		} catch (e) { }
	},
	processXhr(details) {
		const { type, kind, lang, player_id, xml, response } = details;
		if (kind == 'graph') return this.processGraph(response);
		const isError = type == 'error';
		if (isError) return Badge.setIcon('red').setBackgroundColor('red');
		const isSend = type == 'send', isOk = type == 'ok';
		if (!isSend && !isOk) return;
		if (kind == 'team' && isOk) {
			const data = Parser.parse('any', response);
			let team = data && Array.isArray(data.records) && data.records[0];
			const me = team && team.me;
			team = team && team.team;
			if (team && me) {
				team.me = me;
				if (Data.setTeam(team)) {
					Data.storeSimple(kind, team);
					Synchronize.signal('team_changed');
				}
			}
		}
		const isGenerator = kind == 'generator', isSynchronize = kind == 'synchronize';
		if (!isGenerator && !isSynchronize) return;
		if (Data.generator.player_id && Data.generator.player_id != player_id) {
			if (isSynchronize) return;
			if (!Preferences.getValue('disableAltGuard')) {
				if (isSend) {
					Data.alternateAccountDetected = player_id;
					Badge.setIcon('grey').setText('ALT').setBackgroundColor('red');
					console.log('Request is for a different player', player_id, 'instead of', Data.generator.player_id);
					Synchronize.signal('account_mismatch', player_id);
				}
				return;
			}
		}
		if (isGenerator) {
			if (isSend) {
				delete Data.alternateAccountDetected;
				return Badge.setIcon('grey').setText('READ').setBackgroundColor('green');
			}
			Badge.setText('');
			const file = { id: kind, time: getUnixTime(), data: Parser.parse(kind, response) };
			if (file.data && file.data.neighbours) {
				Synchronize.time = +file.data.time;
				Synchronize.offset = Synchronize.time - file.time;
				file.data.player_id = player_id;
				file.data.game_site = Data.lastSite || 'Portal';
				file.data.game_platform = 'WebGL';
				file.data.game_language = lang;
				Data.store(file);
				Badge.setIcon('green');
			} else {
				Badge.setIcon('red');
			}
		} else {
			if (isSend) return Badge.setText('SYNC').setBackgroundColor('green');
			Badge.setText('').setIcon('green');
			Synchronize.process(xml, response);
		}
	}
};
//#endregion

//#region INIT
async function init() {
	Badge.setIcon('grey');
	Badge.setBackgroundColor('purple');
	Badge.setText('INIT');
	await Preferences.init();
	await Data.init();
	await Message.init();
	await Synchronize.init();
	await Tab.init();

	const lang = Preferences.getValue('language');
	languageId = Data.detectLanguage(lang);
	if (languageId !== lang) Preferences.setValue('language', languageId);
	changeLocale(Preferences.getValue('locale'));

	Object.entries({
		daf_xhr(request, _sender) {
			Synchronize.processXhr(request);
		},
		sendValue(request, sender) {
			chrome.tabs.sendMessage(sender.tab.id, request, () => hasRuntimeError('SENDVALUE'));
		},
		getPrefs(request) {
			const keys = [].concat(request.keys);
			const values = Preferences.getValues(keys);
			if (keys.includes('@admin')) values['@admin'] = Data.isAdmin;
			if (keys.includes('@mapper')) values['@mapper'] = Data.isMapper;
			if (keys.includes('@super')) values['@super'] = Data.isSuper;
			return values;
		},
		showGUI() {
			Tab.showGUI();
		},
		gameStarted(request) {
			Data.lastSite = request.site;
		},
		// Received from GAME1/GAME2, forward to both of them (on the same tab)
		forward(request, sender) {
			request = Object.assign({}, request, { action: request.real_action});
			chrome.tabs.sendMessage(sender.tab.id, request);
		},
		getGCInfo() {
			return Data.getGCInfo();
		},
		getAdsInfo() {
			return Data.getAdsInfo();
		},
		getGCList(request) {
			const neighbours = Object.values(Data.neighbours);
			const realNeighbours = neighbours.length - 1;
			const list = request.simulate ? neighbours.slice(0, request.simulate) : neighbours.filter(n => n.spawned);
			const regionNames = {};
			if (Data.localization.data) Object.keys(Data.colRegions).forEach(key => regionNames[key] = Data.getObjectName('region', key));
			return {
				regions: regionNames,
				max: Math.min(realNeighbours, Math.floor(Math.sqrt(realNeighbours)) + 3) + 1,
				list: list.sort((a, b) => a.index - b.index)
					.map(function (n) {
						const result = {
							id: n.id,
							name: n.name || 'Player ' + n.id,
							surname: n.surname,
							level: n.level,
							region: n.region,
							fb_id: n.fb_id
						};
						if (n.pic_square) result.pic = n.pic_square;
						return result;
					})
			};
		},
		reloadGame(request, _sender) {
			Tab.showGame(request.value);
		},
		collectRewardLink(request, sender) {
			let flagClose = Preferences.getValue('rewardsClose');
			let reward = request.reward;
			if (reward.cmt == 2 && Preferences.getValue('rewardsCloseExceptGems')) flagClose = false;
			if (reward.cmt < 0 && Preferences.getValue('rewardsCloseExceptErrors')) flagClose = false;
			Data.addRewardLinks(reward);
			if (flagClose) {
				chrome.tabs.remove(sender.tab.id);
			} else if (Preferences.getValue('rewardsSummary')) {
				reward = Data.getRewardLink(reward.id);
				let htm = '';
				htm += Html.br`<center style="font-family:sans-serif;font-size:12pt;margin:4px 0px;">`;
				htm += Html.br`<table border="0" cellpadding="4" style="border:2px solid #36648b;"><tbody>`;
				htm += Html.br`<tr bgcolor="#3e8cc6" style="color:white">`;
				htm += Html.br`<th>${getMessage('rewardlinks_id')}</th>`;
				htm += Html.br`<th>${getMessage('rewardlinks_insertdate')}</th>`;
				htm += Html.br`<th>${getMessage('rewardlinks_collectdate')}</th>`;
				if (reward.cid) htm += Html.br`<th>${getMessage('rewardlinks_owner')}</th>`;
				htm += Html.br`</tr><tr style="background-color:#e7e7e7;color:black;">`;
				htm += Html.br`<td>${reward.id}</td>`;
				htm += Html.br`<td>${Locale.formatDateTime(reward.adt)}</td>`;
				htm += Html.br`<td>${Locale.formatDateTime(reward.cdt)}</td>`;
				const url = reward.cpi || (reward.cid && `https://graph.facebook.com/v2.8/${reward.cid}/picture`);
				if (url) htm += Html.br`<td><img src="${url}" valign="middle" style="margin-right:8px"/>${reward.cnm}</td>`;
				htm += Html.br`</tr></tbody><table>`;
				htm = String(htm);
				return htm;
			}
		},
		addRewardLinks(request, _sender) {
			return Data.addRewardLinks(request.values);
		},
		closeWindow(_request, sender) {
			chrome.tabs.remove(sender.tab.id);
		},
		searchNeighbor(request, _sender) {
			const text = String(request.text || '').toUpperCase();
			const isNumeric = !!text.match(/^\d+$/);
			const result = Object.values(Data.neighbours).filter(pal => {
				if (pal.id == 1) return false;
				if ((pal.name + ' ' + pal.surname).toUpperCase().indexOf(text) >= 0) return true;
				if (pal.extra.fn && pal.extra.fn.toUpperCase().indexOf(text) >= 0) return true;
				return isNumeric && String(pal.id).indexOf(text) >= 0;
			});
			const list = result.slice(0, 10).sort((a, b) => (a.level - b.level) || (a.region - b.region) || (a.index - b.index)).map(pal => {
				const friend = Object.values(Data.getFriends()).find(friend => friend.uid == pal.id);
				return {
					id: pal.id,
					fb_id: pal.fb_id,
					pic: pal.pic_square,
					name: pal.name ? pal.name + ' ' + pal.surname : 'Player ' + pal.id,
					furl: friend && friend.uri,
					fn: pal.extra.fn,
					rimage: Data.getObjectImage('region', pal.region),
					rname: Data.getObjectName('region', pal.region),
					level: Locale.formatNumber(pal.level)
				};
			});
			return { count: result.length, list };
		},
		friendsCaptured(request, sender) {
			Tab.collectTabId = request.close ? null : sender.tab.id;
			if (request.data) Data.friendsCaptured(request.data, request.partial, request.forceAnalyze);
			if (request.close) chrome.tabs.remove(sender.tab.id);
		}
	}).forEach(entry => Message.setHandler(entry[0], entry[1]));

	Object.entries({
		language: value => languageId = value,
		locale: changeLocale,
		repeatables: Data.checkRepeatablesStatus,
		badgeLuckyCardsOffset: Data.checkLuckyCards,
		badgeRepeatablesOffset: Data.checkRepeatablesStatus
	}).forEach(entry => Preferences.setHandler(entry[0], entry[1]));

	if (Data.generator && Data.generator.player_id) {
		Data.checkLocalization('');
		Badge.setIcon('yellow');
	}
	Badge.setText('');

	chrome.browserAction.onClicked.addListener(function (_activeTab) {
		Tab.showGUI();
	});
}
//#endregion

init();