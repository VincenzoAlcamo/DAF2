/*global chrome*/
(function() {
    // we try several times (popup has not finished initializing)
    console.log('Begin');
    let element = null;
    let timeout = 0;
    let count = 10;

    function detect(element) {
        let form = element.form;
        if (!form) return 'no-form';
        // guard against payments
        if (element.getAttribute('data-testid') == 'pay_button') return 'is-pay';
        if (form.action.indexOf('pay') >= 0) return 'is-pay';
        if (!(/\b(app_requests|share)\b/).test(form.action)) return 'no-share';
        // find root node for dialog, so we can send it in background
        let parent = element;
        while (parent.parentNode.tagName != 'BODY') {
            parent = parent.parentNode;
        }
        // this is the Invite dialog
        if (parent.querySelector('.profileBrowserDialog')) return 'is-profile';
        return null;
    }

    function autoClick() {
        timeout += 200;
        element = document.querySelector('.layerConfirm[name=__CONFIRM__]');
        console.log(count, timeout, element);
        if (element) {
            let exception = detect(element);
            if (exception) {
                console.log(exception);
                return;
            }
            console.log('Clicking');
            element.click();
            // just in case the popup has not been closed
            setTimeout(function() {
                chrome.runtime.sendMessage({
                    action: 'closeWindow',
                });
            }, 3000);
        } else if (--count > 0) setTimeout(autoClick, timeout);
    }
    autoClick();
})();