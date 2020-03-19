/*global bgp gui SmartTable Html Locale Tooltip Dialog*/
export default {
    hasCSS: true,
    init: init,
    update: update,
    getState: getState,
    setState: setState,
    requires: ['materials', 'events', 'achievements', 'collections', 'locations_0', 'quests', 'decorations', 'buildings', 'tokens', 'usables', 'artifacts']
};

const infos = ['qst', 'ach', 'tre', 'loc'];
const PREFIX_HILIGHT = 'hilight-';
const PREFIX_SET = 'set-';

let tab, container, smartTable, searchInput, searchHandler, selectShow, selectYear, selectSegmented, selectShop, selectRegion;
let allEvents, trInfo, fixedBody, tbodyInfo, trRegion;
let selectedRegion, selectedInfo, selectedEventId;

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

    selectRegion = container.querySelector('[name=region]');
    selectRegion.addEventListener('change', refreshRegion);

    trRegion = container.querySelector('.trRegion');

    container.querySelector('[name=close]').addEventListener('click', () => {
        selectedEventId = selectedInfo = null;
        showInfo();
    });

    searchInput = container.querySelector('[name=search]');
    searchInput.addEventListener('input', () => triggerSearchHandler(true));

    smartTable = new SmartTable(container.querySelector('.data'));
    smartTable.onSort = refresh;
    smartTable.fixedHeader.parentNode.classList.add('events');
    smartTable.fixedFooter.parentNode.classList.add('events');
    const tbody = smartTable.tbody[0];
    tbody.addEventListener('render', function (event) {
        updateRow(event.target);
    });
    tbody.addEventListener('click', onClick);
    tbody.addEventListener('mouseover', onmousemove);
    tbody.addEventListener('mouseout', onmousemove);
    tbody.addEventListener('mouseleave', onmousemove);
    smartTable.fixedHeader.parentNode.addEventListener('click', onClick);
    smartTable.fixedHeader.parentNode.addEventListener('mouseover', onmousemove);
    smartTable.fixedHeader.parentNode.addEventListener('mouseout', onmousemove);
    smartTable.fixedHeader.parentNode.addEventListener('mouseleave', onmousemove);

    container.addEventListener('tooltip', onTooltip);
}

function onmousemove(event) {
    let el = event.target;
    let row = null;
    let classNames = {};
    infos.forEach(k => classNames[k] = false);
    while (el.tagName != 'TABLE') {
        if (el.tagName == 'TD') Array.from(el.classList).filter(k => k in classNames).forEach(k => classNames[k] = true);
        if (el.tagName == 'TR') row = el;
        el = el.parentNode;
    }
    for (const r of el.querySelectorAll('tr')) {
        const fn = r == row ? k => r.classList.toggle(PREFIX_HILIGHT + k, classNames[k]) : k => r.classList.remove(PREFIX_HILIGHT + k);
        Object.keys(classNames).forEach(fn);
    }
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

function addOption(select, value, text) {
    const option = document.createElement('option');
    option.value = value;
    option.innerText = text;
    select.appendChild(option);
}

function update() {
    const state = getState();
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

        const quests = getQuests(event);
        if (!quests.length) continue;
        item.tquest = quests.length;
        item.cquest = 0;
        for (const quest of quests) {
            if (questsFinished.includes(+quest.def_id)) ++item.cquest;
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
        let rep = locations.filter(lid => {
            let location = locations0[lid];
            // Additional check
            if (+location.req_quest_a == 1) {
                return false;
            }
            // Segmented events have an override for completion bonus
            // if (Array.isArray(location.overrides)) item.maxsegment = location.overrides.reduce((max, obj) => Math.max(max, +obj.region_id), item.maxsegment);
            if (location && +location.reset_cd > 0) {
                xlo = xlo.filter(id => id != lid);
                return true;
            }
        });
        item.loc_qst = locations.filter(lid => !(rep.includes(lid) || xlo.includes(lid)));
        item.loc_rep = rep;
        item.loc_xlo = xlo;
        item.locations = locations.length;
        item.repeatables = rep.length;
        item.challenges = xlo.length;
        item.maps = item.locations - item.repeatables - item.challenges;

        if (item.cquest == 0 && item.cachiev == 0 && item.ccollect == 0) item.status = 'notdone';
        else if (item.tquest == item.cquest && item.tachiev == item.cachiev && item.tcollect == item.ccollect) item.status = 'complete';
        else item.status = 'incomplete';

        // Segmented events: check event's rewards
        item.maxsegment = event.reward.reduce((max, obj) => Math.max(max, +obj.region_id), 0);
        // and quests's rewards
        for (const quest of quests) item.maxsegment = quest.reward.reduce((max, obj) => Math.max(max, +obj.region_id), item.maxsegment);

        item.issegmented = item.maxsegment > 1;
        item.segmented = item.issegmented ? eventsRegion[eid] || 0 : -1;
    }

    Dialog.htmlToDOM(selectYear, '');
    addOption(selectYear, '', '');
    let lastYear = null;
    let items = Object.values(allEvents).sort((a, b) => b.year - a.year);
    for (let item of items) {
        if (item.year && item.yeartxt !== lastYear) {
            lastYear = item.yeartxt;
            addOption(selectYear, lastYear, lastYear);
        }
    }

    setState(state);

    refresh();
}

function getState() {
    return {
        show: selectShow.value,
        year: allEvents ? selectYear.value : selectYear.getAttribute('data-value'),
        segmented: selectSegmented.value,
        shop: selectShop.value,
        region: selectedRegion || null,
        event: selectedEventId || null,
        info: selectedInfo,
        search: searchInput.value,
        sort: gui.getSortState(smartTable)
    };
}

function setState(state) {
    state.show = gui.setSelectState(selectShow, state.show);
    state.segmented = gui.setSelectState(selectSegmented, state.segmented);
    state.shop = gui.setSelectState(selectShop, state.shop);
    if (allEvents) state.year = gui.setSelectState(selectYear, state.year);
    selectYear.setAttribute('data-value', state.year);
    selectedRegion = Math.min(gui.getMaxRegion(), Math.max(0, +state.region || 0));
    selectedEventId = parseInt(state.event) || null;
    let info = (state.info || '').toLowerCase();
    if (!infos.includes(info)) info = '';
    state.info = selectedInfo = info;
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
        if ((show == 'complete' || show == 'incomplete' || show == 'notdone') && show != item.status) return false;
        if (year && item.yeartxt != year) return false;
        if (not_segmented == item.issegmented) return false;
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
    Dialog.htmlToDOM(tbody, '');
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

    showInfo();

    smartTable.syncLater();
}

function updateRow(row) {
    let id = row.getAttribute('data-eid');
    let item = allEvents[id];
    let htm = '';
    let img = item.img && Html`<img src="${item.img}" title="${item.name}" style="height:32px" class="tooltip-event">`;
    htm += Html.br`<td>${img}</td>`;
    htm += Html.br`<td>${item.name}</td>`;
    htm += Html.br`<td>${item.year ? Locale.formatYear(item.year) : ''}</td>`;
    img = '';
    if (item.issegmented) {
        img = item.segmented == 0 ? Html.br`<img src="/img/gui/check_yes.png" height="24">` : gui.getObjectImg('region', item.segmented, 24);
    }
    // if (img) img = Html.raw(img.toString().replace('>', ' class="outlined">'));
    htm += Html.br`<td>${img}</td>`;
    if (item.gems) {
        htm += Html.br`<td class="cost">${Locale.formatNumber(item.gems)}${gui.getObjectImg('material', 2, 18, true)}</td>`;
    } else {
        htm += Html.br`<td></td>`;
    }
    htm += Html.br`<td class="date">${item.start ? Locale.formatDate(item.start) + '\n' + Locale.formatTime(item.start) : ''}</td>`;
    htm += Html.br`<td class="date">${item.end ? Locale.formatDate(item.end) + '\n' + Locale.formatTime(item.end) : ''}</td>`;

    if (item.tquest) {
        htm += Html.br`<td class="qst add_slash">${Locale.formatNumber(item.cquest)}</td>`;
        htm += Html.br`<td class="qst no_right_border">${Locale.formatNumber(item.tquest)}</td>`;
        htm += Html.br`<td class="qst">${item.locations ? Html.br`<img src="/img/gui/quest_ok.png" class="${item.pquest < 1 ? 'incomplete' : ''}">` : ''}</td>`;
    } else {
        htm += Html.br`<td colspan="3"></td>`;
    }

    if (item.tachiev) {
        htm += Html.br`<td class="ach add_slash">${Locale.formatNumber(item.cachiev)}</td>`;
        htm += Html.br`<td class="ach no_right_border">${Locale.formatNumber(item.tachiev)}</td>`;
        htm += Html.br`<td class="ach"><img src="/img/gui/achiev_ok.png" class="${item.pachiev < 1 ? 'incomplete' : ''}"></td>`;
    } else {
        htm += Html.br`<td colspan="3"></td>`;
    }

    if (item.tcollect) {
        htm += Html.br`<td class="tre add_slash">${Locale.formatNumber(item.ccollect)}</td>`;
        htm += Html.br`<td class="tre no_right_border">${Locale.formatNumber(item.tcollect)}</td>`;
        htm += Html.br`<td class="tre"><img src="/img/gui/treasure_ok.png" class="${item.pcollect < 1 ? 'incomplete' : ''}"></td>`;
    } else {
        htm += Html.br`<td colspan="3"></td>`;
    }

    if (item.locations) {
        htm += Html.br`<td class="loc">${Locale.formatNumber(item.locations)}</td>`;
        htm += Html.br`<td class="loc">${Locale.formatNumber(item.maps)}</td>`;
        htm += Html.br`<td class="loc">${Locale.formatNumber(item.challenges)}</td>`;
        htm += Html.br`<td class="loc">${Locale.formatNumber(item.repeatables)}</td>`;
    } else {
        htm += Html.br`<td colspan="4"></td>`;
    }
    htm += Html.br`<td class="materials">`;
    let numMaterials = item.materials.length || 1;
    let breakIndex = numMaterials >= 5 ? Math.ceil(numMaterials / 2) : -1;
    let size = Math.max(21, Math.min(32, Math.floor(96 / numMaterials)));
    item.materials.forEach((matId, index) => {
        if (index == breakIndex) htm += `<br>`;
        htm += gui.getObjectImg(matId > 0 ? 'material' : 'token', Math.abs(matId), size, true, 'desc');
    });
    htm += Html.br`</td>`;
    Dialog.htmlToDOM(row, htm);
}

function onTooltip(event) {
    let element = event.target;
    element.removeAttribute('title');
    let eid = parseInt(element.parentNode.parentNode.getAttribute('data-eid'));
    let item = allEvents[eid];
    let img1 = gui.getGenerator().cdn_root + 'mobile/graphics/map/webgl_events/' + item.img_webgl + '.png';
    let img2 = item.img_full == 'default' ? '' : gui.getGenerator().cdn_root + 'mobile/graphics/all/' + item.img_full + '.png';
    let img = item.img_missing ? img2 : img1;
    let imgFull = img && Html`<img src="${img}" class="full">`;
    let htm = Html.br`<div class="events-tooltip"><img src="${item.img}"}" class="outlined"/>${imgFull}<span>${item.name}</span></div>`;
    Tooltip.show(element, htm, 'e');
    if (img == img1) Tooltip.tip.querySelector('img.full').addEventListener('error', function () {
        if (img2) this.src = img2;
        else this.style.display = 'none';
        item.img_missing = true;
    });
}

function refreshRegion() {
    selectedRegion = selectRegion.value;
    showInfo();
}

function onClick(e) {
    let row;
    for (var el = e.target; !row && el.tagName != 'TABLE'; el = el.parentNode)
        if (el.tagName == 'TR') row = el;
    if (!row) return;
    const info = infos.find(info => row.classList.contains(PREFIX_HILIGHT + info));
    if (!info) return;
    selectedInfo = info;
    selectedEventId = parseInt(row.getAttribute('data-eid'));
    showInfo();
}

function ensureSmartTableExtra() {
    fixedBody = smartTable.fixedHeader.parentNode.querySelector('tbody');
    if (!fixedBody) {
        fixedBody = document.createElement('tbody');
        smartTable.fixedHeader.parentNode.appendChild(fixedBody);
    }
    tbodyInfo = smartTable.tbody[1];
    if (!tbodyInfo) {
        tbodyInfo = document.createElement('tbody');
        smartTable.tbody[0].parentNode.appendChild(tbodyInfo);
        smartTable.tbody.push(tbodyInfo);
    }
    if (!trInfo) {
        trInfo = document.createElement('tr');
        trInfo.className = 'inforow';
        tbodyInfo.appendChild(trInfo);
    }
    fixedBody.style.display = tbodyInfo.style.display = 'none';
}

function showInfo() {
    const setRowsState = (display, visibility) => {
        for (const tr of smartTable.tbody[0].querySelectorAll('tr')) {
            tr.style.display = display;
            tr.style.visibility = visibility;
        }
    };

    const event = selectedEventId ? gui.getFile('events')[selectedEventId] : null;
    const row = selectedEventId && event ? smartTable.tbody[0].querySelector('tr[data-eid="' + selectedEventId + '"]') : null;

    ensureSmartTableExtra();
    if (trRegion.parentNode) trRegion.parentNode.removeChild(trRegion);
    for (const tr of smartTable.tbody[0].querySelectorAll('.trRegion')) tr.parentNode.removeChild(tr);

    if (!row) {
        fixedBody.style.display = tbodyInfo.style.display = 'none';
        smartTable.fixedFooter.style.display = smartTable.footer.style.display = '';
        setRowsState('', '');
        if (selectedEventId) selectedEventId = null;
    }

    gui.updateTabState(tab);
    if (!row) return;

    if (row.getAttribute('lazy-render') !== null) {
        row.removeAttribute('lazy-render');
        updateRow(row);
    }
    Dialog.htmlToDOM(fixedBody, '');
    const clone = row.cloneNode(true);
    for (const info of infos) clone.classList.remove(PREFIX_HILIGHT + info);
    clone.classList.add(PREFIX_SET + selectedInfo);
    fixedBody.appendChild(clone);
    fixedBody.appendChild(trRegion);
    fixedBody.style.display = tbodyInfo.style.display = '';
    smartTable.fixedFooter.style.display = smartTable.footer.style.display = 'none';
    setRowsState('none', 'hidden');
    row.style.display = '';
    row.style.visibility = '';
    row.parentNode.insertBefore(trRegion.cloneNode(true), row.nextSibling);

    const ticked = Html.br`<img width="24" src="/img/gui/ticked.png">`;
    const unticked = Html.br`<img width="24" src="/img/gui/unticked.png">`;

    let htm = '';
    htm += Html.br`<td colspan="21">`;

    const generator = gui.getGenerator();
    const item = allEvents[selectedEventId];
    let region = selectedRegion || 0;
    let showProgress = region == 0;

    Dialog.htmlToDOM(selectRegion, '');
    // Your progress
    let yourRegion = 1;
    if (item.issegmented) yourRegion = item.status == 'notdone' ? Math.min(+generator.region, item.maxsegment) : item.segmented || 1;
    let text = item.issegmented ? gui.getMessageAndValue('events_yourprogress', gui.getObjectName('region', yourRegion)) : gui.getMessage('events_yourprogress');
    if (item.status == 'notdone') text += ' (' + gui.getMessage('events_notdone') + ')';
    addOption(selectRegion, '', text);
    // List regions
    if (item.issegmented) {
        region = Math.min(region, item.maxsegment);
        for (let rid = 1; rid <= item.maxsegment; rid++) addOption(selectRegion, rid, gui.getObjectName('region', rid));
    } else {
        region = Math.min(region, 1);
        addOption(selectRegion, Math.max(selectedRegion, 1), gui.getMessage('events_notsegmented'));
    }
    selectRegion.value = selectedRegion || '';
    region = region || yourRegion;

    const getTotalRewards = (...arrRewards) => {
        const result = { max: 0 };
        const totals = {};
        for (const rewards of arrRewards) {
            result.max = Math.max(result.max, rewards.length);
            for (const reward of rewards) {
                reward.amount = +reward.amount || 0;
                const key = reward.type + '\t' + reward.object_id;
                const total = totals[key];
                if (total) total.amount += reward.amount; else totals[key] = Object.assign({}, reward);
            }
        }
        result.rewards = Object.values(totals);
        // A maximum of 5 rewards per row
        result.max = Math.min(5, Math.max(result.max, result.rewards.length));
        return result;
    };

    const showRewards = (rewards, maxNumRewards, rows = 1) => {
        let htm = '';
        for (const reward of rewards) {
            let n = ['artifact', 'material', 'token', 'usable', 'decoration', 'system', 'eventpass_xp'].indexOf(reward.type);
            if (n < 0) console.log(reward.type);
            reward._index = +reward.object_id + n * 1000000;
        }
        rewards.sort((a, b) => a._index - b._index);
        for (let i = 1; i <= maxNumRewards; i++) {
            htm += Html.br`<td rowspan="${rows}" class="rewards ${i < maxNumRewards ? 'no_right_border' : ''}">`;
            for (let j = i, prefix = ''; j <= rewards.length; j += maxNumRewards) {
                const reward = rewards[j - 1];
                const title = gui.getObjectName(reward.type, reward.object_id, 'info+desc');
                htm += prefix + `<span title="${title}">${Locale.formatNumber(+reward.amount)}<i>${gui.getObjectImg(reward.type, reward.object_id, null, true, 'none')}</i></span>`;
                prefix = '<br>';
            }
            htm += Html.br`</td>`;
        }
        return htm;
    };

    const showTotalRewards = (totalRewards, maxNumRewards, colSpan) => {
        let htm = '';
        htm += Html.br`<tfoot>`;
        htm += Html.br`<tr><td colspan="${colSpan}" class="final">${gui.getMessage('events_total')}</td>`;
        htm += showRewards(totalRewards, maxNumRewards);
        htm += Html.br`</tr>`;
        htm += Html.br`</tfoot>`;
        return htm;
    };

    // Quests
    if (selectedInfo == 'qst') {
        const questsFinished = gui.getArrayOfInt(generator.quests_f);
        const quests = getQuests(event).map(quest => {
            const copy = Object.assign({}, quest);
            copy.completed = questsFinished.includes(+quest.def_id);
            copy.rewards = gui.getArray(quest.reward).filter(reward => {
                const rid = +reward.region_id;
                return rid == 0 || rid == region;
            });
            return copy;
        });
        if (quests.length) {
            const rewards = gui.getArray(event.reward).filter(reward => {
                const rid = +reward.region_id;
                return rid == 0 || rid == region;
            });
            const { max: maxNumRewards, rewards: totalRewards } = getTotalRewards(rewards, ...quests.map(q => q.rewards));
            htm += Html.br`<table class="event-subtable event-quests">`;
            htm += Html.br`<thead><tr><th><img width="24" src="/img/gui/list.png"></th><th colspan="${showProgress ? 2 : 1}">${gui.getMessage('gui_quest')}</th>`;
            htm += Html.br`<th colspan="${maxNumRewards}">${gui.getMessage('events_rewards')}</th></tr></thead><tbody class="row-coloring">`;
            let found = 0;
            quests.forEach((quest, index) => {
                htm += Html.br`<tr>`;
                htm += Html.br`<td class="level">${Locale.formatNumber(index + 1)}</td>`;
                htm += Html.br`<td class="${showProgress ? 'no_right_border' : ''}">${bgp.Data.getString(quest.heading_text)}</td>`;
                if (quest.completed) found++;
                if (showProgress) htm += Html.br`<td>${quest.completed ? ticked : unticked}</td>`;
                htm += showRewards(quest.rewards, maxNumRewards);
                htm += Html.br`</tr>`;
            });
            htm += Html.br`<tr><td colspan="2" class="final ${showProgress ? 'no_right_border' : ''}">${gui.getMessage('events_finalreward')}</td>`;
            if (showProgress) htm += Html.br`<td>${found == quests.length ? ticked : unticked}</td>`;
            htm += showRewards(rewards, maxNumRewards);
            htm += Html.br`</tr>`;
            htm += Html.br`</tbody>`;
            htm += showTotalRewards(totalRewards, maxNumRewards, 2 + (showProgress ? 1 : 0));
            htm += Html.br`</table>`;
        }
    }

    // Achievements
    if (selectedInfo == 'ach') {
        const achievements = Object.values(gui.getFile('achievements')).filter(achievement => +achievement.event_id == selectedEventId);
        for (const achievement of achievements) {
            const levels = achievement.levels.map(level => {
                const copy = {};
                copy.level_id = +level.level_id;
                copy.amount = +level.amount;
                copy.rewards = gui.getArray(level.reward).filter(reward => {
                    const rid = +reward.region_id;
                    return rid == 0 || rid == region;
                });
                return copy;
            }).sort((a, b) => a.level_id - b.level_id);
            const achiev = generator.achievs[achievement.def_id];
            const a_level = achiev ? +achiev.level : 0;
            const a_progress = achiev ? +achiev.progress : 0;
            // eslint-disable-next-line no-unused-vars
            const { max: maxNumRewards, rewards: totalRewards } = getTotalRewards(...levels.map(l => l.rewards));
            const hasIcon = achievement.type == 'material' || achievement.type == 'token' || achievement.type == 'usable';
            htm += Html.br`<table class="event-subtable event-achievement">`;
            htm += Html.br`<thead><tr><th colspan="${maxNumRewards + 2 + (showProgress ? 2 : 0) + (hasIcon ? 1 : 0)}">${gui.getString(achievement.name_loc)}</th></tr>`;
            htm += Html.br`<tr>`;
            if (hasIcon) htm += Html.br`<th></th>`;
            htm += Html.br`<th><img width="24" src="/img/gui/list.png"></th><th colspan="${showProgress ? 3 : 1}">${gui.getMessage('progress_goal')}</th>`;
            htm += Html.br`<th colspan="${maxNumRewards}">${gui.getMessage('events_rewards')}</th></tr></thead><tbody class="row-coloring">`;
            for (const level of levels) {
                htm += Html.br`<tr>`;
                if (hasIcon && level.level_id == 1) {
                    htm += Html.br`<th class="icon" rowspan="${levels.length}">${gui.getObjectImg(achievement.type, achievement.object_id, null, false, 'desc')}</th>`;
                }
                htm += Html.br`<td class="level">${Locale.formatNumber(level.level_id)}</td>`;
                let progress = a_level == level.level_id ? a_progress : 0;
                let completed = false;
                if (showProgress) {
                    if (a_level > level.level_id || (a_level == level.level_id && a_progress >= level.amount)) {
                        progress = level.amount;
                        completed = true;
                    }
                    htm += Html.br`<td class="reached add_slash">${Locale.formatNumber(progress)}</td>`;
                }
                htm += Html.br`<td class="${showProgress ? 'target no_right_border' : 'goal'}">${Locale.formatNumber(level.amount)}</td>`;
                if (showProgress) htm += Html.br`<td>${completed ? ticked : unticked}</td>`;
                htm += showRewards(level.rewards, maxNumRewards);
                htm += Html.br`</tr>`;
            }
            htm += Html.br`</tbody>`;
            // htm += showTotalRewards(totalRewards, maxNumRewards, 3 + (showProgress ? 2 : 0));
            htm += Html.br`</table>`;
        }
    }

    // Treasure pieces
    if (selectedInfo == 'tre') {
        const collections = Object.values(gui.getFile('collections')).filter(col => +col.event_id == selectedEventId);
        const artifacts = gui.getFile('artifacts');
        const piecesFound = gui.getArrayOfInt(generator.artifacts);
        const locations = gui.getFile('locations_0');
        for (const col of collections) {
            const pieces = gui.getArrayOfInt(col.pieces).map((piece, index) => {
                const artifact = artifacts[piece];
                const rewards = [{ type: 'artifact', object_id: piece, amount: 1 }];
                const amount = +artifact.eventpass_xp;
                if (amount) rewards.push({ type: 'eventpass_xp', object_id: 1, amount });
                return Object.assign({}, artifact, { index: index + 1, rewards });
            });
            const rewards = gui.getArray(col.reward).filter(reward => {
                const rid = +reward.region_id;
                return rid == 0 || rid == region;
            }).sort((a, b) => a.type == 'decoration' ? -1 : (b.type == 'decoration' ? 1 : 0));
            const maxNumRewards = Math.max(2, rewards.length);
            htm += Html.br`<table class="event-subtable event-treasure">`;
            htm += Html.br`<thead><tr><th colspan="${maxNumRewards + 2 + (showProgress ? 1 : 0) + 1}">${gui.getString(col.name_loc)}</th></tr>`;
            htm += Html.br`<tr>`;
            htm += Html.br`<th></th>`;
            htm += Html.br`<th><img width="24" src="/img/gui/list.png"></th><th colspan="${showProgress ? 2 : 1}">${gui.getMessage('gui_location')}</th>`;
            htm += Html.br`<th colspan="${maxNumRewards}">${gui.getMessage('events_rewards')}</th></tr></thead><tbody class="row-coloring">`;
            let found = 0;
            for (const piece of pieces) {
                htm += Html.br`<tr>`;
                if (piece.index == 1) {
                    htm += Html.br`<th class="icon" rowspan="${pieces.length + 1}">${gui.getObjectImg('collection', col.def_id, null, false, 'desc')}</th>`;
                }
                htm += Html.br`<td class="level">${Locale.formatNumber(piece.index)}</td>`;
                const loc = locations[piece.found_in];
                htm += Html.br`<td class="${showProgress ? 'no_right_border' : ''}">${gui.getString(loc.name_loc)}</td>`;
                const completed = piecesFound.includes(+piece.def_id);
                if (completed) found++;
                if (showProgress) htm += Html.br`<td>${completed ? ticked : unticked}</td>`;
                htm += showRewards(piece.rewards, maxNumRewards);
                htm += Html.br`</tr>`;
            }
            htm += Html.br`<tr><td colspan="2" class="final ${showProgress ? 'no_right_border' : ''}">${gui.getMessage('events_finalreward')}</td>`;
            if (showProgress) htm += Html.br`<td>${found == pieces.length ? ticked : unticked}</td>`;
            htm += showRewards(rewards, maxNumRewards);
            htm += Html.br`</tr>`;
            htm += Html.br`</tbody></table>`;
        }
    }

    // Locations
    if (selectedInfo == 'loc') {
        const locations = gui.getFile('locations_0');
        const loc_prog = generator.loc_prog || {};
        const showLocations = (locs, title, isRepeatables) => {
            if (!locs.length) return;
            locs = locs.map(lid => {
                const location = locations[lid];
                const ovr = location.overrides && location.overrides.find(ovr => +ovr.region_id == region);
                const clearXp = ovr ? +ovr.override_reward_exp : +location.reward_exp;
                const eventpassXp = +location.eventpass_xp;
                const rewards = [{ type: 'system', object_id: 1, amount: clearXp }];
                if (eventpassXp) rewards.push({ type: 'eventpass_xp', object_id: 1, amount: eventpassXp });
                const loc = Object.assign({}, location);
                loc.rewards = rewards;
                return loc;
            });
            const { max: maxNumRewards, rewards: totalRewards } = getTotalRewards(...locs.map(l => l.rewards));
            htm += Html.br`<table class="event-subtable event-locations">`;
            htm += Html.br`<thead><tr><th>${title}</th>`;
            htm += Html.br`<th colspan="${showProgress ? 3 : 1}">${gui.getMessage('events_tiles')}</th>`;
            if (isRepeatables) htm += Html.br`<th>${gui.getMessage('events_chance')}</th><th>${gui.getMessage('repeat_cooldown')}</th>`;
            htm += Html.br`<th colspan="${maxNumRewards}">${gui.getMessage('events_clearbonus')}</th></tr></thead>`;
            htm += Html.br`<tbody class="${isRepeatables ? '' : 'row-coloring'}">`;
            let isOdd = false;
            for (const loc of locs) {
                const lid = loc.def_id;
                const tiles = +loc.progress;
                const prog = loc_prog[lid];
                const mined = (prog && +prog.prog) || 0;
                const lastFloorLevel = (prog && +prog.lvl) || 0;
                let completed = mined >= tiles;

                let floors = isRepeatables ? Object.values(loc.rotation) : [];
                const chance = floors.reduce((sum, floor) => sum + +floor.chance, 0);
                floors = floors.map(floor => {
                    const clone = Object.assign({}, floor);
                    clone.chance = +clone.chance;
                    clone.chance = clone.chance == chance ? 100 : Math.floor(clone.chance * 100 / chance);
                    return clone;
                }).filter(floor => floor.chance > 0).map(floor => {
                    let htm = '';
                    const isCurrentFloor = +floor.level == lastFloorLevel;
                    const tiles = +floor.progress;
                    const isCompleted = mined >= tiles;
                    if (isCurrentFloor) completed = isCompleted;
                    if (showProgress) htm += Html.br`<td class="reached${isCurrentFloor ? ' add_slash' : ' no_right_border'}">${isCurrentFloor ? Locale.formatNumber(mined) : ''}</td>`;
                    htm += Html.br`<td class="${showProgress ? 'target no_right_border' : 'goal'}">${Locale.formatNumber(tiles)}</td>`;
                    if (showProgress) htm += Html.br`<td>${isCurrentFloor ? (isCompleted ? ticked : unticked) : ''}</td>`;
                    htm += Html.br`<td class="chance">${Locale.formatNumber(+floor.chance)} %</td>`;
                    floor.htm = htm;
                    return floor;
                });
                const rows = isRepeatables ? floors.length : 1;

                isOdd = !isOdd;
                htm += Html.br`<tr class="${isRepeatables ? (isOdd ? 'odd' : 'even') : ''} ${isRepeatables && lid != locs[0] ? 'separator' : ''}">`;
                htm += Html.br`<td rowspan="${rows}" class="${showProgress ? (completed ? 'completed' : 'not-completed') : ''}">${gui.getLocationImg(loc)}<div class="location_name">${Html(gui.getString(loc.name_loc))}</div></td>`;
                if (isRepeatables) {
                    // Fix chance
                    htm += floors.shift().htm;
                    htm += Html.br`<td rowspan="${rows}" class="reset">`;
                    htm += `<span>${gui.getDuration(+loc.reset_cd)}<i><img src="/img/gui/time.png"></i></span><br>`;
                    htm += `<span>${Locale.formatNumber(+loc.reset_gems)}<i>${gui.getObjectImg('material', 2, null, true, 'none')}</i></span>`;
                    htm += Html.br`</td>`;
                } else {
                    if (showProgress) htm += Html.br`<td class="reached add_slash">${Locale.formatNumber(mined)}</td>`;
                    htm += Html.br`<td class="${showProgress ? 'target no_right_border' : 'goal'}">${Locale.formatNumber(tiles)}</td>`;
                    if (showProgress) htm += Html.br`<td>${completed ? ticked : unticked}</td>`;
                }
                htm += showRewards(loc.rewards, maxNumRewards, rows);
                htm += Html.br`</tr>`;
                htm += floors.map(floor => Html.br`<tr class="${isRepeatables ? (isOdd ? 'odd' : 'even') : ''}">${Html.raw(floor.htm)}</tr>`).join('');
            }
            htm += Html.br`</tbody>`;
            if (!isRepeatables) htm += showTotalRewards(totalRewards, maxNumRewards, 2 + (showProgress ? 2 : 0));
            htm += Html.br`</table>`;
        };
        showLocations(item.loc_qst, gui.getMessage('events_story_maps'), false);
        showLocations(item.loc_xlo, gui.getMessage('events_challenges'), false);
        showLocations(item.loc_rep, gui.getMessage('events_repeatables'), true);
    }

    htm += Html.br`</td>`;
    Dialog.htmlToDOM(trInfo, htm);
}

function getQuests(event) {
    const quests = gui.getFile('quests');
    return gui.getArrayOfInt(event.quests).sort().map(qid => {
        const quest = quests[qid];
        // Quest must have the heading
        return quest && quest.heading_text ? quest : null;
    }).filter(quest => !!quest);
}