// Question generator - produces infinite random bit manipulation challenges
// with progressive difficulty and topic selection

import { ports, getCommonPort, namedRegisterBits, type PortInfo } from '../data/atmega2560';

export type QuestionTopic =
    | 'hex_assign'
    | 'set_bits'
    | 'clear_bits'
    | 'toggle_bits'
    | 'combined_ops'
    | 'named_bits'
    | 'read_state';

export const TOPIC_LABELS: Record<QuestionTopic, string> = {
    hex_assign: 'Hex Assignment',
    set_bits: 'Set Bits',
    clear_bits: 'Clear Bits',
    toggle_bits: 'Toggle Bits',
    combined_ops: 'Combined Ops',
    named_bits: 'Named Bits',
    read_state: 'Read State',
};

export const ALL_TOPICS: QuestionTopic[] = Object.keys(TOPIC_LABELS) as QuestionTopic[];

export interface Question {
    id: string;
    topic: QuestionTopic;
    difficulty: number; // 1-10
    prompt: string;
    register: string;
    initialValue: number;
    expectedValue: number;
    hint: string;
    acceptsMultipleStatements: boolean;
    isReadState: boolean; // true = user must type the resulting value, not code
    sampleAnswer?: string;
}

// Helpers
function randInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randBits(count: number): number[] {
    const bits: number[] = [];
    const available = [0, 1, 2, 3, 4, 5, 6, 7];
    for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * available.length);
        bits.push(available.splice(idx, 1)[0]);
    }
    return bits.sort((a, b) => a - b);
}

function toBin8(n: number): string {
    return (n & 0xFF).toString(2).padStart(8, '0');
}

function toHex(n: number): string {
    return '0x' + (n & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function uid(): string {
    return Math.random().toString(36).substring(2, 10);
}

// ─── GENERATORS PER TOPIC ───────────────────────────────────────────────

function genHexAssign(difficulty: number): Question {
    const port = getCommonPort();
    const reg = port.port;
    const bitCount = Math.min(8, difficulty <= 3 ? randInt(1, 3) : difficulty <= 6 ? randInt(2, 5) : randInt(3, 8));
    const bits = randBits(bitCount);
    let expected = 0;
    for (const b of bits) expected |= (1 << b);

    const bitNames = bits.map(b => `${port.bits[b]} (bit ${b})`).join(', ');

    return {
        id: uid(),
        topic: 'hex_assign',
        difficulty,
        prompt: `Set **${reg}** so that ${bitNames} ${bits.length === 1 ? 'is' : 'are'} HIGH and all other bits are LOW.\n\nWrite a single assignment using hex notation.`,
        register: reg,
        initialValue: 0,
        expectedValue: expected,
        hint: `Think about which bits are HIGH: ${toBin8(expected)}. Convert to hex.`,
        acceptsMultipleStatements: false,
        isReadState: false,
        sampleAnswer: `${reg} = ${toHex(expected)};`,
    };
}

function genSetBits(difficulty: number): Question {
    const port = getCommonPort();
    const reg = port.port;
    const initial = difficulty <= 4 ? 0x00 : randInt(0, 255);
    const bitCount = difficulty <= 3 ? 1 : difficulty <= 6 ? randInt(1, 3) : randInt(2, 4);
    const bits = randBits(bitCount);

    let expected = initial;
    for (const b of bits) expected |= (1 << b);
    expected &= 0xFF;

    const bitDesc = bits.map(b => `**${port.bits[b]}** (bit ${b})`).join(' and ');

    return {
        id: uid(),
        topic: 'set_bits',
        difficulty,
        prompt: `Set ${bitDesc} of **${reg}** HIGH without affecting the other bits.\n\n${initial !== 0 ? `Current value: \`${toHex(initial)}\` (${toBin8(initial)})` : 'Register starts at `0x00`.'}`,
        register: reg,
        initialValue: initial,
        expectedValue: expected,
        hint: `Use the OR assignment: ${reg} |= (1<<bit). For multiple bits: ${reg} |= (1<<a)|(1<<b);`,
        acceptsMultipleStatements: false,
        isReadState: false,
        sampleAnswer: bits.length === 1
            ? `${reg} |= (1<<${port.bits[bits[0]]});`
            : `${reg} |= ${bits.map(b => `(1<<${port.bits[b]})`).join('|')};`,
    };
}

function genClearBits(difficulty: number): Question {
    const port = getCommonPort();
    const reg = port.port;
    const bitCount = difficulty <= 3 ? 1 : difficulty <= 6 ? randInt(1, 3) : randInt(2, 4);
    const bits = randBits(bitCount);

    // Make sure initial value has those bits set so clearing makes a difference
    let initial = randInt(0, 255);
    for (const b of bits) initial |= (1 << b);
    initial &= 0xFF;

    let expected = initial;
    for (const b of bits) expected &= ~(1 << b);
    expected &= 0xFF;

    const bitDesc = bits.map(b => `**${port.bits[b]}** (bit ${b})`).join(' and ');

    return {
        id: uid(),
        topic: 'clear_bits',
        difficulty,
        prompt: `Clear ${bitDesc} of **${reg}** (set to LOW) without affecting the other bits.\n\nCurrent value: \`${toHex(initial)}\` (${toBin8(initial)})`,
        register: reg,
        initialValue: initial,
        expectedValue: expected,
        hint: `Use AND with complement: ${reg} &= ~(1<<bit); For multiple: ${reg} &= ~((1<<a)|(1<<b));`,
        acceptsMultipleStatements: false,
        isReadState: false,
        sampleAnswer: bits.length === 1
            ? `${reg} &= ~(1<<${port.bits[bits[0]]});`
            : `${reg} &= ~(${bits.map(b => `(1<<${port.bits[b]})`).join('|')});`,
    };
}

function genToggleBits(difficulty: number): Question {
    const port = getCommonPort();
    const reg = port.port;
    const initial = randInt(0, 255);
    const bitCount = difficulty <= 3 ? 1 : difficulty <= 6 ? randInt(1, 3) : randInt(2, 4);
    const bits = randBits(bitCount);

    let expected = initial;
    for (const b of bits) expected ^= (1 << b);
    expected &= 0xFF;

    const bitDesc = bits.map(b => `**${port.bits[b]}** (bit ${b})`).join(' and ');

    return {
        id: uid(),
        topic: 'toggle_bits',
        difficulty,
        prompt: `Toggle ${bitDesc} of **${reg}** (flip the bit value) without affecting the other bits.\n\nCurrent value: \`${toHex(initial)}\` (${toBin8(initial)})`,
        register: reg,
        initialValue: initial,
        expectedValue: expected,
        hint: `Use XOR assignment: ${reg} ^= (1<<bit); For multiple: ${reg} ^= (1<<a)|(1<<b);`,
        acceptsMultipleStatements: false,
        isReadState: false,
        sampleAnswer: bits.length === 1
            ? `${reg} ^= (1<<${port.bits[bits[0]]});`
            : `${reg} ^= ${bits.map(b => `(1<<${port.bits[b]})`).join('|')};`,
    };
}

function genCombinedOps(difficulty: number): Question {
    const port = getCommonPort();
    const reg = port.port;
    const initial = randInt(0, 255);

    // Pick different bits for set and clear
    const allBits = randBits(Math.min(6, randInt(3, 5)));
    const mid = Math.ceil(allBits.length / 2);
    const setBits = allBits.slice(0, mid);
    const clearBits = allBits.slice(mid);

    let expected = initial;
    for (const b of setBits) expected |= (1 << b);
    for (const b of clearBits) expected &= ~(1 << b);
    expected &= 0xFF;

    const setDesc = setBits.map(b => `**${port.bits[b]}**`).join(', ');
    const clearDesc = clearBits.map(b => `**${port.bits[b]}**`).join(', ');

    return {
        id: uid(),
        topic: 'combined_ops',
        difficulty,
        prompt: `Starting with **${reg}** = \`${toHex(initial)}\` (${toBin8(initial)}):
    
1. **Set** ${setDesc} HIGH
2. **Clear** ${clearDesc} LOW

Write the statements to achieve this (without affecting other bits).`,
        register: reg,
        initialValue: initial,
        expectedValue: expected,
        hint: `Use two separate statements: one with |= to set, one with &= ~ to clear.`,
        acceptsMultipleStatements: true,
        isReadState: false,
        sampleAnswer: `${reg} |= ${setBits.map(b => `(1<<${port.bits[b]})`).join('|')};\n${reg} &= ~(${clearBits.map(b => `(1<<${port.bits[b]})`).join('|')});`,
    };
}

function genNamedBits(difficulty: number): Question {
    // Pick a random peripheral register with named bits
    const regNames = Object.keys(namedRegisterBits);
    const regName = regNames[Math.floor(Math.random() * regNames.length)];
    const bits = namedRegisterBits[regName];
    const bitNames = Object.keys(bits);

    const count = Math.min(bitNames.length, difficulty <= 4 ? randInt(1, 2) : randInt(2, 4));
    const chosen: string[] = [];
    const available = [...bitNames];
    for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * available.length);
        chosen.push(available.splice(idx, 1)[0]);
    }

    let expected = 0;
    for (const name of chosen) expected |= (1 << bits[name]);
    expected &= 0xFF;

    const bitDesc = chosen.map(n => `**${n}** (bit ${bits[n]})`).join(', ');

    return {
        id: uid(),
        topic: 'named_bits',
        difficulty,
        prompt: `Configure **${regName}** to enable ${bitDesc}.\n\nUse the named bit constants (not raw numbers) and set all other bits LOW.`,
        register: regName,
        initialValue: 0,
        expectedValue: expected,
        hint: `Use: ${regName} = ${chosen.map(n => `(1<<${n})`).join('|')};`,
        acceptsMultipleStatements: false,
        isReadState: false,
        sampleAnswer: `${regName} = ${chosen.map(n => `(1<<${n})`).join('|')};`,
    };
}

function genReadState(difficulty: number): Question {
    const port = getCommonPort();
    const reg = port.port;
    const initial = randInt(0, 255);

    // Generate 1-3 random operations
    const ops: string[] = [];
    let state = initial;
    const numOps = difficulty <= 3 ? 1 : difficulty <= 6 ? 2 : 3;

    for (let i = 0; i < numOps; i++) {
        const bit = randInt(0, 7);
        const opType = randInt(0, 2); // 0=set, 1=clear, 2=toggle
        if (opType === 0) {
            ops.push(`${reg} |= (1<<${port.bits[bit]});`);
            state |= (1 << bit);
        } else if (opType === 1) {
            ops.push(`${reg} &= ~(1<<${port.bits[bit]});`);
            state &= ~(1 << bit);
        } else {
            ops.push(`${reg} ^= (1<<${port.bits[bit]});`);
            state ^= (1 << bit);
        }
        state &= 0xFF;
    }

    return {
        id: uid(),
        topic: 'read_state',
        difficulty,
        prompt: `Given **${reg}** starts at \`${toHex(initial)}\` (${toBin8(initial)}), what is the final value after:\n\n\`\`\`c\n${ops.join('\n')}\n\`\`\`\n\nEnter the result in hex (e.g. \`0xAB\`) or binary (e.g. \`10101011\`).`,
        register: reg,
        initialValue: initial,
        expectedValue: state,
        hint: `Work through each operation step by step on the binary representation.`,
        acceptsMultipleStatements: false,
        isReadState: true,
        sampleAnswer: toHex(state),
    };
}

// ─── MAIN GENERATOR ─────────────────────────────────────────────────────

const generators: Record<QuestionTopic, (d: number) => Question> = {
    hex_assign: genHexAssign,
    set_bits: genSetBits,
    clear_bits: genClearBits,
    toggle_bits: genToggleBits,
    combined_ops: genCombinedOps,
    named_bits: genNamedBits,
    read_state: genReadState,
};

// Topic availability by difficulty level
const topicUnlockLevel: Record<QuestionTopic, number> = {
    hex_assign: 1,
    set_bits: 1,
    clear_bits: 2,
    toggle_bits: 3,
    combined_ops: 4,
    named_bits: 5,
    read_state: 2,
};

/**
 * Generate a question for specific topics, or random from available topics.
 */
export function generateQuestion(
    selectedTopics: QuestionTopic[] | 'all',
    playerLevel: number = 1
): Question {
    // Determine available topics based on player level
    let available: QuestionTopic[];
    if (selectedTopics === 'all') {
        available = ALL_TOPICS.filter(t => playerLevel >= topicUnlockLevel[t]);
    } else {
        available = selectedTopics.filter(t => playerLevel >= topicUnlockLevel[t]);
    }

    // Fallback
    if (available.length === 0) {
        available = ['hex_assign', 'set_bits'];
    }

    const topic = available[Math.floor(Math.random() * available.length)];

    // Scale difficulty based on player level (1-10 range)
    const baseDifficulty = Math.min(10, Math.ceil(playerLevel * 1.2));
    // Add some randomness: ±2 around base
    const difficulty = Math.max(1, Math.min(10, baseDifficulty + randInt(-2, 1)));

    return generators[topic](difficulty);
}

export function getAvailableTopics(playerLevel: number): QuestionTopic[] {
    return ALL_TOPICS.filter(t => playerLevel >= topicUnlockLevel[t]);
}
