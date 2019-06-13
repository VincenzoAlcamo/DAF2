/*global gui SmartTable HtmlBr Html Locale Tooltip*/
export default {
    hasCSS: true,
    init: init,
    update: update,
    getState: getState,
    setState: setState,
    requires: ['materials', 'buildings', 'sales', 'events']
};

let tab, container, smartTable, selectShow, selectType, searchInput, searchHandler, allBuildings;

function init() {
    tab = this;
    container = tab.container;

    selectShow = container.querySelector('[name=show]');
    selectShow.addEventListener('change', refresh);

    selectType = container.querySelector('[name=type]');
    selectType.addEventListener('change', refresh);

    searchInput = container.querySelector('[name=search]');
    searchInput.addEventListener('input', () => triggerSearchHandler(true));

    smartTable = new SmartTable(container.querySelector('.data'));
    smartTable.onSort = refresh;
    smartTable.fixedHeader.parentNode.classList.add('equipment');
    smartTable.fixedFooter.parentNode.classList.add('equipment');
    smartTable.tbody[0].addEventListener('render', function(event) {
        updateRow(event.target);
    });

    container.addEventListener('tooltip', onTooltip);
}

function update() {
    let generator = gui.getGenerator();
    let backpack = generator.materials || {};

    function collect(list) {
        let result = {};
        (list ? [].concat(list) : []).forEach(item => result[item.def_id] = (result[item.def_id] || 0) + 1);
        return result;
    }
    let owned = Object.assign({}, generator.stored_buildings);
    let inactive = collect(generator.camp.inactive_b);
    let active = collect(generator.camp.buildings);
    Object.keys(inactive).forEach(id => active[id] = Math.max(active[id] || 0, inactive[id]));
    Object.keys(active).forEach(id => owned[id] = (owned[id] || 0) + active[id]);

    // Determine events
    let events = {};
    let now = gui.getUnixTime();
    for (let event of Object.values(generator.events)) {
        let finished = +event.finished;
        // Shop is open for 7 days after the event ends
        let shopLimit = finished + 86400 * 7;
        if (shopLimit > now) {
            let eid = event.def_id;
            events[eid] = generator.events_region[eid] || 0;
        }
    }

    allBuildings = {};
    for (let building of Object.values(gui.getFile('buildings'))) {
        let item = {};
        item.id = building.def_id;
        item.owned = owned[item.id] || 0;
        item.placed = active[item.id] || 0;
        // This marks the building is not on-sale
        item.sale_id = item.level = item.event = item.erid = item.skin = item.locked = 0;
        item.name = gui.getString(building.name_loc);
        item.limit = +building.limit;
        item.brid = +building.region;
        if (item.limit == 0) item.limit = +Infinity;
        item.width = Math.max(+building.columns || 0, 1);
        item.height = Math.max(+building.rows || 0, 1);
        item.sell = +building.sell_price || 0;
        let cap = +building.max_stamina || 0;
        let reg = +building.stamina_reg || 0;
        if (cap > 0) {
            item.type = 'capacity';
            item.value = cap;
        } else if (reg > 0) {
            item.type = 'regen';
            item.value = reg;
        } else continue;
        item.slotvalue = Math.floor(item.value / item.width);
        allBuildings[item.id] = item;
    }
    let sales = Object.values(gui.getFile('sales')).filter(sale => sale.type == 'building');
    for (let sale of sales) {
        let item = allBuildings[sale.object_id];
        if (!item || +sale.hide) continue;
        let eid = +sale.event_id || 0;
        let erid = +sale.event_region_id || 0;
        if (eid && (!(eid in events) || erid != events[eid])) continue;
        item.sale_id = sale.def_id;
        item.level = +sale.level;
        item.event = eid;
        item.erid = erid;
        item.skin = sale.req_type == 'camp_skin' ? +sale.req_object : 0;
        let affordable = true;
        item.reqs = Array.isArray(sale.requirements) && sale.requirements.map(req => {
            let result = {};
            result.material_id = +req.material_id;
            result.amount = +req.amount;
            if ((backpack[result.material_id] || 0) < result.amount) affordable = false;
            return result;
        }).sort((a, b) => a.material_id - b.material_id);
        if (!affordable) item.locked |= 8;
    }
    // Remove non-owned and not-on-sale; compute other values
    let level = +generator.level;
    let skins = {};
    let coins = 0;
    for (let skin of gui.getArrayOfInt(generator.skins)) skins[skin] = true;
    for (let id of Object.keys(allBuildings)) {
        let item = allBuildings[id];
        if (!item.owned && !item.sale_id) {
            delete allBuildings[id];
            continue;
        }
        if (item.skin) {
            item.rskin = item.skin;
            item.region = gui.getRegionFromSkin(item.skin);
            if (!item.region) item.region = item.skin / 100;
        } else {
            item.region = item.erid || item.region || 1;
            item.rskin = gui.getSkinFromRegion(item.region);
        }
        item.event = item.event || NaN;
        if (item.level > level) item.locked |= 1;
        if (item.rskin && !skins[item.rskin]) item.locked |= 2;
        if (item.owned >= item.limit) item.locked |= 4;
        if (item.placed < item.owned && item.sell) coins += item.sell * (item.owned - item.placed);
    }
    container.querySelector('.equipment-stats').innerText = gui.getMessage('equipment_sellout', Locale.formatNumber(coins));
    refresh();
}

function getState() {
    return {
        show: selectShow.value,
        type: selectType.value,
        search: searchInput.value,
        sort: gui.getSortState(smartTable)
    };
}

function setState(state) {
    state.show = gui.setSelectState(selectShow, state.show);
    state.type = gui.setSelectState(selectType, state.type);
    searchInput.value = state.search || '';
    gui.setSortState(state.sort, smartTable, 'name');
}

function triggerSearchHandler(flag) {
    if (searchHandler) clearTimeout(searchHandler);
    searchHandler = flag ? setTimeout(refresh, 500) : 0;
}

function refresh() {
    gui.updateTabState(tab);

    let state = getState();
    let search = (state.search || '').toUpperCase();
    let type = (state.type || '').toLowerCase();
    let show = state.show;

    function isVisible(item) {
        if (search && item.name.toUpperCase().indexOf(search) < 0) return false;
        if (type && item.type != type) return false;
        if (show == 'owned' && !item.owned) return false;
        if (show == 'sale' && !item.sale_id) return false;
        if (show == 'affordable' && (!item.sale_id || item.locked)) return false;
        return true;
    }

    let items = Object.values(allBuildings);
    let total = items.length;
    items = items.filter(isVisible);
    Array.from(container.querySelectorAll('.equipment tfoot td')).forEach(cell => {
        cell.innerText = gui.getMessageAndFraction('gui_items_found', Locale.formatNumber(items.length), Locale.formatNumber(total));
    });

    let sort = gui.getSortFunction(null, smartTable, 'name');
    items = sort(items);

    var tbody = smartTable.tbody[0];
    tbody.innerHTML = '';
    for (let item of items) {
        let row = item.row;
        if (!row) {
            row = item.row = document.createElement('tr');
            row.setAttribute('data-bid', item.id);
            row.setAttribute('height', 55);
            row.setAttribute('lazy-render', '');
        }
        tbody.appendChild(row);
    }
    gui.collectLazyElements(tbody);
    smartTable.syncLater();
}

let lockedClass = Html ` class="locked"`;

function updateRow(row) {
    let id = row.getAttribute('data-bid');
    let item = allBuildings[id];
    let htm = '';
    htm += HtmlBr `<td><img class="building tooltip-event" src="${gui.getObjectImage('building', item.id)}"></td>`;
    htm += HtmlBr `<td>${item.name}</td>`;
    htm += HtmlBr `<td${(item.locked & 1) ? lockedClass : ''}>${item.level ? Locale.formatNumber(item.level) : ''}</td>`;
    htm += HtmlBr `<td${(item.locked & 2) ? lockedClass : ''}>${gui.getObjectImg('skin', item.rskin, 32, false, true)}</td>`;
    htm += HtmlBr `<td>${item.event ? gui.getObjectImg('event', item.event, 32, false, true) : ''}</td>`;
    htm += HtmlBr `<td>${item.sell ? Locale.formatNumber(item.sell) : ''}</td>`;
    htm += HtmlBr `<td>${Locale.formatNumber(item.placed)}</td>`;
    htm += HtmlBr `<td>${Locale.formatNumber(item.owned)}</td>`;
    htm += HtmlBr `<td${(item.locked & 4) ? lockedClass : ''}>${Locale.formatNumber(item.limit)}</td>`;
    htm += HtmlBr `<td><img src="/img/gui/${item.type}.png" title="${gui.getMessage(item.type == 'capacity' ? 'camp_capacity' : 'camp_regen')}"></td>`;
    htm += HtmlBr `<td>${Locale.formatNumber(item.value)}</td>`;
    htm += HtmlBr `<td>${Locale.formatNumber(item.width)}</td>`;
    htm += HtmlBr `<td>${Locale.formatNumber(item.height)}</td>`;
    htm += HtmlBr `<td>${Locale.formatNumber(item.slotvalue)}</td>`;
    let notOnSale = item.hide && item.sale_id ? Html ` class="dot${(item.locked & 8) ? ' locked' : ''}" title="Not on sale anymore"` : ((item.locked & 8) ? lockedClass : '');
    htm += HtmlBr `<td${notOnSale}>`;
    let ch = '';
    for (let req of item.reqs || []) {
        htm += HtmlBr `${ch}${Locale.formatNumber(req.amount)}<img class="material" src="${gui.getObjectImage('material', req.material_id, 20, true)}" title="${gui.getObjectName('material', req.material_id, 20, true)}">`;
        ch = '\n';
    }
    htm += HtmlBr `</td>`;
    row.innerHTML = htm;
}

function onTooltip(event) {
    let element = event.target;
    let htm = HtmlBr `<div class="equipment-tooltip"><img src="${element.src}"/></div>`;
    Tooltip.show(element, htm, 'w');
}