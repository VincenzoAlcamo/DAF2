/*global chrome Parser UrlInfo idb Html Locale*/
'use strict';

//#region MISCELLANEOUS
const SECONDS_IN_A_DAY = 86400;

function hasRuntimeError() {
    // This is necessary to avoid unchecked runtime errors from Chrome
    var hasError = !!chrome.runtime.lastError;
    if (hasError) console.log('RUNTIME error: "' + chrome.runtime.lastError.message + '"');
    return hasError;
}

function getUnixTime() {
    return Math.floor(Date.now() / 1000);
}

let languageId = 'en';

function changeLocale(localeId) {
    Locale.setLocale(localeId ? languageId + '-' + localeId : chrome.i18n.getUILanguage());
}

function getMessage(id, ...args) {
    let text = chrome.i18n.getMessage(languageId + '@' + id, args);
    if (text == '' && languageId != 'en') text = chrome.i18n.getMessage('en@' + id, args);
    return text;
}

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
var Preferences = {
    handlers: {},
    getDefaults: function () {
        return {
            language: '',
            gameLanguage: '',
            locale: '',
            fixes: '',
            disableAltGuard: false,
            injectGame: true,
            resetFullWindow: true,
            fullWindow: false,
            fullWindowHeader: false,
            fullWindowSide: false,
            fullWindowLock: false,
            fullWindowTimeout: 0,
            autoClick: false,
            noGCPopup: false,
            autoLogin: false,
            gcTable: false,
            gcTableCounter: true,
            gcTableRegion: true,
            keepDebugging: false,
            removeGhosts: 0,
            confirmCollection: false,
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
            friendsCollectDate: 0
        };
    },
    init: async function () {
        Preferences.values = Preferences.getDefaults();
        return new Promise(function (resolve, _reject) {
            var keysToRemove = [];
            var valuesToSet = Object.assign({}, Preferences.values);
            chrome.storage.local.get(null, function (values) {
                hasRuntimeError();
                for (var key of Object.keys(values)) {
                    if (key in valuesToSet) {
                        delete valuesToSet[key];
                        Preferences.values[key] = values[key];
                    } else {
                        keysToRemove.push(key);
                    }
                }
                if (keysToRemove.length) chrome.storage.local.remove(keysToRemove);
                if (Object.keys(valuesToSet).length) chrome.storage.local.set(valuesToSet, function () {
                    hasRuntimeError();
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
        for (var name in changes)
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
        let data = {};
        let flag = false;
        for (let name of Object.keys(values)) {
            if (name in Preferences.values) {
                Preferences.values[name] = values[name];
                flag = true;
                data[name] = values[name];
            }
        }
        if (flag) chrome.storage.local.set(data);
    },
    getValues: function (names) {
        var result = {};
        if (names) {
            for (var name of [].concat(names)) {
                if (name in Preferences.values) result[name] = Preferences.values[name];
            }
        } else result = Object.assign({}, Preferences.values);
        return result;
    },
};
//#endregion

//#region MESSAGE HANDLING
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
                sendResponse(hasRuntimeError() ? '' : dataUrl);
            });
            return true;
        }
        if (request && request.action && request.action in Message.handlers) {
            try {
                var response = Message.handlers[request.action](request, sender);
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

        //         // Facebook dialog interceptor
        //         const dialogFilters = {
        //             url: [{
        //                 hostEquals: 'www.facebook.com',
        //                 pathContains: 'dialog/apprequests',
        //                 queryContains: 'app_id=470178856367913'
        //             }, {
        //                 hostEquals: 'www.facebook.com',
        //                 pathContains: 'dialog/apprequests',
        //                 queryContains: 'app_id=146595778757295'
        //             }, {
        //                 hostEquals: 'web.facebook.com',
        //                 pathContains: 'dialog/apprequests',
        //                 queryContains: 'app_id=470178856367913'
        //             }, {
        //                 hostEquals: 'web.facebook.com',
        //                 pathContains: 'dialog/apprequests',
        //                 queryContains: 'app_id=146595778757295'
        //             }]
        //         };
        //         chrome.webNavigation.onCompleted.addListener(Tab.onDialogCompleted, dialogFilters);

        // Add Link Grabber script to Facebook pages
        const fbFilters = {
            url: [{
                hostEquals: 'www.facebook.com'
            }, {
                hostEquals: 'web.facebook.com'
            }]
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
    //     onDialogCompleted: function (details) {
    //         console.log('onDialogCompleted', details);
    //         if (!Preferences.getValue('autoClick')) return;
    //         Tab.focus(Tab.gameTabId, true);
    //         chrome.tabs.executeScript(details.tabId, {
    //             file: '/inject/portal_autoclick.js',
    //             runAt: 'document_end',
    //             allFrames: false,
    //             frameId: details.frameId
    //         });
    //     },
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
        let tabId = details.tabId;
        if (details.frameId == 0 && Preferences.getValue('linkGrabEnabled') && details.url.indexOf('/dialog/') < 0 && Tab.canBeInjected(tabId)) {
            console.log('Injecting LinkGrabber');
            let details = {
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
                    for (let key of ['language', 'linkGrabButton', 'linkGrabKey', 'linkGrabSort', 'linkGrabConvert'])
                        details.code += key + '=' + JSON.stringify(Preferences.getValue(key)) + ';';
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
        Tab.tabExcluded[tabId] = flag;
    },
    canBeInjected: function (tabId) {
        return tabId in Tab.tabExcluded ? !Tab.tabExcluded[tabId] : true;
    },
    detectTab: function (tab) {
        Tab.onRemoved(tab.id);
        var info = Tab.detect(tab.url);
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
        var result = {};
        var urlInfo = new UrlInfo(url);
        if (url.indexOf(Tab.GUI_URL) == 0) {
            result.isGUI = true;
        } else if (urlInfo.hostname == 'apps.facebook.com') {
            if (urlInfo.pathname == '/diggysadventure/' || urlInfo.pathname == '/diggysadventure') {
                result.isGame = result.isFacebook = true;
            }
        } else if (urlInfo.hostname == 'portal.pixelfederation.com') {
            var arr = urlInfo.pathname.split('/');
            if (arr[2] == 'diggysadventure') {
                result.isGame = result.isPortal = true;
            }
        }
        return result;
    },
    showTab: function (kind, url, urlIfExist) {
        chrome.tabs.query({}, function (tabs) {
            var tab = tabs.find(tab => {
                return Tab.detect(tab.url)[kind];
            });
            if (tab) {
                chrome.windows.update(tab.windowId, {
                    focused: true
                }, function () {
                    var updateProperties = {
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
        let site = values.find(item => item == 'facebook' || item == 'portal');
        let url = (site == 'portal' ? 'https://portal.pixelfederation.com/diggysadventure/' : 'https://apps.facebook.com/diggysadventure/') + '?webgl';
        Tab.showTab('isGame', url, values.includes('keep') ? null : url);
    },
    focus: function (tabId, flag) {
        if (tabId) chrome.tabs.get(tabId, function (tab) {
            if (tab.windowId) chrome.windows.update(tab.windowId, {
                focused: flag
            });
        });
    },
    injectGame: function (tabId) {
        if (!Preferences.getValue('injectGame')) return;
        if (Preferences.getValue('resetFullWindow')) {
            Preferences.setValues({
                fullWindow: false,
                fullWindowSide: false
            });
        }
        chrome.webNavigation.getAllFrames({
            tabId: tabId
        }, function (frames) {
            var frame = frames.find(frame => frame.parentFrameId == 0 && frame.url.includes('/miner/'));
            if (!frame) return;
            var details = {
                file: '/inject/game.js',
                allFrames: false,
                frameId: 0
            };
            console.log('Inject game page');
            Badge.setIcon('grey').setText('').setBackgroundColor('green');
            chrome.tabs.executeScript(tabId, details, function () {
                if (hasRuntimeError()) return Badge.setIcon('red').setBackgroundColor('red');
                details.frameId = frame.frameId;
                console.log('Inject iframe page');
                chrome.tabs.executeScript(tabId, details, function () {
                    if (hasRuntimeError()) return Badge.setIcon('red').setBackgroundColor('red');
                });
            });
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
var Data = {
    db: null,
    REWARDLINKS_DAILY_LIMIT: 100,
    REWARDLINKS_VALIDITY_DAYS: 7,
    REWARDLINKS_REFRESH_HOURS: 22,
    REWARDLINKS_REMOVE_DAYS: 10,
    REWARDLINKS_HISTORY_MAXITEMS: 10000,
    GC_REFRESH_HOURS: 22,
    languages: [
        new Language('da', 'DK', 'Danish', 'Dansk', 'DK'),
        new Language('de', 'DE', 'German', 'Deutsch', 'DE,AT,CH,LI,LU'),
        new Language('el', 'GR', 'Greek', '\u0395\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac' /* 'Ελληνικά' */, 'GR'),
        new Language('en', 'EN', 'English', 'English', 'US,AU,BZ,CA,GB,IE,IN,JM,MY,NZ,PH,SG,TT,ZA,ZW'),
        new Language('es', 'ES', 'Spanish (Castilian)', 'Espa\u00f1ol (Castellano)', 'ES,AR,BO,CL,CO,CR,DO,EC,GT,HN,MX,NI,PA,PE,PR,PY,SV,US,UY,VE'),
        new Language('fr', 'FR', 'French', 'Fran\u00e7ais', 'FR,BE,CA,CH,LU,MC'),
        new Language('it', 'IT', 'Italian', 'Italiano', 'IT,CH'),
        new Language('pl', 'PL', 'Polish', 'Polski', 'PL'),
        new Language('pt', 'PT', 'Portuguese ', 'Portugu\u00eas', 'PT,BR'),
        // OTHER (GAME)
        new Language('bg', 'BG', 'Bulgarian', '\u0431\u044a\u043b\u0433\u0430\u0440\u0441\u043a\u0438' /* 'български' */, 'BG'),
        new Language('cs', 'CZ', 'Czech', '\u010ce\u0161tina', 'CZ'),
        new Language('fi', 'FI', 'Finnish', 'Suomi', 'FI'),
        new Language('hu', 'HU', 'Hungarian ', 'Magyar', 'HU'),
        new Language('nl', 'NL', 'Dutch ', 'Nederlands', 'NL,BE'),
        new Language('ro', 'RO', 'Romanian ', 'Rom\u00e2n\u0103', 'RO,MD'),
        new Language('ru', 'RU', 'Russian ', '\u0420\u0443\u0441\u0441\u043a\u0438\u0439', 'RU,MD,UA'),
        new Language('se', 'SE', 'Swedish ', 'Svenska', 'SE,FI'),
        new Language('sk', 'SK', 'Slovak ', 'Sloven\u010dina', 'SK'),
        new Language('tr', 'TR', 'Turkish ', 'T\u00fcrk\u00e7e', 'TR'),
    ],
    guiLanguages: 'da,de,el,en,es,fr,it,pl,pt'.split(','),
    acceptedLanguages: [],
    detectLanguage: function (lang) {
        return [].concat(lang, Data.acceptedLanguages)
            .map(id => {
                let match = String(id || '').match(/([a-z]+)[^a-z]?/i);
                return match ? match[1].toLowerCase() : '';
            }).find(id => Data.guiLanguages.includes(id)) || 'en';
    },
    resetGenerator: function () {
        Data.generator = {};
    },
    init: async function () {
        await new Promise(function (resolve, _reject) {
            chrome.i18n.getAcceptLanguages(items => {
                if (!hasRuntimeError()) Data.acceptedLanguages = items;
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
        var tx = Data.db.transaction(['Files', 'Neighbours', 'Friends', 'RewardLinks'], 'readonly');
        /*
        tx.objectStore('Files').iterateCursor(cursor => {
            if (!cursor) return;
            Data.storeGame(cursor.value);
            cursor.continue();
        });
        */
        Data.initCollections();
        Data.generator = {};
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
        tx.objectStore('Files').getAll().then(values => {
            for (let file of values) {
                if (file.id == 'generator') Data.generator = file.data || {};
                if (file.id == 'localization') Data.storeLocalization(file);
                if (file.id == 'gcInfo') Data.removegcInfo();
                if (file.id == 'repeatables') Data.repeatables = file.data || {};
                if (file.id == 'expByMaterial') Data.pillars.expByMaterial = file.data;
            }
        });
        tx.objectStore('Neighbours').getAll().then(values => {
            for (let pal of values) {
                Data.convertNeighbourExtra(pal.extra);
                Data.neighbours[pal.id] = pal;
            }
        });
        tx.objectStore('Friends').getAll().then(values => {
            for (let friend of values) {
                // Convert object to smaller format
                delete friend.processed;
                friend.tc = friend.tc || friend.timeCreated;
                delete friend.timeCreated;
                Data.friends[friend.id] = friend;
            }
        });
        tx.objectStore('RewardLinks').getAll().then(values => {
            for (let rewardLink of values) {
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
        var col;

        function setItem(def_id, name_loc, mobile_asset) {
            if (!name_loc) return;
            var item = {};
            item.def_id = def_id;
            item.name_loc = name_loc;
            if (mobile_asset) item.mobile_asset = mobile_asset;
            col[item.def_id] = item;
        }

        // Skins
        col = {};
        'MAP005,MAP006,CT002,CT011,MAP018,CT012,CT013,MAP021,MAP038,CT014,CT013,CT016,MAP039'.split(',').forEach(function (name_loc, index) {
            setItem(index + 1, name_loc, '/img/skins/' + (index + 1) + '.png');
        });
        Data.colSkins = col;

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
        var db;
        var storesizes = [];

        function openDatabase() {
            return new Promise(function (resolve, _reject) {
                var dbname = 'DAF';
                var request = window.indexedDB.open(dbname);
                request.onsuccess = function (event) {
                    db = event.target.result;
                    resolve(db.objectStoreNames);
                };
            });
        }

        function getObjectStoreData(storename) {
            return new Promise(function (resolve, reject) {
                var trans = db.transaction(storename, IDBTransaction.READ_ONLY);
                var store = trans.objectStore(storename);
                var items = [];
                trans.oncomplete = function (_evt) {
                    var szBytes = toSize(items);
                    var szMBytes = (szBytes / 1024 / 1024).toFixed(2);
                    storesizes.push({
                        'Store Name': storename,
                        'Items': items.length,
                        'Size': szMBytes + 'MB (' + szBytes + ' bytes)'
                    });
                    resolve();
                };
                var cursorRequest = store.openCursor();
                cursorRequest.onerror = function (error) {
                    reject(error);
                };
                cursorRequest.onsuccess = function (evt) {
                    var cursor = evt.target.result;
                    if (cursor) {
                        items.push(cursor.value);
                        cursor.continue();
                    }
                };
            });
        }

        function toSize(items) {
            var size = 0;
            for (var i = 0; i < items.length; i++) {
                var objectSize = JSON.stringify(items[i]).length;
                size += objectSize * 2;
            }
            return size;
        }

        openDatabase().then(function (stores) {
            var PromiseArray = [];
            for (var i = 0; i < stores.length; i++) {
                PromiseArray.push(getObjectStoreData(stores[i]));
            }
            Promise.all(PromiseArray).then(function () {
                console.table(storesizes);
            });
        });
    },
    storeSimple: function (id, data) {
        let file = {};
        file.id = id;
        file.time = getUnixTime();
        file.data = data;
        Data.store(file);
    },
    store: function (file) {
        console.log('Would store', file);
        if (!file.data) return;
        var tx;
        if (file.id == 'generator') {
            tx = Data.db.transaction(['Files', 'Neighbours'], 'readwrite');
            let neighbours = file.data.neighbours;
            delete file.data.neighbours;
            // Process un_gifts
            var un_gifts = file.data.un_gifts;
            Synchronize.processUnGift(un_gifts && un_gifts.item, +file.data.time, neighbours);
            delete file.data.un_gifts;
            // Remove the player itself from the neighbors, but store their fb_id
            let pal = neighbours[file.data.player_id];
            file.data.fb_id = pal ? pal.fb_id : Data.generator && Data.generator.fb_id;
            delete neighbours[file.data.player_id];
            Data.neighbours = neighbours;
            Data.generator = file.data;
            let store = tx.objectStore('Neighbours');
            // We don't need to wait for the operation to be completed
            store.clear().then(() => store.bulkPut(Object.values(neighbours)));
            tx.objectStore('Files').put(file).then(() => {
                Data.checkLocalization('', file.data.game_language);
                Tab.detectAll().then(() => Synchronize.signal('generator'));
            });
        } else {
            if (file.id == 'localization') Data.storeLocalization(file);
            tx = Data.db.transaction('Files', 'readwrite');
            tx.objectStore('Files').put(file);
        }
        return tx.complete;
    },
    getLanguageIdFromUrl: function (url) {
        let match = url && url.match(/\/([A-Z][A-Z])\/localization\./);
        return match && match[1];
    },
    checkLocalization: function (url, lang) {
        const changes = Data.generator && Data.generator.file_changes;
        if (!changes) return;
        let gameLanguage, key;
        const find = lang => key = (gameLanguage = lang) && Object.keys(changes).find(key => key.endsWith('localization.csv') && Data.getLanguageIdFromUrl(key) == lang);
        find(Preferences.getValue('gameLanguage')) || find(Data.getLanguageIdFromUrl(url)) || find(lang) || find('EN');
        if (!key) return;
        let file = {
            id: 'localization',
            url: Data.generator.cdn_root + key + '?ver=' + Data.generator.file_changes[key],
            version: Data.generator.file_changes[key],
            revision: Parser.parse_localization_revision,
            time: getUnixTime()
        };
        let id1 = [Data.localization.languageId, Data.localization.version, Data.localization.revision].join(',');
        let id2 = [gameLanguage, file.version, file.revision].join(',');
        if (id1 != id2) {
            return fetch(file.url).then(function (response) {
                return response.text();
            }).then(function (text) {
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
        let wmduration = 7 * SECONDS_IN_A_DAY;
        if (camp && Array.isArray(camp.windmills) && camp.windmills.length >= +camp.windmill_limit) {
            // Take for each windmill the expiry date, then sort ascending
            let windmills = camp.windmills.map(wm => (wmduration + (+wm.activated)) || 0).sort();
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
            let locations = Data.files['locations_' + rid];
            if (!locations) return {};
            for (let loc of Object.values(locations)) {
                if (+loc.reset_cd <= 0) continue;
                if (+loc.test || !+loc.order_id) continue;
                // Additional checks
                if (+loc.req_quest_a == 1) continue;
                let eid = +loc.event_id || 0;
                if (eid) {
                    const event = events[eid];
                    if (!event) continue;
                    if ((',' + event.locations + ',' + event.extended_locations + ',').indexOf(',' + loc.def_id + ',') < 0) continue;
                }
                let item = {};
                item.id = +loc.def_id;
                item.cooldown = +loc.reset_cd;
                item.rotation = [];
                for (let rot of loc.rotation) {
                    let copy = {};
                    copy.level = +rot.level;
                    copy.progress = +rot.progress;
                    copy.chance = +rot.chance;
                    item.rotation.push(copy);
                }
                if (item.rotation.length) repeatables[item.id] = item;
            }
        }
        // If something is changed, store the new value
        if (JSON.stringify(Data.repeatables) !== JSON.stringify(repeatables)) Data.storeSimple('repeatables', repeatables);
        Data.repeatables = repeatables;
        return repeatables;
    },
    getPillarsInfo: function () {
        // Collect all pillars in the game and compute XP by material
        // Make sure that all files are loaded, before calling this method
        let time = (Data.generator && Data.generator.time) || 0;
        if (time != Data.pillars.time) {
            /* New logic using heuristic */
            // Get all sales: decoration, non hidden, non-event with only one requirements
            let sales = Object.values(Data.files['sales']).filter(sale => sale.type == 'decoration' && sale.hide != 1 && +sale.event_id == 0 && sale.requirements.length == 1);
            // sort descending by id (newer first)
            sales.sort((a, b) => +b.def_id - +a.def_id);
            let expByMaterial = {};
            let saleByMaterial = {};
            let setSale = (sale) => {
                if (!sale) return;
                let materialId = sale.requirements[0].material_id;
                // Gem requirement is skipped
                if (materialId == 2) return;
                // Calculate experience for one unit of material
                let exp = +sale.exp / +sale.requirements[0].amount;
                // If a sale was already detected, check that it has a bigger XP return
                if (materialId in expByMaterial && expByMaterial[materialId] >= exp) return;
                expByMaterial[materialId] = exp;
                saleByMaterial[materialId] = sale;
            };
            // Force the COIN PILLARS (decoration id = 867) in case other decoration (like ABU SIMBEL) are added in the future
            setSale(sales.find(sale => sale.object_id == 867));
            sales.forEach(setSale);
            if (JSON.stringify(Data.pillars.expByMaterial) !== JSON.stringify(expByMaterial)) Data.storeSimple('expByMaterial', expByMaterial);
            Data.pillars.time = time;
            Data.pillars.expByMaterial = expByMaterial;
            Data.pillars.sales = Object.values(saleByMaterial).map(sale => +sale.def_id);
        }
        return Data.pillars;
    },
    //#region Neighbors
    getNeighbour: function (id) {
        return Data.neighbours[id];
    },
    getNeighbours: function () {
        return Data.neighbours;
    },
    saveNeighbourHandler: 0,
    saveNeighbourList: {},
    saveNeighbourDelayed: function () {
        Data.saveNeighbourHandler = 0;
        let tx = Data.db.transaction('Neighbours', 'readwrite');
        tx.objectStore('Neighbours').bulkPut(Object.values(Data.saveNeighbourList));
        Data.saveNeighbourList = {};
    },
    saveNeighbour: function (neighbour) {
        if (!neighbour) return;
        var neighbours = [].concat(neighbour);
        if (!neighbours.length) return;
        if (Data.saveNeighbourHandler) clearTimeout(Data.saveNeighbourHandler);
        Data.saveNeighbourHandler = setTimeout(Data.saveNeighbourDelayed, 500);
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
        let tx = Data.db.transaction('Files', 'readwrite');
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
    saveFriendHandler: 0,
    saveFriendList: {},
    removeFriendList: {},
    saveFriendDelayed: function () {
        Data.saveFriendHandler = 0;
        let tx = Data.db.transaction('Friends', 'readwrite');
        var store = tx.objectStore('Friends');
        var items = Object.values(Data.saveFriendList);
        if (items.length) store.bulkPut(items);
        Data.saveFriendList = {};
        for (var item of Object.values(Data.removeFriendList)) store.delete(item.id);
        Data.removeFriendList = {};
    },
    saveFriend: function (friend, remove = false) {
        if (!friend) return;
        var friends = [].concat(friend);
        if (!friends.length) return;
        if (Data.saveFriendHandler) clearTimeout(Data.saveFriendHandler);
        Data.saveFriendHandler = setTimeout(Data.saveFriendDelayed, 500);
        for (var f of friends) {
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
        var newFriends = [].concat(data);
        if (newFriends.length == 0) return;
        var oldFriends = Object.assign({}, Data.getFriends());
        var friends = {};
        var now = getUnixTime();
        // We retain the old association (score and uid)
        for (var friend of newFriends) {
            friend.tc = now;
            var oldFriend = oldFriends[friend.id];
            if (oldFriend) {
                friend.score = oldFriend.score;
                friend.uid = oldFriend.uid;
                if (oldFriend.tc) friend.tc = oldFriend.tc;
                if (oldFriend.note) friend.note = oldFriend.note;
            }
            delete oldFriends[friend.id];
            friends[friend.id] = friend;
        }
        // We remove all old friends
        Data.removeFriend(Object.values(oldFriends));
        Data.saveFriend(Object.values(friends));
        Data.friends = friends;
        Data.friendsCollectDate = now;
        Preferences.setValue('friendsCollectDate', now);
        chrome.runtime.sendMessage({
            action: 'friends_analyze'
        });
    },
    //#endregion
    //#region RewardLinks
    getRewardLink: function (id) {
        return Data.rewardLinks[id];
    },
    getRewardLinks: function () {
        return Data.rewardLinks;
    },
    saveRewardLinkHandler: 0,
    saveRewardLinkList: {},
    removeRewardLinkList: {},
    saveRewardLinksHistory: false,
    saveRewardLinkDelayed: function () {
        Data.saveRewardLinkHandler = 0;
        let tx = Data.db.transaction('RewardLinks', 'readwrite');
        let store = tx.objectStore('RewardLinks');
        if (Data.saveRewardLinksHistory) {
            Data.saveRewardLinksHistory = false;
            if (Data.rewardLinksHistory.length > Data.REWARDLINKS_HISTORY_MAXITEMS) Data.rewardLinksHistory = Data.rewardLinksHistory.slice(-Data.REWARDLINKS_HISTORY_MAXITEMS);
            let item = {
                id: 'history',
                history: Data.rewardLinksHistory
            };
            Data.saveRewardLinkList[item.id] = item;
        }
        let items = Object.values(Data.saveRewardLinkList);
        if (items.length) store.bulkPut(items);
        Data.saveRewardLinkList = {};
        for (let item of Object.values(Data.removeRewardLinkList)) store.delete(item.id);
        Data.removeRewardLinkList = {};
    },
    saveRewardLink: function (rewardLink, remove = false) {
        if (!rewardLink) return;
        let rewardLinks = [].concat(rewardLink);
        if (!rewardLink.length) return;
        if (Data.saveRewardLinkHandler) clearTimeout(Data.saveRewardLinkHandler);
        Data.saveRewardLinkHandler = setTimeout(Data.saveRewardLinkDelayed, 500);
        for (let rl of rewardLinks) {
            if (remove) {
                let id = +rl.id;
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
        let rewards = Object.values(Data.rewardLinks);
        // check expired
        let maxExpired = 0;
        let threshold = getUnixTime() - Data.REWARDLINKS_VALIDITY_DAYS * SECONDS_IN_A_DAY;
        for (let reward of rewards) {
            if (reward.adt <= threshold || reward.cmt == -1) maxExpired = Math.max(maxExpired, +reward.id);
        }
        if (maxExpired > Data.rewardLinksData.expired) {
            // this reward is expired and its id is greater than the last recorded one -> store it
            Data.rewardLinksData.expired = maxExpired;
            Data.saveRewardLink(Data.rewardLinksData);
        }
        // remove old links
        threshold = getUnixTime() - Data.REWARDLINKS_REMOVE_DAYS * SECONDS_IN_A_DAY;
        let rewardsToRemove = rewards.filter(reward => reward.adt <= threshold);
        Data.removeRewardLink(rewardsToRemove);
    },
    addRewardLinks: function (rewardsOrArray) {
        let arr = [].concat(rewardsOrArray);
        let now = getUnixTime();
        let rewardLinksData = Data.rewardLinksData;
        let rewardLinksHistory = Data.rewardLinksHistory;
        let rewardLinksRecent = Data.rewardLinksRecent;
        let removeThreshold = now - 3600;
        let data = {};
        let flagStoreData = false;
        let flagRefresh = false;
        // remove old "Recent" rewards older than one hour
        for (let id in Object.keys(rewardLinksRecent)) {
            if (rewardLinksRecent[id] < removeThreshold) delete rewardLinksRecent[id];
        }
        let expiredId = Data.rewardLinksData.expired || 0;
        for (let reward of arr) {
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

        let save = Object.values(data);
        let count = save.length;
        if (flagStoreData || count > 0) {
            if (flagStoreData) {
                save.push(rewardLinksData);
            }
            Data.saveRewardLink(save);
        }
        if (flagRefresh) {
            chrome.runtime.sendMessage({
                action: 'rewards_update'
            });
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
        return null;
    },
    getObject: function (type, id) {
        if (type == 'eventpass_xp') return Data.colEventpassXp[1];
        var col = Data.getObjectCollection(type);
        return col && col[id];
    },
    getObjectImage: function (type, id, small) {
        var item = Data.getObject(type, id);
        if (!item) return '';
        if (type == 'windmill') return Data.generator.cdn_root + 'mobile/graphics/windmills/greece_windmill.png';
        var asset = type == 'event' ? item.shop_icon_graphics : item.mobile_asset;
        if (!asset) return '';
        if (asset[0] == '/') return asset;
        if (type == 'decoration') return Data.generator.cdn_root + 'mobile/graphics/decorations/' + asset + '.png';
        if (small && !(type == 'material' || type == 'usable' || type == 'token')) small = false;
        return Data.generator.cdn_root + 'mobile/graphics/all/' + asset + (small ? '_small' : '') + '.png';
    },
    getObjectName: function (type, id) {
        var item = Data.getObject(type, id);
        var name_loc = item && item.name_loc;
        return name_loc ? Data.getString(name_loc) : '#' + type + id;
    },
    getObjectDesc: function (type, id) {
        var item = Data.getObject(type, id);
        var desc = item && item.desc;
        return desc ? Data.getString(desc) : '';
    },
    getRegionFromSkin: function (id) {
        return [1, 2, 5, 8, 9, 13].indexOf(id) + 1;
    },
    getSkinFromRegion: function (id) {
        return [1, 2, 5, 8, 9, 13][id - 1] || 0;
    },
    getMaxRegion: function () {
        return 6;
    },
    //#endregion
    //#region FILES
    unusedFiles: {
        'buildings_actions': true
    },
    checkFile: function (name, version) {
        let result = {};
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
        var file = Data.files[result.fileName];
        // If file in cache has the same version, return it
        result.data = file && file.version == version ? Data.files[name] : null;
        return result;
    },
    getFile: async function (name, version) {
        let file = Data.checkFile(name, version);
        if (file.data) return file.data;
        delete Data.files[file.name];
        delete Data.files[file.fileName];
        if (!Data.generator || !Data.generator.cdn_root) return Promise.reject('Data has not been loaded yet');
        file.url = Data.generator.cdn_root + file.fileName + '?ver=' + file.version;
        var response = await fetch(file.url);
        var text = await response.text();
        var data = Parser.parse(file.kind, text);
        if (!data) throw `File cannot be parsed: "${file}"`;
        if (file.kind == 'erik') {
            var keys = data.__keys.filter(key => key.startsWith('@'));
            delete data.__keys;
            var items = keys.length ? (Array.isArray(data) ? data : Object.values(data)) : null;
            for (var key of keys) {
                var key2 = key.substr(1);
                var detail = await Data.getFile(name + '_' + key2);
                // Expand key
                items.forEach(item => {
                    var ids = (item[key] || '').split(',');
                    var arr = [];
                    for (var id of ids) {
                        if (id && id in detail) arr.push(detail[id]);
                    }
                    delete item[key];
                    item[key2] = arr;
                });
            }
        }
        var fixFn = Parser['fix_' + name];
        if (typeof fixFn == 'function') data = fixFn(data) || data;
        Data.files[name] = data;
        Data.files[file.fileName] = file;
        return data;
    },
    getConfigValue: function (name, defaultValue = 0) {
        var result = NaN;
        try {
            var config = Data.files.configs[Data.generator.config_id];
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
var Synchronize = {
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
        chrome.runtime.sendMessage(message);
        chrome.tabs.sendMessage(Tab.gameTabId, message);
    },
    process: function (postedXml, responseText) {
        let posted = Parser.parse('any', postedXml);
        // eslint-disable-next-line no-unused-vars
        if (!posted) return;

        let response = responseText && Parser.parse('any', responseText);
        Synchronize.time = Math.floor(response ? +response.time : +posted.client_time);

        Synchronize.delayedSignals = [];

        // un_gift
        let changed = Synchronize.processUnGift(response && response.global && response.global.un_gifts, Synchronize.time);
        Data.saveNeighbour(changed);

        // tasks
        let tasks = posted.task;
        tasks = tasks ? (Array.isArray(tasks) ? tasks : [tasks]) : [];
        let taskIndex = 0;
        for (let task of tasks) {
            let action = task.action;
            console.log('Action "' + action + '"');
            let fn = Synchronize.handlers[action];
            if (fn instanceof Function) {
                let taskName = 'task_' + taskIndex;
                taskIndex++;
                try {
                    fn(action, task, response && response[taskName], response);
                } catch (e) {
                    console.error(action + '() ' + e.message);
                }
            }
        }
        let sent = {};
        for (let message of Synchronize.delayedSignals) {
            let json = JSON.stringify(message);
            if (!(json in sent)) {
                sent[json] = true;
                Synchronize.signal(message);
            }
        }
    },
    time: 0,
    lastTimeMined: 0,
    last_lid: 0,
    setLastLocation: function (lid) {
        if (lid <= 0) return null;
        this.last_lid = lid;
        let loc_prog = Data.generator && Data.generator.loc_prog;
        if (!loc_prog) return null;
        let prog = loc_prog[lid];
        if (!prog) {
            prog = loc_prog[lid] = {};
            prog.id = lid;
            prog.prog = 0;
        }
        return prog;
    },
    handlers: {
        visit_camp: function (action, _task, taskResponse, _response) {
            if (!taskResponse || !taskResponse.camp) return;
            let neighbourId = taskResponse.neigh_id;
            let camp = Data.lastVisitedCamp = taskResponse.camp;
            camp.neigh_id = neighbourId;
            camp.time = Synchronize.time;
            let pal = Data.getNeighbour(neighbourId);
            if (pal) {
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
            let neighbourId = task.neigh_id;
            let time = Synchronize.time;
            let pal = Data.getNeighbour(neighbourId);
            if (Data.lastVisitedCamp && Data.lastVisitedCamp.neigh_id == neighbourId && pal && time) {
                let windmills = Data.lastVisitedCamp.windmills;
                windmills = Array.isArray(windmills) ? windmills : [];
                windmills.push({
                    activated: time,
                    provider: Data.generator.player_id
                });
                Data.lastVisitedCamp.windmills = windmills;
                let wmtime = Data.getCampWindmillTime(Data.lastVisitedCamp);
                if (wmtime !== pal.extra.wmtime) {
                    pal.extra.wmtime = wmtime;
                    Data.saveNeighbour(pal);
                    Synchronize.signal(action, neighbourId, true);
                }
            }
        },
        enter_mine: function (_action, task, taskResponse, _response) {
            let loc_id = +task.loc_id || 0;
            let prog = Synchronize.setLastLocation(loc_id);
            if (prog && taskResponse) {
                // console.log(Object.assign({}, prog), taskResponse, Data.repeatables && Data.repeatables[loc_id]);
                prog.lvl = +taskResponse.level_id;
                let rep = Data.repeatables && Data.repeatables[loc_id];
                if (rep) {
                    // We have repeatables info => this is a repeatable
                    // Marks as ready, since we just entered it
                    prog.cmpl = 0;
                    let fp = taskResponse.floor_progress;
                    let floor = null;
                    if (Array.isArray(fp)) floor = fp.find(t => +t.floor == prog.lvl);
                    else if (fp && +fp.floor == prog.lvl) floor = fp;
                    prog.prog = floor ? +floor.progress : 0;
                } else {
                    // No repeatable info => alternative method
                    // The reset count will increase when entering a refreshed repeatable
                    let reset = +taskResponse.reset_count;
                    if (reset > prog.reset) {
                        prog.reset = reset;
                        prog.cmpl = 0;
                        prog.prog = 0;
                    }
                }
            }
        },
        speedup_reset: function (_action, task, _taskResponse, _response) {
            let loc_id = +task.loc_id || 0;
            let prog = Synchronize.setLastLocation(loc_id);
            if (prog) prog.prog = 0;
        },
        mine: function (_action, _task, _taskResponse, _response) {
            Synchronize.lastTimeMined = Synchronize.time;
            let loc_id = Synchronize.last_lid;
            let prog = Synchronize.setLastLocation(loc_id);
            if (prog) {
                prog.prog = (+prog.prog || 0) + 1;
                prog.time = Synchronize.time;
            }
        },
        friend_child_charge: function (action, task, _taskResponse, _response) {
            var neighbourId = task.neigh_id;
            var neighbour = Data.getNeighbour(neighbourId);
            if (neighbour && neighbour.spawned) {
                if (!neighbour.extra.hasOwnProperty('gcCount')) neighbour.extra.gcCount = Data.getConfigValue('child_count', 5);
                if ((--neighbour.extra.gcCount) <= 0) {
                    // Collected all of them!
                    neighbour.spawned = 0;
                    delete neighbour.extra.gcCount;
                    const data = Data.getGCInfo();
                    data.id = neighbourId;
                    Synchronize.signal(action, data);
                }
                Data.saveNeighbour(neighbour);
            }
        }
    },
    processUnGift: function (ungift, time, neighbours) {
        if (!Array.isArray(ungift)) return [];
        if (!neighbours) neighbours = Data.neighbours;
        time = +time;
        var changed = {};
        for (let item of ungift) {
            let giftId = +item.gift_id;
            let pal = neighbours[item.sender_id];
            if (!pal) continue;
            let gifts = pal.extra.g;
            if (gifts && gifts.find(item => item[0] == giftId)) continue;
            let gift = [giftId, +item.def_id, time];
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
        return Object.values(changed);
    },
    processXhr: function (detail) {
        const { type, kind, site, lang, request, response } = detail;
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
                file.data.player_id = parameters.player_id;
                file.data.game_site = site;
                file.data.game_platform = 'WebGL';
                file.data.game_language = lang;
                Data.store(file);
                Badge.setIcon('green');
            } else {
                Badge.setIcon('red');
            }
        } else {
            if (isSend) return Badge.setText('SYNC').setBackgroundColor('green');
            Badge.setText('');
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

    let lang = Preferences.getValue('language');
    languageId = Data.detectLanguage(lang);
    if (languageId !== lang) Preferences.setValue('language', languageId);
    changeLocale(Preferences.getValue('locale'));

    Object.entries({
        daf_xhr: function (request, _sender) {
            Synchronize.processXhr(request.detail);
        },
        sendValue: function (request, sender) {
            chrome.tabs.sendMessage(sender.tab.id, request);
        },
        getPrefs: function (request) {
            return Preferences.getValues(request.keys);
        },
        showGUI: function () {
            Tab.showGUI();
        },
        getGCInfo: function () {
            return Data.getGCInfo();
        },
        getGCList: function (request) {
            var neighbours = Object.values(Data.neighbours);
            var realNeighbours = neighbours.length - 1;
            var list = request.simulate ? neighbours.slice(0, request.simulate) : neighbours.filter(n => n.spawned);
            var regionNames = {};
            if (Data.localization.data) Object.keys(Data.colRegions).forEach(key => regionNames[key] = Data.getObjectName('region', key));
            return {
                regions: regionNames,
                max: Math.min(realNeighbours, Math.floor(Math.sqrt(realNeighbours)) + 3) + 1,
                list: list.sort((a, b) => a.index - b.index)
                    .map(function (n) {
                        var result = {
                            id: n.id,
                            name: n.name || 'Player ' + n.id,
                            surname: n.surname,
                            level: n.level,
                            region: n.region,
                            fb_id: n.fb_id
                        };
                        if (n.id == 1) result.pic = n.pic_square;
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
                if (reward.cid) htm += Html.br`<td><img src="https://graph.facebook.com/v2.8/${reward.cid}/picture" valign="middle" style="margin-right:8px"/>${reward.cnm}</td>`;
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
        friendsCaptured: function (request, sender) {
            if (request.data) Data.friendsCaptured(request.data);
            if (request.close) chrome.tabs.remove(sender.tab.id);
        }
    }).forEach(entry => Message.setHandler(entry[0], entry[1]));

    Object.entries({
        language: value => languageId = value,
        locale: changeLocale
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