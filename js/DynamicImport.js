/*
This file has the only purpose to keep this code in a different place than gui.js
because ESLint will complain about the import function.
*/
function dynamicImport(v) {
    return import(v);
}