/*global bgp gui SmartTable Dialog Html Locale*/
export default {
    hasCSS: true,
    init: init,
    update: update,
    getState: getState,
    setState: setState,
    actions: {
        'rewards_update': update
    },
    requires: ['materials']
};

const SECONDS_IN_A_DAY = 86400;

let tab, container, smartTable, items, clearStatusHandler, numTotal, numToCollect, selectConvert;
let materialImageCache = {};
let clicked = {};
let firstTime = true;

//#region LINK HELPER FUNCTIONS
const LinkData = (function () {
    const reLink1 = /https?:\/\/l\.facebook\.com\/l.php\?u=([^&\s]+)(&|\s|$)/g;
    const reLink2 = /https?:\/\/diggysadventure\.com\/miner\/wallpost_link.php\S*[?&]url=([^&\s]+)(&|\s|$)/g;
    const reFacebook = /https?:\/\/apps\.facebook\.com\/diggysadventure\/wallpost\.php\?wp_id=(\d+)&fb_type=(standard|portal)&wp_sig=([0-9a-z]+)/g;
    const rePortal = /https?:\/\/portal\.pixelfederation\.com\/(([^/]+\/)?gift|wallpost)\/diggysadventure\?params=(([0-9a-zA-Z\-_]|%2B|%2F)+(%3D){0,2})/g;

    function getLinkData(href) {
        let result = [];
        let hash = {};
        let match, data;

        function getObj(id, typ, sig) {
            if (id in hash) return null;
            hash[id] = true;
            return {
                id: id,
                typ: typ,
                sig: sig
            };
        }
        href = href.replace(reLink1, (a, b) => ' ' + decodeURIComponent(b) + ' ');
        href = href.replace(reLink2, (a, b) => ' ' + decodeURIComponent(b) + ' ');
        if (href.indexOf('://apps.facebook.com/') > 0) {
            reFacebook.lastIndex = 0;
            while ((match = reFacebook.exec(href))) {
                data = getObj(match[1], match[2], match[3]);
                if (data) result.push(data);
            }
        }
        if (href.indexOf('://portal.pixelfederation.com/') > 0) {
            rePortal.lastIndex = 0;
            while ((match = rePortal.exec(href))) {
                try {
                    let params = decodeURIComponent(match[3]).replace(/-/g, '+').replace(/_/g, '/');
                    let payload = atob(params);
                    let json = JSON.parse(payload);
                    if (json.wp_id && json.fb_type && json.wp_sig) {
                        data = getObj(json.wp_id, json.fb_type, json.wp_sig);
                        if (data) result.push(data);
                    }
                } catch (e) { }
            }
        }
        return result;
    }

    function getLink(data, convert = 0) {
        if ((data.typ == 'portal' && convert == 0) || convert == 2) {
            var json = JSON.stringify({
                action: 'wallpost',
                wp_id: data.id,
                fb_type: data.typ,
                wp_sig: data.sig
            });
            return 'https://portal.pixelfederation.com/wallpost/diggysadventure?params=' + encodeURIComponent(btoa(json));
        }
        let url = 'https://apps.facebook.com/diggysadventure/wallpost.php?wp_id=' + encodeURIComponent(data.id) + '&fb_type=' + encodeURIComponent(data.typ) + '&wp_sig=' + encodeURIComponent(data.sig);
        return convert == 3 ? 'https://diggysadventure.com/miner/wallpost_link.php?url=' + encodeURIComponent(url) : url;
    }

    return {
        getLinkData: getLinkData,
        getLink: getLink
    };
})();
//#endregion

function init() {
    tab = this;
    container = tab.container;

    smartTable = new SmartTable(container.querySelector('.rewardlinks_data'));
    smartTable.onSort = update;
    smartTable.table.addEventListener('click', onClickTable, true);

    selectConvert = container.querySelector('[name=convert]');
    selectConvert.addEventListener('input', update);

    for (let button of container.querySelectorAll('.toolbar button')) {
        button.addEventListener('click', onClickButton);
    }
}

function getState() {
    return {
        convert: selectConvert.value,
        sort: gui.getSortState(smartTable, 'id')
    };
}

function setState(state) {
    state.convert = gui.setSelectState(selectConvert, state.convert);
    gui.setSortState(state.sort, smartTable, 'id');
    smartTable.setSortInfo();
}

function onClickButton() {
    let action = this.getAttribute('data-action');
    if (action == 'add') {
        gui.dialog.show({
            title: gui.getMessage('rewardlinks_addlinks'),
            html: Html.br`${gui.getMessage('rewardlinks_pasteadd', gui.getMessage('dialog_confirm'))}<br/><textarea cols="60" rows="8" name="links"></textarea>`,
            defaultButton: 'links',
            style: [Dialog.CONFIRM, Dialog.CANCEL]
        }, function (method, params) {
            if (method == Dialog.CONFIRM) {
                let arr = LinkData.getLinkData(params.links);
                let numTotal = arr.length;
                let numAdded = numTotal && bgp.Data.addRewardLinks(arr);
                if (numAdded == 0)
                    gui.toast.show({
                        text: gui.getMessage('rewardlinks_nolinksadded')
                    });
            }
        });
    } else if (action == 'shorten') {
        gui.dialog.show({
            title: gui.getMessage('rewardlinks_shortenlinks'),
            html: Html.br`
${gui.getMessage('rewardlinks_convert')} <select data-method="input" name="convert">
<option value="3">Facebook</option>
<option value="2">Portal</option>
</select>
<br/>${gui.getMessage('rewardlinks_shortenlinks_info1')}<br/>
<textarea data-method="input" cols="60" rows="5" name="links"></textarea>
<br/>${gui.getMessage('rewardlinks_shortenlinks_info2')}<br/>
<textarea readonly cols="60" rows="6" name="result"></textarea>`,
            defaultButton: 'links',
            style: [Dialog.OK, Dialog.WIDEST]
        }, function (method, params) {
            if (method == 'input') {
                let arr = LinkData.getLinkData(params.links);
                let text = arr.map(item => LinkData.getLink(item, params.convert)).join('\n');
                gui.dialog.element.querySelector('[name=result]').value = text;
            }
        });
    } else if (action == 'remove') {
        let rewards = Object.values(items).filter(item => item.row.classList.contains('selected'));
        removeLinks(gui.getMessage('rewardlinks_removeselected'), rewards);
    } else if (action == 'removeold') {
        let title = gui.getMessage('rewardlinks_removelinks');
        let days = parseInt(gui.getPreference('rewardsRemoveDays'));
        days = Math.max(0, Math.min(bgp.Data.REWARDLINKS_REMOVE_DAYS - 1, isFinite(days) ? days : bgp.Data.REWARDLINKS_VALIDITY_DAYS));
        let htm = '';
        htm += Html.br`<select name="days">`;
        for (let i = 0; i <= bgp.Data.REWARDLINKS_REMOVE_DAYS - 1; i++) {
            htm += Html.br`<option value="${i}" ${i == days ? ' selected' : ''}>${Locale.formatNumber(i)}</option>`;
        }
        htm += Html.br`</select>`;
        htm = String(Html.br`${gui.getMessage('rewardlinks_removelinksdays', bgp.Data.REWARDLINKS_REMOVE_DAYS)}`).replace('@DAYS@', htm);
        gui.dialog.show({
            title: title,
            html: htm,
            style: [Dialog.CONFIRM, Dialog.CANCEL]
        }, function (method, params) {
            if (method != Dialog.CONFIRM) return;
            let days = parseInt(params.days);
            if (days >= 0) {
                gui.setPreference('rewardsRemoveDays', days);
                let now = gui.getUnixTime();
                let expiryThreshold = now - bgp.Data.REWARDLINKS_VALIDITY_DAYS * SECONDS_IN_A_DAY;
                let checkThreshold = now - days * SECONDS_IN_A_DAY;
                let rewards = Object.values(items);
                rewards = rewards.filter(reward => Math.max(reward.adt, reward.cdt || 0) <= checkThreshold && (reward.adt <= expiryThreshold || (reward.cmt || 0) != 0));
                removeLinks(title, rewards);
            }
        });
    }
}

function removeLinks(title, rewards) {
    if (rewards.length == 0) {
        gui.dialog.show({
            title: title,
            text: gui.getMessage('rewardlinks_removenone'),
            style: [Dialog.OK, Dialog.CRITICAL]
        });
    } else {
        gui.dialog.show({
            title: title,
            text: gui.getMessage('rewardlinks_removeconfirm', [rewards.length]),
            style: [Dialog.CONFIRM, Dialog.CANCEL]
        }, function (method) {
            if (method != Dialog.CONFIRM) return;
            // Sends only the id
            rewards = rewards.map(reward => {
                return {
                    id: reward.id
                };
            });
            bgp.Data.removeRewardLink(rewards);
            update();
        });
    }
}

function onClickTable(event) {
    let target = event.target;
    if (!target) return true;

    if (target.tagName == 'INPUT') {
        const flag = target.checked;
        let rows = [target.parentNode.parentNode];
        if (event.ctrlKey || event.altKey) {
            rows = Array.from(smartTable.table.querySelectorAll('tr[data-id]'));
            if (event.altKey) {
                const html = target.parentNode.parentNode.cells[5].innerHTML;
                rows = rows.filter(row => row.cells[5].innerHTML == html);
            }
        }
        for (const row of rows) {
            row.classList.toggle('selected', flag);
            row.querySelector('input').checked = flag;
        }
        return;
    }
    if (!target.classList.contains('reward')) return true;

    let reasons = [];

    function pushReason(title, text, action) {
        reasons.push({
            title: title,
            text: text,
            action: action
        });
    }

    function showNextReason() {
        let reason = reasons.shift();
        if (!reason) {
            target.setAttribute('clickanyway', '1');
            target.click();
            return;
        }
        let htm = Html.br(reason.text + '\n\n' + gui.getMessage('rewardlinks_collectanyway'));
        if (reason.action) {
            htm += Html.br`<br><table style="margin-top:16px"><tr><td><button value="reset">${gui.getMessage('rewardlinks_reset')}</button></td><td>`;
            htm += Html.br`${gui.getMessage('rewardlinks_' + reason.action)}`;
            htm += Html.br`</td></tr></table>`;
        }
        gui.dialog.show({
            title: reason.title,
            html: htm,
            defaultButton: Dialog.CANCEL,
            style: [Dialog.CRITICAL, Dialog.CONFIRM, Dialog.CANCEL, 'RESET']
        }, function (method, _params) {
            if (method == 'reset') {
                let rewardLinksData = bgp.Data.rewardLinksData;
                if (reason.action == 'resetcount') rewardLinksData.count = rewardLinksData.next = 0;
                if (reason.action == 'resetexpired') rewardLinksData.expired = 0;
                bgp.Data.saveRewardLink(rewardLinksData);
                update();
            }
            if (method == Dialog.CONFIRM) showNextReason();
        });
    }

    let row = target.parentNode.parentNode;
    let rewardId = row.getAttribute('data-id');
    let reward = items[rewardId];
    if (!reward) return;
    let now = gui.getUnixTime();
    let countClicked;
    if (target.getAttribute('clickanyway') == '1') {
        target.removeAttribute('clickanyway');
    } else {
        if (reward.cmt == -2 || reward.cmt > 0) {
            pushReason(gui.getMessage('rewardlinks_collected'), gui.getMessage('rewardlinks_infocollected'));
        } else if (reward.cmt == -3) {
            pushReason(gui.getMessage('rewardlinks_maxreached'), gui.getMessage('rewardlinks_infomaxreached', bgp.Data.REWARDLINKS_DAILY_LIMIT));
        } else if (reward.cmt == -1) {
            pushReason(gui.getMessage('rewardlinks_expired'), gui.getMessage('rewardlinks_infoexpired', bgp.Data.REWARDLINKS_VALIDITY_DAYS));
        } else if (reward.cmt == -4) {
            pushReason(gui.getMessage('rewardlinks_noself'), gui.getMessage('rewardlinks_infonoself'));
        } else if (reward.cmt == -5) {
            pushReason(gui.getMessage('rewardlinks_broken'), gui.getMessage('rewardlinks_infobroken'));
        }
        if (bgp.Data.rewardLinksData.next > now) {
            pushReason(gui.getMessage('rewardlinks_maxreached'), gui.getMessage('rewardlinks_allcollected') + '\n' + gui.getMessage('rewardlinks_nexttime', Locale.formatDateTime(bgp.Data.rewardLinksData.next)), 'resetcount');
        }
        if (+reward.id <= bgp.Data.rewardLinksData.expired) {
            pushReason(gui.getMessage('rewardlinks_probablyexpired'), gui.getMessage('rewardlinks_infoprobablyexpired'), 'resetexpired');
        }
        if ((countClicked = Object.keys(clicked).length) > 0 && countClicked + bgp.Data.rewardLinksData.count >= bgp.Data.REWARDLINKS_DAILY_LIMIT) {
            pushReason(gui.getMessage('rewardlinks_maxreached'), gui.getMessage('rewardlinks_infomayexceedlimit'));
        }
        if (reasons.length) {
            event.preventDefault();
            showNextReason();
            return false;
        }
    }
    reward.status = 1;
    delete reward.time;
    reward.row.setAttribute('data-status', reward.status);
    clicked[reward.id] = now;
    return true;
}

function materialHTML(materialId) {
    if (!(materialId in materialImageCache)) {
        if (materialId > 0) {
            let url = gui.getObjectImage('material', materialId, true);
            return materialImageCache[materialId] = Html.br`<img src="${url}" width="32" height="32" class="outlined">${gui.getObjectName('material', materialId)}`;
        }
        let text;
        if (materialId == -1) text = gui.getMessage('rewardlinks_expired');
        else if (materialId == -2) text = gui.getMessage('rewardlinks_collected');
        else if (materialId == -3) text = gui.getMessage('rewardlinks_maxreached');
        else if (materialId == -4) text = gui.getMessage('rewardlinks_noself');
        else if (materialId == -5) text = gui.getMessage('rewardlinks_broken');
        else if (materialId == -6) text = gui.getMessage('rewardlinks_probablyexpired');
        else return materialImageCache[materialId] = '';
        return materialImageCache[materialId] = Html.br`<img src="/img/gui/q-hard.png"/><span class="alert">${text}</span>`;
    }
    return materialImageCache[materialId];
}

function update() {
    gui.updateTabState(tab);

    let tbody = smartTable.tbody[0];
    let now = gui.getUnixTime();
    let state = getState();
    let conversion = state.convert == 'facebook' ? 1 : (state.convert == 'portal' ? 2 : 0);
    let numInserted = 0;
    let numUpdated = 0;
    let rewardLinksRecent = bgp.Data.rewardLinksRecent;

    numTotal = numToCollect = 0;

    if (!items) items = {};
    let oldItems = items;
    items = {};
    let expiredId = bgp.Data.rewardLinksData.expired || 0;
    for (let rewardLink of Object.values(bgp.Data.getRewardLinks())) {
        if (!rewardLink.cmt && rewardLink.id <= expiredId) rewardLink.cmt = -6;
        if (rewardLink.id in rewardLinksRecent) {
            delete clicked[rewardLink.id];
            delete rewardLinksRecent[rewardLink.id];
        }
        let item = oldItems[rewardLink.id];
        let status = 0;
        if (item) {
            let flagUpdated = false;
            delete oldItems[item.id];
            if (item.conversion != conversion) {
                item.conversion = conversion;
                item.row.cells[1].firstChild.href = LinkData.getLink(rewardLink, conversion);
            }
            if (item.cdt != rewardLink.cdt) {
                flagUpdated = true;
                item.cdt = rewardLink.cdt;
                item.row.cells[3].innerText = item.cdt ? Locale.formatDateTime(item.cdt) : '';
            }
            if (item.cmt != rewardLink.cmt) {
                flagUpdated = true;
                item.cmt = rewardLink.cmt;
                item.row.cells[4].innerHTML = materialHTML(item.cmt);
                item.mtx = item.row.cells[4].textContent;
                if (item.cmt && item.cmt != -6) item.row.classList.add('collected');
            }
            if (item.cid != rewardLink.cid || item.cnm != (rewardLink.cnm || '')) {
                flagUpdated = true;
                item.cid = rewardLink.cid;
                item.cnm = rewardLink.cnm;
                item.row.cells[5].innerHTML = item.cid ? Html.br`<img src="${gui.getFBFriendAvatarUrl(item.cid)}"/>${item.cnm}` : '';
            }
            if (flagUpdated) status = 3;
        } else {
            item = Object.assign({}, rewardLink);
            item.cnm = item.cnm || '';
            item.conversion = conversion;
            item.row = document.createElement('tr');
            item.row.setAttribute('data-id', item.id);
            let htm = '';
            htm += Html.br`<td><input type="checkbox"></td><td><a class="reward" target="_blank" href="${LinkData.getLink(rewardLink, conversion)}">${item.id}</a></td><td>${Locale.formatDateTime(item.adt)}</td>`;
            htm += Html.br`<td>${item.cdt ? Locale.formatDateTime(item.cdt) : ''}</td>`;
            htm += Html.br`<td>${materialHTML(item.cmt)}</td>`;
            htm += Html.br`<td translate="no">`;
            if (item.cid) htm += Html.br`<img lazy-src="${gui.getFBFriendAvatarUrl(item.cid)}"/>${item.cnm}`;
            htm += `</td>`;
            item.row.innerHTML = htm;
            if (item.cmt && item.cmt != -6) item.row.classList.add('collected');
            item.mtx = item.row.cells[4].textContent;
            if (!firstTime) status = 2;
        }
        if (status && status != item.status) {
            item.status = status;
            item.time = now;
            item.row.setAttribute('data-status', item.status);
        }
        if (item.status == 2) numInserted++;
        if (item.status == 3) numUpdated++;
        items[item.id] = item;
        numTotal++;
        if (!item.cmt && !item.cdt) numToCollect++;
    }
    for (let item of Object.values(oldItems)) item.row.parentNode.removeChild(item.row);

    let getSortValueFunctions = {
        'owner': a => a.cnm || '',
        'insert': a => a.adt,
        'collect': a => a.cdt || 0,
        'reward': a => a.mtx || '',
        'select': a => +a.row.classList.contains('selected'),
        'id': a => a.id
    };
    let sort = gui.getSortFunction(getSortValueFunctions, smartTable, 'id');
    let values = sort(Object.values(items));
    for (let item of values) {
        tbody.appendChild(item.row);
    }

    showStats();
    gui.collectLazyElements(smartTable.container);
    smartTable.syncLater();
    firstTime = false;

    var text = [];
    if (numInserted) text.push(gui.getMessage('rewardlinks_linksadded', numInserted));
    if (numUpdated) text.push(gui.getMessage('rewardlinks_linksupdated', numUpdated));
    if (text.length) {
        if (!clearStatusHandler) clearStatusHandler = setInterval(clearStatus, 1000);
        gui.toast.show({
            text: text.join('\n')
        });
    }
}

function clearStatus() {
    let count = 0;
    let threshold = gui.getUnixTime() - 10;
    for (let item of Object.values(items)) {
        if (item.time) {
            if (item.time <= threshold) {
                delete item.status;
                delete item.time;
                item.row.removeAttribute('data-status');
            } else {
                count++;
            }
        }
    }
    if (!count) {
        clearInterval(clearStatusHandler);
        clearStatusHandler = 0;
    }
}

function showStats() {
    let now = gui.getUnixTime();
    let next = bgp.Data.rewardLinksData.next;
    let flagNext = next > now;
    let textNext, text;
    if (flagNext) {
        text = gui.getMessage('rewardlinks_allcollected') + ' ';
    } else {
        text = gui.getMessage('rewardlinks_countremaining', bgp.Data.REWARDLINKS_DAILY_LIMIT - bgp.Data.rewardLinksData.count);
        next = bgp.Data.rewardLinksData.first;
        if (next) next += bgp.Data.REWARDLINKS_REFRESH_HOURS * 3600;
    }
    textNext = next > now ? gui.getMessage('rewardlinks_nexttime', Locale.formatDateTime(next)) : '';
    let element = container.querySelector('.stats');
    element.textContent = text + (flagNext ? textNext : '');
    element.classList.toggle('wait', flagNext);
    container.querySelector('.info').innerHTML = Html.br(flagNext ? '' : textNext);

    text = gui.getMessage('rewardlinks_stats', Locale.formatNumber(numToCollect), Locale.formatNumber(numTotal));
    Array.from(smartTable.container.querySelectorAll('tfoot td')).forEach(cell => {
        cell.innerText = text;
    });
}