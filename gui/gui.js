/*global chrome Locale Dialog UrlInfo HtmlRaw Html HtmlBr dynamicImport*/
let bgp = chrome.extension.getBackgroundPage();

let currentTab = null;
let tabs = (function() {
    let tabs = {};

    function addTab(id, enabled = true) {
        tabs[id] = {
            id: id,
            icon: '/img/gui/' + id + '.png',
            generator: id != 'about' && id != 'options',
            enabled: enabled
        };
    }
    addTab('about');
    addTab('progress');
    addTab('camp');
    addTab('neighbors');
    addTab('friendship');
    addTab('godchild');
    addTab('kitchen');
    addTab('foundry');
    addTab('pillars');
    addTab('locations', false);
    addTab('greenrings', false);
    addTab('redrings', false);
    addTab('rewardlinks');
    addTab('options');
    addTab('help', false);
    addTab('export');
    return tabs;
})();

let gui = {
    dialog: Dialog(),
    wait: Dialog(Dialog.WAIT),
    toast: Dialog(Dialog.TOAST),
    setPreference: function(name, value) {
        bgp.Preferences.setValue(name, value);
    },
    getPreference: function(name) {
        return bgp.Preferences.getValue(name);
    },
    getGenerator: function() {
        return bgp.Data.generator;
    },
    hasValidGenerator: function() {
        var generator = gui.getGenerator();
        return generator && generator.player_id;
    },
    getFile: function(name) {
        return bgp.Data.files[name];
    },
    getString: function(id) {
        return bgp.Data.getString(id);
    },
    getMessage: function(id, ...args) {
        return chrome.i18n.getMessage(id, args);
    },
    getUnixTime: function() {
        return Math.floor(Date.now() / 1000);
    },
    getPlayerNameFull: function(pal) {
        var name = pal.name || 'Player ' + pal.id;
        return pal.surname ? name + ' ' + pal.surname : name;
    },
    getFBFriendAvatarUrl: function(fb_id) {
        return HtmlRaw('https://graph.facebook.com/v2.8/' + fb_id + '/picture');
    },
    getFBFriendAnchor: function(fb_id, uri) {
        uri = uri || ('https://www.facebook.com/' + fb_id);
        return Html `<a target="_blank" href="${uri}">`;
    },
    getFriendAnchor: function(friend) {
        return Html `<a target="_blank" href="${friend.uri}" title="${friend.name}">`;
    },
    getObject: function(type, id) {
        return bgp.Data.getObject(type, id);
    },
    getObjectName: function(type, id) {
        return bgp.Data.getObjectName(type, id);
    },
    getObjectImage: function(type, id, small = false) {
        return bgp.Data.getObjectImage(type, id, small);
    },
    getObjectImg: function(type, id, size = 32, small = false) {
        var url = bgp.Data.getObjectImage(type, id, small);
        return url ? HtmlBr `<img width="${size}" height="${size}" src="${url}">` : '';
    },
    getRegionImg: function(rid, forceEgypt = false, size = 32) {
        if (rid == 0 && forceEgypt) rid = 1;
        if (rid < 0 || rid > 6) rid = 0;
        return HtmlBr `<img src="${bgp.Data.getObjectImage('region', rid)}" width="${size}" height="${size}" title="${rid > 0 ? gui.getObjectName('region', rid) : ''}"/>`;
    },
    getSkinImg: function(skin, size = 32) {
        var rid = bgp.Data.getRegionFromSkin(skin);
        return rid > 0 ? this.getRegionImg(rid, false, size) : HtmlBr `<img src="/img/map.png" width="${size}" height="${size}" title="${gui.getObjectName('skin', skin)}"/>`;
    },
    getDuration: function(drn, flagReduced) {
        let mm = Math.floor((drn / 60) % 60);
        let hh = Math.floor((drn / (60 * 60)) % 24);
        let dd = Math.floor(drn / (60 * 60 * 24));
        if (flagReduced && dd > 0) return Locale.formatNumber(dd) + 'd';
        return `${dd ? Locale.formatNumber(dd) + 'd:' : ''}${(hh < 10 ? '0' : '')+hh}h:${(mm < 10 ? '0' : '')+mm}m`;
    },
    getArrayOfInt: function(value) {
        return String(value || '').split(',').map(o => parseInt(o));
    },
    getChildrenMax: function(realNeighbours) {
        var max = Math.floor(Math.sqrt(realNeighbours)) + 3;
        return max > realNeighbours ? realNeighbours : max;
    },
    getChildrenNext: function(realNeighbours) {
        if (realNeighbours < 5) return 1;
        var next = Math.floor(Math.sqrt(realNeighbours)) + 1;
        var goal = next * next;
        // Facebook hard limit of 5000 friends
        return goal > 5000 ? 0 : goal - realNeighbours;
    },
    getMaxRegion: function() {
        return 6;
    },
    // Lazy load images using an IntersectionObserver
    lazyObserver: new IntersectionObserver(function(entries) {
        for (let entry of entries) {
            if (entry.intersectionRatio <= 0) continue;
            var element = entry.target;
            gui.lazyObserver.unobserve(element);
            if (element.hasAttribute('lazy-src')) {
                element.setAttribute('src', element.getAttribute('lazy-src'));
                element.removeAttribute('lazy-src');
            }
            if (element.hasAttribute('lazy-render')) {
                var event = new Event('render', {
                    bubbles: true
                });
                element.dispatchEvent(event);
                element.removeAttribute('lazy-render');
            }
        }
    }),
    collectLazyImages: function(container) {
        if (container) Array.from(container.querySelectorAll('img[lazy-src],*[lazy-render]')).forEach(item => this.lazyObserver.observe(item));
    },
    updateTabState: function(tab) {
        if (tab.isLoaded && typeof tab.getState == 'function') tab.state = tab.getState();
        var text = JSON.stringify(tab.state);
        if (text != 'null' && text != '{}') localStorage.setItem('state_' + tab.id, text);
        if (tab !== currentTab) return;
        var location = '?tab=' + encodeURIComponent(tab.id);
        if (tab.state) Object.keys(tab.state).forEach(key => {
            var value = tab.state[key];
            if (value === undefined || value === null || value === '' || value === false) return;
            if (value === true) location += '&' + encodeURIComponent(key);
            else location += '&' + encodeURIComponent(key) + '=' + String(value).split(',').map(t => encodeURIComponent(t)).join(',');
        });
        history.replaceState(null, null, location);
    },
    getTabMenuItem: function(tabId) {
        return tabId && document.querySelector('.vertical-menu li[data-tabid="' + tabId + '"]');
    },
    markNeighborsTab: function() {
        tabs.friendship.mustBeUpdated = true;
        tabs.neighbors.mustBeUpdated = true;
    },
    getActiveSpecialWeeks: function() {
        // requires special_weeks
        let result = {};
        result.items = [];
        result.types = {};
        let now = gui.getUnixTime();
        for(let sw of Object.values(gui.getFile('special_weeks'))) {
            let start = +sw.start, finish = +sw.finish;
            if(start <= now && now <= finish) {
                let item = {
                    id: sw.def_id,
                    type: sw.type,
                    coeficient: +sw.coeficient,
                    start: start,
                    finish: finish
                };
                result.items.push(item);
                result.types[item.type] = item;
            }
        }
        result.debrisDiscount = result.types['debris_discount'];
        result.doubleProduction = result.types['production'];
        result.halfTimeProduction = result.types['half_prod_time'];
        result.doubleDrop = result.types['double_drop'];
        result.postcards = result.types['postcards'];
        return result;
    },
    setupScreenshot: function(element, fileName = 'screenshot.png', screenshot) {
        screenshot = screenshot || element.querySelector('.screenshot');
        if (!screenshot) return;
        if (!fileName.endsWith('.png')) fileName += '.png';
        let shot = document.createElement('img');
        shot.src = '/img/gui/screenshot.png';
        shot.className = 'shot';
        shot.title = gui.getMessage('gui_screenshot_shot');
        screenshot.appendChild(shot);
        let target = document.createElement('img');
        target.className = 'target';
        target.title = gui.getMessage('gui_screenshot_target');
        screenshot.appendChild(target);
        shot.addEventListener('click', function() {
            screenshot.style.display = 'none';
            target.classList.remove('ready');
            setTimeout(function() {
                gui.captureElement(element).then(function(data) {
                    target.src = data;
                    target.classList.add('ready');
                }).finally(function() {
                    screenshot.style.display = '';
                });
            }, 100);
        });
        target.addEventListener('click', function() {
            if (!target.classList.contains('ready')) return;
            let canvas = document.createElement('canvas');
            canvas.width = target.naturalWidth;
            canvas.height = target.naturalHeight;
            let ctx = canvas.getContext('2d');
            ctx.drawImage(target, 0, 0);
            canvas.toBlob(blob => gui.downloadData(blob, fileName), 'image/png');
        });
    },
    copyToClipboard: function(str, mimeType = 'text/plain') {
        function oncopy(event) {
            event.clipboardData.setData(mimeType, str);
            event.preventDefault();
        }
        document.addEventListener('copy', oncopy);
        document.execCommand('copy', false, null);
        document.removeEventListener('copy', oncopy);
    },
    downloadData: function(data, fileName) {
        const a = document.createElement('a');
        a.style.display = 'none';
        document.body.appendChild(a);
        const blob = data instanceof Blob ? data : new Blob([typeof data == 'string' ? data : JSON.stringify(data)], {
            type: 'text/plain; charset=utf-8'
        });
        const url = window.URL.createObjectURL(blob);
        a.href = url;
        a.download = fileName;
        a.click();
        setTimeout(function() {
            window.URL.revokeObjectURL(url);
            a.parentNode.removeChild(a);
        }, 2000);
    },
    captureElement: function(element) {
        return new Promise(function(resolve, reject) {
            let rect = element.getBoundingClientRect();
            chrome.runtime.sendMessage({
                action: 'capture'
            }, function(dataUrl) {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                    return;
                }
                let image = new Image();
                image.setAttribute('crossOrigin', 'anonymous');
                image.src = dataUrl;
                image.onload = function() {
                    let sx = Math.round(rect.left);
                    let sy = Math.round(rect.top);
                    let sw = Math.round(rect.width);
                    let sh = Math.round(rect.height);
                    let canvas = document.createElement('canvas');
                    canvas.width = sw;
                    canvas.height = sh;
                    let ctx = canvas.getContext('2d');
                    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
                    dataUrl = canvas.toDataURL('image/png');
                    resolve(dataUrl);
                };
            });
        });
    }
};

window.addEventListener('load', onLoad);

function onLoad() {
    let htm = '';
    let hasValidGenerator = gui.hasValidGenerator();
    for (let tab of Object.values(tabs)) {
        var text = gui.getMessage('tab_' + tab.id) || tab.id;
        var disabled = !tab.enabled || (tab.generator && !hasValidGenerator);
        htm += Html `<li title="${text}" style="background-image:url(${tab.icon})" class="${disabled ? 'disabled' : ''}" data-tabid="${tab.id}"><span>${text}</span></li>`;
    }
    htm += Html `<li class="last"></li>`;
    var div = document.querySelector('.vertical-menu');
    div.innerHTML = htm;
    div.addEventListener('click', clickMenu, true);

    document.body.addEventListener('click', function(e) {
        if (e.target && e.target.hasAttribute('data-wiki-page')) openWiki(e.target.getAttribute('data-wiki-page'));
    }, true);

    chrome.runtime.onMessage.addListener(function onMessage(request, _sender, _sendResponse) {
        var action = request.action;
        var data = request.data;
        if (action == 'generator') {
            let hasValidGenerator = gui.hasValidGenerator();
            for (let tab of Object.values(tabs)) {
                tab.mustBeUpdated = true;
                var div = gui.getTabMenuItem(tab.id);
                var disabled = !tab.enabled || (tab.generator && !hasValidGenerator);
                div.classList.toggle('disabled', disabled);
            }
            updateCurrentTab();
        } else {
            for (let tab of Object.values(tabs)) {
                if (tab.isLoaded && tab.actions && action in tab.actions) {
                    try {
                        tab.actions[action](data);
                    } catch (e) {}
                }
            }
        }
    });

    chrome.storage.onChanged.addListener(function onStorageChanged(changes, area) {
        if (area != 'local') return;
        for (var tab of Object.values(tabs)) {
            if (tab.isLoaded && typeof tab.onPrefChange == 'function') {
                try {
                    tab.onPrefChange(changes);
                } catch (e) {}
            }
        }
    });

    var urlInfo = new UrlInfo(location.href);
    var tabId = urlInfo.parameters.tab;
    div = gui.getTabMenuItem(tabId);
    if (div && !div.classList.contains('disabled')) {
        var state = Object.assign({}, urlInfo.parameters);
        delete state.tab;
        localStorage.setItem('state_' + tabId, JSON.stringify(state));
    } else {
        div = gui.getTabMenuItem(localStorage.getItem('tab'));
    }
    if (!div || div.classList.contains('disabled')) div = gui.getTabMenuItem('about');
    if (div) div.dispatchEvent(new Event('click'));
}

async function loadTab(tab) {
    var container = tab.container;
    try {
        tab.state = JSON.parse(localStorage.getItem('state_' + tab.id));
    } catch (e) {
        tab.state = null;
    }
    let resource_count = 2;
    let resource_value = 0;
    let advanceProgress = () => gui.wait.show({
        text: gui.getMessage('gui_loadingresources', ++resource_value, resource_count)
    });
    try {
        advanceProgress();
        container.style.display = 'none';
        var tabBasePath = '/gui/tabs/' + tab.id + '/' + tab.id;
        var module = await dynamicImport(tabBasePath + '.js');
        Object.assign(tab, module.default);
        if (tab.hasCSS) {
            let link = document.createElement('link');
            link.setAttribute('rel', 'stylesheet');
            link.setAttribute('type', 'text/css');
            link.setAttribute('href', tabBasePath + '.css');
            document.head.appendChild(link);
        }
        resource_count += (tab.requires ? tab.requires.length : 0);
        advanceProgress();
        var response = await fetch(tabBasePath + '.html');
        var text = await response.text();
        container.innerHTML = text;
        if (tab.requires) {
            for (var name of tab.requires) {
                advanceProgress();
                await bgp.Data.getFile(name);
            }
        }
        tab.init();
        tab.isLoaded = true;
        tab.mustBeUpdated = true;
    } catch (e) {
        container.innerHTML = HtmlBr `Error: ${e}`;
        console.error(e);
    } finally {
        container.style.display = '';
        gui.wait.hide();
    }
    if (tab.isLoaded && typeof tab.setState == 'function' && tab.state && typeof tab.state == 'object') tab.setState(tab.state);
}

async function clickMenu(e) {
    var li = null,
        el, tabId, tab;
    for (el = e.target; el.tagName != 'UL'; el = el.parentNode)
        if (el.tagName == 'LI') li = el;
    if (!li || li.classList.contains('selected') || li.classList.contains('disabled') || li.classList.contains('last')) return;
    tabId = li.getAttribute('data-tabid');
    Array.from(el.querySelectorAll('li')).forEach(item => {
        item.classList.toggle('selected', item == li);
    });
    tab = tabs[tabId];
    if (!tab.container) {
        tab.container = document.querySelector('.main-container').appendChild(document.createElement('div'));
        tab.container.classList.add('tab_' + tabId);
        await loadTab(tab);
    }
    currentTab = tab;
    localStorage.setItem('tab', currentTab.id);
    gui.updateTabState(currentTab);
    Object.values(tabs).forEach(t => t.container && (t.container.style.display = t == currentTab ? '' : 'none'));
    updateCurrentTab();
}

function updateCurrentTab() {
    if (currentTab.isLoaded && currentTab.mustBeUpdated) {
        currentTab.mustBeUpdated = false;
        translate(currentTab.container);
        if (typeof currentTab.update == 'function') currentTab.update();
    }
}

//#region TEXT INFO
function translate(parent) {
    Array.from(parent.querySelectorAll('[data-i18n-title]')).forEach(el => {
        el.title = el.getAttribute('data-i18n-title').split('+').map(id => gui.getMessage(id)).join('\n');
    });
    Array.from(parent.querySelectorAll('[data-i18n-text]')).forEach(el => {
        el.innerHTML = HtmlBr(el.getAttribute('data-i18n-text').split('+').map(id => gui.getMessage(id)).join('\n'));
    });
}
//#endregion

//#region WIKI
const WIKI_URL = 'https://wiki.diggysadventure.com/index.php';

function openWiki(page) {
    var url = page && page.indexOf('://') > 0 ? page : WIKI_URL + (page ? '?title=' + page : '');
    var urlInfo = new UrlInfo(url);

    chrome.tabs.query({}, function(tabs) {
        var tabId = 0,
            windowId = 0;
        tabs.forEach(function(tab) {
            var tabInfo = new UrlInfo(tab.url);
            if (tab.url == url || (!tabId && tabInfo.hostname == urlInfo.hostName)) {
                windowId = tab.windowId;
                tabId = tab.id;
            }
        });

        if (tabId) {
            chrome.windows.update(windowId, {
                focused: true,
                drawAttention: true
            });
            chrome.tabs.update(tabId, {
                url: url,
                active: true
            });
        } else {
            var width = Math.round(window.screen.availWidth * 0.72);
            var height = Math.round(window.screen.availHeight * 0.80);
            var top = Math.round((window.screen.availHeight - height) / 2);
            var left = Math.round((window.screen.availWidth - width) / 2);
            chrome.windows.create({
                url: url,
                left: left,
                top: top,
                width: width,
                height: height,
                focused: true,
                type: 'popup'
            }, function(_w) {});
        }
    });
}
//#endregion

// var collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
// var myArray = ['1_Document', '11_Document', '2_Document'];
// console.log(myArray.sort(collator.compare));