/*global bgp gui SmartTable Html Locale Tooltip Dialog*/
export default {
    hasCSS: true,
    init,
    update,
    getState,
    setState,
    requires: ['materials', 'buildings', 'sales', 'events', 'offers', 'packs', 'tiered_offers', 'decorations', 'usables', 'tokens']
};

let tab, container, smartTable, selectOwned, selectShop, selectFrom, selectShopFrom, selectAffordable, selectUseful, selectType, searchInput, searchHandler;
let selectShow, selectEvent, selectRegion, selectTheme;
let allItems, currentItems, allEvents;
let matCache, minRegen, minCapacity, updateTime, packsViewed;
let currency, lastPack, btnPack;
let listRegion, listSkin, listMaterial;
let filterSkin, filterMaterial, filterLevelComparison, filterLevelType, filterLevel, filterHideMax;

function init() {
    tab = this;
    container = tab.container;

    selectShow = container.querySelector('[name=show]');
    selectShow.addEventListener('change', refresh);

    selectFrom = container.querySelector('[name=from]');
    selectFrom.addEventListener('change', refresh);

    selectShopFrom = container.querySelector('[name=shop_from]');
    selectShopFrom.addEventListener('change', refresh);

    selectEvent = container.querySelector('[name=event]');
    selectEvent.addEventListener('change', refresh);

    selectRegion = container.querySelector('[name=region]');
    selectRegion.addEventListener('change', refresh);

    selectTheme = container.querySelector('[name=theme]');
    selectTheme.addEventListener('change', refresh);

    selectOwned = container.querySelector('[name=owned]');
    selectOwned.addEventListener('change', refresh);

    selectShop = container.querySelector('[name=shop]');
    selectShop.addEventListener('change', refresh);

    selectAffordable = container.querySelector('[name=affordable]');
    selectAffordable.addEventListener('change', refresh);

    selectUseful = container.querySelector('[name=useful]');
    selectUseful.addEventListener('change', refresh);

    selectType = container.querySelector('[name=type]');
    selectType.addEventListener('change', refresh);

    searchInput = container.querySelector('[name=search]');
    searchInput.addEventListener('input', () => triggerSearchHandler(true));

    let button = container.querySelector('.toolbar button.advanced');
    button.addEventListener('click', onClickAdvanced);

    btnPack = container.querySelector('[name=pack]');
    btnPack.addEventListener('click', () => showPacks(lastPack));

    smartTable = new SmartTable(container.querySelector('.data'));
    smartTable.onSort = refresh;
    smartTable.fixedHeader.parentNode.classList.add('equipment');
    smartTable.fixedFooter.parentNode.classList.add('equipment');
    smartTable.tbody[0].addEventListener('render', function (event) {
        updateRow(event.target);
    });

    container.addEventListener('tooltip', onTooltip);
}

function getItemFromBuilding(building, owned, active) {
    if (!building) return null;
    let item = {};
    item.oid = building.def_id;
    item.id = 'b' + item.oid;
    item.owned = (owned && owned[item.oid]) || 0;
    item.placed = (active && active[item.oid]) || 0;
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
        item.slotvalue = Math.floor(item.value / item.width);
        if (item.placed && item.slotvalue < minCapacity) minCapacity = item.slotvalue;
    } else if (reg > 0) {
        item.type = 'regen';
        item.value = reg;
        item.slotvalue = Math.floor(item.value / item.width);
        if (item.placed && item.slotvalue < minRegen) minRegen = item.slotvalue;
    } else {
        item.type = 'building';
    }
    return item;
}

function getBoughtSkins() {
    const skins = {};
    for (let skin of gui.getArrayOfInt(gui.getGenerator().skins)) skins[skin] = true;
    return skins;
}

function computeItem(item, level, skins) {
    item.event = item.event || NaN;
    if (item.level > level) item.locked |= 1;
    if (item.rskin && !skins[item.rskin]) item.locked |= 2;
    if (item.owned >= item.limit) item.locked |= 4;
    item.gain = 0;
    if (item.type == 'capacity' || item.type == 'regen') {
        item.gain = item.width * Math.max(0, item.slotvalue - (item.type == 'capacity' ? minCapacity : minRegen));
    }
}

function setItem(item, hide, sale, saleType, eid, erid, level, reqs, backpack) {
    item.hide = hide;
    item.sale_id = sale.def_id;
    item.sale = saleType;
    item.event = eid;
    item.erid = erid;
    item.level = level;
    item.skin = sale.req_type == 'camp_skin' ? +sale.req_object : 0;
    let affordable = true;
    if (!reqs) reqs = sale.requirements;
    item.reqs = Array.isArray(reqs) && reqs.map(req => {
        let result = {};
        result.material_id = +req.material_id;
        result.amount = +req.amount;
        result.stored = backpack[result.material_id] || 0;
        if (result.stored < result.amount) affordable = false;
        return result;
    }).sort((a, b) => a.material_id - b.material_id);
    if (!affordable) item.locked |= 8;
}

function getOwnedActive(stored, placed, placed2) {
    function collect(list) {
        let result = {};
        for (let item of gui.getArray(list)) result[item.def_id] = (result[item.def_id] || 0) + 1;
        return result;
    }
    let owned = Object.assign({}, stored);
    let active = collect(placed);
    let inactive = collect(placed2);
    Object.keys(inactive).forEach(id => active[id] = Math.max(active[id] || 0, inactive[id]));
    Object.keys(active).forEach(id => owned[id] = (owned[id] || 0) + active[id]);
    return {
        owned,
        active
    };
}

function getEventInfo(event) {
    const eid = +event.def_id;
    let end = +event.end || 0;
    if (!end && eid == 14) end = 1393326000;
    if (!end && eid == 15) end = 1395745200;
    return {
        end,
        // compute the year as END - 14 days
        year: end - 14 * 86400
    };
}

function update() {
    bgp.Data.getPillarsInfo();
    const state = getState();
    let generator = gui.getGenerator();
    let backpack = generator.materials || {};
    let region = +generator.region;
    let level = +generator.level;
    currency = generator.currency;
    updateTime = gui.getUnixTime();
    matCache = {};
    minCapacity = minRegen = Infinity;

    let packs = {};
    packsViewed = {};
    lastPack = 0;
    let lastPackDate = 0;
    for (let pack of gui.getArrayOfInt(generator.packs_b)) {
        if (pack) packs[pack] = true;
    }
    for (let pack of gui.getArray(generator.packs_v)) {
        if (pack) {
            let dt = +pack.viewed;
            packs[pack.def_id] = true;
            packsViewed[pack.def_id] = dt;
            if (dt > lastPackDate) {
                lastPackDate = dt;
                lastPack = pack.def_id;
            }
        }
    }

    const {
        owned,
        active
    } = getOwnedActive(generator.stored_buildings, generator.camp.buildings, generator.camp.inactive_b);

    // Determine events
    let events = {};
    for (let event of Object.values(generator.events)) {
        let finished = +event.finished;
        // Shop is open for 7 days after the event ends
        let shopLimit = finished + 86400 * 7;
        let eid = event.def_id;
        if (shopLimit > updateTime) {
            events[eid] = generator.events_region[eid] || 0;
        }
    }
    allEvents = {};
    for (let event of Object.values(gui.getFile('events'))) {
        let finished = +event.end;
        // Shop is open for 7 days after the event ends
        let shopLimit = finished + 86400 * 7;
        let eid = event.def_id;
        if (shopLimit > updateTime && !(eid in events)) {
            events[eid] = region;
        }
        const info = getEventInfo(event);
        allEvents[eid] = {
            id: eid,
            year: info.year
        };
    }

    allItems = {};
    for (const building of Object.values(gui.getFile('buildings'))) {
        const item = getItemFromBuilding(building, owned, active);
        if (item) allItems[item.id] = item;
    }
    if (!isFinite(minCapacity)) minCapacity = 0;
    if (!isFinite(minRegen)) minRegen = 0;

    // SALES
    let sales = Object.values(gui.getFile('sales')).filter(sale => sale.type == 'building');
    sales.forEach(sale => sale.def_id = +sale.def_id);
    sales = sales.sort((a, b) => a.def_id - b.def_id).reverse();
    const allSkins = {};
    for (let sale of sales) {
        const eid = +sale.event_id || 0;
        const erid = +sale.event_region_id || 0;
        let hide = +sale.hide;
        if (!hide) {
            if (eid) {
                const data = allEvents[eid];
                if (data) {
                    data.sale = true;
                    if (erid > 1) data.segmented = true;
                }
            }
            const skin = sale.req_type == 'camp_skin' ? +sale.req_object : 0;
            if (skin) {
                allSkins[skin] = skin;
            }
        }
        let item = allItems['b' + sale.object_id];
        if (!item) continue;
        if (eid && (!(eid in events) || (erid != events[eid] && erid != 0))) hide = 1;
        if (hide && (item.sale_id || !item.owned)) continue;
        setItem(item, hide, sale, 'sale', eid, erid, +sale.level, null, backpack);
    }

    const arrEvents = Object.values(allEvents).filter(event => event.sale).sort((a, b) => b.year - a.year);
    let optGroup = null;
    let lastYearText = '';
    selectEvent.innerHTML = '';
    for (const event of arrEvents) {
        const option = document.createElement('option');
        option.value = '' + event.id;
        option.innerText = gui.getObjectName('event', event.id);
        const yearText = Locale.formatYear(event.year);
        if (!optGroup || lastYearText != yearText) {
            lastYearText = yearText;
            optGroup = document.createElement('optgroup');
            optGroup.label = gui.getMessageAndValue('events_year', yearText);
            selectEvent.appendChild(optGroup);
        }
        optGroup.appendChild(option);
    }

    selectRegion.innerHTML = '';
    for (let rid = 1, maxRid = gui.getMaxRegion(); rid <= maxRid; rid++) {
        const option = document.createElement('option');
        option.value = '' + rid;
        option.innerText = gui.getObjectName('region', rid);
        selectRegion.appendChild(option);
    }

    selectTheme.innerHTML = '';
    for (const skin of Object.values(allSkins).filter(skin => gui.getRegionFromSkin(skin) == 0).sort(gui.sortNumberAscending)) {
        const option = document.createElement('option');
        option.value = '' + skin;
        option.innerText = gui.getObjectName('skin', skin);
        selectTheme.appendChild(option);
    }

    setState(state);

    // OFFERS
    sales = Object.values(gui.getFile('offers')).filter(sale => sale.type == 'building');
    sales.forEach(sale => sale.def_id = +sale.def_id);
    sales = sales.sort((a, b) => a.def_id - b.def_id).reverse();
    for (let sale of sales) {
        let item = allItems['b' + sale.object_id];
        if (!item || item.sale_id) continue;
        // Offers are not specified for events
        let eid = +sale.event || 0;
        let erid = +sale.event_region_id || 0;
        for (let region of sale.regions.split(',')) {
            region = +region;
            if (region > 0 && (erid == 0 || region < erid)) erid = region;
        }
        let hide = +sale.hide;
        if (+sale.end <= updateTime) hide = 1;
        if (!eid && erid != region) hide = 1;
        if (eid && (!(eid in events) || erid > events[eid])) hide = 1;
        if (hide && (item.sale_id || !item.owned)) continue;
        setItem(item, hide, sale, 'offer', eid, erid, +sale.level, null, backpack);
    }

    // PACKS
    sales = Object.values(gui.getFile('packs'));
    for (let sale of sales) {
        if (!(sale.def_id in packs)) continue;
        let eid = +sale.event_id || 0;
        let erid = +sale.region_id || 0;
        let hide = +sale.hide;
        let start = packsViewed[sale.def_id] || 0;
        let end = start ? start + (+sale.duration) : 0;
        if (end <= updateTime) hide = 1;
        if (lastPack && sale.def_id == lastPack && hide) lastPack = 0;
        if (eid && (!(eid in events) || erid != events[eid])) hide = 1;
        let items = gui.getArray(sale.items);
        for (let item of items) {
            if (item.type != 'building') continue;
            item = allItems['b' + item.object_id];
            if (!item || item.sale_id) continue;
            if (hide && (item.sale_id || !item.owned)) continue;
            setItem(item, hide, sale, 'pack', eid, erid, +sale.req_level, null, backpack);
        }
    }
    btnPack.style.display = lastPack ? '' : 'none';

    // TIERED OFFERS
    sales = Object.values(gui.getFile('tiered_offers'));
    let possibleOffers = [];
    for (let sale of sales) {
        let start = +sale.start || 0;
        let end = +sale.end || 0;
        let erid = +sale.region_id;
        let hide = (end <= updateTime || start > updateTime || erid > region || +sale.req_level > level) ? 1 : 0;
        if (!hide) possibleOffers.push(sale);
    }
    let viewedOffers = gui.getArrayOfInt(generator.viewed_tiers);
    let boughtTiers = gui.getArrayOfInt(generator.bought_tiers);
    // Only one offer at a time, get the first that is viewed / bought (default is the one for the current region)
    let activeOffer = possibleOffers.find(offer => viewedOffers.includes(+offer.def_id));
    activeOffer = activeOffer || possibleOffers.find(offer => gui.getArray(offer.tiers).find(tier => boughtTiers.includes(+tier.def_id)));
    activeOffer = activeOffer || possibleOffers.find(offer => +offer.region_id == region);
    for (let sale of sales) {
        let hide = sale != activeOffer;
        let eid = 0;
        let erid = +sale.region_id;
        let tiers = gui.getArray(sale.tiers);
        for (let tier of tiers) {
            let gem = +tier.gem_price;
            let reqs = [{
                material_id: 2,
                amount: gem
            }];
            let items = gui.getArray(tier.items);
            for (let item of items) {
                if (item.type != 'building') continue;
                item = allItems['b' + item.object_id];
                if (!item || item.sale_id) continue;
                if (hide && (item.sale_id || !item.owned)) continue;
                setItem(item, hide, sale, 'tier', eid, erid, +sale.req_level, reqs, backpack);
                item.tname = tier.name_loc;
            }
        }
    }

    // Remove non-owned and not-on-sale; compute other values
    listSkin = {};
    listRegion = {};
    listMaterial = {};
    let coins = 0;
    const skins = getBoughtSkins();
    for (let id of Object.keys(allItems)) {
        let item = allItems[id];
        if (!item.owned && !item.sale_id) {
            delete allItems[id];
            continue;
        }
        if (item.skin) {
            item.rskin = item.skin;
            item.region = gui.getRegionFromSkin(item.skin);
            if (!item.region) {
                item.region = item.skin / 100;
                listSkin[item.skin] = true;
            }
        } else {
            item.region = item.erid || item.region || 1;
            item.rskin = gui.getSkinFromRegion(item.region);
            listRegion[item.region] = true;
        }
        for (let req of item.reqs || []) listMaterial[req.material_id] = true;
        if (item.placed < item.owned && item.sell) coins += item.sell * (item.owned - item.placed);
        computeItem(item, level, skins);
    }
    listSkin = Object.keys(listSkin).map(n => +n).sort(gui.sortNumberAscending);
    listRegion = Object.keys(listRegion).map(n => +n).sort(gui.sortNumberAscending);
    listMaterial = Object.keys(listMaterial).map(n => +n).sort(gui.sortNumberAscending);

    let coins_deco = 0;
    let decorations = gui.getFile('decorations');
    let stored = generator.stored_decorations || {};
    for (let did in stored) {
        let qty = +stored[did];
        let decoration = decorations[did];
        if (decoration && qty) coins_deco += qty * +decoration.sell_price;
    }

    container.querySelector('.stats').innerText = gui.getMessage('equipment_sellout', Locale.formatNumber(coins + coins_deco), Locale.formatNumber(coins), Locale.formatNumber(coins_deco));

    let title = gui.getMessage('equipment_gain') + '\n' + gui.getMessage('equipment_gain_info') + ':';
    title += '\n' + gui.getMessage('camp_capacity') + ' = ' + Locale.formatNumber(minCapacity);
    title += '\n' + gui.getMessage('camp_regen') + ' = ' + Locale.formatNumber(minRegen);
    Array.from(container.querySelectorAll('thead [sort-name=gain] img')).forEach(el => {
        el.title = title;
    });
    refresh();
}

function getState() {
    return {
        show: selectShow.value,
        from: selectFrom.value,
        shop_from: selectShopFrom.value,
        event: allEvents ? selectEvent.value : selectEvent.getAttribute('data-value'),
        region: allEvents ? selectRegion.value : selectRegion.getAttribute('data-value'),
        theme: allEvents ? selectTheme.value : selectTheme.getAttribute('data-value'),
        owned: selectOwned.value,
        shop: selectShop.value,
        affordable: selectAffordable.value,
        useful: selectUseful.value,
        hidemax: !!filterHideMax,
        type: selectType.value,
        level: filterLevelComparison + filterLevelType + (filterLevel > 0 ? filterLevel : ''),
        skin: filterSkin,
        material: filterMaterial,
        search: searchInput.value,
        sort: gui.getSortState(smartTable)
    };
}

function setState(state) {
    state.show = gui.setSelectState(selectShow, state.show);
    state.from = gui.setSelectState(selectFrom, state.from);
    state.shop_from = gui.setSelectState(selectShopFrom, state.shop_from);
    if (allEvents) {
        state.event = gui.setSelectState(selectEvent, state.event);
        state.region = gui.setSelectState(selectRegion, state.region);
        state.theme = gui.setSelectState(selectTheme, state.theme);
    }
    selectEvent.setAttribute('data-value', state.event);
    selectRegion.setAttribute('data-value', state.region);
    selectTheme.setAttribute('data-value', state.theme);
    state.owned = gui.setSelectState(selectOwned, state.owned);
    state.shop = gui.setSelectState(selectShop, state.shop);
    state.affordable = gui.setSelectState(selectAffordable, state.affordable);
    state.useful = gui.setSelectState(selectUseful, state.useful);
    filterHideMax = !!state.hidemax;
    state.type = gui.setSelectState(selectType, state.type);
    let level = String(state.level || '').toUpperCase();
    let match = level.match(/[EGL]/);
    filterLevelComparison = match ? match[0] : '';
    match = level.match(/C/);
    filterLevelType = match ? match[0] : '';
    match = level.match(/\d+/);
    filterLevel = Math.min(999, Math.max(1, (match && parseInt(match[0])) || 0));
    filterSkin = state.skin;
    filterMaterial = state.material;
    searchInput.value = state.search || '';
    gui.setSortState(state.sort, smartTable, 'name');
    updateButton();
}

function updateButton() {
    let flag = !!(filterSkin || filterMaterial || filterLevelComparison || filterHideMax);
    let button = container.querySelector('.toolbar button.advanced');
    button.textContent = gui.getMessage(flag ? 'menu_on' : 'menu_off');
    button.classList.toggle('activated', flag);

    const setDisplay = (el, flag) => el.style.display = flag ? '' : 'none';
    const isShop = selectShow.value == 'shop';
    const eventId = selectEvent.value;
    const isSegmented = allEvents && allEvents[eventId] && allEvents[eventId].segmented;
    setDisplay(selectFrom.parentNode, !isShop);
    setDisplay(selectShopFrom.parentNode, isShop);
    setDisplay(selectEvent.parentNode, isShop && selectShopFrom.value == 'event');
    setDisplay(selectRegion.parentNode, isShop && (selectShopFrom.value == 'region' || (selectShopFrom.value == 'event' && isSegmented)));
    setDisplay(selectTheme.parentNode, isShop && selectShopFrom.value == 'theme');
}

function onClickAdvanced() {
    const getValueSelected = (value, flag) => Html `value="${value}"${flag ? ' selected' : ''}`;
    const getValueCurrent = (value, current) => getValueSelected(value, value == current);
    let htm = '';
    htm += Html `<b data-lbl="level">${gui.getMessage('gui_level')}</b>: `;
    htm += Html `<select name="levelcomparison" data-method="level">`;
    htm += Html `<option ${getValueCurrent('', filterLevelComparison)}>${gui.getMessage('equipment_level_none')}</option>`;
    htm += Html `<option ${getValueCurrent('E', filterLevelComparison)}>${gui.getMessage('equipment_level_eq')}</option>`;
    htm += Html `<option ${getValueCurrent('L', filterLevelComparison)}>${gui.getMessage('equipment_level_le')}</option>`;
    htm += Html `<option ${getValueCurrent('G', filterLevelComparison)}>${gui.getMessage('equipment_level_ge')}</option>`;
    htm += Html `</select>&#32;`;
    htm += Html `<select name="leveltype" data-method="level">`;
    htm += Html `<option ${getValueCurrent('', filterLevelType)}>${gui.getMessage('equipment_level_your')} (${Locale.formatNumber(+gui.getGenerator().level)})</option>`;
    htm += Html `<option ${getValueCurrent('C', filterLevelType)}>${gui.getMessage('equipment_level_this')}</option>`;
    htm += Html `</select>&#32;`;
    htm += Html `<input type="number" name="level" min="1" max="999" maxlength="3" value=${filterLevel ? filterLevel : ''}>`;
    htm += Html `<br><br>`;
    htm += Html `<label for="d_hidemax"><b data-lbl="hidemax">${gui.getMessage('equipment_hidemax')}</b> <input id="d_hidemax" name="hidemax" type="checkbox" style="vertical-align:middle" ${filterHideMax ? 'checked' : ''} data-method="hidemax"></label>`;
    htm += Html `<br><br>`;
    htm += Html `<table class="equipment-advanced-table"><tr>`;
    htm += Html `<td><b data-lbl="skin">${gui.getMessage('gui_theme_required')}</b></td>`;
    htm += Html `<td><b data-lbl="material1">${gui.getMessage('equipment_include_material')}</b></td>`;
    htm += Html `<td><b data-lbl="material0">${gui.getMessage('equipment_exclude_material')}</b></td>`;
    htm += Html `</tr><tr>`;
    htm += Html `<td><select name="skin" multiple data-method="skin">`;
    htm += Html `<optgroup label="${gui.getMessage('gui_region').toUpperCase()}">`;
    let list = gui.getArrayOfInt(filterSkin);
    for (let rid of listRegion) {
        let id = gui.getSkinFromRegion(rid);
        htm += `<option ${getValueSelected(id, list.includes(id))}>${gui.getObjectName('region', rid)}</option>`;
    }
    htm += Html `</optgroup>`;
    htm += Html `<optgroup label="${gui.getMessage('gui_theme').toUpperCase()}">`;
    for (let item of listSkin.map(id => [id, gui.getObjectName('skin', id)]).sort((a, b) => a[1].localeCompare(b[1]))) {
        htm += `<option ${getValueSelected(item[0], list.includes(item[0]))}>${item[1]}</option>`;
    }
    htm += Html `</optgroup>`;
    htm += Html `</select></td>`;
    const materials = gui.getFile('materials');
    const items = listMaterial.map(id => {
        let name = gui.getObjectName('material', id);
        name = name.substr(0, 1) + name.substr(1).toLowerCase();
        return [id, name, +materials[id].event_id];
    }).sort((a, b) => a[1].localeCompare(b[1]));
    const addMaterialList = (isInclude) => {
        const list = gui.getArrayOfInt(filterMaterial).map(isInclude ? n => n : n => -n).filter(n => n > 0);
        const name = 'material' + (isInclude ? 1 : 0);
        htm += Html `<td><select name="${name}" multiple data-method="${name}">`;
        htm += Html `<optgroup label="${gui.getMessage('gui_from_regions').toUpperCase()}">`;
        for (let item of items.filter(item => item[2] == 0)) {
            htm += `<option ${getValueSelected(item[0], list.includes(item[0]))}>${item[1]}</option>`;
        }
        htm += Html `</optgroup>`;
        htm += Html `<optgroup label="${gui.getMessage('gui_from_events').toUpperCase()}">`;
        for (let item of items.filter(item => item[2] > 0)) {
            htm += `<option ${getValueSelected(item[0], list.includes(item[0]))}>${item[1]}</option>`;
        }
        htm += Html `</optgroup>`;
        htm += Html `</select></td>`;
    };
    addMaterialList(true);
    addMaterialList(false);
    htm += Html `</tr></tr>`;
    const addClrInvButtons = (suffix) => {
        htm += Html `<td><input data-method="clr-${suffix}" type="button" class="small" value="${gui.getMessage('gui_filter_clear')}"/>`;
        htm += Html `&#32;<input data-method="inv-${suffix}" type="button" class="small" value="${gui.getMessage('gui_filter_invert')}"/></td>`;
    };
    addClrInvButtons('skin');
    addClrInvButtons('material1');
    addClrInvButtons('material0');
    htm += Html `</tr></table>`;
    gui.dialog.show({
        title: gui.getMessage('gui_advancedfilter'),
        html: htm,
        style: [Dialog.CONFIRM, Dialog.CANCEL, Dialog.WIDEST, Dialog.AUTORUN]
    }, function (method, params) {
        if (method == Dialog.CANCEL) return;
        if (method == 'level' || method == Dialog.AUTORUN) {
            gui.dialog.element.querySelector('[name=leveltype]').style.display = params.levelcomparison ? '' : 'none';
            gui.dialog.element.querySelector('[name=level]').style.display = params.levelcomparison && params.leveltype == 'C' ? '' : 'none';
        }
        let shouldRefresh = method == 'hidemax' || method == 'skin' || method == 'material0' || method == 'material1' || method == 'level' || method == Dialog.AUTORUN;
        if (method.startsWith('clr-') || method.startsWith('inv-')) {
            shouldRefresh = true;
            const fn = method.startsWith('clr-') ? o => o.selected = false : o => o.selected = !o.selected;
            method = method.substr(4);
            const select = gui.dialog.element.querySelector(`[name=${method}`);
            for (const option of select.options) fn(option);
            params[select.name] = select.selectedOptions.length > 0;
        }
        if (method == 'material0' || method == 'material1') {
            const index = method == 'material0' ? 0 : 1;
            const select0 = gui.dialog.element.querySelector(`[name=material${index}`);
            const select1 = gui.dialog.element.querySelector(`[name=material${1 - index}`);
            const hash = {};
            for (const option of select0.selectedOptions) hash[option.value] = true;
            for (const option of select1.options) {
                if (option.value in hash) option.selected = false;
            }
            params[select0.name] = select0.selectedOptions.length > 0;
            params[select1.name] = select1.selectedOptions.length > 0;
        }
        if (shouldRefresh) {
            let setActivated = (lbl, flag) => gui.dialog.element.querySelector('[data-lbl=' + lbl + ']').classList.toggle('equipment-activated', !!flag);
            setActivated('level', params.levelcomparison);
            setActivated('hidemax', params.hidemax);
            setActivated('skin', params.skin);
            setActivated('material1', params.material1);
            setActivated('material0', params.material0);
            return;
        }
        filterLevelComparison = params.levelcomparison;
        filterLevelType = params.leveltype;
        filterLevel = params.level || 0;
        filterHideMax = params.hidemax;
        const hash = {};
        for (const option of gui.dialog.element.querySelector('[name=material1').selectedOptions) hash[option.value] = option.value;
        for (const option of gui.dialog.element.querySelector('[name=material0').selectedOptions) hash[option.value] = -option.value;
        const keys = Object.keys(hash).map(n => parseInt(n)).sort(gui.sortNumberAscending);
        filterSkin = gui.getArrayOfInt(params.skin).sort(gui.sortNumberAscending).join(',');
        filterMaterial = keys.map(n => hash[n]).join(',');
        refresh();
    });
}

function triggerSearchHandler(flag) {
    if (searchHandler) clearTimeout(searchHandler);
    searchHandler = flag ? setTimeout(refresh, 500) : 0;
}

function getCurrentItems(state) {
    currentItems = {};
    if (state.show != 'shop') {
        currentItems = allItems;
    } else {
        const validSale = {
            building: true,
            decoration: true,
            material: true,
            token: true,
            usable: true
        };
        const generator = gui.getGenerator();
        const sales = Object.values(gui.getFile('sales')).filter(sale => sale.type in validSale);
        const buildings = gui.getFile('buildings');
        const decorations = gui.getFile('decorations');
        const usables = gui.getFile('usables');
        const materials = gui.getFile('materials');
        const tokens = gui.getFile('tokens');
        const level = +generator.level;
        const skins = getBoughtSkins();
        const backpack = generator.materials || {};
        const {
            owned,
            active
        } = getOwnedActive(generator.stored_buildings, generator.camp.buildings, generator.camp.inactive_b);
        const {
            owned: decoOwned,
            active: decoActive
        } = getOwnedActive(generator.stored_decorations, generator.camp.decorations);
        const usaOwned = generator.usables;
        const tokOwned = generator.tokens;
        const matOwned = generator.materials;

        const addSale = (sale) => {
            if (+sale.hide) return null;
            let item = sale.type == 'building' ? allItems['b' + sale.object_id] : null;
            if (item == null) {
                if (sale.type == 'building') {
                    const building = buildings[sale.object_id];
                    item = getItemFromBuilding(building, owned, active);
                } else {
                    item = {};
                    item.type = sale.type;
                    item.oid = sale.object_id;
                    item.id = item.type.substr(0, 1) + item.oid;
                    item.owned = item.placed = 0;
                    item.sale_id = sale.def_id;
                    item.name = gui.getObjectName(item.type, item.oid);
                    item.limit = +Infinity;
                    item.sell = 0;
                    if (sale.type == 'decoration') {
                        item.owned = decoOwned[item.oid] || 0;
                        item.placed = decoActive[item.oid] || 0;
                        const decoration = decorations[item.oid];
                        if (!decoration) return;
                        item.sell = +decoration.sell_price;
                        item.value = +sale.exp;
                    } else if (sale.type == 'usable') {
                        const usable = usables[item.oid];
                        if (!usable) return;
                        item.owned = usaOwned[item.oid] || 0;
                        item.sell = +usable.sell_price;
                        item.value = usable.action == 'add_stamina' ? +usable.value : 0;
                    } else if (sale.type == 'material') {
                        const material = materials[item.oid];
                        if (!material) return;
                        item.owned = matOwned[item.oid] || 0;
                        item.sell = +material.sell_price;
                    } else if (sale.type == 'token') {
                        const token = tokens[item.oid];
                        if (!token) return;
                        item.owned = tokOwned[item.oid] || 0;
                        item.sell = +token.sell_price;
                    }
                }
                setItem(item, +sale.hide, sale, 'sale', +sale.event_id || 0, +sale.event_region_id || 0, +sale.level, null, backpack);
                if (item.skin) {
                    item.rskin = item.skin;
                    item.region = gui.getRegionFromSkin(item.skin);
                    if (!item.region) {
                        item.region = item.skin / 100;
                    }
                } else {
                    item.region = item.erid || item.region || 1;
                    item.rskin = gui.getSkinFromRegion(item.region);
                }
                computeItem(item, level, skins);
            }
            if (item) currentItems[item.id] = item;
        };
        if (state.shop_from == 'theme' || (state.shop_from == 'region' && state.region > 1)) {
            const skin = state.shop_from == 'theme' ? state.theme : gui.getSkinFromRegion(state.region);
            for (const sale of sales) {
                if (!+sale.event_id && sale.req_type == 'camp_skin' && +sale.req_object == skin) addSale(sale);
            }
        } else if (state.shop_from == 'region') {
            // Egypt
            for (const sale of sales) {
                if (!+sale.event_id && +sale.req_object == 0) addSale(sale);
            }
        } else if (state.shop_from == 'event') {
            for (const sale of sales) {
                if (+sale.event_id == state.event && (+sale.event_region_id == state.region || +sale.event_region_id == 0)) addSale(sale);
            }
        }

    }
}

function refresh() {
    gui.updateTabState(tab);
    let state = getState();
    updateButton(state);

    let fnSearch = gui.getSearchFilter(state.search);
    let type = (state.type || '').toLowerCase();
    // We use a negative here and NaN in case no comparison must be checked
    // This works because NaN is never equal to any value, so the "if" is always false.
    let not_owned = state.owned ? state.owned == 'no' : NaN;
    let not_shop = state.shop ? state.shop == 'no' : NaN;
    let from = state.show == '' ? state.from : '';
    let not_affordable = state.affordable ? state.affordable == 'no' : NaN;
    let not_useful = state.useful ? state.useful == 'no' : NaN;
    let hideMax = state.hidemax;

    let listSkin = gui.getArrayOfInt(filterSkin);
    if (listSkin.length == 0) listSkin = null;
    let listMaterialInclude = gui.getArrayOfInt(filterMaterial).filter(n => n > 0);
    let listMaterialExclude = gui.getArrayOfInt(filterMaterial).filter(n => n < 0).map(n => -n);
    if (listMaterialInclude.length == 0) listMaterialInclude = null;
    if (listMaterialExclude.length == 0) listMaterialExclude = null;

    let level = filterLevelType ? filterLevel : +gui.getGenerator().level;
    let fnLevel = null;
    if (filterLevelComparison == 'E') fnLevel = value => value != level;
    if (filterLevelComparison == 'L') fnLevel = value => value > level;
    if (filterLevelComparison == 'G') fnLevel = value => value < level;

    function isVisible(item) {
        if (fnSearch && !fnSearch(item.name.toUpperCase())) return false;
        if (type && item.type != type) return false;
        // NaN is never equal to true/false, so this will not trigger
        if (not_owned == (item.owned > 0)) return false;
        let inShop = item.sale_id > 0 && !item.hide;
        if (not_shop == inShop) return false;
        if (from == 'offer' && item.sale != 'offer') return false;
        if (from == 'pack' && item.sale != 'pack') return false;
        if (from == 'tier' && item.sale != 'tier') return false;
        if (from == 'event' && isNaN(item.event)) return false;
        if (from == 'theme' && (item.event > 0 || item.region >= 1)) return false;
        if (from == 'region' && (item.event > 0 || item.region < 1)) return false;
        if (not_affordable == (item.locked == 0)) return false;
        if (not_useful == (item.gain > 0)) return false;
        if (hideMax && item.owned >= item.limit) return false;
        if (listSkin && !listSkin.includes(item.rskin)) return false;
        if (listMaterialExclude) {
            for (let req of item.reqs || []) {
                if (listMaterialExclude.includes(req.material_id)) return false;
            }
        }
        if (listMaterialInclude) {
            const found = (item.reqs || []).find(req => listMaterialInclude.includes(req.material_id));
            if (!found) return false;
        }
        if (fnLevel && fnLevel(item.level)) return false;
        return true;
    }

    getCurrentItems(state);
    let items = Object.values(currentItems);
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
            row.setAttribute('data-id', item.id);
            row.setAttribute('height', 65);
            row.setAttribute('lazy-render', '');
        }
        tbody.appendChild(row);
    }
    gui.collectLazyElements(tbody);
    smartTable.syncLater();
}

const lockedClass = Html ` class="locked"`;

function getMaterialImg(req) {
    let id = req.material_id;
    let result = matCache[id];
    if (!result) {
        result = {};
        result.url = gui.getObjectImage('material', id, true);
        let item = gui.getObject('material', id);
        let name_loc = item && item.name_loc;
        result.name = name_loc ? gui.getString(name_loc) : '#' + id;
        result.title = (item && item.desc ? '\n' + gui.getWrappedText(gui.getString(item.desc)) : '');
        matCache[id] = result;
    }
    let img = result.url ? Html `<img width="18" height="18" src="${result.url}">` : '';
    let title = result.name + ' (' + Locale.formatNumber(req.amount) + ' / ' + Locale.formatNumber(req.stored) + ')';
    const xp = gui.getXp('material', id);
    const totXp = req.amount * xp;
    if (totXp) {
        const textXp = ((xp == 1 || req.amount == 1) ? '' : Locale.formatNumber(req.amount) + ' \xd7 ' + Locale.formatNumber(xp) + ' = ') + Locale.formatNumber(totXp);
        title += '\n' + gui.getMessageAndValue('gui_xp', textXp);
    }
    title += result.title;
    return Html `<span class="${req.amount > req.stored ? 'locked' : ''}" title="${title}">${Locale.formatNumber(req.amount)}${img}</span>`;
}

function updateRow(row) {
    let id = row.getAttribute('data-id');
    let item = currentItems[id];
    let htm = '';
    const type = item.type == 'capacity' || item.type == 'regen' ? 'building' : item.type;
    htm += Html.br `<td><img class="building tooltip-event" src="${gui.getObjectImage(type, item.oid)}"></td>`;
    htm += Html.br `<td>${item.name}`;
    let start = 0;
    let end = 0;
    let price;
    if (item.sale == 'offer') {
        let offer = bgp.Data.files.offers[item.sale_id];
        htm += Html.br `<br><div class="offer">${gui.getMessage('gui_offer')}</div>`;
        start = +offer.start;
        end = +offer.end;
    } else if (item.sale == 'tier') {
        let offer = bgp.Data.files.tiered_offers[item.sale_id];
        htm += Html.br `<br><div class="offer">${gui.getMessage('gui_tieredoffer')}</div> ${gui.getString(item.tname)}`;
        start = +offer.start;
        end = +offer.end;
    } else if (item.sale == 'pack') {
        let pack = bgp.Data.files.packs[item.sale_id];
        htm += Html.br `<br><div class="offer" data-packid="${pack.def_id}">${gui.getMessage('gui_pack')}</div> ${gui.getString(pack.name_loc)}`;
        start = packsViewed[pack.def_id] || 0;
        end = start ? start + (+pack.duration) : 0;
        price = pack.prices.find(p => p.currency == currency) || pack.prices.find(p => p.currency == 'EUR') || pack.prices[0];
    }
    if (start || end) {
        if (end < start) end = start;
        htm += Html.br `<div class="offer-dates">`;
        if (start) htm += Html.br `<span${start > updateTime || end <= updateTime ? lockedClass : ''}>${Locale.formatDateTime(start)}</span> - `;
        htm += Html.br `<span${end <= updateTime ? lockedClass : ''}>${Locale.formatDateTime(end)}</span>`;
        htm += Html.br `</div>`;
    }
    htm += Html.br `</td>`;
    htm += Html.br `<td${(item.locked & 1) ? lockedClass : ''}>${item.level ? Locale.formatNumber(item.level) : ''}</td>`;
    htm += Html.br `<td${(item.locked & 2) ? lockedClass : ''}>${gui.getObjectImg('skin', item.rskin, 32, false, true)}</td>`;
    htm += Html.br `<td>${item.event ? gui.getObjectImg('event', item.event, 32, false, true) : ''}</td>`;
    htm += Html.br `<td>${item.sell ? Locale.formatNumber(item.sell) : ''}</td>`;
    if (type == 'building' || type == 'decoration') {
        htm += Html.br `<td class="add_slash">${Locale.formatNumber(item.placed)}</td>`;
    } else {
        htm += Html.br `<td class="no_right_border"></td>`;
    }
    htm += Html.br `<td>${Locale.formatNumber(item.owned)}</td>`;
    htm += Html.br `<td${(item.locked & 4) ? lockedClass : ''}>${Locale.formatNumber(item.limit)}</td>`;
    if (type == 'building') {
        htm += Html.br `<td class="no_right_border"><img src="/img/gui/${item.type}.png" title="${gui.getMessage(item.type == 'capacity' ? 'camp_capacity' : 'camp_regen')}"></td>`;
        htm += Html.br `<td>${Locale.formatNumber(item.value)}</td>`;
        htm += Html.br `<td colspan="2" class="wh"><div>${Locale.formatNumber(item.width)} &#215; ${Locale.formatNumber(item.height)}<div><div class="equipment_mask" style="--w:${item.width};--h:${item.height}"></div></td>`;
        htm += Html.br `<td>${Locale.formatNumber(item.slotvalue)}</td>`;
        htm += Html.br `<td>${item.gain ? '+' + Locale.formatNumber(item.gain) : ''}</td>`;
    } else if (type == 'decoration') {
        htm += Html.br `<td class="no_right_border"><img src="/img/gui/deco.png" title="${gui.getMessage('gui_decoration')}"></td>`;
        htm += Html.br `<td class="bonus" colspan="5">${Locale.formatNumber(item.value)}${gui.getObjectImg('system', 1, 18, true)}</td>`;
    } else if (type == 'usable') {
        htm += Html.br `<td class="no_right_border"><img src="/img/gui/usable.png" title="${gui.getMessage('gui_decoration')}"></td>`;
        if (item.value) {
            htm += Html.br `<td class="bonus" colspan="5">${Locale.formatNumber(item.value)}${gui.getObjectImg('system', 2, 18, true)}</td>`;
        } else {
            htm += Html.br `<td class="bonus" colspan="5">${item.name}</td>`;
        }
    } else {
        htm += Html.br `<td colspan="6"></td>`;
    }
    let className = 'cost';
    let title = [];
    if (item.hide && item.sale_id) {
        title.push(gui.getMessage('equipment_notonsale'));
        className += ' dot';
    }
    if (item.sale == 'pack' || item.sale == 'tier') {
        title.push(gui.getMessage('equipment_price_info'));
        className += ' dot2';
    }
    title = title.join('\n');
    htm += Html.br `<td class="${className}"${title ? Html ` title="${title}"` : ''}>`;
    let first = true;
    let reqs = gui.getArray(item.reqs);
    if (price) {
        htm += Html.br(price.currency + ' ' + Locale.formatNumber(+price.amount, 2));
    } else if (reqs.length == 1 && reqs[0].amount == 0) {
        htm += Html.br(gui.getMessage('equipment_free'));
    } else {
        for (let req of reqs) {
            if (!first) htm += `<br>`;
            first = false;
            htm += getMaterialImg(req);
        }
    }
    htm += Html.br `</td>`;
    row.innerHTML = htm;
    let packDiv = row.querySelector('[data-packid]');
    if (packDiv) {
        packDiv.style.cursor = 'zoom-in';
        packDiv.addEventListener('click', (event) => showPacks(+event.target.getAttribute('data-packid')));
    }
}

function getOutlinedText(text) {
    return Html.br `<span class="outlined-text">${text}</span>`;
}

function getOfferItem(item) {
    let copy = {};
    copy.type = copy.kind = item.type;
    copy.oid = +item.object_id;
    copy.amount = +item.amount;
    copy.portal = +item.portal;
    copy.sort = 0;
    copy.value = copy.oid;
    let obj = copy.obj = (copy.type == 'building' || copy.type == 'material' || copy.type == 'usable') ? gui.getObject(copy.type, copy.oid) : null;
    // type can be: "system", "building", "decoration", "usable", "material", "token", "camp_skin"
    if (copy.type == 'building' && obj) {
        let cap = +obj.max_stamina;
        let reg = +obj.stamina_reg;
        let img = 'camp_capacity';
        if (cap) {
            copy.kind = 'capacity';
            copy.value = cap;
            copy.sort = 2;
            copy.title = gui.getString('GUI2921');
        } else {
            copy.kind = 'regen';
            copy.value = reg;
            copy.sort = 1;
            copy.title = gui.getString('GUI2920');
            img = 'camp_energy';
        }
        copy.caption = Html `${getOutlinedText(Locale.formatNumber(copy.value))} <img width="40" src="/img/gui/${img}.png">`;
        copy.width = +obj.columns;
        copy.height = +obj.rows;
    } else if (copy.type == 'material' && obj) {
        if (copy.oid == 2) {
            copy.kind = 'gem';
            copy.sort = 0;
        } else {
            copy.sort = 3;
            copy.title = gui.getString('GUI0010');
        }
        copy.value = copy.amount;
    } else if (copy.type == 'usable' && obj) {
        copy.sort = 4;
        copy.value = +obj.value;
        let caption = getOutlinedText(Locale.formatNumber(copy.value));
        if (copy.amount > 1) caption = Html `<span class="qty outlined-text">${Locale.formatNumber(copy.amount) + ' \xd7 '}</span>${caption}`;
        copy.caption = caption;
        copy.title = gui.getString('GUI0008');
    } else if (copy.type == 'token') {
        copy.sort = 5;
    } else if (copy.type == 'decoration') {
        copy.sort = 6;
    } else if (copy.type == 'system') {
        copy.sort = 7;
        copy.kind = copy.oid == 2 ? 'energy' : 'xp';
    } else {
        return null;
    }
    if (!copy.caption) copy.caption = getOutlinedText(Locale.formatNumber(copy.amount));
    if (!copy.title) copy.title = gui.getObjectName(copy.type, copy.oid);
    return copy;
}

function getPackItems(pack) {
    let items = [];
    for (let item of pack.items) {
        item = getOfferItem(item);
        if (item) items.push(item);
    }
    items.sort((a, b) => (a.portal - b.portal) || (a.sort - b.sort) || (a.value - b.value));
    return items;
}

function showPacks(packId) {
    let packs = gui.getFile('packs');
    let buildings = gui.getFile('buildings');

    let pack = packs[packId];
    packId = +pack.def_id;
    let related = gui.getArrayOfInt(pack.deny_list);
    related = related.filter(id => {
        let pack = packs[id];
        return pack && gui.getArrayOfInt(pack.deny_list).includes(packId);
    });
    related.push(packId);

    let hash = {};
    let regions = [];
    for (let pid of related) {
        let pack = packs[pid];
        if (!pack) continue;
        let rid = +pack.region_id;
        if (rid == 0) {
            let item = pack.items.find(item => item.type == 'building');
            if (item) {
                let building = buildings[item.object_id];
                if (building && building.region_id) rid = building.region_id;
            }
        }
        pack = Object.assign({}, pack);
        pack.id = pid;
        pack.rid = rid;
        let price = pack.prices.find(p => p.currency == currency) || pack.prices.find(p => p.currency == 'EUR') || pack.prices[0];
        pack.currency = price.currency;
        pack.price = +price.amount;
        pack.priceText = pack.currency + ' ' + Locale.formatNumber(pack.price, 2);
        hash[pack.id] = pack;
        if (!regions.includes(pack.rid)) regions.push(pack.rid);
    }
    regions.sort(gui.sortNumberAscending);
    let list = Object.values(hash);
    list.sort((a, b) => (a.rid - b.rid) || (a.price - b.price) || (a.pid - b.pid));
    let rid = hash[packId].rid;

    function getPriceOptions(rid, pid) {
        let pack = hash[pid];
        let price = pack.price;
        let packs = list.filter(pack => pack.rid == rid || rid == -1);
        let htm = '';
        for (let pack of packs) pack.selected = false;
        pack = packs.find(pack => pack.id == pid);
        // remove other packs with the same price
        if (pack) packs = packs.filter(p => p === pack || p.priceText != pack.priceText);
        if (!pack) pack = packs.find(pack => pack.price == price);
        if (pack) pack.selected = true;
        let prices = {};
        if (rid >= 0) htm += Html.br `<option value="0">[ ${gui.getMessage('gui_all').toUpperCase()} ]</option>`;
        packs.sort((a, b) => (a.price - b.price) || (a.id - b.id));
        for (let pack of packs) {
            if (!(pack.priceText in prices)) {
                prices[pack.priceText] = true;
                htm += Html.br `<option value="${pack.id}" ${Html(pack.selected ? 'selected':'')}>${pack.priceText}</option>`;
            }
        }
        return Html.raw(htm);
    }

    function getPackDetails(rid, pid) {
        let selected;
        if (pid > 0) {
            let pack = hash[pid];
            selected = list.filter(p => p.id == pid || (rid == -1 && p.priceText == pack.priceText));
        } else {
            selected = rid ? list.filter(p => p.rid == rid) : list;
        }
        let result = [];
        let prev = {};
        for (let pack of selected) {
            let items = getPackItems(pack);
            if (items.length == 0) continue;
            let htm = '';
            let pre = '';
            if (rid == -1) {
                pre += Html.br `<td><div class="item section region"><span>${gui.getObjectImg('region', pack.rid, 0, false, true)}<br>${getOutlinedText(gui.getObjectName('region', pack.rid))}</span></div></td>`;
            }
            if (pid == 0) {
                pre += Html.br `<td><div class="item section">${getOutlinedText(pack.priceText)}</div></td>`;
            }
            items.forEach((item, index) => {
                htm += Html.br `<td><div class="item ${item.kind}" title="${Html(gui.getObjectName(item.type, item.oid, true))}">`;
                htm += Html.br `<div class="title"><span>${item.title.toUpperCase()}</span></div>`;
                htm += Html.br `<div class="image">${gui.getObjectImg(item.type, item.oid, 0, false, 'none')}</div>`;
                if (item.type == 'building') htm += Html.br `<div class="mask"><div class="equipment_mask" style="--w:${item.width};--h:${item.height}"></div></div>`;
                if (item.portal) htm += Html.br `<div class="bonus">${getOutlinedText(gui.getString('GUI3065'))}</div>`;
                htm += Html.br `<div class="caption"><div>${item.caption}</div></div>`;
                htm += Html.br `</div></td>`;
                if (!pre && index == 2 && items.length >= 5) htm += `</tr><tr>`;
            });
            if (htm in prev) continue;
            prev[htm] = true;
            result.push(`<table><tr>${pre + htm}</tr></table>`);
        }
        let len = result.length;
        let rows = len || 1;
        let columns = 1;
        if (len > 6) {
            rows = Math.ceil(rows / 2);
            columns = 2;
        }
        let htm = `<div class="equipment_pack${columns > 1 ? ' mini' : (len > 3 ? ' compact' : '')}"><table>`;
        for (let row = 0; row < rows; row++) {
            htm += `<tr>`;
            for (let col = 0; col < columns; col++) {
                let index = col * rows + row;
                htm += `<td${col > 0 ? ' class="additional"' : ''}>${index >= len ? '' : result[index]}</td>`;
            }
            htm += `</tr>`;
        }
        htm += `</table></div>`;
        return htm;
    }

    let htm = '';
    if (regions.length > 1) {
        htm += Html.br `${gui.getMessage('gui_region')} <select name="region" data-method="region" style="margin-bottom:2px">`;
        htm += Html.br `<option value="-1">[ ${gui.getMessage('gui_all').toUpperCase()} ]</option>`;
        for (let id of regions) {
            htm += Html.br `<option value="${id}" ${Html(id == rid ? 'selected' : '')}>${gui.getObjectName('region', id)}</option>`;
        }
        htm += Html.br `</select>`;
        htm += Html.br `<br>`;
    }
    htm += Html.br `${gui.getMessage('gui_cost')} <select name="pid" data-method="pid" style="margin-bottom:2px">${getPriceOptions(rid, packId)}</select>`;
    htm += Html.br `<br>`;
    htm += getPackDetails(rid, packId);

    gui.dialog.show({
        title: gui.getString(pack.name_loc),
        html: htm,
        style: [Dialog.OK, Dialog.WIDEST]
    }, function (method, params) {
        if (method == 'region') {
            rid = +params.region;
            let select = gui.dialog.element.querySelector('[name=pid]');
            let pid = +select.value;
            if (pid == 0) pid = +select.options[1].value;
            select.innerHTML = getPriceOptions(rid, pid);
            params.pid = +select.value;
            if (pid > 0 && params.pid == 0) {
                select.selectedIndex = 1;
                params.pid = +select.value;
            }
        }
        if (method == 'region' || method == 'pid') {
            let container = gui.dialog.element.querySelector('.equipment_pack');
            container.outerHTML = getPackDetails(+params.region, +params.pid);
        }
    });
}

function onTooltip(event) {
    let element = event.target;
    let htm = Html.br `<div class="equipment-tooltip"><img src="${element.src}"/></div>`;
    Tooltip.show(element, htm);
}