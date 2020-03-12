/*global chrome Dialog*/
var language = 'en';
var collectMethod = 'standard';
var removeGhosts = 0;
var unmatched = '';
var confirmCollection = false;
var wait = Dialog(Dialog.WAIT);
var dialog = Dialog();
var retries = 10;
var hashById = {};
var friends = [];
var ulInactiveParent = null;
var ulInactive = null;
var liInactive = [];
var container, captureOneBlock, unmatchedList;

console.log('Collection start', new Date());

function getMessage(id, ...args) {
    let text = chrome.i18n.getMessage(language + '@' + id, args);
    if (text == '' && language != 'en') text = chrome.i18n.getMessage('en@' + id, args);
    return text;
}

function addFriend(friend) {
    var old = hashById[friend.id];
    if (old) {
        if (friend.uri) old.uri = friend.uri;
        if (friend.disabled) old.disabled = true;
    } else {
        hashById[friend.id] = friend;
        friends.push(friend);
    }
}

function scrollWindow() {
    try {
        document.body.scrollIntoView(true);
        document.getElementById('pagelet_dock').scrollIntoView();
    } catch (e) { }
}

// eslint-disable-next-line no-unused-vars
function collect() {
    Dialog.language = language;
    wait.show();
    const handler = setInterval(function () {
        container = document.getElementById('pagelet_timeline_medley_friends');
        captureOneBlock = captureOneBlockOld;
        if (!container) {
            const img = document.querySelector('a > img[width="80"]');
            if (img) {
                container = img.parentElement.parentElement.parentElement.parentElement;
                captureOneBlock = captureOneBlockNew;
            }
        }
        if (container) {
            clearInterval(handler);
            wait.hide();
            if (collectMethod == 'standard' || collectMethod == 'unmatched') collectStandard();
            // if (collectMethod == 'alternate' || collectMethod == 'both') collectAlternate();
            return;
        } else if (retries > 0) {
            retries--;
            wait.setText(retries);
            scrollWindow();
        } else {
            clearInterval(handler);
            wait.hide();
            dialog.show({
                text: 'Something went wrong',
                style: [Dialog.OK, Dialog.CRITICAL]
            });
        }
    }, 1000);
}

function getStatInfo(num, total) {
    const count = num == total ? total : (num + ' / ' + total);
    return getMessage('friendship_collectstat', count);
}

function sendFriends() {
    const viewDisabled = () => ulInactive.firstElementChild.scrollIntoView({ block: 'center' });
    console.log('Collection end', new Date());
    document.title = getStatInfo(friends.length, friends.length);
    wait.setText(document.title);
    chrome.runtime.sendMessage({
        action: 'friendsCaptured',
        data: collectMethod == 'unmatched' ? null : friends,
        close: !ulInactive
    });
    if (ulInactive) {
        if (ulInactive !== container) {
            ulInactive.innerHTML = '';
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
    let ul = container && container.getElementsByClassName('uiList')[0];
    if (!ul) return -1;
    for (const li of Array.from(ul.getElementsByTagName('li'))) {
        for (const item of Array.from(li.getElementsByTagName('a'))) {
            const name = item.textContent;
            if (name == '') continue;
            var id, d, uri;
            var add = false, keep = false, disabled = false;
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
    if (!ulInactive && container.querySelectorAll('div > img[width="80"]')) ulInactive = container;
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
        node.remove();
        if (keep) {
            ulInactive = container;
            liInactive.push(node);
        }
    }
    return count;
}


function collectStandard() {
    let handler = null, countStop = 0, count = 0;
    unmatchedList = unmatched.split(',');
    handler = setInterval(capture, 500);
    function capture() {
        const num = captureOneBlock();
        if (num >= 0) {
            count += num;
            countStop = 0;
            document.title = getStatInfo(count, friends.length);
            wait.setText(document.title);
        } else {
            countStop++;
            // if the connection is slow, we may want to try a bit more
            if (countStop > 20) {
                clearInterval(handler);
                if (confirmCollection) {
                    dialog.show({
                        title: getStatInfo(count, friends.length),
                        text: getMessage('friendship_confirmcollect'),
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

// function collectAlternate() {
//     var fb_dtsg, fb_id, req, ghosts, toRemove, numToRemove, numProcessed, numRemoved, removingMessage, removedMessage;

//     wait.show().setText(getMessage('friendship_collectalternatewait'));

//     try {
//         fb_dtsg = document.getElementsByName('fb_dtsg')[0].value;
//         fb_id = document.cookie.match(/c_user=(\d+)/)[1];
//         var url = 'https://www.facebook.com/chat/user_info_all/?viewer=' + fb_id + '&cb=' + Date.now() + '&__user=' + fb_id +
//             '&__a=1&__dyn=&__req=3m&fb_dtsg=' + fb_dtsg + '&ttstamp=&__rev=';
//         req = new XMLHttpRequest();
//         req.addEventListener('load', transferComplete, false);
//         req.addEventListener('error', (_event) => {
//             transferError('The operation failed!');
//         }, false);
//         req.addEventListener('abort', (_event) => {
//             transferError('The operation was canceled!');
//         }, false);
//         req.open('POST', url, true);
//         req.send();
//     } catch (e) {
//         transferError(e.message);
//     }

//     function transferError(message) {
//         wait.setText(message);
//     }

//     function transferComplete(_event) {
//         try {
//             var s = req.responseText;
//             var i = s.indexOf('{');
//             var json = s.substr(i);
//             var data = JSON.parse(json);
//             var payload = data.payload;
//             var keys = Object.keys(payload);
//             ghosts = [];
//             keys.forEach(key => {
//                 var item = payload[key];
//                 if (typeof item.id == 'string') {
//                     if (item.is_friend === true) {
//                         addFriend({
//                             id: item.id,
//                             name: item.name,
//                             uri: item.uri
//                         });
//                     }
//                 } else if (item.id === 0) {
//                     ghosts.push([key, null]);
//                 }
//             });
//             continueOperation();
//         } catch (e) {
//             transferError(e.message);
//         }
//     }

//     function continueOperation() {
//         if (ghosts.length > 0 && removeGhosts != 0) {
//             wait.hide();
//             if (removeGhosts == 2) startRemoving(ghosts, 'friendship_ghostfriendremoving', null);
//             else dialog.show({
//                 text: getMessage('friendship_ghostfriendsdetected', ghosts.length),
//                 style: [Dialog.OK, Dialog.CANCEL]
//             }, function (method) {
//                 if (method != Dialog.OK) {
//                     ghosts = [];
//                     return continueOperation();
//                 }
//                 startRemoving(ghosts, 'friendship_ghostfriendremoving', 'friendship_ghostfriendremoved');
//             });
//             return;
//         }
//         if (collectMethod == 'both') collectStandard();
//         else sendFriends();
//     }

//     function startRemoving(array, msgRemoving, msgRemoved) {
//         removingMessage = msgRemoving;
//         removedMessage = msgRemoved;
//         // take a copy and clear the original array
//         toRemove = Array.from(array);
//         array.length = 0;
//         console.log(toRemove);
//         numToRemove = toRemove.length;
//         numProcessed = numRemoved = 0;
//         removeOne();
//     }

//     function removeOne() {
//         var item = toRemove.pop();
//         var id = item && item[0];
//         var name = item && item[1];
//         if (item) {
//             numProcessed++;
//             wait.setText(getMessage(removingMessage, numProcessed, numToRemove));
//             remove();
//         } else {
//             wait.hide();
//             if (removedMessage)
//                 dialog.show({
//                     text: getMessage(removedMessage, numRemoved),
//                     style: [Dialog.OK]
//                 }, continueOperation);
//             else continueOperation();
//         }

//         function remove() {
//             var url = 'https://www.facebook.com/ajax/profile/removefriendconfirm.php?dpr=1';
//             url += '&uid=' + id + '&unref=bd_friends_tab&floc=friends_tab&nctr[_mod]=pagelet_timeline_app_collection_' + fb_id +
//                 '%3A2356318349%3A2&__user=' + fb_id + '&__a=1&__dyn=&__req=1b&__be=0&__pc=PHASED%3ADEFAULT&fb_dtsg=' + fb_dtsg +
//                 '&ttstamp=&__rev=';
//             var req = new XMLHttpRequest();
//             req.addEventListener('load', transferComplete, false);
//             req.addEventListener('error', transferFailed, false);
//             req.addEventListener('abort', transferFailed, false);
//             req.open('POST', url, true);
//             req.send();
//         }

//         function transferFailed() {
//             console.log('Failed: ', id, name, req.responseText);
//             removeOne();
//         }

//         function transferComplete() {
//             console.log('Complete: ', id, name, req.responseText);
//             if (req.responseText.indexOf('errorSummary') < 0) numRemoved++;
//             removeOne();
//         }
//     }
// }