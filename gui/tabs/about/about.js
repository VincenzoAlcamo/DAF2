/*global chrome bgp gui Dialog Locale Html*/
export default { init, update };

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

	this.container.querySelectorAll('.about_launcher button').forEach(button => button.addEventListener('click', onClick));

	this.container.querySelector('.about_reset button')?.addEventListener('click', resetAccount);

	updateBg();
}

let updateRetries = 5;

async function updateBg() {
	let items = [];
	let cdn_root = 'https://cdn.diggysadventure.com/1/';
	let versionParameter = '';
	const excludeIds = gui.getArrayOfInt(sessionStorage.getItem('excludeBg'));
	rnd.seed = 0;
	if (gui.hasValidGenerator()) {
		const generator = gui.getGenerator();
		rnd.seed = +generator.player_id;
		({ cdn_root, versionParameter } = generator);
		await gui.getFileAsync('events');
		let events = gui.getFile('events');
		if (events) {
			events = Object.values(events).filter(event => !excludeIds.includes(+event.def_id) && !!event.shelf_graphics && event.shelf_graphics != 'map_x_default');
			const now = gui.getUnixTime();
			const eventData = generator.events;
			items = events.filter(event => {
				const eid = event.def_id;
				const edata = eventData[eid];
				const end = (edata && +edata.finished) || +event.end || 0;
				return end > now;
			});
			if (!items.length) items = events;
			// Skip XMAS17
			if (items.length > 1) items = items.filter(item => item.def_id != 217);
		}
	}
	if (!items.length) ['map_bg_egypt', 'map_bg_scand', 'map_bg_china', 'map_bg_atlantis', 'map_bg_greece', 'map_bg_america'].forEach(src => {
		items.push({ def_id: 0, shelf_graphics: src });
	});
	if (items.length) {
		// Randomize items
		for (let i = 0; i < items.length; i++) {
			const index = rnd() % (items.length - i);
			const a = items[i];
			items[i] = items[index];
			items[index] = a;
		}
		const timesInADay = 6; // How many times in a day the background changes
		const index = Math.floor(gui.getUnixTime() / (86400 / timesInADay)) % items.length;
		const event = items[index];
		const url = (event.def_id ? 'webgl_events/' : '') + event.shelf_graphics;
		const img = new Image();
		img.onload = () => {
			container.classList.add('bg');
			container.style.backgroundImage = `url(${img.src})`;
			img.remove();
		};
		img.onerror = () => {
			const eid = +event.def_id;
			if (eid && updateRetries-- > 0) {
				excludeIds.push(+event.def_id);
				sessionStorage.setItem('excludeBg', excludeIds.join());
				updateBg();
			}
		};
		img.src = `${cdn_root}mobile/graphics/map/${url}.png${versionParameter}`;
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
	Html.set(div, html || '');
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
		bgp.Data.setGenerator();
		gui.dialog.show({
			title: gui.getMessage('about_reset_ok_title'),
			html: Html.br(gui.getMessage('about_reset_ok_text'))
		}, function () {
			document.location.reload();
		});
	});
}
