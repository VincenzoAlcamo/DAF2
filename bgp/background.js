/*global chrome Parser UrlInfo idb*/
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

var Badge = {
    currentIcon: '',
    setIcon: function(color) {
        color = color[0].toUpperCase() + color.substr(1).toLowerCase();
        Badge.currentIcon = '/img/logo/icon' + color + '.png';
        chrome.browserAction.setIcon({
            path: Badge.currentIcon
        });
        return this;
    },
    setText: function(text) {
        chrome.browserAction.setBadgeText({
            text: text
        });
        return this;
    },
    setBackgroundColor: function(color) {
        chrome.browserAction.setBadgeBackgroundColor({
            color: color
        });
    }
};
//#endregion

//#region PREFERENCES
var Preferences = {
    handlers: {},
    getDefaults: function() {
        return {
            injectGame: true,
            resetFullWindow: true,
            fullWindow: false,
            fullWindowHeader: false,
            fullWindowSide: false,
            autoClick: false,
            autoLogin: false,
            gcTable: false,
            gcTableCounter: true,
            gcTableRegion: true,
            keepDebugging: false,
            removeGhosts: 0,
            rewardsRemoveDays: 7,
            rewardsClose: false,
            rewardsCloseExceptGems: true,
            rewardsCloseExceptErrors: true,
            friendsCollectDate: 0
        };
    },
    init: async function() {
        Preferences.values = Preferences.getDefaults();
        return new Promise(function(resolve, _reject) {
            var keysToRemove = [];
            var valuesToSet = Object.assign({}, Preferences.values);
            chrome.storage.local.get(null, function(values) {
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
                if (Object.keys(valuesToSet).length) chrome.storage.local.set(valuesToSet, function() {
                    hasRuntimeError();
                    resolve();
                });
                else resolve();
            });
        }).then(function() {
            chrome.storage.onChanged.addListener(Preferences.onChanged);
        });
    },
    setHandler: function(action, callback) {
        Preferences.handlers[action] = callback;
    },
    onChanged: function(changes, area) {
        if (area != 'local') return;
        for (var name in changes)
            if (name in Preferences.values) {
                Preferences.values[name] = changes[name].newValue;
                if (name in Preferences.handlers) {
                    try {
                        Preferences.handlers[name](Preferences.values[name]);
                    } catch (e) {}
                }
            }
    },
    getValue: function(name) {
        return Preferences.values[name];
    },
    setValue: function(name, value) {
        Preferences.setValues({
            [name]: value
        });
    },
    setValues: function(values) {
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
    getValues: function(names) {
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
    init: function() {
        chrome.runtime.onMessage.addListener(Message.onMessage);
    },
    setHandler: function(action, callback) {
        Message.handlers[action] = callback;
    },
    onMessage: function(request, sender, sendResponse) {
        if (request && request.action == 'capture') {
            chrome.tabs.captureVisibleTab(function(dataUrl) {
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
    tabSettings: {},
    init: function() {
        chrome.tabs.onUpdated.addListener(Tab.onUpdated);
        chrome.tabs.onRemoved.addListener(Tab.onRemoved);
        chrome.tabs.onReplaced.addListener(Tab.onReplaced);

        // Portal auto login
        const autoLoginFilters = {
            url: [{
                hostEquals: 'portal.pixelfederation.com'
            }]
        };
        chrome.webNavigation.onCompleted.addListener(Tab.onAutoLoginCompleted, autoLoginFilters);

        // Facebook dialog interceptor
        const dialogFilters = {
            url: [{
                hostEquals: 'www.facebook.com',
                pathContains: 'dialog/apprequests',
                queryContains: 'app_id=470178856367913'
            }, {
                hostEquals: 'www.facebook.com',
                pathContains: 'dialog/apprequests',
                queryContains: 'app_id=146595778757295'
            }]
        };
        chrome.webNavigation.onCompleted.addListener(Tab.onDialogCompleted, dialogFilters);

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
    onDialogCompleted: function(details) {
        console.log('onDialogCompleted', details);
        if (!Preferences.getValue('autoClick')) return;
        Tab.focus(Tab.gameTabId, true);
        Tab.injectAutoClick(details.tabId, 2);
    },
    injectAutoClick: function(tabId, count) {
        chrome.tabs.executeScript(tabId, {
            code: `
// we try several times (popup has not finished initializing)
let element = null, timeout = 0, count = 10;
function autoClick() {
    timeout += 200;
    if ((element = document.querySelector('.layerConfirm[name=__CONFIRM__]'))) {
        var form = element.form;
        if (!form) return;
        // guard against payments
        if (element.getAttribute('data-testid') == 'pay_button') return;
        if (form.action.indexOf('pay') >= 0) return;
        if (form.action.indexOf('/app_requests/') < 0 && form.action.indexOf('/share/') < 0) return;
        // find root node for dialog, so we can send it in background
        var parent = element;
        while (parent.parentNode.tagName != 'BODY') {
            parent = parent.parentNode;
        }
        // this is the Invite dialog
        if (parent.querySelector('.profileBrowserDialog')) return;
        element.click();
        // just in case the popup has not been closed
        setTimeout(autoClick, 2000);
        setTimeout(autoClick, 5000);
    } else if (--count > 0) setTimeout(autoClick, timeout);
}
autoClick();
                `,
            allFrames: false,
            frameId: 0
        }, function() {
            if (chrome.runtime.lastError) {
                console.log('Error in inject code', chrome.runtime.lastError);
                count--;
                if (count > 0) Tab.injectAutoClick(tabId, count);
                else Tab.focus(tabId, true);
            }
        });
    },
    onAutoLoginCompleted: function(details) {
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
    onRewardNavigation: function(details) {
        chrome.tabs.executeScript(details.tabId, {
            file: '/inject/rewardlink.js',
            runAt: 'document_end',
            allFrames: false,
            frameId: details.frameId
        });
    },
    onRemoved: function(tabId, _removeInfo) {
        delete Tab.tabSettings[tabId];
        if (tabId == Tab.guiTabId) Tab.guiTabId = null;
        if (tabId == Tab.gameTabId) {
            Tab.gameTabId = null;
            Debugger.detach();
        }
    },
    onUpdated: function(tabId, changeInfo, tab) {
        Tab.tabSettings[tabId] = Object.assign(Tab.tabSettings[tabId] || {}, tab);
        if ('url' in changeInfo) Tab.detectTab(tab);
    },
    onReplaced: function(addedTabId, removedTabId) {
        Tab.tabSettings[addedTabId] = Tab.tabSettings[removedTabId];
        delete Tab.tabSettings[removedTabId];
    },
    excludeFromInjection: function(tabId, flag = true) {
        if (!Tab.tabSettings[tabId]) Tab.tabSettings[tabId] = {};
        Tab.tabSettings[tabId].excludeFromInjection = flag;
    },
    canBeInjected: function(tabId) {
        return tabId in Tab.tabSettings ? !Tab.tabSettings[tabId].excludeFromInjection : true;
    },
    detectTab: function(tab) {
        Tab.onRemoved(tab.id);
        var info = Tab.detect(tab.url);
        if (info.isGUI) Tab.guiTabId = tab.id;
        else if (info.isGame) Tab.gameTabId = tab.id;
    },
    detectAll: function() {
        Tab.guiTabId = Tab.gameTabId = null;
        return new Promise(function(resolve, _reject) {
            chrome.tabs.query({}, function(tabs) {
                tabs.forEach(Tab.detectTab);
                resolve();
            });
        });
    },
    detect: function(url) {
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
    showTab: function(kind, url, urlIfExist) {
        chrome.tabs.query({}, function(tabs) {
            var tab = tabs.find(tab => {
                return Tab.detect(tab.url)[kind];
            });
            if (tab) {
                chrome.windows.update(tab.windowId, {
                    focused: true
                }, function() {
                    var updateProperties = {
                        active: true
                    };
                    if (urlIfExist) updateProperties.url = urlIfExist;
                    chrome.tabs.update(tab.id, updateProperties);
                });
            } else {
                chrome.tabs.create({
                    url: url,
                    selected: true
                });
            }
        });
    },
    showGUI: function() {
        Tab.showTab('isGUI', Tab.GUI_URL, null);
    },
    showGame: function(options) {
        let values = (options || '') + ' ' + (Data.generator ? Data.generator.game_site + ' ' + Data.generator.game_platform : '');
        values = values.toLowerCase().split(' ');
        let site = values.find(item => item == 'facebook' || item == 'portal');
        let platform = values.find(item => item == 'webgl' || item == 'flash');
        let url = (site == 'portal' ? 'https://portal.pixelfederation.com/diggysadventure/' : 'https://apps.facebook.com/diggysadventure/');
        url += (platform == 'flash' ? '?flash' : '?webgl');
        Tab.showTab('isGame', url, values.includes('keep') ? null : url);
    },
    focus: function(tabId, flag) {
        if (tabId) chrome.tabs.get(tabId, function(tab) {
            if (tab.windowId) chrome.windows.update(tab.windowId, {
                focused: flag
            });
        });
    },
    injectGame: function(tabId) {
        if (!Preferences.getValue('injectGame')) return;
        if (Preferences.getValue('resetFullWindow')) {
            Preferences.setValues({
                fullWindow: false,
                fullWindowSide: false
            });
        }
        chrome.webNavigation.getAllFrames({
            tabId: tabId
        }, function(frames) {
            var frame = frames.find(frame => frame.parentFrameId == 0 && frame.url.includes('/miner/'));
            if (!frame) return;
            var details = {
                file: '/inject/game.js',
                allFrames: false,
                frameId: 0
            };
            chrome.tabs.executeScript(tabId, details, function() {
                details.frameId = frame.frameId;
                chrome.tabs.executeScript(tabId, details);
            });
        });
    }
};
//#endregion

//#region DEBUGGER
var Debugger = {
    attached: false,
    target: null,
    tabId: null,
    captures: {},
    detach: function() {
        if (Debugger.attached) {
            Debugger.attached = false;
            chrome.debugger.detach(Debugger.target, function() {
                console.log('Debugger.detach');
                if (hasRuntimeError()) return;
            });
            chrome.debugger.onDetach.removeListener(Debugger.onDetach);
            chrome.debugger.onEvent.removeListener(Debugger.onEvent);
        }
        Badge.setBackgroundColor('darkorange');
    },
    attach: function(tabId) {
        if (arguments.length == 0) {
            Tab.detectAll().then(function() {
                if (Tab.gameTabId) Debugger.attach(Tab.gameTabId);
                else Debugger.detach();
            });
            return;
        }
        if (Debugger.attached && tabId == Debugger.tabId) return;
        Debugger.detach();
        chrome.debugger.getTargets(function(targets) {
            Debugger.target = {
                tabId: tabId
            };
            targets.forEach(function(t) {
                if (t.url.startsWith('https://diggysadventure.com/miner/')) Debugger.target = {
                    targetId: t.id
                };
            });
            console.log('Trying to attach debugger', Debugger.target);
            chrome.debugger.attach(Debugger.target, '1.0', function() {
                console.log('debugger.attach');
                if (hasRuntimeError()) return;
                Badge.setBackgroundColor('green');
                Debugger.attached = true;
                Debugger.tabId = tabId;
                chrome.debugger.onEvent.addListener(Debugger.onEvent);
                chrome.debugger.onDetach.addListener(Debugger.onDetach);
                const MEGA = 1024 * 1024;
                chrome.debugger.sendCommand(Debugger.target, 'Network.enable', {
                    maxResourceBufferSize: 15 * MEGA,
                    maxTotalBufferSize: 30 * MEGA,
                }, function(_result) {
                    console.log('debugger.sendCommand: Network.enable');
                    if (hasRuntimeError()) {
                        Debugger.detach();
                        return;
                    }
                });
            });
        });
    },
    onEvent: function(source, method, params) {
        var info;
        if (method == 'Network.requestWillBeSent') {
            //console.log(method, source, params);
            info = WebRequest.captures[params.request.url];
            if (info && info.id && !info.skip) {
                info.debuggerRequestId = params.requestId;
                Debugger.captures[info.debuggerRequestId] = info;
                info.promise = new Promise(function(resolve, _reject) {
                    info.resolve = resolve;
                });
                console.log('DEBUGGER', info);
            }
        } else if (method == 'Network.loadingFinished') {
            if (params.requestId in Debugger.captures) {
                info = Debugger.captures[params.requestId];
                delete Debugger.captures[params.requestId];
                chrome.debugger.sendCommand(Debugger.target,
                    'Network.getResponseBody', {
                        requestId: params.requestId
                    },
                    function(response) {
                        console.log('Resolving debugger promise');
                        if (hasRuntimeError()) info.resolve(null);
                        else info.resolve(response.body);
                    }
                );
            }
        }
    },
    onDetach: function(source, reason) {
        console.log('Debugger.onDetach', source, reason);
        Debugger.attached = false;
        Badge.setIcon(reason == 'canceled_by_user' ? (Data.generator ? 'yellow' : 'gray') : 'red');
        Badge.setBackgroundColor('darkorange');
    }
};
//#endregion

//#region WEB REQUEST
var WebRequest = {
    tabId: null,
    captures: {},
    init: function() {
        // Game data files interceptor
        const dataFilters = {
            urls: [
                '*://cdn.diggysadventure.com/*/localization*',
                '*://static.diggysadventure.com/*/localization*',
                '*://diggysadventure.com/miner/*.php*',
                '*://portal.pixelfederation.com/_da/miner/*.php*'
            ]
        };
        chrome.webRequest.onBeforeRequest.addListener(WebRequest.onBeforeRequest, dataFilters, ['requestBody']);
        chrome.webRequest.onCompleted.addListener(WebRequest.onCompleted, dataFilters);
        chrome.webRequest.onErrorOccurred.addListener(WebRequest.onErrorOccurred, dataFilters);
    },
    onBeforeRequest: function(details) {
        if (details.tabId != Tab.gameTabId) return;
        if (details.url.indexOf('/webgl_client/') >= 0) return;
        var urlInfo = new UrlInfo(details.url),
            isPost = details.method == 'POST',
            info = {};
        if (urlInfo.url in WebRequest.captures) {
            console.log('Skipping a second request for', urlInfo.url);
            return;
        }
        if (isPost) {
            let formData = details.requestBody.formData;
            if (formData) {
                info.player_id = formData.player_id && parseInt(formData.player_id[0]);
                info.postedXml = formData.xml && formData.xml[0];
            }
        }
        if (urlInfo.pathname == '/miner/webgltracking.php') {
            // Set icon as soon as possible (like old DAF)
            Badge.setIcon('grey');
            Badge.setText('');
        } else if (urlInfo.pathname == '/miner/login.php') {
            Badge.setIcon('grey');
            Tab.injectGame(details.tabId);
            Debugger.attach(details.tabId);
        } else if (urlInfo.pathname == '/miner/generator.php') {
            Badge.setIcon('blue');
            console.log('GENERATOR FILE', 'URL', urlInfo.url);
            info.id = 'generator';
            chrome.tabs.get(details.tabId, function(tab) {
                info.game_site = tab.url.indexOf('//portal.') > 0 ? 'Portal' : 'Facebook';
            });
            info.game_platform = urlInfo.parameters.webgl ? 'WebGL' : 'Flash';
        } else if (urlInfo.pathname == '/miner/synchronize.php') {
            console.log('SYNCHRONIZE FILE', 'URL', urlInfo.url);
            info.id = 'synchronize';
            Badge.setText('SYNC');
        } else if (urlInfo.pathname.endsWith('/localization.csv') || urlInfo.pathname.endsWith('/localization.xml')) {
            info.id = 'localization';
            info.skip = true;
            console.log('LANGUAGE FILE', 'URL', urlInfo.url);
        }
        if (info.id) {
            console.log('File will be analyzed');
            info.requestId = details.requestId;
            info.url = urlInfo.url;
            info.filename = urlInfo.filename;
            WebRequest.captures[info.url] = WebRequest.captures[info.requestId] = info;
        }
    },
    onCompleted: function(details) {
        var info = WebRequest.captures[details.requestId];
        delete WebRequest.captures[details.requestId];
        if (!info) return;
        console.log('onCompleted', info.filename, info);
        if (!info.promise) info.promise = Promise.resolve(null);
        info.promise.then(function(text) {
            if (info.id == 'localization') {
                return Data.checkLocalization(info.url);
            } else if (info.id == 'synchronize') {
                Synchronize.process(info.postedXml, text);
                Badge.setText('');
            } else if (info.id == 'generator') {
                var file = {};
                file.id = info.id;
                file.url = info.url;
                file.time = getUnixTime();
                file.data = Parser.parse(info.id, text);
                if (file.data) {
                    file.data.player_id = info.player_id;
                    file.data.game_site = info.game_site;
                    file.data.game_platform = info.game_platform;
                    Data.store(file);
                    Badge.setIcon('green');
                } else {
                    Badge.setIcon('red');
                }
            }
        }).finally(function() {
            WebRequest.deleteRequest(info.id);
            delete WebRequest.captures[info.url];
        });
    },
    onErrorOccurred: function(details) {
        Badge.setIcon('red');
        var info = WebRequest.captures[details.requestId];
        delete WebRequest.captures[details.requestId];
        if (info) WebRequest.deleteRequest(info.id);
    },
    deleteRequest: function(id) {
        if (id == 'generator') {
            console.log('Debugger can be detached now');
            if (Debugger.attached && !Preferences.getValue('keepDebugging')) Debugger.detach();
        }
    }
};
//#endregion

//#region DATA / GAME / PLAYER / LOCALIZATION
var Data = {
    db: null,
    REWARDLINKS_DAILY_LIMIT: 100,
    REWARDLINKS_VALIDITY_DAYS: 7,
    REWARDLINKS_REFRESH_HOURS: 22,
    REWARDLINKS_REMOVE_DAYS: 10,
    REWARDLINKS_HISTORY_MAXITEMS: 10000,
    init: async function() {
        Data.db = await idb.open('DAF', 1, function(db) {
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
        tx.objectStore('Files').get('generator').then(file => {
            Data.generator = (file && file.data) || {};
        });
        tx.objectStore('Files').get('localization').then(file => {
            Data.storeLocalization(file);
        });
        tx.objectStore('Neighbours').getAll().then(values => {
            values.forEach(pal => {
                Data.convertNeighbourExtra(pal.extra);
                Data.neighbours[pal.id] = pal;
            });
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
        await new Promise(function(resolve, _reject) {
            chrome.management.getSelf(function(self) {
                Data.isDevelopment = self.installType == 'development';
                Data.version = self.version;
                Data.versionName = self.versionName;
                resolve();
            });
        });
    },
    initCollections: function() {
        var col;

        function setItem(def_id, name_loc, mobile_asset) {
            if (!name_loc) return;
            var item = {};
            item.def_id = def_id;
            item.name_loc = name_loc;
            if (mobile_asset) item.mobile_asset = mobile_asset;
            col[item.def_id] = item;
        }

        // Regions
        col = {};
        'MAP005,MAP006,MAP018,MAP021,MAP038,MAP039'.split(',').forEach(function(name_loc, index) {
            setItem(index + 1, name_loc, '/img/regions/' + (index + 1) + '.png');
        });
        Data.colRegions = col;

        // Skins
        col = {};
        'MAP005,MAP006,CT002,CT011,MAP018,CT012,CT013,MAP021,MAP038,CT014,,CT016,MAP039'.split(',').forEach(function(name_loc, index) {
            setItem(index + 1, name_loc);
        });
        Data.colSkins = col;

        // Addon Buildings
        col = {};
        ',,ABNA001,ABNA002,,ABNA004,ABNA005,,,,ABNA009'.split(',').forEach(function(name_loc, index) {
            setItem(index + 1, name_loc);
        });
        Data.colAddonBuildings = col;

        // Systems
        col = {};
        'GUI0064,GUI0065'.split(',').forEach(function(name_loc, index) {
            setItem(index + 1, name_loc, index == 0 ? 'loot_exp_webgl' : 'loot_energy');
        });
        Data.colSystems = col;
    },
    showDBSize: function() {
        var db;
        var storesizes = [];

        function openDatabase() {
            return new Promise(function(resolve, _reject) {
                var dbname = 'DAF';
                var request = window.indexedDB.open(dbname);
                request.onsuccess = function(event) {
                    db = event.target.result;
                    resolve(db.objectStoreNames);
                };
            });
        }

        function getObjectStoreData(storename) {
            return new Promise(function(resolve, reject) {
                var trans = db.transaction(storename, IDBTransaction.READ_ONLY);
                var store = trans.objectStore(storename);
                var items = [];
                trans.oncomplete = function(_evt) {
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
                cursorRequest.onerror = function(error) {
                    reject(error);
                };
                cursorRequest.onsuccess = function(evt) {
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

        openDatabase().then(function(stores) {
            var PromiseArray = [];
            for (var i = 0; i < stores.length; i++) {
                PromiseArray.push(getObjectStoreData(stores[i]));
            }
            Promise.all(PromiseArray).then(function() {
                console.table(storesizes);
            });
        });
    },
    store: function(file) {
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
            tx.objectStore('Files').put(file);
            Synchronize.signal('generator');
        } else {
            if (file.id == 'localization') Data.storeLocalization(file);
            tx = Data.db.transaction('Files', 'readwrite');
            tx.objectStore('Files').put(file);
        }
        return tx.complete;
    },
    isDeveloper: function() {
        return [3951243, 11530133, 8700592, 583351, 11715879, 1798336, 5491844].indexOf(Data.generator.player_id) >= 0;
    },
    getLanguageIdFromUrl: function(url) {
        return url.match(/\/([A-Z][A-Z])\/localization\./)[1];
    },
    checkLocalization: function(url) {
        var file = {
            id: 'localization',
            url: url,
            time: getUnixTime()
        };
        let languageId = Data.localization.languageId || Data.getLanguageIdFromUrl(url) || 'EN';
        let find = function(suffix) {
            if (!Data.generator || !Data.generator.file_changes) return;
            for (let key of Object.keys(Data.generator && Data.generator.file_changes)) {
                if (key.endsWith(suffix) && Data.getLanguageIdFromUrl(key) == languageId) {
                    file.url = Data.generator.cdn_root + key + '?ver=' + Data.generator.file_changes[key];
                    return true;
                }
            }
        };
        if (!find('localization.csv')) find('localization.xml');
        if (!file.url) return;
        languageId = Data.getLanguageIdFromUrl(file.url);
        let urlInfo = new UrlInfo(file.url);
        file.version = urlInfo.parameters.ver;
        var id1 = [Data.localization.languageId, Data.localization.version, Data.localization.revision].join(',');
        var id2 = [languageId, file.version, Parser.parse_localization_revision].join(',');
        if (id1 != id2) {
            WebRequest.captures[file.url] = file;
            return fetch(file.url).then(function(response) {
                return response.text();
            }).then(function(text) {
                file.data = Parser.parse(file.id, text);
                file.revision = Parser.parse_localization_revision;
                Data.store(file);
            }).finally(function() {
                delete WebRequest.captures[file.url];
            });
        }
    },
    storeLocalization: function(file) {
        if (file && file.data) {
            Data.localization = {
                data: file.data,
                cache: {},
                languageId: Data.getLanguageIdFromUrl(file.url),
                version: file.version,
                revision: file.revision
            };
        }
    },
    getCampWindmillTime: function(camp) {
        let wmtime = 0;
        let wmduration = 7 * SECONDS_IN_A_DAY;
        if (camp && Array.isArray(camp.windmills) && camp.windmills.length >= +camp.windmill_limit) {
            // Take for each windmill the expiry date, then sort ascending
            let windmills = camp.windmills.map(wm => (wmduration + wm.activated) || 0).sort();
            // If there are windmills in excess, considers only the first of the last "mindmill_limit" windmills
            wmtime = windmills[windmills.length - camp.windmill_limit];
        }
        return wmtime;
    },
    //#region Neighbors
    getNeighbour: function(id) {
        return Data.neighbours[id];
    },
    getNeighbours: function() {
        return Data.neighbours;
    },
    saveNeighbourHandler: 0,
    saveNeighbourList: {},
    saveNeighbourDelayed: function() {
        Data.saveNeighbourHandler = 0;
        let tx = Data.db.transaction('Neighbours', 'readwrite');
        tx.objectStore('Neighbours').bulkPut(Object.values(Data.saveNeighbourList));
        Data.saveNeighbourList = {};
    },
    saveNeighbour: function(neighbour) {
        if (!neighbour) return;
        var neighbours = [].concat(neighbour);
        if (!neighbours.length) return;
        if (Data.saveNeighbourHandler) clearTimeout(Data.saveNeighbourHandler);
        Data.saveNeighbourHandler = setTimeout(Data.saveNeighbourDelayed, 500);
        neighbours.forEach(neighbour => Data.saveNeighbourList[neighbour.id] = neighbour);
    },
    convertNeighbourExtra: function(extra) {
        if (!extra) return;
        // Convert gifts to new compact format
        if (extra.gifts) {
            extra.g = extra.gifts.map(g => [g.id, g.gid, g.time]);
            delete extra.gifts;
        }
    },
    //#endregion
    //#region Friends
    getFriend: function(id) {
        return Data.friends[id];
    },
    getFriends: function() {
        return Data.friends;
    },
    saveFriendHandler: 0,
    saveFriendList: {},
    removeFriendList: {},
    saveFriendDelayed: function() {
        Data.saveFriendHandler = 0;
        let tx = Data.db.transaction('Friends', 'readwrite');
        var store = tx.objectStore('Friends');
        var items = Object.values(Data.saveFriendList);
        if (items.length) store.bulkPut(items);
        Data.saveFriendList = {};
        for (var item of Object.values(Data.removeFriendList)) store.delete(item.id);
        Data.removeFriendList = {};
    },
    saveFriend: function(friend, remove = false) {
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
    removeFriend: function(friend) {
        Data.saveFriend(friend, true);
    },
    friendsCaptured: function(data) {
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
    getRewardLink: function(id) {
        return Data.rewardLinks[id];
    },
    getRewardLinks: function() {
        return Data.rewardLinks;
    },
    saveRewardLinkHandler: 0,
    saveRewardLinkList: {},
    removeRewardLinkList: {},
    saveRewardLinksHistory: false,
    saveRewardLinkDelayed: function() {
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
    saveRewardLink: function(rewardLink, remove = false) {
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
    removeRewardLink: function(rewardLink) {
        Data.saveRewardLink(rewardLink, true);
    },
    removeExpiredRewardLinks: function() {
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
    addRewardLinks: function(rewardsOrArray) {
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
                // - reward has some info that is missing in then existing reward (collect date, user id)
                if (!existingReward || reward.cmt > 0 ||
                    (reward.cmt && !existingReward.cmt) ||
                    (reward.cdt && !existingReward.cdt) ||
                    (reward.cid && !existingReward.cid)) {
                    existingReward = existingReward || {
                        id: +reward.id,
                        typ: reward.typ,
                        sig: reward.sig,
                        adt: reward.cdt || now
                    };
                    if (reward.cdt) existingReward.cdt = reward.cdt;
                    if (reward.cmt) existingReward.cmt = reward.cmt;
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
    getString: function(id) {
        return id in Data.localization.data ? Data.localization.data[id] : '#' + id;
    },
    getObjectCollection: function(type) {
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
        return null;
    },
    getObject: function(type, id) {
        var col = Data.getObjectCollection(type);
        return col && col[id];
    },
    getObjectImage: function(type, id, small) {
        var item = Data.getObject(type, id);
        if (!item) return '';
        if (type == 'windmill') return Data.generator.cdn_root + 'mobile/graphics/windmills/greece_windmill.png';
        var asset = type == 'event' ? item.shop_icon_graphics : item.mobile_asset;
        if (!asset) return '';
        if (asset[0] == '/') return asset;
        if (type == 'decoration') return Data.generator.cdn_root + 'mobile/graphics/decorations/' + asset + '.png';
        return Data.generator.cdn_root + 'mobile/graphics/all/' + asset + (small ? '_small' : '') + '.png';
    },
    getObjectName: function(type, id) {
        var item = Data.getObject(type, id);
        var name_loc = item && item.name_loc;
        return name_loc ? Data.getString(name_loc) : '#' + type + id;
    },
    getRegionFromSkin: function(id) {
        return [1, 2, 5, 8, 9, 13].indexOf(id) + 1;
    },
    //#endregion
    //#region FILES
    unusedFiles: {
        'buildings_actions': true
    },
    checkFile: function(name, version) {
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
    getFile: async function(name, version) {
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
    getConfigValue: function(name, defaultValue = 0) {
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
    init: async function() {
        //
    },
    delayedSignals: [],
    signal: function(action, data, delayed) {
        let message = action;
        if (typeof action == 'string') {
            message = {};
            message.action = action;
            if (data) message.data = data;
        }
        if (delayed) return Synchronize.delayedSignals.push(message);
        chrome.extension.sendMessage(message);
        chrome.tabs.sendMessage(Tab.gameTabId, message);
    },
    process: function(postedXml, responseText) {
        let posted = Parser.parse('any', postedXml);
        // eslint-disable-next-line no-unused-vars
        if (!posted) return;

        let response = responseText && Parser.parse('any', responseText);
        let time = response && Math.floor(+response.time);

        Synchronize.delayedSignals = [];

        // un_gift
        let changed = Synchronize.processUnGift(response && response.global && response.global.un_gifts, time);
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
    handlers: {
        visit_camp: function(action, _task, taskResponse, response) {
            if (!taskResponse || !taskResponse.camp) return;
            let neighbourId = taskResponse.neigh_id;
            let camp = Data.lastVisitedCamp = taskResponse.camp;
            camp.neigh_id = neighbourId;
            camp.time = Math.floor(+response.time);
            let pal = Data.getNeighbour(neighbourId);
            if (pal) {
                let changed = false;
                let blocks = 144;
                for (let n of String(camp.lines_blocked || '').split(',')) {
                    n = parseInt(n);
                    if (isFinite(n)) blocks += n - 24;
                }
                if (blocks !== pal.extra.blocks) {
                    pal.extra.blocks = blocks;
                    changed = true;
                }
                let wmtime = Data.getCampWindmillTime(camp);
                if (wmtime !== pal.extra.wmtime) {
                    pal.extra.wmtime = wmtime;
                    changed = true;
                }
                if (changed) Data.saveNeighbour(pal);
            }
            Synchronize.signal(action, neighbourId);
        },
        place_windmill: function(action, task, taskResponse, response) {
            let neighbourId = task.neigh_id;
            let time = Math.floor(+response.time);
            let pal = Data.getNeighbour(neighbourId);
            if (Data.lastVisitedCamp && Data.lastVisitedCamp.neigh_id == neighbourId && pal) {
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
        friend_child_charge: function(action, task, _taskResponse, _response) {
            console.log(...arguments);
            var neighbourId = task.neigh_id;
            var neighbour = Data.getNeighbour(neighbourId);
            if (neighbour && neighbour.spawned) {
                if (!neighbour.extra.hasOwnProperty('gcCount')) neighbour.extra.gcCount = Data.getConfigValue('child_count', 5);
                if ((--neighbour.extra.gcCount) <= 0) {
                    // Collected all of them!
                    neighbour.spawned = 0;
                    delete neighbour.extra.gcCount;
                    Synchronize.signal(action, neighbourId);
                }
                Data.saveNeighbour(neighbour);
            }
        }
    },
    processUnGift: function(ungift, time, neighbours) {
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
    }
};
//#endregion

//#region INIT
async function init() {
    Badge.setIcon('grey');
    await Preferences.init();
    await Data.init();
    await Message.init();
    await Synchronize.init();
    await WebRequest.init();
    await Tab.init();

    function autoAttachDebugger() {
        Data.generator && Data.generator.player_id && Debugger.attach();
    }

    Object.entries({
        sendValue: function(request, sender) {
            chrome.tabs.sendMessage(sender.tab.id, request);
        },
        getPrefs: function(request) {
            return Preferences.getValues(request.keys);
        },
        showGUI: function() {
            Tab.showGUI();
        },
        debug: () => Debugger.attached ? Debugger.detach() : autoAttachDebugger(),
        getGCList: function(request) {
            var neighbours = Object.values(Data.neighbours);
            var realNeighbours = neighbours.length - 1;
            var list = request.simulate ? neighbours.slice(0, request.simulate) : neighbours.filter(n => n.spawned);
            var regionNames = {};
            if (Data.localization.data) Object.keys(Data.colRegions).forEach(key => regionNames[key] = Data.getObjectName('region', key));
            return {
                regions: regionNames,
                max: Math.min(realNeighbours, Math.floor(Math.sqrt(realNeighbours)) + 3) + 1,
                list: list.sort((a, b) => a.index - b.index)
                    .map(function(n) {
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
        reloadGame: function(request, _sender) {
            Tab.showGame(request.value);
        },
        collectRewardLink: function(request, sender) {
            let flagClose = Preferences.getValue('rewardsClose');
            let reward = request.reward;
            if (reward.cmt == 2 && Preferences.getValue('rewardsCloseExceptGems')) flagClose = false;
            if (reward.cmt < 0 && Preferences.getValue('rewardsCloseExceptErrors')) flagClose = false;
            // let existingReward = Data.getReward(reward.id);
            Data.addRewardLinks(reward);
            if (flagClose) {
                setTimeout(function() {
                    chrome.tabs.remove(sender.tab.id);
                }, 1000);
            }
        },
        friendsCaptured: function(request) {
            Data.friendsCaptured(request.data);
        }
    }).forEach(entry => Message.setHandler(entry[0], entry[1]));

    Object.entries({
        keepDebugging: value => value ? autoAttachDebugger() : Debugger.detach()
    }).forEach(entry => Preferences.setHandler(entry[0], entry[1]));

    if (Data.generator && Data.generator.player_id) {
        Data.checkLocalization('');
        Badge.setIcon('yellow');
    }

    if (Preferences.getValue('keepDebugging')) autoAttachDebugger();

    chrome.browserAction.onClicked.addListener(function(_activeTab) {
        Tab.showGUI();
    });
}
//#endregion

init();