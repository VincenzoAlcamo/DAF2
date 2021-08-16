/*global DOMPurify*/
/* eslint-disable no-unused-vars */

DOMPurify.addHook('afterSanitizeAttributes', function(node) {
    // set all elements owning target and having the attribute `data-target`=_blank
    if ('target' in node && node.getAttribute('data-target') === '_blank') {
        node.removeAttribute('data-target');
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener');
    }
});
const htmlToDOMElement = document.createElement('div');
function htmlToDOM(parent, html) {
    const clean = DOMPurify.sanitize(html);
    if (parent === null) parent = htmlToDOMElement;
    parent.innerHTML = clean;
    if (DOMPurify.removed.length) {
        console.warn('removed', DOMPurify.removed);
    }
    return parent.firstElementChild;
}

function addStylesheet(href, onLoad) {
    const link = document.createElement('link');
    link.type = 'text/css';
    link.rel = 'stylesheet';
    link.href = href;
    if (onLoad) link.addEventListener('load', onLoad);
    return document.head.appendChild(link);
}

function htmlEncode(text) { return text === undefined || text === null ? '' : String(text).replace(/[&<>'"]/g, c => '&#' + c.charCodeAt(0) + ';'); }
htmlEncode.br = function(text) { return htmlEncode(text).replace(/\n/g, '<br>'); };
