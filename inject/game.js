/*global chrome*/
let prefs, handlers, msgHandlers, isFacebook, miner, isWebGL, originalHeight, header;
// var autoClickAttached, autoClickStyle;
let gcTable, gcTableStyle;
let menu;
let loadCompleted, styleLoaded;
let lastFullWindow = false;
let isOk = false;

function getUnixTime() {
    return Math.floor(Date.now() / 1000);
}

function sendMinerPosition() {
    // Send some values to the top window
    const name = '@bodyHeight';
    const value = Math.floor(document.getElementById('footer').getBoundingClientRect().bottom);
    if (prefs[name] !== value && value > 0) sendValue(name, value);
}

function sendValue(name, value) {
    chrome.runtime.sendMessage({ action: 'sendValue', name: name, value: prefs[name] = value });
}

function sendPreference(name, value) {
    if (name in prefs) chrome.storage.local.set({ [name]: value });
}

function forceResize(delay = 0) {
    setTimeout(() => window.dispatchEvent(new Event('resize')), delay);
}

function htmlEncode(text) {
    return text === undefined || text === null ? '' : String(text).replace(/[&<>'"]/g, c => '&#' + c.charCodeAt(0) + ';');
}
function htmlEncodeBr(text) {
    return htmlEncode(text).replace(/\n/g, '<br>');
}

function getMessage(id, ...args) {
    const $L = prefs.language;
    if (getMessage.$L !== $L) {
        const $M = getMessage.$M = {}, split = (key) => chrome.i18n.getMessage(key).split('|'), m0 = split('en'), m1 = split(getMessage.$L = $L);
        split('keys').forEach((key, index) => $M[key] = m1[index] || m0[index]);
    }
    return (getMessage.$M[id.toLowerCase()] || '').replace(/\^\d/g, t => { const n = +t[1] - 1; return n >= 0 && n < args.length ? args[n] : ''; });
}

function getFullWindow() {
    return prefs.fullWindow && loadCompleted;
}

function addStylesheet(href, onLoad) {
    const link = document.createElement('link');
    link.type = 'text/css';
    link.rel = 'stylesheet';
    link.href = href;
    if (onLoad) link.addEventListener('load', onLoad);
    document.head.appendChild(link);
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
        chrome.runtime.sendMessage({ action: 'getGCList', simulate: simulate }, function updateGCTable(result) {
            if (gcTable) while (gcTable.firstChild) gcTable.firstChild.remove();
            const list = (result && result.list) || [];
            const max = (result && result.max) || 0;
            const regions = (result && result.regions) || {};
            if (!gcTable) {
                gcTable = miner.parentNode.insertBefore(document.createElement('div'), miner.nextSibling);
                gcTable.className = 'DAF-gc-bar DAF-gc-flipped';
                gcTable.style.display = 'none';
                gcTable.addEventListener('click', function (e) {
                    for (let div = e.ctrlKey && e.target; div && div !== gcTable; div = div.parentNode)
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
                div.style.backgroundImage = 'url(' + (item.pic || 'https://graph.facebook.com/v2.8/' + item.fb_id + '/picture') + ')';
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
}

function setBadge({ selector, text, title, active }) {
    const badge = menu && menu.querySelector(selector);
    if (!badge) return;
    badge.textContent = text || '';
    badge.title = title || '';
    badge.classList.toggle('DAF-badge-on', !!active);
}

function playSound(sound, volume = 100) {
    if (!sound || !volume) return;
    volume = +volume / 100;
    const last = playSound.last = playSound.last || {};
    if (last.sound == sound && (!last.ended || last.ended + 5 > getUnixTime())) return;
    if (last.audio) try { last.audio.pause(); } catch (e) { }
    const audio = last.audio = new Audio(last.sound = sound);
    audio.volume = volume;
    last.ended = 0;
    audio.play().then(_ => 0).finally(_ => {
        if (audio == last.audio) {
            last.audio = null;
            last.ended = getUnixTime();
        }
    });
}

let badgeLuckyCards, badgeLuckyCardsNext, badgeLuckyCardsHandler;
function setBadgeLucky({ active, sound, volume, next }) {
    active = !!active;
    const badge = menu && menu.querySelector('.DAF-badge-luckycards');
    if (!badge) return;
    if (!badgeLuckyCards) {
        badgeLuckyCards = badge;
        badge.addEventListener('mouseenter', () => badge.classList.remove('animate'));
    }
    const wasActive = badge.classList.contains('DAF-badge-on');
    badge.classList.toggle('DAF-badge-on', active);
    badgeLuckyCardsNext = active ? next : 0;
    if (active && !wasActive) {
        badge.classList.add('animate');
        playSound(sound, volume);
    }
    setBadgetLuckyText();
}
function setBadgetLuckyText() {
    if (badgeLuckyCardsHandler) clearTimeout(badgeLuckyCardsHandler);
    badgeLuckyCardsHandler = 0;
    if (!badgeLuckyCardsNext) return;
    const now = getUnixTime();
    let diff = badgeLuckyCardsNext - now;
    let text = getMessage('repeat_ready');
    if (diff > 0) {
        badgeLuckyCardsHandler = setTimeout(setBadgetLuckyText, 1000 - Date.now() % 1000);
        text = String(diff % 60).padStart(2, '0');
        diff = (diff - diff % 60) / 60;
        if (diff) {
            text = String(diff % 60).padStart(2, '0') + ':' + text;
            diff = (diff - diff % 60) / 60;
            if (diff) text = String(diff).padStart(2, '0') + ':' + text;
        }
    }
    badgeLuckyCards.textContent = text;
}

function setBadgeProduction(selector, data, flagActive) {
    const badge = menu && menu.querySelector(selector);
    if (!badge) return;
    if (!badge.getAttribute('data-set')) {
        badge.setAttribute('data-set', 1);
        badge.addEventListener('mouseenter', () => badge.classList.remove('animate'));
    }
    const wasActive = badge.classList.contains('DAF-badge-on');
    const prevNum = +badge.textContent || 0;
    const currNum = +data.num;
    const isActive = currNum > 0;
    badge.textContent = currNum;
    badge.classList.toggle('DAF-badge-on', isActive);
    const flag = prefs.badgeProductions && flagActive && isActive && (!wasActive || prevNum < currNum);
    if (flag) badge.classList.add('animate');
    return flag;
}
function setBadgeProductions(data) {
    let flag = false;
    flag |= setBadgeProduction('.DAF-badge-p-c', data.caravan, prefs.badgeCaravan);
    flag |= setBadgeProduction('.DAF-badge-p-k', data.kitchen, prefs.badgeKitchen);
    flag |= setBadgeProduction('.DAF-badge-p-f', data.foundry, prefs.badgeFoundry);
    if (flag && prefs.badgeProductionsSound) playSound(data.sound, data.volume);
}

function setServerEnergy({ energy }) {
    const badge = menu && menu.querySelector('.DAF-badge-energy');
    if (!badge) return;
    badge.textContent = energy;
    badge.classList.add('DAF-badge-on');
    if (!badge.getAttribute('data-set')) {
        badge.setAttribute('data-set', 1);
        badge.addEventListener('click', () => badge.classList.remove('DAF-badge-on'));
    }
}

let badgeRepContainer, badgeRepCounter1, badgeRepCounter2, badgeRepDivs = {};
function setBadgeRep({ list, sound, volume }) {
    list = Array.isArray(list) ? list : [];
    const badge = menu && menu.querySelector('.DAF-badge-rep');
    if (!badge) return;
    if (!badgeRepContainer) {
        badgeRepContainer = badge.appendChild(document.createElement('b'));
        badge.addEventListener('mouseenter', () => {
            badge.classList.remove('animate');
            badge.querySelectorAll('.new').forEach(el => el.classList.remove('new'));
        });
        badgeRepCounter1 = badgeRepContainer.appendChild(document.createElement('span'));
        badgeRepCounter1.classList.add('no-hover');
        badgeRepCounter2 = badgeRepContainer.appendChild(document.createElement('span'));
        badgeRepCounter2.classList.add('on-hover');
    }
    badge.classList.toggle('DAF-badge-on', list.length > 0);
    const setCounter = (el, num, addTitle) => {
        const rest = list.slice(num);
        const flag = rest.length > 0;
        el.style.display = flag ? '' : 'none';
        el.textContent = flag ? '+' + rest.length : '';
        el.title = flag && addTitle ? rest.map(data => `${data.name} (${data.rname})`).join('\n') : '';
    };
    const numVisible = list.length > 3 ? 1 : list.length;
    setCounter(badgeRepCounter1, numVisible);
    setCounter(badgeRepCounter2, 8, true);
    const newBadgeRepDivs = {};
    let isNew = false;
    list.forEach(item => {
        let el = badgeRepDivs[item.lid];
        if (!el) {
            isNew = true;
            el = badgeRepContainer.insertBefore(document.createElement('div'), badgeRepContainer.firstChild);
            el.classList.add('new');
            el.title = `${item.name}\n${getMessage(item.rid ? 'gui_region' : 'gui_event')}: ${item.rname}`;
            el.style.backgroundImage = 'url(' + item.image + ')';
        }
        delete badgeRepDivs[item.lid];
        newBadgeRepDivs[item.lid] = el;
    });
    Object.values(badgeRepDivs).forEach(el => el.remove());
    badgeRepDivs = newBadgeRepDivs;
    badgeRepContainer.querySelectorAll('div').forEach((el, index) => {
        el.style.display = index >= 10 ? 'none' : '';
        el.classList.toggle('on-hover', index >= numVisible);
    });
    if (isNew && prefs.badgeRepeatables) playSound(sound, volume);
    badge.classList.toggle('animate', isNew || !!badge.querySelector('.new'));
}

function updateGCStatus(data) {
    if (!menu) return;
    const el = menu.querySelector('[data-value=status]');
    el.textContent = data.count ? getMessage('godchild_stat', data.count, data.max) : el.textContent = getMessage('menu_gccollected');
    el.title = data.nexttxt || '';
    el.style.display = '';
    setBadge({ selector: '.DAF-badge-gc-counter', text: data.count, title: data.nexttxt, active: data.count > 0 });
}

let searchHandler, searchInput;
function search() {
    if (searchHandler) clearTimeout(searchHandler);
    searchHandler = setTimeout(() => {
        const table = menu.querySelector('[data-action="search"] table');
        table.style.display = 'none';
        const tbody = table.tBodies[0];
        while (tbody.firstElementChild) tbody.firstElementChild.remove();
        const text = searchInput.value.trim();
        if (text) chrome.runtime.sendMessage({ action: 'searchNeighbor', text }, ({ count, list }) => {
            if (chrome.runtime.lastError) return;
            table.style.display = '';
            table.tHead.style.display = list.length ? '' : 'none';
            list.forEach(pal => {
                const row = tbody.appendChild(document.createElement('tr'));
                let td, img;
                td = row.appendChild(document.createElement('td'));
                img = td.appendChild(document.createElement('img'));
                img.src = pal.pic || `https://graph.facebook.com/v2.8/${pal.fb_id}/picture`;
                td = row.appendChild(document.createElement('td'));
                if (!pal.furl || pal.fn != pal.name) {
                    td.textContent = pal.name;
                    if (pal.fn) {
                        td.appendChild(document.createElement('br'));
                        if (!pal.furl) td.appendChild(document.createElement('i')).textContent = pal.fn;
                    }
                }
                if (pal.furl && pal.fn) {
                    const a = td.appendChild(document.createElement('a'));
                    a.target = '_blank';
                    a.href = pal.furl;
                    a.textContent = pal.fn;
                }
                td = row.appendChild(document.createElement('td'));
                img = td.appendChild(document.createElement('img'));
                img.src = chrome.runtime.getURL(pal.rimage);
                img.title = pal.rname;
                td = row.appendChild(document.createElement('td'));
                td.textContent = pal.level;
            });
            table.tFoot.style.display = count === 0 || count - list.length > 0 ? '' : 'none';
            table.tFoot.firstElementChild.firstElementChild.textContent = count == 0 ? getMessage('gui_noresults') : `${getMessage('gui_toomanyresults')} (${count})`;
        });
    }, 500);
}


function createMenu() {
    addStylesheet(chrome.runtime.getURL('inject/game_menu.css'), () => { styleLoaded = true; showMenu(); });
    const gm = (id) => htmlEncodeBr(getMessage(id));
    const gmt = (id) => htmlEncode(getMessage(id));
    const gm0 = (id) => htmlEncode(getMessage(id).split('\n')[0]);
    const getMessage1 = (id) => {
        const t = getMessage(id), i = t.indexOf('\n');
        return t.substr(i + 1);
    };
    const gmSound = htmlEncode(getMessage1('options_badgesound'));
    let html = `
<ul class="DAF-menu${isFacebook ? ' DAF-facebook' : ''}">
<li data-action="about"><b>&nbsp;</b>
    <div><span>${gm('ext_name')}</span><br><span>${gm('ext_title')}</span></div>
</li>
<li data-action="search"><b>&nbsp;</b>
    <div><span>${gm('gui_search')}</span><input type="text">
    <br><table style="display:none">
    <thead><tr><td colspan="2">${gm('gui_neighbour')}</td>
    <td><img src="${chrome.runtime.getURL('/img/gui/map.png')}" title="${gmt('gui_region')}" height="20"></td>
    <td><img src="${chrome.runtime.getURL('/img/gui/level.png')}" title="${gmt('gui_level')}" height="20"></td></tr></thead>
    <tbody></tbody>
    <tfoot><tr><th colspan="4"></th></tr></tfoot>
    </table>
    </div>
</li>
<li data-action="fullWindow"><b data-pref="fullWindow">&nbsp;</b>
    <div>
        <i data-pref="fullWindow">${gm('menu_fullwindow')}</i>
        <i data-pref="fullWindowLock">${gm('menu_fullwindowlock')}</i>
        <br>
        <i data-pref="fullWindowHeader">${gm('menu_fullwindowheader')}</i>
        <i data-pref="fullWindowSide">${gm('menu_fullwindowside')}</i>
        <i data-pref="resetFullWindow">${gm('menu_resetfullwindow')}</i>
    </div>
</li>
<li data-action="gc"><b>&nbsp;</b>
    <div>
        <span data-value="status" style="display:none"></span>
        <br>
        <i data-pref="gcTable">${gm('menu_gctable')}</i>
        <i data-pref="gcTableCounter">${gm('menu_gctablecounter')}</i>
        <i data-pref="gcTableRegion">${gm('menu_gctableregion')}</i>
        <br>
        <i data-pref="autoGC">${gm0('options_autogc')}</i>
        <br>
        <i data-pref="noGCPopup">${gm0('options_nogcpopup')}</i>
    </div>
</li>
<li data-action="badges"><b>&nbsp;</b>
    <div>
        <span>${gm('options_section_badges')}</span><br>
        <i data-pref="badgeServerEnergy">${gm0('options_badgeserverenergy')}</i>
        <i data-pref="badgeGcCounter">${gm0('options_badgegccounter')}</i>
        <i data-pref="badgeGcEnergy">${gm0('options_badgegcenergy')}</i>
        <br>
        <i data-pref="badgeProductions" class="squared-right">${gm0('options_badgeproductions')}</i>
        <i data-pref="badgeCaravan" title="" class="squared-right squared-left hue2">${gm0('tab_caravan')}</i>
        <i data-pref="badgeKitchen" title="" class="squared-right squared-left hue2">${gm0('tab_kitchen')}</i>
        <i data-pref="badgeFoundry" title="" class="squared-right squared-left hue2">${gm0('tab_foundry')}</i>
        <i data-pref="badgeProductionsSound" class="squared-left hue" title="${gmSound}">${gm0('options_badgesound')}</i>
        <br>
        <i data-pref="badgeRepeatables" class="squared-right">${gm0('options_badgerepeatables')}</i>
        <i data-pref="badgeRepeatablesSound" class="squared-left hue" title="${gmSound}">${gm0('options_badgesound')}</i>
        <br>
        <i data-pref="badgeLuckyCards" class="squared-right">${gm0('options_badgeluckycards')}</i>
        <i data-pref="badgeLuckyCardsSound" class="squared-left hue" title="${gmSound}">${gm0('options_badgesound')}</i>
    </div>
</li>
<li data-action="reloadGame"><b>&nbsp;</b>
    <div>
        <span>${gm('menu_reloadgame')}</span>
        <br>
        <i data-value="switch">${gm(isFacebook ? 'menu_switchportal' : 'menu_switchfacebook')}</i>
    </div>
</li>
</ul>
<div class="DAF-badges">
    <b class="DAF-badge-energy DAF-badge-img"></b>
    <b class="DAF-badge-gc-counter DAF-badge-img"></b>
    <b class="DAF-badge-gc-energy DAF-badge-img"></b>
    <b class="DAF-badge-p-c DAF-badge-img" title="${gm('tab_caravan')}">0</b>
    <b class="DAF-badge-p-k DAF-badge-img" title="${gm('tab_kitchen')}">0</b>
    <b class="DAF-badge-p-f DAF-badge-img" title="${gm('tab_foundry')}">0</b>
    <b class="DAF-badge-luckycards DAF-badge-img" title="${gm0('options_badgeluckycards')}"></b>
    <div class="DAF-badge-rep"></div>
</div>
`;
    // remove spaces
    html = html.replace(/>\s+/g, '>');
    menu = document.createElement('div');
    menu.classList.add('DAF-menu-container');
    menu.style.display = 'none';
    for (let node = (new DOMParser()).parseFromString(html, 'text/html').body.firstChild; node; node = node.nextSibling) menu.appendChild(menu.ownerDocument.importNode(node, true));
    document.body.appendChild(menu);
    for (const el of Array.from(menu.querySelectorAll('[data-pref]'))) {
        const prefName = el.getAttribute('data-pref');
        if (!el.hasAttribute('title')) el.title = getMessage1('options_' + prefName.toLowerCase());
    }
    searchInput = menu.querySelector('[data-action="search"] input');
    searchInput.addEventListener('input', search);
    searchInput.addEventListener('keydown', event => {
        if (event.which == 27) document.activeElement.blur();
    });
    menu.addEventListener('click', onMenuClick);
}

function showMenu() {
    if (loadCompleted && styleLoaded) menu.style.display = '';
}

function updateMenu(prefName) {
    if (!menu) return;
    for (const el of Array.from(menu.querySelectorAll('[data-pref' + (prefName ? '="' + prefName + '"' : '') + ']'))) {
        const prefName = el.getAttribute('data-pref');
        const isOn = !!prefs[prefName];
        el.classList.toggle('DAF-on', isOn);
    }
    const divBadges = menu.querySelector('.DAF-badges');
    const names = prefName ? [prefName] : Object.keys(prefs);
    names.filter(prefName => prefName.startsWith('badge')).forEach(prefName => divBadges.classList.toggle('DAF-' + prefName.toLowerCase(), !!prefs[prefName]));
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
            chrome.runtime.sendMessage({ action: 'showGUI' });
            break;
        case 'fullWindow':
        case 'gc': {
            const name = target.getAttribute('data-pref') || action;
            sendPreference(name, !prefs[name]);
            break;
        }
        case 'badges': {
            const name = target.getAttribute('data-pref');
            if (name) sendPreference(name, !prefs[name]);
            break;
        }
        case 'reloadGame': {
            let value = target.getAttribute('data-value');
            const facebook = (isFacebook ^ (value === 'switch'));
            value += ' ' + (facebook ? 'facebook' : 'portal');
            chrome.runtime.sendMessage({ action: 'reloadGame', value: value });
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
        function dispatch(type, kind, request, response) {
            let lang;
            try { lang = gamevars.lang; } catch(e) { }
            let text = '';
            if (response === null) text = null;
            else if (typeof response == 'string') text = response;
            else if (response && response.bytes instanceof Uint8Array) text = getString(response.bytes);
            else console.log('daf_xhr: invalid response');
            const event = new CustomEvent('daf_xhr', { detail: { type, kind, lang, request, response: text } });
            document.dispatchEvent(event);
        }
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
        chrome.runtime.sendMessage({ action: 'daf_xhr', detail: event.detail });
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
        addStylesheet(chrome.runtime.getURL('inject/game_gctable.css'), () => { gcTableStyle = true; });
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
        chrome.runtime.sendMessage({ action: 'gameStarted', site: isFacebook ? 'Facebook' : 'Portal' });
    }
    if (isWebGL) interceptData();

    handlers = {};
    msgHandlers = {};
    prefs = {};
    const addPrefs = names => names.split(',').forEach(name => prefs[name] = undefined);
    addPrefs('language,resetFullWindow,fullWindow,fullWindowHeader,fullWindowSide,fullWindowLock,fullWindowTimeout');
    addPrefs('autoClick,autoGC,noGCPopup,gcTable,gcTableCounter,gcTableRegion,@bodyHeight');
    addPrefs('badgeServerEnergy,badgeGcCounter,badgeGcEnergy,badgeProductions,badgeProductionsSound,badgeCaravan,badgeKitchen,badgeFoundry,badgeRepeatables,badgeRepeatablesSound,badgeLuckyCards,badgeLuckyCardsSound');

    function setPref(name, value) {
        if (!(name in prefs)) return;
        prefs[name] = value;
        if (name in handlers) handlers[name]();
        updateMenu(name);
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

        chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
            try {
                const action = request && request.action;
                if (!miner && !isOk && (action == 'generator' || action == 'enter_mine' || action == 'visit_camp')) {
                    isOk = true;
                    menu.classList.add('ok');
                }
                const fn = msgHandlers[action];
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
            if (loadCompleted) return;
            delete msgHandlers['generator'];
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
        setTimeout(msgHandlers['generator'], 10000);
        msgHandlers['friend_child_charge'] = (request) => {
            updateGCStatus(request.data);
            if (miner) {
                gcTable_remove(document.getElementById('DAF-gc_' + request.data.id));
                if (prefs.autoGC && request.data.skip) {
                    const eventConfig = { clientX: 35, clientY: Math.floor(miner.offsetHeight / 2 + miner.offsetTop), buttons: 1 };
                    miner.dispatchEvent(new MouseEvent('mousedown', eventConfig));
                    setTimeout(() => miner.dispatchEvent(new MouseEvent('mouseup', eventConfig)), 250);
                }
            }
        };
        if (!miner) {
            msgHandlers['gc-energy'] = (request) => {
                const energy = (request.data && +request.data.energy) || 0;
                setBadge({ selector: '.DAF-badge-gc-energy', text: energy, title: (request.data && request.data.title) || getMessage('gui_energy'), active: energy > 0 });
            };
            msgHandlers['repeatables'] = (request) => setBadgeRep(request.data);
            msgHandlers['luckycards'] = (request) => setBadgeLucky(request.data);
            msgHandlers['productions'] = (request) => setBadgeProductions(request.data);
            msgHandlers['serverEnergy'] = (request) => setServerEnergy(request.data);
        }
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
                code += `
window.bypassFB = false;
window.original_getFBApi = window.getFBApi;
window.getFBApi = function() {
    const result = window.bypassFB ? { ui: function() {} } : window.original_getFBApi();
    window.bypassFB = false;
    return result;
};
window.original_userRequest = window.userRequest;
window.userRequest = function(recipients, req_type) {
    window.bypassFB = document.body.getAttribute('daf_nogc') == '1';
    const result = window.original_userRequest(recipients, req_type);
    window.bypassFB = false;
    return result;
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