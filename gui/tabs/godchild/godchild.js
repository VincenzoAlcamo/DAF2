/*global bgp gui Locale Html*/
export default {
    hasCSS: true,
    init: init,
    onPrefChange: prefChange,
    update: update,
    // requires: ['childs'],
    actions: {
        'friend_child_charge': actionFriendChildCharge
    }
};

var tab, container, gcTable, numNeighbours, maxGC;

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
        div.style.backgroundImage = 'url(' + (pal.id == 1 ? pal.pic_square : gui.getFBFriendAvatarUrl(pal.fb_id)) + ')';
        div.title = gui.getPlayerNameFull(pal) + '\n' + gui.getMessageAndValue('camp_region', gui.getObjectName('region', pal.region));
        var d = div.appendChild(document.createElement('div'));
        d.textContent = pal.level;
        if (pal.id == 1) d.style.visibility = 'hidden';
        div.appendChild(document.createElement('div')).textContent = pal.name || 'Player ' + pal.id;
    }
    updateStatus();

    // console.log(getOptimizedGCInfo());
}

// function getGCStamina() {
//     let childs = bgp.Data.files.childs;
//     let result = {};
//     if (childs) {
//         for (let child of Object.values(childs)) {
//             let stamina = +child.friend_stamina;
//             if (stamina > 0) result[child.def_id] = stamina;
//         }
//     }
//     return result;
// }

// function getOptimizedGCInfo() {
//     let gcStamina = getGCStamina();
//     let gcInfo = bgp.Data.gcInfo;
//     console.log(JSON.stringify(gcInfo).length);
//     let result = {};
//     for (let rid of Object.keys(gcInfo)) {
//         let list = Object.values(gcInfo[rid]);
//         list.sort((a, b) => a.l - b.l);
//         let map = result[rid] = {};
//         for (let info of list) {
//             if (info.l == 1) continue;
//             info = Object.assign({}, info);
//             info.s = info.c.reduce((a, v) => a + gcStamina[v], 0);
//             info.dt = Locale.formatDateTime(info.t);
//             map[info.l] = info;
//         }
//     }
//     console.log(JSON.stringify(result).length);
//     return result;
// }

function updateStatus() {
    var num = gcTable.childNodes.length;
    container.querySelector('.godchild_table').style.display = num ? '' : 'none';
    container.querySelector('.toolbar').style.display = !num ? '' : 'none';
    let htm = Html.br `${num ? gui.getMessage('godchild_stat', Locale.formatNumber(num), Locale.formatNumber(maxGC)) : gui.getMessage('menu_gccollected')}`;
    let time = bgp.Data.getNextGCCollectionTime();
    if (time) htm += Html.br `<br>${gui.getMessage('rewardlinks_nexttime', Locale.formatDateTime(time))}`;
    for (let div of container.querySelectorAll('.tab_godchild .stats')) div.innerHTML = htm;
    container.querySelector('.tab_godchild .screenshot .shot').style.display = num > 0 ? '' : 'none';
    var next = gui.getChildrenNext(numNeighbours);
    var nextInfo = next == 0 ? gui.getMessage('godchild_next0') : next == 1 ? gui.getMessage('godchild_next1') : gui.getMessage('godchild_next', Locale.formatNumber(next));
    for (let div of container.querySelectorAll('.tab_godchild .info'))
        div.innerText = gui.getMessage('godchild_info', Locale.formatNumber(numNeighbours), Locale.formatNumber(maxGC)) + ' - ' + nextInfo;
}

function actionFriendChildCharge(data) {
    var id = data;
    var div = gcTable.querySelector('[data-pal-id="' + id + '"]');
    if (div) {
        div.parentNode.removeChild(div);
        updateStatus();
    }
}