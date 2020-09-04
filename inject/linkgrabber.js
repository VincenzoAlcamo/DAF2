/*global chrome Dialog*/

const options = {
    linkGrabEnabled: true,
    linkGrabButton: 2,
    linkGrabKey: 0,
    linkGrabSort: 1,
    linkGrabConvert: 0,
    language: 'en'
};

const LEFT_BUTTON = 0;
const KEY_ESC = 27;
const KEY_C = 67;
const KEY_F = 70;
const KEY_I = 73;
const KEY_P = 80;
const KEY_R = 82;
const KEY_S = 83;
const KEY_T = 84;
const KEY_Y = 89;
const OS_WIN = 1;
const OS_LINUX = 0;

const os = ((navigator.appVersion.indexOf('Win') == -1) ? OS_LINUX : OS_WIN);

let box = null;
let flagBox = false;
let flagActive = false;
let stopMenu = false;
let keyPressed = 0;
let mouseButton = -1;
let countLabel = null;
let scrollHandle = 0;
let links = [];
let linkCount, oldLabel, mouseX, mouseY, startX, startY, autoOpenElement, autoOpenCount, flagLinks;

function getMessage(id, ...args) {
    let text = chrome.i18n.getMessage(options.language + '@' + id, args);
    if (text == '' && options.language != 'en') text = chrome.i18n.getMessage('en@' + id, args);
    return text;
}

function addListeners(obj, ...args) {
    args.forEach(fn => obj.addEventListener(fn.name, fn, true));
}

function addPassiveListeners(obj, ...args) {
    args.forEach(fn => obj.addEventListener(fn.name, fn, { passive: true, capture: true }));
}

function removeListeners(obj, ...args) {
    args.forEach(fn => obj.removeEventListener(fn.name, fn, true));
}

// eslint-disable-next-line no-unused-vars
function initialize() {
    Dialog.language = options.language;
    const link = document.createElement('link');
    link.type = 'text/css';
    link.rel = 'stylesheet';
    link.href = chrome.extension.getURL('inject/linkgrabber.css');
    document.head.appendChild(link);
    addListeners(window, mousedown, keydown, keyup, blur, contextmenu);
    // track preference changes
    chrome.storage.onChanged.addListener(function (changes, area) {
        if (area != 'local') return;
        for (const name in changes) {
            options[name] = changes[name].newValue;
            if (name == 'language') Dialog.language = options.language;
        }
    });
}

function allowSelection() {
    return options.linkGrabEnabled && mouseButton == options.linkGrabButton && keyPressed == options.linkGrabKey;
}

function setPosition(el, x, y, width, height) {
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    if (width !== undefined) {
        el.style.width = width + 'px';
        el.style.height = height + 'px';
    }
}

function mousedown(event) {
    const key = keyPressed;
    // stop will reset keyPressed
    stop();
    keyPressed = key;

    mouseButton = event.button;

    // turn on menu for windows
    if (os === OS_WIN) stopMenu = false;

    if (!allowSelection()) return;

    flagActive = true;

    // don't prevent for windows right click as it breaks spell checker
    // do prevent for left as otherwise the page becomes highlighted
    if (os == OS_LINUX || (os == OS_WIN && mouseButton == LEFT_BUTTON)) preventEscalation(event);

    // create the box
    if (box == null) {
        box = document.body.appendChild(document.createElement('span'));
        box.className = 'DAF-selector';
        box.style.visibility = 'hidden';
        countLabel = document.body.appendChild(document.createElement('span'));
        countLabel.className = 'DAF-counter';
        countLabel.style.visibility = 'hidden';
    }

    // update position
    startX = event.pageX, startY = event.pageY;
    mouseX = event.clientX, mouseY = event.clientY;
    updateBox();

    // setup mouse move and mouse up
    addListeners(window, mousemove, mouseup, mouseout);
    addPassiveListeners(window, mousewheel);
}


function mousemove(event) {
    preventEscalation(event);
    if (flagBox || allowSelection()) {
        mouseX = event.clientX, mouseY = event.clientY;

        // let el = document.elementsFromPoint(mouseX, mouseY).find(el => el !== box && el !== countLabel);
        // if (el && el.getAttribute('role') == 'button' && el.firstElementChild == null && el.innerText.indexOf('...') >= 0) {
        //     // More... button in new layout
        // } else if (!el || !el.className.match(/\b(UFIPagerLink|fss|see_more_link_inner|UFIReplySocialSentenceLinkText)\b/)) el = null;
        const el = document.elementsFromPoint(mouseX, mouseY).find(el => {
            if (el === box || el === countLabel) return false;
            if (el.getAttribute('role') == 'button' && el.firstElementChild == null) {
                if (el.innerText.indexOf('...') >= 0) return true;
                let prev = el.previousSibling;
                let max = 3;
                while (prev && prev.nodeType == Node.TEXT_NODE && max-- > 0) {
                    if (prev.textContent.indexOf('\u2026') >= 0) return true;
                    prev = prev.previousSibling;
                }
            }
            return String(el.className).match(/\b(UFIPagerLink|fss|see_more_link_inner|UFIReplySocialSentenceLinkText)\b/);
        });
        if (autoOpenElement !== el) {
            if (autoOpenElement && autoOpenCount <= 0) {
                flagLinks = true;
                linkCount = 0;
            }
            autoOpenCount = 5;
        }
        autoOpenElement = el;

        updateBox();
        detect();
    }
}

function updateBox() {
    let x = mouseX + window.scrollX;
    let y = mouseY + window.scrollY;
    const width = Math.max(document.documentElement['clientWidth'], document.body['scrollWidth'], document.documentElement['scrollWidth'], document.body['offsetWidth'], document.documentElement['offsetWidth']);
    const height = Math.max(document.documentElement['clientHeight'], document.body['scrollHeight'], document.documentElement['scrollHeight'], document.body['offsetHeight'], document.documentElement['offsetHeight']);
    x = Math.min(x, width - 7);
    y = Math.min(y, height - 7);

    box.x1 = Math.min(startX, x);
    box.x2 = Math.max(startX, x);
    box.y1 = Math.min(startY, y);
    box.y2 = Math.max(startY, y);
    setPosition(box, box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);

    let cx = x;
    if (y <= startY) cx -= Math.floor(countLabel.offsetWidth / 2);
    else if (x <= startX) cx -= countLabel.offsetWidth;
    setPosition(countLabel, cx, y - countLabel.offsetHeight);
}

function mousewheel(event) {
    if (flagBox || allowSelection()) {
        mouseX = event.clientX, mouseY = event.clientY;
        updateBox();
        detect();
    }
}

function mouseout(event) {
    mousemove(event);
}

function preventEscalation(event) {
    event.stopPropagation();
    event.preventDefault();
}

function mouseup(event) {
    preventEscalation(event);
    if (!flagBox) stop();
}

function start() {
    flagLinks = false;

    // stop user from selecting text/elements
    document.body.style.userSelect = 'none';
    // turn on the box
    box.style.visibility = countLabel.style.visibility = 'visible';
    flagBox = true;

    const oldBoxes = {};
    Array.from(document.querySelectorAll('.DAF-box')).forEach(div => oldBoxes[div.textContent] = div);

    links = document.links;
    linkCount = links.length;
    const offsetLeft = window.scrollX;
    const offsetTop = window.scrollY;
    links = Array.from(links).filter(a => {
        if (a.href.indexOf('diggysadventure') < 0) return false;

        const rect = a.getBoundingClientRect();
        if (rect.height > 0) {
            const left = offsetLeft + rect.left;
            const top = offsetTop + rect.top;
            const daf = {
                x1: Math.floor(left),
                y1: Math.floor(top),
                x2: Math.floor(left + rect.width),
                y2: Math.floor(top + rect.height),
                box: a.daf && a.daf.box
            };
            a.daf = daf;
            if (daf.box) {
                delete oldBoxes[daf.box.textContent];
                setPosition(daf.box, daf.x1, daf.y1 - 1, daf.x2 - daf.x1 + 2, daf.y2 - daf.y1 + 2);
            }
            return true;
        }

        return false;
    });

    Object.values(oldBoxes).forEach(div => div.remove());

    // turn off menu for windows so mouse up doesn't trigger context menu
    if (os == OS_WIN) stopMenu = true;
}

function stop() {
    if (flagActive) removeListeners(window, mousemove, mouseup, mousewheel, mouseout);
    flagActive = false;

    if (scrollHandle) clearInterval(scrollHandle);
    scrollHandle = 0;

    document.body.style.userSelect = '';
    if (flagBox) box.style.visibility = countLabel.style.visibility = 'hidden';
    flagBox = false;

    // remove the link boxes
    Array.from(document.links).filter(a => a && a.daf).forEach(a => delete a.daf);
    Array.from(document.querySelectorAll('.DAF-box')).forEach(div => div.remove());
    links = [];

    flagLinks = false;
    mouseButton = -1;
    keyPressed = 0;
}

function scroll() {
    const y = mouseY;
    const win_height = window.innerHeight;

    function scrollPage(speed, direction) {
        const value = (speed < 2 ? 60 : (speed < 10 ? 30 : 10)) * direction;
        window.scrollBy(0, value);
        updateBox();
        detect();
    }
    if (y > win_height - 20) scrollPage(win_height - y, 1);
    else if (window.scrollY > 0 && y < 20) scrollPage(y, -1);
    else if (autoOpenElement && (autoOpenCount--) == 0) {
        try {
            autoOpenElement.click();
            flagLinks = true;
        } catch (e) { }
    }
}

function detect() {
    if (!flagBox) {
        if (box.x2 - box.x1 < 5 && box.y2 - box.y1 < 5) return;
        flagLinks = true;
    }
    if (flagLinks || linkCount != document.links.length) start();

    if (!scrollHandle) scrollHandle = setInterval(scroll, 100);

    let count = 0;
    let total = 0;
    const hash = {};
    for (const a of links) {
        const daf = a.daf;
        let selected = false;
        if (daf.y1 <= box.y2 && daf.y2 >= box.y1 && daf.x1 <= box.x2 && daf.x2 >= box.x1) {
            if (!('data' in daf)) {
                let href = a.href;
                if (href.endsWith('/diggysadventure/?hc_location=ufi')) href = a.textContent;
                const result = LinkData.getLinkData(href);
                daf.data = result.length ? result[0] : null;
            }
            if (daf.data) {
                selected = true;
                if (daf.box == null) {
                    daf.box = document.body.appendChild(document.createElement('span'));
                    daf.box.textContent = daf.data.id;
                    daf.box.className = 'DAF-box';
                    setPosition(daf.box, daf.x1, daf.y1 - 1, daf.x2 - daf.x1 + 2, daf.y2 - daf.y1 + 2);
                }
                total++;
                if (!(daf.data.id in hash)) {
                    hash[daf.data.id] = true;
                    count++;
                }
            }
        }
        if (daf.selected !== selected) {
            daf.selected = selected;
            if (daf.box) daf.box.style.visibility = daf.selected ? 'visible' : 'hidden';
        }
    }

    function addFn(key, messageId) {
        return '\n' + key + ' = ' + getMessage(messageId);
    }

    let text = getMessage('linkgrabber_selected', count, total);
    if (count > 0) {
        text += addFn('C/F/P', 'linkgrabber_fn_copy');
        text += addFn('S', 'linkgrabber_fn_send');
    }
    text += addFn('I', 'linkgrabber_fn_showid');
    text += addFn('R', 'linkgrabber_fn_refresh');
    if (count == 0) {
        text += `\n\n${getMessage('friendship_collectfriends')}:`;
        text += `\nT = ${getMessage('friendship_collectstandard')}`;
        text += `\nY = ${getMessage('friendship_collectstandard')} + ${getMessage('dialog_confirm')}`;
    }
    text += '\n' + addFn('ESC', 'linkgrabber_fn_cancel');
    if (text != oldLabel) countLabel.innerText = oldLabel = text;
}

const fnHandlers = {
    [KEY_ESC]: (_event) => stop(),
    [KEY_R]: (_event) => start() + detect(),
    [KEY_I]: (_event) => document.body.classList.toggle('DAF-show-id'),
    [KEY_C]: (_event) => copyLinksToClipboard(),
    [KEY_F]: (_event) => copyLinksToClipboard(3),
    [KEY_P]: (_event) => copyLinksToClipboard(2),
    [KEY_T]: (_event) => { stop(); collect(false, 4); },
    [KEY_Y]: (_event) => { stop(); collect(true, 4); },
    [KEY_S]: (event) => {
        const values = collectData(true);
        if (!event.shiftKey) stop();
        if (values.length) {
            chrome.runtime.sendMessage({
                action: 'addRewardLinks',
                values: values
            }, (count) => {
                if (!chrome.runtime.lastError) {
                    Dialog(Dialog.TOAST).show({
                        text: getMessage(count ? 'linkgrabber_added' : 'rewardlinks_nolinksadded', count, values.length)
                    });
                }
            });
        }
    }
};

function keydown(event) {
    if (keyPressed == event.keyCode) return;
    keyPressed = event.keyCode;
    if (os == OS_LINUX && keyPressed == options.linkGrabKey) stopMenu = true;
    if (!flagActive) return;
    if (keyPressed in fnHandlers) {
        event.keyCode = 0;
        preventEscalation(event);
        fnHandlers[keyPressed](event);
    }
}

function blur(_event) {
    remove_key();
}

function keyup(_event) {
    remove_key();
}

function remove_key() {
    // turn menu on for linux
    if (os == OS_LINUX) stopMenu = false;
    keyPressed = 0;
}

function contextmenu(event) {
    if (stopMenu) event.preventDefault();
    stopMenu = false;
}

//#region LINK HELPER FUNCTIONS
const LinkData = (function () {
    const reLink1 = /https?:\/\/l\.facebook\.com\/l.php\?u=([^&\s]+)(&|\s|$)/g;
    const reLink2 = /https?:\/\/diggysadventure\.com\/miner\/wallpost_link.php\S*[?&]url=([^&\s]+)(&|\s|$)/g;
    const reFacebook = /https?:\/\/apps\.facebook\.com\/diggysadventure\/wallpost\.php\?wp_id=(\d+)&fb_type=(standard|portal)&wp_sig=([0-9a-z]+)/g;
    const rePortal = /https?:\/\/portal\.pixelfederation\.com\/(([^/]+\/)?gift|wallpost)\/diggysadventure\?params=(([0-9a-zA-Z\-_]|%2B|%2F)+(%3D){0,2})/g;

    function getLinkData(href) {
        const result = [];
        const hash = {};
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
        const urls = [href];
        href.replace(reLink1, (a, b) => {
            const url = decodeURIComponent(b);
            urls.push(url);
            url.replace(reLink2, (a, b) => urls.push(decodeURIComponent(b)));
        });
        href.replace(reLink2, (a, b) => urls.push(decodeURIComponent(b)));
        href = urls.join(' ');
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
                    const params = decodeURIComponent(match[3]).replace(/-/g, '+').replace(/_/g, '/');
                    const payload = atob(params);
                    const json = JSON.parse(payload);
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
            const json = JSON.stringify({
                action: 'wallpost',
                wp_id: data.id,
                fb_type: data.typ,
                wp_sig: data.sig
            });
            return 'https://portal.pixelfederation.com/wallpost/diggysadventure?params=' + encodeURIComponent(btoa(json));
        }
        const url = 'https://apps.facebook.com/diggysadventure/wallpost.php?wp_id=' + encodeURIComponent(data.id) + '&fb_type=' + encodeURIComponent(data.typ) + '&wp_sig=' + encodeURIComponent(data.sig);
        return convert == 3 ? 'https://diggysadventure.com/miner/wallpost_link.php?url=' + encodeURIComponent(url) : url;
    }

    return {
        getLinkData: getLinkData,
        getLink: getLink
    };
})();
//#endregion

function collectData(flagGetUserData) {
    const values = [];
    const reCid = /hovercard(\/user)?\.php\?id=(\d+)/;
    let cid, cnm;

    function getActor(actors) {
        cid = cnm = undefined;
        let invalid = false;
        for (const actor of actors) {
            const hovercard = actor.getAttribute('data-hovercard');
            if (!hovercard) continue;
            const match = hovercard.match(reCid);
            if (!match) continue;
            cid = match[2];
            for (let node = actor.firstChild; node; node = node.nextSibling) {
                const text = node.nodeType == Node.TEXT_NODE ? node.textContent.trim() : '';
                if (text != '') {
                    if (text.indexOf('://') >= 0) invalid = true;
                    else {
                        cnm = text;
                        invalid = false;
                        break;
                    }
                }
            }
            if (invalid) {
                cid = undefined;
                actor.classList.add('DAF-invalid');
            }
            if (cnm) break;
        }
    }
    const hash = {};
    for (const a of links) {
        let data = a.daf && a.daf.selected && a.daf.data;
        if (!data) continue;
        const existing = hash[data.id];
        if (existing && (!flagGetUserData || existing.cid)) continue;
        data = existing || data;
        hash[data.id] = data;
        if (!existing) values.push(data);
        if (flagGetUserData) {
            let parent = a.parentNode;
            for (let depth = 12; parent && depth > 0; depth--) {
                getActor(parent.querySelectorAll('[data-hovercard]:not(.DAF-invalid)'));
                if (cid && (!data.cid || data.cid == cid)) {
                    data.cid = cid;
                    if (cnm) data.cnm = cnm;
                }
                if (data.cnm) break;
                parent = parent.parentNode;
            }
        }
    }
    return values;
}

function collectLinks(convert) {
    let values = collectData();
    if (convert === undefined) convert = options.linkGrabConvert;
    if (convert != 1 && convert != 2 && convert != 3) convert = 0;
    if (options.linkGrabSort) values.sort((a, b) => a.id - b.id);
    if (options.linkGrabSort == 2) values.reverse();
    values = values.map(data => LinkData.getLink(data, convert));
    return values;
}

function copyLinksToClipboard(convert) {
    const values = collectLinks(convert);
    stop();
    if (values.length) {
        const text = values.join('\n') + '\n';
        copyToClipboard(text);
        Dialog(Dialog.TOAST).show({
            text: getMessage('linkgrabber_copied', values.length)
        });
    }
}

function copyToClipboard(str, mimeType = 'text/plain') {
    function oncopy(event) {
        event.clipboardData.setData(mimeType, str);
        event.preventDefault();
    }
    document.addEventListener('copy', oncopy);
    document.execCommand('copy', false, null);
    document.removeEventListener('copy', oncopy);
}

function collect(confirmCollection, speedupCollection) {
    const autoClose = false;
    const collectMethod = 'standard';
    const unmatched = '';
    const wait = Dialog(Dialog.WAIT);
    const dialog = Dialog();
    let retries = 10;
    const friends = [];
    let ulInactiveParent = null;
    let ulInactive = null;
    const liInactive = [];
    let isNew = false;
    let container, unmatchedList, started, countPhotos;

    function addFriend(friend) {
        friends.push(friend);
    }

    function scrollWindow() {
        try {
            document.body.scrollIntoView(true);
            const el = document.getElementById('pagelet_dock');
            if (el) el.scrollIntoView();
            container.scrollIntoView(false);
        } catch (e) { }
    }

    function interceptData() {
        const code = `
        (function() {
            const XHR = XMLHttpRequest.prototype;
            const send = XHR.send;
            const open = XHR.open;
            XHR.open = function(method, url) {
                this.url = url;
                return open.apply(this, arguments);
            }
            XHR.send = function(e) {
                if(e && this.url.indexOf('/graphql/') >= 0 && e.indexOf('variables') >= 0 && e.indexOf('count%22%3A8') >= 0) {
                    e = e.replace('count%22%3A8', 'count%22%3A${speedupCollection * 8}');
                    return send.call(this, e);
                }
                return send.apply(this, arguments);
            };
        })();
        `;
        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.appendChild(document.createTextNode(code));
        document.head.prepend(script);
        document.addEventListener('daf_xhr', function (event) {
            chrome.runtime.sendMessage({ action: 'daf_xhr', detail: event.detail });
        });
    }

    function getCountPhotos() {
        return document.querySelectorAll('a[href$="photos"]').length;
    }

    wait.show();
    const handler = setInterval(function () {
        container = document.getElementById('pagelet_timeline_medley_friends');
        isNew = false;
        if (!container) {
            const img = document.querySelector('a > img[width="80"]');
            if (img) {
                container = img.parentElement.parentElement.parentElement.parentElement;
                isNew = true;
            }
        }
        if (container) {
            if (isNew && speedupCollection > 1) interceptData();
            clearInterval(handler);
            wait.hide();
            started = Date.now();
            countPhotos = getCountPhotos();
            if (collectMethod == 'standard' || collectMethod == 'unmatched') collectStandard();
            return;
        } else if (retries > 0) {
            retries--;
            wait.setText(retries);
            scrollWindow();
        } else {
            clearInterval(handler);
            wait.hide();
            dialog.show({
                text: getMessage('friendship_collecterror'),
                style: [Dialog.OK, Dialog.CRITICAL]
            });
        }
    }, 1000);

    function formatTime(milliseconds) {
        let val = Math.round(milliseconds / 1000);
        const ss = val % 60;
        val = (val - ss) / 60;
        const mm = val % 60;
        val = (val - mm) / 60;
        const hh = val;
        const n2 = v => v < 10 ? '0' + v : v;
        return `${n2(hh)}:${n2(mm)}:${n2(ss)}`;
    }

    function getStatInfo(num, total, addTime) {
        const count = num == total ? total : (num + ' / ' + total);
        return getMessage('friendship_collectstat', count) + (addTime ? '\n(' + formatTime(Date.now() - started) + ')' : '');
    }

    function sendFriends() {
        const viewDisabled = () => { try { ulInactive.firstElementChild.scrollIntoView({ block: 'center' }); } catch (e) { } };
        wait.setText(document.title = getStatInfo(friends.length, friends.length, true));
        const close = autoClose && !ulInactive;
        chrome.runtime.sendMessage({
            action: 'friendsCaptured',
            data: collectMethod == 'unmatched' ? null : friends,
            close
        });
        Array.from(container.querySelectorAll('.to-be-removed')).forEach(el => el.remove());
        const showDisabled = () => {
            if (ulInactive) {
                if (ulInactive !== container) {
                    while (ulInactive.firstChild) ulInactive.firstChild.remove();
                    ulInactiveParent.appendChild(ulInactive);
                }
                liInactive.forEach(li => ulInactive.appendChild(li));
                viewDisabled();
                wait.hide();
                dialog.show({
                    text: getMessage(collectMethod == 'unmatched' ? 'friendship_unmatchedaccountsdetected' :
                        'friendship_disabledaccountsdetected') + '\n' + getMessage('friendship_unfriendinfo'),
                    style: [Dialog.OK]
                }, viewDisabled);
            }
        };
        if (autoClose) return showDisabled();
        wait.hide();
        let text = getStatInfo(friends.length, friends.length);
        text += '\n\n' + getMessage('friendship_manualhelp', getMessage('tab_friendship'), getMessage('friendship_collect'), getMessage('friendship_collectmatch'));
        dialog.show({ text, style: [Dialog.OK] }, showDisabled);
    }

    function getId(d) {
        let i = d.indexOf('?id=');
        if (i < 0) return null;
        d = d.substr(i + 4);
        i = d.indexOf('&');
        return i > 0 ? d.substr(0, i) : d;
    }

    function getFriendUri(uri) {
        let i;
        if ((i = uri.indexOf('profile.php?id=')) >= 0) {
            if ((i = uri.indexOf('&', i)) >= 0) uri = uri.substr(0, i);
        } else if ((i = uri.indexOf('?')) >= 0) uri = uri.substr(0, i);
        return uri;
    }

    function getFriendIdFromUri(uri) {
        return uri.substring(uri.lastIndexOf('/'));
    }

    function captureOneBlockOld() {
        let count = 0;
        const ul = container && container.getElementsByClassName('uiList')[0];
        if (!ul) return -1;
        for (const li of Array.from(ul.getElementsByTagName('li'))) {
            for (const item of Array.from(li.getElementsByTagName('a'))) {
                const name = item.textContent;
                if (name == '') continue;
                let id, d, uri;
                let add = false, keep = false, disabled = false;
                if ((d = item.getAttribute('data-hovercard')) && d.indexOf('user.php?id=') >= 0 && (id = getId(d))) {
                    uri = getFriendUri(item.href);
                    add = true;
                    keep = unmatchedList.includes(id);
                } else if ((d = item.getAttribute('ajaxify')) && d.indexOf('/inactive/') >= 0 && (id = getId(d))) {
                    add = keep = disabled = true;
                }
                if (add) {
                    count++;
                    const data = { id, name, uri };
                    const img = li.querySelector('a img');
                    if (img) data.img = img.src;
                    if (disabled) data.disabled = true;
                    addFriend(data);
                }
                if (keep) {
                    if (!ulInactive) {
                        ulInactiveParent = ul.parentNode;
                        ulInactive = ul;
                    }
                    liInactive.push(li);
                }
            }
        }
        ul.parentNode.removeChild(ul);
        return count;
    }

    function captureOneBlockNew() {
        let count = 0;
        const items = Array.from(container.querySelectorAll('a > img[width="80"]:not(.collected)'));
        if (items.length == 0) return -1;
        // Detect if a disabled account exists
        if (!ulInactive && container.querySelector('div > img[width="80"]')) ulInactive = container;
        for (const item of items) {
            item.classList.add('collected');
            let keep = false;
            const uri = getFriendUri(item.parentElement.href);
            const name = item.parentElement.parentElement.nextElementSibling.firstElementChild.textContent;
            const id = getFriendIdFromUri(uri);
            const img = item.src;
            count++;
            addFriend({ id, name, uri, img });
            keep = unmatchedList.includes(id);
            const node = item.parentElement.parentElement.parentElement;
            // node.remove();
            if (keep) {
                ulInactive = container;
                // liInactive.push(node);
            } else node.classList.add('to-be-removed');
        }
        return count;
    }


    function collectStandard() {
        let handler = null, countStop = 0, count = 0;
        unmatchedList = unmatched.split(',');
        handler = setInterval(capture, 500);
        function capture() {
            wait.setText(getStatInfo(count, friends.length, true));
            const num = isNew ? captureOneBlockNew() : captureOneBlockOld();
            if (num >= 0) {
                count += num;
                countStop = 0;
                wait.setText(document.title = getStatInfo(count, friends.length, true));
            } else {
                countStop++;
                // if the connection is slow, we may want to try a bit more
                if (countStop > 20) {
                    clearInterval(handler);
                    // If reached the end of the page, confirm is unnecessary
                    const endReached = isNew ? getCountPhotos() > countPhotos : document.getElementById('pagelet_timeline_medley_photos');
                    if (confirmCollection || !endReached) {
                        dialog.show({
                            title: getStatInfo(count, friends.length),
                            text: getMessage('friendship_confirmcollect'),
                            auto: Dialog.NO,
                            timeout: 30,
                            style: [Dialog.YES, Dialog.NO]
                        }, function (method) {
                            if (method == Dialog.YES) {
                                sendFriends();
                            } else if (method == Dialog.NO) {
                                countStop = 0;
                                handler = setInterval(capture, 500);
                            }
                        });
                    } else {
                        sendFriends();
                    }
                }
            }
            scrollWindow();
        }
    }
}