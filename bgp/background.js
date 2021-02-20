/*global chrome Parser UrlInfo idb Html Locale PackTiles*/
'use strict';

//#region MISCELLANEOUS
const SECONDS_IN_A_DAY = 86400;
const MINECACHE_LIMIT = 100;

function hasRuntimeError(info) {
    // This is necessary to avoid unchecked runtime errors from Chrome
    const hasError = !!chrome.runtime.lastError;
    if (hasError) console.log(`[${info}] RUNTIME error: "${chrome.runtime.lastError.message}"`);
    return hasError;
}

function getUnixTime() {
    return Math.floor(Date.now() / 1000);
}

function asArray(t) {
    return t ? [].concat(t) : [];
}

let languageId = 'en';

function changeLocale(localeId) {
    Locale.setLocale(localeId ? languageId + '-' + localeId : chrome.i18n.getUILanguage());
}

function getMessage(id, ...args) {
    if (getMessage.$L !== languageId) {
        getMessage.$M = {};
        const data0 = chrome.i18n.getMessage('en').split('|'), data1 = chrome.i18n.getMessage(getMessage.$L = languageId).split('|');
        chrome.i18n.getMessage('keys').split('|').forEach((key, index) => getMessage.$M[key] = data1[index] || data0[index]);
    }
    return (getMessage.$M[id] || '').replace(/\^\d/g, t => { const n = +t[1] - 1; return n >= 0 && n < args.length ? args[n] : ''; });
}

// eslint-disable-next-line no-var
var Badge = {
    currentIcon: '',
    setIcon: function (color) {
        color = color[0].toUpperCase() + color.substr(1).toLowerCase();
        Badge.currentIcon = '/img/logo/icon' + color + '.png';
        chrome.browserAction.setIcon({
            path: Badge.currentIcon
        });
        return this;
    },
    setText: function (text) {
        chrome.browserAction.setBadgeText({
            text: text
        });
        return this;
    },
    setBackgroundColor: function (color) {
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
    getDefaults: function () {
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
            badgeGcCounter: true,
            badgeGcEnergy: true,
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
            mapDownloadEvent: 'DAF2_maps/$event/$location',
            mapDownloadRegion: 'DAF2_maps/$region/$god/$location',
            confirmCollection: false,
            speedupCollection: 0,
            matchByImage: true,
            mapShowRepeatables: true,
            fbFriendsPage: 0,
            linkGrabEnabled: false,
            linkGrabButton: 2,
            linkGrabKey: 0,
            linkGrabSort: 0,
            linkGrabConvert: 0,
            rewardsRemoveDays: 7,
            rewardsClose: false,
            rewardsSummary: true,
            rewardsCloseExceptGems: true,
            rewardsCloseExceptErrors: true,
            repeatables: '',
            friendsCollectDate: 0
        };
    },
    init: async function () {
        Preferences.values = Preferences.getDefaults();
        return new Promise(function (resolve, _reject) {
            const keysToRemove = [];
            const valuesToSet = Object.assign({}, Preferences.values);
            chrome.storage.local.get(null, function (values) {
                hasRuntimeError('PREF1');
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
            chrome.storage.onChanged.addListener(Preferences.onChanged);
        });
    },
    setHandler: function (action, callback) {
        Preferences.handlers[action] = callback;
    },
    onChanged: function (changes, area) {
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
    getValue: function (name) {
        return Preferences.values[name];
    },
    setValue: function (name, value) {
        Preferences.setValues({
            [name]: value
        });
    },
    setValues: function (values) {
        if (!values) return;
        const data = {};
        let flag = false;
        for (const name of Object.keys(values)) {
            if (name in Preferences.values) {
                Preferences.values[name] = values[name];
                flag = true;
                data[name] = values[name];
            }
        }
        if (flag) chrome.storage.local.set(data);
    },
    getValues: function (names) {
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
    init: function () {
        chrome.runtime.onMessage.addListener(Message.onMessage);
    },
    setHandler: function (action, callback) {
        Message.handlers[action] = callback;
    },
    onMessage: function (request, sender, sendResponse) {
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
// eslint-disable-next-line no-var
var Tab = {
    gameTabId: null,
    guiTabId: null,
    GUI_URL: chrome.extension.getURL('gui/gui.html'),
    tabExcluded: {},
    init: function () {
        chrome.tabs.onUpdated.addListener(Tab.onUpdated);
        chrome.tabs.onRemoved.addListener(Tab.onRemoved);

        // Portal auto login
        const autoLoginFilters = {
            url: [{
                hostEquals: 'portal.pixelfederation.com'
            }]
        };
        chrome.webNavigation.onCompleted.addListener(Tab.onAutoLoginCompleted, autoLoginFilters);

        // Add Link Grabber script to Facebook pages
        const fbFilters = {
            url: [
                { hostEquals: 'www.facebook.com' },
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
                hostEquals: 'portal.pixelfederation.com',
                pathEquals: '/_da/miner/wallpost.php'
            }]
        };
        chrome.webNavigation.onDOMContentLoaded.addListener(Tab.onRewardNavigation, rewardLinkFilters);

        return Tab.detectAll();
    },
    onAutoLoginCompleted: function (details) {
        if (!Preferences.getValue('autoLogin')) return;
        console.log('injecting auto portal login');
        chrome.tabs.executeScript(details.tabId, {
            code: `
// Privacy policy
var el = document.querySelector('.alert__action[data-announcement="privacy_policy"]');
if (el) el.click();
var loginButton = document.querySelector('#login-click:not(.DAF-clicked)'), handler = 0, count = 10;
function tryLogin() {
    var element = Array.from(document.getElementsByClassName('btn--facebook'))
        .filter(item => item.href = 'https://login.pixelfederation.com/oauth/connect/facebook')[0];
    if (!element && --count > 0) return;
    clearInterval(handler);
    handler = 0;
    if (element) element.click();
}
if (loginButton) {
    loginButton.classList.add('DAF-clicked');
    loginButton.click();
    handler = setInterval(tryLogin, 500);
}
            `,
            allFrames: false,
            frameId: 0
        });
    },
    onRewardNavigation: function (details) {
        chrome.tabs.executeScript(details.tabId, {
            file: '/inject/rewardlink.js',
            runAt: 'document_end',
            allFrames: false,
            frameId: details.frameId
        });
    },
    onFBNavigation: function (details) {
        const tabId = details.tabId;
        if (details.frameId == 0 && Preferences.getValue('linkGrabEnabled') && details.url.indexOf('/dialog/') < 0 && Tab.canBeInjected(tabId)) {
            console.log('Injecting LinkGrabber');
            const details = {
                file: '/js/Dialog.js',
                runAt: 'document_end',
                allFrames: false,
                frameId: 0
            };
            chrome.tabs.executeScript(tabId, details, function () {
                details.file = '/inject/linkgrabber.js';
                chrome.tabs.executeScript(tabId, details, function () {
                    delete details.file;
                    details.code = '';
                    for (const key of ['language', 'linkGrabButton', 'linkGrabKey', 'linkGrabSort', 'linkGrabConvert', 'linkGrabEnabled'])
                        details.code += 'options.' + key + '=' + JSON.stringify(Preferences.getValue(key)) + ';';
                    details.code += 'initialize();';
                    chrome.tabs.executeScript(tabId, details, function () { });
                });
            });

        }
    },
    onRemoved: function (tabId, _removeInfo) {
        if (tabId == Tab.guiTabId) Tab.guiTabId = null;
        if (tabId == Tab.gameTabId) {
            Tab.gameTabId = null;
        }
    },
    onUpdated: function (tabId, changeInfo, tab) {
        if ('url' in changeInfo) Tab.detectTab(tab);
    },
    excludeFromInjection: function (tabId, flag = true) {
        if (flag) Tab.tabExcluded[tabId] = true;
        else delete Tab.tabExcluded[tabId];
    },
    canBeInjected: function (tabId) {
        return !(tabId in Tab.tabExcluded) && !(0 in Tab.tabExcluded);
    },
    detectTab: function (tab) {
        Tab.onRemoved(tab.id);
        const info = Tab.detect(tab.url);
        if (info.isGUI) Tab.guiTabId = tab.id;
        else if (info.isGame) Tab.gameTabId = tab.id;
    },
    detectAll: function () {
        Tab.guiTabId = Tab.gameTabId = null;
        return new Promise(function (resolve, _reject) {
            chrome.tabs.query({}, function (tabs) {
                tabs.forEach(Tab.detectTab);
                resolve();
            });
        });
    },
    detect: function (url) {
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
            if (arr[2] == 'diggysadventure') {
                result.isGame = result.isPortal = true;
            }
        }
        return result;
    },
    showTab: function (kind, url, urlIfExist) {
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
    showGUI: function () {
        Tab.showTab('isGUI', Tab.GUI_URL, null);
    },
    showGame: function (options) {
        let values = (options || '') + ' ' + (Data.generator ? Data.generator.game_site + ' ' + Data.generator.game_platform : '');
        values = values.toLowerCase().split(' ');
        const site = values.find(item => item == 'facebook' || item == 'portal');
        const url = (site == 'portal' ? 'https://portal.pixelfederation.com/diggysadventure/' : 'https://apps.facebook.com/diggysadventure/') + '?webgl';
        Tab.showTab('isGame', url, values.includes('keep') ? null : url);
    },
    focus: function (tabId, flag) {
        if (tabId) chrome.tabs.get(tabId, function (tab) {
            if (tab.windowId) chrome.windows.update(tab.windowId, {
                focused: flag
            });
        });
    },
    open: function (url, background = false) {
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
let adminLevel = 0;
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
        new Language('da', 'DK', 'Danish', 'Dansk', 'DK'),
        new Language('de', 'DE', 'German', 'Deutsch', 'DE,AT,CH,LI,LU'),
        new Language('el', 'GR', 'Greek', '\u0395\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac' /* 'Ελληνικά' */, 'GR'),
        new Language('en', 'EN', 'English', 'English', 'US,AU,BZ,CA,GB,IE,IN,JM,MY,NZ,PH,SG,TT,ZA,ZW'),
        new Language('es', 'ES', 'Spanish (Castilian)', 'Espa\u00f1ol (Castellano)', 'ES,AR,BO,CL,CO,CR,DO,EC,GT,HN,MX,NI,PA,PE,PR,PY,SV,US,UY,VE'),
        new Language('fr', 'FR', 'French', 'Fran\u00e7ais', 'FR,BE,CA,CH,LU,MC'),
        new Language('hu', 'HU', 'Hungarian', 'Magyar', 'HU'),
        new Language('it', 'IT', 'Italian', 'Italiano', 'IT,CH'),
        new Language('pl', 'PL', 'Polish', 'Polski', 'PL'),
        new Language('pt', 'PT', 'Portuguese (BR)', 'Portugu\u00eas (BR)', 'PT,BR'),
        new Language('ru', 'RU', 'Russian', '\u0420\u0443\u0441\u0441\u043a\u0438\u0439', 'RU,MD,UA'),
        new Language('tr', 'TR', 'Turkish', 'T\u00fcrk\u00e7e', 'TR'),
        // OTHER (GAME)
        new Language('bg', 'BG', 'Bulgarian', '\u0431\u044a\u043b\u0433\u0430\u0440\u0441\u043a\u0438' /* 'български' */, 'BG'),
        new Language('cs', 'CZ', 'Czech', '\u010ce\u0161tina', 'CZ'),
        new Language('fi', 'FI', 'Finnish', 'Suomi', 'FI'),
        new Language('nl', 'NL', 'Dutch ', 'Nederlands', 'NL,BE'),
        new Language('ro', 'RO', 'Romanian', 'Rom\u00e2n\u0103', 'RO,MD'),
        new Language('se', 'SE', 'Swedish', 'Svenska', 'SE,FI'),
        new Language('sk', 'SK', 'Slovak', 'Sloven\u010dina', 'SK'),
    ],
    guiLanguages: 'da,de,el,en,es,fr,hu,it,pl,pt,ru,tr'.split(','),
    acceptedLanguages: [],
    detectLanguage: function (lang) {
        return [].concat(lang, Data.acceptedLanguages)
            .map(id => {
                const match = String(id || '').match(/([a-z]+)[^a-z]?/i);
                return match ? match[1].toLowerCase() : '';
            }).find(id => Data.guiLanguages.includes(id)) || 'en';
    },
    get adminLevel() { return adminLevel; },
    admins: {
        1: ',\
45380,93887,126394,160666,160699,272209,274394,300786,330575,341206,432156,\
583351,724532,1364119,1383237,2585017,2629798,2892099,3094381,3249234,3280114,\
3341311,3386911,3450569,3588711,3612676,3717410,3727387,3741439,3780544,3836341,\
3970499,4010790,4039296,4096091,4103286,4135364,4193131,4348337,4348743,4381557,\
4485902,4705505,4784487,4917095,4979156,5009209,5176586,5257073,5594921,5703231,\
5895942,6180698,6211963,6226998,6307883,6715455,6849088,7554792,9944465,10347656,\
10484489,10887338,11530133,14220776,15545185,16570740,17362365,18096732,19229879,\
19728318,20653338,20904021,21378282,24440023,30529001,35108410,38554475,\
11703399,',
        2: ',5703231,10484489,10609447,11530133,17362365,'
    },
    setGenerator: function (generator) {
        generator = generator || {};
        // generator.versionParameter = generator.to_version ? '?ver=' + generator.to_version : '';
        generator.versionParameter = '';
        Data.generator = generator;
        const search = ',' + (generator.player_id || '0') + ',';
        adminLevel = Object.keys(Data.admins).reduce((v, n) => Math.max(v, Data.admins[n].indexOf(search) >= 0 ? +n : 0), 0);
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
        tx.objectStore('Files').getAll().then(values => {
            const mineCache = [];
            for (const file of values) {
                if (file.id == 'generator') Data.setGenerator(file.data);
                if (file.id == 'localization') Data.storeLocalization(file);
                if (file.id == 'gcInfo') Data.removegcInfo();
                if (file.id == 'repeatables') Data.repeatables = file.data || {};
                if (file.id == 'expByMaterial') Data.pillars.expByMaterial = file.data;
                if (file.id == 'loc_prog') Data.loc_prog = file.data;
                if (file.id.startsWith('mine_')) mineCache.push(file.data);
            }
            Data.mineCache = mineCache.sort((a, b) => b.time - a.time);
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
    initCollections: function () {
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
        'MAP005,MAP006,CT002,CT011,MAP018,CT012,CT013,MAP021,MAP038,CT014,CT013,CT016,MAP039,,MAP050'.split(',').forEach(function (name_loc, index) {
            setItem(index + 1, name_loc, '/img/skins/' + (index + 1) + '.png');
        });
        Data.colSkins = col;

        Data.region2Skin = [1, 2, 5, 8, 9, 13, 15];

        // Regions
        col = {};
        for (let region = Data.getMaxRegion(); region >= 1; region--) col[region] = Data.colSkins[Data.getSkinFromRegion(region)];
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
    showDBSize: function () {
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
    storeSimple: function (id, data) {
        const file = {};
        file.id = id;
        file.time = getUnixTime();
        file.data = data;
        Data.store(file);
    },
    store: function (file) {
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
                    Data.checkRepeatablesStatus();
                    Data.checkLuckyCards();
                });
            });
            // Reset some values and pre-load childs
            Synchronize.energyId = 0;
            Synchronize.repeatables = '';
            Data.getFile('childs');
        } else {
            if (file.id == 'localization') Data.storeLocalization(file);
            tx = Data.db.transaction('Files', 'readwrite');
            tx.objectStore('Files').put(file);
        }
        return tx.complete;
    },
    getLanguageIdFromUrl: function (url) {
        const match = url && url.match(/\/([A-Z][A-Z])\/localization\./);
        return match && match[1];
    },
    requiresFullLanguage: false,
    checkLocalization: function (url, lang) {
        const changes = Data.generator && Data.generator.file_changes;
        if (!changes) return;
        let gameLanguage, key;
        const find = lang => key = (gameLanguage = lang) && Object.keys(changes).find(key => key.endsWith('localization.csv') && Data.getLanguageIdFromUrl(key) == lang);
        find(Preferences.getValue('gameLanguage')) || find(Data.getLanguageIdFromUrl(url)) || find(lang) || find('EN');
        if (!key) return;
        const file = {
            id: 'localization',
            url: Data.generator.cdn_root + key + '?ver=' + Data.generator.file_changes[key],
            version: Data.generator.file_changes[key],
            revision: Parser.parse_localization_revision,
            time: getUnixTime()
        };
        const id1 = [Data.localization.languageId, Data.localization.version, Data.localization.revision].join(',');
        const id2 = [gameLanguage, file.version, file.revision].join(',');
        if (id1 != id2 || (Data.requiresFullLanguage && Data.localization.data && !Data.localization.data.isFull)) {
            return fetch(file.url).then(function (response) {
                return response.text();
            }).then(function (text) {
                Parser.requiresFullLanguage = Data.requiresFullLanguage;
                file.data = Parser.parse(file.id, text);
                Data.store(file);
            });
        }
    },
    storeLocalization: function (file) {
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
    getCampWindmillTime: function (camp) {
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
    getRepeatables: function () {
        // Collect all repeatables in the game
        // Make sure that all files are loaded, before calling this method
        const events = Data.files.events;
        const repeatables = {};
        for (let rid = Data.getMaxRegion(); rid >= 0; rid--) {
            const locations = Data.files['locations_' + rid];
            if (!locations) return {};
            for (const loc of Object.values(locations)) {
                if (+loc.reset_cd <= 0 || ![].concat(loc.rotation).length) continue;
                if (+loc.test || !+loc.order_id) continue;
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
    setTimer: function (fn, timeout) {
        const key = fn.name;
        const data = Data.timers[key] = Data.timers[key] || {};
        if (data.handle) clearTimeout(data.handle);
        delete data.handle;
        if (timeout > 0) {
            data.handle = setTimeout(() => { delete data.handle; fn(); }, timeout);
            data.nextTime = Date.now() + timeout;
        }
    },
    checkRepeatablesStatus: function () {
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
    findLuckyCardsAd: function (setValue) {
        let ad = null;
        const generator = Data.generator;
        if (generator) {
            let video_ad = generator.video_ad;
            if (!video_ad) video_ad = generator.video_ad = {};
            let item = video_ad.item;
            if (!Array.isArray(item)) item = video_ad.item = [];
            ad = item.find(ad => ad.type == 'wheel_of_fortune');
            if (!ad) item.push(ad = { type: 'wheel_of_fortune' });
            ad.watched_at = setValue || +ad.watched_at || 0;
        }
        return ad;
    },
    checkLuckyCards: function () {
        const ad = Data.findLuckyCardsAd();
        const offset = parseInt(Preferences.getValue('badgeLuckyCardsOffset'), 10) || 0;
        const now = getUnixTime() + offset;
        const next = ad ? 8 * 3600 + ad.watched_at - Synchronize.offset : 0;
        const diff = next - now;
        const active = diff <= 0;
        Data.setTimer(Data.checkLuckyCards, diff > 0 ? diff * 1000 : 0);
        Synchronize.signal('luckycards', Synchronize.expandDataWithSound({ active, next }, 'badgeLuckyCards'));
    },
    getPillarsInfo: function () {
        // Collect all pillars in the game and compute XP by material
        // Make sure that all files are loaded, before calling this method
        const time = (Data.generator && Data.generator.time) || 0;
        if (time != Data.pillars.time) {
            /* New logic using heuristic */
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
            if (JSON.stringify(Data.pillars.expByMaterial) !== JSON.stringify(expByMaterial)) Data.storeSimple('expByMaterial', expByMaterial);
            Object.assign(Data.pillars, { time, expByMaterial, sales });
        }
        return Data.pillars;
    },
    //#region loc_prog
    getLocProg: function (lid) {
        let prog = Data.loc_prog[lid];
        if (!prog) {
            prog = { id: lid, prog: 0 };
            prog = Object.assign(prog, Data.generator && Data.generator.loc_prog && Data.generator.loc_prog[lid]);
            Data.loc_prog[lid] = prog;
        }
        return prog;
    },
    storeLocProgDelayed: function () {
        Data.storeSimple('loc_prog', Data.loc_prog);
    },
    storeLocProg: function () {
        Data.setTimer(Data.storeLocProgDelayed, 5000);
    },
    //#endregion
    //#region Neighbors
    getNeighbour: function (id) {
        return Data.neighbours[id];
    },
    getNeighbours: function () {
        return Data.neighbours;
    },
    saveNeighbourList: {},
    saveNeighbourDelayed: function () {
        const tx = Data.db.transaction('Neighbours', 'readwrite');
        tx.objectStore('Neighbours').bulkPut(Object.values(Data.saveNeighbourList));
        Data.saveNeighbourList = {};
    },
    saveNeighbour: function (neighbour) {
        if (!neighbour) return;
        const neighbours = [].concat(neighbour);
        if (!neighbours.length) return;
        Data.setTimer(Data.saveNeighbourDelayed, 500);
        neighbours.forEach(neighbour => Data.saveNeighbourList[neighbour.id] = neighbour);
    },
    convertNeighbourExtra: function (extra) {
        if (!extra) return;
        // Convert gifts to new compact format
        if (extra.gifts) {
            extra.g = extra.gifts.map(g => [g.id, g.gid, g.time]);
            delete extra.gifts;
        }
    },
    removegcInfo: function () {
        const tx = Data.db.transaction('Files', 'readwrite');
        tx.objectStore('Files').delete('gcInfo');
    },
    getGCInfo: function () {
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
    getFriend: function (id) {
        return Data.friends[id];
    },
    getFriends: function () {
        return Data.friends;
    },
    saveFriendList: {},
    removeFriendList: {},
    saveFriendDelayed: function () {
        const tx = Data.db.transaction('Friends', 'readwrite');
        const store = tx.objectStore('Friends');
        const items = Object.values(Data.saveFriendList);
        if (items.length) store.bulkPut(items);
        Data.saveFriendList = {};
        for (const item of Object.values(Data.removeFriendList)) store.delete(item.id);
        Data.removeFriendList = {};
    },
    saveFriend: function (friend, remove = false) {
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
    removeFriend: function (friend) {
        Data.saveFriend(friend, true);
    },
    friendsCaptured: function (data) {
        if (!data) return;
        const newFriends = [].concat(data);
        if (newFriends.length == 0) return;
        const oldFriendsById = Object.assign({}, Data.getFriends());
        const oldFriendsByUri = {};
        Object.values(oldFriendsById).forEach(friend => oldFriendsByUri[friend.uri] = friend);
        const friends = {};
        const now = getUnixTime();
        // We retain the old association (score and uid)
        for (const friend of newFriends) {
            friend.tc = now;
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
        // We remove all old friends
        Data.removeFriend(Object.values(oldFriendsById));
        Data.saveFriend(Object.values(friends));
        Data.friends = friends;
        Data.friendsCollectDate = now;
        Preferences.setValue('friendsCollectDate', now);
        chrome.runtime.sendMessage({ action: 'friends_analyze' }, () => hasRuntimeError('FRIENDSCAPTURED'));
    },
    //#endregion
    //#region RewardLinks
    getRewardLink: function (id) {
        return Data.rewardLinks[id];
    },
    getRewardLinks: function () {
        return Data.rewardLinks;
    },
    saveRewardLinkList: {},
    removeRewardLinkList: {},
    saveRewardLinksHistory: false,
    saveRewardLinkDelayed: function () {
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
    saveRewardLink: function (rewardLink, remove = false) {
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
    removeRewardLink: function (rewardLink) {
        Data.saveRewardLink(rewardLink, true);
    },
    removeExpiredRewardLinks: function () {
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
    addRewardLinks: function (rewardsOrArray) {
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
                    const pal = neighbours.find(pal => pal.fb_id == reward.cid);
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
    getString: function (id) {
        return id in Data.localization.data ? Data.localization.data[id] : '#' + id;
    },
    getObjectCollection: function (type) {
        if (type == 'region') return Data.colRegions;
        else if (type == 'skin') return Data.colSkins;
        else if (type == 'system') return Data.colSystems;
        else if (type == 'addon_building') return Data.colAddonBuildings;
        else if (type == 'material') return Data.files.materials;
        else if (type == 'usable') return Data.files.usables;
        else if (type == 'token') return Data.files.tokens;
        else if (type == 'building') return Data.files.buildings;
        else if (type == 'decoration') return Data.files.decorations;
        else if (type == 'event') return Data.files.events;
        else if (type == 'production') return Data.files.productions;
        else if (type == 'tablet') return Data.files.tablets;
        else if (type == 'windmill') return Data.files.windmills;
        else if (type == 'collection') return Data.files.collections;
        else if (type == 'artifact') return Data.files.artifacts;
        else if (type == 'diggy_skin') return Data.files.diggy_skins;
        return null;
    },
    getObject: function (type, id) {
        if (type == 'eventpass_xp') return Data.colEventpassXp[1];
        const col = Data.getObjectCollection(type);
        return col && col[id];
    },
    getObjectImage: function (type, id, small) {
        const item = Data.getObject(type, id);
        if (!item) return '';
        const base = Data.generator.cdn_root + 'mobile/graphics/';
        if (type == 'windmill') return base + 'windmills/greece_windmill.png' + Data.generator.versionParameter;
        const asset = type == 'event' ? item.shop_icon_graphics : item.mobile_asset;
        if (!asset) return '';
        if (asset[0] == '/') return asset;
        const filename = encodeURIComponent(asset);
        if (type == 'decoration') return base + 'decorations/' + filename + '.png' + Data.generator.versionParameter;
        if (type == 'diggy_skin') return base + 'gui/diggy_skin/' + filename + '.png' + Data.generator.versionParameter;
        const suffix = (small && (type == 'material' || type == 'usable' || type == 'token')) ? '_small' : '';
        return base + 'all/' + filename + suffix + '.png' + Data.generator.versionParameter;
    },
    getObjectName: function (type, id) {
        const item = Data.getObject(type, id);
        const name_loc = item && item.name_loc;
        return name_loc ? Data.getString(name_loc) : '#' + type + id;
    },
    getObjectDesc: function (type, id) {
        const item = Data.getObject(type, id);
        const desc = item && item.desc;
        return desc ? Data.getString(desc) : '';
    },
    getRegionFromSkin: function (id) {
        return this.region2Skin.indexOf(id) + 1;
    },
    getSkinFromRegion: function (id) {
        return this.region2Skin[id - 1] || 0;
    },
    getMaxRegion: function () {
        return this.region2Skin.length;
    },
    getSound: function (name) {
        return name && Data.generator && Data.generator.cdn_root + 'webgl_client/embedded_assets/sounds/' + name + '.mp3';
    },
    //#endregion
    //#region LAST ENTERED MINE
    lastEnteredMine: null,
    lastEnteredMineProgress: null,
    lastViewedMine: null,
    mineCache: [],
    addMine: function (mine, progress) {
        const mines = asArray(mine).reverse();
        for (const mine of mines) {
            const { id: lid, level_id: fid } = mine;
            const index = Data.mineCache.findIndex(m => m.id == lid && m.level_id == fid);
            mine._p = mine._p || (index >= 0 ? Data.mineCache[index]._p : null) || { links: {} };
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
            if (index >= 0) Data.mineCache.splice(index, 1);
            Data.mineCache.unshift(mine);
        }
        Data.saveMine(mine);
        if (Data.mineCache.length <= MINECACHE_LIMIT) return;
        // Cache is at its limit, get all the mine id in the cache order
        const hash = {};
        const list = [];
        const listRep = [];
        const showRepeatables = Preferences.getValue('mapShowRepeatables');
        Data.mineCache.forEach((m, index) => {
            if (!(m.id in hash)) {
                hash[m.id] = true;
                if (showRepeatables || index == 0 || !(m.id in Data.repeatables)) list.push(m.id);
                else listRep.push(m.id);
            }
        });
        if (!showRepeatables) listRep.forEach(id => list.push(id));
        while (Data.mineCache.length >= MINECACHE_LIMIT) {
            // Get the last used location id and remove all mines for that location
            const removeId = list.pop();
            Data.removeMine(Data.mineCache.filter(m => m.id == removeId));
            Data.mineCache = Data.mineCache.filter(m => m.id != removeId);
        }
    },
    setLastEnteredMine: function (mine) {
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
    saveMineDelayed: function () {
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
    saveMine: function (mine, remove = false) {
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
    removeMine: function (mine) {
        Data.saveMine(mine, true);
    },
    removeStoredMines: function (mineId) {
        const minesId = asArray(mineId).map(o => +o || 0);
        const mines = Data.mineCache.filter(m => minesId.includes(m.id));
        if (mines.length) {
            Data.removeMine(mines);
            Data.mineCache = Data.mineCache.filter(m => !minesId.includes(m.id));
        }
    },
    //#endregion
    //#region FILES
    unusedFiles: {
        'buildings_actions': true
    },
    checkFile: function (name, version) {
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
    getConfigValue: function (name, defaultValue = 0) {
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
    signal: function (action, data, delayed) {
        let message = action;
        if (typeof action == 'string') {
            message = {};
            message.action = action;
            if (data) message.data = data;
        }
        if (delayed) return Synchronize.delayedSignals.push(message);
        chrome.runtime.sendMessage(message, () => hasRuntimeError('SYNC1'));
        chrome.tabs.sendMessage(Tab.gameTabId, message, () => hasRuntimeError('SYNC2'));
    },
    signalMineAction: function (data) {
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
    expandDataWithSound: function (data, prefName) {
        data.volume = Preferences.getValue(prefName + 'Sound') ? parseInt(Preferences.getValue(prefName + 'Volume')) || 0 : 0;
        data.sound = data.volume ? Data.getSound(Preferences.getValue(prefName + 'SoundName')) : '';
        return data;
    },
    repeatables: '',
    signalRepeatables: function (list) {
        const repeatables = list.map(o => o.lid).join(',');
        if (repeatables != Synchronize.repeatables) {
            Synchronize.repeatables = repeatables;
            Synchronize.signal('repeatables', Synchronize.expandDataWithSound({ list }, 'badgeRepeatables'));
        }
    },
    process: function (postedXml, responseText) {
        const posted = Parser.parse('any', postedXml);
        // eslint-disable-next-line no-unused-vars
        if (!posted) return;

        const response = responseText && Parser.parse('any', responseText);
        Synchronize.time = Math.floor(response ? +response.time : +posted.client_time);
        Synchronize.offset = Synchronize.time - getUnixTime();

        Synchronize.delayedSignals = [];

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
    setLastLocation: function (lid) {
        if (lid <= 0) return null;
        this.last_lid = lid;
        return Data.getLocProg(lid);
    },
    setCustomList: function (action, task, taskResponse) {
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
    handlers: {
        visit_camp: function (action, _task, taskResponse, _response) {
            if (!taskResponse || !taskResponse.camp) return;
            const neighbourId = taskResponse.neigh_id;
            const camp = Data.lastVisitedCamp = taskResponse.camp;
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
                pal.extra.wmtime = Data.getCampWindmillTime(camp);
                Data.saveNeighbour(pal);
            }
            Synchronize.signal(action, neighbourId);
        },
        place_windmill: function (action, task, _taskResponse, _response) {
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
            }
        },
        enter_mine: function (action, task, taskResponse, _response) {
            Synchronize.signalEnergy(0);
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
        change_level: function (action, task, taskResponse, _response) {
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
        speedup_reset: function (_action, task, _taskResponse, _response) {
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
        mine: function (action, task, _taskResponse, _response) {
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
        drag_object: function (action, task, _taskResponse, _response) {
            Synchronize.signalMineAction({ action, x: +task.column, y: +task.row, direction: task.direction, type: task.type });
        },
        use_beacon: function (action, task, _taskResponse, _response) {
            Synchronize.signalMineAction({ action, x: +task.column, y: +task.row, cx: +task.cur_column, cy: +task.cur_row });
        },
        manipulate_object: function (action, task, _taskResponse, _response) {
            Synchronize.signalMineAction({ action, x: +task.column, y: +task.row, cx: +task.cur_column, cy: +task.cur_row, direction: task.direction });
        },
        pick_child: function (action, task, _taskResponse, _response) {
            Synchronize.signalMineAction({ action, x: +task.column, y: +task.row, cx: +task.cur_column, cy: +task.cur_row });
        },
        pick_npc: function (action, task, _taskResponse, _response) {
            Synchronize.signalMineAction({ action, x: +task.column, y: +task.row, cx: +task.cur_column, cy: +task.cur_row });
        },
        use_teleport: function (action, task, _taskResponse, _response) {
            Synchronize.signalMineAction({ action, x: +task.column, y: +task.row });
        },
        leave_mine: function (action, task, _taskResponse, _response) {
            Synchronize.signalMineAction({ action, loc_id: +task.loc_id, level: +task.level, cx: +task.cur_column, cy: +task.cur_row });
        },
        process_waiting_rewards: function (_action, _tast, taskResponse, _response) {
            if (taskResponse && taskResponse.video_ad_type == 'wheel_of_fortune') {
                Data.findLuckyCardsAd(+taskResponse.video_ad_watched_at);
                Data.checkLuckyCards();
            }
        },
        cl_add: function (action, task, taskResponse, _response) {
            Synchronize.setCustomList(action, task, taskResponse);
        },
        cl_remove: function (action, task, taskResponse, _response) {
            Synchronize.setCustomList(action, task, taskResponse);
        },
        friend_child_charge: function (action, task, _taskResponse, _response) {
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
    processUnGift: function (ungift, time, neighbours, factions) {
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
    processGraph: function (result) {
        try {
            const json = JSON.parse(result);
            if (json.id) {
                const pals = Object.values(Data.neighbours).filter(pal => pal.fb_id === json.id).filter(pal => {
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
    processXhr: function (detail) {
        const { type, kind, lang, request, response } = detail;
        if (kind == 'graph') return this.processGraph(response);
        const isError = type == 'error';
        if (isError) return Badge.setIcon('red').setBackgroundColor('red');
        const isSend = type == 'send', isOk = type == 'ok';
        if (!isSend && !isOk) return;
        const isGenerator = kind == 'generator', isSynchronize = kind == 'synchronize';
        if (!isGenerator && !isSynchronize) return;
        const parameters = {};
        for (const item of (request || '').split('&')) {
            const p = item.split('=');
            parameters[decodeURIComponent(p[0])] = p.length > 1 ? decodeURIComponent(p[1]) : true;
        }
        if (Data.generator.player_id && Data.generator.player_id != parameters.player_id) {
            if (isSynchronize) return;
            if (!Preferences.getValue('disableAltGuard')) {
                if (isSend) {
                    Data.alternateAccountDetected = parameters.player_id;
                    Badge.setIcon('grey').setText('ALT').setBackgroundColor('red');
                    console.log('Request is for a different player', parameters.player_id, 'instead of', Data.generator.player_id);
                    Synchronize.signal('account_mismatch', parameters.player_id);
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
            const file = {};
            file.id = kind;
            file.time = getUnixTime();
            file.data = Parser.parse(kind, response);
            if (file.data && file.data.neighbours) {
                Synchronize.time = +file.data.time;
                Synchronize.offset = Synchronize.time - file.time;
                file.data.player_id = parameters.player_id;
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
            Synchronize.process(parameters.xml, response);
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
        daf_xhr: function (request, _sender) {
            Synchronize.processXhr(request.detail);
        },
        sendValue: function (request, sender) {
            chrome.tabs.sendMessage(sender.tab.id, request, () => hasRuntimeError('SENDVALUE'));
        },
        getPrefs: function (request) {
            return Preferences.getValues(request.keys);
        },
        showGUI: function () {
            Tab.showGUI();
        },
        gameStarted: function (request) {
            Data.lastSite = request.site;
        },
        getGCInfo: function () {
            return Data.getGCInfo();
        },
        getGCList: function (request) {
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
        reloadGame: function (request, _sender) {
            Tab.showGame(request.value);
        },
        collectRewardLink: function (request, sender) {
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
        addRewardLinks: function (request, _sender) {
            return Data.addRewardLinks(request.values);
        },
        closeWindow: function (_request, sender) {
            chrome.tabs.remove(sender.tab.id);
        },
        searchNeighbor: function (request, _sender) {
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
        friendsCaptured: function (request, sender) {
            if (request.data) Data.friendsCaptured(request.data);
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