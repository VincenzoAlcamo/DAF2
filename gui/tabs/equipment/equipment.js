/*global bgp gui SmartTable HtmlBr Html HtmlRaw Locale Tooltip Dialog*/
export default {
    hasCSS: true,
    init: init,
    update: update,
    getState: getState,
    setState: setState,
    requires: ['materials', 'buildings', 'sales', 'events', 'offers', 'packs', 'tiered_offers', 'decorations', 'usables']
};

let tab, container, smartTable, selectOwned, selectShop, selectFrom, selectAffordable, selectUseful, checkHideMax, selectType, searchInput, searchHandler, allBuildings;
let matCache, minRegen, minCapacity, updateTime, packsViewed;
let currency, lastPack, btnPack;

function init() {
    tab = this;
    container = tab.container;

    selectOwned = container.querySelector('[name=owned]');
    selectOwned.addEventListener('change', refresh);

    selectShop = container.querySelector('[name=shop]');
    selectShop.addEventListener('change', refresh);
    selectFrom = container.querySelector('[name=from]');
    selectFrom.addEventListener('change', refresh);

    selectAffordable = container.querySelector('[name=affordable]');
    selectAffordable.addEventListener('change', refresh);

    selectUseful = container.querySelector('[name=useful]');
    selectUseful.addEventListener('change', refresh);

    checkHideMax = container.querySelector('[name=hidemax]');
    checkHideMax.addEventListener('click', refresh);

    selectType = container.querySelector('[name=type]');
    selectType.addEventListener('change', refresh);

    searchInput = container.querySelector('[name=search]');
    searchInput.addEventListener('input', () => triggerSearchHandler(true));

    btnPack = container.querySelector('[name=pack]');
    btnPack.addEventListener('click', () => showPacks(lastPack));

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

    function collect(list) {
        let result = {};
        for (let item of gui.getArray(list)) result[item.def_id] = (result[item.def_id] || 0) + 1;
        return result;
    }
    let owned = Object.assign({}, generator.stored_buildings);
    let inactive = collect(generator.camp.inactive_b);
    let active = collect(generator.camp.buildings);
    Object.keys(inactive).forEach(id => active[id] = Math.max(active[id] || 0, inactive[id]));
    Object.keys(active).forEach(id => owned[id] = (owned[id] || 0) + active[id]);

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
    for (let event of Object.values(gui.getFile('events'))) {
        let finished = +event.end;
        // Shop is open for 7 days after the event ends
        let shopLimit = finished + 86400 * 7;
        let eid = event.def_id;
        if (shopLimit > updateTime && !(eid in events)) {
            events[eid] = region;
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
            item.slotvalue = Math.floor(item.value / item.width);
            if (item.placed && item.slotvalue < minCapacity) minCapacity = item.slotvalue;
        } else if (reg > 0) {
            item.type = 'regen';
            item.value = reg;
            item.slotvalue = Math.floor(item.value / item.width);
            if (item.placed && item.slotvalue < minRegen) minRegen = item.slotvalue;
        } else continue;
        allBuildings[item.id] = item;
    }
    if (!isFinite(minCapacity)) minCapacity = 0;
    if (!isFinite(minRegen)) minRegen = 0;

    function setItem(item, hide, sale, saleType, eid, erid, level, reqs) {
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

    // SALES
    let sales = Object.values(gui.getFile('sales')).filter(sale => sale.type == 'building');
    sales.forEach(sale => sale.def_id = +sale.def_id);
    sales = sales.sort((a, b) => a.def_id - b.def_id).reverse();
    for (let sale of sales) {
        let item = allBuildings[sale.object_id];
        if (!item) continue;
        let eid = +sale.event_id || 0;
        let erid = +sale.event_region_id || 0;
        let hide = +sale.hide;
        if (eid && (!(eid in events) || erid != events[eid])) hide = 1;
        if (hide && (item.sale_id || !item.owned)) continue;
        setItem(item, hide, sale, 'sale', eid, erid, +sale.level);
    }

    // OFFERS
    sales = Object.values(gui.getFile('offers')).filter(sale => sale.type == 'building');
    sales.forEach(sale => sale.def_id = +sale.def_id);
    sales = sales.sort((a, b) => a.def_id - b.def_id).reverse();
    for (let sale of sales) {
        let item = allBuildings[sale.object_id];
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
        setItem(item, hide, sale, 'offer', eid, erid, +sale.level);
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
            item = allBuildings[item.object_id];
            if (!item || item.sale_id) continue;
            if (hide && (item.sale_id || !item.owned)) continue;
            setItem(item, hide, sale, 'pack', eid, erid, +sale.req_level);
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
                item = allBuildings[item.object_id];
                if (!item || item.sale_id) continue;
                if (hide && (item.sale_id || !item.owned)) continue;
                setItem(item, hide, sale, 'tier', eid, erid, +sale.req_level, reqs);
                item.tname = tier.name_loc;
            }
        }
    }

    // Remove non-owned and not-on-sale; compute other values
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
        item.gain = item.owned < item.limit ? item.width * Math.max(0, item.slotvalue - (item.type == 'capacity' ? minCapacity : minRegen)) : 0;
    }

    let coins_deco = 0;
    let decorations = gui.getFile('decorations');
    let stored = generator.stored_decorations || {};
    for (let did in stored) {
        let qty = +stored[did];
        let decoration = decorations[did];
        if (decoration && qty) coins_deco += qty * +decoration.sell_price;
    }

    container.querySelector('.equipment-stats').innerText = gui.getMessage('equipment_sellout', Locale.formatNumber(coins + coins_deco), Locale.formatNumber(coins), Locale.formatNumber(coins_deco));

    let title = gui.getMessage('equipment_gain_info') + ':';
    title += '\n' + gui.getMessage('camp_capacity') + ' = ' + Locale.formatNumber(minCapacity);
    title += '\n' + gui.getMessage('camp_regen') + ' = ' + Locale.formatNumber(minRegen);
    Array.from(container.querySelectorAll('thead [sort-name=gain]')).forEach(cell => {
        cell.title = title;
    });
    refresh();
}

function getState() {
    return {
        owned: selectOwned.value,
        shop: selectShop.value,
        from: selectFrom.value,
        affordable: selectAffordable.value,
        useful: selectUseful.value,
        hidemax: checkHideMax.checked,
        type: selectType.value,
        search: searchInput.value,
        sort: gui.getSortState(smartTable)
    };
}

function setState(state) {
    state.owned = gui.setSelectState(selectOwned, state.owned);
    state.shop = gui.setSelectState(selectShop, state.shop);
    state.from = gui.setSelectState(selectFrom, state.from);
    state.affordable = gui.setSelectState(selectAffordable, state.affordable);
    state.useful = gui.setSelectState(selectUseful, state.useful);
    checkHideMax.checked = !!state.hidemax;
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
    // We use a negative here and NaN in case no comparison must be checked
    // This works because NaN is never equal to any value, so the "if" is always false.
    let not_owned = state.owned ? state.owned == 'no' : NaN;
    let not_shop = state.shop ? state.shop == 'no' : NaN;
    let from = state.from;
    let not_affordable = state.affordable ? state.affordable == 'no' : NaN;
    let not_useful = state.useful ? state.useful == 'no' : NaN;
    let hideMax = state.hidemax;

    function isVisible(item) {
        if (search && item.name.toUpperCase().indexOf(search) < 0) return false;
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

function getMaterialImg(req) {
    let id = req.material_id;
    let result = matCache[id];
    if (!result) {
        result = {};
        result.url = gui.getObjectImage('material', id, true);
        let item = gui.getObject('material', id);
        let name_loc = item && item.name_loc;
        result.name = name_loc ? gui.getString(name_loc) : '#' + id;
        result.title = item && item.desc ? '\n' + gui.getWrappedText(gui.getString(item.desc)) : '';
        matCache[id] = result;
    }
    let img = result.url ? Html `<img width="18" height="18" src="${result.url}">` : '';
    return Html `<span class="${req.amount > req.stored ? 'locked' : ''}" title="${result.name + ' (' + Locale.formatNumber(req.amount) + ' / ' + Locale.formatNumber(req.stored) + ')' + result.title}">${Locale.formatNumber(req.amount)}${img}</span>`;
}

function updateRow(row) {
    let id = row.getAttribute('data-bid');
    let item = allBuildings[id];
    let htm = '';
    htm += HtmlBr `<td><img class="building tooltip-event" src="${gui.getObjectImage('building', item.id)}"></td>`;
    htm += HtmlBr `<td>${item.name}`;
    let start = 0;
    let end = 0;
    let price;
    if (item.sale == 'offer') {
        let offer = bgp.Data.files.offers[item.sale_id];
        htm += HtmlBr `<br><div class="offer">${gui.getMessage('gui_offer')}</div>`;
        start = +offer.start;
        end = +offer.end;
    } else if (item.sale == 'tier') {
        let offer = bgp.Data.files.tiered_offers[item.sale_id];
        htm += HtmlBr `<br><div class="offer">${gui.getMessage('gui_tieredoffer')}</div> ${gui.getString(item.tname)}`;
        start = +offer.start;
        end = +offer.end;
    } else if (item.sale == 'pack') {
        let pack = bgp.Data.files.packs[item.sale_id];
        htm += HtmlBr `<br><div class="offer" data-packid="${pack.def_id}">${gui.getMessage('gui_pack')}</div> ${gui.getString(pack.name_loc)}`;
        start = packsViewed[pack.def_id] || 0;
        end = start ? start + (+pack.duration) : 0;
        price = pack.prices.find(p => p.currency == currency) || pack.prices.find(p => p.currency == 'EUR') || pack.prices[0];
    }
    if (start || end) {
        if (end < start) end = start;
        htm += HtmlBr `<div class="offer-dates">`;
        if (start) htm += HtmlBr `<span${start > updateTime || end <= updateTime ? lockedClass : ''}>${Locale.formatDateTime(start)}</span> - `;
        htm += HtmlBr `<span${end <= updateTime ? lockedClass : ''}>${Locale.formatDateTime(end)}</span>`;
        htm += HtmlBr `</div>`;
    }
    htm += HtmlBr `</td>`;
    htm += HtmlBr `<td${(item.locked & 1) ? lockedClass : ''}>${item.level ? Locale.formatNumber(item.level) : ''}</td>`;
    htm += HtmlBr `<td${(item.locked & 2) ? lockedClass : ''}>${gui.getObjectImg('skin', item.rskin, 32, false, true)}</td>`;
    htm += HtmlBr `<td>${item.event ? gui.getObjectImg('event', item.event, 32, false, true) : ''}</td>`;
    htm += HtmlBr `<td>${item.sell ? Locale.formatNumber(item.sell) : ''}</td>`;
    htm += HtmlBr `<td>${Locale.formatNumber(item.placed)}</td>`;
    htm += HtmlBr `<td>${Locale.formatNumber(item.owned)}</td>`;
    htm += HtmlBr `<td${(item.locked & 4) ? lockedClass : ''}>${Locale.formatNumber(item.limit)}</td>`;
    htm += HtmlBr `<td><img src="/img/gui/${item.type}.png" title="${gui.getMessage(item.type == 'capacity' ? 'camp_capacity' : 'camp_regen')}"></td>`;
    htm += HtmlBr `<td>${Locale.formatNumber(item.value)}</td>`;
    htm += HtmlBr `<td colspan="2" class="wh"><div>${Locale.formatNumber(item.width)} &#215; ${Locale.formatNumber(item.height)}<div><div class="equipment_mask" style="--w:${item.width};--h:${item.height}"></div></td>`;
    htm += HtmlBr `<td>${Locale.formatNumber(item.slotvalue)}</td>`;
    htm += HtmlBr `<td>${item.gain ? Locale.formatNumber(item.gain) : ''}</td>`;
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
    htm += HtmlBr `<td class="${className}"${title ? Html ` title="${title}"` : ''}>`;
    let first = true;
    let reqs = gui.getArray(item.reqs);
    if (price) {
        htm += HtmlBr(price.currency + ' ' + Locale.formatNumber(+price.amount, 2));
    } else if (reqs.length == 1 && reqs[0].amount == 0) {
        htm += HtmlBr(gui.getMessage('equipment_free'));
    } else {
        for (let req of reqs) {
            if (!first) htm += `<br>`;
            first = false;
            htm += getMaterialImg(req);
        }
    }
    htm += HtmlBr `</td>`;
    row.innerHTML = htm;
    let packDiv = row.querySelector('[data-packid]');
    if (packDiv) {
        packDiv.style.cursor = 'zoom-in';
        packDiv.addEventListener('click', (event) => showPacks(+event.target.getAttribute('data-packid')));
    }
}

function getOutlinedText(text) {
    return HtmlBr `<span class="outlined-text">${text}</span>`;
}

function getPackItems(pack) {
    let buildings = gui.getFile('buildings');
    let usables = gui.getFile('usables');
    let materials = gui.getFile('materials');
    let items = [];
    for (let item of pack.items) {
        let copy = {};
        copy.type = item.type;
        copy.oid = +item.object_id;
        copy.amount = +item.amount;
        copy.portal = +item.portal;
        copy.sort = copy.value = 0;
        let obj;
        if (copy.type == 'building') {
            obj = copy.obj = buildings[copy.oid];
            if (!obj) continue;
            let cap = +obj.max_stamina;
            let reg = +obj.stamina_reg;
            let img = 'camp_capacity';
            if (cap) {
                copy.kind = 'capacity';
                copy.value = cap;
                copy.sort = 2;
                copy.title = gui.getMessage('camp_capacity');
            } else {
                copy.kind = 'regen';
                copy.value = reg;
                copy.sort = 1;
                copy.title = gui.getMessage('camp_regen');
                img = 'camp_energy';
            }
            copy.caption = Html `${getOutlinedText(Locale.formatNumber(copy.value))} <img width="40" src="/img/gui/${img}.png">`;
            copy.width = +obj.columns;
            copy.height = +obj.rows;
        } else if (copy.type == 'material') {
            obj = copy.obj = materials[copy.oid];
            if (!obj) continue;
            if (copy.oid == 2) {
                copy.kind = 'gem';
                copy.sort = 0;
                copy.title = gui.getObjectName(copy.type, copy.oid);
            } else {
                copy.kind = 'material';
                copy.sort = 3;
                copy.title = gui.getString('GUI0010');
            }
            copy.value = copy.amount;
            copy.caption = getOutlinedText(Locale.formatNumber(copy.amount));
        } else if (copy.type == 'usable') {
            obj = copy.obj = usables[copy.oid];
            if (!obj) continue;
            copy.kind = copy.type;
            copy.sort = 4;
            copy.value = +obj.value;
            let caption = getOutlinedText(Locale.formatNumber(copy.value));
            if (copy.amount > 1) caption = Html `<span class="qty outlined-text">${Locale.formatNumber(copy.amount) + ' \xd7 '}</span>${caption}`;
            copy.caption = caption;
            copy.title = gui.getString('GUI0008');
        } else if (copy.type == 'system') {
            copy.sort = 5;
            copy.value = copy.oid;
            copy.caption = getOutlinedText(Locale.formatNumber(copy.amount));
            copy.title = gui.getObjectName(copy.type, copy.oid);
            copy.kind = copy.oid == 2 ? 'energy' : 'xp';
        } else {
            continue;
        }
        items.push(copy);
    }
    items.sort((a, b) => (a.portal - b.portal) || (a.sort - b.sort) || (a.value - b.value));
    return items;
}

function showPacks(packId) {
    let packs = gui.getFile('packs');
    let buildings = gui.getFile('buildings');

    let pack = packs[packId];
    let related = gui.getArrayOfInt(pack.deny_list);
    related.push(+pack.def_id);

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
    regions.sort((a, b) => a - b);
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
        if (rid >= 0) htm += HtmlBr `<option value="0">[ ${gui.getMessage('gui_all').toUpperCase()} ]</option>`;
        packs.sort((a, b) => (a.price - b.price) || (a.id - b.id));
        for (let pack of packs) {
            if (!(pack.priceText in prices)) {
                prices[pack.priceText] = true;
                htm += HtmlBr `<option value="${pack.id}" ${Html(pack.selected ? 'selected':'')}>${pack.priceText}</option>`;
            }
        }
        return HtmlRaw(htm);
    }

    // type can be: "system", "building", "decoration", "usable", "material", "token", "camp_skin"
    function getPackDetails(rid, pid) {
        let selected;
        if (pid > 0) {
            let pack = hash[pid];
            selected = list.filter(p => p.id == pid || (rid == -1 && p.priceText == pack.priceText));
        } else {
            selected = rid ? list.filter(p => p.rid == rid) : list;
        }
        let result = '';
        let prev = {};
        for (let pack of selected) {
            let items = getPackItems(pack);
            if (items.length == 0) continue;
            let htm = '';
            let pre = '';
            if (rid == -1) {
                pre += HtmlBr `<div class="item section region"><span>${gui.getObjectImg('region', pack.rid, 0, false, true)}<br>${getOutlinedText(gui.getObjectName('region', pack.rid))}</span></div>`;
            }
            if (pid == 0) {
                pre += HtmlBr `<div class="item section">${getOutlinedText(pack.priceText)}</div>`;
            }
            for (let item of items) {
                htm += HtmlBr `<div class="item ${item.kind}" title="${Html(gui.getObjectName(item.type, item.oid, true))}">`;
                htm += HtmlBr `<div class="title"><span>${item.title.toUpperCase()}</span></div>`;
                htm += HtmlBr `<div class="image">${gui.getObjectImg(item.type, item.oid, 0, false, 'none')}</div>`;
                if (item.type == 'building') htm += HtmlBr `<div class="mask"><div class="equipment_mask" style="--w:${item.width};--h:${item.height}"></div></div>`;
                if (item.portal) htm += HtmlBr `<div class="bonus">${getOutlinedText('PORTAL\nBONUS')}</div>`;
                htm += HtmlBr `<div class="caption"><div>${item.caption}</div></div>`;
                htm += HtmlBr `</div>`;
            }
            if (htm in prev) continue;
            prev[htm] = true;
            if (pre) result += (result ? HtmlBr `<div><img src="/img/gui/blank.gif"></div>` : '') + pre;
            result += htm;
        }
        return HtmlRaw(result);
    }

    let htm = '';
    if (regions.length > 1) {
        htm += HtmlBr `${gui.getMessage('gui_region')} <select name="region" data-method="region" style="margin-bottom:2px">`;
        htm += HtmlBr `<option value="-1">[ ${gui.getMessage('gui_all').toUpperCase()} ]</option>`;
        for (let id of regions) {
            htm += HtmlBr `<option value="${id}" ${Html(id == rid ? 'selected' : '')}>${gui.getObjectName('region', id)}</option>`;
        }
        htm += HtmlBr `</select>`;
        htm += HtmlBr `<br>`;
    }
    htm += HtmlBr `${gui.getMessage('gui_cost')} <select name="pid" data-method="pid" style="margin-bottom:2px">${getPriceOptions(rid, packId)}</select>`;
    htm += HtmlBr `<br>`;
    htm += HtmlBr `<div class="equipment_pack">${getPackDetails(rid, packId)}</div>`;

    gui.dialog.show({
        title: gui.getString(pack.name_loc),
        html: htm,
        style: [Dialog.OK, Dialog.WIDEST]
    }, function(method, params) {
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
            container.classList.toggle('compact', +params.region == -1 || +params.pid == 0);
            container.innerHTML = getPackDetails(+params.region, +params.pid);
        }
    });
}

function onTooltip(event) {
    let element = event.target;
    let htm = HtmlBr `<div class="equipment-tooltip"><img src="${element.src}"/></div>`;
    Tooltip.show(element, htm);
}