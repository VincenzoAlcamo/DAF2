export default {
    hasCSS: true,
    init: init,
    update: update
};

function init() {}

function update() {
    this.container.querySelector('.about_version').innerHTML = htmlBr(getMessage('about_version', bgp.Data.version));

    var generator = bgp.Data.generator;
    var data;
    if (generator && generator.player_id) {
        data = getMessage('about_data',
            formatDateTimeFull(generator.time),
            generator.player_id,
            generator.game_site,
            generator.game_platform
        );
    } else {
        data = getMessage('about_nodata');
    }
    this.container.querySelector('.about_data').innerHTML = htmlBr(data);
}