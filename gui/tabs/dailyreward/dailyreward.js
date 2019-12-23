/*global gui Html Locale Calculation*/
export default {
    hasCSS: true,
    init,
    update,
    requires: ['daily_rewards', 'materials', 'buildings', 'tokens', 'usables']
};

let tab, container, divRewards, divStats;

function init() {
    tab = this;
    container = tab.container;
    divRewards = container.querySelector('.main');
    divStats = container.querySelector('.toolbar .stats');
}

function update() {
    refresh();
}

function refresh() {
    divRewards.innerHTML = '';
    divStats.innerHTML = '';

    const generator = gui.getGenerator();
    const rid = +generator.region;
    const level = +generator.level;
    const lastId = +generator.dr_id || 0;
    const lastTime = +generator.dr_time || 0;
    if (!lastId) return;
    const dailyRewards = Object.values(gui.getFile('daily_rewards'));
    if (!dailyRewards) return;
    const reward = dailyRewards.find(dr => +dr.def_id == lastId);
    if (!reward) return;
    const group = reward.group;
    const visibleRewards = dailyRewards.filter(dr => dr.group == group).sort((a, b) => +a.order_id - +b.order_id);
    let nextId = (generator.dr_data && +generator.dr_data.def_id) || 0;
    // if (!nextId) {
    //     const index = (visibleRewards.indexOf(reward) + 1) % visibleRewards.length;
    //     nextId = visibleRewards[index].def_id;
    // }
    const calculation = new Calculation();
    calculation.defineConstant('level', level);
    divStats.textContent = Html.br `${gui.getMessage('dailyreward_stats', Locale.formatNumber(level), gui.getObjectName('region', rid))}`;
    let htm = '';
    for (const reward of visibleRewards) {
        const item = reward.segmentation.find(o => +o.region_id == rid);
        if (!item) continue;
        const id = +reward.def_id;
        const formula = String(item.amount).replace('[level]', 'level');
        const qty = Math.floor(calculation.eval(formula));
        let title = gui.getObjectName(item.type, item.object_id);
        const xp = gui.getXp(item.type, item.object_id);
        if (xp) {
            const totXp = qty * xp;
            const textXp = ((xp == 1 || qty == 1) ? '' : Locale.formatNumber(qty) + ' \xd7 ' + Locale.formatNumber(xp) + ' = ') + Locale.formatNumber(totXp);
            title += '\n' + gui.getMessageAndValue(item.type == 'usable' ? 'gui_energy' : 'gui_xp', textXp);
        }
        if (id == lastId && lastTime) {
            title += '\n' + gui.getMessage('dailyreward_lastcollect', Locale.formatDateTime(lastTime));
        }
        title += `\n${gui.getMessageAndValue('dailyreward_formula'), formula.replace(/(\W)/g, ' $1 ')}`;
        htm += Html `<div class="item${id == lastId ? ' last' : ''}${id == nextId ? ' next' : ''}" title="${title}">`;
        htm += Html `<div class="disc"></div>`;
        htm += Html `<div class="inner">` + gui.getObjectImg(item.type, item.object_id, 80, true, 'none') + `</div>`;
        htm += Html `<div class="amount"><span class="outlined">${Locale.formatNumber(qty)}</span></div>`;
        htm += Html `</div>`;
    }
    divRewards.innerHTML = htm;
}