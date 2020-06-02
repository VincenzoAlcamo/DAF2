/*global bgp gui SmartTable Html Locale Dialog*/
export default {
    hasCSS: true,
    init: init,
    update: update,
    getState: getState,
    setState: setState,
    visibilityChange: visibilityChange,
    requires: (function () {
        const requires = ['materials', 'map_filters', 'events', 'special_weeks'];
        for (let rid = gui.getMaxRegion(); rid >= 0; rid--) requires.push('locations_' + rid);
        return requires;
    })()
};

let tab, container, smartTable, selectShow, selectReady, searchInput, searchHandler;
let selected = [];
let repeatables;
let swPostcards;
let refreshTimer = 0;

const ticked = Html.br`<img width="24" src="/img/gui/ticked.png">`;
const unticked = Html.br`<img width="24" src="/img/gui/unticked.png">`;

function init() {
    tab = this;
    container = tab.container;

    selectShow = container.querySelector('[name=show]');
    selectShow.addEventListener('change', refresh);

    selectReady = container.querySelector('[name=ready]');
    selectReady.addEventListener('change', refresh);

    searchInput = container.querySelector('[name=search]');
    searchInput.addEventListener('input', () => triggerSearchHandler(true));

    smartTable = new SmartTable(container.querySelector('.data'));
    smartTable.onSort = refresh;
    smartTable.fixedHeader.parentNode.classList.add('repeat');
    smartTable.fixedFooter.parentNode.classList.add('repeat');
    smartTable.tbody[0].addEventListener('render', function (event) {
        updateRow(event.target);
    });
    smartTable.table.addEventListener('click', onClickTable, true);

    // container.addEventListener('tooltip', onTooltip);
}

function update() {
    repeatables = {};

    // Find active events
    const activeEvents = {};
    const events = gui.getFile('events');
    const generator = gui.getGenerator();
    const eventData = generator.events || {};
    const eventsRegion = generator.events_region || {};
    const region = +generator.region;
    const now = gui.getUnixTime();
    for (const event of Object.values(events)) {
        if (!event.name_loc) continue;
        const eid = event.def_id;
        const edata = eventData[eid];
        let end = +event.end || 0;
        end = (edata && +edata.finished) || end;
        if (end > now) activeEvents[eid] = end;
    }

    // This will refresh the background page Repeatables
    const allRepeatables = gui.getRepeatables();

    const filters = Object.values(gui.getFile('map_filters')).filter(f => f.mobile_asset == 'materials').map(o => o.filter);
    for (let rid = region; rid >= 0; rid--) {
        const locations = Object.values(gui.getFile('locations_' + rid));
        for (const loc of locations) {
            const lid = +loc.def_id;
            if (!(lid in allRepeatables)) continue;
            let expire = 0;
            let eid = 0;
            if (rid > 0) {
                if (!filters.includes(loc.filter)) continue;
            } else {
                eid = +loc.event_id;
                expire = activeEvents[eid];
                if (!expire) continue;
            }
            const item = {};
            item.id = lid;
            item.name = gui.getString(loc.name_loc);
            item.rid = rid;
            item.eid = eid;
            item.region = item.rid + ',' + item.eid;
            item.expire = expire;
            item.cooldown = +loc.reset_cd;
            item.reset = +loc.reset_gems;
            item.xp = +loc.reward_exp;
            if (Array.isArray(loc.overrides)) {
                let rid = region;
                if (eid in eventsRegion) rid = +eventsRegion[eid];
                if (rid > region) rid = region;
                for (const ovr of loc.overrides) {
                    if (+ovr.region_id == region) item.xp = +ovr.override_reward_exp;
                }
            }
            item.gr_library = loc.gr_library;
            item.gr_clip = loc.gr_clip;
            item.mobile_asset = loc.mobile_asset;
            item.name_loc = loc.name_loc;
            item.rotation = [];
            for (const rot of loc.rotation) {
                const copy = {};
                copy.level = +rot.level;
                copy.progress = +rot.progress;
                copy.chance = +rot.chance;
                item.rotation.push(copy);
            }
            if (item.rotation.length) repeatables[item.id] = item;
        }
    }
    const specialWeeks = gui.getActiveSpecialWeeks();
    swPostcards = specialWeeks.postcards;
    showSpecialWeeks([specialWeeks.doubleDrop, specialWeeks.postcards]);
    setState(getState());
    refresh();
}

function showSpecialWeeks(items) {
    if (!Array.isArray(items)) {
        items = gui.getActiveSpecialWeeks().items;
    }
    const htm = [];
    for (const sw of items) {
        if (sw && sw.name) htm.push(Html.br`${sw.name}: ${sw.ends}`);
    }
    const divWarning = container.querySelector('.toolbar .warning');
    Dialog.htmlToDOM(divWarning, htm.join('<br>'));
    divWarning.style.display = htm.length ? '' : 'none';
}

function getState() {
    return {
        show: selectShow.value,
        ready: selectReady.value,
        search: searchInput.value,
        selected: selected.join(','),
        sort: gui.getSortState(smartTable)
    };
}

function setState(state) {
    state.show = gui.setSelectState(selectShow, state.show);
    state.ready = gui.setSelectState(selectReady, state.ready);
    searchInput.value = state.search || '';
    selected = gui.getArrayOfInt(state.selected);
    if (repeatables) {
        for (const item of Object.values(repeatables)) item.selected = false;
        selected = selected.filter(id => (id in repeatables) ? repeatables[id].selected = true : false);
    }
    gui.setSortState(state.sort, smartTable, 'name');
}

function triggerSearchHandler(flag) {
    if (searchHandler) clearTimeout(searchHandler);
    searchHandler = flag ? setTimeout(refresh, 500) : 0;
}

function refresh() {
    gui.updateTabState(tab);

    const state = getState();
    const show = state.show;
    const not_ready = state.ready ? state.ready == 'no' : NaN;
    const fnSearch = gui.getSearchFilter(state.search);
    const now = gui.getUnixTime();
    calculateItem();

    function isVisible(item) {
        if (fnSearch && !fnSearch(item.name.toUpperCase())) return false;
        if (show == 'selected' && !item.selected) return false;
        if (not_ready == !(item.time > now)) return false;
        return true;
    }

    let items = Object.values(repeatables);
    const total = items.length;
    items = items.filter(isVisible);
    Array.from(container.querySelectorAll('.repeat tfoot td')).forEach(cell => {
        cell.innerText = gui.getMessageAndFraction('gui_items_found', Locale.formatNumber(items.length), Locale.formatNumber(total));
    });

    const sort = gui.getSortFunction(null, smartTable, 'name');
    items = sort(items);

    const tbody = smartTable.tbody[0];
    Dialog.htmlToDOM(tbody, '');
    for (const item of items) {
        let row = item.row;
        if (!row) {
            row = item.row = document.createElement('tr');
            row.setAttribute('data-id', item.id);
            row.setAttribute('height', 40);
            row.setAttribute('lazy-render', '');
        }
        tbody.appendChild(row);
    }
    gui.collectLazyElements(tbody);
    smartTable.syncLater();
    refreshItems();
}

function clearRefreshTimer() {
    if (refreshTimer) { clearTimeout(refreshTimer); }
    refreshTimer = 0;
}

function refreshItems() {
    clearRefreshTimer();
    // Update items only when this is the current tab and the document is visible
    if (gui.getCurrentTab() !== tab || document.visibilityState != 'visible') { return; }
    const changedState = calculateItem(null, true);
    const now = gui.getUnixTime();
    let timeout = 30000;
    for (const item of Object.values(repeatables)) {
        const remaining = item.time - now;
        if (remaining < 0) continue;
        if (remaining <= 90) { timeout = 1000; break; }
        if (remaining <= 120 && timeout > 10000) { timeout = 10000; }
    }
    refreshTimer = setTimeout(refreshItems, timeout - Date.now() % timeout);
    // Refresh table if at least one item changed state and (filter is on Ready? or table is sorted by time)
    if (changedState && (getState().ready != '' || smartTable.sort.name == 'time' || smartTable.sortSub.name == 'time')) refresh();
}

function updateRow(row) {
    const id = +row.getAttribute('data-id');
    const item = repeatables[id];
    let htm = '';
    htm += Html.br`<td><input type="checkbox"${item.selected ? Html(' checked') : ''}></td>`;
    htm += Html.br`<td>${gui.getLocationImg(item)}</td>`;
    htm += Html`<td>${item.name}</td>`;
    htm += Html.br`<td>${item.eid ? gui.getObjectImg('event', item.eid, 32, false, 'desc') : gui.getObjectImg('region', item.rid, 32, false, 'desc')}</td>`;
    htm += Html.br`<td>${gui.getDuration(item.cooldown, true)}</td>`;
    htm += Html.br`<td class="reset_gems">${Locale.formatNumber(item.reset)}${gui.getObjectImg('material', 2, 18, true)}</td>`;
    const xp = swPostcards ? item.xp * 10 : item.xp;
    htm += Html.br`<td class="bonus">${Locale.formatNumber(xp)}${gui.getObjectImg('system', 1, 18, true)}</td>`;
    htm += Html.br`<td class="progress add_slash"></td>`;
    htm += Html.br`<td class="total"></td>`;
    htm += Html.br`<td class="postcard"></td>`;
    htm += Html.br`<td class="time"><span class="relative"></span><span class="absolute"></span></td>`;
    row.classList.toggle('selected', item.selected);
    Dialog.htmlToDOM(row, htm);
    item._ready = item._readyText = null;
    calculateItem(item, true);
}

function calculateItem(item, flagRefreshRow) {
    const generator = gui.getGenerator();
    const loc_prog = generator.loc_prog || {};
    const items = item ? [item] : Object.values(repeatables);
    const now = gui.getUnixTime();
    let changedState = false;
    for (const item of items) {
        const id = item.id;
        const prog = bgp.Data.loc_prog[id] || loc_prog[id] || {};
        const level = +prog.lvl;
        const rotation = item.rotation.find(rotation => rotation.level == level);
        item.progress = +prog.prog || 0;
        item.total = rotation ? rotation.progress : 0;
        // Progress has reached total and complete time is not set
        // We can mark as completed if we have the time of last tile mined
        let cmpl = +prog.cmpl || 0;
        if (item.progress >= item.total && prog.time && (!cmpl || cmpl < prog.time)) {
            cmpl = item.cmpl = prog.time;
        }
        let end = 0;
        if (cmpl > 0) {
            end = cmpl + item.cooldown;
            if (end <= now) end = 0;
        }
        item.time = end;
        item.ready = item.time <= now;
        const readyHasChanged = item.ready !== item._ready;
        if (readyHasChanged) {
            item._ready = item.ready;
            changedState = true;
        }
        item.postcard = item.progress == item.total - 1 ? 1 : 0;
        if (flagRefreshRow && item.row && item.row.firstChild) {
            const row = item.row;
            if (item._progress !== item.progress) {
                item._progress = item.progress;
                row.querySelector('td.progress').innerText = Locale.formatNumber(item.progress);
            }
            if (item._total !== item.total) {
                item._total = item.total;
                row.querySelector('td.total').innerText = Locale.formatNumber(item.total);
            }
            if (item._postcard !== item.postcard) {
                item._postcard = item.postcard;
                Dialog.htmlToDOM(row.querySelector('td.postcard'), item.postcard ? ticked : unticked);
            }
            if (readyHasChanged || !item.ready) {
                if (readyHasChanged) row.classList.toggle('ready', item.ready);
                const text = item.ready ? gui.getMessage('repeat_ready') : gui.getDuration(item.time - now, true);
                if (item._readyText !== text) {
                    row.querySelector('td.time .relative').innerText = item._readyText = text;
                }
            }
            if (item.time !== item._time) {
                item._time = item.time;
                changedState = true;
                const text = item.ready ? '' : '(' + Locale.formatTime(item.time) + ')';
                row.querySelector('td.time .absolute').innerText = text;
            }
        }
    }
    return changedState;
}

function toggleSelected(id, flag) {
    const item = repeatables[id];
    flag = flag === undefined ? !item.selected : !!flag;
    item.selected = flag;
    if (item.row) {
        item.row.classList.toggle('selected', flag);
        const input = item.row.querySelector('input');
        if (input) input.checked = flag;
    }
    const index = selected.indexOf(id);
    if (!flag && index >= 0) {
        selected.splice(index, 1);
    } else if (flag && index < 0) {
        selected.push(id);
        selected.sort(gui.sortNumberAscending);
    }
}

function onClickTable(event) {
    const target = event.target;
    if (!target) return true;
    if (target.tagName == 'INPUT') {
        const row = target.parentNode.parentNode;
        const id = +row.getAttribute('data-id');
        const flag = target.checked;
        if (event.ctrlKey) {
            // apply to all
            for (const row of smartTable.table.querySelectorAll('tr[data-id]')) {
                toggleSelected(+row.getAttribute('data-id'), flag);
            }
        } else {
            toggleSelected(id, flag);
        }
        return gui.updateTabState(tab);
    }
}

function visibilityChange(visible) {
    if (visible) {
        refreshItems();
    } else {
        clearRefreshTimer();
    }
}