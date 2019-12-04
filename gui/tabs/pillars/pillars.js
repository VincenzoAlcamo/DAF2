/*global bgp gui SmartTable Locale Html Tooltip*/
export default {
    hasCSS: true,
    init: init,
    update: update,
    getState: getState,
    setState: setState,
    requires: ['materials', 'decorations', 'levelups', 'sales']
};

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
    let pillarsInfo = bgp.Data.getPillarsInfo();

    let sales = gui.getFile('sales');
    let decorations = gui.getFile('decorations');
    let materialInventory = gui.getGenerator().materials;
    pillars = [];
    for (let saleId of pillarsInfo.sales) {
        let sale = sales[saleId];
        let decoration = decorations[sale.object_id];
        let req = sale.requirements[0];
        if (decoration && req) {
            let matId = req.material_id;
            let pillar = {};
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
    checkCap.checked = !!state.uncapped;
    checkGrid.checked = !!state.grid;
    pillarsExcluded = gui.getArrayOfInt(state.excluded);
    gui.setSortState(state.sort, smartTable, 'name');
}

function toggleCap() {
    gui.updateTabState(tab);
    let state = getState();
    pillars.forEach(pillar => updateQty(pillar, state));
    refreshTotals();
}

function updatePillar(e) {
    let el = e.target;
    let td = el.parentNode;
    let did = parseInt(td.getAttribute('did'));
    let pillar = pillars.find(pillar => pillar.did == did);
    if (el.type == 'checkbox') {
        if (e.ctrlKey) {
            e.preventDefault();
            let setAsMax = pillar.qty == 0;
            for (let pillar of pillars) {
                pillar.qty = setAsMax ? pillar.possible : 0;
                updateQty(pillar);
            }
        } else {
            pillar.excluded = !el.checked;
            pillarsExcluded = pillarsExcluded.filter(id => id != pillar.did);
            if (pillar.excluded) pillarsExcluded.push(pillar.did);
            gui.updateTabState(tab);
            (td.classList.contains('grid') ? td : td.parentNode).classList.toggle('excluded', pillar.excluded);
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
    let max = state.uncapped ? 999 : pillar.possible;
    pillar.qty = Math.min(Math.max(pillar.qty, 0), max);
    pillar.predicted_xp = pillar.qty * pillar.xp;
    pillar.predicted_coins = pillar.qty * pillar.coins;
    let input = container.querySelector('td[did="' + pillar.did + '"] input[type=number]');
    if (input) {
        input.value = pillar.qty;
        input.max = max;
        let td = input.parentNode;
        if (!td.classList.contains('grid')) {
            td.nextElementSibling.innerText = Locale.formatNumber(pillar.predicted_xp);
            td.nextElementSibling.nextElementSibling.innerText = Locale.formatNumber(pillar.predicted_coins);
        }
    }
}

function refreshTotals() {
    let levelups = gui.getFile('levelups');

    function setProgress(className, level, xp) {
        Array.from(container.querySelectorAll(className)).forEach(parent => {
            let levelup = levelups[level - 1];
            let div = parent.querySelectorAll('div');
            div[1].innerHTML = Html `${gui.getMessage('gui_level')}: ${Locale.formatNumber(level)}<br/>${gui.getMessage('gui_xp')}: ${Locale.formatNumber(xp)}`;
            div[2].innerHTML = Html `${gui.getMessage('gui_level')}: ${Locale.formatNumber(level+1)}<br/>${gui.getMessage('gui_xp')}: ${Locale.formatNumber(levelup.xp)}`;
            div[3].innerHTML = Html `${Locale.formatNumber(xp / levelup.xp * 100, 2)}%`;
            div = parent.querySelector('progress');
            div.setAttribute('value', xp);
            div.setAttribute('max', levelup.xp);
        });
    }
    let tot, qty, xp, coins, maxXp, maxCoins, maxBoost, level, exp, nextLevel, nextExp, boost, totalExp;
    // eslint-disable-next-line no-unused-vars
    let maxLevel;
    tot = qty = xp = coins = boost = maxXp = maxCoins = maxBoost = 0;
    pillars.forEach(pillar => {
        tot += pillar.possible;
        qty += pillar.qty;
        xp += pillar.predicted_xp;
        coins += pillar.predicted_coins;
        maxXp += pillar.possible * pillar.xp;
        maxCoins += pillar.possible * pillar.coins;
    });
    let generator = gui.getGenerator();
    level = nextLevel = maxLevel = +generator.level;
    exp = +generator.exp;
    nextExp = exp + xp;
    totalExp = exp + maxXp;
    for (let levelup of levelups) {
        if (levelup.def_id < level) continue;
        if (nextExp >= levelup.xp) {
            boost += levelup.boost;
            nextExp -= levelup.xp;
            // coins += levelup.coins;
            nextLevel++;
        }
        if (totalExp >= levelup.xp) {
            maxBoost += levelup.boost;
            totalExp -= levelup.xp;
            // maxCoins += levelup.coins;
            // maxLevel++;
        }
    }
    Array.from(container.querySelectorAll('.pillars-totals')).forEach(row => {
        row.cells[1].innerText = Locale.formatNumber(tot);
        row.cells[2].innerText = Locale.formatNumber(qty);
        row.cells[3].innerText = Locale.formatNumber(xp);
        row.cells[4].innerText = Locale.formatNumber(coins);
    });
    setProgress('.pillars-current', level, exp);
    setProgress('.pillars-next', nextLevel, nextExp);
    Array.from(container.querySelectorAll('.pillars-boost')).forEach(el => {
        el.innerText = Locale.formatNumber(boost);
    });
    container.querySelector('.pillars-stats').innerText = gui.getMessage('pillars_stats', Locale.formatNumber(tot), Locale.formatNumber(maxXp), Locale.formatNumber(maxCoins), Locale.formatNumber(maxBoost));
}

function refresh() {
    triggerSearchHandler(false);
    gui.updateTabState(tab);

    smartTable.showFixed(false);
    smartTable.tbody[0].innerHTML = '';

    let state = getState();
    let generator = gui.getGenerator();
    let level = +generator.level;
    let region = +generator.region;
    let fnSearch = gui.getSearchFilter(state.search);

    function isVisible(p) {
        if (state.show == 'possible' && (p.possible == 0 || level < p.level || region < p.region)) return false;
        if (fnSearch && !fnSearch(p.name.toUpperCase())) return false;
        return true;
    }

    let sort = gui.getSortFunction(null, smartTable, 'name');
    pillars = sort(pillars);

    Array.from(container.querySelectorAll('.pillars thead th')).forEach(th => {
        th.colSpan = state.grid && !th.previousElementSibling ? 8 : 1;
        th.style.display = state.grid && th.previousElementSibling ? 'none' : '';
    });
    Array.from(container.querySelectorAll('.pillars tfoot tr')).forEach(tr => {
        switch (tr.getAttribute('data-row')) {
            case '1':
                tr.style.display = state.grid ? 'none' : '';
                break;
            case '2':
                tr.cells[0].colSpan = state.grid ? 8 : 13;
                break;
            case '3':
                tr.cells[0].colSpan = state.grid ? 4 : 9;
                break;
        }
    });

    let htm = '';
    let isOdd = false;
    let titleIgnore = gui.getMessage('pillars_ignore');
    let index = 0;
    for (let pillar of pillars.filter(isVisible)) {
        let htmInputs = Html.br `<input type="checkbox" ${pillar.excluded ? '' : 'checked'} title="${titleIgnore}"><input type="number" name="${pillar.did}" title="${pillar.name} (${pillar.possible})" value="${pillar.qty}" step="1" min="0" max="${state.uncapped ? 999 : pillar.possible}">`;
        if (state.grid) {
            index++;
            if (index == 9) {
                htm += `</tr><tr>`;
                index = 1;
            }
            htm += Html.br `<td class="image grid${pillar.excluded ? ' excluded' : ''}" did="${pillar.did}"><img height="50" lazy-src="${pillar.img}" title="${Html(pillar.name)}" class="tooltip-event"/>${htmInputs}</td>`;
        } else {
            isOdd = !isOdd;
            htm += Html.br `<tr class="${isOdd ? 'odd' : ''}${pillar.excluded ? ' excluded' : ''}">`;
            htm += Html.br `<td class="image" did="${pillar.did}"><img height="50" lazy-src="${pillar.img}" title="${Html(pillar.name)}" class="tooltip-event"></td>`;
            htm += Html.br `<td>${pillar.name}</td>`;
            htm += Html.br `<td>${gui.getRegionImg(pillar.region)}</td>`;
            htm += Html.br `<td>${Locale.formatNumber(pillar.level)}</td>`;
            htm += Html.br `<td>${Locale.formatNumber(pillar.xp)}</td>`;
            htm += Html.br `<td>${Locale.formatNumber(pillar.coins)}</td>`;
            htm += Html.br `<td>${Locale.formatNumber(pillar.required)}</td>`;
            htm += Html.br `<td class="material" style="background-image:url(${pillar.matimg})" title="${Html(pillar.mname)}">${Locale.formatNumber(pillar.available)}</td>`;
            htm += Html.br `<td>${Locale.formatNumber(pillar.perc_next, 2)}%</td>`;
            htm += Html.br `<td>${Locale.formatNumber(pillar.possible)}</td>`;
            htm += Html.br `<td did="${pillar.did}">${htmInputs}</td>`;
            htm += Html.br `<td>${Locale.formatNumber(pillar.predicted_xp)}</td>`;
            htm += Html.br `<td>${Locale.formatNumber(pillar.predicted_coins)}</td>`;
            htm += Html.br `</tr>`;
        }
    }
    if (state.grid && index > 0) {
        while (index++ < 8) htm += `<td class="grid"></td>`;
        htm = `<tr>` + htm + `</tr>`;
    }
    smartTable.tbody[0].innerHTML = htm;
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
    let element = event.target;
    element.removeAttribute('title');
    let did = parseInt(element.parentNode.getAttribute('did'));
    let pillar = pillars.find(pillar => pillar.did == did);
    let htm = Html.br `<div class="pillars-tooltip"><img src="${pillar.img}"}" class="outlined"/><span>${pillar.name}</span></div>`;
    Tooltip.show(element, htm);
}