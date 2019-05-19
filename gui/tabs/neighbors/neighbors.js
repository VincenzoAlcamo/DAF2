/*global bgp gui SmartTable Locale Dialog HtmlBr Html HtmlRaw*/

export default {
    hasCSS: true,
    init: init,
    update: update,
    getState: getState,
    setState: setState,
    actions: {
        'visit_camp': actionVisitCamp
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
    htm = String(htm).replace('#DAYS#', getSelectDays(0));
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
    var getSort = (sortInfo, defaultValue) => sortInfo && (sortInfo.name != defaultValue || !sortInfo.ascending) ? smartTable.sortInfo2string(sortInfo) : '';
    return {
        show: selectShow.value,
        days: selectDays.value,
        search: searchInput.value,
        gift: filterGifts,
        sort: getSort(smartTable.sort, 'name')
    };
}

function setState(state) {
    state.show = gui.setSelectState(selectShow, state.show);
    state.days = gui.setSelectState(selectDays, state.days, 21);
    searchInput.value = state.search || '';
    filterGifts = state.gift;
    var sortInfo = smartTable.checkSortInfo(smartTable.string2sortInfo(state.sort), false);
    if (!sortInfo.name) {
        sortInfo.name = 'name';
        sortInfo.ascending = true;
    }
    smartTable.setSortInfo(sortInfo, false);
    updateButton();
}

function updateButton() {
    let button = container.querySelector('.toolbar button.advanced');
    button.textContent = gui.getMessage('neighbors_advancedfilter', gui.getMessage(filterGifts ? 'menu_on' : 'menu_off'));
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
        items.push([+gid, gui.getMessage('neighbors_gift', name, Locale.formatNumber(giftValues[gift.def_id]), weekdayNames[gift.day])]);
    }
    items.sort((a, b) => a[1].localeCompare(b[1]));
    let htm = '';
    let info = HtmlRaw(String(HtmlBr(gui.getMessage('neighbors_advancedfilterinfo'))).replace('#DAYS#', getSelectDays(state.days)));
    htm += HtmlBr `${info}<br><select name="gifts" multiple size="${Math.min(15, items.length)}" style="margin:3px">`;
    let list = gui.getArrayOfInt(state.gift);
    for (let item of items) {
        htm += Html `<option value="${item[0]}" ${list.includes(item[0]) ? 'selected' : ''}>${item[1]}</option>`;
    }
    htm += HtmlBr `</select><br/><input data-method="input" type="button" value="${gui.getMessage('neighbors_clearfilter')}"/>`;
    gui.dialog.show({
        title: gui.getMessage('neighbors_advancedfilter'),
        html: htm,
        style: [Dialog.CONFIRM, Dialog.CANCEL, 'clear']
    }, function(method, params) {
        if (method == 'input') {
            for (let option of gui.dialog.element.querySelectorAll('[name=gifts] option')) option.selected = false;
            gui.dialog.visible = true;
            return;
        }
        if (method == Dialog.CANCEL) return;
        filterGifts = gui.getArrayOfInt(params.gifts).sort().join(',');
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
        htm += piece + HtmlBr `<span>${formatDayMonthTime(palGift.time)}</span></div>`;
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

function actionVisitCamp(data) {
    var row = container.querySelector('tr[data-pal-id="' + data + '"]');
    if (row) updateRow(row);
}

function updateRow(row) {
    var id = row.getAttribute('data-pal-id');
    var pal = bgp.Data.getNeighbour(id);
    var anchor = gui.getFBFriendAnchor(pal.fb_id);
    var htm = '';
    htm += HtmlBr `<td>${anchor}<img height="50" width="50" src="${gui.getFBFriendAvatarUrl(pal.fb_id)}"/></a></td>`;
    let friend = Object.values(bgp.Data.getFriends()).find(friend => friend.uid == id);
    let friendImg = friend ? HtmlBr `${gui.getFriendAnchor(friend)}<img class="friend" src="/img/gui/isaFriend.png"/></a>` : '';
    htm += HtmlBr `<td>${friendImg}${anchor}${gui.getPlayerNameFull(pal)}</a><br><input class="note n-note" type="text" maxlength="50" placeholder="${gui.getMessage('gui_nonote')}" value="${pal.extra.note}"></td>`;
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
        htm += wmtime < gui.getUnixTime() ? HtmlBr `<td><img src="/img/gui/check_no.png"></td>` : HtmlBr `<td>${formatDayMonthTime(wmtime)}</td>`;
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
            let gifts = Array.isArray(pal.extra.gifts) ? pal.extra.gifts : [];
            let value = 0;
            gifts = gifts.filter(gift => {
                if (gift.time >= giftThreshold) {
                    value += (giftValues[gift.gid] || 0);
                    uniqueGifts[gift.gid] = true;
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

    var rows = [];
    let blocksUnknown = smartTable.sort.ascending ? 144 : -1;
    let wmUnknown = smartTable.sort.ascending ? 1e15 : -1;
    var getSortValueFunctions = {
        region: pal => +pal.region,
        level: pal => +pal.level,
        levelup: pal => (pal.extra.lastLevel && pal.extra.lastLevel != pal.level) ? -pal.extra.timeLevel : 0,
        lastgift: pal => pal.extra.lastGift || 0,
        list: pal => +pal.c_list ? 0 : 1,
        blocks: pal => pal.extra.blocks === undefined ? blocksUnknown : +pal.extra.blocks,
        wmtime: pal => pal.extra.wmtime === undefined ? wmUnknown : +pal.extra.wmtime,
        recorded: pal => pal.extra.timeCreated || 0,
        gifts: pal => palGifts[pal.id].length,
        value: pal => palGifts[pal.id]._value
    };
    var sortName = smartTable.sort.name;
    var getSortValue = getSortValueFunctions[sortName] || (_pal => 0);
    let now = gui.getUnixTime();
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
                if (palGift.gid in giftFilter) {
                    flag = true;
                    break;
                }
            }
            if (!flag) continue;
        }
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