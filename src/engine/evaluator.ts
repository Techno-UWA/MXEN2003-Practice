// Safe C-style bit manipulation expression evaluator
// Supports: =, |=, &=, ^= assignments
// Operators: |, &, ^, ~, <<, >>
// Literals: hex (0xFF), decimal, binary (0b1010)
// Named identifiers: PA3, RXEN0, etc.

import { allNamedBits } from '../data/atmega2560';

// Token types
type TokenType =
    | 'NUMBER' | 'IDENTIFIER' | 'LPAREN' | 'RPAREN'
    | 'OR' | 'AND' | 'XOR' | 'NOT' | 'LSHIFT' | 'RSHIFT'
    | 'ASSIGN' | 'OR_ASSIGN' | 'AND_ASSIGN' | 'XOR_ASSIGN'
    | 'SEMICOLON' | 'EOF';

interface Token {
    type: TokenType;
    value: string;
    numValue?: number;
}

function tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    const s = input.trim();

    while (i < s.length) {
        // Skip whitespace
        if (/\s/.test(s[i])) { i++; continue; }

        // Semicolon
        if (s[i] === ';') { tokens.push({ type: 'SEMICOLON', value: ';' }); i++; continue; }

        // Two-char operators
        if (i + 1 < s.length) {
            const two = s.substring(i, i + 2);
            if (two === '|=') { tokens.push({ type: 'OR_ASSIGN', value: '|=' }); i += 2; continue; }
            if (two === '&=') { tokens.push({ type: 'AND_ASSIGN', value: '&=' }); i += 2; continue; }
            if (two === '^=') { tokens.push({ type: 'XOR_ASSIGN', value: '^=' }); i += 2; continue; }
            if (two === '<<') { tokens.push({ type: 'LSHIFT', value: '<<' }); i += 2; continue; }
            if (two === '>>') { tokens.push({ type: 'RSHIFT', value: '>>' }); i += 2; continue; }
        }

        // Single-char operators
        if (s[i] === '=') { tokens.push({ type: 'ASSIGN', value: '=' }); i++; continue; }
        if (s[i] === '|') { tokens.push({ type: 'OR', value: '|' }); i++; continue; }
        if (s[i] === '&') { tokens.push({ type: 'AND', value: '&' }); i++; continue; }
        if (s[i] === '^') { tokens.push({ type: 'XOR', value: '^' }); i++; continue; }
        if (s[i] === '~') { tokens.push({ type: 'NOT', value: '~' }); i++; continue; }
        if (s[i] === '(') { tokens.push({ type: 'LPAREN', value: '(' }); i++; continue; }
        if (s[i] === ')') { tokens.push({ type: 'RPAREN', value: ')' }); i++; continue; }

        // Numbers: hex (0x..), binary (0b..), decimal
        if (/[0-9]/.test(s[i])) {
            let numStr = '';
            if (s[i] === '0' && i + 1 < s.length && (s[i + 1] === 'x' || s[i + 1] === 'X')) {
                numStr = '0x';
                i += 2;
                while (i < s.length && /[0-9a-fA-F]/.test(s[i])) { numStr += s[i]; i++; }
                tokens.push({ type: 'NUMBER', value: numStr, numValue: parseInt(numStr, 16) & 0xFF });
            } else if (s[i] === '0' && i + 1 < s.length && (s[i + 1] === 'b' || s[i + 1] === 'B')) {
                numStr = '0b';
                i += 2;
                while (i < s.length && /[01]/.test(s[i])) { numStr += s[i]; i++; }
                tokens.push({ type: 'NUMBER', value: numStr, numValue: parseInt(numStr.substring(2), 2) & 0xFF });
            } else {
                while (i < s.length && /[0-9]/.test(s[i])) { numStr += s[i]; i++; }
                tokens.push({ type: 'NUMBER', value: numStr, numValue: parseInt(numStr, 10) & 0xFF });
            }
            continue;
        }

        // Identifiers (register names, bit names)
        if (/[a-zA-Z_]/.test(s[i])) {
            let id = '';
            while (i < s.length && /[a-zA-Z0-9_]/.test(s[i])) { id += s[i]; i++; }
            tokens.push({ type: 'IDENTIFIER', value: id });
            continue;
        }

        // Unknown character - skip
        i++;
    }

    tokens.push({ type: 'EOF', value: '' });
    return tokens;
}

// Recursive descent parser for bit manipulation expressions
class Parser {
    private tokens: Token[];
    private pos: number;

    constructor(tokens: Token[]) {
        this.tokens = tokens;
        this.pos = 0;
    }

    private peek(): Token {
        return this.tokens[this.pos] || { type: 'EOF', value: '' };
    }

    private advance(): Token {
        const t = this.tokens[this.pos];
        this.pos++;
        return t;
    }

    private expect(type: TokenType): Token {
        const t = this.peek();
        if (t.type !== type) {
            throw new Error(`Expected ${type} but got ${t.type} ('${t.value}')`);
        }
        return this.advance();
    }

    // Parse a full expression value (right-hand side)
    parseExpression(): number {
        return this.parseOr();
    }

    private parseOr(): number {
        let left = this.parseXor();
        while (this.peek().type === 'OR') {
            this.advance();
            left = (left | this.parseXor()) & 0xFF;
        }
        return left;
    }

    private parseXor(): number {
        let left = this.parseAnd();
        while (this.peek().type === 'XOR') {
            this.advance();
            left = (left ^ this.parseAnd()) & 0xFF;
        }
        return left;
    }

    private parseAnd(): number {
        let left = this.parseShift();
        while (this.peek().type === 'AND') {
            this.advance();
            left = (left & this.parseShift()) & 0xFF;
        }
        return left;
    }

    private parseShift(): number {
        let left = this.parseUnary();
        while (this.peek().type === 'LSHIFT' || this.peek().type === 'RSHIFT') {
            const op = this.advance();
            const right = this.parseUnary();
            if (op.type === 'LSHIFT') {
                left = (left << right) & 0xFF;
            } else {
                left = (left >> right) & 0xFF;
            }
        }
        return left;
    }

    private parseUnary(): number {
        if (this.peek().type === 'NOT') {
            this.advance();
            return (~this.parseUnary()) & 0xFF;
        }
        return this.parsePrimary();
    }

    private parsePrimary(): number {
        const t = this.peek();

        if (t.type === 'NUMBER') {
            this.advance();
            return t.numValue!;
        }

        if (t.type === 'IDENTIFIER') {
            this.advance();
            // Look up as a named bit
            if (t.value in allNamedBits) {
                return allNamedBits[t.value];
            }
            throw new Error(`Unknown identifier: ${t.value}`);
        }

        if (t.type === 'LPAREN') {
            this.advance();
            const val = this.parseExpression();
            this.expect('RPAREN');
            return val;
        }

        throw new Error(`Unexpected token: ${t.type} ('${t.value}')`);
    }

    // Parse a full statement: REGISTER op= expression;
    parseStatement(): { register: string; value: number; op: string } | null {
        if (this.peek().type === 'EOF') return null;
        if (this.peek().type === 'SEMICOLON') { this.advance(); return null; }

        const regToken = this.expect('IDENTIFIER');
        const register = regToken.value;

        const opToken = this.peek();
        let op = '';

        if (opToken.type === 'ASSIGN') {
            op = '=';
            this.advance();
        } else if (opToken.type === 'OR_ASSIGN') {
            op = '|=';
            this.advance();
        } else if (opToken.type === 'AND_ASSIGN') {
            op = '&=';
            this.advance();
        } else if (opToken.type === 'XOR_ASSIGN') {
            op = '^=';
            this.advance();
        } else {
            throw new Error(`Expected assignment operator but got '${opToken.value}'`);
        }

        const exprValue = this.parseExpression();

        // Optional semicolon
        if (this.peek().type === 'SEMICOLON') {
            this.advance();
        }

        return { register, value: exprValue, op };
    }
}

export interface EvalResult {
    success: boolean;
    registerStates: Record<string, number>;
    error?: string;
    steps: Array<{
        register: string;
        op: string;
        exprValue: number;
        before: number;
        after: number;
    }>;
}

/**
 * Evaluate one or more C-style bit manipulation statements.
 * Returns the final register states.
 */
export function evaluate(
    code: string,
    initialStates: Record<string, number> = {}
): EvalResult {
    const states: Record<string, number> = { ...initialStates };
    const steps: EvalResult['steps'] = [];

    try {
        const tokens = tokenize(code);
        const parser = new Parser(tokens);

        let safety = 0;
        while (parser.parseStatement !== undefined && safety < 100) {
            safety++;
            const stmt = parser.parseStatement();
            if (stmt === null) {
                if (tokens[parser['pos']]?.type === 'EOF') break;
                continue;
            }

            const before = states[stmt.register] ?? 0;
            let after: number;

            switch (stmt.op) {
                case '=':
                    after = stmt.value & 0xFF;
                    break;
                case '|=':
                    after = (before | stmt.value) & 0xFF;
                    break;
                case '&=':
                    after = (before & stmt.value) & 0xFF;
                    break;
                case '^=':
                    after = (before ^ stmt.value) & 0xFF;
                    break;
                default:
                    throw new Error(`Unknown operator: ${stmt.op}`);
            }

            states[stmt.register] = after;
            steps.push({
                register: stmt.register,
                op: stmt.op,
                exprValue: stmt.value,
                before,
                after,
            });
        }

        return { success: true, registerStates: states, steps };
    } catch (e: any) {
        return {
            success: false,
            registerStates: states,
            error: e.message || 'Parse error',
            steps,
        };
    }
}

/**
 * Check if user's code produces the expected register state.
 */
export function checkAnswer(
    userCode: string,
    targetRegister: string,
    initialValue: number,
    expectedValue: number
): {
    correct: boolean;
    userResult: number | null;
    expected: number;
    error?: string;
    steps: EvalResult['steps'];
} {
    const result = evaluate(userCode, { [targetRegister]: initialValue });

    if (!result.success) {
        return {
            correct: false,
            userResult: null,
            expected: expectedValue,
            error: result.error,
            steps: result.steps,
        };
    }

    const userResult = result.registerStates[targetRegister] ?? initialValue;
    return {
        correct: userResult === expectedValue,
        userResult,
        expected: expectedValue,
        steps: result.steps,
    };
}
