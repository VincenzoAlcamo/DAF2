/*global gui SmartTable Html Locale*/
export default {
    hasCSS: true,
    init: init,
    update: update,
    getState: getState,
    setState: setState,
    requires: (function() {
        var requires = ['materials', 'map_filters', 'events', 'special_weeks'];
        for (let rid = gui.getMaxRegion(); rid >= 0; rid--) requires.push('locations_' + rid);
        return requires;
    })()
};

let tab, container, smartTable, selectShow, selectReady, searchInput, searchHandler;
let selected = [];
let repeatables;
let swPostcards;
let refreshInterval = 0;

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
    smartTable.tbody[0].addEventListener('render', function(event) {
        updateRow(event.target);
    });
    smartTable.table.addEventListener('click', onClickTable, true);

    // container.addEventListener('tooltip', onTooltip);
}

function update() {
    repeatables = {};

    // Find active events
    let activeEvents = {};
    let events = gui.getFile('events');
    let generator = gui.getGenerator();
    let eventData = generator.events || {};
    let eventsRegion = generator.events_region || {};
    let region = +generator.region;
    let now = gui.getUnixTime();
    for (let event of Object.values(events)) {
        if (!event.name_loc) continue;
        let eid = event.def_id;
        let edata = eventData[eid];
        let end = +event.end || 0;
        end = (edata && +edata.finished) || end;
        if (end > now) activeEvents[eid] = end;
    }

    // This will refresh the background page Repeatables
    gui.getRepeatables();

    let filters = Object.values(gui.getFile('map_filters')).filter(f => f.mobile_asset == 'materials').map(o => o.filter);
    for (let rid = region; rid >= 0; rid--) {
        let locations = Object.values(gui.getFile('locations_' + rid));
        for (let loc of locations) {
            if (+loc.reset_cd <= 0) continue;
            if (+loc.test || !+loc.order_id) continue;
            let expire = 0;
            let eid = 0;
            if (rid > 0) {
                if (!filters.includes(loc.filter)) continue;
            } else {
                eid = +loc.event_id;
                expire = activeEvents[eid];
                if (!expire) continue;
            }
            let item = {};
            item.id = +loc.def_id;
            item.name = gui.getString(loc.name_loc);
            item.region = rid;
            item.eid = eid;
            item.expire = expire;
            item.cooldown = +loc.reset_cd;
            item.reset = +loc.reset_gems;
            item.xp = +loc.reward_exp;
            if (Array.isArray(loc.overrides)) {
                let rid = region;
                if (eid in eventsRegion) rid = +eventsRegion[eid];
                if (rid > region) rid = region;
                for (let ovr of loc.overrides) {
                    if (+ovr.region_id == region) item.xp = +ovr.override_reward_exp;
                }
            }
            item.gr_library = loc.gr_library;
            item.gr_clip = loc.gr_clip;
            item.mobile_asset = loc.mobile_asset;
            item.rotation = [];
            for (let rot of loc.rotation) {
                let copy = {};
                copy.level = +rot.level;
                copy.progress = +rot.progress;
                copy.chance = +rot.chance;
                item.rotation.push(copy);
            }
            if (item.rotation.length) repeatables[item.id] = item;
        }
    }
    let specialWeeks = gui.getActiveSpecialWeeks();
    swPostcards = specialWeeks.postcards;
    showSpecialWeeks([specialWeeks.refreshDrop, specialWeeks.postcards]);
    setState(getState());
    refresh();
}

function showSpecialWeeks(items) {
    if (!Array.isArray(items)) {
        items = gui.getActiveSpecialWeeks().items;
    }
    let htm = [];
    for (let sw of items) {
        if (sw && sw.name) htm.push(Html.br `${sw.name}: ${sw.ends}`);
    }
    let divWarning = container.querySelector('.toolbar .warning');
    divWarning.innerHTML = htm.join('<br>');
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
        for (let item of Object.values(repeatables)) item.selected = false;
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

    let state = getState();
    let show = state.show;
    let not_ready = state.ready ? state.ready == 'no' : NaN;
    let search = (state.search || '').toUpperCase();
    let now = gui.getUnixTime();
    calculateItem();

    function isVisible(item) {
        if (search && item.name.toUpperCase().indexOf(search) < 0) return false;
        if (show == 'selected' && !item.selected) return false;
        if (not_ready == !(item.time > now)) return false;
        return true;
    }

    let items = Object.values(repeatables);
    let total = items.length;
    items = items.filter(isVisible);
    Array.from(container.querySelectorAll('.repeat tfoot td')).forEach(cell => {
        cell.innerText = gui.getMessageAndFraction('gui_items_found', Locale.formatNumber(items.length), Locale.formatNumber(total));
    });

    let sort = gui.getSortFunction(null, smartTable, 'name');
    items = sort(items);

    let tbody = smartTable.tbody[0];
    tbody.innerHTML = '';
    for (let item of items) {
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
    if (!refreshInterval) refreshInterval = setInterval(refreshItems, 5000);
}

function refreshItems() {
    // Update items only when this is the current tab and the document is visible
    if (gui.getCurrentTab() !== tab) return;
    if (document.visibilityState != 'visible') return;
    let changedState = calculateItem(null, true);
    // Refresh table if at least one item changed state and (filter is on Ready? or table is sorted by time)
    if (changedState && (getState().ready != '' || smartTable.sort.name == 'time' || smartTable.sortSub.name == 'time')) refresh();
}

function updateRow(row) {
    let id = +row.getAttribute('data-id');
    let item = repeatables[id];
    let htm = '';
    // let img = `${gui.getGenerator().cdn_root}mobile/graphics/map/webgl_locations/${item.gr_library}_${item.gr_clip}.png`;
    let img = `${gui.getGenerator().cdn_root}mobile/graphics/map/${item.mobile_asset}.png`;
    htm += Html.br `<td><input type="checkbox"${item.selected ? Html(' checked') : ''}></td>`;
    htm += Html.br `<td><div class="mobile"><img src="${img}" title="${item.name}\n${gui.getMessage('pillars_ignore')}"></div></td>`;
    htm += Html `<td>${item.name}</td>`;
    htm += Html.br `<td>${item.eid ? gui.getObjectImg('event', item.eid, 32, false, true) : gui.getObjectImg('region', item.region, 32, false, true)}</td>`;
    htm += Html.br `<td>${gui.getDuration(item.cooldown, true)}</td>`;
    htm += Html.br `<td class="reset_gems">${Locale.formatNumber(item.reset)}${gui.getObjectImg('material', 2, 18, true)}</td>`;
    let xp = swPostcards ? item.xp * 10 : item.xp;
    htm += Html.br `<td class="bonus">${Locale.formatNumber(xp)}${gui.getObjectImg('system', 1, 18, true)}</td>`;
    htm += Html.br `<td class="progress"></td>`;
    htm += Html.br `<td class="total"></td>`;
    htm += Html.br `<td class="time"></td>`;
    row.classList.toggle('selected', item.selected);
    row.innerHTML = htm;
    calculateItem(item, true);
}

function calculateItem(item, flagRefreshRow) {
    let generator = gui.getGenerator();
    let loc_prog = generator.loc_prog || {};
    let items = item ? [item] : Object.values(repeatables);
    let now = gui.getUnixTime();
    let changedState = false;
    for (let item of items) {
        let id = item.id;
        let prog = loc_prog[id] || {};
        let level = +prog.lvl;
        let rotation = item.rotation.find(rotation => rotation.level == level);
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
        if (item.ready !== item._ready) changedState = true;
        if (flagRefreshRow && item.row && item.row.firstChild) {
            let row = item.row;
            if (item._progress !== item.progress) {
                item._progress = item.progress;
                row.querySelector('td.progress').innerText = Locale.formatNumber(item.progress);
            }
            if (item._total !== item.total) {
                item._total = item.total;
                row.querySelector('td.total').innerText = Locale.formatNumber(item.total);
            }
            if (item._ready !== item.ready || !item.ready) {
                if (item._ready !== item.ready) row.classList.toggle('ready', item.ready);
                item._ready = item.ready;
                let text = item.ready ? gui.getMessage('repeat_ready') : gui.getDuration(item.time - now, true);
                if (item._readyText !== text) {
                    row.querySelector('td.time').innerText = item._readyText = text;
                }
            }
        }
    }
    return changedState;
}

function onClickTable(event) {
    let target = event.target;
    if (!target) return true;
    if (target.tagName == 'INPUT') {
        let row = target.parentNode.parentNode;
        let id = +row.getAttribute('data-id');
        let flag = target.checked;
        if (event.ctrlKey) {
            // apply to all
            selected = [];
            for (let item of Object.values(repeatables)) {
                item.selected = flag;
                if (item.row) {
                    item.row.classList.toggle('selected', flag);
                    let input = item.row.querySelector('input');
                    if (input) input.checked = flag;
                }
                if (flag) selected.push(item.id);
            }
        } else {
            row.classList.toggle('selected', flag);
            selected = selected.filter(v => v != id);
            if (flag) selected.push(id);
            repeatables[id].selected = flag;
        }
        selected.sort((a, b) => a - b);
        return gui.updateTabState(tab);
    }
}