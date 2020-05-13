/*global bgp gui SmartTable Locale Dialog Html Tooltip Calculation*/

export default {
    hasCSS: true,
    init: init,
    update: update,
    getState: getState,
    setState: setState,
    actions: {
        'visit_camp': markNeighbor,
        'place_windmill': markNeighbor
    },
    requires: ['gifts', 'materials', 'decorations', 'usables', 'windmills', 'xp']
};

let tab, container, selectShow, selectDays, searchInput, smartTable, searchHandler, palRows, palGifts;
let trGifts, giftValues, lastGiftDays, giftCache, weekdayNames, uniqueGifts, palDays, palEfficiency;
let filterGifts = '', filterExp = 0;
const filterExpressions = ['', '', ''];

function init() {
    tab = this;
    container = tab.container;

    selectShow = container.querySelector('[name=show]');
    selectShow.addEventListener('change', refresh);

    let htm = Html.br(gui.getMessage('neighbors_gifts'));
    htm = String(htm).replace('@DAYS@', getSelectDays(0));
    Dialog.htmlToDOM(container.querySelector('.toolbar .days'), htm);
    selectDays = container.querySelector('[name=days]');
    selectDays.addEventListener('change', refresh);

    searchInput = container.querySelector('[name=search]');
    searchInput.addEventListener('input', () => triggerSearchHandler(true));

    trGifts = document.createElement('tr');
    trGifts.className = 'giftrow';
    Dialog.htmlToDOM(trGifts, Html.br`<td colspan="14"><div>${gui.getMessage('neighbors_giftinfo')}</div><div class="giftlist slick-scrollbar"></div></td>`);

    const button = container.querySelector('.toolbar button.advanced');
    button.addEventListener('click', onClickAdvanced);

    smartTable = new SmartTable(container.querySelector('.data'));
    smartTable.onSort = refresh;
    smartTable.fixedHeader.parentNode.classList.add('neighbors');
    smartTable.fixedFooter.parentNode.classList.add('neighbors');
    smartTable.tbody[0].addEventListener('render', function (event) {
        updateRow(event.target);
    });
    smartTable.tbody[0].addEventListener('click', onClick);

    smartTable.table.addEventListener('input', onInput);

    container.addEventListener('tooltip', onTooltip);
}

function getSelectDays(selectedValue) {
    let htm = '<select name="days">';
    for (let days = 7; days <= 50; days++) {
        htm += Html`<option value="${days}"${days == selectedValue ? ' selected' : ''}>${Locale.formatNumber(days)}</option>`;
    }
    htm += '</select>';
    return htm;
}

function triggerSearchHandler(flag) {
    if (searchHandler) clearTimeout(searchHandler);
    searchHandler = flag ? setTimeout(refresh, 500) : 0;
}

function getFilterExpression() {
    return String(filterExpressions[(+filterExp || 0) - 1] || '').trim();
}

function getState() {
    const state = {
        show: selectShow.value,
        days: selectDays.value,
        search: searchInput.value,
        gift: filterGifts,
        exp: filterExp || undefined,
        sort: gui.getSortState(smartTable)
    };
    filterExpressions.forEach((value, index) => state['exp' + (index + 1)] = value.trim());
    return state;
}

function setState(state) {
    const s = String(state.show || '').toLowerCase();
    if (s.length > 6 && s.startsWith('nogift')) {
        const n = +(s.substr(6)) || 0;
        if (n >= 7 && n <= 50) state.days = n;
        state.show = 'nogift';
    }
    state.show = gui.setSelectState(selectShow, state.show);
    state.days = gui.setSelectState(selectDays, state.days, 21);
    searchInput.value = state.search || '';
    filterGifts = state.gift || '';
    if (state.filter) {
        state.exp = 1;
        state.exp1 = state.filter;
        delete state.filter;
    }
    filterExp = Math.max(0, Math.min(filterExpressions.length, +state.exp || 0)) || undefined;
    filterExpressions.forEach((value, index) => filterExpressions[index] = String(state['exp' + (index + 1)] || '').trim());
    gui.setSortState(state.sort, smartTable, 'name');
    updateButton();
}

function updateButton() {
    const filterExpression = getFilterExpression();
    const isActive = filterGifts != '' || filterExpression != '';
    const button = container.querySelector('.toolbar button.advanced');
    button.textContent = gui.getMessage('gui_advancedfilter') + ': ' + gui.getMessage(isActive ? 'menu_on' : 'menu_off');
    button.classList.toggle('activated', isActive);
}

function onInput(event) {
    const input = event.target;
    if (!input || input.tagName != 'INPUT' || !input.classList.contains('n-note')) return;
    const row = input.parentNode.parentNode;
    const note = input.value.trim();
    const pal_id = row.getAttribute('data-pal-id');
    const pal = pal_id && bgp.Data.getNeighbour(pal_id);
    if (pal) {
        pal.extra.note = note;
        bgp.Data.saveNeighbour(pal);
    }
}

function onClickAdvanced() {
    const state = getState();
    const gifts = gui.getFile('gifts');
    const items = [];
    for (const gid of Object.keys(uniqueGifts)) {
        const gift = gifts[gid];
        const amount = +gift.amount;
        let name = gui.getObjectName(gift.type, gift.object_id);
        if (amount > 1) name += ' x ' + Locale.formatNumber(amount);
        items.push([+gid, gui.getMessage('neighbors_gift', name, Locale.formatNumber(giftValues[gift.def_id]), weekdayNames[gift.day]), giftValues[gift.def_id], gift.day]);
    }

    function getGiftListHtml(list, sortBy) {
        const fn = [(a, b) => a[1].localeCompare(b[1]), (a, b) => a[2] - b[2], (a, b) => a[3] - b[3]][sortBy || 0];
        items.sort(fn);
        let htm = '';
        for (const item of items) {
            htm += Html`<option value="${item[0]}" ${list.includes(item[0]) ? 'selected' : ''}>${item[1]}</option>`;
        }
        return htm;
    }
    filterExp = Math.max(0, Math.min(3, +filterExp || 0));
    const expressions = [''].concat(filterExpressions);
    let htm = '';
    htm += Html.br`<table class="neighbors-advanced-table"><tr><td style="text-align:left">`;
    htm += Html.br`${gui.getMessage('neighbors_expression')}:`;
    expressions.forEach((value, index) => {
        htm += Html.br`<br><label for="exp${index}"><input type="radio" id="exp${index}" name="exp" data-method="exp" value="${index}" ${filterExp == index ? 'checked' : ''}>`;
        htm += Html.br` <b>${index ? index + ':' : gui.getMessage('neighbors_clearfilter')}</b>`;
        htm += Html`  <span class="neighbors-expression">${String(expressions[index] || '').trim()}</span>`;
        htm += Html.br`</label>`;
    });
    htm += Html.br`<br><textarea type="text" name="expression" data-method="expression" maxlength="500" rows="3"></textarea>
<br><div class="expression-error"></div>
<table class="expression-help"><tr><th colspan="3">${gui.getMessage('calc_operators')}</th></tr>
<tr><th>${gui.getMessage('calc_arithmetic')}</th><th>${gui.getMessage('calc_comparison')}</th><th>${gui.getMessage('calc_logical')}</th></tr>
<tr><td>- + * / % ** ^</td><td>= == <> != > >= < <=</td><td>&& and || or ! not</td></tr>
<tr><th colspan="3">${gui.getMessage('calc_functions')}</th></tr>
<tr><td colspan="3">${Object.getOwnPropertyNames(Math).filter(n => typeof Math[n] == 'function').sort().join(' ')}
<br>if(expression, trueValue, falseValue)
</td></tr>
<tr><th colspan="3">${gui.getMessage('calc_variables')}</th></tr><td colspan="3">
now region level levelup lastgift list blocks wmtime visit recorded gifts efficiency value
</td></tr>
<tr><th colspan="3">${gui.getMessage('calc_examples')}</th></tr>
<tr><td colspan="3">
level>100 and level<150
<br>
blocks>20 or (region=1 and level<100)
</td></tr></table>
</div>`;
    htm += Html.br`</td><td>`;
    const info = Html.raw(String(Html.br(gui.getMessage('neighbors_advancedfilterinfo'))).replace('@DAYS@', getSelectDays(state.days)));
    htm += Html.br`${info}<br>${gui.getMessage('neighbors_sortby')} <select name="sort" data-method="sort">`;
    htm += Html.br`<option value="0">${gui.getMessage('gui_gift')}</option>`;
    htm += Html.br`<option value="1">${gui.getMessage('gui_xp')}</option>`;
    htm += Html.br`<option value="2">${gui.getMessage('gui_day')}</option>`;
    htm += Html.br`</select>`;
    htm += Html.br` <input data-method="clear" type="button" value="${gui.getMessage('neighbors_clearfilter')}"/><br/>`;
    htm += Html.br`<select name="gifts" multiple size="${Math.min(18, items.length)}" style="margin:3px;width:100%">`;
    htm += getGiftListHtml(gui.getArrayOfInt(state.gift));
    htm += Html.br`</select>`;
    htm += Html.br`</td></tr></table>`;
    gui.dialog.show({
        title: gui.getMessage('gui_advancedfilter'),
        html: htm,
        style: [Dialog.CONFIRM, Dialog.CANCEL, Dialog.AUTORUN, Dialog.WIDEST]
    }, function (method, params) {
        const list = gui.getArrayOfInt(params.gifts).sort(gui.sortNumberAscending).join(',');
        if (method == 'clear') {
            for (const option of gui.dialog.element.querySelectorAll('[name=gifts] option')) option.selected = false;
            return;
        }
        if (method == 'sort') {
            Dialog.htmlToDOM(gui.dialog.element.querySelector('[name=gifts]'), getGiftListHtml(list, params.sort));
            return;
        }
        if (method == 'exp' || method == Dialog.AUTORUN) {
            params.expression = params.exp ? expressions[params.exp] : '';
            const textarea = gui.dialog.element.querySelector('[name=expression]');
            textarea.value = params.expression;
            textarea.disabled = +params.exp == 0;
            textarea.style.opacity = +params.exp ? 1 : 0.3;
            method = 'expression';
        }
        if (method == 'expression') {
            const expression = +params.exp ? params.expression : '';
            expressions[params.exp] = expression.trim();
            gui.dialog.element.querySelector(`label[for=exp${params.exp}] span`).textContent = params.expression;
            const calculator = getCalculator(expression, {});
            let htm = '';
            if (calculator.errorCode) {
                const message = gui.getMessage('calc_error_' + calculator.errorCode) || calculator.errorMessage;
                let pre = expression.substring(0, calculator.errorPos - 1);
                let post = expression.substring(calculator.errorPos);
                const c = expression.charAt(calculator.errorPos - 1);
                if (pre.length > 15) pre = '\u2025' + pre.substring(pre.length - 15);
                if (post.length > 15) post = post.substring(0, 15) + '\u2025';
                htm = Html`<b>${message}:</b><br>${pre}<b class="culprit">${c}</b>${post}`;
            }
            Dialog.htmlToDOM(gui.dialog.element.querySelector('.expression-error'), htm);
            return;
        }
        if (method == Dialog.CANCEL) return;
        filterGifts = list;
        filterExp = params.exp;
        filterExpressions.forEach((value, index) => filterExpressions[index] = expressions[index + 1]);
        selectDays.value = params.days;
        refresh();
    });
}

function formatDayMonthTime(time) {
    return Locale.formatDayMonth(time) + '\n' + Locale.formatTime(time);
}

function removeAllShowGifts() {
    for (const row of Array.from(smartTable.table.querySelectorAll('tr.show-gifts'))) row.classList.remove('show-gifts');
}

function onClick(e) {
    let cell;
    for (let el = e.target; !cell && el.tagName != 'TABLE'; el = el.parentNode)
        if (el.tagName == 'TD') cell = el;
    if (!cell || !cell.classList.contains('has-gifts')) return;
    removeAllShowGifts();
    const row = cell.parentNode;
    if (row.nextSibling == trGifts) {
        trGifts.parentNode.removeChild(trGifts);
        return;
    }
    row.classList.add('show-gifts');
    const giftContainer = trGifts.querySelector('.giftlist');
    Dialog.htmlToDOM(giftContainer, '');
    giftContainer.style.width = (row.offsetWidth - 2) + 'px';
    row.parentNode.insertBefore(trGifts, row.nextSibling);
    const id = row.getAttribute('data-pal-id');
    const pal = bgp.Data.getNeighbour(id);
    const gifts = gui.getFile('gifts');
    let htm = '';
    for (const palGift of palGifts[pal.id]) {
        const gid = palGift[1];
        let piece = giftCache[gid];
        if (piece === undefined) {
            const gift = gifts[gid];
            piece = '';
            if (gift) {
                const amount = +gift.amount;
                const xp = giftValues[gift.def_id];
                const t_xp = Locale.formatNumber(xp);
                const t_amount = Locale.formatNumber(amount);
                let name = gui.getObjectName(gift.type, gift.object_id);
                if (amount > 1) name += ' x ' + t_amount;
                piece += Html.br`<div title="${Html(gui.getMessage('neighbors_gifttip', name, t_xp, weekdayNames[gift.day]))}"><img src="${gui.getObjectImage(gift.type, gift.object_id)}">`;
                piece += Html.br`<i>${xp}</i><b>${Locale.formatNumber(amount)}</b>`;
            }
            giftCache[gid] = piece;
        }
        if (piece == '') continue;
        htm += piece + Html.br`<span>${formatDayMonthTime(palGift[2])}</span></div>`;
    }
    Dialog.htmlToDOM(giftContainer, htm);
}

function update() {
    lastGiftDays = 0;
    palRows = {};
    palDays = {};
    for (const pal of Object.values(bgp.Data.getNeighbours())) {
        const row = document.createElement('tr');
        row.setAttribute('data-pal-id', pal.id);
        row.setAttribute('height', 61);
        row.setAttribute('lazy-render', '');
        palRows[pal.id] = row;
        palDays[pal.id] = Locale.getNumDays(pal.extra.timeCreated);
    }
    // Remove Mr.Bill
    delete palRows[1];
    weekdayNames = {};
    for (let day = 1; day <= 7; day++) {
        // The 1st January 2018 was a Monday (1 = Monday)
        const name = (new Date(2018, 0, day)).toLocaleDateString(Locale.getLocale(), {
            weekday: 'long'
        });
        weekdayNames[day] = name;
    }
    // Determine gift value
    giftCache = {};
    giftValues = {
        material2: 1000 // Gem
    };
    for (const gift of Object.values(gui.getFile('gifts'))) {
        const type = gift.type;
        const oid = gift.object_id;
        const key = type + oid;
        let value = giftValues[key];
        if (value === undefined) {
            giftValues[key] = value = gui.getXp(type, oid);
        }
        giftValues[gift.def_id] = value * +gift.amount;
    }
    gui.updateNeighborFriendNames(true);
    refresh();
}

function markNeighbor(neighborId) {
    gui.setLazyRender(container.querySelector('tr[data-pal-id="' + neighborId + '"]'));
}

function updateRow(row) {
    const id = row.getAttribute('data-pal-id');
    const pal = bgp.Data.getNeighbour(id);
    const friend = Object.values(bgp.Data.getFriends()).find(friend => friend.uid == id);
    const anchor = friend ? gui.getFriendAnchor(friend) : Html.raw('<a class="no-link">');
    let htm = '';
    htm += Html.br`<td>${anchor}<img height="50" width="50" src="${gui.getFBFriendAvatarUrl(pal.fb_id)}" class="tooltip-event"/></a></td>`;
    const fullName = gui.getPlayerNameFull(pal);
    if (friend && friend.name == fullName) {
        htm += Html.br`<td>${anchor}${fullName}</a>`;
    } else {
        htm += Html.br`<td><a class="no-link">${fullName}</a>`;
        if (friend) htm += Html.br`<br>${anchor}${friend.name}</a>`;
        else if (pal.extra.fn && pal.extra.fn != fullName) htm += Html.br`<br><span class="friendname">${pal.extra.fn}</span>`;
    }
    htm += Html.br`<br><input class="note n-note" type="text" maxlength="50" placeholder="${gui.getMessage('gui_nonote')}" value="${pal.extra.note}"></td>`;
    htm += Html.br`<td>${gui.getRegionImg(pal.region)}</td>`;
    htm += Html.br`<td>${Locale.formatNumber(pal.level)}</td>`;
    if (pal.extra.lastLevel && pal.extra.lastLevel != pal.level) {
        htm += Html.br`<td title="${Locale.formatDate(pal.extra.timeLevel)} (${Locale.formatNumber(pal.extra.lastLevel)})">${Locale.formatDays(pal.extra.timeLevel)}</td>`;
    } else {
        htm += Html.br`<td></td>`;
    }
    htm += Html.br`<td>${Locale.formatDate(pal.extra.timeCreated)}<br>${Locale.formatDaysNum(palDays[pal.id])}</td>`;
    if (pal.c_list > 0) {
        htm += Html.br`<td><img src="/img/gui/clist.png"></td>`;
    } else {
        htm += Html.br`<td></td>`;
    }
    const blocks = pal.extra.blocks;
    if (blocks === undefined) {
        htm += Html.br`<td><img src="/img/gui/check_na.png"></td>`;
    } else {
        htm += blocks === 0 ? Html.br`<td><img src="/img/gui/check_yes.png"></td>` : Html.br`<td><span class="camp_blocks">${blocks}</span></td>`;
    }
    const wmtime = pal.extra.wmtime;
    if (wmtime === undefined) {
        htm += Html.br`<td></td>`;
    } else {
        htm += Html.br`<td class="${wmtime < gui.getUnixTime() ? 'warning' : ''}">${wmtime == 0 ? '/' : formatDayMonthTime(wmtime)}</td>`;
    }
    if (pal.extra.lastVisit) {
        htm += Html.br`<td>${Locale.formatDate(pal.extra.lastVisit)}<br>${Locale.formatDays(pal.extra.lastVisit)}</td>`;
    } else {
        htm += Html.br`<td></td>`;
    }
    if (pal.extra.lastGift) {
        htm += Html.br`<td>${Locale.formatDate(pal.extra.lastGift)}<br>${Locale.formatDays(pal.extra.lastGift)}</td>`;
    } else {
        htm += Html.br`<td></td>`;
    }
    const gifts = palGifts[pal.id];
    const count = gifts.length;
    const className = count > 0 ? 'has-gifts' : '';
    const efficiency = palEfficiency[id];
    htm += Html.br`<td class="${className}">${Locale.formatNumber(count)}</td>`;
    htm += Html.br`<td class="${className}">${Locale.formatNumber(gifts._value)}</td>`;
    htm += Html.br`<td class="${className}">${isNaN(efficiency) ? '' : Locale.formatNumber(efficiency) + ' %'}</td>`;
    Dialog.htmlToDOM(row, htm);
}

let scheduledRefresh;

function refresh() {
    triggerSearchHandler(false);
    gui.updateTabState(tab);
    updateButton();

    //smartTable.showFixed(false);
    Dialog.htmlToDOM(smartTable.tbody[0], '');

    if (scheduledRefresh) clearTimeout(scheduledRefresh);
    scheduledRefresh = setTimeout(refreshDelayed, 50);
}

function getDateAgo(days) {
    const dt = new Date();
    dt.setHours(0, 0, 0, 0);
    dt.setDate(dt.getDate() - days);
    return dt.getTime() / 1000;
}

function getCalculator(expression, getValueFunctions) {
    const calculator = {};
    calculator.hasValidExpression = false;
    calculator.errorText = '';
    calculator.errorPos = calculator.errorCode = 0;
    expression = expression === null || expression === undefined ? '' : String(expression).trim();
    if (expression) {
        const calculation = new Calculation();
        calculation.defineConstant('now', gui.getUnixTime());
        calculation.defineConstant('day', 86400);
        const rpn = calculation.parse(expression);
        calculator.errorCode = calculation.errorCode;
        calculator.errorPos = calculation.errorPos;
        calculator.errorMessage = calculation.errorMessage;
        if (!calculation.errorCode) {
            calculator.hasValidExpression = true;
            let values, ref;
            calculation.getExternalVariable = (name) => {
                if (name in values) return values[name];
                const fn = getValueFunctions[name];
                const value = fn ? fn(...ref) : undefined;
                return values[name] = value;
            };
            calculator.evaluate = (...args) => {
                ref = args;
                values = {};
                return calculation.calc(rpn);
            };
        }
    }
    return calculator;
}

function refreshDelayed() {
    scheduledRefresh = 0;
    const state = getState();
    selectShow.querySelector('option[value="nogift"]').textContent = gui.getMessage('neighbors_nogift', Locale.formatNumber(+state.days));

    const getSortValueFunctions = {
        name: pal => palNames[pal.id] || '',
        region: pal => +pal.region,
        level: pal => +pal.level,
        levelup: pal => (pal.extra.lastLevel && pal.extra.lastLevel != pal.level) ? -pal.extra.timeLevel : 0,
        lastgift: pal => pal.extra.lastGift || 0,
        list: pal => +pal.c_list ? 0 : 1,
        blocks: pal => pal.extra.blocks === undefined ? NaN : +pal.extra.blocks,
        wmtime: pal => pal.extra.wmtime === undefined ? NaN : +pal.extra.wmtime,
        visit: pal => pal.extra.lastVisit === undefined ? NaN : +pal.extra.lastVisit,
        recorded: pal => +pal.extra.timeCreated || 0,
        gifts: pal => palGifts[pal.id].length,
        efficiency: pal => palEfficiency[pal.id],
        value: pal => palGifts[pal.id]._value
    };

    const fnSearch = gui.getSearchFilter(state.search);
    let show = state.show;
    let list, days;
    if (show == 'inlist' || show == 'notinlist') {
        list = show == 'inlist' ? 0 : 1;
        show = 'list';
    } else if (show == 'nogift') {
        days = +state.days || 0;
        if (days) days = getDateAgo(days); else show = '';
    }

    let neighbors = Object.assign({}, bgp.Data.getNeighbours());
    delete neighbors[1];
    neighbors = Object.values(neighbors);

    const giftDays = Math.max(7, +state.days || 0);
    const giftThreshold = getDateAgo(giftDays - 1);
    if (giftDays != lastGiftDays) {
        let giftTotal = 0;
        let giftCount = 0;
        let minDate = gui.getUnixTime();
        palEfficiency = {};
        lastGiftDays = giftDays;
        palGifts = {};
        uniqueGifts = {};
        for (const pal of neighbors) {
            let gifts = Array.isArray(pal.extra.g) ? pal.extra.g : [];
            let value = 0;
            gifts = gifts.filter(gift => {
                const dt = gift[2];
                if (dt >= giftThreshold) {
                    if (dt < minDate) minDate = dt;
                    const gid = gift[1];
                    value += (giftValues[gid] || 0);
                    uniqueGifts[gid] = true;
                    return true;
                }
            });
            gifts._value = value;
            giftTotal += value;
            giftCount += gifts.length;
            palGifts[pal.id] = gifts;
            palRows[pal.id].setAttribute('lazy-render', '');
            const days = -palDays[pal.id];
            palEfficiency[pal.id] = Math.min(100, Math.ceil((days < 7 ? NaN : gifts.length / Math.min(days, giftDays)) * 100));
        }
        const dt = Locale.getDate(minDate);
        dt.setHours(0, 0, 0, 0);
        const realGiftDays = Math.min(Math.ceil((Date.now() - dt.getTime()) / 86400000), giftDays);
        let text = gui.getMessage('neighbors_totxpstats', Locale.formatNumber(giftCount), Locale.formatNumber(realGiftDays), Locale.formatNumber(giftTotal), Locale.formatNumber(Math.floor(giftTotal / realGiftDays)));
        text += '\n' + gui.getMessage('neighbors_avgxpstats', Locale.formatNumber(giftTotal / giftCount, 1), Locale.formatNumber(giftTotal / neighbors.length / realGiftDays, 1));
        Dialog.htmlToDOM(container.querySelector('.stats'), Html.br(text));
    }

    const giftFilter = {};
    let applyGiftFilter = false;
    for (const gid of gui.getArrayOfInt(state.gift)) {
        if (gid in uniqueGifts) {
            giftFilter[gid] = true;
            applyGiftFilter = true;
        }
    }

    const palNames = {};
    const sort = gui.getSortFunction(getSortValueFunctions, smartTable, 'name');
    const now = gui.getUnixTime();
    let items = [];
    const filterExpression = getFilterExpression();
    const calculator = getCalculator(filterExpression, getSortValueFunctions);
    const friendNames = {};
    for (const friend of Object.values(bgp.Data.getFriends())) friendNames[friend.uid] = '\t' + friend.name.toUpperCase();
    for (const pal of neighbors) {
        if (show == 'list' && list != (+pal.c_list ? 0 : 1)) continue;
        if (show == 'withblocks' && !(pal.extra.blocks > 0)) continue;
        if (show == 'unknownblocks' && pal.extra.blocks !== undefined) continue;
        if (show == 'expiredwm' && !(pal.extra.wmtime <= now)) continue;
        else if (show == 'nogift' && (pal.extra.lastGift || pal.extra.timeCreated) >= days) continue;
        const fullname = gui.getPlayerNameFull(pal).toUpperCase();
        if (fnSearch && !fnSearch(fullname + '\t\n' + (pal.extra.note || '') + '\t' + (friendNames[pal.id] || '') + '\t' + (pal.extra.fn || ''))) continue;
        if (applyGiftFilter) {
            let flag = false;
            for (const palGift of (palGifts[pal.id] || [])) {
                if (palGift[1] in giftFilter) {
                    flag = true;
                    break;
                }
            }
            if (!flag) continue;
        }
        if (calculator.hasValidExpression && !calculator.evaluate(pal)) continue;
        palNames[pal.id] = fullname;
        items.push(pal);
    }

    Dialog.htmlToDOM(smartTable.tbody[0], '');
    Array.from(container.querySelectorAll('.neighbors tfoot td')).forEach(cell => {
        cell.innerText = gui.getMessage('neighbors_found', items.length, neighbors.length);
    });

    scheduledRefresh = setTimeout(function () {
        items = sort(items);
        const tbody = smartTable.tbody[0];
        for (const item of items) {
            tbody.appendChild(palRows[item.id]);
        }
        removeAllShowGifts();
        gui.collectLazyElements(tbody);
        smartTable.syncLater();
    }, 50);
}

function onTooltip(event) {
    const element = event.target;
    const pal_id = element.parentNode.parentNode.parentNode.getAttribute('data-pal-id');
    const pal = pal_id && bgp.Data.getNeighbour(pal_id);
    const fb_id = pal && pal.fb_id;
    if (fb_id) {
        const htm = Html.br`<div class="neighbors-tooltip"><img width="108" height="108" src="${gui.getFBFriendAvatarUrl(fb_id, null, 108)}"/></div>`;
        Tooltip.show(element, htm);
    }
}