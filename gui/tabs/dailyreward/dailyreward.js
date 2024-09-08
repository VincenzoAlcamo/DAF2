/*global gui Html Locale Calculation*/
export default {
	init, update,
	requires: ['daily_reward_features', 'materials', 'buildings', 'tokens', 'usables', 'xp']
};

let tab, container, divRewards, divMilestone, divStats;

function init() {
	tab = this;
	container = tab.container;
	divRewards = container.querySelector('.main1');
	divMilestone = container.querySelector('.main2');
	divStats = container.querySelector('.toolbar .stats');
}

function update() {
	refresh();
}

function refresh() {
	Html.set(divRewards, '');
	Html.set(divMilestone, '');
	Html.set(divStats, '');

	const generator = gui.getGenerator();
	const rid = +generator.region;
	const level = +generator.level;

	Html.set(divStats, Html.br`${gui.getMessage('dailyreward_stats', Locale.formatNumber(level), gui.getObjectName('region', rid))}`);

	const dailyRewards = Object.values(gui.getFile('daily_reward_features'));
	if (!dailyRewards) return;

	const dr = generator.daily_reward_feature?.daily_reward, dr_g = dr?.group_def_id;
	const group1 = dailyRewards[0]?.groups.find(g => +g.def_id == dr_g);
	if (group1) showRewards(divRewards, group1.rewards, level, rid, dr.reward_def_id, dr.time);

	const dm = generator.daily_reward_feature?.milestone, dm_g = dm?.milestone_def_id;
	const group2 = dailyRewards[0]?.milestones.find(g => +g.def_id == dm_g);
	if (group2) showRewards(divMilestone, group2.rewards, level, rid, dm.reward_def_id, dm.time);
}

function showRewards(divRewards, rewards, level, rid, lastId, lastTime) {
	const visibleRewards = rewards.sort((a, b) => +a.order_id - +b.order_id);
	const calculation = new Calculation();
	calculation.defineConstant('level', level);
	let htm = '';
	for (const reward of visibleRewards) {
		const item = reward.segmentation.find(o => +o.region_id == rid) || reward.segmentation.find(o => +o.region_id == 0);
		if (!item) continue;
		const id = +reward.def_id;
		const formula = String(item.amount).replace(/\[([a-z]+)\]/g, '$1');
		const qty = Math.floor(calculation.compute(formula));
		let title = gui.getObjectName(item.type, item.object_id);
		const xp = gui.getXp(item.type, item.object_id);
		if (xp) {
			const totXp = qty * xp;
			const textXp = ((xp == 1 || qty == 1) ? '' : Locale.formatNumber(qty) + ' \xd7 ' + Locale.formatNumber(xp) + ' = ') + Locale.formatNumber(totXp);
			title += '\n' + gui.getMessageAndValue(item.type == 'usable' ? 'gui_energy' : 'gui_xp', textXp);
		}
		title += `\n${gui.getMessageAndValue('dailyreward_formula', formula.replace(/(\W|[\d\.]+)/g, ' $1 ').replace(/\s+/g, ' ').trim())}`;
		if (id == lastId && lastTime) {
			title += '\n\n' + gui.getMessage('dailyreward_lastcollect', Locale.formatDateTime(lastTime));
		}
		htm += Html`<div class="item${id == lastId ? ' last' : ''}" title="${title}">`;
		htm += Html`<div class="disc"></div>`;
		htm += Html`<div class="inner">` + gui.getObjectImg(item.type, item.object_id, 80, true, 'none') + `</div>`;
		htm += Html`<div class="amount"><span class="outlined">${Locale.formatNumber(qty)}</span></div>`;
		htm += Html`</div>`;
	}
	Html.set(divRewards, htm);
}