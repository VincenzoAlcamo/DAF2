/*global chrome*/
let prefs, handlers, msgHandlers, isFacebook, miner, isWebGL, originalHeight, header;
// var autoClickAttached, autoClickStyle;
let gcTable, gcTableStyle;
let menu, textOn, textOff;
let loadCompleted, styleLoaded;
let lastFullWindow = false;

function sendMinerPosition() {
    // Send some values to the top window
    const name = '@bodyHeight';
    const value = Math.floor(document.getElementById('footer').getBoundingClientRect().bottom);
    if (prefs[name] !== value && value > 0) sendValue(name, value);
}

function sendValue(name, value) {
    chrome.runtime.sendMessage({
        action: 'sendValue',
        name: name,
        value: prefs[name] = value
    });
}

function sendPreference(name, value) {
    if (name in prefs) {
        chrome.storage.local.set({
            [name]: value
        });
    }
}

function forceResize(delay = 0) {
    setTimeout(() => window.dispatchEvent(new Event('resize')), delay);
}

function addStylesheet(href, onLoad) {
    const link = document.createElement('link');
    link.type = 'text/css';
    link.rel = 'stylesheet';
    link.href = href;
    if (onLoad) link.addEventListener('load', onLoad);
    document.head.appendChild(link);
}

function htmlEncodeBr(text) {
    return text === undefined || text === null ? '' : String(text).replace(/[&<>'"\n]/g, c => c == '\n' ? '<br>' : '&#' + c.charCodeAt(0) + ';');
}

function getMessage(id, ...args) {
    const language = prefs.language || 'en';
    let text = chrome.i18n.getMessage(language + '@' + id, args);
    if (text == '' && language != 'en') text = chrome.i18n.getMessage('en@' + id, args);
    return text;
}

function getFullWindow() {
    return prefs.fullWindow && loadCompleted;
}

let resizeCount = 2;
let resizeHandler = 0;

function onResize() {
    const fullWindow = getFullWindow();
    const headerHeight = header ? header.getBoundingClientRect().height : 0;
    const gcTableHeight = gcTable ? gcTable.offsetHeight : 0;
    if (resizeHandler) clearTimeout(resizeHandler);
    resizeHandler = 0;
    if (miner) {
        if (gcTable) {
            gcTable.style.overflowX = 'auto';
            gcTable.style.width = fullWindow ? window.innerWidth : '100%';
        }
        if (!isWebGL) {
            const height = fullWindow ? (gcTableHeight > 0 ? 'calc(100% - ' + gcTableHeight + 'px)' : '100%') : originalHeight + 'px';
            const width = (fullWindow || prefs.fullWindowSide) ? window.innerWidth : '100%';
            if (height != miner.style.height) miner.style.height = height;
            // Please note: we must set the width for zoomed out view (for example, at 50%)
            // otherwise the element will be clipped horizontally
            if (width != miner.width) miner.width = width;
        }
        sendMinerPosition();
    } else {
        let iframe, height;
        if (isFacebook) {
            iframe = document.getElementById('iframe_canvas');
            originalHeight = originalHeight || iframe.offsetHeight;
            height = (fullWindow ? (window.innerHeight - (prefs.fullWindowHeader ? headerHeight : 0)) : Math.max(1100, prefs['@bodyHeight'] || originalHeight)) + 'px';
        } else {
            iframe = document.getElementsByClassName('game-iframe game-iframe--da')[0];
            height = fullWindow ? (window.innerHeight - (prefs.fullWindowHeader ? headerHeight : 0)) + 'px' : '';
        }
        if (height != iframe.style.height) {
            iframe.style.height = height;
            resizeCount = 2;
        }
        if (resizeCount > 0) {
            resizeCount--;
            resizeHandler = setTimeout(onResize, 5000);
        }
    }
}

function createScript(code) {
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.appendChild(document.createTextNode(code));
    return script;
}

function onFullWindow() {
    const fullWindow = getFullWindow();
    let flagHide = fullWindow;
    const fn = el => el && (el.style.display = flagHide ? 'none' : '');
    if (miner) {
        if (fullWindow != lastFullWindow) {
            lastFullWindow = fullWindow;
            if (isWebGL) {
                document.body.setAttribute('daf_fw', fullWindow ? '1' : '0');
                document.body.style.backgroundColor = fullWindow ? '#000' : '';
                document.body.style.overflow = fullWindow ? 'hidden' : '';
            } else {
                document.body.style.overflowY = fullWindow ? 'hidden' : '';
            }
            Array.from(document.querySelectorAll('.header-menu,#gems_banner,.cp_banner .bottom_banner,#bottom_news,#footer,.client-type-switch,.news')).forEach(fn);
            forceResize(1000);
        }
    } else {
        Array.from(document.querySelectorAll('#pagelet_dock,#footer')).forEach(fn);
        flagHide = fullWindow && !prefs.fullWindowHeader;
        fn(header);
        flagHide = fullWindow || prefs.fullWindowSide;
        fn(document.querySelector('#rightCol'));
        document.body.style.overflowY = fullWindow ? 'hidden' : '';
        if (fullWindow != lastFullWindow) {
            lastFullWindow = fullWindow;
            onResize();
        }
    }
}

// function autoClickHandler() {
//     if (event.animationName !== 'DAF_anim' || !prefs.autoClick) return;
//     var element = event.target;
//     var form = element.form;
//     if (!form) return;
//     // guard against payments
//     if (element.getAttribute('data-testid') == 'pay_button') return;
//     if (form.action.indexOf('pay') >= 0) return;
//     if (form.action.indexOf('/app_requests/') < 0 && form.action.indexOf('/share/') < 0) return;
//     // find root node for dialog, so we can send it in background
//     var parent = element;
//     while (parent.parentNode.tagName != 'BODY') {
//         parent = parent.parentNode;
//     }
//     // this is the Invite dialog
//     if (parent.querySelector('.profileBrowserDialog')) return;
//     parent.style.zIndex = -1;
//     // click the confirm button
//     element.click();
// }

// function onAutoClick() {
//     var autoClick = prefs.autoClick;
//     if (autoClick == autoClickAttached) return;
//     if (autoClick && !autoClickStyle) {
//         autoClickStyle = document.createElement('style');
//         autoClickStyle.innerHTML = `@keyframes DAF_anim { from { outline: 1px solid transparent } to { outline: 0px solid transparent } }
// button.layerConfirm[name=__CONFIRM__] { animation-duration: 0.001s; animation-name: DAF_anim; }`;
//         document.head.appendChild(autoClickStyle);
//     }
//     autoClickAttached = autoClick;
//     document[autoClick ? 'addEventListener' : 'removeEventListener']('animationstart', autoClickHandler, false);
// }

function onNoGCPopup() {
    document.body.setAttribute('daf_nogc', prefs.noGCPopup ? '1' : '0');
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
        gcTable.firstChild.firstChild.textContent = gcTable.childNodes.length - 1;
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
        chrome.runtime.sendMessage({
            action: 'getGCList',
            simulate: simulate
        }, function updateGCTable(result) {
            if (gcTable) while (gcTable.firstChild) gcTable.firstChild.remove();
            const list = (result && result.list) || [];
            const max = (result && result.max) || 0;
            const regions = (result && result.regions) || {};
            if (!gcTable) {
                gcTable = miner.parentNode.insertBefore(document.createElement('div'), miner.nextSibling);
                gcTable.className = 'DAF-gc-bar DAF-gc-flipped';
                gcTable.style.display = 'none';
                gcTable.addEventListener('click', function (e) {
                    for (let div = e.ctrlKey && e.srcElement; div && div !== gcTable; div = div.parentNode)
                        if (div.id && div.id.startsWith('DAF-gc_')) return gcTable_remove(div);
                });
            }
            const counter = gcTable.appendChild(document.createElement('div'));
            counter.className = 'DAF-gc-count';
            counter.appendChild(document.createElement('div')).textContent = list.length;
            counter.appendChild(document.createElement('div')).textContent = '/';
            counter.appendChild(document.createElement('div')).textContent = max;
            setgcTableOptions();
            list.forEach(item => {
                const div = gcTable.appendChild(document.createElement('div'));
                div.id = 'DAF-gc_' + item.id;
                div.className = 'DAF-gc-pal DAF-gc-reg' + item.region;
                div.style.backgroundImage = 'url(' + (item.id == 1 ? item.pic : 'https://graph.facebook.com/v2.8/' + item.fb_id + '/picture') + ')';
                let fullName = item.name;
                if (item.surname) fullName += ' ' + item.surname;
                div.title = fullName + '\n' + getMessage('gui_region') + ': ' + (regions[item.region] || item.region);
                const d = div.appendChild(document.createElement('div'));
                d.textContent = item.level;
                if (item.id == 1) d.style.visibility = 'hidden';
                div.appendChild(document.createElement('div')).textContent = item.name;
            });
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
    if (menu) {
        menu.classList.toggle('DAF-gc-show-counter', !!prefs.gcTableCounter);
    }
}

function updateGCStatus(data) {
    if (!menu) return;
    const el = menu.querySelector('[data-value=status]');
    el.textContent = data.count ? getMessage('godchild_stat', data.count, data.max) : el.textContent = getMessage('menu_gccollected');
    el.title = data.nexttxt;
    el.style.display = '';
    const badge = menu.querySelector('.DAF-badge-gc');
    badge.textContent = data.count;
    if (data.nexttxt) badge.title = data.nexttxt;
    badge.style.display = data.count ? '' : 'none';
}

function createMenu() {
    function gm(id) {
        return htmlEncodeBr(getMessage(id));
    }
    textOn = getMessage('menu_on');
    textOff = getMessage('menu_off');
    let html = `
<ul class="DAF-menu${isFacebook ? ' DAF-facebook' : ''}">
<li data-action="about"><b>&nbsp;</b>
    <div><span>${gm('ext_name')}</span><br><span>${gm('ext_title')}</span></div>
</li>
<li data-action="fullWindow"><b data-pref="fullWindow">&nbsp;</b>
    <div><span>${gm('menu_fullwindow')}</span><i data-pref="resetFullWindow">${gm('menu_resetfullwindow')}</i><br>
    <i data-pref="fullWindow"></i>
    <i data-pref="fullWindowHeader">${gm('menu_fullwindowheader')}</i>
    <i data-pref="fullWindowSide">${gm('menu_fullwindowside')}</i>
    <i data-pref="fullWindowLock">${gm('menu_fullwindowlock')}</i>
    </div>
</li>
<li data-action="gcTable"><b data-pref="gcTable">&nbsp;</b>
    <div><span>${gm('menu_gctable')}</span><span data-value="status" style="display:none"></span><br>
    <i data-pref="gcTable"></i>
    <i data-pref="gcTableCounter">${gm('menu_gctablecounter')}</i>
    <i data-pref="gcTableRegion">${gm('menu_gctableregion')}</i>
    </div>
</li>
<!--
<li data-action="autoClick"><b data-pref="autoClick">&nbsp;</b>
    <div><span>${gm('menu_autoclick')}</span><br>
    <i data-pref="autoClick"></i>
    </div>
</li>
-->
<li data-action="noGCPopup"><b data-pref="noGCPopup">&nbsp;</b>
    <div><span>${gm('menu_nogcpopup')}</span><br>
    <i data-pref="noGCPopup"></i>
    </div>
</li>
<li data-action="reloadGame"><b>&nbsp;</b>
    <div><span>${gm('menu_reloadgame')}</span><br>
    <i data-value="switch">${gm(isFacebook ? 'menu_switchportal' : 'menu_switchfacebook')}</i></div>
</li>
</ul>
<div class="DAF-badges">
    <b class="DAF-badge-gc DAF-badge-img"></b>
    <b class="DAF-badge-gc-energy DAF-badge-img" style="display:none" title="${gm('gui_energy')}"></b>
</div>
`;
    // remove spaces
    html = html.replace(/>\s+/g, '>');
    addStylesheet(chrome.extension.getURL('inject/game_menu.css'), function () {
        styleLoaded = true;
        showMenu();
    });
    menu = document.createElement('div');
    menu.classList.add('DAF-menu-container');
    menu.style.display = 'none';
    for (let node = (new DOMParser()).parseFromString(html, 'text/html').body.firstChild; node; node = node.nextSibling) menu.appendChild(menu.ownerDocument.importNode(node, true));
    document.body.appendChild(menu);
    for (const el of Array.from(menu.querySelectorAll('[data-pref]'))) {
        const prefName = el.getAttribute('data-pref');
        el.title = getMessage('options_' + prefName.toLowerCase());
    }
    menu.addEventListener('click', onMenuClick);
}

function showMenu() {
    if (loadCompleted && styleLoaded) menu.style.display = '';
}

function updateMenu(prefName) {
    if (!menu) return;
    for (const el of Array.from(menu.querySelectorAll('[data-pref' + (prefName ? '="' + prefName + '"' : '') + ']'))) {
        prefName = el.getAttribute('data-pref');
        const isOn = !!prefs[prefName];
        el.classList.toggle('DAF-on', isOn);
        if (el.tagName == 'I' && (prefName == 'fullWindow' || prefName == 'gcTable' || prefName == 'autoClick' || prefName == 'noGCPopup')) el.textContent = isOn ? textOn : textOff;
    }
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
            chrome.runtime.sendMessage({
                action: e.ctrlKey ? 'debug' : 'showGUI'
            });
            break;
        case 'fullWindow':
        case 'gcTable':
        case 'autoClick':
        case 'noGCPopup': {
            const name = target.getAttribute('data-pref') || action;
            sendPreference(name, !prefs[name]);
            break;
        }
        case 'reloadGame': {
            let value = target.getAttribute('data-value');
            const facebook = (isFacebook ^ (value === 'switch'));
            value += ' ' + (facebook ? 'facebook' : 'portal');
            chrome.runtime.sendMessage({
                action: 'reloadGame',
                value: value
            });
            break;
        }
    }
}

function interceptData() {
    const code = `
    (function() {
        const XHR = XMLHttpRequest.prototype;
        const send = XHR.send;
        const open = XHR.open;
        const site = location.host.startsWith('portal.') ? 'Portal' : 'Facebook';
        function dispatch(type, kind, request, response) {
            let lang;
            try { lang = gamevars.lang; } catch(e) { }
            const event = new CustomEvent('daf_xhr', { detail: { type, kind, site, lang, request, response } });
            document.dispatchEvent(event);
        }
        XHR.open = function(method, url) {
            this.url = url;
            return open.apply(this, arguments);
        }
        XHR.send = function() {
            let kind;
            if (this.url.indexOf('/graph.facebook.com') > 0) this.addEventListener('load', () => dispatch('ok', 'graph', null, this.response));
            else if (this.url.indexOf('/generator.php') > 0) kind = 'generator';
            else if (this.url.indexOf('/synchronize.php') > 0) kind = 'synchronize';
            if (kind) {
                const request = arguments[0];
                const error = () => dispatch('error', kind, null, null);
                dispatch('send', kind, request, null);
                this.addEventListener('load', () => dispatch('ok', kind, request, this.response));
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
        chrome.runtime.sendMessage({
            action: 'daf_xhr',
            detail: event.detail
        });
    });
}

function init() {
    isWebGL = true;
    miner = document.getElementById('miner') || document.getElementById('canvas');
    if (miner) {
        isWebGL = miner.id == 'canvas';
        isFacebook = window.location.href.indexOf('apps.facebook.com') >= 0;
        originalHeight = miner.height;
        // Set body height to 100% so we can use height:100% in miner
        document.body.style.height = '100%';
        // insert link for condensed font
        addStylesheet(chrome.extension.getURL('inject/game_gctable.css'), function () {
            gcTableStyle = true;
        });
    } else {
        for (const item of String(location.search).substr(1).split('&'))
            if (item.split('=')[0] == 'flash') isWebGL = false;
        if (document.getElementById('pagelet_bluebar')) {
            isFacebook = true;
            header = document.getElementById('pagelet_bluebar');
        } else if (document.getElementById('skrollr-body')) {
            isFacebook = false;
            header = document.getElementById('header');
        } else return;
    }
    if (isWebGL) interceptData();

    handlers = {};
    msgHandlers = {};
    prefs = {};
    const addPrefs = names => names.split(',').forEach(name => prefs[name] = undefined);
    addPrefs('language,resetFullWindow,fullWindow,fullWindowHeader,fullWindowSide,fullWindowLock,fullWindowTimeout');
    addPrefs('autoClick,noGCPopup,gcTable,gcTableCounter,gcTableRegion,fixes,@bodyHeight');

    function setPref(name, value) {
        if (!(name in prefs)) return;
        prefs[name] = value;
        if (name in handlers) handlers[name]();
        updateMenu(name);
    }

    chrome.runtime.sendMessage({
        action: 'getPrefs',
        keys: Object.keys(prefs)
    }, function (response) {
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

        chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
            try {
                const fn = request && request.action && msgHandlers[request.action];
                const response = fn ? fn(request, sender) : undefined;
                if (response !== undefined) sendResponse(response);
            } catch (e) {
                console.error('onMessage', e, request, sender);
            }
        });
        msgHandlers['sendValue'] = (request) => setPref(request.name, request.value);

        handlers['fullWindow'] = onFullWindow;
        if (!miner) handlers['fullWindowHeader'] = onFullWindow;
        if (!miner && isFacebook) handlers['fullWindowSide'] = onFullWindow;
        if (miner) {
            handlers['gcTable'] = ongcTable;
            handlers['gcTableRegion'] = setgcTableOptions;
            ongcTable();
        } else {
            handlers['gcTableCounter'] = setgcTableOptions;
        }
        msgHandlers['generator'] = () => {
            loadCompleted = true;
            onFullWindow();
            if (miner) ongcTable(true);
            else {
                showMenu();
                chrome.runtime.sendMessage({ action: 'getGCInfo' }, function (result) {
                    updateGCStatus(result);
                    setgcTableOptions();
                });
            }
            if (!getFullWindow() && !miner && prefs.fullWindowTimeout > 0) {
                let eventAttached = false;
                const check = () => {
                    // Better wait until the document is visible
                    if (document.hidden) {
                        if (!eventAttached) document.addEventListener('visibilitychange', check);
                        eventAttached = true;
                        return;
                    }
                    if (eventAttached) document.removeEventListener('visibilitychange', check);
                    eventAttached = false;
                    if (!getFullWindow()) sendPreference('fullWindow', true);
                };
                setTimeout(check, prefs.fullWindowTimeout * 1000);
            }
        };
        msgHandlers['friend_child_charge'] = (request) => {
            updateGCStatus(request.data);
            if (miner) gcTable_remove(document.getElementById('DAF-gc_' + request.data.id));
        };
        msgHandlers['gc-energy'] = (request) => {
            const energy = +request.data || 0;
            const badge = menu.querySelector('.DAF-badge-gc-energy');
            if (badge) {
                badge.textContent = energy;
                badge.style.display = energy ? '' : 'none';
            }
        };
        window.addEventListener('resize', onResize);
        if (miner) sendMinerPosition();
        onFullWindow();
        // if (!miner) {
        //     handlers['autoClick'] = onAutoClick;
        //     onAutoClick();
        // }
        if (miner) {
            handlers['noGCPopup'] = onNoGCPopup;
            onNoGCPopup();
            const key = Math.floor(Math.random() * 36 ** 8).toString(36).padStart(8, '0');
            window.addEventListener('message', function (event) {
                if (event.source != window || !event.data || event.data.key != key) return;
                if (event.data.action == 'exitFullWindow' && !prefs.fullWindowLock) sendPreference('fullWindow', false);
            });
            const fixes = String(prefs.fixes || '').toUpperCase().split(/\W+/).reduce((v, k) => (v[k] = true, v), {});
            if (isWebGL) {
                let code = '';
                code += `
window.original_isFullScreen = window.isFullScreen;
window.isDAFFullWindow = function() { return document.body.getAttribute('daf_fw') == '1'; };
window.isFullScreen = function() { return window.isDAFFullWindow() || window.original_isFullScreen(); };
window.original_exitFullscreen = window.exitFullscreen;
window.exitFullscreen = function() {
    if (!window.isDAFFullWindow()) return window.original_exitFullscreen();
    window.postMessage({ key: "${key}", action: "exitFullWindow" }, window.location.href);
};
`;
                if ('FBENABLED' in fixes) code += `gamevars.fb_enabled = 1;`;
                code += `
window.isBypassGCPopup = function() { return document.body.getAttribute('daf_nogc') == '1'; };
window.original_userRequest = window.userRequest;
window.userRequest = function(recipients, req_type) {
    if (!window.isBypassGCPopup()) return window.original_userRequest(recipients, req_type);
    cur_req_type = req_type;
    cur_recipients = String(recipients).split(',').filter(id => id > 0).join(',');
    if (cur_recipients) userRequestResult({ request: true });
};
`;
                document.head.appendChild(createScript(code));
            }
        } else {
            createMenu();
            updateMenu();
        }
    });
}

init();