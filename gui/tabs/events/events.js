/*global gui SmartTable HtmlBr Locale*/
export default {
    hasCSS: true,
    init: init,
    update: update,
    getState: getState,
    setState: setState,
    requires: ['materials', 'events', 'achievements', 'collections', 'locations_0']
};

let tab, container, smartTable, searchInput, searchHandler, selectShow, selectYear, selectShop;
let allEvents;

function init() {
    tab = this;
    container = tab.container;

    selectShow = container.querySelector('[name=show]');
    selectShow.addEventListener('change', refresh);

    selectYear = container.querySelector('[name=year]');
    selectYear.addEventListener('change', refresh);

    selectShop = container.querySelector('[name=shop]');
    selectShop.addEventListener('change', refresh);

    searchInput = container.querySelector('[name=search]');
    searchInput.addEventListener('input', () => triggerSearchHandler(true));

    smartTable = new SmartTable(container.querySelector('.data'));
    smartTable.onSort = refresh;
    smartTable.fixedHeader.parentNode.classList.add('events');
    smartTable.fixedFooter.parentNode.classList.add('events');
    smartTable.tbody[0].addEventListener('render', function(event) {
        updateRow(event.target);
    });
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
        let end = +event.end || 0;
        if (!end && eid == 14) end = 1393326000;
        if (!end && eid == 15) end = 1395745200;
        item.start = (edata && +edata.started) || NaN;
        item.end = (edata && +edata.finished) || end;
        // compute the year as END - 14 days
        item.year = end - 14 * 86400;
        item.yeartxt = Locale.formatYear(item.year);

        let quests = gui.getArrayOfInt(event.quests);
        if (!quests.length) continue;
        item.tquest = quests.length;
        item.cquest = 0;
        for (let qid of quests) {
            if (questsFinished.includes(qid)) ++item.cquest;
        }
        item.pquest = item.cquest / (item.tquest || 1);

        item.materials = materialsByEvent[eid] || [];

        let achievs = achievementsByEvent[eid] || [];
        item.tachiev = item.cachiev = 0;
        for (let aid of achievs) {
            let achievement = achievements[aid];
            item.tachiev += achievement.levels.length;
            achievement = generator.achievs[aid];
            item.cachiev += (achievement ? +achievement.confirmed_level : 0);
        }
        item.pachiev = item.cachiev / (item.tachiev || 1);

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
        let rep = locations.filter(lid => {
            let location = locations0[lid];
            if (location && +location.reset_cd > 0) {
                xlo = xlo.filter(id => id != lid);
                return true;
            }
        });
        item.locations = locations.length;
        item.repeatables = rep.length;
        item.challenges = xlo.length;
        item.maps = item.locations - item.repeatables - item.challenges;

        if (item.locations && item.tachiev) allEvents[item.id] = item;
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
        shop: selectShop.value,
        search: searchInput.value,
        sort: gui.getSortState(smartTable)
    };
}

function setState(state) {
    state.show = gui.setSelectState(selectShow, state.show);
    state.year = gui.setSelectState(selectYear, state.year);
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
    let not_shop = state.shop ? state.shop == 'no' : NaN;
    let search = (state.search || '').toUpperCase();
    let now = gui.getUnixTime();

    function isVisible(item) {
        if (search && item.name.toUpperCase().indexOf(search) < 0) return false;
        if (show == 'active' && item.end < now) return false;
        if (show == 'rerelease' && !item.start) return false;
        let status = '';
        if (item.cquest == 0 && item.cachiev == 0 && item.ccollect == 0) status = 'notdone';
        else if (item.tquest == item.cquest && item.tachiev == item.cachiev && item.tcollect == item.ccollect) status = 'complete';
        else status = 'incomplete';
        if ((show == 'complete' || show == 'incomplete' || show == 'notdone') && show != status) return false;
        if (year && item.yeartxt != year) return false;
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
    let img = gui.getObjectImg('event', item.id, 32, false, true);
    if (img == '' && item.materials.length == 1) img = gui.getObjectImg('material', item.materials[0], 32, false);
    htm += HtmlBr `<td>${img}</td>`;
    htm += HtmlBr `<td colspan="2">${item.name}<div class="year">${item.year ? Locale.formatYear(item.year) : ''}</div></td>`;
    if (item.gems) {
        htm += HtmlBr `<td class="cost">${Locale.formatNumber(item.gems)}${gui.getObjectImg('material', 2, 18, true)}</td>`;
    } else {
        htm += HtmlBr `<td></td>`;
    }
    htm += HtmlBr `<td class="date">${item.start ? Locale.formatDate(item.start) + '\n' + Locale.formatTime(item.start) : ''}</td>`;
    htm += HtmlBr `<td class="date">${item.end ? Locale.formatDate(item.end) + '\n' + Locale.formatTime(item.end) : ''}</td>`;
    htm += HtmlBr `<td>${Locale.formatNumber(item.cquest)}</td>`;
    htm += HtmlBr `<td>${Locale.formatNumber(item.tquest)}</td>`;
    htm += HtmlBr `<td><img src="/img/gui/quest_ok.png" class="${item.pquest < 1 ? 'incomplete' : ''}"></td>`;

    if (item.tachiev) {
        htm += HtmlBr `<td>${Locale.formatNumber(item.cachiev)}</td>`;
        htm += HtmlBr `<td>${Locale.formatNumber(item.tachiev)}</td>`;
        htm += HtmlBr `<td><img src="/img/gui/achiev_ok.png" class="${item.pachiev < 1 ? 'incomplete' : ''}"></td>`;
    } else {
        htm += HtmlBr `<td></td><td></td><td></td>`;
    }

    if (item.tcollect) {
        htm += HtmlBr `<td>${Locale.formatNumber(item.ccollect)}</td>`;
        htm += HtmlBr `<td>${Locale.formatNumber(item.tcollect)}</td>`;
        htm += HtmlBr `<td><img src="/img/gui/treasure_ok.png" class="${item.pcollect < 1 ? 'incomplete' : ''}"></td>`;
    } else {
        htm += HtmlBr `<td></td><td></td><td></td>`;
    }

    htm += HtmlBr `<td>${Locale.formatNumber(item.locations)}</td>`;
    htm += HtmlBr `<td>${Locale.formatNumber(item.maps)}</td>`;
    htm += HtmlBr `<td>${Locale.formatNumber(item.challenges)}</td>`;
    htm += HtmlBr `<td>${Locale.formatNumber(item.repeatables)}</td>`;
    htm += HtmlBr `<td>`;
    for (let matId of item.materials) {
        htm += gui.getObjectImg('material', matId, 32, true, 'desc');
    }
    htm += HtmlBr `</td>`;
    row.innerHTML = htm;
}