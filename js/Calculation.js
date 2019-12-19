class Calculation {
    constructor() {
        this.clearConstants();
        this.clearVariables();
        // These operators are necessary
        this._symbols = {};
        this.defineOperator(',', Array.of,          'infix', 100);
        this.defineOperator('(', this.last,         'prefix');
        this.defineOperator(')', null,              'postfix');
        // These are additional operators
        this.defineOperator('!', (a) => !a,         'prefix', 517);
        this.defineOperator('^', (a, b) => a ** b,  'infix', 500, true);
        this.defineOperator('**', (a, b) => a ** b, 'infix', 500, true);
        this.defineOperator('*', (a, b) => a * b,   'infix', 400);
        this.defineOperator('/', (a, b) => a / b,   'infix', 400);
        this.defineOperator('%', (a, b) => a % b,   'infix', 400);
        this.defineOperator('+', this.last,         'prefix', 300);
        this.defineOperator('-', n => -n,           'prefix', 300);
        this.defineOperator('+', (a, b) => a + b,   'infix', 200);
        this.defineOperator('-', (a, b) => a - b,   'infix', 200);
        this.defineOperator('=', (a, b) => a == b,  'infix', 112);
        this.defineOperator('>', (a, b) => a > b,   'infix', 112);
        this.defineOperator('>=', (a, b) => a >= b, 'infix', 112);
        this.defineOperator('<', (a, b) => a < b,   'infix', 112);
        this.defineOperator('<=', (a, b) => a <= b, 'infix', 112);
        this.defineOperator('<>', (a, b) => a != b, 'infix', 112);
        this.defineOperator('!=', (a, b) => a != b, 'infix', 112);
        this.defineOperator('&&', (a, b) => a && b, 'infix', 106);
        this.defineOperator('and', (a, b) => a && b,'infix', 106);
        this.defineOperator('||', (a, b) => a || b, 'infix', 105);
        this.defineOperator('or', (a, b) => a || b, 'infix', 105);
        // All functions and constants defined in Math
        Object.getOwnPropertyNames(Math).forEach(n => {
            const v = Math[n];
            if(typeof v == 'function') this.defineOperator(n, v);
            if(typeof v == 'number') this.defineConstant(n, v);
        })
    }
    // Method for defining constants (if value is undefined, the constant is removed)
    defineConstant(symbol, value) {
        const key = symbol.toLowerCase();
        if(value === undefined) delete this._constants[key];
        else this._constants[key] = value;
    }
    clearConstants() { this._constants = {}; }
    // Method for defining variables (if value is undefined, the variable is removed)
    defineVariable(symbol, value) {
        const key = symbol.toLowerCase();
        if(value === undefined) delete this._variables[key];
        else this._variables[key] = value;
    }
    clearVariables() { this._variables = {}; }
    // Method allowing to extend an instance with more operators and functions:
    defineOperator(symbol, f, notation = 'func', precedence = 0, rightToLeft = false) {
        // Store operators keyed by their symbol/name. Some symbols may represent
        // different usages: e.g. '-' can be unary or binary, so they are also
        // keyed by their notation (prefix, infix, postfix, func):
        symbol = symbol.toLowerCase();
        if(f === undefined) {
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
    last(...a) { return a[a.length - 1]; }
    parse(expression) {
        let match;
        const values = [];
        const operators = [this._symbols['('].prefix];
        const exec = _ => {
            let op = operators.pop();
            values.push(op);
            return op.precedence;
        };
        const error = msg => {
            let pos = match ? match.index : expression.length;
            return `${msg} at ${pos}:\n${expression}\n${' '.repeat(pos)}^`;
        };
        const pattern = new RegExp(
            // Pattern for numbers
            '\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?|'
            // ...and patterns for individual operators/function names
            + Object.values(this._symbols)
                // longer symbols should be listed first
                .sort((a, b) => b.symbol.length - a.symbol.length)
                .map(val => val.regSymbol).join('|')
            + '|[a-z]\\w*'
            + '|(\\S)', 'gi'
        );
        let afterValue = false;
        pattern.lastIndex = 0; // Reset regular expression object
        do {
            match = pattern.exec(expression);
            const [token, bad] = match || [')', undefined];
            const notNumber = this._symbols[token.toLowerCase()];
            const notNewValue = notNumber && !notNumber.prefix && !notNumber.func;
            const notAfterValue = !notNumber || !notNumber.postfix && !notNumber.infix;
            // Check for syntax errors:
            if (bad || (afterValue ? notAfterValue : notNewValue)) return error('Syntax error');
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
                    if (!match || match[0] !== '(') return error('Function needs parentheses');
                }
            } else { // number or string
                if(/^[a-z]/.test(token)) {
                    const name = token.toLowerCase();
                    values.push(name in this._constants ? this._constants[name] : name);
                } else {
                    values.push(+token);
                }
                afterValue = true;
            }
        } while (match && operators.length);
        return operators.length ? error('Missing closing parenthesis')
            : match ? error('Too many closing parentheses')
            : values.slice(0, values.length - 1); // All done!
    }
    eval(expression) { return this.calc(this.parse(expression)); }
    getVariable(name) {
        if (name in this._variables) return this._variables[name];
        if (this.getExternalVariable) return this.getExternalVariable(name);
    }
    calc(parseResult) {
        const values = [];
        const fn = {
            'number': item => values.push(item),
            'string': item => values.push(this.getVariable(item)),
            'object': item => values.push(item.f(...[].concat(...values.splice(-item.argCount))))
        }
        for(const item of parseResult) fn[typeof item](item);
        return values[0];
    }
}
