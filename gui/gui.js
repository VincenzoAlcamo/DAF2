var bgp = chrome.extension.getBackgroundPage();

window.addEventListener('load', onLoad);

// Lazy load images using an IntersectionObserver
var lazyObserver = new IntersectionObserver(function(entries) {
    for (let entry of entries) {
        if (entry.intersectionRatio <= 0) return;
        var element = entry.target;
        lazyObserver.unobserve(element);
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
});
var resizeObserver = new ResizeObserver(function(entries) {
    for (let entry of entries) {
        var element = entry.target;
        var event = new Event('resized', {
            bubbles: true
        });
        element.dispatchEvent(event);
    }
});

var currentTab = null;
var tabs = (function() {
    var tabs = {};

    function addTab(id, enabled = true) {
        tabs[id] = {
            id: id,
            icon: '/img/gui/' + id + '.png',
            enabled: enabled
        };
    }
    addTab('about');
    addTab('progress');
    addTab('camp');
    addTab('kitchen');
    addTab('foundry', );
    addTab('pillars');
    addTab('neighbors');
    addTab('friendship');
    addTab('rewardlinks')
    addTab('options', );
    addTab('help');
    return tabs;
})();

function onLoad() {

    // window.addEventListener('resize', resize);

    var htm = '';
    Object.values(tabs).filter(tab => tab.enabled).forEach(tab => {
        var text = getMessage('tab_' + tab.id) || tab.id;
        htm += html `<li title="${text}" style="background-image:url(${tab.icon})" tabid="${tab.id}"><span>${text}</span></li>`;
    });
    htm += html `<li class="last"></li>`;
    var div = document.querySelector('.vertical-menu');
    div.innerHTML = htm;
    div.addEventListener('click', clickMenu, true);

    document.body.addEventListener('click', function(e) {
        if (e.target && e.target.hasAttribute('data-wiki-page')) openWiki(e.target.getAttribute('data-wiki-page'));
    }, true);

    chrome.runtime.onMessage.addListener(function onMessage(request, sender, sendResponse) {
        var action = request.action,
            data = request.data;
        Object.values(tabs).forEach(tab => {
            if (tab.isLoaded && tab.actions && action in tab.actions) {
                try {
                    tab.actions[action](data);
                } catch (e) {}
            }
        });
    });

    function getTab(tabId) {
        return tabId && document.querySelector('.vertical-menu li[tabId="' + tabId + '"]');
    }

    chrome.storage.onChanged.addListener(function onStorageChanged(changes, area) {
        if (area != 'local') return;
        Object.values(tabs).forEach(tab => {
            if (tab.isLoaded && typeof tab.onPrefChange == 'function') {
                try {
                    tab.onPrefChange(changes);
                } catch (e) {}
            }
        });
    });

    var urlInfo = new UrlInfo(location.href),
        tabId = urlInfo.parameters.tab;
    div = getTab(tabId);
    if (div) {
        var state = Object.assign({}, urlInfo.parameters);
        delete state.tab;
        localStorage.setItem('state_' + tabId, JSON.stringify(state));
    } else {
        div = getTab(localStorage.getItem('tab')) || getTab('about');
    }
    if (div) div.dispatchEvent(new Event('click'));
}

// function resize() {
//     Object.values(tabs).forEach(tab => tab.mustBeResized = true);
//     resizeTab(currentTab);
// }

// function resizeTab(tab) {
//     if (!tab || !tab.mustBeResized || typeof tab.resize != 'function') return;
//     tab.mustBeResized = false;
//     tab.resize();
// }

async function loadTab(tab) {
    var container = tab.container;
    try {
        tab.state = JSON.parse(localStorage.getItem('state_' + tab.id));
    } catch (e) {
        tab.state = null;
    }
    try {
        var module = await import('./tabs/' + tab.id + '/' + tab.id + '.js');
        Object.assign(tab, module.default);
        if (tab.hasCSS) {
            let link = document.createElement('link');
            link.setAttribute('rel', 'stylesheet');
            link.setAttribute('type', 'text/css');
            link.setAttribute('href', './tabs/' + tab.id + '/' + tab.id + '.css');
            document.head.appendChild(link);
        }
        var response = await fetch('./tabs/' + tab.id + '/' + tab.id + '.html');
        var text = await response.text();
        container.innerHTML = text;
        if (tab.requires) {
            for (var name of tab.requires) {
                await bgp.Data.getFile(name);
            }
        }
        tab.init();
        tab.isLoaded = true;
        tab.mustBeUpdated = true;
    } catch (e) {
        container.innerHTML = htmlBr `Error: ${e}`;
        console.error(e);
    }
    if (tab.isLoaded && typeof tab.setState == 'function' && tab.state && typeof tab.state == 'object') tab.setState(tab.state);
}

async function clickMenu(e) {
    var li = null,
        el, tabId, tab;
    for (el = e.target; el.tagName != 'UL'; el = el.parentNode)
        if (el.tagName == 'LI') li = el;
    if (!li || li.classList.contains('selected')) return;
    tabId = li.getAttribute('tabid');
    Array.from(el.querySelectorAll('li')).forEach(item => {
        item.classList.toggle('selected', item == li);
    });
    tab = tabs[tabId];
    if (!tab.container) {
        tab.container = document.querySelector('.main-container').appendChild(document.createElement('div'));
        await loadTab(tab);
    }
    currentTab = tab;
    localStorage.setItem('tab', currentTab.id);
    updateTabState(currentTab);
    Object.values(tabs).forEach(t => t.container && (t.container.style.display = t == currentTab ? '' : 'none'));
    if (currentTab.isLoaded && currentTab.mustBeUpdated) {
        currentTab.mustBeUpdated = false;
        translate(currentTab.container);
        if (typeof currentTab.update == 'function') currentTab.update();
    }
    // resizeTab(currentTab);
}

function updateTabState(tab) {
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
}

function collectLazyImages(tab) {
    var tab = tab || currentTab;
    if (tab) Array.from(tab.container.querySelectorAll('img[lazy-src],*[lazy-render]')).forEach(item => lazyObserver.observe(item));
};


//#region TEXT INFO
function translate(parent) {
    Array.from(parent.querySelectorAll('[data-i18n-title]')).forEach(el => {
        el.title = el.getAttribute('data-i18n-title').split('+').map(id => getMessage(id)).join('\n');
    });
    Array.from(parent.querySelectorAll('[data-i18n-text]')).forEach(el => {
        el.innerHTML = htmlBr(el.getAttribute('data-i18n-text').split('+').map(id => getMessage(id)).join('\n'));
    });
}

function getRegionImage(rid, forceEgypt = false, size = 32) {
    if (rid == 0 && forceEgypt) rid = 1;
    if (rid < 0 || rid > 6) rid = 0;
    return htmlBr `<img src="/img/regions/${rid}.png" width="${size}" height="${size}" title="${rid > 0 ? bgp.Data.getRegionName(rid) : ''}"/>`;
}

function getSkinImage(skin, size = 32) {
    var rid = bgp.Data.getRegionFromSkin(skin);
    return rid > 0 ? getRegionImage(rid, false, size) : htmlBr `<img src="/img/map.png" width="${size}" height="${size}" title="${bgp.Data.getSkinName(skin)}"/>`;
}

function getDuration(drn) {
    let mm = Math.floor((drn / 60) % 60);
    let hh = Math.floor((drn / (60 * 60)) % 24);
    let dd = Math.floor(drn / (60 * 60 * 24));
    return `${dd ? formatNumber(dd) + 'd:' : ''}${(hh < 10 ? '0' : '')+hh}h:${(mm < 10 ? '0' : '')+mm}m`;
}
//#endregion

//#region SMART TABLE (FIXED HEADER/FOOTER) & SORT
function SmartTable(table) {
    this.table = table;
    this.container = this.table.parentNode.insertBefore(document.createElement('div'), this.table);
    this.container.className = 'sticky-container';
    this.sort = {};
    this.sortSub = {};
    this.header = table.querySelector('thead');
    if (this.header) {
        //        let tableHeader = table.parentNode.insertBefore(document.createElement('table'), table);
        let tableHeader = this.container.appendChild(document.createElement('table'));
        tableHeader.className = 'sticky-header';
        tableHeader.appendChild(this.fixedHeader = this.header.cloneNode(true));
        this.header.style.visibility = 'hidden';
        this.fixedHeader.addEventListener('click', e => this.headerClick(e));
    }
    this.container.appendChild(this.table);
    this.footer = table.querySelector('tfoot');
    if (this.footer) {
        //let tableFooter = table.parentNode.insertBefore(document.createElement('table'), table.nextSibling);
        let tableFooter = this.container.appendChild(document.createElement('table'));
        tableFooter.className = 'sticky-footer';
        tableFooter.appendChild(this.fixedFooter = this.footer.cloneNode(true));
        this.footer.style.visibility = 'hidden';
    }
    this.tbody = Array.from(table.querySelectorAll('tbody'));
    table.addEventListener('resized', () => this.sync());
    resizeObserver.observe(table);
    return this;
}
Object.assign(SmartTable.prototype, {
    syncLater: function() {
        setTimeout(() => this.sync(), 100);
    },
    sync: function() {
        this.container.style.maxWidth = (this.container.parentNode.clientWidth - 12) + 'px';
        this.container.style.maxHeight = (this.container.parentNode.clientHeight - 24) + 'px';

        function process(thead1, thead2) {
            if (!thead1) return;
            var a = Array.from(thead1.querySelectorAll('th,td')),
                b = Array.from(thead2.querySelectorAll('th,td'));
            a.forEach((el, index) => {
                if (index < b.length) b[index].width = el.offsetWidth + 'px';
            });
            var table = thead2.parentNode;
            table.style.width = thead1.parentNode.offsetWidth + 'px';
            if (thead1.tagName == 'THEAD') table.style.marginBottom = (-thead1.offsetHeight - 2) + 'px';
            else table.style.marginTop = (-thead1.offsetHeight - 1) + 'px';
        }
        process(this.header, this.fixedHeader);
        process(this.footer, this.fixedFooter);
        this.showFixed();
    },
    showFixed: function(flag = true) {
        [this.fixedHeader, this.fixedFooter].forEach(el => el && (el.parentNode.style.display = flag ? '' : 'none'));
    },
    headerClick: function(e) {
        for (var el = e.target; el && el.tagName != 'TABLE'; el = el.parentNode)
            if (el.tagName == 'TH') break;
        if (!el || el.tagName != 'TH' || !el.classList.contains('sortable')) return;
        var name = el.getAttribute('sort-name'),
            isSub = el.classList.contains('sort-sub');
        sortInfo = isSub ? this.sortSub : this.sort;
        if (!name) return;
        sortInfo.ascending = sortInfo.name != name || !sortInfo.ascending;
        sortInfo.name = name;
        this.setSortInfo(sortInfo, isSub);
        if (typeof this.onSort == 'function') this.onSort();
    },
    checkSortInfo: function(sortInfo, isSub) {
        var result = {};
        if (this.header && sortInfo)
            Array.from(this.header.querySelectorAll('th.sortable')).forEach(el => {
                var name = el.getAttribute('sort-name');
                if (!name || name != sortInfo.name || el.classList.contains('sort-sub') != isSub) return;
                result.name = name;
                result.ascending = sortInfo.ascending !== false;
            });
        return result;
    },
    setSortInfo: function(sortInfo, isSub) {
        sortInfo = this.checkSortInfo(sortInfo, isSub);
        if (isSub) this.sortSub = sortInfo;
        else this.sort = sortInfo;
        [this.header, this.fixedHeader].forEach(thead => {
            if (!thead) return;
            Array.from(thead.querySelectorAll('th.sortable')).forEach(el => {
                if (el.classList.contains('sort-sub') != isSub) return;
                var name = el.getAttribute('sort-name');
                el.classList.toggle('sort-ascending', name && name == sortInfo.name && sortInfo.ascending);
                el.classList.toggle('sort-descending', name && name == sortInfo.name && !sortInfo.ascending);
            });
        });
    },
    sortInfo2string: function(sortInfo) {
        return (sortInfo && sortInfo.name) ? sortInfo.name + (sortInfo.ascending ? '(asc)' : '(desc)') : '';
    },
    string2sortInfo: function(value) {
        var text = String(value),
            i = text.lastIndexOf('(');
        return {
            name: i >= 0 ? text.substr(0, i) : text,
            ascending: !text.endsWith('(desc)')
        }
    }
});
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
            }, function(w) {});
        }
    });
}
//#endregion

// var collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
// var myArray = ['1_Document', '11_Document', '2_Document'];
// console.log(myArray.sort(collator.compare));