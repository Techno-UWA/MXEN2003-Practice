// Expression Display — Incremental expression parser for live visualization
// Shows a breakdown of what the user is typing in binary, with shadow hints

import { allNamedBits } from '../data/atmega2560';

export interface ExpressionPart {
    text: string;          // what the user actually typed for this part
    type: 'register' | 'operator' | 'value' | 'paren' | 'shadow' | 'shift-op' | 'separator';
    binaryValue?: number;  // resolved 8-bit value if applicable
    label?: string;        // human-readable label (e.g. "bit 5")
}

export interface ExpressionBreakdown {
    parts: ExpressionPart[];
    resultPreview: number | null;   // preview of what the full expression would evaluate to
    registerName: string | null;
    operator: string | null;        // '=', '|=', '&=', '^='
    operandValue: number | null;    // the evaluated RHS operand
    description: string;            // human-readable description of what's happening
}

// Resolve an identifier to its numeric value
function resolveIdentifier(name: string): number | null {
    if (name in allNamedBits) {
        return allNamedBits[name];
    }
    return null;
}

// Parse a number literal string
function parseNumberLiteral(s: string): number | null {
    const cleaned = s.trim().toLowerCase();
    if (cleaned.startsWith('0x')) {
        const v = parseInt(cleaned, 16);
        return isNaN(v) ? null : v & 0xFF;
    }
    if (cleaned.startsWith('0b')) {
        const v = parseInt(cleaned.substring(2), 2);
        return isNaN(v) ? null : v & 0xFF;
    }
    if (/^\d+$/.test(cleaned)) {
        const v = parseInt(cleaned, 10);
        return isNaN(v) ? null : v & 0xFF;
    }
    return null;
}

// Try to evaluate a partial RHS expression to a numeric value
// This is a simplified version that handles common patterns
function tryEvaluatePartial(expr: string): number | null {
    const trimmed = expr.trim();
    if (!trimmed) return null;

    // Direct number
    const num = parseNumberLiteral(trimmed);
    if (num !== null) return num;

    // Named bit constant
    const resolved = resolveIdentifier(trimmed);
    if (resolved !== null) return resolved;

    // Try patterns like (1<<N), (1<<NAME), or combinations with |
    try {
        // Use a safe subset evaluator
        return safeEval(trimmed);
    } catch {
        return null;
    }
}

// Safe evaluator for common bit manipulation patterns
function safeEval(expr: string): number | null {
    let s = expr.replace(/\s+/g, '');

    // Remove outer parens
    while (s.startsWith('(') && s.endsWith(')') && isBalanced(s.substring(1, s.length - 1))) {
        s = s.substring(1, s.length - 1);
    }

    // Handle OR combinations: a|b|c
    const orParts = splitOnOperator(s, '|');
    if (orParts.length > 1) {
        let result = 0;
        for (const part of orParts) {
            const val = safeEval(part);
            if (val === null) return null;
            result |= val;
        }
        return result & 0xFF;
    }

    // Handle AND: a&b
    const andParts = splitOnOperator(s, '&');
    if (andParts.length > 1) {
        let result = 0xFF;
        for (const part of andParts) {
            const val = safeEval(part);
            if (val === null) return null;
            result &= val;
        }
        return result & 0xFF;
    }

    // Handle XOR: a^b
    const xorParts = splitOnOperator(s, '^');
    if (xorParts.length > 1) {
        let result = 0;
        for (let i = 0; i < xorParts.length; i++) {
            const val = safeEval(xorParts[i]);
            if (val === null) return null;
            if (i === 0) result = val;
            else result ^= val;
        }
        return result & 0xFF;
    }

    // Handle NOT: ~expr
    if (s.startsWith('~')) {
        const val = safeEval(s.substring(1));
        if (val === null) return null;
        return (~val) & 0xFF;
    }

    // Handle shift: a<<b or a>>b
    const lshiftIdx = s.indexOf('<<');
    if (lshiftIdx >= 0) {
        const left = safeEval(s.substring(0, lshiftIdx));
        const right = safeEval(s.substring(lshiftIdx + 2));
        if (left !== null && right !== null) {
            return (left << right) & 0xFF;
        }
        return null;
    }
    const rshiftIdx = s.indexOf('>>');
    if (rshiftIdx >= 0) {
        const left = safeEval(s.substring(0, rshiftIdx));
        const right = safeEval(s.substring(rshiftIdx + 2));
        if (left !== null && right !== null) {
            return (left >> right) & 0xFF;
        }
        return null;
    }

    // Direct number
    const num = parseNumberLiteral(s);
    if (num !== null) return num;

    // Named constant
    if (s in allNamedBits) return allNamedBits[s];

    return null;
}

function isBalanced(s: string): boolean {
    let depth = 0;
    for (const c of s) {
        if (c === '(') depth++;
        if (c === ')') depth--;
        if (depth < 0) return false;
    }
    return depth === 0;
}

function splitOnOperator(s: string, op: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    for (let i = 0; i < s.length; i++) {
        if (s[i] === '(') depth++;
        if (s[i] === ')') depth--;
        if (depth === 0 && s[i] === op && !(op === '&' && s[i + 1] === '=') && !(op === '|' && s[i + 1] === '=') && !(op === '^' && s[i + 1] === '=')) {
            // Make sure we're not matching << or >>
            if (op === '<' && s[i + 1] === '<') { current += s[i]; continue; }
            if (op === '>' && s[i + 1] === '>') { current += s[i]; continue; }
            parts.push(current);
            current = '';
            continue;
        }
        current += s[i];
    }
    if (current) parts.push(current);
    return parts;
}

// Count unmatched open parens
function countUnmatchedParens(s: string): number {
    let depth = 0;
    for (const c of s) {
        if (c === '(') depth++;
        if (c === ')') depth = Math.max(0, depth - 1);
    }
    return depth;
}

/**
 * Parse a partial expression and produce a structured breakdown for display.
 * This handles incomplete inputs gracefully.
 */
export function parseExpression(
    input: string,
    _registerName: string,
    initialValue: number
): ExpressionBreakdown {
    const trimmed = input.trim();
    const parts: ExpressionPart[] = [];
    let operator: string | null = null;
    let operandValue: number | null = null;
    let resultPreview: number | null = null;
    let description = '';
    let foundRegister: string | null = null;

    if (!trimmed) {
        return { parts: [], resultPreview: null, registerName: null, operator: null, operandValue: null, description: '' };
    }

    // Stage 1: Detect register name at the start
    const regMatch = trimmed.match(/^([A-Z][A-Z0-9_]*)/);
    if (regMatch) {
        foundRegister = regMatch[1];
        parts.push({
            text: foundRegister,
            type: 'register',
            binaryValue: initialValue,
        });

        const afterReg = trimmed.substring(foundRegister.length).trim();

        if (!afterReg) {
            description = `Register ${foundRegister}`;
            return { parts, resultPreview: initialValue, registerName: foundRegister, operator: null, operandValue: null, description };
        }

        // Stage 2: Detect operator
        const opMatch = afterReg.match(/^(\|=|&=|\^=|=)/);
        if (opMatch) {
            operator = opMatch[1];
            const opLabels: Record<string, string> = {
                '=': '←',
                '|=': '|=',
                '&=': '&=',
                '^=': '^=',
            };
            parts.push({
                text: opLabels[operator] || operator,
                type: 'operator',
            });

            const afterOp = afterReg.substring(opMatch[1].length).trim();

            if (!afterOp) {
                const opDesc: Record<string, string> = {
                    '=': 'Assign to',
                    '|=': 'OR with',
                    '&=': 'AND with',
                    '^=': 'XOR with',
                };
                description = `${opDesc[operator]} ${foundRegister} ...`;
                return { parts, resultPreview: null, registerName: foundRegister, operator, operandValue: null, description };
            }

            // Stage 3: Parse the RHS expression
            // Remove trailing semicolon for evaluation
            const rhsClean = afterOp.replace(/;$/, '').trim();

            // Try to evaluate the full RHS
            operandValue = tryEvaluatePartial(rhsClean);

            // Build parts for the RHS
            const rhsParts = buildRhsParts(rhsClean, afterOp);
            parts.push(...rhsParts);

            // Add shadow closing parens if needed
            const unmatchedParens = countUnmatchedParens(rhsClean);
            if (unmatchedParens > 0) {
                parts.push({
                    text: ')'.repeat(unmatchedParens),
                    type: 'shadow',
                });
            }

            // Calculate result preview
            if (operandValue !== null) {
                switch (operator) {
                    case '=':
                        resultPreview = operandValue & 0xFF;
                        break;
                    case '|=':
                        resultPreview = (initialValue | operandValue) & 0xFF;
                        break;
                    case '&=':
                        resultPreview = (initialValue & operandValue) & 0xFF;
                        break;
                    case '^=':
                        resultPreview = (initialValue ^ operandValue) & 0xFF;
                        break;
                }
            }

            // Build description
            if (operandValue !== null) {
                const opWord: Record<string, string> = {
                    '=': 'Set',
                    '|=': 'OR',
                    '&=': 'AND',
                    '^=': 'XOR',
                };
                description = `${opWord[operator]} → ${toBin8(operandValue)}`;
            } else {
                description = 'typing...';
            }
        } else {
            // No operator yet, just the register (or partial operator like |)
            const partialOp = afterReg.trim();
            if (partialOp) {
                parts.push({ text: partialOp, type: 'operator' });
                description = `${foundRegister} ${partialOp} ...`;
            }
        }
    } else {
        // Not starting with a register — just show raw input
        parts.push({ text: trimmed, type: 'value' });
        description = 'typing...';
    }

    return { parts, resultPreview, registerName: foundRegister, operator, operandValue, description };
}

/**
 * Build display parts for the RHS of an assignment
 */
function buildRhsParts(rhs: string, _rawAfterOp: string): ExpressionPart[] {
    const parts: ExpressionPart[] = [];

    // Pattern: (1<<N) or (1<<NAME) — single shift
    const shiftMatch = rhs.match(/^\(?(\d+)\s*<<\s*(\w+)\)?$/);
    if (shiftMatch) {
        const base = parseInt(shiftMatch[1]);
        const shiftBy = shiftMatch[2];
        const shiftNum = parseNumberLiteral(shiftBy) ?? resolveIdentifier(shiftBy);
        const evaluated = shiftNum !== null ? (base << shiftNum) & 0xFF : null;

        parts.push({ text: '(', type: 'paren' });
        parts.push({ text: String(base), type: 'value', binaryValue: base & 0xFF, label: `${base}` });
        parts.push({ text: '<<', type: 'shift-op' });
        parts.push({
            text: shiftBy,
            type: 'value',
            binaryValue: shiftNum ?? undefined,
            label: shiftNum !== null ? `bit ${shiftNum}` : shiftBy,
        });
        // Only add closing paren if it's actually in the input
        if (rhs.endsWith(')') || rhs.endsWith(');')) {
            parts.push({ text: ')', type: 'paren' });
        }

        if (evaluated !== null) {
            parts.push({ text: `= ${toBin8(evaluated)}`, type: 'separator', binaryValue: evaluated });
        }
        return parts;
    }

    // Pattern: ~(...) — complement
    if (rhs.startsWith('~')) {
        parts.push({ text: '~', type: 'operator' });
        const inner = rhs.substring(1);
        const innerParts = buildRhsParts(inner, inner);
        parts.push(...innerParts);
        return parts;
    }

    // Pattern: multiple OR'd shifts (1<<a)|(1<<b)
    if (rhs.includes('|') && rhs.includes('<<')) {
        const orSegments = splitOnOperator(rhs.replace(/^\(/, '').replace(/\)$/, ''), '|');
        for (let i = 0; i < orSegments.length; i++) {
            if (i > 0) parts.push({ text: '|', type: 'operator' });
            const seg = orSegments[i].trim();
            const segParts = buildRhsParts(seg, seg);
            parts.push(...segParts);
        }
        return parts;
    }

    // Simple value (hex, decimal, binary literal, named constant)
    const numVal = tryEvaluatePartial(rhs);
    if (numVal !== null) {
        parts.push({ text: rhs, type: 'value', binaryValue: numVal });
    } else {
        // Partial/incomplete — just show as-is
        parts.push({ text: rhs, type: 'value' });
    }

    return parts;
}

function toBin8(n: number): string {
    return (n & 0xFF).toString(2).padStart(8, '0');
}

/**
 * Render the expression breakdown as HTML
 */
export function renderExpressionDisplay(
    breakdown: ExpressionBreakdown,
    initialValue: number
): string {
    if (breakdown.parts.length === 0) return '';

    const parts = breakdown.parts;

    // Build the equation line
    let equationHtml = '<div class="expr-equation">';
    for (const part of parts) {
        const escapedText = part.text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        switch (part.type) {
            case 'register':
                equationHtml += `<span class="expr-register">${escapedText}</span>`;
                break;
            case 'operator':
                equationHtml += `<span class="expr-operator">${escapedText}</span>`;
                break;
            case 'shift-op':
                equationHtml += `<span class="expr-shift">${escapedText}</span>`;
                break;
            case 'value':
                equationHtml += `<span class="expr-value">${escapedText}</span>`;
                if (part.binaryValue !== undefined) {
                    equationHtml += `<span class="expr-binary-hint">${toBin8(part.binaryValue)}</span>`;
                }
                break;
            case 'paren':
                equationHtml += `<span class="expr-paren">${escapedText}</span>`;
                break;
            case 'shadow':
                equationHtml += `<span class="expr-shadow">${escapedText}</span>`;
                break;
            case 'separator':
                if (part.binaryValue !== undefined) {
                    equationHtml += `<span class="expr-result-hint">→ ${toBin8(part.binaryValue)}</span>`;
                }
                break;
        }
    }
    equationHtml += '</div>';

    // Build the binary preview row if we have a result
    let binaryPreview = '';
    if (breakdown.resultPreview !== null && breakdown.operator) {
        const prevBin = toBin8(initialValue);
        const resBin = toBin8(breakdown.resultPreview);

        // Show which bits changed
        const bitCells = resBin.split('').map((bit, i) => {
            const prevBit = prevBin[i];
            const changed = bit !== prevBit;
            const bitIdx = 7 - i;
            return `<span class="expr-bit ${bit === '1' ? 'expr-bit-on' : 'expr-bit-off'} ${changed ? 'expr-bit-changed' : ''}"
                    title="bit ${bitIdx}">${bit}</span>`;
        }).join('');

        binaryPreview = `
      <div class="expr-preview">
        <span class="expr-preview-label">Result:</span>
        <span class="expr-preview-bits">${bitCells}</span>
      </div>
    `;
    }

    return `
    <div class="expr-display">
      ${equationHtml}
      ${binaryPreview}
    </div>
  `;
}
