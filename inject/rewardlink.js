/*global chrome DOMPurify*/
const reFacebook = /https?:\/\/diggysadventure\.com\/miner\/wallpost.php\?.*wp_id=(\d+)&fb_type=(standard|portal)&wp_sig=([0-9a-z]+)/g;
const rePortal = /https?:\/\/portal\.pixelfederation\.com\/_da\/miner\/wallpost.php\?.*wp_id=(\d+)&fb_type=(standard|portal)&wp_sig=([0-9a-z]+)/g;
const reMaterial = /material_([0-9]+)\.png/;
const reFriend = /https?:\/\/graph\.facebook\.com(\/v[^/]+)?\/(\d+)\/picture/;
const reExpired = /\W(expired|изтече|vypršel|abgelaufen|udløbet|expirado|vanhentunut|expiré|λήξει|lejárt|scaduto|verlopen|expirou|expirat|ute|vypršal|doldu|nieaktualny)\W/i;
const reAuto = /\W(your own|вашия пост|vlastní příspěvek|deinem Beitrag|eget opslag|propio muro|omaa julkaisuasi|auto-récompense|δικά σου δώρα|üzenetedre|auto-ricompensa|eigen bericht|własne posty|própria mensagem|postare îţi aparţine|eget inlägg|vlastný príspevok|yayınınıza)\W/i;
const reBroken = /Error!|Грешка!|Chyba!|Fehler!|Fejl!|Virhe!|Erreur!|Σφάλμα!|Hiba!|Errore!|Foutje!|Błąd!|Erro!|Eroare!|Fel!|Hata!/i;
const reWait = /\s(\d?\d)h\s(\d?\d)m/i;

let data = null;
let match, div, el;

function getObj(id, typ, sig) {
	return {
		id: id,
		typ: typ,
		sig: sig
	};
}

function getUnixTime() {
	return Math.floor(Date.now() / 1000);
}

// Facebook reward link
if (!data) {
	match = reFacebook.exec(location.href);
	if (match) data = getObj(match[1], match[2], match[3]);
}

// Portal reward link
if (!data) {
	match = rePortal.exec(location.href);
	if (match) data = getObj(match[1], match[2], match[3]);
}

if (data) {
	data.cdt = getUnixTime();

	// Material id
	div = document.getElementsByClassName('reward')[0];
	match = div && reMaterial.exec(div.style.backgroundImage);
	if (match) data.cmt = parseInt(match[1]) || 0;

	div = document.getElementsByClassName('wp_avatar')[0];
	// Facebook id
	el = div && div.getElementsByTagName('img')[0];
	match = el && reFriend.exec(el.src);
	if (match) data.cid = match[2];
	if (el) data.cpi = el.src;
	// Facebook name
	el = div && div.getElementsByTagName('p')[0];
	if (el) data.cnm = el.textContent;


	div = document.getElementsByClassName('da-receiving-text')[0];
	if (div) {
		const text = div.textContent;
		if ((match = reWait.exec(text))) {
			// All links collected, retry in xxh yym
			data.cmt = -3;
			data.next = data.cdt + (parseInt(match[1]) * 60 + parseInt(match[2])) * 60;
		} else if (text.match(reExpired)) {
			// This link can't be clicked - its time has expired.
			data.cmt = -1;
		} else if (text.match(reAuto)) {
			//Nessuna ricompensa. Niente auto-ricompensa.
			data.cmt = -4;
		} else if (text.match(reBroken)) {
			//Error! Diggy had broken his shovel and something went wrong!
			data.cmt = -5;
		} else {
			// Already collected
			data.cmt = -2;
		}
	}

	chrome.runtime.sendMessage({
		action: 'collectRewardLink',
		reward: data
	}, function (htm) {
		const div = document.getElementsByClassName('playerIdInfo')[0];
		if (!chrome.runtime.lastError && div && htm) {
			const p = DOMPurify.sanitize(`<div>${htm}</div>`, { RETURN_DOM: true, RETURN_DOM_IMPORT: true }).firstElementChild;
			div.parentNode.insertBefore(p, div);
		}
	});
}