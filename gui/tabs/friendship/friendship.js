/*global chrome bgp gui Locale Dialog SmartTable Html Tooltip isAdmin*/
export default {
    hasCSS: true,
    init: init,
    update: update,
    actions: {
        'friends_analyze': matchStoreAndUpdate
    },
    getState: getState,
    setState: setState
};

let tab, container, selectShow, searchInput, smartTable, searchHandler;
let buttonUnlink, buttonIgnore, buttonRegard, buttonManual, friendDisabled;
let divMatch, matchingId;

let firstTimeManualHelp = localStorage.getItem('manual_match') != '1';
let firstTimeCollectPopup = true;
let numFriends = 0;
let numDisabled = 0;
let numNeighbours = 0;
let numMatched = 0;
let numMatchedImage = 0;
let numMatchedManually = 0;
let numIgnored = 0;
let numAnalyzed = 0;
let numToAnalyze = 0;
let numFriendsShown = 0;
let numNeighboursShown = 0;

let FB_ANON_MALE_IMG, FB_ANON_FEMALE_IMG;

const processed = {};

function setProcessed(friend, value) {
    processed[friend.id] = value;
}

function getProcessed(friend) {
    return processed[friend.id];
}

function init() {
    tab = this;
    container = tab.container;

    buttonUnlink = Html`<button data-action="unlink" title="${gui.getMessage('friendship_actionunlink')}"></button>`;
    buttonIgnore = Html`<button data-action="ignore" title="${gui.getMessage('friendship_actionignore')}"></button>`;
    buttonRegard = Html`<button data-action="regard" title="${gui.getMessage('friendship_actionregard')}"></button>`;
    buttonManual = Html`<button data-action="manual" title="${gui.getMessage('friendship_actionmanual')}"></button>`;
    friendDisabled = Html`<div class="f-disabled">${gui.getMessage('friendship_accountdisabled')}</div>`;

    selectShow = container.querySelector('[name=show]');
    for (const char of 'admghifuns'.split('')) {
        const option = document.createElement('option');
        option.value = char;
        selectShow.appendChild(option);
    }
    selectShow.addEventListener('change', refresh);

    searchInput = container.querySelector('[name=search]');
    searchInput.addEventListener('input', () => triggerSearchHandler(true));

    smartTable = new SmartTable(container.querySelector('.data'));
    smartTable.onSort = refresh;
    smartTable.fixedHeader.parentNode.classList.add('friendship');
    smartTable.fixedFooter.parentNode.classList.add('friendship');
    smartTable.tbody[0].addEventListener('render', gui.getLazyRenderer(updateRow));
    smartTable.tbody[0].addEventListener('click', tableClick);

    container.querySelector('.toolbar button[data-action="collect"]').addEventListener('click', showCollectDialog);
    container.querySelector('.toolbar button[data-action="export"]').addEventListener('click', exportData);
    divMatch = container.querySelector('.DAF-gc-pal');
    divMatch.addEventListener('click', cancelMatch);
    smartTable.container.insertBefore(divMatch, smartTable.container.firstChild);

    smartTable.table.addEventListener('input', onInput);

    container.addEventListener('tooltip', onTooltip);

    createImage(function () { FB_ANON_MALE_IMG = getImgDataURL(this); }).src = gui.FB_ANON_MALE_IMG;
    createImage(function () { FB_ANON_FEMALE_IMG = getImgDataURL(this); }).src = gui.FB_ANON_FEMALE_IMG;
}

function triggerSearchHandler(flag) {
    if (searchHandler) clearTimeout(searchHandler);
    searchHandler = flag ? setTimeout(refresh, 500) : 0;
}

function getState() {
    return {
        show: selectShow.value,
        search: searchInput.value,
        sort: gui.getSortState(smartTable, 'fname')
    };
}

function setState(state) {
    state.show = gui.setSelectState(selectShow, state.show);
    searchInput.value = state.search || '';
    gui.setSortState(state.sort, smartTable, 'fname');
}

function update() {
    gui.updateNeighborFriendNames(true);
    refresh();
}

function getConfirmCollection() {
    return !!gui.getPreference('confirmCollection');
}

function getSpeedupCollection() {
    const result = parseInt(gui.getPreference('speedupCollection'));
    return result >= 0 && result <= 8 ? result : 0;
}

function getMatchByImage() {
    return !!gui.getPreference('matchByImage');
}

function getFbFriendsPage() {
    return gui.getPreference('fbFriendsPage');
}

function getFbFriendsPageUrl(fbFriendsPage) {
    switch (fbFriendsPage) {
        case 1: return 'https://www.facebook.com/profile.php?sk=friends';
        case 2: return 'https://m.facebook.com/friends/center/friends';
        default: return 'https://www.facebook.com/me/friends';
    }
}

function getNeighboursAsNotMatched() {
    const neighbours = bgp.Data.getNeighbours();
    const notmatched = Object.assign({}, neighbours);
    // Remove Mr.Bill
    delete notmatched[1];
    return notmatched;
}

function getUnmatched() {
    return Object.values(bgp.Data.friends).filter(friend => (friend.score || 0) == 0).map(friend => friend.id);
}

function showCollectDialog() {
    let confirmCollection = getConfirmCollection();
    let speedupCollection = getSpeedupCollection();
    let matchByImage = getMatchByImage();
    let fbFriendsPage = getFbFriendsPage();
    const numUnmatched = getUnmatched().length;

    function addStandardSettings() {
        let extra = Html.br`<br><label for="f_cc">${gui.getMessage('friendship_confirmcollection')}</label>
        <select id="f_cc" name="confirmCollection">
        <option value="0" ${!confirmCollection ? 'selected' : ''}>${gui.getMessage('friendship_cc_maybe')}</option>
        <option value="1" ${confirmCollection ? 'selected' : ''}>${gui.getMessage('dialog_yes')}</option>
        </select>
        <br><label for="f_sc">${gui.getMessage('friendship_speedupcollect')}</label>
        <select id="f_sc" name="speedupCollection">
        <option value="0" ${speedupCollection == 0 ? 'selected' : ''}>${gui.getMessage('dialog_no')}</option>`;
        for (let p = 1; p <= 3; p++) {
            const i = 2 ** p;
            extra += Html.br`<option value="${i}" ${speedupCollection == i ? 'selected' : ''}>\xd7 ${Locale.formatNumber(i)}</option>`;
        }
        extra += `</select>
        <br><label for="f_fv">${gui.getMessage('gui_type')}</label>
        <select id="f_fv" name="fbFriendsPage">
        <option value="0" ${fbFriendsPage != 1 && fbFriendsPage != 2 ? 'selected' : ''}>A = ${getFbFriendsPageUrl('0')}</option>
        <option value="1" ${fbFriendsPage == 1 ? 'selected' : ''}>B = ${getFbFriendsPageUrl(1)}</option>
        <option value="2" ${fbFriendsPage == 2 ? 'selected' : ''}>C = ${getFbFriendsPageUrl(2)}</option>
        </select>`;
        return Html.raw(extra);
    }

    function addMatchSettings() {
        const extra = Html.br`<br><label for="f_mi">${gui.getMessage('friendship_matchbyimage')}</label>
        <select id="f_mi" name="matchByImage">
        <option value="0" ${!matchByImage ? 'selected' : ''}>${gui.getMessage('dialog_no')}</option>
        <option value="1" ${matchByImage ? 'selected' : ''}>${gui.getMessage('dialog_yes')}</option>
        </select></label>`;
        return Html.raw(extra);
    }

    function button(method) {
        const msgId = 'friendship_collect' + method;
        const htm = Html.br`<tr style="border-top:2px solid rgba(0,0,0,0.2)">
<td style="text-align:right"><button value="${method}">${gui.getMessage(msgId)}</button></td>
<td>${gui.getMessage(msgId + 'info')}
${method == 'standard' ? '\n' + gui.getMessage('friendship_disabledinfo') : ''}
${method == 'unmatched' ? '\n' + gui.getMessage('friendship_filter_f', Locale.formatNumber(numUnmatched)) : ''}
${method == 'standard' ? addStandardSettings() : ''}
${method == 'match' ? addMatchSettings() : ''}
</td></tr>`;
        return htm;
    }

    function setNewValue(prefName, oldValue, newValue) {
        if (oldValue != newValue) gui.setPreference(prefName, newValue);
        return newValue;
    }

    function setStandardOptions(params) {
        confirmCollection = setNewValue('confirmCollection', confirmCollection, !!(parseInt(params.confirmCollection)));
        speedupCollection = setNewValue('speedupCollection', confirmCollection, parseInt(params.speedupCollection));
        fbFriendsPage = setNewValue('fbFriendsPage', fbFriendsPage, parseInt(params.fbFriendsPage) || 0);
    }

    function setMatchOptions(params) {
        matchByImage = setNewValue('matchByImage', matchByImage, !!(parseInt(params.matchByImage)));
    }

    gui.dialog.show({
        title: gui.getMessage('friendship_collectfriends'),
        html: Html.br`${gui.getMessage('friendship_collectpreamble')}
<table style="margin-top:16px">
${button('standard')}
${numFriends > 0 ? button('unmatched') : ''}
${numFriends > 0 ? button('match') : ''}
</table>`,
        style: ['standard', 'unmatched', 'match', Dialog.CANCEL]
    }, function (method, params) {
        setStandardOptions(params);
        if (numFriends > 0) setMatchOptions(params);
        if (method == 'standard' || method == 'unmatched' || method == 'match') {
            gui.dialog.show({
                title: gui.getMessage('friendship_collectfriends'),
                html: Html.br`<p style="text-align:left">${gui.getMessage('friendship_collect' + method + 'info')}
${method == 'standard' ? '\n' + gui.getMessage('friendship_disabledinfo') : ''}
${method == 'unmatched' ? '\n' + gui.getMessage('friendship_filter_f', Locale.formatNumber(numUnmatched)) : ''}
</p>
${method == 'standard' || method == 'unmatched' ? addStandardSettings() : ''}
${method == 'standard' || method == 'match' ? addMatchSettings() : ''}
<br><br>${gui.getMessage('friendship_confirmwarning')}`,
                style: [Dialog.CRITICAL, Dialog.CONFIRM, Dialog.CANCEL]
            }, function (confirmation, params) {
                if (method == 'standard' || method == 'unmatched') setStandardOptions(params);
                if (method == 'standard' || method == 'match') setMatchOptions(params);
                if (confirmation != Dialog.CONFIRM) return;
                if (method == 'standard' || method == 'unmatched') collectFriends(method);
                else if (method == 'match') matchStoreAndUpdate();
            });
        }
    });
}

function tableClick(event) {
    let row = null;
    for (let node = event.target; node && !row; node = node.parentNode) {
        if (node.tagName == 'TABLE') break;
        if (node.tagName == 'TR') row = node;
    }
    if (!row) return;

    const el = event.target;
    const fb_id = row.getAttribute('data-friend-id');
    const pal_id = row.getAttribute('data-pal-id');
    const friend = fb_id && bgp.Data.getFriend(fb_id);
    let pal = pal_id && bgp.Data.getNeighbour(pal_id);
    let flagModified = false;
    const isRowVisible = getRowVisibilityChecker();
    let action = el.tagName == 'BUTTON' ? el.getAttribute('data-action') : null;
    if (el.tagName == 'TD' && el.cellIndex == 3 && smartTable.table.classList.contains('f-matching') && matchingId && friend && (friend.score || 0) <= 0) action = 'match';

    if (action == 'match') {
        // MANUAL MATCH
        pal = bgp.Data.getNeighbour(matchingId);
        const row2 = container.querySelector('tr[data-pal-id="' + pal.id + '"]');
        if (row2) row2.remove();
        matchFriendBase(friend, pal, 99);
        row.setAttribute('data-pal-id', pal.id);
        flagModified = true;
        cancelMatch();
    } else if (action == 'unlink' && friend && pal) {
        // UNLINK
        numMatched--;
        delete friend.uid;
        delete friend.score;
        row.removeAttribute('data-pal-id');
        flagModified = true;
        if (isRowVisible(null, pal)) {
            const row2 = row.parentNode.appendChild(document.createElement('tr'));
            row2.setAttribute('data-pal-id', pal.id);
            updateRow(row2);
        }
        pal = null;
    } else if ((action == 'ignore' || action == 'regard') && friend) {
        // IGNORE or REGARD
        delete friend.uid;
        delete friend.score;
        if (action == 'ignore') friend.score = -1;
        flagModified = true;
        numIgnored += (action == 'ignore' ? 1 : -1);
    } else if (action == 'manual' && pal) {
        if (matchingId == pal.id) {
            cancelMatch();
        } else {
            divMatch.style.backgroundImage = 'url(' + gui.getNeighborAvatarUrl(pal) + ')';
            divMatch.firstElementChild.innerText = pal.level;
            divMatch.lastElementChild.innerText = gui.getPlayerNameFull(pal);
            divMatch.style.display = 'block';
            smartTable.table.classList.add('f-matching');
            matchingId = pal.id;
            row.classList.add('f-ismatching');
            if (firstTimeManualHelp) {
                firstTimeManualHelp = false;
                localStorage.setItem('manual_match', '1');
                gui.dialog.show({
                    text: gui.getMessage('friendship_manualmatchhelp'),
                    style: [Dialog.OK]
                });
            }
        }
    }
    if (flagModified) {
        if (isRowVisible(friend, pal)) updateRow(row);
        else row.parentNode.removeChild(row);
        bgp.Data.saveFriend(friend);
        if (friend.score == 99 && pal) {
            gui.updateNeighborFriendName(pal, friend);
            bgp.Data.saveNeighbour(pal);
        }
        showStats();
    }
}

function onInput(event) {
    const input = event.target;
    if (!input || input.tagName != 'INPUT' || !input.classList.contains('note')) return;
    const row = input.parentNode.parentNode;
    const note = input.value.trim();

    if (input.classList.contains('f-note')) {
        const fb_id = row.getAttribute('data-friend-id');
        const friend = fb_id && bgp.Data.getFriend(fb_id);
        if (friend) {
            friend.note = note;
            bgp.Data.saveFriend(friend);
        }
    } else if (input.classList.contains('n-note')) {
        const pal_id = row.getAttribute('data-pal-id');
        const pal = pal_id && bgp.Data.getNeighbour(pal_id);
        if (pal) {
            pal.extra.note = note;
            bgp.Data.saveNeighbour(pal);
        }
    }
}

function collectFriends(method) {
    const width = 1000;
    const height = 500;
    const unmatched = method == 'unmatched' ? getUnmatched().join() : '';
    bgp.Tab.excludeFromInjection(0);
    setTimeout(_ => bgp.Tab.excludeFromInjection(0, false), 20000);
    const fbFriendsPage = getFbFriendsPage();
    const url = getFbFriendsPageUrl(fbFriendsPage);
    chrome.windows.create({
        width,
        height,
        left: Math.floor((screen.availWidth - width) / 2),
        top: Math.floor((screen.availHeight - height) / 2),
        type: 'popup',
        url
    }, function (w) {
        const tabId = w.tabs[0].id;
        bgp.Tab.excludeFromInjection(tabId);
        setTimeout(_ => bgp.Tab.excludeFromInjection(tabId, false), 20000);
        chrome.tabs.get(tabId, function (tab) {
            if (chrome.runtime.lastError) console.log(chrome.runtime.lastError);
            waitForTab(tab).then(function () {
                const details = {
                    file: '/js/Dialog.js',
                    runAt: 'document_end',
                    allFrames: false,
                    frameId: 0
                };
                chrome.tabs.executeScript(tabId, details, function () {
                    if (chrome.runtime.lastError) console.log(chrome.runtime.lastError);
                    details.file = '/inject/collectfriends.js';
                    chrome.tabs.executeScript(tabId, details, function () {
                        if (chrome.runtime.lastError) console.log(chrome.runtime.lastError);
                        delete details.file;
                        let code = '';
                        const addVar = (name, value) => code += name + '=' + JSON.stringify(value) + ';';
                        addVar('language', gui.getPreference('language'));
                        addVar('unmatched', unmatched);
                        addVar('collectMethod', method);
                        addVar('confirmCollection', getConfirmCollection());
                        addVar('speedupCollection', getSpeedupCollection());
                        details.code = code + 'collect();';
                        chrome.tabs.executeScript(tabId, details, function () {
                            if (chrome.runtime.lastError) console.log(chrome.runtime.lastError);
                        });
                    });
                });
            });
        });
    });
}

function waitForTab(tab) {
    if (tab.status !== 'loading') return Promise.resolve(tab);
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            chrome.tabs.onCreated.removeListener(onUpdated);
            reject(new Error('Tab did not complete'));
        }, 30000);
        function onUpdated(tabId, changeInfo, _tab) {
            if (tabId == tab.id && _tab.status == 'complete') {
                clearTimeout(timer);
                chrome.tabs.onUpdated.removeListener(onUpdated);
                resolve(_tab);
            }
        }
        chrome.tabs.onUpdated.addListener(onUpdated);
    });
}

function showStats() {
    let htm = '';
    if (numToAnalyze == numAnalyzed || numToAnalyze == 0) {
        gui.wait.hide();
        if (bgp.Data.friendsCollectDate > 0) {
            htm += Html.br`${gui.getMessage('friendship_friendupdateinfo', Locale.formatDateTimeFull(bgp.Data.friendsCollectDate))}`;
        }
    } else {
        const num = Math.min(numAnalyzed > 0 ? numAnalyzed + 1 : 0, numToAnalyze);
        const analyzingText = gui.getMessage('friendship_analyzingmatches', Math.floor(num / numToAnalyze * 100), num, numToAnalyze);
        gui.wait.setText(analyzingText);
        htm += Html.br`${analyzingText}`;
    }
    Dialog.htmlToDOM(container.querySelector('.stats'), htm);

    const params = {
        'a': [Locale.formatNumber(numFriends), Locale.formatNumber(numNeighbours)],
        'd': [Locale.formatNumber(numDisabled)],
        'm': [Locale.formatNumber(numMatched)],
        'g': [Locale.formatNumber(numMatchedImage)],
        'h': [Locale.formatNumber(numMatchedManually)],
        'i': [Locale.formatNumber(numIgnored)],
        'f': [Locale.formatNumber(numFriends - numMatched - numIgnored)],
        'u': [Locale.formatNumber(numFriends - numMatched)],
        'n': [Locale.formatNumber(numNeighbours - numMatched)],
        's': [Locale.formatNumber(numNeighbours - numMatched + numFriends - numMatched - numIgnored)]
    };
    for (const option of selectShow.querySelectorAll('option')) {
        option.innerText = gui.getMessage('friendship_filter_' + option.value, ...params[option.value]);
    }

    htm = Html.br`${gui.getMessage('friendship_totalfriends', Locale.formatNumber(numFriendsShown), Locale.formatNumber(numFriends))}`;
    for (const div of container.querySelectorAll('.numfriends')) Dialog.htmlToDOM(div, htm);
    htm = Html.br`${gui.getMessage('friendship_totalneighbours', Locale.formatNumber(numNeighboursShown), Locale.formatNumber(numNeighbours))}`;
    for (const div of container.querySelectorAll('.numneighbours')) Dialog.htmlToDOM(div, htm);

    htm = '';
    if (bgp.Data.friendsCollectDate < gui.getUnixTime() - 30 * 86400) {
        const method = gui.getMessage('friendship_collectstandard');
        htm = Html.br(gui.getMessage('friendship_timewarning', gui.getMessage('friendship_collectfriends'), method));
    }
    const div = container.querySelector('.warning');
    Dialog.htmlToDOM(div, htm);
    div.style.display = htm ? '' : 'none';
}

function updateRow(row) {
    const fb_id = row.getAttribute('data-friend-id');
    const pal_id = row.getAttribute('data-pal-id');
    const friend = fb_id && bgp.Data.getFriend(fb_id);
    const pal = pal_id && bgp.Data.getNeighbour(pal_id);
    let htm = '';
    if (friend) {
        const anchor = gui.getFBFriendAnchor(friend.id, friend.uri);
        htm += Html.br`<td>${anchor}<img height="50" width="50" src="${gui.getFBFriendAvatarUrl(friend.id, friend.img)}" class="tooltip-event"/></a></td>`;
        htm += Html.br`<td>${anchor}${friend.name}</a><br>`;
        htm += Html.br`<input class="note f-note" type="text" maxlength="50" placeholder="${gui.getMessage('gui_nonote')}" value="${friend.note}">${friend.disabled ? friendDisabled : ''}</td>`;
        htm += Html.br`<td>${Locale.formatDate(friend.tc)}<br>${Locale.formatDays(friend.tc)}</td>`;
        if (pal) {
            htm += Html.br`<td>${Locale.formatNumber(friend.score)}</td>`;
            htm += Html.br`<td>${buttonUnlink}</td>`;
        } else {
            htm += Html.br`<td></td><td>${friend.score == -1 ? buttonRegard : buttonIgnore}</td>`;
        }
    } else {
        htm += Html.br`<td></td><td></td><td></td><td></td><td>${buttonManual}</td>`;
    }
    if (pal) {
        const anchor = Html.raw('<a class="no-link" translate="no">');
        htm += Html.br`<td>${anchor}<img height="50" width="50" src="${gui.getNeighborAvatarUrl(pal)}" class="tooltip-event"/></a></td>`;
        const fullName = gui.getPlayerNameFull(pal);
        htm += Html.br`<td>${anchor}${fullName}</a>`;
        if (pal.extra.fn && pal.extra.fn != fullName) htm += Html.br`<br><span class="friendname">${pal.extra.fn}</span>`;
        htm += Html.br`<br><input class="note n-note" type="text" maxlength="50" placeholder="${gui.getMessage('gui_nonote')}" value="${pal.extra.note}"></td>`;
        htm += Html.br`<td>${Locale.formatNumber(pal.level)}</td>`;
        htm += Html.br`<td>${gui.getRegionImg(pal.region)}</td>`;
        htm += Html.br`<td>${Locale.formatDate(pal.extra.timeCreated)}<br>${Locale.formatDays(pal.extra.timeCreated)}</td>`;
    } else {
        htm += Html.br`<td></td><td></td><td></td><td></td><td></td>`;
    }
    Dialog.htmlToDOM(row, htm);
    const isIgnored = friend ? friend.score == -1 : false;
    const isNotMatched = friend && !pal ? !isIgnored : false;
    row.classList.toggle('f-ignored', isIgnored);
    row.classList.toggle('f-notmatched', isNotMatched);
    row.classList.toggle('f-ismatching', pal && matchingId == pal.id);
}

let scheduledRefresh;

function refresh() {
    triggerSearchHandler(false);
    gui.updateTabState(tab);

    Dialog.htmlToDOM(smartTable.tbody[0], '');
    showStats();

    if (scheduledRefresh) clearTimeout(scheduledRefresh);
    scheduledRefresh = setTimeout(refreshDelayed, 50);
}

function getRowVisibilityChecker() {
    const state = getState();
    const fnSearch = gui.getSearchFilter(state.search);
    const show = state.show;
    const fn = {
        'a': (_friend, _pal) => true,
        'd': (friend, _pal) => friend && friend.disabled,
        'm': (friend, pal) => friend && pal,
        'g': (friend, pal) => friend && pal && friend.score == 95,
        'h': (friend, pal) => friend && pal && friend.score == 99,
        'i': (friend, _pal) => friend && friend.score == -1,
        'f': (friend, _pal) => friend && (friend.score || 0) == 0,
        'u': (friend, pal) => friend && !pal,
        'n': (friend, pal) => pal && !friend,
        's': (friend, pal) => friend ? (friend.score || 0) == 0 : pal,
    }[show] || (() => false);
    return function isRowVisible(friend, pal) {
        if (fnSearch) {
            let text = '';
            if (friend) text += '\t' + friend.name;
            if (pal) text += '\t' + gui.getPlayerNameFull(pal) + '\t' + (pal.extra.fn || '');
            // Notes must be contiguous
            let notes = '';
            if (friend && friend.note) notes += '\n' + friend.note;
            if (pal && pal.extra.note) notes += '\n' + pal.extra.note;
            if (notes) text += '\t' + notes;
            if (!fnSearch(text)) return false;
        }
        return fn(friend, pal);
    };
}

function refreshDelayed() {
    scheduledRefresh = 0;

    const friends = Object.values(bgp.Data.getFriends());
    const notmatched = getNeighboursAsNotMatched();
    numFriends = friends.length;
    if (numFriends == 0 && firstTimeCollectPopup) {
        firstTimeCollectPopup = false;
        setTimeout(showCollectDialog, 500);
    }
    numNeighbours = Object.keys(notmatched).length;
    numMatched = numMatchedImage = numMatchedManually = numDisabled = numIgnored = numFriendsShown = numNeighboursShown = 0;
    const getSortValueFunctions = {
        fname: (pair) => pair[0] ? pair[0].name : null,
        frecorded: (pair) => pair[0] ? pair[0].tc : NaN,
        score: (pair) => pair[0] ? pair[0].score : NaN,
        name: (pair) => pair[1] ? gui.getPlayerNameFull(pair[1]) : null,
        level: (pair) => pair[1] ? pair[1].level : NaN,
        region: (pair) => pair[1] ? pair[1].region : NaN,
        recorded: (pair) => pair[1] ? pair[1].extra.timeCreated || 0 : NaN
    };
    const sort = gui.getSortFunction(getSortValueFunctions, smartTable, 'fname');
    let arr = [];
    const isRowVisible = getRowVisibilityChecker();
    for (const friend of friends) {
        const pal = friend.score > 0 && notmatched[friend.uid];
        if (friend.disabled) numDisabled++;
        if (pal) {
            delete notmatched[friend.uid];
            numMatched++;
            if (friend.score == 95) numMatchedImage++;
            if (friend.score == 99) numMatchedManually++;
        } else {
            if (friend.score == -1) numIgnored++;
            else friend.score = 0;
        }
        if (isRowVisible(friend, pal)) {
            numFriendsShown++;
            if (pal) numNeighboursShown++;
            arr.push([friend, pal, '<tr data-friend-id="' + friend.id + (pal ? '" data-pal-id="' + pal.id : '') + '" lazy-render height="61"></tr>']);
        }
    }
    for (const pal of Object.values(notmatched)) {
        if (isRowVisible(null, pal)) {
            numNeighboursShown++;
            arr.push([null, pal, '<tr data-pal-id="' + pal.id + '" lazy-render height="61"></tr>']);
        }
    }
    arr = sort(arr);
    Dialog.htmlToDOM(smartTable.tbody[0], arr.map(item => item[2]).join(''));
    showStats();

    scheduledRefresh = setTimeout(function () {
        gui.collectLazyElements(smartTable.container);
        smartTable.syncLater();
    }, 50);
}

function cancelMatch() {
    matchingId = null;
    divMatch.style.display = 'none';
    smartTable.table.classList.remove('f-matching');
    const row = smartTable.table.querySelector('tr.f-ismatching');
    if (row) row.classList.remove('f-ismatching');
}

function matchFriendBase(friend, pal, score) {
    if (!friend || !pal) return false;
    setProcessed(friend, 1);
    if (friend.uid != pal.id || friend.score != score) {
        friend.uid = pal.id;
        friend.score = score;
        setProcessed(friend, 2);
    }
    numMatched++;
    if (score == 95) numMatchedImage++;
    if (score == 99) numMatchedManually++;
    return true;
}

function createImage(onLoad, onError) {
    const img = new Image();
    img.setAttribute('crossOrigin', 'anonymous');
    img.onload = onLoad;
    img.onerror = onError;
    return img;
}

const MATCH_WIDTH = 50;
const MATCH_HEIGHT = 50;
const MATCH_THRESHOLD = 0.02;
// const MATCH_MAXDIFF = Math.floor(MATCH_WIDTH * MATCH_HEIGHT * 0.01);

function drawImage(img) {
    const canvas = document.createElement('canvas');
    canvas.width = MATCH_WIDTH;
    canvas.height = MATCH_HEIGHT;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
}

// get picture as base64 string
function getImgDataURL(img) {
    const canvas = drawImage(img);
    return canvas.toDataURL('image/webp');
}

function getImgData(img) {
    const canvas = drawImage(img);
    const data = canvas.getContext('2d').getImageData(0, 0, MATCH_WIDTH, MATCH_HEIGHT).data;
    blendImage(data, MATCH_WIDTH, MATCH_HEIGHT);
    return data;
}

function pixelMatch(img1, img2, width, height, threshold, maxDiff) {
    let diff = 0;
    const maxPos = width * height * 4;
    for (let pos = 0; pos < maxPos; pos += 4) {
        const r = img1[pos + 0] - img2[pos + 0];
        const g = img1[pos + 1] - img2[pos + 1];
        const b = img1[pos + 2] - img2[pos + 2];
        const y = r * 0.29889531 + g * 0.58662247 + b * 0.11448223;
        const i = r * 0.59597799 - g * 0.27417610 - b * 0.32180189;
        const q = r * 0.21147017 - g * 0.52261711 + b * 0.31114694;
        const delta = (0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q) / 32858;
        if (delta > threshold) {
            diff++;
            if (diff > maxDiff) break;
        }
    }
    return diff;
}

function blendImage(img, width, height) {
    const maxPos = width * height * 4;
    const blend = (c, a) => 255 + (c - 255) * a;
    for (let pos = 0; pos < maxPos; pos += 4) {
        let a = img[pos + 3];
        if (a < 255) {
            a /= 255;
            img[pos + 0] = blend(img[pos + 0], a);
            img[pos + 1] = blend(img[pos + 1], a);
            img[pos + 2] = blend(img[pos + 2], a);
            img[pos + 3] = 255;
        }
    }
}

function matchStoreAndUpdate() {
    let rest, friendData, neighbourData;
    let hashById = {};
    let hashByName = {};

    cancelMatch();

    const friends = Object.values(bgp.Data.getFriends());
    numFriends = friends.length;

    const notmatched = getNeighboursAsNotMatched();
    numNeighbours = Object.keys(notmatched).length;

    numMatched = numMatchedImage = numMatchedManually = numToAnalyze = numAnalyzed = numIgnored = 0;

    if (numFriends == 0) return;

    // we reset the association on friends
    for (const friend of friends) {
        setProcessed(friend, 0);
        // we keep those who match by id or image, and clear the others
        if (friend.uid && friend.uid in notmatched && friend.score >= 95) {
            matchFriend(friend, notmatched[friend.uid], friend.score);
        } else if (friend.score == -1) {
            setProcessed(friend, 1);
            numIgnored++;
        }
    }

    rest = friends;
    rest = rest.filter(friend => !getProcessed(friend));

    // sort friends, disabled last
    rest.sort((a, b) => (a.disabled ? 1 : 0) - (b.disabled ? 1 : 0));

    matchRest();
    saveMatch(false);

    // Collect images to match
    const images = [];
    for (const friend of rest) {
        if (!friend.disabled) addImage('f' + friend.id, gui.getFBFriendAvatarUrl(friend.id, friend.img));
    }
    const numFriendsToAnalyze = images.length;
    for (const pal of Object.values(notmatched)) {
        addImage('n' + pal.id, gui.getNeighborAvatarUrl(pal));
    }
    const numNeighboursToAnalyze = images.length - numFriendsToAnalyze;
    // If there is at least one person in each group
    if (getMatchByImage() && numFriendsToAnalyze > 0 && numNeighboursToAnalyze > 0) {
        refresh();
        friendData = [];
        neighbourData = [];
        // Start num parallel tasks to load images
        let num = 2;
        num = Math.min(images.length, num);
        while ((num--) > 0) collectNext(createImage(imageOnLoad, imageOnLoad));
    } else {
        endMatching();
    }

    function saveMatch(flagZeroUnmatched) {
        const friendsToSave = [];
        for (const friend of friends) {
            if (flagZeroUnmatched && getProcessed(friend) == 0) {
                if (friend.score) setProcessed(friend, 2);
                delete friend.score;
                delete friend.uid;
            }
            if (getProcessed(friend) == 2) {
                setProcessed(friend, 1);
                friendsToSave.push(friend);
            }
        }
        bgp.Data.saveFriend(friendsToSave);
        gui.updateNeighborFriendNames(true);
    }

    function endMatching() {
        numToAnalyze = numAnalyzed = 0;
        saveMatch(true);
        // store neighbours
        // if (flagStoreNeighbours) bgp.Data.saveNeighbour(Object.values(bgp.Data.getNeighbours()));
        refresh();

        // Signal Neighbours Tab to Refresh its display
        // self.tabs['Neighbours'].time = null;
    }

    function matchFriend(friend, pal, score) {
        if (matchFriendBase(friend, pal, score)) {
            delete hashById[pal.fb_id];
            delete hashByName[gui.getPlayerNameFull(pal)];
            delete notmatched[pal.id];
        }
    }

    function matchRest() {
        // prepare match
        // set the hashes
        hashById = {};
        hashByName = {};
        for (const pal of Object.values(notmatched)) {
            // if the same key is already used, we set it to null to force an image comparison
            // store by fb_id
            let key = pal.fb_id;
            hashById[key] = key in hashById ? null : pal;
            // store by full name
            key = !pal.name && pal.extra.fn ? pal.extra.fn : gui.getPlayerNameFull(pal);
            hashByName[key] = key in hashByName ? null : pal;
        }

        // Match by FB id
        for (const friend of rest) {
            matchFriend(friend, hashById[friend.id], 100);
        }
        rest = rest.filter(friend => !getProcessed(friend));

        // prepare friends
        const hash = {};
        const col = rest;
        for (const friend of rest) {
            const names = friend.name.split(' ');
            friend.names = names;
            friend.skip = false;
            if (names.length > 1) {
                const first = names[0];
                const last = names[names.length - 1];
                const key1 = first + '\t' + last;
                const key2 = last + '\t' + first;
                if (key1 in hash || key2 in hash) {
                    hash[key1].skip = true;
                    friend.skip = true;
                } else {
                    hash[key1] = hash[key2] = friend;
                }
            }
        }

        const skipped = rest.filter(friend => friend.skip);
        rest = rest.filter(friend => !friend.skip);

        // Match functions [score, fn] in order of score descending
        const matchFunctions = [
            // Match by full name
            [90, friend => hashByName[friend.name]],
            // Match by first name + last name
            [80, friend => {
                const names = friend.names;
                return names.length > 1 ? hashByName[names[0] + ' ' + names[names.length - 1]] : null;
            }],
            // Match by last name + first name
            [70, friend => {
                const names = friend.names;
                return names.length > 1 ? hashByName[names[names.length - 1] + ' ' + names[0]] : null;
            }],
            // Chinese characters
            [60, friend => {
                const names = friend.names;
                const ch = names[0];
                let pal = null;
                if (names.length == 1 && ch.charCodeAt(0) >= 19968) {
                    // Match by second character (as first name) + first character (as last name)
                    pal = hashByName[ch.substr(1) + ' ' + ch.substr(0, 1)];
                    // If there are at least 4 characters
                    if (!pal && ch.length >= 4) {
                        // Match by 3rd-to-end characters (as first name) + 1st two characters (as last name)
                        pal = hashByName[ch.substr(2) + ' ' + ch.substr(0, 2)];
                    }
                }
                return pal;
            }]
        ];
        // try to match, one method at a time
        for (const matchFunction of matchFunctions) {
            const fn = matchFunction[1];
            const score = matchFunction[0];
            for (const friend of rest) matchFriend(friend, fn(friend), score);
            rest = rest.filter(friend => !getProcessed(friend));
        }

        rest = rest.concat(skipped);

        // cleanup
        for (const friend of col) {
            delete friend.names;
            delete friend.skip;
        }
    }

    function addImage(id, url) {
        numToAnalyze++;
        images.push([id, url]);
    }

    function collectNext(img) {
        const a = images.pop();
        if (a) {
            img.id = a[0];
            img.src = a[1];
        }
    }

    function imageOnLoad() {
        // this is the image used by FB when a profile has no picture
        numAnalyzed++;
        showStats();
        const img = this;
        if (img.complete && img.naturalHeight > 0) {
            const dataURL = getImgDataURL(img);
            const imgData = getImgData(img);
            const skip = dataURL == FB_ANON_MALE_IMG || dataURL == FB_ANON_FEMALE_IMG;
            if (!skip) {
                const isFriend = img.id.charAt(0) == 'f';
                const id = img.id.substr(1);
                const data = [id, dataURL, imgData];
                if (isFriend) friendData.push(data);
                else neighbourData.push(data);
            }
        }
        if (numToAnalyze && numAnalyzed == numToAnalyze) {
            // all images are loaded
            numToAnalyze = numAnalyzed = 0;
            matchByImage();
            // then try to match by name (again)
            matchRest();
            endMatching();
        }
        collectNext(img);
    }

    function matchByImage() {
        for (let diffPerc = 1; diffPerc <= 15 && friendData.length && neighbourData.length; diffPerc++) {
            const MATCH_MAXDIFF = Math.floor(MATCH_WIDTH * MATCH_HEIGHT * diffPerc / 100);
            for (let index = friendData.length - 1; index >= 0; index--) {
                const data = friendData[index];
                const fb_id = data[0];
                // const dataURL = data[1];
                const imgData = data[2];
                // const friendsMatched = friendData.filter(data => data[0] == fb_id || data[1] == dataURL);
                // const neighbourMatched = neighbourData.filter(data => data[1] == dataURL);
                const friendsMatched = friendData.filter(data => data[0] == fb_id || pixelMatch(imgData, data[2], MATCH_WIDTH, MATCH_HEIGHT, MATCH_THRESHOLD, MATCH_MAXDIFF) < MATCH_MAXDIFF);
                const neighbourMatched = neighbourData.filter(data => pixelMatch(imgData, data[2], MATCH_WIDTH, MATCH_HEIGHT, MATCH_THRESHOLD, MATCH_MAXDIFF) < MATCH_MAXDIFF);
                // Image should be unique
                if (friendsMatched.length == 1 && neighbourMatched.length == 1) {
                    const friend = friends.find(friend => friend.id == fb_id);
                    const uid = neighbourMatched[0][0];
                    const pal = notmatched[uid];
                    matchFriend(friend, pal, 95);
                    // Remove friend & neighbor
                    friendData.splice(index, 1);
                    neighbourData = neighbourData.filter(data => data[0] != uid);
                }
            }
        }
        rest = rest.filter(friend => !getProcessed(friend));
    }
}

function onTooltip(event) {
    const element = event.target;
    const td = element.parentNode.parentNode;
    const row = td.parentNode;
    let fb_id, fb_image;
    if (td.cellIndex == 0) {
        fb_id = row.getAttribute('data-friend-id');
        const friend = fb_id && bgp.Data.getFriend(fb_id);
        fb_image = friend && gui.getFBFriendAvatarUrl(fb_id, friend.img, 108);
    } else {
        const pal_id = row.getAttribute('data-pal-id');
        const pal = pal_id && bgp.Data.getNeighbour(pal_id);
        fb_image = gui.getNeighborAvatarUrl(pal);
    }
    if (fb_image) {
        const htm = Html.br`<div class="neighbors-tooltip"><img width="108" height="108" src="${fb_image}"/></div>`;
        Tooltip.show(element, htm);
    }
}

function formatDateExcel(value) {
    let s = Locale.getDate(value).toISOString();
    s = s.substr(0, s.length - 5).replace('T', ' ');
    return s;
}

function exportData() {
    let data = [];
    const friends = Object.values(bgp.Data.getFriends());
    for (const friend of friends) {
        const line = [];
        data.push(line);
        line.push(friend.id, friend.name, friend.uri, formatDateExcel(friend.tc), friend.score);
        const pal = friend.uid && bgp.Data.getNeighbour(friend.uid);
        if (pal) {
            line.push(gui.getPlayerNameFull(pal), pal.level, pal.region, pal.extra.lastGift ? formatDateExcel(pal.extra.lastGift) : '');
            if (isAdmin) line.push(pal.id);
        }
    }
    const comparer = gui.getNaturalComparer();
    data.sort((a, b) => comparer(a[1], b[1]));
    const header = ['FB_ID', 'FB_NAME', 'FB_PAGE', 'RECORDED', 'SCORE', 'NEIGHBOUR', 'LEVEL', 'REGION', 'LAST_GIFT'];
    if (isAdmin) header.push('ID');
    data.unshift(header);
    data = data.map(line => line.join('\t'));
    data = data.join('\n');
    gui.downloadData(data, 'DAF_friends_%date%_%time%.csv');
}