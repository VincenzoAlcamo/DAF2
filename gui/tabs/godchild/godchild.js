/*global bgp gui Locale Html Dialog*/
export default {
    hasCSS: true,
    init: init,
    onPrefChange: prefChange,
    update: update,
    requires: ['childs'],
    actions: {
        'visit_camp': actionVisitCamp,
        'friend_child_charge': actionFriendChildCharge
    }
};

let tab, container, gcTable, numNeighbours, maxGC;

function init() {
    tab = this;
    container = tab.container;
    gcTable = container.querySelector('.DAF-gc-bar');

    gui.setupScreenshot(container.querySelector('.godchild_table'), gui.getMessage('tab_godchild'), container.querySelector('.screenshot'));
}

function prefChange(changes) {
    if ('gcTableRegion' in changes) setTableRegion();
}

function setTableRegion() {
    gcTable.classList.toggle('DAF-gc-show-region', gui.getPreference('gcTableRegion'));
}

function update() {
    Dialog.htmlToDOM(gcTable, '');
    const neighbours = bgp.Data.getNeighbours();
    numNeighbours = Object.values(neighbours).length - 1;
    maxGC = gui.getChildrenMax(numNeighbours) + 1;
    let list = neighbours[1] && neighbours[1].spawn_list;
    if (Array.isArray(list)) {
        list = list.map(id => neighbours[id] || { id });
    } else {
        list = Object.values(neighbours).filter(pal => pal.spawned);
        list.sort((a, b) => a.index - b.index);
    }
    setTableRegion();
    for (const pal of list) {
        const isValid = pal.region;
        const div = gcTable.appendChild(document.createElement('div'));
        div.setAttribute('data-pal-id', pal.id);
        div.className = 'DAF-gc-pal' + (isValid ? ' DAF-gc-reg' + pal.region : '') + (pal.spawned ? '' : ' collected');
        div.style.backgroundImage = isValid ? 'url(' + gui.getNeighborAvatarUrl(pal) + ')' : 'url(/img/gui/anon.png)';
        const d = div.appendChild(document.createElement('div'));
        d.textContent = pal.level || 0;
        if (pal.id == 1 || !isValid) d.style.visibility = 'hidden';
        const elName = document.createElement('div');
        elName.textContent = pal.name || 'Player ' + pal.id;
        elName.appendChild(document.createElement('br'));
        elName.appendChild(document.createElement('b')).classList.add('energy');
        div.appendChild(elName);
        updateEnergy(pal.id);
    }
    updateStatus();
}

function updateEnergy(id) {
    const div = gcTable.querySelector(`div[data-pal-id="${id}"]`);
    if (!div) return;
    const pal = bgp.Data.getNeighbour(id) || { id };
    const gc = pal && pal.extra && pal.extra.gc;
    let energy = +gc || 0;
    if (gc && typeof gc == 'object') {
        const childs = gui.getFile('childs');
        for (const [id, qty] of Object.entries(gc)) {
            const child = childs[id];
            energy += child ? +child.friend_stamina * qty : 0;
        }
    }
    div.querySelector('b').textContent = energy ? Locale.formatNumber(energy) : '?';
    const isValid = pal.region;
    let title = gui.getPlayerNameFull(pal);
    if (isValid) title += '\n' + gui.getMessageAndValue('gui_region', gui.getObjectName('region', pal.region));
    if (energy) title += '\n' + gui.getMessageAndValue('gui_energy', Locale.formatNumber(energy));
    div.title = title;
    div.setAttribute('data-energy', energy);
}

function updateStatus() {
    const divs = gcTable.querySelectorAll('.DAF-gc-pal');
    const tot = divs.length;
    const num = gcTable.querySelectorAll('.DAF-gc-pal:not(.collected)').length;
    let totEnergy = 0;
    let isPrecise = num == 0;
    for (const div of divs) {
        const energy = +div.getAttribute('data-energy') || 0;
        totEnergy += energy;
        if (!energy) isPrecise = false;
    }
    container.querySelector('.godchild_table').classList.toggle('complete', num == 0);
    container.querySelector('.godchild_table').style.display = tot ? '' : 'none';
    container.querySelector('.toolbar').style.display = !tot ? '' : 'none';
    let htm = Html.br`<span>${num ? gui.getMessage('godchild_stat', Locale.formatNumber(num), Locale.formatNumber(maxGC)) : gui.getMessage('menu_gccollected')}`;
    if (totEnergy) htm += Html.br` &mdash; ${gui.getMessageAndValue(isPrecise ? 'gui_energy' : 'gui_estimatedenergy', Locale.formatNumber(totEnergy))}`;
    htm += Html.br`</span>`;
    const nextTxt = bgp.Data.getGCInfo().nexttxt;
    if (nextTxt) htm += Html.br`<br>${nextTxt}`;
    for (const div of container.querySelectorAll('.tab_godchild .stats')) Dialog.htmlToDOM(div, htm);
    container.querySelector('.tab_godchild .screenshot .shot').style.display = tot > 0 ? '' : 'none';
    const next = gui.getChildrenNext(numNeighbours);
    const nextInfo = next == 0 ? gui.getMessage('godchild_next0') : next == 1 ? gui.getMessage('godchild_next1') : gui.getMessage('godchild_next', Locale.formatNumber(next));
    for (const div of container.querySelectorAll('.tab_godchild .info'))
        div.innerText = gui.getMessage('godchild_info', Locale.formatNumber(numNeighbours), Locale.formatNumber(maxGC)) + ' - ' + nextInfo;
}

function actionFriendChildCharge(data) {
    const id = data.id;
    const div = gcTable.querySelector('[data-pal-id="' + id + '"]');
    if (div) {
        // div.remove();
        div.classList.add('collected');
        updateEnergy(id);
        updateStatus();
    }
}

function actionVisitCamp() {
    updateEnergy(bgp.Data.lastVisitedCamp.neigh_id);
}