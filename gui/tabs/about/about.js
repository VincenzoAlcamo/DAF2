/*global chrome bgp gui Dialog Locale Html*/
export default {
    hasCSS: true,
    init: init,
    update: update
};

let container;

function init() {
    container = this.container;
    // Set the styles here, so the background image is immediately displayed correctly
    container.style.backgroundSize = 'cover';
    container.style.backgroundRepeat = 'no-repeat';
    container.style.backgroundPosition = '50% 50%';

    const div = container.querySelector('.about_logo');
    div.addEventListener('mouseenter', () => container.classList.add('overlogo'));
    div.addEventListener('mouseleave', () => container.classList.remove('overlogo'));
}

function update() {
    this.container.querySelector('.about_version').innerText = gui.getMessage('about_version', bgp.Data.version);

    const generator = gui.getGenerator();
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

    for (const button of this.container.querySelectorAll('.about_launcher button'))
        button.addEventListener('click', onClick);

    const button = this.container.querySelector('.about_reset button');
    if (button) button.addEventListener('click', resetAccount);

    updateBg();
}

async function updateBg() {
    const urls = [];
    let cdn_root = 'https://cdn.diggysadventure.com/1/';
    rnd.seed = 0;
    if (gui.hasValidGenerator()) {
        const generator = gui.getGenerator();
        rnd.seed = +generator.player_id;
        cdn_root = generator.cdn_root;
        await bgp.Data.getFile('events');
        let events = gui.getFile('events');
        if (events) {
            events = Object.values(events).filter(event => !!event.shelf_graphics);
            const now = gui.getUnixTime();
            const eventData = generator.events;
            let items = events.filter(event => {
                const eid = event.def_id;
                const edata = eventData[eid];
                const end = (edata && +edata.finished) || +event.end || 0;
                return end > now;
            });
            if (!items.length) items = events;
            items.forEach(event => urls.push('webgl_events/' + event.shelf_graphics));
        }
    }
    if (!urls.length) urls.push('map_bg_egypt', 'map_bg_scand', 'map_bg_china', 'map_bg_atlantis', 'map_bg_greece', 'map_bg_america');
    if (urls.length) {
        // Randomize items
        for (let i = 0; i < urls.length; i++) {
            const index = rnd() % (urls.length - i);
            const a = urls[i];
            urls[i] = urls[index];
            urls[index] = a;
        }
        const timesInADay = 2; // How many times in a day the background changes
        const index = Math.floor(gui.getUnixTime() / (86400 / timesInADay)) % urls.length;
        container.classList.add('bg');
        container.style.backgroundImage = `url(${cdn_root}mobile/graphics/map/${urls[index]}.png)`;
    }
}

function rnd() {
    let p1 = rnd.seed % 28603;
    let p2 = rnd.seed % 37397;
    for (let i = 0; i < 10; i++) {
        const pp1 = p1 * p2 + 15767;
        const pp2 = p1 * p2 + 51803;
        p1 = pp1 % 28603;
        p2 = pp2 % 37397;
    }
    return rnd.seed = p1 * 28603 + p2;
}
rnd.seed = Date.now();

function setHtml(div, html) {
    Dialog.htmlToDOM(div, html || '');
    div.style.display = html ? '' : 'none';
}

function onClick() {
    const button = this;
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