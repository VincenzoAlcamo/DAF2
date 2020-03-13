/*global chrome bgp gui Dialog Locale Html*/
export default {
    hasCSS: true,
    init: init,
    update: update
};

function init() { }

function update() {
    Dialog.htmlToDOM(this.container.querySelector('.about_version a'), Html.br(gui.getMessage('about_version', bgp.Data.version)));

    let generator = gui.getGenerator();
    let html_data = '';
    let html_warning = '';
    let html_reset = '';
    if (gui.hasValidGenerator()) {
        html_data = Html.br(gui.getMessage('about_data',
            Locale.formatDateTimeFull(generator.time),
            generator.player_id,
            generator.game_site,
            generator.game_platform
        ));
        if (bgp.Data.alternateAccountDetected) {
            html_warning = Html.br(gui.getMessage('about_alternate', bgp.Data.alternateAccountDetected));
            html_reset = String(Html.br(gui.getMessage('about_reset'))).replace('@RESET@', Html`<button>${gui.getMessage('gui_reset')}</button>`);
        }
    } else {
        html_warning = Html.br(gui.getMessage('about_nodata'));
    }
    setHtml(this.container.querySelector('.about_data'), html_data);
    setHtml(this.container.querySelector('.about_warning'), html_warning);
    setHtml(this.container.querySelector('.about_reset'), html_reset);

    for (let button of this.container.querySelectorAll('.about_launcher button'))
        button.addEventListener('click', onClick);

    let button = this.container.querySelector('.about_reset button');
    if (button) button.addEventListener('click', resetAccount);
}

function setHtml(div, html) {
    Dialog.htmlToDOM(div, html || '');
    div.style.display = html ? '' : 'none';
}

function onClick() {
    let button = this;
    chrome.runtime.sendMessage({
        action: 'reloadGame',
        value: button.getAttribute('data-value')
    });
}

function resetAccount() {
    gui.dialog.show({
        title: gui.getMessage('about_reset_ask_title'),
        html: Html.br(gui.getMessage('about_reset_ask_text')),
        style: [Dialog.CRITICAL, Dialog.CONFIRM, Dialog.CANCEL]
    }, function (confirmation, _params) {
        if (confirmation != Dialog.CONFIRM) return;
        bgp.Data.resetGenerator();
        gui.dialog.show({
            title: gui.getMessage('about_reset_ok_title'),
            html: Html.br(gui.getMessage('about_reset_ok_text'))
        }, function () {
            document.location.reload();
        });
    });
}