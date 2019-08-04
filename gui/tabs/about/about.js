/*global chrome bgp gui Locale Html*/
export default {
    hasCSS: true,
    init: init,
    update: update
};

function init() {}

function update() {
    this.container.querySelector('.about_version a').innerHTML = Html.br(gui.getMessage('about_version', bgp.Data.versionName));

    let generator = gui.getGenerator();
    let div = this.container.querySelector('.about_data');
    if (gui.hasValidGenerator()) {
        div.innerHTML = Html.br(gui.getMessage('about_data',
            Locale.formatDateTimeFull(generator.time),
            generator.player_id,
            generator.game_site,
            generator.game_platform
        ));
        div.classList.remove('nodata');
    } else {
        div.innerHTML = Html.br(gui.getMessage('about_nodata'));
        div.classList.add('nodata');
    }

    for(let button of this.container.querySelectorAll('.about_launcher button'))
        button.addEventListener('click', onClick);
}

function onClick() {
    let button = this;
    chrome.runtime.sendMessage({
        action: 'reloadGame',
        value: button.getAttribute('data-value')
    });
}