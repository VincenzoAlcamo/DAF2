/*global chrome bgp gui Locale Dialog SmartTable Html Tooltip*/
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

var tab, container, selectShow, searchInput, smartTable, searchHandler;
var buttonUnlink, buttonIgnore, buttonRegard, buttonManual, friendDisabled;
var divMatch, matchingId;

var firstTimeManualHelp = true;
var numFriends = 0;
var numDisabled = 0;
var numNeighbours = 0;
var numMatched = 0;
var numMatchedImage = 0;
var numMatchedManually = 0;
var numIgnored = 0;
var numAnalyzed = 0;
var numToAnalyze = 0;
var numFriendsShown = 0;
var numNeighboursShown = 0;

let processed = {};

function setProcessed(friend, value) {
    processed[friend.id] = value;
}

function getProcessed(friend) {
    return processed[friend.id];
}

function init() {
    tab = this;
    container = tab.container;

    buttonUnlink = Html `<button data-action="unlink" title="${gui.getMessage('friendship_actionunlink')}"></button>`;
    buttonIgnore = Html `<button data-action="ignore" title="${gui.getMessage('friendship_actionignore')}"></button>`;
    buttonRegard = Html `<button data-action="regard" title="${gui.getMessage('friendship_actionregard')}"></button>`;
    buttonManual = Html `<button data-action="manual" title="${gui.getMessage('friendship_actionmanual')}"></button>`;
    friendDisabled = Html `<div class="f-disabled">${gui.getMessage('friendship_accountdisabled')}</div>`;

    selectShow = container.querySelector('[name=show]');
    for (var char of 'admghifuns'.split('')) {
        var option = document.createElement('option');
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
    smartTable.tbody[0].addEventListener('render', event => updateRow(event.target));
    smartTable.tbody[0].addEventListener('click', tableClick);

    container.querySelector('.toolbar button[data-action="collect"]').addEventListener('click', showCollectDialog);
    container.querySelector('.toolbar button[data-action="export"]').addEventListener('click', exportData);
    divMatch = container.querySelector('.DAF-gc-pal');
    divMatch.addEventListener('click', cancelMatch);
    smartTable.container.insertBefore(divMatch, smartTable.container.firstChild);

    smartTable.table.addEventListener('input', onInput);

    container.addEventListener('tooltip', onTooltip);
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
    selectShow.value = state.show || '';
    searchInput.value = state.search || '';
    gui.setSortState(state.sort, smartTable, 'fname');
}

function update() {
    refresh();
}

function getRemoveGhosts() {
    var result = parseInt(gui.getPreference('removeGhosts'));
    return result >= 0 && result <= 2 ? result : 0;
}

function getNeighboursAsNotMatched() {
    var neighbours = bgp.Data.getNeighbours();
    var notmatched = Object.assign({}, neighbours);
    // Remove Mr.Bill
    delete notmatched[1];
    return notmatched;
}

function getUnmatched() {
    return Object.values(bgp.Data.friends).filter(friend => friend.score == 0).map(friend => friend.id);
}

function showCollectDialog() {
    var ghost = getRemoveGhosts();
    let numUnmatched = getUnmatched().length;

    function addAlternateSettings() {
        var extra = Html.br `<br>${gui.getMessage('friendship_collectghostdelete')} <select name="ghost">`;
        for (var i = 0; i <= 2; i++)
            extra += Html.br `<option value="${i}"${i == ghost ? ' selected' : ''}>${gui.getMessage('friendship_collectghost' + i)}</option>`;
        extra += Html.br `</select>`;
        return Html.raw(extra);
    }

    function button(method) {
        var msgId = 'friendship_collect' + method;
        var htm = Html.br `<tr style="border-top:2px solid rgba(0,0,0,0.2)">
<td style="text-align:right"><button value="${method}">${gui.getMessage(msgId)}</button></td>
<td>${gui.getMessage(msgId + 'info')}
${method == 'standard' ? '\n' + gui.getMessage('friendship_disabledinfo') : ''}
${method == 'unmatched' ? '\n' + gui.getMessage('friendship_filter_f', Locale.formatNumber(numUnmatched)) : ''}
${method == 'alternate' ? '\n' + gui.getMessage('friendship_ghostinfo') : ''}
${method == 'alternate' ? addAlternateSettings() : ''}
</td></tr>`;
        return htm;
    }

    function setNewGhost(params) {
        var newGhost = parseInt(params.ghost) || 0;
        if (ghost != newGhost) {
            gui.setPreference('removeGhosts', newGhost);
            ghost = newGhost;
        }
    }

    gui.dialog.show({
        title: gui.getMessage('friendship_collect'),
        html: Html.br `${gui.getMessage('friendship_collectpreamble')}
<table style="margin-top:16px">
${button('standard')}
${numFriends > 0 ? button('unmatched') : ''}
${numFriends > 0 ? button('match') : ''}
</table>`,
        style: ['standard', 'unmatched', 'alternate', 'both', 'match', Dialog.CANCEL]
    }, function(method, params) {
        setNewGhost(params);
        if (method == 'standard' || method == 'unmatched' || method == 'alternate' || method == 'both' || method == 'match') {
            gui.dialog.show({
                title: gui.getMessage('friendship_collect'),
                html: Html.br `<p style="text-align:left">${gui.getMessage('friendship_collect' + method + 'info')}
${method == 'both' || method == 'standard' ? '\n' + gui.getMessage('friendship_disabledinfo') : ''}
${method == 'unmatched' ? '\n' + gui.getMessage('friendship_filter_f', Locale.formatNumber(numUnmatched)) : ''}
${method == 'both' || method == 'alternate' ? '\n' + gui.getMessage('friendship_ghostinfo') : ''}
</p>
${method == 'both' || method == 'alternate' ? addAlternateSettings() : ''}
<br><br>${gui.getMessage('friendship_confirmwarning')}`,
                style: [Dialog.CRITICAL, Dialog.CONFIRM, Dialog.CANCEL]
            }, function(confirmation, params) {
                if (method == 'alternate' || method == 'both') setNewGhost(params);
                if (confirmation != Dialog.CONFIRM) return;
                if (method == 'standard' || method == 'alternate' || method == 'both' || method == 'unmatched') collectFriends(method);
                else if (method == 'match') matchStoreAndUpdate();
            });
        }
    });
}

function tableClick(event) {
    var row = null;
    for (var node = event.target; node && !row; node = node.parentNode) {
        if (node.tagName == 'TABLE') break;
        if (node.tagName == 'TR') row = node;
    }
    if (!row) return;

    var el = event.target;
    var fb_id = row.getAttribute('data-friend-id');
    var pal_id = row.getAttribute('data-pal-id');
    var friend = fb_id && bgp.Data.getFriend(fb_id);
    var pal = pal_id && bgp.Data.getNeighbour(pal_id);
    var flagModified = false;
    var isRowVisible = getRowVisibilityChecker();
    var action = el.tagName == 'BUTTON' ? el.getAttribute('data-action') : null;
    if (el.tagName == 'TD' && el.cellIndex == 3 && smartTable.table.classList.contains('f-matching') && matchingId && friend && friend.score <= 0) action = 'match';

    if (action == 'match') {
        // MANUAL MATCH
        pal = bgp.Data.getNeighbour(matchingId);
        let row2 = container.querySelector('tr[data-pal-id="' + pal.id + '"]');
        if (row2) row2.parentNode.removeChild(row2);
        matchFriendBase(friend, pal, 99);
        flagModified = true;
        cancelMatch();
    } else if (action == 'unlink' && friend && pal) {
        // UNLINK
        numMatched--;
        delete friend.uid;
        delete friend.score;
        flagModified = true;
        if (isRowVisible(null, pal)) {
            let row2 = row.parentNode.appendChild(document.createElement('tr'));
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
            divMatch.style.backgroundImage = 'url(' + gui.getFBFriendAvatarUrl(pal.fb_id) + ')';
            divMatch.firstElementChild.innerText = pal.level;
            divMatch.lastElementChild.innerText = gui.getPlayerNameFull(pal);
            divMatch.style.display = 'block';
            smartTable.table.classList.add('f-matching');
            matchingId = pal.id;
            if (firstTimeManualHelp) {
                firstTimeManualHelp = false;
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
        showStats();
    }
}

function onInput(event) {
    let input = event.target;
    if (!input || input.tagName != 'INPUT' || !input.classList.contains('note')) return;
    let row = input.parentNode.parentNode;
    let note = input.value.trim();

    if (input.classList.contains('f-note')) {
        let fb_id = row.getAttribute('data-friend-id');
        let friend = fb_id && bgp.Data.getFriend(fb_id);
        if (friend) {
            friend.note = note;
            bgp.Data.saveFriend(friend);
        }
    } else if (input.classList.contains('n-note')) {
        let pal_id = row.getAttribute('data-pal-id');
        let pal = pal_id && bgp.Data.getNeighbour(pal_id);
        if (pal) {
            pal.extra.note = note;
            bgp.Data.saveNeighbour(pal);
        }
    }
}

function collectFriends(method) {
    let width = 1000;
    let height = 500;
    let unmatched = method == 'unmatched' ? getUnmatched().join() : '';
    chrome.windows.create({
        width: width,
        height: height,
        left: Math.floor((screen.availWidth - width) / 2),
        top: Math.floor((screen.availHeight - height) / 2),
        type: 'popup',
        url: 'https://www.facebook.com/profile.php?sk=friends'
    }, function(w) {
        var tabId = w.tabs[0].id;
        bgp.Tab.excludeFromInjection(tabId);
        var details = {
            file: '/js/Dialog.js',
            runAt: 'document_end',
            allFrames: false,
            frameId: 0
        };
        chrome.tabs.executeScript(tabId, details, function() {
            details.file = '/inject/collectfriends.js';
            chrome.tabs.executeScript(tabId, details, function() {
                delete details.file;
                let code = '';
                let addVar = (name, value) => code += name + '=' + JSON.stringify(value) + ';';
                addVar('language', gui.getPreference('language'));
                addVar('unmatched', unmatched);
                addVar('collectMethod', method);
                addVar('removeGhosts', getRemoveGhosts());
                details.code = code + 'collect();';
                chrome.tabs.executeScript(tabId, details, function() {});
            });
        });
    });
}

function showStats() {
    var htm = '';
    if (numToAnalyze == numAnalyzed || numToAnalyze == 0) {
        gui.wait.hide();
        if (bgp.Data.friendsCollectDate > 0) {
            htm += Html.br `${gui.getMessage('friendship_friendupdateinfo',  Locale.formatDateTimeFull(bgp.Data.friendsCollectDate))}`;
        }
    } else {
        var num = Math.min(numAnalyzed > 0 ? numAnalyzed + 1 : 0, numToAnalyze);
        var analyzingText = gui.getMessage('friendship_analyzingmatches', Math.floor(num / numToAnalyze * 100), num, numToAnalyze);
        gui.wait.setText(analyzingText);
        htm += Html.br `${analyzingText}`;
    }
    container.querySelector('.stats').innerHTML = htm;

    var params = {
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
    for (var option of selectShow.querySelectorAll('option')) {
        option.innerText = gui.getMessage('friendship_filter_' + option.value, ...params[option.value]);
    }

    htm = Html.br `${gui.getMessage('friendship_totalfriends', Locale.formatNumber(numFriendsShown), Locale.formatNumber(numFriends))}`;
    for (let div of container.querySelectorAll('.numfriends')) div.innerHTML = htm;
    htm = Html.br `${gui.getMessage('friendship_totalneighbours', Locale.formatNumber(numNeighboursShown), Locale.formatNumber(numNeighbours))}`;
    for (let div of container.querySelectorAll('.numneighbours')) div.innerHTML = htm;
}

function updateRow(row) {
    var fb_id = row.getAttribute('data-friend-id');
    var pal_id = row.getAttribute('data-pal-id');
    var friend = fb_id && bgp.Data.getFriend(fb_id);
    var pal = pal_id && bgp.Data.getNeighbour(pal_id);
    var htm = '';
    if (friend) {
        let anchor = gui.getFBFriendAnchor(friend.id, friend.uri);
        htm += Html.br `<td>${anchor}<img height="50" width="50" src="${gui.getFBFriendAvatarUrl(friend.id)}" class="tooltip-event"/></a></td>`;
        htm += Html.br `<td>${anchor}${friend.name}</a><br>`;
        htm += Html.br `<input class="note f-note" type="text" maxlength="50" placeholder="${gui.getMessage('gui_nonote')}" value="${friend.note}">${friend.disabled ? friendDisabled : ''}</td>`;
        htm += Html.br `<td>${Locale.formatDate(friend.tc)}<br>${Locale.formatDays(friend.tc)}</td>`;
        if (pal) {
            htm += Html.br `<td>${Locale.formatNumber(friend.score)}</td>`;
            htm += Html.br `<td>${buttonUnlink}</td>`;
        } else {
            htm += Html.br `<td></td><td>${friend.score == -1 ? buttonRegard : buttonIgnore}</td>`;
        }
    } else {
        htm += Html.br `<td></td><td></td><td></td><td></td><td>${buttonManual}</td>`;
    }
    if (pal) {
        let anchor = Html.raw('<a class="no-link" translate="no">');
        htm += Html.br `<td>${anchor}<img height="50" width="50" src="${gui.getFBFriendAvatarUrl(pal.fb_id)}" class="tooltip-event"/></a></td>`;
        htm += Html.br `<td>${anchor}${gui.getPlayerNameFull(pal)}</a><br><input class="note n-note" type="text" maxlength="50" placeholder="${gui.getMessage('gui_nonote')}" value="${pal.extra.note}"></td>`;
        htm += Html.br `<td>${Locale.formatNumber(pal.level)}</td>`;
        htm += Html.br `<td>${Locale.formatDate(pal.extra.timeCreated)}<br>${Locale.formatDays(pal.extra.timeCreated)}</td>`;
    } else {
        htm += Html.br `<td></td><td></td><td></td><td></td>`;
    }
    row.innerHTML = htm;
    var isIgnored = friend ? friend.score == -1 : false;
    var isNotMatched = friend && !pal ? !isIgnored : false;
    row.classList.toggle('f-ignored', isIgnored);
    row.classList.toggle('f-notmatched', isNotMatched);
}

var scheduledRefresh;

function refresh() {
    triggerSearchHandler(false);
    gui.updateTabState(tab);

    smartTable.tbody[0].innerHTML = '';
    showStats();

    if (scheduledRefresh) clearTimeout(scheduledRefresh);
    scheduledRefresh = setTimeout(refreshDelayed, 50);
}

function getRowVisibilityChecker() {
    let state = getState();
    let fnSearch = gui.getSearchFilter(state.search);
    let show = state.show;
    let fn = {
        'a': (_friend, _pal) => true,
        'd': (friend, _pal) => friend && friend.disabled,
        'm': (friend, pal) => friend && pal,
        'g': (friend, pal) => friend && pal && friend.score == 95,
        'h': (friend, pal) => friend && pal && friend.score == 99,
        'i': (friend, _pal) => friend && friend.score == -1,
        'f': (friend, _pal) => friend && friend.score == 0,
        'u': (friend, pal) => friend && !pal,
        'n': (friend, pal) => pal && !friend,
        's': (friend, pal) => friend ? friend.score == 0 : pal,
    } [show] || (() => false);
    return function isRowVisible(friend, pal) {
        if (fnSearch) {
            let text = '';
            if (friend) text += '\t' + friend.name + '\t' + (friend.note || '');
            if (pal) text += '\t' + gui.getPlayerNameFull(pal) + '\t' + (pal.extra.note || '');
            if (!fnSearch(text.toUpperCase())) return false;
        }
        return fn(friend, pal);
    };
}

function refreshDelayed() {
    scheduledRefresh = 0;

    var friends = Object.values(bgp.Data.getFriends());
    var notmatched = getNeighboursAsNotMatched();
    numFriends = friends.length;
    if (numFriends == 0) setTimeout(showCollectDialog, 500);
    numNeighbours = Object.keys(notmatched).length;
    numMatched = numMatchedImage = numMatchedManually = numDisabled = numIgnored = numFriendsShown = numNeighboursShown = 0;
    let getSortValueFunctions = {
        fname: (pair) => pair[0] ? pair[0].name : null,
        frecorded: (pair) => pair[0] ? pair[0].tc : NaN,
        score: (pair) => pair[0] ? pair[0].score : NaN,
        name: (pair) => pair[1] ? gui.getPlayerNameFull(pair[1]) : null,
        level: (pair) => pair[1] ? pair[1].level : NaN,
        recorded: (pair) => pair[1] ? pair[1].extra.timeCreated || 0 : NaN
    };
    let sort = gui.getSortFunction(getSortValueFunctions, smartTable, 'fname');
    var arr = [];
    var isRowVisible = getRowVisibilityChecker();
    for (var friend of friends) {
        var pal = friend.score > 0 && notmatched[friend.uid];
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
    for (let pal of Object.values(notmatched)) {
        if (isRowVisible(null, pal)) {
            numNeighboursShown++;
            arr.push([null, pal, '<tr data-pal-id="' + pal.id + '" lazy-render height="61"></tr>']);
        }
    }
    arr = sort(arr);
    smartTable.tbody[0].innerHTML = arr.map(item => item[2]).join('');
    showStats();

    scheduledRefresh = setTimeout(function() {
        gui.collectLazyElements(smartTable.container);
        smartTable.syncLater();
    }, 50);
}

function cancelMatch() {
    matchingId = null;
    divMatch.style.display = 'none';
    smartTable.table.classList.remove('f-matching');
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

function matchStoreAndUpdate() {
    var rest, notmatched, images, friendData, neighbourData, canvas;
    var hashById = {};
    var hashByName = {};

    cancelMatch();

    var friends = Object.values(bgp.Data.getFriends());
    numFriends = friends.length;

    notmatched = getNeighboursAsNotMatched();
    numNeighbours = Object.keys(notmatched).length;

    numMatched = numMatchedImage = numMatchedManually = numToAnalyze = numAnalyzed = numIgnored = 0;

    if (numFriends == 0) return;

    // we reset the association on friends
    for (var friend of friends) {
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

    // Collect images to match
    images = [];
    for (let friend of rest) {
        if (!friend.disabled) addImage('f' + friend.id, gui.getFBFriendAvatarUrl(friend.id));
    }
    var numFriendsToAnalyze = images.length;
    for (let pal of Object.values(notmatched)) {
        addImage('n' + pal.id, gui.getFBFriendAvatarUrl(pal.fb_id));
    }
    var numNeighboursToAnalyze = images.length - numFriendsToAnalyze;
    // If there is at least one person in each group
    if (numFriendsToAnalyze > 0 && numNeighboursToAnalyze > 0) {
        friendData = [];
        neighbourData = [];
        canvas = document.createElement('canvas');
        // Start num parallel tasks to load images
        var num = 2;
        num = Math.min(images.length, num);
        while ((num--) > 0) collectNext(createImage());
    } else {
        endMatching();
    }

    function endMatching() {
        numToAnalyze = numAnalyzed = 0;
        var friendsToSave = [];
        for (var friend of friends) {
            if (getProcessed(friend) == 0) {
                if (friend.score) setProcessed(friend, 2);
                delete friend.score;
                delete friend.uid;
            }
            if (getProcessed(friend) == 2) friendsToSave.push(friend);
        }
        bgp.Data.saveFriend(friendsToSave);
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
        for (var pal of Object.values(notmatched)) {
            // if the same key is already used, we set it to null to force an image comparison
            // store by fb_id
            var key = pal.fb_id;
            hashById[key] = key in hashById ? null : pal;
            // store by full name
            key = gui.getPlayerNameFull(pal);
            hashByName[key] = key in hashByName ? null : pal;
        }

        // Match by FB id
        for (var friend of rest) {
            matchFriend(friend, hashById[friend.id], 100);
        }
        rest = rest.filter(friend => !getProcessed(friend));

        // prepare friends
        var hash = {};
        var col = rest;
        for (let friend of rest) {
            var names = friend.name.split(' ');
            friend.names = names;
            friend.skip = false;
            if (names.length > 1) {
                var first = names[0];
                var last = names[names.length - 1];
                var key1 = first + '\t' + last;
                var key2 = last + '\t' + first;
                if (key1 in hash || key2 in hash) {
                    hash[key1].skip = true;
                    friend.skip = true;
                } else {
                    hash[key1] = hash[key2] = friend;
                }
            }
        }

        var skipped = rest.filter(friend => friend.skip);
        rest = rest.filter(friend => !friend.skip);

        // Match functions [score, fn] in order of score descending
        var matchFunctions = [
            // Match by full name
            [90, friend => hashByName[friend.name]],
            // Match by first name + last name
            [80, friend => {
                var names = friend.names;
                return names.length > 1 ? hashByName[names[0] + ' ' + names[names.length - 1]] : null;
            }],
            // Match by last name + first name
            [70, friend => {
                var names = friend.names;
                return names.length > 1 ? hashByName[names[names.length - 1] + ' ' + names[0]] : null;
            }],
            // Chinese characters
            [60, friend => {
                var names = friend.names;
                var ch = names[0];
                var pal = null;
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
        for (var matchFunction of matchFunctions) {
            var fn = matchFunction[1];
            var score = matchFunction[0];
            for (let friend of rest) matchFriend(friend, fn(friend), score);
            rest = rest.filter(friend => !getProcessed(friend));
        }

        rest = rest.concat(skipped);

        // cleanup
        for (let friend of col) {
            delete friend.names;
            delete friend.skip;
        }
    }

    function addImage(id, url) {
        numToAnalyze++;
        images.push([id, url]);
    }

    function collectNext(img) {
        var a = images.pop();
        if (a) {
            img.id = a[0];
            img.src = a[1];
        }
    }

    function createImage() {
        var img = new Image();
        img.setAttribute('crossOrigin', 'anonymous');
        img.onload = imageOnLoad;
        img.onerror = imageOnLoad;
        return img;
    }


    function imageOnLoad() {
        // this is the image used by FB when a profile has no picture
        const FB_ANON_MALE_IMG = 'data:image/webp;base64,UklGRrIAAABXRUJQVlA4IKYAAACQBwCdASoyADIAPm0qkUWkIqGYDf2AQAbEtIBp7Ay0G/WSUM7JlLizCyxMfDWO4GTZsZ3rW/OD7o4ZrD5+BT08hIdEQYAA/voQZ4IvItpppdVXQWuubgHZ7Hz5ClT98CfXGkCeTZrhstMPkFiBPgl23Ssn29LDaI8GTQEsEUH2eeI8S7rLcNeX3hT74sAvZ2QAc9yDKh3vCDZXO6AcSFxINezC50AA';
        const FB_ANON_FEMALE_IMG = 'data:image/webp;base64,UklGRr4AAABXRUJQVlA4ILIAAABwBwCdASoyADIAPm0sk0WkIqGYDP0AQAbEtIBpOAqR8vvvO+zCp3M5F/ypDPVcAFo8VaiTamuvfoNQ/F5jaFiClqnYAAD++hBpI/d9yd90D8hRGlQZaLknz1bhjUBHwA03kCUnr+UZrKEK7H/RvtF2vwwgGNTfo5enYKkJ23075Nyi25PsFHIttUiGOfXnjtuOyT6lisDClpVR4YKW7iP+LCUUBF1yzvTUONcxCYqsEAAA';
        numAnalyzed++;
        showStats();
        var img = this;
        if (img.complete && img.naturalHeight > 0) {
            // get picture as base64 string
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            var dataURL = canvas.toDataURL('image/webp');
            if (dataURL != FB_ANON_MALE_IMG && dataURL != FB_ANON_FEMALE_IMG) {
                var isFriend = img.id.charAt(0) == 'f';
                var id = img.id.substr(1);
                var data = [id, dataURL];
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
        for (var data of friendData) {
            var fb_id = data[0];
            var dataURL = data[1];
            var friendsMatched = friendData.filter(data => data[1] == dataURL);
            var neighbourMatched = neighbourData.filter(data => data[1] == dataURL);
            // Image should be unique
            if (friendsMatched.length == 1 && neighbourMatched.length == 1) {
                var friend = friends.find(friend => friend.id == fb_id);
                var uid = neighbourMatched[0][0];
                var pal = notmatched[uid];
                matchFriend(friend, pal, 95);
            }
        }
        rest = rest.filter(friend => !getProcessed(friend));
    }
}

function onTooltip(event) {
    let element = event.target;
    let td = element.parentNode.parentNode;
    let row = td.parentNode;
    let fb_id;
    if (td.cellIndex == 0) {
        fb_id = row.getAttribute('data-friend-id');
    } else {
        let pal_id = row.getAttribute('data-pal-id');
        let pal = pal_id && bgp.Data.getNeighbour(pal_id);
        fb_id = pal && pal.fb_id;
    }
    if (fb_id) {
        let htm = Html.br `<div class="neighbors-tooltip"><img width="108" height="108" src="${gui.getFBFriendAvatarUrl(fb_id, 108)}"/></div>`;
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
    let friends = Object.values(bgp.Data.getFriends());
    for (let friend of friends) {
        let line = [];
        data.push(line);
        line.push(friend.id, friend.name, friend.uri, formatDateExcel(friend.tc), friend.score);
        let pal = friend.uid && bgp.Data.getNeighbour(friend.uid);
        if (pal) {
            line.push(gui.getPlayerNameFull(pal), pal.level, pal.region, pal.extra.lastGift ? formatDateExcel(pal.extra.lastGift) : '');
        }
    }
    let comparer = gui.getNaturalComparer();
    data.sort((a, b) => comparer(a[1], b[1]));
    data.unshift(['FB_ID', 'FB_NAME', 'FB_PAGE', 'RECORDED', 'SCORE', 'NEIGHBOUR', 'LEVEL', 'REGION', 'LAST_GIFT']);
    data = data.map(line => line.join('\t'));
    data = data.join('\n');
    gui.downloadData(data, 'DAF_friends ' + Locale.formatDateTime(gui.getUnixTime()) + '.csv');
}