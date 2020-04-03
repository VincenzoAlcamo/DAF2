// eslint-disable-next-line no-unused-vars
class Calculation {
    constructor() {
        this.clearConstants();
        this.clearVariables();
        // These operators are necessary
        this._symbols = {};
        this.defineOperator(',', Array.of, 'infix', 100);
        this.defineOperator('(', this.last, 'prefix');
        this.defineOperator(')', null, 'postfix');
        // These are additional operators
        this.defineOperator(['!', 'not'], (a) => !a, 'prefix', 517);
        this.defineOperator(['^', '**'], (a, b) => a ** b, 'infix', 500, true);
        this.defineOperator('*', (a, b) => a * b, 'infix', 400);
        this.defineOperator('/', (a, b) => a / b, 'infix', 400);
        this.defineOperator('%', (a, b) => a % b, 'infix', 400);
        this.defineOperator('+', this.last, 'prefix', 300);
        this.defineOperator('-', n => -n, 'prefix', 300);
        this.defineOperator('+', (a, b) => a + b, 'infix', 200);
        this.defineOperator('-', (a, b) => a - b, 'infix', 200);
        this.defineOperator(['=', '=='], (a, b) => a == b, 'infix', 112);
        this.defineOperator('>', (a, b) => a > b, 'infix', 112);
        this.defineOperator('>=', (a, b) => a >= b, 'infix', 112);
        this.defineOperator('<', (a, b) => a < b, 'infix', 112);
        this.defineOperator('<=', (a, b) => a <= b, 'infix', 112);
        this.defineOperator(['<>', '!='], (a, b) => a != b, 'infix', 112);
        this.defineOperator(['&&', 'and'], (a, b) => a && b, 'infix', 106);
        this.defineOperator(['||', 'or'], (a, b) => a || b, 'infix', 105);
        // All functions and constants defined in Math
        Object.getOwnPropertyNames(Math).forEach(n => {
            const v = Math[n];
            if (typeof v == 'function') this.defineOperator(n, v);
            if (typeof v == 'number') this.defineConstant(n, v);
        });
        this.defineOperator('if', (a, b, c) => a ? b : c);
    }
    _define(collection, symbol, value) {
        const key = symbol.toLowerCase();
        if (value === undefined) delete collection[key]; else collection[key] = value;
    }
    // Method for defining constants (if value is undefined, the constant is removed)
    defineConstant(symbol, value) { this._define(this._constants, symbol, value); }
    clearConstants() {
        this._constants = {};
        this.defineConstant('true', true);
        this.defineConstant('false', false);
    }
    // Method for defining variables (if value is undefined, the variable is removed)
    defineVariable(symbol, value) { this._define(this._variables, symbol, value); }
    clearVariables() { this._variables = {}; }
    // Method allowing to extend an instance with more operators and functions:
    defineOperator(symbols, f, notation = 'func', precedence = 0, rightToLeft = false) {
        // Store operators keyed by their symbol/name. Some symbols may represent
        // different usages: e.g. '-' can be unary or binary, so they are also
        // keyed by their notation (prefix, infix, postfix, func):
        for (let symbol of [].concat(symbols)) {
            symbol = symbol.toLowerCase();
            if (f === undefined) {
                delete this._symbols[symbol];
                return;
            }
            if (notation === 'func') precedence = 0;
            this._symbols[symbol] = Object.assign({}, this._symbols[symbol], {
                [notation]: {
                    symbol, f, notation, precedence, rightToLeft,
                    argCount: 1 + (notation === 'infix')
                },
                symbol,
                regSymbol: symbol.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&')
                    + (/\w$/.test(symbol) ? '\\b' : '') // add a break if it's a name
            });
        }
    }
    last(...a) { return a[a.length - 1]; }
    parse(expression) {
        let match;
        const values = [];
        const operators = [this._symbols['('].prefix];
        const exec = () => {
            const op = operators.pop();
            values.push(op);
            return op.precedence;
        };
        const error = (code, msg) => {
            this.errorCode = code;
            this.errorPos = (match ? match.index : expression.length) + 1;
            this.errorMessage = msg;
            return `${msg} at ${this.errorPos}:\n${expression}\n${' '.repeat(this.errorPos - 1)}^`;
        };
        const pattern = new RegExp(
            '\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?|'  // Pattern for numbers
            // ...and patterns for individual operators/function names
            + Object.values(this._symbols)
                // longer symbols should be listed first
                .sort((a, b) => b.symbol.length - a.symbol.length)
                .map(val => val.regSymbol).join('|')
            + '|[a-z]\\w*'  // Pattern for variables/constants
            + '|(\\S)', 'gi'
        );
        this.errorMessage = '';
        this.errorPos = this.errorCode = 0;
        let afterValue = false;
        pattern.lastIndex = 0; // Reset regular expression object
        do {
            match = pattern.exec(expression);
            const [token, bad] = match || [')', undefined];
            const notNumber = this._symbols[token.toLowerCase()];
            const notNewValue = notNumber && !notNumber.prefix && !notNumber.func;
            const notAfterValue = !notNumber || !notNumber.postfix && !notNumber.infix;
            // Check for syntax errors:
            if (bad || (afterValue ? notAfterValue : notNewValue)) return error(1, 'Syntax error');
            if (afterValue) {
                // We either have an infix or postfix operator (they should be mutually exclusive)
                const curr = notNumber.postfix || notNumber.infix;
                do {
                    const prev = operators[operators.length - 1];
                    if (((curr.precedence - prev.precedence) || prev.rightToLeft) > 0) break;
                    // Apply previous operator, since it has precedence over current one
                } while (exec()); // Exit loop after executing an opening parenthesis or function
                afterValue = curr.notation === 'postfix';
                if (curr.symbol !== ')') {
                    operators.push(curr);
                    // Postfix always has precedence over any operator that follows after it
                    if (afterValue) exec();
                }
            } else if (notNumber) { // prefix operator or function
                operators.push(notNumber.prefix || notNumber.func);
                if (notNumber.func) { // Require an opening parenthesis
                    match = pattern.exec(expression);
                    if (!match || match[0] !== '(') return error(2, 'Function needs parentheses');
                }
            } else { // number or string
                if (/^[a-z]/.test(token)) {
                    const name = token.toLowerCase();
                    values.push(name in this._constants ? this._constants[name] : name);
                } else {
                    values.push(+token);
                }
                afterValue = true;
            }
        } while (match && operators.length);
        if (operators.length) return error(3, 'Missing closing parenthesis');
        if (match) return error(4, 'Too many closing parentheses');
        return values.slice(0, values.length - 1); // All done!
    }
    eval(expression) { return this.calc(this.parse(expression)); }
    getVariable(name) {
        if (name in this._variables) return this._variables[name];
        if (this.getExternalVariable) return this.getExternalVariable(name);
    }
    calc(parseResult) {
        const values = [];
        for (const item of parseResult) {
            const type = typeof item;
            if (type == 'number' || type == 'boolean') values.push(item);
            else if (type == 'string') values.push(this.getVariable(item));
            else if (type == 'object') values.push(item.f(...[].concat(...values.splice(-item.argCount))));
        }
        return values[0];
    }
}
