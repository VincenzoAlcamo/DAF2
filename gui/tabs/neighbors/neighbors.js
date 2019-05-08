/*global bgp gui SmartTable Locale HtmlBr Html*/

export default {
    hasCSS: true,
    init: init,
    update: update,
    getState: getState,
    setState: setState,
    requires: ['gifts', 'materials', 'decorations', 'usables', 'windmills']
};

let tab, container, selectShow, selectGifts, searchInput, smartTable, searchHandler, palRows, palGifts, trGifts, giftValues, lastGiftDays, giftCache, weekdayNames;

function init() {
    tab = this;
    container = tab.container;

    selectShow = container.querySelector('[name=show]');
    selectShow.addEventListener('change', refresh);
    for (let days of [7, 14, 21, 28, 35, 42]) {
        let option = document.createElement('option');
        option.value = 'nogift' + days;
        option.innerText = Locale.getMessage('neighbors_nogift', days);
        selectShow.appendChild(option);
    }

    let htm = HtmlBr(gui.getMessage('neighbors_gifts'));
    htm = String(htm).replace('#NUM#', '<select name="gifts"></select>');
    container.querySelector('.toolbar .gifts').innerHTML = htm;
    selectGifts = container.querySelector('[name=gifts]');
    selectGifts.addEventListener('change', refresh);
    for (let days = 7; days <= 50; days++) {
        let option = document.createElement('option');
        option.value = days;
        option.innerText = Locale.formatNumber(days);
        selectGifts.appendChild(option);
    }

    searchInput = container.querySelector('[name=search]');
    searchInput.addEventListener('input', () => triggerSearchHandler(true));

    trGifts = document.createElement('tr');
    trGifts.className = 'giftrow';
    trGifts.innerHTML = HtmlBr `<td colspan="10"><div>${Locale.getMessage('neighbors_giftinfo')}</div><div class="giftlist slick-scrollbar"></div></td>`;

    smartTable = new SmartTable(container.querySelector('.data'));
    smartTable.onSort = refresh;
    smartTable.fixedHeader.parentNode.classList.add('neighbors');
    smartTable.fixedFooter.parentNode.classList.add('neighbors');
    smartTable.tbody[0].addEventListener('render', function(event) {
        updateRow(event.target);
    });
    smartTable.tbody[0].addEventListener('click', onClick);
}

function triggerSearchHandler(flag) {
    if (searchHandler) clearTimeout(searchHandler);
    searchHandler = flag ? setTimeout(refresh, 500) : 0;
}

function getState() {
    var getSort = (sortInfo, defaultValue) => sortInfo && (sortInfo.name != defaultValue || !sortInfo.ascending) ? smartTable.sortInfo2string(sortInfo) : '';
    return {
        show: selectShow.value,
        gifts: selectGifts.value,
        search: searchInput.value,
        sort: getSort(smartTable.sort, 'name')
    };
}

function setState(state) {
    state.show = gui.setSelectState(selectShow, state.show);
    state.gifts = gui.setSelectState(selectGifts, state.gifts, 21);
    searchInput.value = state.search || '';
    var sortInfo = smartTable.checkSortInfo(smartTable.string2sortInfo(state.sort), false);
    if (!sortInfo.name) {
        sortInfo.name = 'name';
        sortInfo.ascending = true;
    }
    smartTable.setSortInfo(sortInfo, false);
}

function onClick(e) {
    var cell;
    for (var el = e.target; !cell && el.tagName != 'TABLE'; el = el.parentNode)
        if (el.tagName == 'TD') cell = el;
    if (!cell || !cell.classList.contains('has-gifts')) return;
    var row = cell.parentNode;
    if (row.nextSibling == trGifts) {
        trGifts.parentNode.removeChild(trGifts);
        return;
    }
    var giftContainer = trGifts.querySelector('.giftlist');
    giftContainer.innerHTML = '';
    giftContainer.style.width = (row.offsetWidth - 2) + 'px';
    row.parentNode.insertBefore(trGifts, row.nextSibling);
    var id = row.getAttribute('data-pal-id');
    var pal = bgp.Data.getNeighbour(id);
    var gifts = gui.getFile('gifts');
    var htm = '';
    for (let palGift of palGifts[pal.id]) {
        let piece = giftCache[palGift.gid];
        if (piece === undefined) {
            let gift = gifts[palGift.gid];
            piece = '';
            if (gift) {
                let amount = +gift.amount;
                let xp = giftValues[gift.def_id];
                let t_xp = Locale.formatNumber(xp);
                let t_amount = Locale.formatNumber(amount);
                let name = gui.getObjectName(gift.type, gift.object_id);
                if (amount > 1) name += ' x ' + t_amount;
                piece += HtmlBr `<div title="${Html(gui.getMessage('neighbors_gifttip', name, t_xp, weekdayNames[gift.day]))}"><img src="${gui.getObjectImage(gift.type, gift.object_id)}">`;
                piece += HtmlBr `<i>${xp}</i><b>${Locale.formatNumber(amount)}</b>`;
            }
            giftCache[palGift.gid] = piece;
        }
        if (piece == '') continue;
        htm += piece + HtmlBr `<span>${Locale.formatDayMonth(palGift.time)}<br>${Locale.formatTime(palGift.time)}</span></div>`;
    }
    giftContainer.innerHTML = htm;
}

function update() {
    lastGiftDays = 0;
    palRows = {};
    for (let pal of Object.values(bgp.Data.getNeighbours())) {
        let row = document.createElement('tr');
        row.setAttribute('data-pal-id', pal.id);
        row.setAttribute('height', 61);
        row.setAttribute('lazy-render', '');
        palRows[pal.id] = row;
    }
    // Remove Mr.Bill
    delete palRows[1];
    weekdayNames = {};
    for (let day = 1; day <= 7; day++) {
        // The 1st January 2018 was a Monday (1 = Monday)
        let name = (new Date(2018, 0, day)).toLocaleDateString(Locale.getLocale(), {
            weekday: 'long'
        });
        weekdayNames[day] = name;
    }
    // Determine gift value
    giftCache = {};
    giftValues = {
        system2: 1, // Energy
        material1: 1, // Coin
        material2: 1000, // Gem
        material3: 60, // Copper
        material6: 150, // Tin
        material7: 30, // Lumber
        material9: 75, // Coal
        material11: 60, // Root
        material19: 30, // Mushroom
        material20: 20, // Apple
        material21: 60, // Herb
        material22: 50, // Stone
        material29: 20, // Berry
        material33: 190 // Iron ore
    };
    for (let gift of Object.values(gui.getFile('gifts'))) {
        let type = gift.type;
        let oid = gift.object_id;
        let key = type + oid;
        let value = giftValues[key];
        if (value === undefined) {
            value = 0;
            if (type == 'system') {
                value = 1;
            } else if (type == 'usable') {
                let o = bgp.Data.getObject(type, oid);
                value = o ? +o.value : 0;
            } else if (type == 'decoration' || type == 'windmill') {
                let o = bgp.Data.getObject(type, oid);
                value = o ? +o.sell_price : 0;
            }
            giftValues[key] = value;
        }
        giftValues[gift.def_id] = value * +gift.amount;
    }
    refresh();
}

function updateRow(row) {
    var id = row.getAttribute('data-pal-id');
    var pal = bgp.Data.getNeighbour(id);
    var anchor = gui.getFBFriendAnchor(pal.fb_id);
    var htm = '';
    htm += HtmlBr `<td>${anchor}<img height="50" width="50" src="${gui.getFBFriendAvatarUrl(pal.fb_id)}"/></a></td>`;
    var friend = Object.values(bgp.Data.getFriends()).find(friend => friend.uid == id);
    if (friend) {
        htm += HtmlBr `<td>${gui.getFriendAnchor(friend)}<img class="friend" src="/img/gui/isaFriend.png"/></a>${anchor}${gui.getPlayerNameFull(pal)}</a></td>`;
    } else {
        htm += HtmlBr `<td>${anchor}${gui.getPlayerNameFull(pal)}</a></td>`;
    }
    htm += HtmlBr `<td>${gui.getRegionImg(pal.region)}</td>`;
    htm += HtmlBr `<td>${Locale.formatNumber(pal.level)}</td>`;
    if (pal.extra.lastLevel && pal.extra.lastLevel != pal.level) {
        htm += HtmlBr `<td title="${Locale.formatDate(pal.extra.timeLevel)} (${Locale.formatNumber(pal.extra.lastLevel)})">${Locale.formatDays(pal.extra.timeLevel)}</td>`;
    } else {
        htm += HtmlBr `<td></td>`;
    }
    if (pal.extra.lastGift) {
        htm += HtmlBr `<td>${Locale.formatDate(pal.extra.lastGift)}<br>${Locale.formatDays(pal.extra.lastGift)}</td>`;
    } else {
        htm += HtmlBr `<td></td>`;
    }
    if (pal.c_list > 0) {
        htm += HtmlBr `<td><img src="/img/gui/clist.png"></td>`;
    } else {
        htm += HtmlBr `<td></td>`;
    }
    htm += HtmlBr `<td>${Locale.formatDate(pal.extra.timeCreated)}<br>${Locale.formatDays(pal.extra.timeCreated)}</td>`;
    var gifts = palGifts[pal.id];
    var count = gifts.length;
    htm += HtmlBr `<td class="${count > 0 ? 'has-gifts' : ''}">${Locale.formatNumber(count)}</td>`;
    htm += HtmlBr `<td class="${count > 0 ? 'has-gifts' : ''}">${Locale.formatNumber(gifts._value)}</td>`;
    row.innerHTML = htm;
}

var scheduledRefresh;

function refresh() {
    triggerSearchHandler(false);
    gui.updateTabState(tab);

    //smartTable.showFixed(false);
    smartTable.tbody[0].innerHTML = '';

    if (scheduledRefresh) clearTimeout(scheduledRefresh);
    scheduledRefresh = setTimeout(refreshDelayed, 50);
}

function getDateAgo(days) {
    var dt = new Date();
    dt.setHours(0, 0, 0, 0);
    dt.setDate(dt.getDate() - days);
    return dt.getTime() / 1000;
}

function refreshDelayed() {
    scheduledRefresh = 0;
    var state = getState();
    var search = (state.search || '').toUpperCase();
    var show = state.show;
    var list, days;
    if (show == 'inlist' || show == 'notinlist') {
        list = show == 'inlist' ? 0 : 1;
        show = 'list';
    } else if (show.startsWith('nogift')) {
        days = +(show.substr(6)) || 0;
        show = days > 0 ? 'days' : '';
        if (days) days = getDateAgo(days);
    }

    var neighbors = Object.assign({}, bgp.Data.getNeighbours());
    delete neighbors[1];
    neighbors = Object.values(neighbors);

    let giftDays = Math.max(7, +state.gifts || 0);
    let giftThreshold = getDateAgo(giftDays - 1);
    if (giftDays != lastGiftDays) {
        lastGiftDays = giftDays;
        palGifts = {};
        for (let pal of neighbors) {
            let gifts = Array.isArray(pal.extra.gifts) ? pal.extra.gifts : [];
            let value = 0;
            gifts = gifts.filter(gift => {
                if (gift.time >= giftThreshold) {
                    value += (giftValues[gift.gid] || 0);
                    return true;
                }
            });
            gifts._value = value;
            palGifts[pal.id] = gifts;
            palRows[pal.id].setAttribute('lazy-render', '');
        }
    }

    var rows = [];
    var getSortValueFunctions = {
        region: pal => +pal.region,
        level: pal => +pal.level,
        levelup: pal => (pal.extra.lastLevel && pal.extra.lastLevel != pal.level) ? -pal.extra.timeLevel : 0,
        lastgift: pal => pal.extra.lastGift || 0,
        list: pal => +pal.c_list ? 0 : 1,
        recorded: pal => pal.extra.timeCreated || 0,
        gifts: pal => palGifts[pal.id].length,
        value: pal => palGifts[pal.id]._value
    };
    var sortName = smartTable.sort.name;
    var getSortValue = getSortValueFunctions[sortName] || (_pal => 0);
    for (let pal of neighbors) {
        if (show == 'list' && list != (+pal.c_list ? 0 : 1)) continue;
        else if (show == 'days' && (pal.extra.lastGift || pal.extra.timeCreated) >= days) continue;
        let fullname = gui.getPlayerNameFull(pal).toUpperCase();
        if (search != '' && fullname.indexOf(search) < 0) continue;
        rows.push([palRows[pal.id], fullname, sortName == 'name' ? 0 : getSortValue(pal)]);
    }

    Array.from(container.querySelectorAll('.neighbors tfoot td')).forEach(cell => {
        cell.innerText = Locale.getMessage('neighbors_found', rows.length, neighbors.length);
    });

    scheduledRefresh = setTimeout(function() {
        rows.sort((a, b) => (a[2] - b[2]) || a[1].localeCompare(b[1]));
        if (!smartTable.sort.ascending) rows.reverse();

        var tbody = smartTable.tbody[0];
        tbody.innerHTML = '';
        for (let row of rows) {
            tbody.appendChild(row[0]);
        }

        gui.collectLazyImages(tbody);
        smartTable.syncLater();
    }, 50);
}