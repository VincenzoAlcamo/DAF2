/*global bgp gui SmartTable Locale HtmlBr*/

export default {
    hasCSS: true,
    init: init,
    update: update,
    getState: getState,
    setState: setState,
    requires: ['gifts', 'materials', 'decorations', 'usables', 'windmills']
};

var tab, container, selectShow, searchInput, smartTable, searchHandler, neighbors, trGifts;

function init() {
    tab = this;
    container = tab.container;

    selectShow = container.querySelector('[name=show]');
    selectShow.addEventListener('change', refresh);
    for (var days of [7, 14, 21, 28]) {
        var option = document.createElement('option');
        option.value = days;
        option.innerText = Locale.getMessage('neighbors_nogift', days);
        selectShow.appendChild(option);
    }

    searchInput = container.querySelector('[name=search]');
    searchInput.addEventListener('input', () => triggerSearchHandler(true));

    trGifts = document.createElement('tr');
    trGifts.className = 'giftrow';
    trGifts.innerHTML = HtmlBr `<td colspan="9"><div>${Locale.getMessage('neighbors_giftinfo')}</div><div class="giftlist slick-scrollbar"></div></td>`;

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
        search: searchInput.value,
        sort: getSort(smartTable.sort, 'name')
    };
}

function setState(state) {
    selectShow.value = state.show || '';
    searchInput.value = state.search || '';
    var sortInfo = smartTable.checkSortInfo(smartTable.string2sortInfo(state.sort), false);
    if (!sortInfo.name) {
        sortInfo.name = 'name';
        sortInfo.ascending = true;
    }
    smartTable.setSortInfo(sortInfo, false);
}

// function daysBetween(dt1, dt2) {
//     if(dt1 > dt2) [dt1, dt2] = [dt2, dt1];
//     dt1.setHours(4, 0, 0, 0);
//     dt2.setHours(22, 0, 0, 0);
//     var millis = dt2.getTime() - dt1.getTime();
//     return Math.round(millis / 86400000);
// }

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
    giftContainer.style.width = row.offsetWidth + 'px';
    row.parentNode.insertBefore(trGifts, row.nextSibling);
    var id = row.getAttribute('data-pal-id');
    var pal = bgp.Data.getNeighbour(id);
    var palGifts = pal.extra.gifts;
    if (!Array.isArray(palGifts)) palGifts = [];
    var gifts = gui.getFile('gifts');
    var htm = '';
    for (let palGift of palGifts) {
        let gift = gifts[palGift.gid];
        if (!gift) continue;
        htm += HtmlBr `<div><img class="outlined" width="50" height="50" src="${gui.getObjectImage(gift.type, gift.object_id)}" title="${gui.getObjectName(gift.type, gift.object_id)}">`;
        htm += HtmlBr `<b class="outlined">${Locale.formatNumber(+gift.amount)}</b>`;
        htm += HtmlBr `<span>${Locale.formatDate(palGift.time)}<br>${Locale.formatTime(palGift.time)}</span></div>`;
    }
    giftContainer.innerHTML = htm;
}

function update() {
    // Remove Mr.Bill
    var t = Object.assign({}, bgp.Data.getNeighbours());
    delete t[1];
    var minTime = +Infinity;
    neighbors = Object.values(t).map(pal => {
        var name = gui.getPlayerNameFull(pal);
        var row = document.createElement('tr');
        row.setAttribute('data-pal-id', pal.id);
        row.setAttribute('height', 61);
        row.setAttribute('lazy-render', '');
        var gifts = pal.extra.gifts;
        var count = 0;
        if (Array.isArray(gifts)) {
            count = gifts.length;
            for (var gift of gifts) gift.time = +gift.time;
            gifts.sort((a, b) => a.time - b.time);
            var time = gifts[0].time;
            if (time < minTime) minTime = time;
        }
        return Object.assign({}, pal, {
            fullname: name.toUpperCase(),
            region: +pal.region,
            level: +pal.level,
            levelup: (pal.extra.lastLevel && pal.extra.lastLevel != pal.level) ? -pal.extra.timeLevel : 0,
            lastgift: pal.extra.lastGift || 0,
            list: +pal.c_list ? 0 : 1,
            recorded: pal.extra.timeCreated || 0,
            gifts: count,
            row: row
        });
    });
    // giftDays = isFinite(minTime) ? daysBetween(Locale.getDate(minTime), new Date()) : 0;
    refresh();
}

function updateRow(row) {
    var id = row.getAttribute('data-pal-id');
    var pal = bgp.Data.getNeighbour(id);
    var anchor = gui.getFBFriendAnchor(pal.fb_id);
    var htm = '';
    htm += HtmlBr `<td>${anchor}<img height="50" width="50" src="${gui.getFBFriendAvatarUrl(pal.fb_id)}"/></a></td>`;
    htm += HtmlBr `<td>${anchor}${gui.getPlayerNameFull(pal)}</a></td>`;
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
    var gifts = pal.extra.gifts;
    var count = Array.isArray(gifts) ? gifts.length : 0;
    htm += HtmlBr `<td class="${count > 0 ? 'has-gifts' : ''}">${Locale.formatNumber(count)}</td>`;
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

function refreshDelayed() {
    scheduledRefresh = 0;
    var state = getState();
    var search = (state.search || '').toUpperCase();
    var show = state.show;
    var list, days;
    if (show == 'inlist' || show == 'notinlist') {
        list = show == 'inlist' ? 0 : 1;
        show = 'list';
    } else {
        days = +show || 0;
        show = days > 0 ? 'days' : '';
        if (days) {
            var dt = new Date();
            dt.setHours(0, 0, 0, 0);
            dt.setDate(dt.getDate() - days);
            days = dt.getTime() / 1000;
        }
    }

    var pals = neighbors.filter(function(pal) {
        if (search != '' && pal.fullname.indexOf(search) < 0) return false;
        if (show == 'list') return pal.list == list;
        if (show == 'days') return (pal.lastgift || pal.extra.timeCreated) < days;
        return true;
    });

    Array.from(container.querySelectorAll('.neighbors tfoot td')).forEach(cell => {
        cell.innerText = Locale.getMessage('neighbors_found', pals.length, neighbors.length);
    });

    scheduledRefresh = setTimeout(function() {
        let name = smartTable.sort.name;
        if (name != 'name') {
            pals.sort((a, b) => a[name] - b[name] || a.fullname.localeCompare(b.fullname));
        } else {
            pals.sort((a, b) => a.fullname.localeCompare(b.fullname));
        }
        if (!smartTable.sort.ascending) pals.reverse();

        var tbody = smartTable.tbody[0];
        tbody.innerHTML = '';
        for (var pal of pals) {
            tbody.appendChild(pal.row);
        }

        gui.collectLazyImages(tbody);
        smartTable.syncLater();
    }, 50);
}