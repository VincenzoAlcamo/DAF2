/*global chrome Parser UrlInfo idb*/
'use strict';

//#region MISCELLANEOUS
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
    setIcon: function(color) {
        chrome.browserAction.setIcon({
            path: '/img/logo/icon' + color + '.png'
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
            fullWindow: true,
            fullWindowHeader: false,
            fullWindowSide: true,
            autoClick: true,
            autoLogin: true,
            gcTable: true,
            gcTableCounter: true,
            gcTableRegion: true,
            keepDebugging: true,
            pillarsExcluded: '',
            enableFlash: true,
            removeGhosts: 0,
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
                // Adjust pillarsExcluded
                var pillarsExcluded = String(Preferences.pillarsExcluded).split(',').map(s => parseInt(s) || 0).filter(n => n > 0).join(',');
                if (pillarsExcluded != Preferences.pillarsExcluded) Preferences.pillarsExcluded = valuesToSet.pillarsExcluded = pillarsExcluded;
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
                sendResponse(dataUrl);
            });
            return true;
        }
        if (request && request.action && request.action in Message.handlers) {
            try {
                var response = Message.handlers[request.action](request, sender);
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
    showGUI: function(refreshExisting = false) {
        chrome.tabs.query({}, function(tabs) {
            var tab = tabs.find(tab => {
                return Tab.detect(tab.url).isGUI;
            });
            if (tab) {
                chrome.windows.update(tab.windowId, {
                    focused: true
                }, function() {
                    var updateProperties = {
                        active: true
                    };
                    if (refreshExisting) updateProperties.url = tab.url;
                    chrome.tabs.update(tab.id, updateProperties);
                });
            } else if (!refreshExisting) {
                chrome.tabs.create({
                    url: Tab.GUI_URL,
                    selected: true
                });
            }
        });
    },
    focus: function(tabId, flag) {
        if (tabId) chrome.tabs.get(tabId, function(tab) {
            if (tab.windowId) chrome.windows.update(tab.windowId, {
                focused: flag
            });
        });
    },
    injectGame: function(tabId) {
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
    },
    enableFlashPlayer: function() {
        const ADOBE_FLASH_PLAYER_ID = 'adobe-flash-player';
        chrome.contentSettings.plugins.getResourceIdentifiers(function(resourceIdentifiers) {
            var flashResourceIdentifier = resourceIdentifiers.find(obj => obj.id == ADOBE_FLASH_PLAYER_ID);

            function enable(pattern) {
                console.log('Enabling Flash Player for %s', pattern);
                chrome.contentSettings.plugins.set({
                    'primaryPattern': pattern,
                    'setting': 'allow',
                    'scope': 'regular',
                    'resourceIdentifier': flashResourceIdentifier
                }, function() {
                    if (chrome.runtime.lastError) console.log('Error enabling flash (%s): %s', pattern, chrome.runtime.lastError);
                });
            }
            if (flashResourceIdentifier) {
                enable('https://apps.facebook.com/*');
                enable('https://portal.pixelfederation.com/*');
            } else {
                console.error('Adobe Flash Player not found!');
            }
        });
    },
    disableFlashPlayer: function() {
        chrome.contentSettings.plugins.clear({});
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
        WebRequest.deleteRequest(info.id);
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
        var tx = Data.db.transaction(['Files', 'Neighbours', 'Friends'], 'readonly');
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
            values.forEach(pal => Data.neighbours[pal.id] = pal);
        });
        tx.objectStore('Friends').getAll().then(values => {
            values.forEach(friend => Data.friends[friend.id] = friend);
        });
        await tx.complete;
        await new Promise(function(resolve, _reject) {
            chrome.management.getSelf(function(self) {
                Data.isDevelopment = self.installType == 'development';
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
            file.data.fb_id = neighbours[file.data.player_id].fb_id;
            delete neighbours[file.data.player_id];
            Data.neighbours = neighbours;
            Data.generator = file.data;
            let store = tx.objectStore('Neighbours');
            // We don't need to wait for the operation to be completed
            store.clear().then(() => store.bulkPut(Object.values(neighbours)));
            tx.objectStore('Files').put(file);
            Synchronize.signalAction('generator');
        } else {
            if (file.id == 'localization') Data.storeLocalization(file);
            tx = Data.db.transaction('Files', 'readwrite');
            tx.objectStore('Files').put(file);
        }
        return tx.complete;
    },
    isDeveloper: function() {
        return [3951243, 11530133, 8700592, 583351, 11715879, 1798336].indexOf(Data.generator.player_id) >= 0;
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
            friend.timeCreated = now;
            var oldFriend = oldFriends[friend.id];
            if (oldFriend) {
                friend.score = oldFriend.score;
                friend.uid = oldFriend.uid;
                if (oldFriend.timeCreated) friend.timeCreated = oldFriend.timeCreated;
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
    getFile: async function(name, version) {
        if (name in Data.unusedFiles) return {};
        var fileName, kind;
        if (name.startsWith('floors_')) {
            fileName = 'json/floors/' + name + '.json';
            kind = 'json';
        } else {
            fileName = 'erik/';
            if (name.startsWith('locations_')) fileName += 'locations/';
            fileName += name + '.erik';
            kind = 'erik';
        }
        if (version === undefined) {
            version = '1';
            if (Data.generator && Data.generator.file_changes && fileName in Data.generator.file_changes) version = String(Data.generator.file_changes[fileName]);
        }
        var file = Data.files[fileName];
        if (file) {
            // If file in cache has the same version, return it
            if (file.version == version) return Promise.resolve(Data.files[name]);
            // Otherwise, purge file from cache
            delete Data.files[name];
            delete Data.files[fileName];
        }
        if (!Data.generator || !Data.generator.cdn_root) return Promise.reject('Data has not been loaded yet');
        var url = Data.generator.cdn_root + fileName + '?ver=' + version;
        file = {
            name: name,
            fileName: fileName,
            version: version,
            url: url
        };
        var response = await fetch(url);
        var text = await response.text();
        var data = Parser.parse(kind, text);
        if (!data) throw `File cannot be parsed: "${file}"`;
        if (kind == 'erik') {
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
    process: function(postedXml, responseText) {
        var posted = Parser.parse('any', postedXml);
        var taskIndex = 0;
        var action, fn, taskName;
        // eslint-disable-next-line no-unused-vars
        var didSomething;
        if (!posted) return;

        var response = responseText && Parser.parse('any', responseText);
        var time = response && +response.time;

        // un_gift
        var changed = Synchronize.processUnGift(response && response.global && response.global.un_gifts, time);
        Data.saveNeighbour(changed);

        // tasks
        var tasks = posted.task;
        if (!tasks) return;
        if (!Array.isArray(tasks)) tasks = [tasks];
        tasks.forEach(task => {
            action = task.action;
            console.log('Action "' + action + '"');
            fn = Synchronize.handlers[action];
            if (fn instanceof Function) {
                taskName = 'task_' + taskIndex;
                taskIndex++;
                try {
                    Synchronize.lastAction = action;
                    if (fn(task, response && response[taskName], response)) didSomething = true;
                } catch (e) {
                    console.error(action + '() ' + e.message);
                }
            }
        });
    },
    signalAction: function(action, data) {
        var message = {};
        message.action = action;
        if (data) message.data = data;
        chrome.extension.sendMessage(message);
        chrome.tabs.sendMessage(Tab.gameTabId, message);
    },
    lastAction: '',
    signal: data => Synchronize.signalAction(Synchronize.lastAction, data),
    handlers: {
        visit_camp: function(_task, taskResponse, response) {
            console.log(...arguments);
            if (!taskResponse || !taskResponse.camp) return;
            Data.lastVisitedCamp = taskResponse.camp;
            Data.lastVisitedCamp.neigh_id = taskResponse.neigh_id;
            Data.lastVisitedCamp.time = +response.time;
            Synchronize.signal();
        },
        friend_child_charge: function(task, _taskResponse, _response) {
            console.log(...arguments);
            var neighbourId = task.neigh_id;
            var neighbour = Data.getNeighbour(neighbourId);
            if (neighbour && neighbour.spawned) {
                if (!neighbour.extra.hasOwnProperty('gcCount')) neighbour.extra.gcCount = Data.getConfigValue('child_count', 5);
                if ((--neighbour.extra.gcCount) <= 0) {
                    // Collected all of them!
                    neighbour.spawned = 0;
                    delete neighbour.extra.gcCount;
                    Synchronize.signal(neighbourId);
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
        ungift.forEach(item => {
            // {gift_id: "10039147443", sender_id: "2930323", def_id: "89"}
            var giftId = +item.gift_id;
            var neighborId = item.sender_id;
            var gift = {
                id: giftId,
                gid: +item.def_id,
                time: time
            };
            if (neighborId in neighbours) {
                var pal = neighbours[neighborId];
                var gifts = pal.extra.gifts;
                if (!gifts) pal.extra.gifts = gifts = [];
                else if (gifts.find(item => item.id == giftId)) return;
                gifts.push(gift);
                console.log('Received gift #' + giftId + ' (' + gift.gid + ') from #' + pal.id + ' (' + pal.name + ' ' + pal.surname + ')');
                changed[pal.id] = pal;
            }
        });
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
        friendsCaptured: function(request) {
            Data.friendsCaptured(request.data);
        }
    }).forEach(entry => Message.setHandler(entry[0], entry[1]));

    Object.entries({
        enableFlash: value => value ? Tab.enableFlashPlayer() : Tab.disableFlashPlayer(),
        keepDebugging: value => value ? autoAttachDebugger() : Debugger.detach()
    }).forEach(entry => Preferences.setHandler(entry[0], entry[1]));

    if (Preferences.getValue('enableFlash')) Tab.enableFlashPlayer();

    if (Data.generator && Data.generator.player_id) {
        Data.checkLocalization('');
        Badge.setIcon('yellow');
    }

    autoAttachDebugger();

    chrome.browserAction.onClicked.addListener(function(_activeTab) {
        Tab.showGUI();
    });
}
//#endregion

init();