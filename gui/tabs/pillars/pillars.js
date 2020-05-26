/*global gui SmartTable Locale Html Tooltip Dialog*/
export default {
    hasCSS: true,
    init: init,
    update: update,
    getState: getState,
    setState: setState,
    requires: ['materials', 'decorations', 'levelups', 'sales', 'usables', 'xp']
};

const GRID_COLUMNS = 10;

let tab, container, smartTable, pillars, selectShow, searchInput, searchHandler, checkCap, checkGrid;
let pillarsExcluded = [];

function init() {
    tab = this;
    container = tab.container;

    selectShow = container.querySelector('[name=show]');
    selectShow.addEventListener('change', refresh);
    searchInput = container.querySelector('[name=search]');
    searchInput.addEventListener('input', () => triggerSearchHandler(true));
    checkCap = container.querySelector('[name=cap]');
    checkCap.addEventListener('click', toggleCap);
    checkGrid = container.querySelector('[name=grid]');
    checkGrid.addEventListener('click', refresh);

    smartTable = new SmartTable(container.querySelector('.data'));
    smartTable.onSort = refresh;
    smartTable.fixedHeader.parentNode.classList.add('pillars');
    smartTable.fixedFooter.parentNode.classList.add('pillars');

    container.addEventListener('tooltip', onTooltip);
}

function update() {
    const pillarsInfo = gui.getPillarsInfo();
    const sales = gui.getFile('sales');
    const decorations = gui.getFile('decorations');
    const materialInventory = gui.getGenerator().materials;
    pillars = [];
    for (const saleId of pillarsInfo.sales) {
        const sale = sales[saleId];
        const decoration = decorations[sale.object_id];
        const req = sale.requirements[0];
        if (decoration && req) {
            const matId = req.material_id;
            const pillar = {};
            pillar.did = +decoration.def_id;
            pillar.img = gui.getObjectImage('decoration', pillar.did);
            pillar.excluded = pillarsExcluded.includes(pillar.did);
            pillar.name = gui.getObjectName('decoration', pillar.did);
            pillar.xp = +sale.exp;
            pillar.coins = +decoration.sell_price;
            pillar.mname = gui.getObjectName('material', matId) + '\n' + gui.getMessage('gui_xp') + ': ' + Locale.formatNumber(gui.getXp('material', matId));
            pillar.required = +req.amount;
            pillar.available = materialInventory[matId] || 0;
            pillar.matimg = gui.getObjectImage('material', matId, true);
            pillar.possible = Math.floor(pillar.available / pillar.required);
            pillar.perc_next = (pillar.available - (pillar.possible * pillar.required)) / pillar.required * 100;
            pillar.qty = pillar.excluded ? 0 : pillar.possible;
            pillar.predicted_xp = pillar.qty * pillar.xp;
            pillar.predicted_coins = pillar.qty * pillar.coins;
            pillar.level = +sale.level;
            pillar.region = (sale.req_type == 'camp_skin' ? gui.getRegionFromSkin(+sale.req_object) : 0) || 1;
            pillars.push(pillar);
        }
    }
    refresh();
}

function triggerSearchHandler(flag) {
    if (searchHandler) clearTimeout(searchHandler);
    searchHandler = flag ? setTimeout(refresh, 500) : 0;
}

function getState() {
    return {
        show: selectShow.value,
        search: searchInput.value,
        uncapped: !checkCap.checked,
        excluded: pillarsExcluded.join(','),
        grid: checkGrid.checked,
        sort: gui.getSortState(smartTable, 'name')
    };
}

function setState(state) {
    searchInput.value = state.search || '';
    selectShow.value = state.show == 'possible' ? state.show : '';
    checkCap.checked = !('uncapped' in state);
    checkGrid.checked = !!state.grid;
    pillarsExcluded = gui.getArrayOfInt(state.excluded);
    gui.setSortState(state.sort, smartTable, 'name');
}

function toggleCap() {
    gui.updateTabState(tab);
    const state = getState();
    pillars.forEach(pillar => updateQty(pillar, state));
    refreshTotals();
}

function updatePillar(e) {
    const el = e.target;
    const td = el.parentNode;
    const did = parseInt(td.getAttribute('did'));
    const pillar = pillars.find(pillar => pillar.did == did);
    if (el.type == 'checkbox') {
        if (e.ctrlKey) {
            // e.preventDefault();
            const flag = el.checked;
            const state = getState();
            for (const pillar of pillars) {
                pillar.excluded = !flag;
                pillar.qty = pillar.excluded ? 0 : pillar.possible;
                updateQty(pillar, state);
            }
            pillarsExcluded = pillars.filter(pillar => pillar.excluded).map(pillar => pillar.did);
            gui.updateTabState(tab);
        } else if (e.altKey) {
            e.preventDefault();
            const setAsMax = pillar.qty == 0;
            for (const pillar of pillars) {
                pillar.qty = setAsMax ? pillar.possible : 0;
                updateQty(pillar);
            }
        } else {
            pillar.excluded = !el.checked;
            pillarsExcluded = pillarsExcluded.filter(id => id != pillar.did);
            if (pillar.excluded) pillarsExcluded.push(pillar.did);
            gui.updateTabState(tab);
            pillar.qty = pillar.excluded ? 0 : pillar.possible;
        }
    } else {
        pillar.qty = +el.value;
    }
    updateQty(pillar);
    refreshTotals();
}

function updateQty(pillar, state) {
    state = state || getState();
    const max = state.uncapped ? 999 : pillar.possible;
    pillar.qty = Math.min(Math.max(pillar.qty, 0), max);
    pillar.predicted_xp = pillar.qty * pillar.xp;
    pillar.predicted_coins = pillar.qty * pillar.coins;
    const input = container.querySelector('td[did="' + pillar.did + '"] input[type=number]');
    if (input) {
        input.value = pillar.qty;
        input.max = max;
        const td = input.parentNode;
        if (!td.classList.contains('grid')) {
            td.nextElementSibling.innerText = Locale.formatNumber(pillar.predicted_xp);
            td.nextElementSibling.nextElementSibling.innerText = Locale.formatNumber(pillar.predicted_coins);
        }
        td.querySelector('input[type=checkbox]').checked = !pillar.excluded;
        (td.classList.contains('grid') ? td : td.parentNode).classList.toggle('excluded', pillar.excluded);
    }
}

function refreshTotals() {
    const levelups = gui.getFile('levelups');

    function setProgress(className, level, xp) {
        Array.from(container.querySelectorAll(className)).forEach(parent => {
            const levelup = levelups[level - 1];
            let div = parent.querySelectorAll('div');
            Dialog.htmlToDOM(div[1], Html`${gui.getMessage('gui_level')}: ${Locale.formatNumber(level)}<br/>${gui.getMessage('gui_xp')}: ${Locale.formatNumber(xp)}`);
            Dialog.htmlToDOM(div[2], Html`${gui.getMessage('gui_level')}: ${Locale.formatNumber(level + 1)}<br/>${gui.getMessage('gui_xp')}: ${Locale.formatNumber(levelup.xp)}`);
            Dialog.htmlToDOM(div[3], Html`${Locale.formatNumber(xp / levelup.xp * 100, 2)}%`);
            div = parent.querySelector('progress');
            div.setAttribute('value', xp);
            div.setAttribute('max', levelup.xp);
        });
    }
    let tot, qty, xp, coins, maxXp, maxCoins;
    tot = qty = xp = coins = maxXp = maxCoins = 0;
    pillars.forEach(pillar => {
        tot += pillar.possible;
        qty += pillar.qty;
        xp += pillar.predicted_xp;
        coins += pillar.predicted_coins;
        maxXp += pillar.possible * pillar.xp;
        maxCoins += pillar.possible * pillar.coins;
    });
    const generator = gui.getGenerator();
    const level = +generator.level;
    const exp = +generator.exp;
    function calcGain(level, exp, boost, coins, food) {
        let nextLevel = level;
        for (const levelup of levelups) {
            if (levelup.def_id < level) continue;
            if (nextLevel > level) {
                levelup.reward.filter(reward => reward.type == 'usable').forEach(reward => food += gui.getXp(reward.type, reward.object_id) * reward.amount);
                boost += levelup.boost;
                coins += levelup.coins;
            }
            if (exp < levelup.xp) break;
            exp -= levelup.xp;
            nextLevel++;
        }
        return { nextLevel, exp, boost, coins, food };
    }
    const gain = calcGain(level, exp + xp, 0, 0, 0);
    const maxGain = calcGain(level, exp + maxXp, 0, maxCoins, 0);
    Array.from(container.querySelectorAll('.pillars-totals')).forEach(row => {
        row.cells[1].innerText = Locale.formatNumber(tot);
        row.cells[2].innerText = Locale.formatNumber(qty);
        row.cells[3].innerText = Locale.formatNumber(xp);
        row.cells[4].innerText = Locale.formatNumber(coins);
    });
    setProgress('.pillars-progress.pillars-current', level, exp);
    setProgress('.pillars-progress.pillars-next', gain.nextLevel, gain.exp);
    let gains = [];
    if (gain.boost) gains.push(Html`<span class="nowrap">${gui.getMessageAndValue('gui_energy', Locale.formatNumber(gain.boost))}</span>`);
    if (gain.food) gains.push(Html`<span class="nowrap">${gui.getMessageAndValue('gui_food', Locale.formatNumber(gain.food))}</span>`);
    if (gain.coins) gains.push(Html`<span class="nowrap">${gui.getMessageAndValue('gui_coins', Locale.formatNumber(gain.coins))}</span>`);
    gains = gains.join(', ');
    for (const el of Array.from(container.querySelectorAll('.pillars-gain'))) Dialog.htmlToDOM(el, gains);
    gains = [];
    gains.push(Html`<span class="nowrap">${gui.getMessageAndValue('pillars_maxpossible', Locale.formatNumber(tot))}</span>`);
    gains.push(Html`<span class="outlined nowrap">${gui.getMessageAndValue('gui_xp', Locale.formatNumber(maxXp))}</span>`);
    gains.push(Html`<span class="outlined nowrap">${gui.getMessageAndValue('gui_level', Locale.formatNumber(maxGain.nextLevel))}</span>`);
    if (maxGain.boost) gains.push(Html`<span class="nowrap">${gui.getMessageAndValue('gui_energy', Locale.formatNumber(maxGain.boost))}</span>`);
    if (maxGain.food) gains.push(Html`<span class="nowrap">${gui.getMessageAndValue('gui_food', Locale.formatNumber(maxGain.food))}</span>`);
    if (maxGain.coins) gains.push(Html`<span class="nowrap">${gui.getMessageAndValue('gui_coins', Locale.formatNumber(maxGain.coins))}</span>`);
    gains = gains.join(', ');
    Dialog.htmlToDOM(container.querySelector('.stats'), gains);
}

function refresh() {
    triggerSearchHandler(false);
    gui.updateTabState(tab);

    smartTable.showFixed(false);
    Dialog.htmlToDOM(smartTable.tbody[0], '');

    const state = getState();
    const generator = gui.getGenerator();
    const level = +generator.level;
    const region = +generator.region;
    const fnSearch = gui.getSearchFilter(state.search);

    function isVisible(p) {
        if (state.show == 'possible' && (p.possible == 0 || level < p.level || region < p.region)) return false;
        if (fnSearch && !fnSearch(p.name.toUpperCase())) return false;
        return true;
    }

    const sort = gui.getSortFunction(null, smartTable, 'name');
    pillars = sort(pillars);

    Array.from(container.querySelectorAll('.pillars thead th')).forEach(th => {
        const isFirstCol = th.classList.contains('firstcol');
        th.colSpan = state.grid && isFirstCol ? GRID_COLUMNS : (th.classList.contains('colspan3') ? 3 : 1);
        th.style.display = state.grid && !isFirstCol ? 'none' : '';
    });
    Array.from(container.querySelectorAll('.pillars tfoot tr')).forEach(tr => {
        switch (tr.getAttribute('data-row')) {
            case '1':
                tr.style.display = state.grid ? 'none' : '';
                break;
            case '2':
                tr.cells[0].colSpan = state.grid ? GRID_COLUMNS : 13;
                break;
        }
    });

    let htm = '';
    let isOdd = false;
    const titleIgnore = gui.getMessage('pillars_ignore');
    let index = 0;
    for (const pillar of pillars.filter(isVisible)) {
        const htmInputs = Html.br`<input type="checkbox" ${pillar.excluded ? '' : 'checked'} title="${titleIgnore}"><input type="number" name="${pillar.did}" title="${pillar.name} (${pillar.possible})" value="${pillar.qty}" step="1" min="0" max="${state.uncapped ? 999 : pillar.possible}">`;
        if (state.grid) {
            index++;
            if (index > GRID_COLUMNS) {
                htm += `</tr><tr>`;
                index = 1;
            }
            htm += Html.br`<td class="image grid${pillar.excluded ? ' excluded' : ''}" did="${pillar.did}"><img height="50" lazy-src="${pillar.img}" title="${Html(pillar.name)}" class="tooltip-event"/>${htmInputs}</td>`;
        } else {
            isOdd = !isOdd;
            htm += Html.br`<tr class="${isOdd ? 'odd' : ''}${pillar.excluded ? ' excluded' : ''}">`;
            htm += Html.br`<td class="image" did="${pillar.did}"><img height="50" lazy-src="${pillar.img}" title="${Html(pillar.name)}" class="tooltip-event"></td>`;
            htm += Html.br`<td>${pillar.name}</td>`;
            htm += Html.br`<td>${gui.getRegionImg(pillar.region)}</td>`;
            htm += Html.br`<td>${Locale.formatNumber(pillar.level)}</td>`;
            htm += Html.br`<td>${Locale.formatNumber(pillar.xp)}</td>`;
            htm += Html.br`<td>${Locale.formatNumber(pillar.coins)}</td>`;
            htm += Html.br`<td>${Locale.formatNumber(pillar.required)}</td>`;
            htm += Html.br`<td class="material" style="background-image:url(${pillar.matimg})" title="${Html(pillar.mname)}">${Locale.formatNumber(pillar.available)}</td>`;
            htm += Html.br`<td>${Locale.formatNumber(pillar.perc_next, 2)}%</td>`;
            htm += Html.br`<td>${Locale.formatNumber(pillar.possible)}</td>`;
            htm += Html.br`<td did="${pillar.did}">${htmInputs}</td>`;
            htm += Html.br`<td>${Locale.formatNumber(pillar.predicted_xp)}</td>`;
            htm += Html.br`<td>${Locale.formatNumber(pillar.predicted_coins)}</td>`;
            htm += Html.br`</tr>`;
        }
    }
    if (state.grid && index > 0) {
        while (index++ < GRID_COLUMNS) htm += `<td class="grid"></td>`;
        htm = `<tr>` + htm + `</tr>`;
    }
    Dialog.htmlToDOM(smartTable.tbody[0], htm);
    Array.from(smartTable.tbody[0].querySelectorAll('input[type=checkbox]')).forEach(input => {
        input.addEventListener('click', updatePillar);
    });
    Array.from(smartTable.tbody[0].querySelectorAll('input[type=number]')).forEach(input => {
        input.addEventListener('input', updatePillar);
    });
    refreshTotals();
    gui.collectLazyElements(smartTable.container);
    smartTable.syncLater();
}

function onTooltip(event) {
    const element = event.target;
    element.removeAttribute('title');
    const did = parseInt(element.parentNode.getAttribute('did'));
    const pillar = pillars.find(pillar => pillar.did == did);
    const htm = Html.br`<div class="pillars-tooltip"><img src="${pillar.img}"}" class="outlined"/><span>${pillar.name}</span></div>`;
    Tooltip.show(element, htm);
}