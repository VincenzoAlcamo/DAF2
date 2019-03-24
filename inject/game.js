var prefs, handlers, msgHandlers, isFacebook, miner, isWebGL, originalHeight, gcTable, header, autoClickAttached, styleInjected, timeout;
var menu, textOn, textOff

function sendMinerPosition() {
    // Send some values to the top window
    var name = '@bodyHeight';
    var value = Math.floor(document.getElementById('footer').getBoundingClientRect().bottom);
    if (prefs[name] !== value && value > 0)
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

function addStylesheet(href) {
    var link = document.createElement('link');
    link.type = 'text/css';
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
}

var htmlEncodeBr = (function() {
    var htmlEntities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
        '\n': '<br>'
    };
    var re = /[&<>'"\n]/g;

    function replacer(c) {
        return htmlEntities[c];
    }
    return function htmlEncodeBr(text) {
        return text === undefined || text === null ? '' : String(text).replace(re, replacer);
    };
})();

function getMessage(id, ...args) {
    return chrome.i18n.getMessage(id, args);
}

function onResize() {
    var headerHeight = header ? header.getBoundingClientRect().height : 0;
    var gcTableHeight = gcTable ? gcTable.offsetHeight : 0;
    var iframe = isFacebook ? document.getElementById('iframe_canvas') : document.getElementsByClassName('game-iframe game-iframe--da')[0];
    if (miner) {
        if (gcTable) {
            gcTable.style.overflowX = 'auto';
            gcTable.style.width = prefs.fullWindow ? window.innerWidth : '100%';
        }
        // if (menu) {
        //     menu.style.top = Math.floor(miner.getBoundingClientRect().top + 30) + 'px';
        // }
        if (!isWebGL) {
            miner.style.height = prefs.fullWindow ? (gcTableHeight > 0 ? 'calc(100% - ' + gcTableHeight + 'px)' : '100%') : originalHeight;
            // Please note: we must set the width for zoomed out view (for example, at 50%)
            // otherwise the element will be clipped horizontally
            miner.width = prefs.fullWindow || prefs.fullWindowSide ? window.innerWidth : '100%';
        }
        sendMinerPosition();
    } else if (isFacebook) {
        // if (originalHeight === undefined && iframe.style.height == '') {
        //     timeout = (timeout || 500) * 2;
        //     forceResize(timeout);
        // } else {
        originalHeight = originalHeight || iframe.offsetHeight;
        iframe.style.height = prefs.fullWindow ? (window.innerHeight - (prefs.fullWindowHeader ? headerHeight : 0)) + 'px' : (prefs['@bodyHeight'] || originalHeight) + 'px';
        // }
    } else {
        iframe.style.height = prefs.fullWindow ? (window.innerHeight - (prefs.fullWindowHeader ? headerHeight : 0)) + 'px' : '';
    }
}

function onFullWindow() {
    var flagHide = prefs.fullWindow;
    var fn = el => el && (el.style.display = flagHide ? 'none' : '');
    if (miner) {
        if (isWebGL) {
            var script = document.createElement('script');
            script.innerText = 'document.mozFullScreenElement=' + prefs.fullWindow;
            document.head.appendChild(script);
            setTimeout(() => script.parentNode.removeChild(script), 500);
            document.body.style.backgroundColor = prefs.fullWindow ? '#000' : '';
            document.body.style.overflow = prefs.fullWindow ? 'hidden' : '';
        } else {
            document.body.style.overflowY = prefs.fullWindow ? 'hidden' : '';
        }
        Array.from(document.querySelectorAll('.header-menu,#gems_banner,.cp_banner .bottom_banner,#bottom_news,#footer,.client-type-switch,.news')).forEach(fn);
        forceResize(1000);
    } else {
        Array.from(document.querySelectorAll('#pagelet_dock,#footer')).forEach(fn);
        flagHide = prefs.fullWindow && !prefs.fullWindowHeader;
        fn(header);
        flagHide = prefs.fullWindow || prefs.fullWindowSide;
        fn(document.querySelector('#rightCol'));
        document.body.style.overflowY = prefs.fullWindow ? 'hidden' : '';
        onResize();
    }
}

function autoClickHandler(e) {
    if (event.animationName !== 'DAF_anim' || !prefs.autoClick) return;
    var element = event.target;
    var parent = element;
    // find root node for dialog, so we can send it in background
    while (parent.parentNode.tagName != 'BODY') parent = parent.parentNode;
    // this is the Invite dialog
    if (parent.querySelector('.profileBrowserDialog')) return;
    parent.style.zIndex = -1;
    // click the confirm button
    element.click();
}

function onAutoClick() {
    var autoClick = prefs.autoClick;
    if (autoClick == autoClickAttached) return;
    if (autoClick && !styleInjected) {
        styleInjected = document.createElement('style');
        styleInjected.innerHTML = `@keyframes DAF_anim { from { outline: 1px solid transparent } to { outline: 0px solid transparent } }
button.layerConfirm[name=__CONFIRM__] { animation-duration: 0.001s; animation-name: DAF_anim; }`;
        document.head.appendChild(styleInjected);
    }
    autoClickAttached = autoClick;
    document[autoClick ? 'addEventListener' : 'removeEventListener']('animationstart', autoClickHandler, false);
}

function gcTable_isEmpty() {
    return gcTable.childNodes.length <= 1;
}

function gcTable_remove(div) {
    if (!gcTable) return;
    var heightBefore = gcTable.offsetHeight;
    if (div) {
        div.parentNode.removeChild(div);
        gcTable.firstChild.firstChild.textContent = gcTable.childNodes.length - 1;
        var heightAfter = gcTable.offsetHeight;
        // scrollbar was hidden and we are in full window?
        if (heightBefore > heightAfter && prefs.fullWindow) {
            // Force Resize is currently disabled because it causes the game's neighbour list to reset position
            // instead, we keep the space for the scrollbar
            gcTable.style.overflowX = 'scroll';
        }
    }
    // handle case where the table is empty
    if (gcTable_isEmpty() && gcTable.style.display != 'none') {
        gcTable.style.display = 'none';
        if (prefs.fullWindow) forceResize();
    }
}

function onShowGC(forceRefresh = false, simulate = 0) {
    var show = prefs.gcTable;
    // If table is present, we just show/hide it
    if (gcTable && gcTable_isEmpty() && !forceRefresh) {
        // handle case where the table is empty
        gcTable_remove(null);
    } else if (gcTable && !forceRefresh) {
        gcTable.style.display = show ? 'block' : 'none';
        if (prefs.fullWindow) forceResize();
        // If table is not present and we need to show it, we must retrieve the neighbours first
    } else if (show) {
        chrome.runtime.sendMessage({
            action: 'getGCList',
            simulate: simulate
        }, function updateGCTable(result) {
            if (gcTable) gcTable.innerHTML = '';
            var list = (result && result.list) || [];
            var max = (result && result.max) || 0;
            var regions = (result && result.regions) || {};
            if (!gcTable) {
                gcTable = miner.parentNode.insertBefore(document.createElement('div'), miner.nextSibling);
                gcTable.className = 'DAF-gc-bar';
                gcTable.style.display = 'none';
                gcTable.addEventListener('click', function(e) {
                    for (var div = e.srcElement; div && div !== gcTable; div = div.parentNode)
                        if (div.id && div.id.startsWith('DAF-gc_')) return gcTable_remove(div);
                });
            }
            var counter = gcTable.appendChild(document.createElement('div'));
            counter.className = 'DAF-gc-count';
            counter.appendChild(document.createElement('div')).textContent = list.length;
            counter.appendChild(document.createElement('div')).textContent = '/';
            counter.appendChild(document.createElement('div')).textContent = max;
            setgcTableOptions();
            list.forEach(item => {
                var div = gcTable.appendChild(document.createElement('div'));
                div.id = 'DAF-gc_' + item.id;
                div.className = 'DAF-gc-pal DAF-gc-reg' + item.region;
                div.style.backgroundImage = 'url(' + (item.id == 1 ? item.pic : 'https://graph.facebook.com/v2.8/' + item.fb_id + '/picture') + ')';
                var fullName = item.name;
                if (item.surname) fullName += ' ' + item.surname;
                div.title = fullName + '\n' + getMessage('camp_slot_region', regions[item.region]);
                var d = div.appendChild(document.createElement('div'));
                d.textContent = item.level;
                if (item.id == 0 || item.id == 1) d.style.visibility = 'hidden';
                div.appendChild(document.createElement('div')).textContent = item.name;
            });
            if (gcTable_isEmpty()) return gcTable_remove(null);
            gcTable.style.display = '';
            if (prefs.fullWindow) forceResize(1000);
        });
    }
}

function setgcTableOptions() {
    if (!gcTable) return;
    gcTable.classList.toggle('DAF-gc-show-counter', !!prefs.gcTableCounter);
    gcTable.classList.toggle('DAF-gc-show-region', !!prefs.gcTableRegion);
}

function createMenu() {
    function gm(id) {
        return htmlEncodeBr(getMessage(id));
    }
    textOn = getMessage('menu_on');
    textOff = getMessage('menu_off');
    var html = `
<li data-action="about"><b>&nbsp;</b>
    <div><span>${gm('ext_name')}</span><br><span>${gm('ext_title')}</span></div>
</li>
<li data-action="fullWindow"><b>&nbsp;</b>
    <div><span>${gm('menu_fullwindow')}</span><br>
    <i data-pref="fullWindow"></i>
    <i data-pref="fullWindowHeader">${gm('menu_fullwindowheader')}</i>
    <i data-pref="fullWindowSide">${gm('menu_fullwindowside')}</i>
    </div>
</li>
<li data-action="gcTable"><b>&nbsp;</b>
    <div><span>${gm('menu_gctable')}</span><span>${gm('menu_gccollected')}</span><br>
    <i data-pref="gcTable"></i>
    <i data-pref="gcTableCounter">${gm('menu_gctablecounter')}</i>
    <i data-pref="gcTableRegion">${gm('menu_gctableregion')}</i>
    </div>
</li>
<li data-action="autoClick"><b>&nbsp;</b>
    <div><span>${gm('menu_autoclick')}</span><br>
    <i data-pref="autoClick"></i>
    </div>
</li>
<li data-action="reloadGame"><b>&nbsp;</b>
    <div><span>${gm('menu_reloadgame')}</span><br>
    <i data-value="webgl" class="${isWebGL ? 'DAF-on' : ''}">WebGL</i>
    <i data-value="flash" class="${!isWebGL ? 'DAF-on' : ''}">Flash</i>
    <i data-value="switch">${gm(isFacebook ? 'menu_switchportal' : 'menu_switchfacebook')}</i></div>
</li>
`;
    // remove spaces
    html = html.replace(/>\s+/g, '>');

    addStylesheet(chrome.extension.getURL('inject/game_menu.css'));
    menu = document.createElement('ul');
    menu.className = 'DAF-menu';
    menu.classList.toggle('DAF-facebook', isFacebook)
    menu.style.display = 'none';
    menu.innerHTML = html;
    document.body.appendChild(menu);
    menu.addEventListener('click', onMenuClick);
}

function updateMenu(prefName) {
    if (!menu) return;
    for (var el of Array.from(menu.querySelectorAll('[data-pref' + (prefName ? '="' + prefName + '"' : '') + ']'))) {
        prefName = el.getAttribute('data-pref');
        var isOn = !!prefs[prefName];
        el.classList.toggle('DAF-on', isOn);
        if (prefName == 'fullWindow' || prefName == 'gcTable' || prefName == 'autoClick') el.textContent = isOn ? textOn : textOff;
    }
}

function onMenuClick(e) {
    var target = e.target;
    if (!target || target.tagName == 'DIV') return;
    var action = null;
    var parent = target;
    while (parent && parent !== menu && !(action = parent.getAttribute('data-action')))
        parent = parent.parentNode;
    switch (action) {
        case 'about':
            chrome.runtime.sendMessage({
                action: "showGUI"
            });
            break;
        case 'fullWindow':
        case 'gcTable':
        case 'autoClick':
            var name = target.getAttribute('data-pref') || action;
            sendPreference(name, !prefs[name]);
            break;
        case 'reloadGame':
            var value = target.getAttribute('data-value');
            var facebook = (isFacebook ^ (value === 'switch'));
            var webgl = value == 'flash' ? false : isWebGL || value == 'webgl';
            var url = (facebook ? 'https://apps.facebook.com/diggysadventure/' : 'https://portal.pixelfederation.com/diggysadventure/');
            url += (webgl ? '?webgl' : '?flash');
            window.location = url;
            // chrome.runtime.sendMessage({
            //     action: "reloadGame",
            //     webgl: webgl,
            //     site: facebook ? 'facebook' : 'portal'
            // });
            break;
    }
}

function init() {
    isWebGL = true;
    miner = document.getElementById('miner') || document.getElementById('canvas');
    if (miner) {
        isWebGL = miner.id == 'canvas';
        isFacebook = window.location.href.indexOf('apps.facebook.com') >= 0;
        originalHeight = miner.height + 'px';
        // Set body height to 100% so we can use height:100% in miner
        document.body.style.height = '100%';
        // insert link for condensed font
        addStylesheet(chrome.extension.getURL('inject/game_gctable.css'));
    } else {
        for (var item of String(location.search).substr(1).split('&'))
            if (item.split('=')[0] == 'flash') isWebGL = false;
        if (document.getElementById('pagelet_bluebar')) {
            isFacebook = true;
            header = document.getElementById('pagelet_bluebar');
        } else if (document.getElementById('skrollr-body')) {
            isFacebook = false;
            header = document.getElementById('header');
        } else return;
    }

    handlers = {};
    msgHandlers = {};
    prefs = {};
    'fullWindow,fullWindowHeader,fullWindowSide,autoClick,gcTable,gcTableCounter,gcTableRegion,@bodyHeight'.split(',').forEach(name => prefs[name] = undefined);

    function setPref(name, value) {
        if (!prefs.hasOwnProperty(name)) return;
        prefs[name] = value;
        if (name in handlers) handlers[name]();
        updateMenu(name);
    }

    chrome.runtime.sendMessage({
        action: 'getPrefs',
        keys: Object.keys(prefs)
    }, function(response) {
        if (chrome.runtime.lastError) return;
        Object.keys(response).forEach(name => setPref(name, response[name]));

        // track preference changes
        chrome.storage.onChanged.addListener(function(changes, area) {
            for (var name in changes) setPref(name, changes[name].newValue);
        });

        chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
            try {
                var fn = request && request.action && msgHandlers[request.action];
                var response = fn ? fn(request, sender) : undefined;
                if (response !== undefined) sendResponse(response);
            } catch (e) {
                console.error('onMessage', e, request, sender);
            }
        });
        msgHandlers['sendValue'] = (request, sender) => setPref(request.name, request.value);

        handlers['fullWindow'] = onFullWindow;
        if (!miner) handlers['fullWindowHeader'] = onFullWindow;
        if (!miner && isFacebook) handlers['fullWindowSide'] = onFullWindow;
        if (miner) {
            msgHandlers['generator'] = (request, sender) => onShowGC(true);
            msgHandlers['friend_child_charge'] = (request, sender) => gcTable_remove(document.getElementById('DAF-gc_' + request.data));
            handlers['gcTable'] = onShowGC;
            handlers['gcTableCounter'] = handlers['gcTableRegion'] = setgcTableOptions;
            onShowGC();
        }
        window.addEventListener('resize', onResize);
        if (miner) sendMinerPosition();
        onFullWindow();
        if (!miner) {
            handlers['autoClick'] = onAutoClick;
            onAutoClick();
        }
        if (!miner) {
            createMenu();
            updateMenu();
            // Show it later (after the stylesheet has been loaded)
            setTimeout(() => menu.style.display = '', 1000);
        }
    });
}

init();