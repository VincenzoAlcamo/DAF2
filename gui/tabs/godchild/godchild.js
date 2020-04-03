/*global bgp gui Locale Html Dialog*/
export default {
    hasCSS: true,
    init: init,
    onPrefChange: prefChange,
    update: update,
    actions: {
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
    const neighbours = Object.values(bgp.Data.getNeighbours());
    numNeighbours = neighbours.length - 1;
    maxGC = gui.getChildrenMax(numNeighbours) + 1;
    const list = neighbours.filter(pal => pal.spawned);
    list.sort((a, b) => a.index - b.index);
    setTableRegion();
    for (const pal of list) {
        const div = gcTable.appendChild(document.createElement('div'));
        div.setAttribute('data-pal-id', pal.id);
        div.className = 'DAF-gc-pal DAF-gc-reg' + pal.region;
        div.style.backgroundImage = 'url(' + (pal.id == 1 ? pal.pic_square : gui.getFBFriendAvatarUrl(pal.fb_id)) + ')';
        div.title = gui.getPlayerNameFull(pal) + '\n' + gui.getMessageAndValue('camp_region', gui.getObjectName('region', pal.region));
        const d = div.appendChild(document.createElement('div'));
        d.textContent = pal.level;
        if (pal.id == 1) d.style.visibility = 'hidden';
        div.appendChild(document.createElement('div')).textContent = pal.name || 'Player ' + pal.id;
    }
    updateStatus();
}

function updateStatus() {
    const num = gcTable.childNodes.length;
    container.querySelector('.godchild_table').style.display = num ? '' : 'none';
    container.querySelector('.toolbar').style.display = !num ? '' : 'none';
    let htm = Html.br`${num ? gui.getMessage('godchild_stat', Locale.formatNumber(num), Locale.formatNumber(maxGC)) : gui.getMessage('menu_gccollected')}`;
    const nextTxt = bgp.Data.getGCInfo().nexttxt;
    if (nextTxt) htm += Html.br`<br>${nextTxt}`;
    for (const div of container.querySelectorAll('.tab_godchild .stats')) Dialog.htmlToDOM(div, htm);
    container.querySelector('.tab_godchild .screenshot .shot').style.display = num > 0 ? '' : 'none';
    const next = gui.getChildrenNext(numNeighbours);
    const nextInfo = next == 0 ? gui.getMessage('godchild_next0') : next == 1 ? gui.getMessage('godchild_next1') : gui.getMessage('godchild_next', Locale.formatNumber(next));
    for (const div of container.querySelectorAll('.tab_godchild .info'))
        div.innerText = gui.getMessage('godchild_info', Locale.formatNumber(numNeighbours), Locale.formatNumber(maxGC)) + ' - ' + nextInfo;
}

function actionFriendChildCharge(data) {
    const id = data.id;
    const div = gcTable.querySelector('[data-pal-id="' + id + '"]');
    if (div) {
        div.parentNode.removeChild(div);
        updateStatus();
    }
}