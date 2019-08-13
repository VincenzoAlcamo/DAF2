/*global gui Html Locale SmartTable*/

export default {
    hasCSS: true,
    init: init,
    update: update,
    getState: getState,
    setState: setState,
    requires: (function() {
        var requires = ['materials', 'tutorials', 'achievements', 'collections', 'levelups', 'map_filters'];
        for (let rid = gui.getMaxRegion(); rid > 0; rid--) requires.push('locations_' + rid);
        return requires;
    })()
};

const REGION_SEPARATOR = '_';

var tab, container, progress, checkCompleted, checkGroups, checkDates, checkEnergy, smartTable, show, levelSums, sliderLevel;
var imgCompleted = Html.br `<img width="24" src="/img/gui/tick.png"/>`;

function init() {
    tab = this;
    container = tab.container;

    checkCompleted = container.querySelector('[name="hidecompleted"]');
    checkCompleted.addEventListener('click', toggles);
    checkGroups = container.querySelector('[name="grouplocations"]');
    checkGroups.addEventListener('click', toggles);
    checkDates = container.querySelector('[name="showdates"]');
    checkDates.addEventListener('click', toggles);
    checkEnergy = container.querySelector('[name="showenergy"]');
    checkEnergy.addEventListener('click', toggles);

    container.querySelector('.progress_table tbody').addEventListener('click', onClickMain);

    progress = [];
    progress.push({
        id: 'level',
        icon: '/img/gui/trophy.png',
        label: gui.getMessage('gui_level'),
        calc: calcLevel
    });
    progress.push({
        id: 'achievements',
        icon: '/img/gui/medal.png',
        label: gui.getMessage('progress_achievements'),
        calc: calcAchievements
    });
    progress.push({
        id: 'treasures',
        icon: '/img/gui/chest.png',
        label: gui.getMessage('progress_treasures'),
        calc: calcCollection
    });
    for (let rid = 1; rid <= gui.getMaxRegion(); rid++)
        progress.push({
            id: 'region' + rid,
            rid: rid,
            icon: gui.getObjectImage('region', rid),
            label: gui.getObjectName('region', rid),
            calc: calcRegion
        });

    smartTable = new SmartTable(container.querySelector('.progress_table'));
    gui.setupScreenshot(smartTable.container, gui.getMessage('tab_progress'), container.querySelector('.screenshot'));
}

function getState() {
    return {
        hidecompleted: checkCompleted.checked,
        groups: checkGroups.checked,
        dates: checkDates.checked,
        energy: checkEnergy.checked,
        show: show
    };
}

function setState(state) {
    checkCompleted.checked = !!state.hidecompleted;
    checkGroups.checked = !!state.groups;
    checkDates.checked = !!state.dates;
    checkEnergy.checked = !!state.energy;
    show = state.show;
    let showInfo = getShowInfo(show);
    if (!progress.find(item => item.id == showInfo.id)) show = '';
}

function toggles() {
    gui.updateTabState(tab);
    refresh();
}

function update() {
    var rid = +gui.getGenerator().region;
    for (let item of progress) {
        item.calc(item);
        item.percent = item.max > 0 ? item.value / item.max * 100 : 0;
        item.isCompleted = item.value == item.max;
        item.isLocked = +item.rid > 0 && +item.rid > rid;
    }
    for (let element of container.querySelectorAll('.warning')) {
        element.innerText = gui.getMessage('gui_infodated', Locale.formatDateTime(gui.getGenerator().time));
    }
    refresh();
}

function getProgress(value, max, energy) {
    if (max == 0) {
        return Html.br `<td></td><td></td><td></td><td></td><td></td>`;
    }
    let htm = '';
    let percent = max > 0 ? (value / max * 100) : 0;
    let isCompleted = value == max;
    htm += Html.br `<td>${isCompleted ? imgCompleted : Locale.formatNumber(percent, 2) +'%'}</td>`;
    htm += Html.br `<td>${Locale.formatNumber(value)}</td>`;
    htm += Html.br `<td>${Locale.formatNumber(max)}</td>`;
    htm += Html.br `<td>${Locale.formatNumber(max - value)}</td>`;
    htm += Html.br `<td class="energy">${energy ? Locale.formatNumber(energy) : ''}</td>`;
    htm += Html.br `<td><progress value="${value}" max="${max}"></progress></td>`;
    return htm;
}

function getTimes(isCompleted, bt, et) {
    let htm = '';
    if (bt) {
        htm += Html.br `<td class="date">${Locale.formatDate(bt)}</td>`;
        htm += Html.br `<td class="date">${isCompleted && et ? Locale.formatDate(et) : ''}</td>`;
        htm += Html.br `<td class="date">${isCompleted && et ? gui.getDuration(et - bt, true) : ''}</td>`;
    } else {
        htm += Html.br `<td class="date" colspan="3"></td>`;
    }
    return htm;
}

function refresh() {
    var state = getState();
    var total = 0;
    var htm = '';
    for (let item of progress) {
        total += item.percent;
        htm += Html.br `<tr data-level="0" data-id="${item.id}" class="${!item.isCompleted || !state.hidecompleted ? 'inspect' : ''}">`;
        htm += Html.br `<td><img src="${item.isLocked ? '/img/gui/locked.png' : item.icon}"/></td>`;
        htm += Html.br `<td>${item.label.toUpperCase()}</td>`;
        htm += getProgress(item.value, item.max, item.energy);
        htm += getTimes(item.isCompleted, item.bt, item.et);
        htm += Html.br `</tr>`;
    }
    smartTable.table.querySelector('tbody').innerHTML = htm;
    container.classList.toggle('no-dates', !state.dates);
    container.classList.toggle('no-energy', !state.energy);

    var percent = total / progress.length;
    Array.from(smartTable.container.querySelectorAll('tfoot td:nth-child(2)')).forEach(cell => cell.innerText = Locale.formatNumber(percent, 2) + '%');
    Array.from(smartTable.container.querySelectorAll('tfoot td progress')).forEach(progress => progress.value = percent);

    showDetail(show);

    smartTable.syncLater();
}

function refreshPlayTime() {
    let now = new Date();
    let started = new Date(+gui.getGenerator().registered_on * 1000);
    let playing = Math.floor((now - started) / 1000);
    container.querySelector('.progress_playtime').innerText = gui.getMessage('progress_playTime', Locale.formatDateTime(started), gui.getDuration(playing), Locale.formatDateTime(now));
}

function setInspected(row, inspected) {
    let level = +row.getAttribute('data-level');
    var parent = row.parentNode;
    row.classList.toggle('inspected', inspected);
    var nextRow = row.nextSibling;
    while (nextRow && +nextRow.getAttribute('data-level') > level) {
        var temp = nextRow;
        nextRow = nextRow.nextSibling;
        parent.removeChild(temp);
    }
    while (nextRow && +nextRow.getAttribute('data-level') == level) {
        nextRow.classList.toggle('not-inspected', inspected);
        nextRow = nextRow.nextSibling;
    }
    nextRow = row.previousSibling;
    while (nextRow && +nextRow.getAttribute('data-level') == level) {
        nextRow.classList.toggle('not-inspected', inspected);
        nextRow = nextRow.previousSibling;
    }
}

function getShowInfo(show) {
    show = show || '';
    let id = show;
    let subId = null;
    let i = show.indexOf(REGION_SEPARATOR);
    if (i > 0) {
        id = show.substr(0, i);
        subId = +show.substr(i + 1) || 0;
    }
    let item = progress.find(item => item.id === id);
    if (!item) return {};
    if (subId && (!item.rows || !item.rows.find(sub => sub.seq === subId))) subId = null;
    return {
        id: id,
        subId: subId,
        show: id + (subId ? REGION_SEPARATOR + subId : '')
    };
}

function onClickMain(event) {
    var row = null;
    for (var node = event.target; node && !row; node = node.parentNode) {
        if (node.tagName == 'TABLE') break;
        if (node.tagName == 'TR') row = node;
    }
    if (!row || !row.classList.contains('inspect')) return;
    var level = +row.getAttribute('data-level');
    var showInfo = getShowInfo(row.getAttribute('data-id') || '');
    if (!showInfo.show) return;
    var parent = row.parentNode;
    if (row.classList.contains('inspected')) {
        show = '';
        gui.updateTabState(tab);
        setInspected(row, false);
        smartTable.sync();
        return;
    }

    var otherRow = parent.querySelector('tr.inspected[data-level="' + level + '"]');
    if (otherRow) setInspected(otherRow, false);

    show = showInfo.show;
    gui.updateTabState(tab);
    showDetail(show);
}

function showDetail(show) {
    refreshPlayTime();
    let showInfo = getShowInfo(show);
    if (!showInfo.show) return;

    let item = progress.find(item => item.id == showInfo.id);
    let row = smartTable.table.querySelector('tr[data-id="' + showInfo.show + '"]');
    if (!row && showInfo.subId) {
        showDetail(showInfo.id);
        row = smartTable.table.querySelector('tr[data-id="' + showInfo.show + '"]');
    }
    if (!row || !row.classList.contains('inspect')) return;

    let level = +row.getAttribute('data-level');

    smartTable.syncLater();
    if (item.id == 'level') return infoLevel(row);
    if (!item.rows) return;

    setInspected(row, true);

    let nextRow = row.nextSibling;
    let parent = row.parentNode;
    let state = getState();
    let hideCompleted = state.hidecompleted;
    let isOdd = false;
    let group = {};
    initGroupTotals(group.grandtotal = {});
    let url = gui.getGenerator().cdn_root + 'mobile/graphics/map/webgl_filters/';
    for (let sub of item.rows) {
        if (level == 1 && sub.seq != showInfo.subId) continue;
        let isCompleted = sub.value == sub.max;
        let visible = hideCompleted ? !isCompleted : true;

        if (sub.gname) {
            if (sub.gname != group.name) {
                updateGroup(group);
                group.row = null;
                group.name = sub.gname;
                group.url = url + sub.ma + '.png';
                group.ma = sub.ma;
                if (level == 0) {
                    group.row = document.createElement('tr');
                    group.row.setAttribute('height', 31);
                    group.row.setAttribute('data-level', '1');
                    if (state.groups) {
                        group.row.setAttribute('data-id', item.id + REGION_SEPARATOR + sub.seq);
                    } else group.row.classList.add('header');
                    group.row.innerHTML = Html `<td colspan="2">${gui.getString(sub.gname)}</td>`;
                    parent.insertBefore(group.row, nextRow);
                }
                initGroupTotals(group.total = {});
                initGroupTotals(group.subtotal = {});
            }
            addGroupTotal(group.total, sub);
            if (!visible || (level == 0 && state.groups)) continue;
            addGroupTotal(group.subtotal, sub);
            addGroupTotal(group.grandtotal, sub);
        }

        if (!visible) continue;
        if (!sub.row) {
            let info = sub.info ? Html `<div>${sub.info}</div>` : '';
            let htm = '';
            if (!sub.name) sub.name = gui.getString(sub.name_loc);
            htm += Html `<td>${sub.img}</td><td>${sub.name}${info}</td>` + getProgress(sub.value, sub.max, sub.energy);
            htm += getTimes(isCompleted, sub.bt, sub.et);
            sub.row = document.createElement('tr');
            sub.row.setAttribute('data-level', level + 1);
            sub.row.innerHTML = htm;
        }
        isOdd = !isOdd;
        sub.row.classList.toggle('odd', isOdd);
        parent.insertBefore(sub.row, nextRow);
    }
    updateGroup(group);
    if (group.row && !state.groups) updateGroupSubTotal(group, true);

    function initGroupTotals(total) {
        total.qty = total.value = total.max = total.bt = total.et = total.energy = 0;
    }

    function addGroupTotal(total, sub) {
        total.qty++;
        total.value += sub.value;
        total.max += sub.max;
        if (sub.energy) total.energy = (total.energy || 0) + sub.energy;
        if (sub.bt && (sub.bt < total.bt || total.bt == 0)) total.bt = sub.bt;
        if (sub.et && sub.et > total.et) total.et = sub.et;
    }

    function updateGroup(group) {
        if (group.row) {
            let total = group.total;
            let isCompleted = total.value == total.max;
            let htm = '';
            htm += Html `<td class="filter ${group.ma == 'father' || group.ma == 'main' ? group.ma : ''}" style="background-image:url(${group.url})"></td><td>${gui.getString(group.name)}</td>` + getProgress(total.value, total.max, total.energy);
            htm += getTimes(isCompleted, total.bt, total.et);
            group.row.innerHTML = htm;
            group.row.classList.toggle('inspect', (!state.hidecompleted || !isCompleted) && state.groups);
        }
        // Sub total
        if ((group.row && !state.groups) || (group.name && level == 1)) updateGroupSubTotal(group);
    }

    function updateGroupSubTotal(group, isGrandTotal) {
        let total = isGrandTotal ? group.grandtotal : group.subtotal;
        if (total.qty <= 0) return;
        let row = document.createElement('tr');
        row.setAttribute('data-level', '2');
        row.classList.add(isGrandTotal ? 'grandtotal' : 'subtotal');
        let isCompleted = total.value == total.max;
        let htm = '';
        htm += Html `<td></td><td>${gui.getMessage(isGrandTotal ? 'progress_grandtotal' : 'progress_subtotal', total.qty)}</td>` + getProgress(total.value, total.max, total.energy);
        htm += getTimes(isCompleted, total.bt, total.et);
        row.innerHTML = htm;
        parent.insertBefore(row, nextRow);
    }
}

function calcLevel(item) {
    item.max = gui.getFile('levelups').length;
    item.value = +gui.getGenerator().level;
}

function infoLevel(row) {
    setInspected(row, true);

    if (!levelSums) {
        levelSums = [0];
        for (let levelup of gui.getFile('levelups')) {
            levelSums[levelup.def_id] = +levelup.xp;
        }
        for (let i = 1; i < levelSums.length; i++) levelSums[i] += levelSums[i - 1];
    }

    let nextRow = row.nextSibling;
    let parent = row.parentNode;

    let level = +gui.getGenerator().level;
    let xp = +gui.getGenerator().exp;
    sliderLevel = sliderLevel || (level + 1);

    setRowLevel(addRow(), 1, levelSums.length);

    let rowLevel = addRow();
    setRowLevel(rowLevel, level, sliderLevel);

    let rowSlider = addRow();
    rowSlider.className = 'slider';
    let htm = '';
    htm += Html.br `<td colspan="6">`;
    htm += Html.br `<input type="range" step="1" value="${sliderLevel}" min="${level + 1}" max="${levelSums.length}">`;
    htm += Html.br `<span class="slider-step slider-min">${Locale.formatNumber(level + 1)}</span>`;
    htm += Html.br `<span class="slider-step slider-val">${Locale.formatNumber(sliderLevel)}</span>`;
    htm += Html.br `<span class="slider-step slider-max">${Locale.formatNumber(levelSums.length)}</span>`;
    htm += Html.br `</td>`;
    htm += Html.br `<td class="energy"></td><td></td>`;
    htm += getTimes(false, 0, 0);
    rowSlider.innerHTML = htm;
    rowSlider.querySelector('input').addEventListener('input', function() {
        sliderLevel = this.value;
        rowSlider.querySelector('.slider-val').textContent = Locale.formatNumber(sliderLevel);
        setRowLevel(rowLevel, level, sliderLevel);
    });

    function addRow() {
        let row = document.createElement('tr');
        row.setAttribute('data-level', '1');
        parent.insertBefore(row, nextRow);
        return row;
    }

    function setRowLevel(row, levelFrom, levelTo) {
        let value = levelSums[level - 1] + xp - levelSums[levelFrom - 1];
        let max = levelSums[levelTo - 1] - levelSums[levelFrom - 1];
        let htm = '';
        htm += Html `<td><img src="/img/gui/xp.png" height="24"></td><td>${gui.getMessage('progress_levelrange', Locale.formatNumber(levelFrom), Locale.formatNumber(levelTo))}</td>` + getProgress(value, max, 0);
        htm += getTimes(false, 0, 0);
        row.innerHTML = htm;
    }
}

function isValidItem(item) {
    return +item.hide == 0 && +item.event_id == 0 && item.name_loc;
}

let achievementImages = {
    'refresh_mine': 'repeat.png',
    'collection': 'chest.png',
    'friend_child': 'godchild.png',
    'buy_building': 'equipment.png',
    'building': 'camp.png',
    'dig': 'dig.png',
    'debris': 'bomb.png',
    'gift': 'gift.png',
    'invite': 'friends.png',
    'caravan': 'caravan.png',
    'windmill': 'windmill.png',
    'decoration': 'deco.png'
};

function calcAchievements(item) {
    let achievements = gui.getFile('achievements');
    let achievs = gui.getGenerator().achievs;
    item.max = 0;
    item.value = 0;
    item.rows = [];
    for (let achievement of Object.values(achievements)) {
        if (isValidItem(achievement)) {
            let achiev = achievs[achievement.def_id];
            let total = 0;
            let max = 0;
            let val = 0;
            let next = 0;
            let userLevel = achiev ? +achiev.level : 0;
            achievement.levels.forEach(level => {
                let amount = +level.amount;
                if (amount > 0) {
                    total += amount;
                    max++;
                    let levelId = +level.level_id;
                    if (levelId < userLevel) {
                        val += amount;
                    } else if (levelId == userLevel) {
                        val += +achiev.progress;
                        next = amount - +achiev.progress;
                    }
                }
            });
            item.max += max;
            if (achiev) {
                let value = +achiev.confirmed_level;
                item.value += value;
                let imgUrl = '/img/gui/blank.gif';
                let title = '';
                if (achievement.type == 'material') {
                    imgUrl = gui.getObjectImage('material', achievement.object_id);
                    title = gui.getObjectName('material', achievement.object_id);
                } else if (achievement.type == 'clear_mine') {
                    imgUrl = gui.getObjectImage('region', achievement.object_id);
                    title = gui.getObjectName('region', achievement.object_id);
                } else {
                    let key = achievement.action + '_' + achievement.type;
                    if (!(key in achievementImages)) key = achievement.type;
                    if (key in achievementImages) imgUrl = '/img/gui/' + achievementImages[key];
                }
                title += (title ? '\n' : '') + gui.getString(achievement.desc);
                item.rows.push({
                    img: Html `<img height="24" src="${imgUrl}" title="${title}">`,
                    sort: (+achievement.region_id || 1) * 10 + value,
                    name: gui.getString(achievement.name_loc) + ' [' + value + '/' + max + ']',
                    info: val == total ? null : gui.getMessage('progress_achievementnextstep', next),
                    value: val,
                    max: total
                });
            }
        }
    }
    item.rows.sort((a, b) => a.sort - b.sort);
}

function calcCollection(item) {
    item.max = item.value = 0;
    let artifacts = gui.getArrayOfInt(gui.getGenerator().artifacts);
    let rid = +gui.getGenerator().region;
    let collections = Object.values(gui.getFile('collections')).filter(isValidItem);
    let images = {};
    item.rows = [];
    for (let collection of collections) {
        let pieces = gui.getArrayOfInt(collection.pieces);
        let max = pieces.length;
        let value = pieces.filter(piece => artifacts.includes(piece)).length;
        item.max += max;
        item.value += value;
        let region_id = +collection.region_id || 1;
        if (region_id <= rid) {
            item.rows.push({
                img: images[region_id] || (images[region_id] = gui.getRegionImg(region_id, false, 24)),
                name_loc: collection.name_loc,
                value: value,
                max: max
            });
        }
    }
}

function calcRegion(item) {
    item.max = item.value = item.crtd = item.cmpl = item.energy = 0;
    var locations = gui.getFile('locations_' + item.rid);
    var loc_prog = gui.getGenerator().loc_prog;
    var filters = {};
    Object.values(gui.getFile('map_filters')).forEach(item => {
        if (!(item.filter in filters)) {
            filters[item.filter] = {
                name: item.name_loc,
                map: item.def_id,
                order_id: +item.order_id,
                ma: item.mobile_asset
            };
        }
    });
    item.rows = [];
    item.bt = item.et = 0;
    for (var lid of Object.keys(locations)) {
        let mine = locations[lid];
        if ((+mine.event_id == 0 && mine.mobile_filter == 'side') || mine.group_id != 0) mine.isXLO = true;
        let filter = filters[mine.filter];
        if (filter && regionMineValid(mine)) {
            let mPrg = +mine.progress;
            let uPrg = 0;
            let done = loc_prog[lid];
            let bt = 0;
            let et = 0;
            if (done) {
                uPrg = +done.prog;
                bt = +done.crtd;
                et = +done.cmpl;
                if (!mine.isXLO) {
                    // Kludge, if no created time, use the end time minus 1 second
                    if (bt == 0 && et > 0) bt = (et - 1);
                    if (bt < item.bt || item.bt == 0) item.bt = bt;
                    if (et > item.et) item.et = et;
                }
            }
            uPrg = Math.min(mPrg, uPrg);
            let energy = Math.floor(mPrg > 0 ? (+mine.reward_exp * 10 / mPrg) * (mPrg - uPrg) : 0);
            item.max += mPrg;
            item.value += uPrg;
            item.energy += energy;

            let imgUrl;
            if (mine.tutorial > 0) {
                imgUrl = 'tutorial.png';
            } else if (+mine.reset_cd > 0) {
                imgUrl = 'repeat.png';
            } else if (mine.isXLO) {
                imgUrl = +mine.event_id > 0 ? 'q-hard.png' : 'q-side.png';
            } else {
                imgUrl = 'q-main.png';
            }

            item.rows.push({
                img: Html `<img height="24" src="/img/gui/${imgUrl}">`,
                name_loc: mine.name_loc,
                value: uPrg,
                max: mPrg,
                gname: filter.name,
                seq: filter.order_id,
                ma: filter.ma,
                group_id: mine.group_id,
                order_id: mine.order_id,
                energy: energy,
                bt: bt,
                et: et
            });
        }
    }
    item.rows.sort((a, b) => (a.seq - b.seq) || (a.group_id - b.group_id) || (a.order_id - b.order_id));
}

function regionMineValid(mine) {
    // Emerald Nest (1345) was a re-diggable location until December of 2015.
    // PF changed the format. It will NOT count towards the Hero of Egypt Achievement,
    // so we ignore it. In case the Mine ID changes, we will use the Name ID as the
    // identifier
    //
    // Anpu's Arena (1642) and Anpu's Racetrack (1643) are not part of the
    // main game so skip as well (seem to have been a later addition?)
    //
    // The following mines, have old and new versions, so we need to check
    // which is the correct version to use, the daFilters, gives the current
    // correct list, but we need these checks to allow for users who played
    // the old versions!
    //
    // All in Egypt, Anubis
    //
    // Deserted Tomb, OLD: 29, NEW: Various, Part of Tutorials
    // Smugglers Den, OLD: 33, NEW: 289
    // Prison,        OLD: 34, NEW: 292
    // Stone Pit,     OLD: 37, NEW: 293
    //
    if (!mineValid(mine, false)) return false;

    if (mine.filter == 'test' || mine.name_loc == 'TEST' /*|| mine.map == 86 || mine.map == 87 || mine.map == 88*/ ) return false;
    let lid = mine.def_id;
    if (mine.name_loc == 'LONA203' || lid == 1642 || lid == 1643 || lid == 29) return false;
    let loc_prog = gui.getGenerator().loc_prog;
    if (lid == 33 && loc_prog.hasOwnProperty(289)) return false;
    if (lid == 289 && loc_prog.hasOwnProperty(33)) return false;
    if (lid == 34 && loc_prog.hasOwnProperty(292)) return false;
    if (lid == 292 && loc_prog.hasOwnProperty(34)) return false;
    if (lid == 37 && loc_prog.hasOwnProperty(293)) return false;
    if (lid == 293 && loc_prog.hasOwnProperty(37)) return false;
    if (lid == 356 && loc_prog.hasOwnProperty(2390)) return false;
    if (lid == 2390 && loc_prog.hasOwnProperty(356)) return false;
    return true;
}

function mineValid(mine, includeRepeatables = true) {
    if (+mine.test || !+mine.order_id) return false;
    let user_tutorial = +gui.getGenerator().tutorial_def_id;
    let tutorial = mineTutorial(mine);
    if (tutorial > 0 && user_tutorial != tutorial) return false;
    if (+mine.reset_cd > 0 && !includeRepeatables) return false;
    return true;
}

function mineTutorial(mine) {
    if (!mine.hasOwnProperty('tutorial')) {
        var search = ',' + mine.def_id + ',';
        mine.tutorial = 0;
        for (let lesson of Object.values(gui.getFile('tutorials'))) {
            if ((',' + lesson.locations + ',').indexOf(search) >= 0) {
                mine.tutorial = +lesson.def_id;
                break;
            }
        }
    }
    return mine.tutorial;
}