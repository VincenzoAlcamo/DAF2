/*global bgp gui*/
export default {
    hasCSS: true,
    init: init,
    onPrefChange: prefChange,
    update: update,
    actions: {
        'friend_child_charge': actionFriendChildCharge
    }
};

var tab, container, gcTable, numNeighbours, maxGC;

function init() {
    tab = this;
    container = tab.container;
    gcTable = container.querySelector('.DAF-gc-bar');
}

function prefChange(changes) {
    if ('gcTableRegion' in changes) setTableRegion();
}

function setTableRegion() {
    gcTable.classList.toggle('DAF-gc-show-region', bgp.Preferences.getValue('gcTableRegion'));
}

function update() {
    gcTable.innerHTML = '';
    var neighbours = Object.values(bgp.Data.getNeighbours());
    numNeighbours = neighbours.length - 1;
    maxGC = gui.getChildrenMax(numNeighbours) + 1; 
    var list = neighbours.filter(pal => pal.spawned);
    list.sort((a, b) => a.index - b.index);
    setTableRegion();
    for (var pal of list) {
        var div = gcTable.appendChild(document.createElement('div'));
        div.setAttribute('data-pal-id', pal.id);
        div.className = 'DAF-gc-pal DAF-gc-reg' + pal.region;
        div.style.backgroundImage = 'url(' + (pal.id == 1 ? pal.pic_square : gui.getFBFriendAvatarUrl(pal.pic_fb_id)) + ')';
        div.title = gui.getPlayerNameFull(pal) + '\n' + gui.getMessage('camp_slot_region', bgp.Data.getRegionName(pal.region));
        var d = div.appendChild(document.createElement('div'));
        d.textContent = pal.level;
        if (pal.id == 1) d.style.visibility = 'hidden';
        div.appendChild(document.createElement('div')).textContent = pal.name || 'Player ' + pal.id;
    }
    updateStatus();
}

function updateStatus() {
    var num = gcTable.childNodes.length;
    gcTable.style.display = num ? '' : 'none';
    container.querySelector('.toolbar .stats').innerText = num ? gui.getMessage('godchild_stat', num, maxGC) : gui.getMessage('menu_gccollected');
    var next = gui.getChildrenNext(numNeighbours);
    var nextInfo = next == 0 ? gui.getMessage('godchild_next0') : next == 1 ? gui.getMessage('godchild_next1') : gui.getMessage('godchild_next', next);
    container.querySelector('.toolbar .info').innerText = gui.getMessage('godchild_info', numNeighbours, maxGC) + ' - ' + nextInfo;
}

function actionFriendChildCharge(data) {
    var id = data;
    var div = gcTable.querySelector('[data-pal-id="' + id + '"]');
    if(div) {
        div.parentNode.removeChild(div);
        updateStatus();
    }
}