/*global bgp gui Locale HtmlBr*/
export default {
    hasCSS: true,
    init: init,
    update: update
};

function init() {}

function update() {
    this.container.querySelector('.about_version').innerHTML = HtmlBr(gui.getMessage('about_version', bgp.Data.version));

    var generator = gui.getGenerator();
    var data;
    if (gui.hasValidGenerator()) {
        data = gui.getMessage('about_data',
            Locale.formatDateTimeFull(generator.time),
            generator.player_id,
            generator.game_site,
            generator.game_platform
        );
    } else {
        data = gui.getMessage('about_nodata');
    }
    var div = this.container.querySelector('.about_data');
    div.innerHTML = HtmlBr(data);
    div.classList.toggle('nodata', !gui.hasValidGenerator());
}