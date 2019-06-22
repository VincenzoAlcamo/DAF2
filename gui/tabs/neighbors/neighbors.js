/*global bgp gui SmartTable Locale Dialog HtmlBr Html HtmlRaw Tooltip*/

export default {
    hasCSS: true,
    init: init,
    update: update,
    getState: getState,
    setState: setState,
    actions: {
        'visit_camp': markNeighbor,
        'place_windmill': markNeighbor
    },
    requires: ['gifts', 'materials', 'decorations', 'usables', 'windmills']
};

let tab, container, selectShow, selectDays, searchInput, smartTable, searchHandler, palRows, palGifts;
let trGifts, giftValues, lastGiftDays, giftCache, weekdayNames, uniqueGifts;
let filterGifts = '';

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
    htm = String(htm).replace('@DAYS@', getSelectDays(0));
    container.querySelector('.toolbar .days').innerHTML = htm;
    selectDays = container.querySelector('[name=days]');
    selectDays.addEventListener('change', refresh);

    searchInput = container.querySelector('[name=search]');
    searchInput.addEventListener('input', () => triggerSearchHandler(true));

    trGifts = document.createElement('tr');
    trGifts.className = 'giftrow';
    trGifts.innerHTML = HtmlBr `<td colspan="12"><div>${Locale.getMessage('neighbors_giftinfo')}</div><div class="giftlist slick-scrollbar"></div></td>`;

    let button = container.querySelector('.toolbar button.advanced');
    button.addEventListener('click', onClickAdvanced);

    smartTable = new SmartTable(container.querySelector('.data'));
    smartTable.onSort = refresh;
    smartTable.fixedHeader.parentNode.classList.add('neighbors');
    smartTable.fixedFooter.parentNode.classList.add('neighbors');
    smartTable.tbody[0].addEventListener('render', function(event) {
        updateRow(event.target);
    });
    smartTable.tbody[0].addEventListener('click', onClick);

    smartTable.table.addEventListener('input', onInput);

    container.addEventListener('tooltip', onTooltip);
}

function getSelectDays(selectedValue) {
    let htm = '<select name="days">';
    for (let days = 7; days <= 50; days++) {
        htm += Html `<option value="${days}"${days == selectedValue ? ' selected' : ''}>${Locale.formatNumber(days)}</option>`;
    }
    htm += '</select>';
    return htm;
}

function triggerSearchHandler(flag) {
    if (searchHandler) clearTimeout(searchHandler);
    searchHandler = flag ? setTimeout(refresh, 500) : 0;
}

function getState() {
    return {
        show: selectShow.value,
        days: selectDays.value,
        search: searchInput.value,
        gift: filterGifts,
        sort: gui.getSortState(smartTable)
    };
}

function setState(state) {
    state.show = gui.setSelectState(selectShow, state.show);
    state.days = gui.setSelectState(selectDays, state.days, 21);
    searchInput.value = state.search || '';
    filterGifts = state.gift;
    gui.setSortState(state.sort, smartTable, 'name');
    updateButton();
}

function updateButton() {
    let button = container.querySelector('.toolbar button.advanced');
    button.textContent = gui.getMessage('neighbors_advancedfilter') + ': ' + gui.getMessage(filterGifts ? 'menu_on' : 'menu_off');
    button.classList.toggle('activated', !!filterGifts);
}

function onInput(event) {
    let input = event.target;
    if (!input || input.tagName != 'INPUT' || !input.classList.contains('n-note')) return;
    let row = input.parentNode.parentNode;
    let note = input.value.trim();
    let pal_id = row.getAttribute('data-pal-id');
    let pal = pal_id && bgp.Data.getNeighbour(pal_id);
    if (pal) {
        pal.extra.note = note;
        bgp.Data.saveNeighbour(pal);
    }
}

function onClickAdvanced() {
    let state = getState();
    let gifts = gui.getFile('gifts');
    let items = [];
    for (let gid of Object.keys(uniqueGifts)) {
        let gift = gifts[gid];
        let amount = +gift.amount;
        let name = gui.getObjectName(gift.type, gift.object_id);
        if (amount > 1) name += ' x ' + Locale.formatNumber(amount);
        items.push([+gid, gui.getMessage('neighbors_gift', name, Locale.formatNumber(giftValues[gift.def_id]), weekdayNames[gift.day]), giftValues[gift.def_id], gift.day]);
    }

    function getGiftListHtml(list, sortBy) {
        let fn = [(a, b) => a[1].localeCompare(b[1]), (a, b) => a[2] - b[2], (a, b) => a[3] - b[3]][sortBy || 0];
        items.sort(fn);
        let htm = '';
        for (let item of items) {
            htm += Html `<option value="${item[0]}" ${list.includes(item[0]) ? 'selected' : ''}>${item[1]}</option>`;
        }
        return htm;
    }
    let htm = '';
    let info = HtmlRaw(String(HtmlBr(gui.getMessage('neighbors_advancedfilterinfo'))).replace('@DAYS@', getSelectDays(state.days)));
    htm += HtmlBr `${info}<br>${gui.getMessage('neighbors_sortby')} <select name="sort" data-method="sort">`;
    htm += HtmlBr `<option value="0">${gui.getMessage('gui_gift')}</option>`;
    htm += HtmlBr `<option value="1">${gui.getMessage('gui_xp')}</option>`;
    htm += HtmlBr `<option value="2">${gui.getMessage('gui_day')}</option>`;
    htm += HtmlBr `</select>`;
    htm += HtmlBr ` <input data-method="clear" type="button" value="${gui.getMessage('neighbors_clearfilter')}"/><br/>`;
    htm += HtmlBr `<select name="gifts" multiple size="${Math.min(15, items.length)}" style="margin:3px">`;
    htm += getGiftListHtml(gui.getArrayOfInt(state.gift));
    htm += HtmlBr `</select>`;
    gui.dialog.show({
        title: gui.getMessage('neighbors_advancedfilter'),
        html: htm,
        style: [Dialog.CONFIRM, Dialog.CANCEL]
    }, function(method, params) {
        let list = gui.getArrayOfInt(params.gifts).sort().join(',');
        if (method == 'clear') {
            for (let option of gui.dialog.element.querySelectorAll('[name=gifts] option')) option.selected = false;
            return;
        }
        if (method == 'sort') {
            gui.dialog.element.querySelector('[name=gifts]').innerHTML = getGiftListHtml(list, params.sort);
            return;
        }
        if (method == Dialog.CANCEL) return;
        filterGifts = list;
        selectDays.value = params.days;
        refresh();
    });
}

function formatDayMonthTime(time) {
    return Locale.formatDayMonth(time) + '\n' + Locale.formatTime(time);
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
        let gid = palGift[1];
        let piece = giftCache[gid];
        if (piece === undefined) {
            let gift = gifts[gid];
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
            giftCache[gid] = piece;
        }
        if (piece == '') continue;
        htm += piece + HtmlBr `<span>${formatDayMonthTime(palGift[2])}</span></div>`;
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

function markNeighbor(neighborId) {
    gui.setLazyRender(container.querySelector('tr[data-pal-id="' + neighborId + '"]'));
}

function updateRow(row) {
    var id = row.getAttribute('data-pal-id');
    var pal = bgp.Data.getNeighbour(id);
    let friend = Object.values(bgp.Data.getFriends()).find(friend => friend.uid == id);
    var anchor = friend ? gui.getFriendAnchor(friend) : HtmlRaw('<a class="no-link">');
    var htm = '';
    htm += HtmlBr `<td>${anchor}<img height="50" width="50" src="${gui.getFBFriendAvatarUrl(pal.fb_id)}" class="tooltip-event"/></a></td>`;
    htm += HtmlBr `<td>${anchor}${gui.getPlayerNameFull(pal)}</a><br><input class="note n-note" type="text" maxlength="50" placeholder="${gui.getMessage('gui_nonote')}" value="${pal.extra.note}"></td>`;
    htm += HtmlBr `<td>${gui.getRegionImg(pal.region)}</td>`;
    htm += HtmlBr `<td>${Locale.formatNumber(pal.level)}</td>`;
    if (pal.extra.lastLevel && pal.extra.lastLevel != pal.level) {
        htm += HtmlBr `<td title="${Locale.formatDate(pal.extra.timeLevel)} (${Locale.formatNumber(pal.extra.lastLevel)})">${Locale.formatDays(pal.extra.timeLevel)}</td>`;
    } else {
        htm += HtmlBr `<td></td>`;
    }
    htm += HtmlBr `<td>${Locale.formatDate(pal.extra.timeCreated)}<br>${Locale.formatDays(pal.extra.timeCreated)}</td>`;
    if (pal.c_list > 0) {
        htm += HtmlBr `<td><img src="/img/gui/clist.png"></td>`;
    } else {
        htm += HtmlBr `<td></td>`;
    }
    let blocks = pal.extra.blocks;
    if (blocks === undefined) {
        htm += HtmlBr `<td><img src="/img/gui/check_na.png"></td>`;
    } else {
        htm += blocks === 0 ? HtmlBr `<td><img src="/img/gui/check_yes.png"></td>` : HtmlBr `<td><span class="camp_blocks">${blocks}</span></td>`;
    }
    let wmtime = pal.extra.wmtime;
    if (wmtime === undefined) {
        htm += HtmlBr `<td></td>`;
    } else {
        htm += HtmlBr `<td class="${wmtime < gui.getUnixTime() ? 'warning' : ''}">${wmtime == 0 ? '/' : formatDayMonthTime(wmtime)}</td>`;
    }
    if (pal.extra.lastGift) {
        htm += HtmlBr `<td>${Locale.formatDate(pal.extra.lastGift)}<br>${Locale.formatDays(pal.extra.lastGift)}</td>`;
    } else {
        htm += HtmlBr `<td></td>`;
    }
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
    updateButton();

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
    let state = getState();
    let search = (state.search || '').toUpperCase();
    let show = state.show;
    let list, days;
    if (show == 'inlist' || show == 'notinlist') {
        list = show == 'inlist' ? 0 : 1;
        show = 'list';
    } else if (show.startsWith('nogift')) {
        days = +(show.substr(6)) || 0;
        show = days > 0 ? 'days' : '';
        if (days) days = getDateAgo(days);
    }

    let neighbors = Object.assign({}, bgp.Data.getNeighbours());
    delete neighbors[1];
    neighbors = Object.values(neighbors);

    let giftDays = Math.max(7, +state.days || 0);
    let giftThreshold = getDateAgo(giftDays - 1);
    if (giftDays != lastGiftDays) {
        lastGiftDays = giftDays;
        palGifts = {};
        uniqueGifts = {};
        for (let pal of neighbors) {
            let gifts = Array.isArray(pal.extra.g) ? pal.extra.g : [];
            let value = 0;
            gifts = gifts.filter(gift => {
                if (gift[2] >= giftThreshold) {
                    let gid = gift[1];
                    value += (giftValues[gid] || 0);
                    uniqueGifts[gid] = true;
                    return true;
                }
            });
            gifts._value = value;
            palGifts[pal.id] = gifts;
            palRows[pal.id].setAttribute('lazy-render', '');
        }
    }

    let giftFilter = {};
    let applyGiftFilter = false;
    for (let gid of gui.getArrayOfInt(state.gift)) {
        if (gid in uniqueGifts) {
            giftFilter[gid] = true;
            applyGiftFilter = true;
        }
    }

    let palNames = {};
    let getSortValueFunctions = {
        name: pal => palNames[pal.id] || '',
        region: pal => +pal.region,
        level: pal => +pal.level,
        levelup: pal => (pal.extra.lastLevel && pal.extra.lastLevel != pal.level) ? -pal.extra.timeLevel : 0,
        lastgift: pal => pal.extra.lastGift || 0,
        list: pal => +pal.c_list ? 0 : 1,
        blocks: pal => pal.extra.blocks === undefined ? NaN : +pal.extra.blocks,
        wmtime: pal => pal.extra.wmtime === undefined ? NaN : +pal.extra.wmtime,
        recorded: pal => pal.extra.timeCreated || 0,
        gifts: pal => palGifts[pal.id].length,
        value: pal => palGifts[pal.id]._value
    };
    let sort = gui.getSortFunction(getSortValueFunctions, smartTable, 'name');
    let now = gui.getUnixTime();
    let items = [];
    for (let pal of neighbors) {
        if (show == 'list' && list != (+pal.c_list ? 0 : 1)) continue;
        if (show == 'withblocks' && !(pal.extra.blocks > 0)) continue;
        if (show == 'unknownblocks' && pal.extra.blocks !== undefined) continue;
        if (show == 'expiredwm' && !(pal.extra.wmtime <= now)) continue;
        else if (show == 'days' && (pal.extra.lastGift || pal.extra.timeCreated) >= days) continue;
        let fullname = gui.getPlayerNameFull(pal).toUpperCase();
        if (search != '') {
            let text = fullname + '\t' + (pal.extra.note || '').toUpperCase();
            if (text.indexOf(search) < 0) continue;
        }
        if (applyGiftFilter) {
            let flag = false;
            for (let palGift of (palGifts[pal.id] || [])) {
                if (palGift[1] in giftFilter) {
                    flag = true;
                    break;
                }
            }
            if (!flag) continue;
        }
        palNames[pal.id] = fullname;
        items.push(pal);
    }

    smartTable.tbody[0].innerHTML = '';
    Array.from(container.querySelectorAll('.neighbors tfoot td')).forEach(cell => {
        cell.innerText = Locale.getMessage('neighbors_found', items.length, neighbors.length);
    });

    scheduledRefresh = setTimeout(function() {
        items = sort(items);
        var tbody = smartTable.tbody[0];
        for (let item of items) {
            tbody.appendChild(palRows[item.id]);
        }
        gui.collectLazyElements(tbody);
        smartTable.syncLater();
    }, 50);
}

function onTooltip(event) {
    let element = event.target;
    let pal_id = element.parentNode.parentNode.parentNode.getAttribute('data-pal-id');
    let pal = pal_id && bgp.Data.getNeighbour(pal_id);
    let fb_id = pal && pal.fb_id;
    if (fb_id) {
        let htm = HtmlBr `<div class="neighbors-tooltip"><img width="108" height="108" src="${gui.getFBFriendAvatarUrl(fb_id, 108)}"/></div>`;
        Tooltip.show(element, htm);
    }
}