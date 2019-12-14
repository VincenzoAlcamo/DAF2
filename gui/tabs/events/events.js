/*global gui SmartTable Html Locale Tooltip*/
export default {
    hasCSS: true,
    init: init,
    update: update,
    getState: getState,
    setState: setState,
    requires: ['materials', 'events', 'achievements', 'collections', 'locations_0']
};

let tab, container, smartTable, searchInput, searchHandler, selectShow, selectYear, selectSegmented, selectShop;
let allEvents;

function init() {
    tab = this;
    container = tab.container;

    selectShow = container.querySelector('[name=show]');
    selectShow.addEventListener('change', refresh);

    selectYear = container.querySelector('[name=year]');
    selectYear.addEventListener('change', refresh);

    selectSegmented = container.querySelector('[name=segmented]');
    selectSegmented.addEventListener('change', refresh);

    selectShop = container.querySelector('[name=shop]');
    selectShop.addEventListener('change', refresh);

    searchInput = container.querySelector('[name=search]');
    searchInput.addEventListener('input', () => triggerSearchHandler(true));

    smartTable = new SmartTable(container.querySelector('.data'));
    smartTable.onSort = refresh;
    smartTable.fixedHeader.parentNode.classList.add('events');
    smartTable.fixedFooter.parentNode.classList.add('events');
    smartTable.tbody[0].addEventListener('render', function (event) {
        updateRow(event.target);
    });

    container.addEventListener('tooltip', onTooltip);
}

function byEvent(list) {
    let hash = {};
    for (let item of list) {
        let eid = +item.event_id;
        if (!eid) continue;
        if (!(eid in hash)) hash[eid] = [];
        hash[eid].push(+item.def_id);
    }
    return hash;
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
    let achievements = gui.getFile('achievements');
    let achievementsByEvent = byEvent(Object.values(achievements));
    let collections = gui.getFile('collections');
    let collectionsByEvent = byEvent(Object.values(collections));
    let materialsByEvent = byEvent(Object.values(gui.getFile('materials')));
    let locations0 = gui.getFile('locations_0');
    let generator = gui.getGenerator();
    let eventData = generator.events || {};
    let questsFinished = gui.getArrayOfInt(generator.quests_f);
    let artifacts = gui.getArrayOfInt(generator.artifacts);
    let eventsRegion = generator.events_region || {};
    let events = gui.getFile('events');
    allEvents = {};
    for (let event of Object.values(events)) {
        if (!event.name_loc) continue;
        let eid = event.def_id;
        let item = {};
        item.id = eid;
        item.name = gui.getString(event.name_loc);
        item.gems = (+event.premium > 0 ? +event.gems_price : 0) || NaN;
        let edata = eventData[eid];
        const info = getEventInfo(event);
        item.start = (edata && +edata.started) || NaN;
        item.end = (edata && +edata.finished) || info.end;
        item.year = info.year;
        item.yeartxt = Locale.formatYear(info.year);

        let quests = gui.getArrayOfInt(event.quests);
        if (!quests.length) continue;
        item.tquest = quests.length;
        item.cquest = 0;
        for (let qid of quests) {
            if (questsFinished.includes(qid)) ++item.cquest;
        }
        item.pquest = item.cquest / (item.tquest || 1);

        item.materials = materialsByEvent[eid] || [];
        // Red Ring
        if (eid == 20) item.materials.push(-1642);

        item.img = gui.getObjectImage('event', item.id);
        if (item.img == '' && item.materials.length == 1) item.img = gui.getObjectImage('material', item.materials[0]);
        item.img_full = event.mobile_asset;
        item.img_webgl = event.shelf_graphics;
        // this will force the use of img_full instead of img_webgl
        item.img_missing = true;

        let achievs = achievementsByEvent[eid] || [];
        item.tachiev = item.cachiev = 0;
        for (let aid of achievs) {
            let achievement = achievements[aid];
            item.tachiev += achievement.levels.length;
            achievement = generator.achievs[aid];
            item.cachiev += (achievement ? +achievement.confirmed_level : 0);
        }
        item.pachiev = item.cachiev / (item.tachiev || 1);

        // Add the event if it has at least one achievement
        if (!item.tachiev) continue;
        allEvents[item.id] = item;

        let collects = collectionsByEvent[eid] || [];
        item.tcollect = item.ccollect = 0;
        for (let cid of collects) {
            let collection = collections[cid];
            let pieces = gui.getArrayOfInt(collection.pieces);
            item.tcollect += pieces.length;
            for (let pid of pieces)
                if (artifacts.includes(pid)) ++item.ccollect;
        }
        item.pcollect = item.ccollect / (item.tcollect || 1);

        let locations = gui.getArrayOfInt(event.locations);
        let xlo = gui.getArrayOfInt(event.extended_locations);
        for (let lid of xlo) {
            if (!locations.includes(lid)) locations.push(lid);
        }
        locations = locations.filter(lid => {
            let location = locations0[lid];
            // Additional check
            if (+location.req_quest_a == 1) {
                xlo = xlo.filter(id => id != lid);
                return false;
            }
            return true;
        });
        // Segmented events have at least one reward specific to a region
        item.segmented = !!event.reward.find(reward => +reward.region_id > 0);
        let rep = locations.filter(lid => {
            let location = locations0[lid];
            // Additional check
            if (+location.req_quest_a == 1) {

            }
            // Segmented events have an override for completion bonus
            if (location.overrides && location.overrides.length) item.segmented = true;
            if (location && +location.reset_cd > 0) {
                xlo = xlo.filter(id => id != lid);
                return true;
            }
        });
        item.locations = locations.length;
        item.repeatables = rep.length;
        item.challenges = xlo.length;
        item.maps = item.locations - item.repeatables - item.challenges;

        // If event has no locations, we remove the quests
        // This should affect only postcard special weeks
        if (!item.locations) item.tquest = item.cquest = item.pquest = 0;

        item.segmented = item.segmented ? eventsRegion[eid] || 0 : -1;
    }

    selectYear.innerHTML = '';
    selectYear.appendChild(document.createElement('option'));
    let lastYear = null;
    let items = Object.values(allEvents).sort((a, b) => a.year - b.year);
    for (let item of items) {
        if (item.year && item.yeartxt !== lastYear) {
            lastYear = item.yeartxt;
            let option = document.createElement('option');
            option.value = lastYear;
            option.innerText = lastYear;
            selectYear.appendChild(option);
        }
    }

    refresh();
}

function getState() {
    return {
        show: selectShow.value,
        year: selectYear.value,
        segmented: selectSegmented.value,
        shop: selectShop.value,
        search: searchInput.value,
        sort: gui.getSortState(smartTable)
    };
}

function setState(state) {
    state.show = gui.setSelectState(selectShow, state.show);
    state.year = gui.setSelectState(selectYear, state.year);
    state.segmented = gui.setSelectState(selectSegmented, state.segmented);
    state.shop = gui.setSelectState(selectShop, state.shop);
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
    let show = state.show;
    let year = state.year;
    let not_segmented = state.segmented ? state.segmented == 'no' : NaN;
    let not_shop = state.shop ? state.shop == 'no' : NaN;
    let fnSearch = gui.getSearchFilter(state.search);
    let now = gui.getUnixTime();

    function isVisible(item) {
        if (fnSearch && !fnSearch(item.name)) return false;
        if (show == 'active' && item.end < now) return false;
        if (show == 'rerelease' && !item.start) return false;
        let status = '';
        if (item.cquest == 0 && item.cachiev == 0 && item.ccollect == 0) status = 'notdone';
        else if (item.tquest == item.cquest && item.tachiev == item.cachiev && item.tcollect == item.ccollect) status = 'complete';
        else status = 'incomplete';
        if ((show == 'complete' || show == 'incomplete' || show == 'notdone') && show != status) return false;
        if (year && item.yeartxt != year) return false;
        if (not_segmented == (item.segmented >= 0)) return false;
        let inShop = item.gems > 0;
        if (not_shop == inShop) return false;
        return true;
    }

    let items = Object.values(allEvents);
    let total = items.length;
    items = items.filter(isVisible);
    Array.from(container.querySelectorAll('.events tfoot td')).forEach(cell => {
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
            row.setAttribute('data-eid', item.id);
            row.setAttribute('height', 44);
            row.setAttribute('lazy-render', '');
        }
        tbody.appendChild(row);
    }
    gui.collectLazyElements(tbody);
    smartTable.syncLater();
}

function updateRow(row) {
    let id = row.getAttribute('data-eid');
    let item = allEvents[id];
    let htm = '';
    let img = item.img && Html `<img src="${item.img}" title="${item.name}" style="height:32px" class="tooltip-event">`;
    htm += Html.br `<td>${img}</td>`;
    htm += Html.br `<td>${item.name}</td>`;
    htm += Html.br `<td>${item.year ? Locale.formatYear(item.year) : ''}</td>`;
    img = '';
    if (item.segmented > 0) {
        img = gui.getObjectImg('region', item.segmented, 24);
    } else if (item.segmented == 0) {
        img = Html.br `<img src="/img/gui/check_yes.png" height="24">`;
    }
    // if (img) img = Html.raw(img.toString().replace('>', ' class="outlined">'));
    htm += Html.br `<td>${img}</td>`;
    if (item.gems) {
        htm += Html.br `<td class="cost">${Locale.formatNumber(item.gems)}${gui.getObjectImg('material', 2, 18, true)}</td>`;
    } else {
        htm += Html.br `<td></td>`;
    }
    htm += Html.br `<td class="date">${item.start ? Locale.formatDate(item.start) + '\n' + Locale.formatTime(item.start) : ''}</td>`;
    htm += Html.br `<td class="date">${item.end ? Locale.formatDate(item.end) + '\n' + Locale.formatTime(item.end) : ''}</td>`;

    if (item.tquest) {
        htm += Html.br `<td class="add_slash">${Locale.formatNumber(item.cquest)}</td>`;
        htm += Html.br `<td class="no_right_border">${Locale.formatNumber(item.tquest)}</td>`;
        htm += Html.br `<td><img src="/img/gui/quest_ok.png" class="${item.pquest < 1 ? 'incomplete' : ''}"></td>`;
    } else {
        htm += Html.br `<td colspan="3"></td>`;
    }

    if (item.tachiev) {
        htm += Html.br `<td class="add_slash">${Locale.formatNumber(item.cachiev)}</td>`;
        htm += Html.br `<td class="no_right_border">${Locale.formatNumber(item.tachiev)}</td>`;
        htm += Html.br `<td><img src="/img/gui/achiev_ok.png" class="${item.pachiev < 1 ? 'incomplete' : ''}"></td>`;
    } else {
        htm += Html.br `<td colspan="3"></td>`;
    }

    if (item.tcollect) {
        htm += Html.br `<td class="add_slash">${Locale.formatNumber(item.ccollect)}</td>`;
        htm += Html.br `<td class="no_right_border">${Locale.formatNumber(item.tcollect)}</td>`;
        htm += Html.br `<td><img src="/img/gui/treasure_ok.png" class="${item.pcollect < 1 ? 'incomplete' : ''}"></td>`;
    } else {
        htm += Html.br `<td colspan="3"></td>`;
    }

    if (item.locations) {
        htm += Html.br `<td>${Locale.formatNumber(item.locations)}</td>`;
        htm += Html.br `<td>${Locale.formatNumber(item.maps)}</td>`;
        htm += Html.br `<td>${Locale.formatNumber(item.challenges)}</td>`;
        htm += Html.br `<td>${Locale.formatNumber(item.repeatables)}</td>`;
    } else {
        htm += Html.br `<td colspan="4"></td>`;
    }
    htm += Html.br `<td class="materials">`;
    let numMaterials = item.materials.length || 1;
    let breakIndex = numMaterials >= 5 ? Math.ceil(numMaterials / 2) : -1;
    let size = Math.max(21, Math.min(32, Math.floor(96 / numMaterials)));
    item.materials.forEach((matId, index) => {
        if (index == breakIndex) htm += `<br>`;
        htm += gui.getObjectImg(matId > 0 ? 'material' : 'token', Math.abs(matId), size, true, 'desc');
    });
    htm += Html.br `</td>`;
    row.innerHTML = htm;
}

function onTooltip(event) {
    let element = event.target;
    element.removeAttribute('title');
    let eid = parseInt(element.parentNode.parentNode.getAttribute('data-eid'));
    let item = allEvents[eid];
    let img1 = gui.getGenerator().cdn_root + 'mobile/graphics/map/webgl_events/' + item.img_webgl + '.png';
    let img2 = item.img_full == 'default' ? '' : gui.getGenerator().cdn_root + 'mobile/graphics/all/' + item.img_full + '.png';
    let img = item.img_missing ? img2 : img1;
    let imgFull = img && Html `<img src="${img}" class="full">`;
    let htm = Html.br `<div class="events-tooltip"><img src="${item.img}"}" class="outlined"/>${imgFull}<span>${item.name}</span></div>`;
    Tooltip.show(element, htm, 'e');
    if (img == img1) Tooltip.tip.querySelector('img.full').addEventListener('error', function () {
        if (img2) this.src = img2;
        else this.style.display = 'none';
        item.img_missing = true;
    });
}