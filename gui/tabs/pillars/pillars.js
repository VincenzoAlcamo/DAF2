/*global bgp gui SmartTable Locale Html HtmlBr*/
export default {
    hasCSS: true,
    init: init,
    update: update,
    getState: getState,
    setState: setState,
    requires: ['materials', 'decorations', 'levelups', 'sales']
};

var tab, container, smartTable, pillars, selectShow, searchInput, searchHandler, checkCap, checkGrid;

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
}

function update() {
    var ids = {};
    for (var i = 865; i <= 904; i++) ids[i] = true;

    var decorations = bgp.Data.files.decorations;
    pillars = [];
    var pillarsExcluded = getPillarsExcluded();
    var cdn = bgp.Data.generator.cdn_root;
    if (cdn) cdn += 'mobile/graphics/decorations/';
    Object.values(bgp.Data.files.sales)
        .filter(sale => sale.type == 'decoration' && sale.object_id in ids && sale.hide != 1)
        .forEach(sale => {
            var decoration = decorations[sale.object_id];
            var req = sale.requirements[0];
            if (decoration && req) {
                var pillar = {};
                pillar.did = +decoration.def_id;
                pillar.img = cdn + decoration.mobile_asset + '.png';
                pillar.excluded = pillarsExcluded.includes(pillar.did);
                pillar.name = bgp.Data.getString(decoration.name_loc);
                pillar.xp = sale.exp;
                pillar.coins = +decoration.sell_price;
                pillar.mname = bgp.Data.getMaterialName(req.material_id);
                pillar.required = +req.amount;
                pillar.available = bgp.Data.generator.materials[req.material_id] || 0;
                pillar.possible = Math.floor(pillar.available / pillar.required);
                pillar.perc_next = (pillar.available - (pillar.possible * pillar.required)) / pillar.required * 100;
                pillar.qty = pillar.excluded ? 0 : pillar.possible;
                pillar.predicted_xp = pillar.qty * pillar.xp;
                pillar.predicted_coins = pillar.qty * pillar.coins;
                pillar.level = +sale.level;
                pillar.skin = sale.req_type == 'camp_skin' ? +sale.req_object : 1;
                pillars.push(pillar);
            }
        });
    refresh();
}

function triggerSearchHandler(flag) {
    if (searchHandler) clearTimeout(searchHandler);
    searchHandler = flag ? setTimeout(refresh, 500) : 0;
}

function getState() {
    var getSort = (sortInfo, defaultValue) => sortInfo && (sortInfo.name != defaultValue || !sortInfo.ascending) ? smartTable.sortInfo2string(sortInfo) : '';
    return {
        show: selectShow.value,
        search: searchInput.value,
        uncapped: !checkCap.checked,
        grid: checkGrid.checked,
        sort: getSort(smartTable.sort, 'name')
    };
}

function setState(state) {
    searchInput.value = state.search || '';
    selectShow.value = state.show == 'possible' ? state.show : '';
    checkCap.checked = state.uncapped != 1;
    checkGrid.checked = state.grid == 1;
    var sortInfo = smartTable.checkSortInfo(smartTable.string2sortInfo(state.sort), false);
    if (!sortInfo.name) {
        sortInfo.name = 'name';
        sortInfo.ascending = true;
    }
    smartTable.setSortInfo(sortInfo, false);
}

function toggleCap() {
    gui.updateTabState(tab);
    var state = getState();
    pillars.forEach(pillar => updateQty(pillar, state));
    refreshTotals();
}

function getPillarsExcluded() {
    return gui.getArrayOfInt(bgp.Preferences.getValue('pillarsExcluded'));
}

function updatePillar(e) {
    var el = e.target;
    var td = el.parentNode;
    var did = parseInt(td.getAttribute('did'));
    var pillar = pillars.find(pillar => pillar.did == did);
    if (el.type == 'checkbox') {
        pillar.excluded = !el.checked;
        var pillarsExcluded = getPillarsExcluded().filter(id => id != pillar.did);
        if (pillar.excluded) pillarsExcluded.push(pillar.did);
        bgp.Preferences.setValue('pillarsExcluded', pillarsExcluded.join(','));
        (td.classList.contains('grid') ? td : td.parentNode).classList.toggle('excluded', pillar.excluded);
        pillar.qty = pillar.excluded ? 0 : pillar.possible;
    } else {
        pillar.qty = el.value;
    }
    updateQty(pillar);
    refreshTotals();
}

function updateQty(pillar, state) {
    state = state || getState();
    var max = state.uncapped ? 999 : pillar.possible;
    pillar.qty = Math.min(Math.max(pillar.qty, 0), max);
    pillar.predicted_xp = pillar.qty * pillar.xp;
    pillar.predicted_coins = pillar.qty * pillar.coins;
    var td = container.querySelector('td[did="' + pillar.did + '"]');
    if (td) {
        var input = td.querySelector('input[type=number]');
        input.value = pillar.qty;
        input.max = max;
        if (!td.classList.contains('grid')) {
            td.nextElementSibling.innerText = Locale.formatNumber(pillar.predicted_xp);
            td.nextElementSibling.nextElementSibling.innerText = Locale.formatNumber(pillar.predicted_coins);
        }
    }
}

function refreshTotals() {
    function setProgress(className, level, xp) {
        Array.from(container.querySelectorAll(className)).forEach(parent => {
            var levelup = bgp.Data.files.levelups[level];
            var div = parent.querySelectorAll('div');
            div[1].innerHTML = Html `${gui.getMessage('gui_level')}: ${Locale.formatNumber(level)}<br/>${gui.getMessage('gui_xp')}: ${Locale.formatNumber(xp)}`;
            div[2].innerHTML = Html `${gui.getMessage('gui_level')}: ${Locale.formatNumber(level+1)}<br/>${gui.getMessage('gui_xp')}: ${Locale.formatNumber(levelup.xp)}`;
            div[3].innerHTML = Html `${Locale.formatNumber(xp / levelup.xp * 100, 2)}%`;
            div = parent.querySelector('progress');
            div.setAttribute('value', xp);
            div.setAttribute('max', levelup.xp);
        });
    }
    var tot, qty, xp, coins, maxXp, maxCoins, maxBoost, level, exp, nextLevel, nextExp, boost, totalExp;
    // eslint-disable-next-line no-unused-vars
    var maxLevel;
    tot = qty = xp = coins = boost = maxXp = maxCoins = maxBoost = 0;
    pillars.forEach(pillar => {
        tot += pillar.possible;
        qty += pillar.qty;
        xp += pillar.predicted_xp;
        coins += pillar.predicted_coins;
        maxXp += pillar.possible * pillar.xp;
        maxCoins += pillar.possible * pillar.coins;
    });
    level = nextLevel = maxLevel = +bgp.Data.generator.level;
    exp = +bgp.Data.generator.exp;
    nextExp = exp + xp;
    totalExp = exp + maxXp;
    for (var levelup of bgp.Data.files.levelups) {
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
    var level = bgp.Data.generator.level;
    var skins = gui.getArrayOfInt(bgp.Data.generator.skins || '1');
    state.search = (state.search || '').toUpperCase();

    function isVisible(p) {
        if (state.show == 'possible' && (p.possible == 0 || level < p.level || !skins.includes(p.skin))) return false;
        if (state.search && p.name.toUpperCase().indexOf(state.search) < 0) return false;
        return true;
    }

    let name = smartTable.sort.name;
    if (name == 'region') name = 'skin';
    pillars.sort((a, b) => (name != 'name' ? a[name] - b[name] : 0) || a.name.localeCompare(b.name));
    if (!smartTable.sort.ascending) pillars.reverse();

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

    var htm = '',
        isOdd = false,
        titleIgnore = gui.getMessage('pillars_ignore'),
        index = 0;
    pillars.filter(isVisible).forEach(pillar => {
        var htmInputs = HtmlBr `<input type="checkbox" ${pillar.excluded ? '' : 'checked'} title="${titleIgnore}"><input type="number" name="${pillar.did}" title="${pillar.name} (${pillar.possible})" value="${pillar.qty}" step="1" min="0" max="${state.uncapped ? 999 : pillar.possible}">`;
        if (state.grid) {
            index++;
            if (index == 9) {
                htm += `</tr><tr>`;
                index = 1;
            }
            htm += HtmlBr `<td class="image grid${pillar.excluded ? ' excluded' : ''}" did="${pillar.did}"><img height="50" lazy-src="${pillar.img}" title="${Html(pillar.name)}"/>${htmInputs}</td>`;
        } else {
            isOdd = !isOdd;
            htm += HtmlBr `<tr class="${isOdd ? 'odd' : ''}${pillar.excluded ? ' excluded' : ''}">`;
            htm += HtmlBr `<td class="image"><img height="50" lazy-src="${pillar.img}" title="${Html(pillar.name)}"/></td>`;
            htm += HtmlBr `<td>${pillar.name}</td>`;
            htm += HtmlBr `<td>${gui.getSkinImage(pillar.skin)}</td>`;
            htm += HtmlBr `<td>${Locale.formatNumber(pillar.level)}</td>`;
            htm += HtmlBr `<td>${Locale.formatNumber(pillar.xp)}</td>`;
            htm += HtmlBr `<td>${Locale.formatNumber(pillar.coins)}</td>`;
            htm += HtmlBr `<td>${Locale.formatNumber(pillar.required)}</td>`;
            htm += HtmlBr `<td>${Locale.formatNumber(pillar.available)}</td>`;
            htm += HtmlBr `<td>${Locale.formatNumber(pillar.perc_next, 2)}%</td>`;
            htm += HtmlBr `<td>${Locale.formatNumber(pillar.possible)}</td>`;
            htm += HtmlBr `<td did="${pillar.did}">${htmInputs}</td>`;
            htm += HtmlBr `<td>${Locale.formatNumber(pillar.predicted_xp)}</td>`;
            htm += HtmlBr `<td>${Locale.formatNumber(pillar.predicted_coins)}</td>`;
            htm += HtmlBr `</tr>`;
        }
    });
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
    gui.collectLazyImages(smartTable.container);
    smartTable.syncLater();
}