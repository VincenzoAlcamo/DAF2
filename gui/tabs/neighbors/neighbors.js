/*global bgp gui SmartTable Locale Dialog Html Tooltip Calculation*/

export default {
    hasCSS: true,
    init,
    update,
    getState,
    setState,
    actions: {
        'cl_add': markNeighbor,
        'cl_remove': markNeighbor,
        'visit_camp': markNeighbor,
        'place_windmill': markNeighbor,
        'team_changed': () => {
            updateTeamMembers();
            const state = getState();
            if (state.show == 'team') refresh();
        }
    },
    requires: ['gifts', 'materials', 'decorations', 'usables', 'windmills', 'g_teams', 'xp']
};

let tab, container, selectShow, selectDays, selectRegion, searchInput, checkId, smartTable, searchHandler, palRows, palGifts;
let trGifts, giftValues, lastGiftDays, giftCache, weekdayNames, uniqueGifts, palDays, palEfficiency;
let filterGifts = '', filterExp = 0;
const filterExpressions = ','.repeat(4).split(',');
let teamMembers = {};

function init() {
    tab = this;
    container = tab.container;

    selectShow = container.querySelector('[name=show]');
    selectShow.addEventListener('change', refresh);

    let htm = Html.br(gui.getMessage('neighbors_gifts'));
    htm = String(htm).replace('@DAYS@', '<br>' + getSelectDays(0));
    Html.set(container.querySelector('.toolbar .days'), htm);
    selectDays = container.querySelector('[name=days]');
    selectDays.addEventListener('change', refresh);

    searchInput = container.querySelector('[name=search]');
    searchInput.addEventListener('input', () => triggerSearchHandler(true));

    checkId = container.querySelector('[name=showid]');
    checkId.addEventListener('click', refresh);

    trGifts = Html.get(Html.br`<tr class="giftrow"><td colspan="14"><div>${gui.getMessage('neighbors_giftinfo')}</div><div class="giftlist slick-scrollbar"></div></td></tr>`)[0];

    const handlers = { formula, gifts, summary };
    const onClickButton = (event) => {
        const action = event.target.getAttribute('data-action');
        if (action in handlers) handlers[action](event);
    };
    for (const button of container.querySelectorAll('.toolbar button[data-action]')) button.addEventListener('click', onClickButton);

    selectRegion = container.querySelector('[name=region]');
    selectRegion.addEventListener('change', refresh);

    smartTable = new SmartTable(container.querySelector('.data'));
    smartTable.onSort = refresh;
    smartTable.fixedHeader.parentNode.classList.add('neighbors');
    smartTable.fixedFooter.parentNode.classList.add('neighbors');
    smartTable.tbody[0].addEventListener('render', gui.getLazyRenderer(updateRow));
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
        region: selectRegion.options.length ? selectRegion.value : selectRegion.getAttribute('data-value'),
        search: searchInput.value,
        gift: filterGifts,
        exp: filterExp || undefined,
        id: checkId.checked && bgp.Data.isAdmin,
        sort: gui.getSortState(smartTable)
    };
    filterExpressions.forEach((value, index) => state['exp' + (index + 1)] = value.trim());
    return state;
}

function setState(state) {
    if (selectRegion.options.length) state.region = gui.setSelectState(selectRegion, state.region || '');
    selectRegion.setAttribute('data-value', state.region);
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
    checkId.checked = state.id && bgp.Data.isAdmin;
    filterExp = Math.max(0, Math.min(filterExpressions.length, +state.exp || 0)) || undefined;
    filterExpressions.forEach((value, index) => filterExpressions[index] = String(state['exp' + (index + 1)] || '').trim());
    gui.setSortState(state.sort, smartTable, 'name');
    updateButton();
}

function updateButton() {
    container.querySelector('.toolbar button[data-action="formula"]').classList.toggle('activated', getFilterExpression() != '');
    container.querySelector('.toolbar button[data-action="gifts"]').classList.toggle('activated', filterGifts != '');
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

function formula() {
    filterExp = Math.max(0, Math.min(filterExpressions.length, +filterExp || 0));
    const expressions = [''].concat(filterExpressions);
    let htm = '';
    htm += Html.br`<table class="neighbors-advanced-table"><tr><td style="text-align:left">`;
    htm += Html.br`${gui.getMessage('neighbors_expression')}:`;
    expressions.forEach((value, index) => {
        htm += Html.br`<label for="exp${index}" class="expression-item"><input type="radio" id="exp${index}" name="exp" data-method="exp" value="${index}" ${filterExp == index ? 'checked' : ''}>`;
        htm += Html.br` <b>${index ? index + ':' : gui.getMessage('neighbors_clearfilter')}</b>`;
        htm += Html`  <span class="neighbors-expression">${String(expressions[index] || '').trim()}</span>`;
        htm += Html.br`</label>`;
    });
    htm += Html.br`<textarea type="text" name="expression" data-method="expression" maxlength="500" rows="3"></textarea><br><div class="expression-error">`;
    const unknown = Html.raw('\nNaN=this information is unknown');
    const dateInfo = Html.raw('\nA date value is the number of seconds elapsed from 1st January 1970');
    htm += Html.br`</td><td>
<table class="expression-help"><tr><th colspan="3">${gui.getMessage('calc_operators')}</th></tr>
<tr><th>${gui.getMessage('calc_arithmetic')}</th><th>${gui.getMessage('calc_comparison')}</th><th>${gui.getMessage('calc_logical')}</th></tr>
<tr><td>- + * / % ** ^</td><td>= == <> != > >= < <=</td><td>&& and || or ! not</td></tr>
<tr><th colspan="3">${gui.getMessage('calc_functions')}</th></tr>
<tr><td colspan="3">${Object.getOwnPropertyNames(Math).filter(n => typeof Math[n] == 'function').sort().join(' ')}
<span title="Return true if the &quot;value&quot; is NaN (Not a Number)\nThis is the correct way to check for a NaN value">isNaN(value)</span>
<span title="Returns &quot;trueValue&quot; if &quot;expression&quot; is truthy, otherwise returns &quot;falseValue&quot;">if(expression, trueValue, falseValue)</span>
</td></tr>
<tr><th colspan="3">${gui.getMessage('calc_variables')}</th></tr><td colspan="3">
<span title="The current date and time${dateInfo}">now</span>
<span title="The current date (time is 00:00)${dateInfo}">today</span>
<span title="The number of seconds in a day (86400)\nThis can be helpful for date comparisons: lastgift > today - 7 * day">day</span>
<span title="The player's region\n${Html(Array.from(Array(gui.getMaxRegion())).map((_, n) => `${n + 1}=${gui.getObjectName('region', n + 1)}`).join('\n'))}">region</span>
<span title="The player's level">level</span>
<span title="The last time that player has leveled up${unknown}${dateInfo}">levelup</span>
<span title="The last time that player has gifted you${unknown}${dateInfo}">lastgift</span>
<span title="Player is in your custom list\n0=NO\n1=YES">list</span>
<span title="The number of blocks to clear in the underground camp${unknown}">blocks</span>
<span title="The time when the first windmills will expire\n0=the camp need windmills${unknown}${dateInfo}">wmtime</span>
<span title="The last time you visited that player's camp${unknown}${dateInfo}">visit</span>
<span title="The time that neighbor has been first registered${dateInfo}">recorded</span>
<span title="The number of gifts received${unknown}">gifts</span>
<span title="The gift efficiency (0-100)${unknown}">efficiency</span>
<span title="The value selected for consider gifting days">giftdays</span>
<span title="The total gift value${unknown}">value</span>
</td></tr>
<tr><th colspan="3">${gui.getMessage('calc_examples')}</th></tr>
<tr><th>${gui.getMessage('neighbors_inlist')}</th><td colspan="2">list = 1</td></tr>
<tr><th>${gui.getMessage('neighbors_notinlist')}</th><td colspan="2">list = 0</td></tr>
<tr><th>${gui.getMessage('neighbors_withblocks')}</th><td colspan="2">blocks &gt; 0</td></tr>
<tr><th>${gui.getMessage('neighbors_unknownblocks')}</th><td colspan="2">isnan(blocks)</td></tr>
<tr><th>${gui.getMessage('neighbors_withexpiredwindmills')}</th><td colspan="2">wmtime &lt; now</td></tr>
<tr><th>${gui.getMessage('neighbors_nogift', 'X')}</th><td colspan="2">lastgift &lt; (now - giftdays * day)</td></tr>
<tr><td colspan="3">level &gt; 100 and level &lt; 150<br>list = 0 and (region &lt;= 2 or level &lt; 300)</td></tr>
</table>`;
    htm += Html.br`</td></tr></table>`;
    gui.dialog.show({
        title: gui.getMessageAndValue('gui_advancedfilter', gui.getMessage('dailyreward_formula')),
        html: htm,
        style: [Dialog.CONFIRM, Dialog.CANCEL, Dialog.AUTORUN, Dialog.WIDEST]
    }, function (method, params) {
        if (method == 'exp' || method == Dialog.AUTORUN) {
            params.expression = params.exp ? expressions[params.exp] : '';
            const textarea = gui.dialog.element.querySelector('[name=expression]');
            textarea.value = params.expression;
            textarea.disabled = +params.exp == 0;
            textarea.style.opacity = +params.exp ? 1 : 0.3;
            for (let i = filterExpressions.length; i > 0; i--) gui.dialog.element.querySelector(`label[for=exp${i}]`).classList.toggle('activated', i == params.exp);
            method = 'expression';
        }
        if (method == 'expression') {
            const expression = +params.exp ? params.expression : '';
            expressions[params.exp] = expression.trim();
            Html.set(gui.dialog.element.querySelector(`label[for=exp${params.exp}] span`), Html(params.expression));
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
            Html.set(gui.dialog.element.querySelector('.expression-error'), htm);
        }
        if (method != Dialog.CONFIRM) return;
        filterExp = params.exp;
        filterExpressions.forEach((value, index) => filterExpressions[index] = expressions[index + 1]);
        refresh();
    });
}

function gifts() {
    const state = getState();
    const gifts = gui.getFile('gifts');
    const items = [];
    for (const gid of Object.keys(uniqueGifts)) {
        const gift = gifts[gid];
        const amount = +gift.amount;
        let name = gui.getObjectName(gift.type, gift.object_id);
        if (amount > 1) name += ' \xd7 ' + Locale.formatNumber(amount);
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
    let htm = '';
    const info = Html.raw(String(Html.br(gui.getMessage('neighbors_advancedfilterinfo'))).replace('@DAYS@', getSelectDays(state.days)));
    htm += Html.br`<div class="gift-info" style="max-width:460px">${info}</div>${gui.getMessage('neighbors_sortby')} <select name="sort" data-method="sort">`;
    htm += Html.br`<option value="0">${gui.getMessage('gui_gift')}</option>`;
    htm += Html.br`<option value="1">${gui.getMessage('gui_xp')}</option>`;
    htm += Html.br`<option value="2">${gui.getMessage('gui_day')}</option>`;
    htm += Html.br`</select>`;
    htm += Html.br` <input data-method="clear" type="button" value="${gui.getMessage('neighbors_clearfilter')}"/><br/>`;
    htm += Html.br`<select name="gifts" data-method="gifts" multiple size="${Math.min(18, items.length)}" style="margin:3px;">`;
    htm += getGiftListHtml(gui.getArrayOfInt(state.gift));
    htm += Html.br`</select>`;
    gui.dialog.show({
        title: gui.getMessage('gui_advancedfilter'),
        html: htm,
        style: [Dialog.CONFIRM, Dialog.CANCEL, Dialog.AUTORUN]
    }, function (method, params) {
        const list = gui.getArrayOfInt(params.gifts).sort(gui.sortNumberAscending).join(',');
        if (method == 'clear' || method == 'gifts' || method == Dialog.AUTORUN) {
            if (method == 'clear') {
                for (const option of gui.dialog.element.querySelectorAll('[name=gifts] option')) option.selected = false;
                delete params.gifts;
            }
            gui.dialog.element.querySelector('.gift-info').classList.toggle('activated', !!params.gifts);
        }
        if (method == 'sort') {
            Html.set(gui.dialog.element.querySelector('[name=gifts]'), getGiftListHtml(list, params.sort));
        }
        if (method != Dialog.CONFIRM) return;
        filterGifts = list;
        selectDays.value = params.days;
        refresh();
    });
}

function summary() {
    const now = gui.getUnixTime();
    const gifts = gui.getFile('gifts');
    let select = '<select name="days" data-method="days">';
    for (let days = 7; days <= 28; days += 7) {
        select += Html`<option value="${days}">${Locale.formatNumber(days)}</option>`;
    }
    select += '</select>';
    let htm = Html`<label>${gui.getMessage('neighbors_gifts')}</label><div class="neighbors_summary"></div>`;
    htm = String(htm).replace('@DAYS@', select);
    gui.dialog.show({ title: gui.getMessage('gui_summary'), html: htm, style: [Dialog.CLOSE, Dialog.WIDEST, Dialog.AUTORUN] }, (method, params) => {
        if (method == Dialog.AUTORUN || method == 'days') {
            const numDays = +params.days;
            const hash = {};
            const limit = now - numDays * 86400;
            let giftCount = 0;
            for (const pal of Object.values(bgp.Data.getNeighbours())) {
                const gs = (pal.extra && pal.extra.g) || [];
                gs.filter(g => g[2] >= limit).forEach(g => {
                    const gift = gifts[g[1]];
                    if (gift) {
                        giftCount++;
                        const key = gift.type + '\t' + gift.object_id;
                        let total = hash[key];
                        if (!total) total = hash[key] = { type: gift.type, oid: gift.object_id, qty: 0, xp: gui.getXp(gift.type, gift.object_id) };
                        total.qty += +gift.amount;
                    }
                });
            }
            const values = Object.values(hash);
            values.forEach(item => item.totxp = item.xp * item.qty);
            const giftTotal = values.reduce((t, item) => t + item.totxp, 0);
            const NUMCOLUMNS = 5;
            let htm = Html`<table class="daf-table neighbors_summary">`;
            const text = gui.getMessage('neighbors_totxpstats', Locale.formatNumber(giftCount), Locale.formatNumber(numDays), Locale.formatNumber(giftTotal), Locale.formatNumber(Math.floor(giftTotal / numDays)));
            htm += Html`<thead><tr><th colspan="${NUMCOLUMNS}">${text}</th></tr></thead>`;
            htm += Html`<tbody class="row-coloring">`;
            let col = 0;
            values.sort((a, b) => b.totxp - a.totxp).forEach(item => {
                let title = gui.getObjectName(item.type, item.oid, 'info+event');
                if (item.totxp) {
                    const textXp = ((item.xp == 1 || item.qty == 1) ? '' : Locale.formatNumber(item.qty) + ' \xd7 ' + Locale.formatNumber(item.xp) + ' = ') + Locale.formatNumber(item.totxp);
                    title += '\n' + gui.getMessageAndValue(item.type == 'usable' ? 'gui_energy' : 'gui_xp', textXp);
                }
                if (!col) htm += Html`<tr>`;
                htm += Html`<td class="gift"><div class="img"><img src="${gui.getObjectImage(item.type, item.oid, true)}" title="${title}" class="outlined"></div>`;
                htm += Html`<span class="qty">${'\xd7 ' + Locale.formatNumber(item.qty)}</span>`;
                if (item.totxp) htm += Html`<br><span class="xp">${gui.getMessageAndValue(item.type == 'usable' ? 'gui_energy' : 'gui_xp', Locale.formatNumber(item.totxp))}</span>`;
                htm += Html`</td>`;
                col = (col + 1) % NUMCOLUMNS;
                if (!col) htm += Html`</tr>`;
            });
            htm += Html`</tbody>`;
            htm += Html`</table>`;
            Html.set(gui.dialog.element.querySelector('.neighbors_summary'), htm);
        }
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
    Html.set(giftContainer, '');
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
                if (amount > 1) name += ' \xd7 ' + t_amount;
                piece += Html.br`<div title="${Html(gui.getMessage('neighbors_gifttip', name, t_xp, weekdayNames[gift.day]))}"><img src="${gui.getObjectImage(gift.type, gift.object_id)}">`;
                piece += Html.br`<i>${xp}</i><b>${Locale.formatNumber(amount)}</b>`;
            }
            giftCache[gid] = piece;
        }
        if (piece == '') continue;
        htm += piece + Html.br`<span>${formatDayMonthTime(palGift[2])}</span></div>`;
    }
    Html.set(giftContainer, htm);
}

function updateTeamMembers() {
    // Mark "to be refreshed" all previous rows
    if (teamMembers) {
        for (const id of Object.keys(teamMembers)) {
            const row = palRows[id];
            if (row) row.setAttribute('data-lazy', '');
        }
    }
    teamMembers = {};
    const generator = bgp.Data.generator;
    const team = bgp.Data.team;
    if (team && team.members) {
        for (const m of team.members) {
            const pal = {
                id: m.player_id, level: +m.level || 1, name: m.name || '', extra: {},
                country: m.country, logo_id: m.logo_id, score: +m.score, badge: m.badge
            };
            if (pal.id == generator.player_id) {
                pal.region = +generator.region;
                pal.extra.timeCreated = +generator.registered_on;
                palDays[pal.id] = Locale.getNumDays(pal.extra.timeCreated);
            }
            teamMembers[pal.id] = pal;
            let row = palRows[pal.id];
            if (!row) row = palRows[pal.id] = Html.get(Html`<tr data-pal-id="${pal.id}" height="61" data-lazy></tr>`)[0];
            row.setAttribute('data-lazy', '');
        }
    }
    const option = selectShow.querySelector('option[value=team]');
    Html.set(option, Html`${gui.getProperCase(gui.getString('GUI3223'))}`);
    option.disabled = Object.keys(teamMembers).length == 0;

    let htm = '';
    if (team) {
        htm += Html.br`<table>`;
        htm += Html.br`<tr>`;
        htm += Html.br`<td rowspan="2"><img height="50" style="margin-right:8px" src="${gui.getObjectImage('g_team', team.logo_id)}"></td>`;
        htm += Html.br`<td style="font-weight:bold">${team.name}</td>`;
        htm += Html.br`<td style="text-align:right">${gui.getMessageAndValue('friendship_score', Locale.formatNumber(team.score))}</td>`;
        htm += Html.br`</tr>`;
        htm += Html.br`<tr><td colspan="2"><span style="display:inline-block;max-width:400px">${team.description}</span></td></tr>`;
        htm += Html.br`</table>`;
    }
    Html.set(container.querySelector('.toolbar .team-info'), htm);
}

function update() {
    let htm;
    lastGiftDays = 0;
    palRows = {};
    palDays = {};
    const pals = Object.assign({}, bgp.Data.getNeighbours());
    // Remove Mr.Bill
    delete pals[1];
    htm = Object.values(pals).map(pal => {
        palDays[pal.id] = Locale.getNumDays(pal.extra.timeCreated);
        return Html`<tr data-pal-id="${pal.id}" height="61" data-lazy></tr>`;
    }).join('');
    const rows = Html.get(htm);
    rows.forEach(row => palRows[row.getAttribute('data-pal-id')] = row);

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

    const state = getState();
    htm = Html`<option value="">${gui.getMessage('gui_all')}</option>`;
    for (let rid = 1, maxRid = gui.getMaxRegion(); rid <= maxRid; rid++) htm += Html`<option value="${rid}">${gui.getObjectName('region', rid)}</option>`;
    Html.set(selectRegion, htm);
    setState(state);

    updateTeamMembers();

    refresh();
}

function markNeighbor(neighborId) {
    gui.setLazyRender(container.querySelector('tr[data-pal-id="' + neighborId + '"]'));
}

function updateRow(row) {
    const id = row.getAttribute('data-pal-id');
    const teamMember = teamMembers[id];
    const pal = bgp.Data.getNeighbour(id) || teamMember;
    if (!pal) return;
    const isOnlyTeamMember = pal === teamMember;
    const friend = Object.values(bgp.Data.getFriends()).find(friend => friend.uid == id);
    const anchor = friend ? gui.getFriendAnchor(friend) : Html.raw('<a class="no-link">');
    let htm = '';
    htm += Html.br`<td>`;
    if (teamMember) htm += Html.br`<img class="team-img ${isOnlyTeamMember ? 'team-no-pal' : ''} tooltip-event" height="50" width="50" src="${gui.getObjectImage('g_team', teamMember.logo_id)}"/>`;
    if (!isOnlyTeamMember) htm += Html.br`${anchor}<img class="tooltip-event" height="50" width="50" src="${gui.getNeighborAvatarUrl(pal)}"/></a>`;
    htm += Html.br`</td>`;
    const fullName = gui.getPlayerNameFull(pal);
    htm += Html.br`<td>`;
    htm += Html.br`<div class="extra">`;
    if (teamMember) htm += Html.br`<span class="team-name">${teamMember.name}</span>`;
    if (teamMember && teamMember.badge == 'leader') htm += Html.br`<span class="team-badge">${gui.getString('GUI3254')}</span>`;
    if (bgp.Data.isAdmin) htm += Html.br`<span class="id">#${pal.id}</span>`;
    htm += Html.br`</div>`;
    let addBr = false;
    if (friend && friend.name == fullName) {
        htm += Html.br`${anchor}${fullName}</a>`;
        addBr = true;
    } else {
        if (!teamMember || fullName != teamMember.name) {
            htm += Html.br`<a class="no-link">${fullName}</a>`;
            addBr = true;
        }
        let extra = '';
        if (friend) extra = Html.br`${anchor}${friend.name}</a>`;
        else if (pal.extra.fn && pal.extra.fn != fullName) extra = Html.br`<span class="friendname">${pal.extra.fn}</span>`;
        if (extra) {
            htm += (addBr ? `<br>` : '') + extra;
            addBr = true;
        }
    }
    if (!isOnlyTeamMember) {
        if (addBr) { htm += Html.br`<br>`; addBr = false; }
        htm += Html.br`<input class="note n-note" type="text" maxlength="50" placeholder="${gui.getMessage('gui_nonote')}" value="${pal.extra.note}"></td>`;
    }
    if (pal.region) {
        htm += Html.br`<td>${gui.getRegionImg(pal.region)}</td>`;
    } else {
        htm += Html.br`<td></td>`;
    }
    htm += Html.br`<td>${Locale.formatNumber(pal.level)}</td>`;
    htm += Html.br`<td class="team-score">${teamMember ? Locale.formatNumber(teamMember.score) : ''}</td>`;
    if (pal.extra.lastLevel && pal.extra.lastLevel != pal.level) {
        htm += Html.br`<td title="${Locale.formatDate(pal.extra.timeLevel)} (${Locale.formatNumber(pal.extra.lastLevel)})">${Locale.formatDays(pal.extra.timeLevel)}</td>`;
    } else {
        htm += Html.br`<td></td>`;
    }
    if (pal.extra.timeCreated) {
        htm += Html.br`<td>${Locale.formatDate(pal.extra.timeCreated)}<br>${Locale.formatDaysNum(palDays[pal.id])}</td>`;
    } else {
        htm += Html.br`<td></td>`;
    }
    if (pal.c_list > 0) {
        htm += Html.br`<td><img src="/img/gui/clist.png"></td>`;
    } else {
        htm += Html.br`<td></td>`;
    }
    const blocks = pal.extra.blocks;
    if (isOnlyTeamMember) {
        htm += Html.br`<td></td>`;
    } else if (blocks === undefined) {
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
    if (gifts) {
        const count = gifts.length;
        const className = count > 0 ? 'has-gifts' : '';
        const efficiency = palEfficiency[id];
        htm += Html.br`<td class="${className}">${Locale.formatNumber(count)}</td>`;
        htm += Html.br`<td class="${className}">${Locale.formatNumber(gifts._value)}</td>`;
        htm += Html.br`<td class="${className}">${isNaN(efficiency) ? '' : Locale.formatNumber(efficiency) + ' %'}</td>`;
    } else {
        htm += Html.br`<td></td><td></td><td></td>`;
    }
    const row2 = palRows[id] = Html.get('<tr>' + htm + '</tr>')[0];
    row2.setAttribute('data-pal-id', id);
    row.replaceWith(row2);
}

let scheduledRefresh;

function refresh() {
    triggerSearchHandler(false);
    gui.updateTabState(tab);
    updateButton();

    //smartTable.showFixed(false);
    Html.set(smartTable.tbody[0], '');

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
        calculation.defineConstant('today', Math.floor((new Date()).setHours(0, 0, 0, 0) / 1000));
        calculation.defineConstant('day', 86400);
        calculation.defineConstant('giftdays', Math.max(7, +getState().days || 0));
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
    Html.set(selectShow.querySelector('option[value="nogift"]'), Html(gui.getMessage('neighbors_nogift', Locale.formatNumber(+state.days))));

    const getSortValueFunctions = {
        name: pal => palNames[pal.id] || '',
        region: pal => +pal.region,
        level: pal => +pal.level,
        score: pal => teamMembers[pal.id] ? teamMembers[pal.id].score : +pal.level,
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
    const getCalculatorValueFunctions = Object.assign({}, getSortValueFunctions, {
        lastgift: pal => pal.extra.lastGift || NaN,
        levelup: pal => (pal.extra.lastLevel && pal.extra.lastLevel != pal.level) ? pal.extra.timeLevel : NaN,
        list: pal => +pal.c_list ? 1 : 0,
    });

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

    const allNeighbors = Object.assign({}, bgp.Data.getNeighbours());
    delete allNeighbors[1];
    let neighbors = Object.values(allNeighbors);

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
            palRows[pal.id].setAttribute('data-lazy', '');
            const days = -palDays[pal.id];
            palEfficiency[pal.id] = Math.min(100, Math.ceil((days < 7 ? NaN : gifts.length / Math.min(days, giftDays)) * 100));
        }
        const dt = Locale.getDate(minDate);
        dt.setHours(0, 0, 0, 0);
        const realGiftDays = Math.min(Math.ceil((Date.now() - dt.getTime()) / 86400000), giftDays);
        let text = gui.getMessage('neighbors_totxpstats', Locale.formatNumber(giftCount), Locale.formatNumber(realGiftDays), Locale.formatNumber(giftTotal), Locale.formatNumber(Math.floor(giftTotal / realGiftDays)));
        text += '\n' + gui.getMessage('neighbors_avgxpstats', Locale.formatNumber(giftTotal / giftCount, 1), Locale.formatNumber(giftTotal / neighbors.length / realGiftDays, 1));
        Html.set(container.querySelector('.stats .gift-info'), Html.br(text));
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
    const calculator = getCalculator(filterExpression, getCalculatorValueFunctions);
    const friendNames = {};
    for (const friend of Object.values(bgp.Data.getFriends())) friendNames[friend.uid] = '\t' + friend.name.toUpperCase();
    const rid = +selectRegion.value;
    if (show == 'team') {
        const team = bgp.Data.team;
        if (team && team.members) {
            neighbors = [];
            for (const m of team.members) {
                const pal = allNeighbors[m.player_id] || teamMembers[m.player_id];
                neighbors.push(pal);
            }
        }
    }
    for (const pal of neighbors) {
        if (rid != 0 && pal.region != rid) continue;
        if (show == 'list' && list != (+pal.c_list ? 0 : 1)) continue;
        if (show == 'withblocks' && !(pal.extra.blocks > 0)) continue;
        if (show == 'unknownblocks' && pal.extra.blocks !== undefined) continue;
        if (show == 'expiredwm' && !(pal.extra.wmtime <= now)) continue;
        else if (show == 'nogift' && (pal.extra.lastGift || pal.extra.timeCreated) >= days) continue;
        const fullname = gui.getPlayerNameFull(pal).toUpperCase();
        const teamMember = show == 'team' ? teamMembers[pal.id] : null;
        if (fnSearch && !fnSearch(`${fullname}\t\n${pal.extra.note || ''}\t${teamMember ? teamMember.name : ''}\t${friendNames[pal.id] || ''}\t${pal.extra.fn || ''}`)) continue;
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
        palNames[pal.id] = teamMember ? teamMember.name : fullname;
        items.push(pal);
    }

    Html.set(smartTable.tbody[0], '');
    Array.from(container.querySelectorAll('.neighbors tfoot td')).forEach(cell => {
        Html.set(cell, Html(gui.getMessageAndFraction('gui_items_found', Locale.formatNumber(items.length), Locale.formatNumber(neighbors.length))));
    });

    container.classList.toggle('show-id', bgp.Data.isAdmin && !!state.id);
    container.classList.toggle('show-team', state.show == 'team');

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
    const htm = Html.br`<div class="neighbors-tooltip"><img width="108" height="108" src="${element.src}"/></div>`;
    Tooltip.show(element, htm);
}