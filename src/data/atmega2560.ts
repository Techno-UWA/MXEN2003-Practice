// ATmega2560 Register, Port, and Pin data for question generation

export interface PortInfo {
  name: string;       // e.g. "A"
  ddr: string;        // e.g. "DDRA"
  port: string;       // e.g. "PORTA"
  pin: string;        // e.g. "PINA"
  bits: string[];     // e.g. ["PA0","PA1",...,"PA7"]
  ddrBits: string[];  // e.g. ["DDA0","DDA1",...,"DDA7"]
  pinBits: string[];  // e.g. ["PINA0","PINA1",...,"PINA7"]
  arduinoPins: (number | null)[]; // Arduino Mega pin numbers for bits 0-7
}

const portNames = ['A','B','C','D','E','F','G','H','J','K','L'] as const;

// Arduino Mega 2560 pin mappings (bit index 0-7 for each port)
// null = not directly exposed on Arduino headers
const arduinoMappings: Record<string, (number | null)[]> = {
  A: [22, 23, 24, 25, 26, 27, 28, 29],
  B: [53, 52, 51, 50, 10, 11, 12, 13],
  C: [37, 36, 35, 34, 33, 32, 31, 30],
  D: [21, 20, 19, 18, null, null, null, 38],
  E: [0, 1, null, 5, 2, 3, null, null],
  F: [54, 55, 56, 57, 58, 59, 60, 61], // A0-A7
  G: [41, 40, 39, null, null, 4, null, null],
  H: [17, 16, null, 6, 7, 8, 9, null],
  J: [15, 14, null, null, null, null, null, null],
  K: [62, 63, 64, 65, 66, 67, 68, 69], // A8-A15
  L: [49, 48, 47, 46, 45, 44, 43, 42],
};

export const ports: PortInfo[] = portNames.map(name => ({
  name,
  ddr: `DDR${name}`,
  port: `PORT${name}`,
  pin: `PIN${name}`,
  bits: Array.from({length: 8}, (_, i) => `P${name}${i}`),
  ddrBits: Array.from({length: 8}, (_, i) => `DD${name}${i}`),
  pinBits: Array.from({length: 8}, (_, i) => `PIN${name}${i}`),
  arduinoPins: arduinoMappings[name] || Array(8).fill(null),
}));

// Build a lookup of all register bit name → numeric value (0-7)
export const bitNameMap: Record<string, number> = {};
for (const port of ports) {
  for (let i = 0; i < 8; i++) {
    bitNameMap[port.bits[i]] = i;        // PA0=0, PA1=1, ...
    bitNameMap[port.ddrBits[i]] = i;     // DDA0=0, DDA1=1, ...
    bitNameMap[port.pinBits[i]] = i;     // PINA0=0, PINA1=1, ...
  }
}

// Common named register bits from the ATmega2560 datasheet
// These are used in exam/lab questions for configuring peripherals
export const namedRegisterBits: Record<string, Record<string, number>> = {
  // USART0
  UCSR0A: { MPCM0: 0, U2X0: 1, UPE0: 2, DOR0: 3, FE0: 4, UDRE0: 5, TXC0: 6, RXC0: 7 },
  UCSR0B: { TXB80: 0, RXB80: 1, UCSZ02: 2, TXEN0: 3, RXEN0: 4, UDRIE0: 5, TXCIE0: 6, RXCIE0: 7 },
  UCSR0C: { UCPOL0: 0, UCSZ00: 1, UCSZ01: 2, USBS0: 3, UPM00: 4, UPM01: 5, UMSEL00: 6, UMSEL01: 7 },

  // Timer/Counter 0
  TCCR0A: { WGM00: 0, WGM01: 1, COM0B0: 4, COM0B1: 5, COM0A0: 6, COM0A1: 7 },
  TCCR0B: { CS00: 0, CS01: 1, CS02: 2, WGM02: 3, FOC0B: 6, FOC0A: 7 },

  // Timer/Counter 1
  TCCR1A: { WGM10: 0, WGM11: 1, COM1C0: 2, COM1C1: 3, COM1B0: 4, COM1B1: 5, COM1A0: 6, COM1A1: 7 },
  TCCR1B: { CS10: 0, CS11: 1, CS12: 2, WGM12: 3, WGM13: 4, ICES1: 6, ICNC1: 7 },

  // Timer/Counter 3
  TCCR3A: { WGM30: 0, WGM31: 1, COM3C0: 2, COM3C1: 3, COM3B0: 4, COM3B1: 5, COM3A0: 6, COM3A1: 7 },
  TCCR3B: { CS30: 0, CS31: 1, CS32: 2, WGM32: 3, WGM33: 4, ICES3: 6, ICNC3: 7 },

  // ADC
  ADMUX:  { MUX0: 0, MUX1: 1, MUX2: 2, MUX3: 3, MUX4: 4, ADLAR: 5, REFS0: 6, REFS1: 7 },
  ADCSRA: { ADPS0: 0, ADPS1: 1, ADPS2: 2, ADIE: 3, ADIF: 4, ADATE: 5, ADSC: 6, ADEN: 7 },

  // SPI
  SPCR: { SPR0: 0, SPR1: 1, CPHA: 2, CPOL: 3, MSTR: 4, DORD: 5, SPE: 6, SPIE: 7 },

  // External Interrupts
  EICRA: { ISC00: 0, ISC01: 1, ISC10: 2, ISC11: 3, ISC20: 4, ISC21: 5, ISC30: 6, ISC31: 7 },
  EIMSK: { INT0: 0, INT1: 1, INT2: 2, INT3: 3, INT4: 4, INT5: 5, INT6: 6, INT7: 7 },
};

// Flatten all named bits for the evaluator
export const allNamedBits: Record<string, number> = { ...bitNameMap };
for (const regBits of Object.values(namedRegisterBits)) {
  for (const [name, val] of Object.entries(regBits)) {
    allNamedBits[name] = val;
  }
}

// All register names (for validation)
export const allRegisterNames = new Set<string>();
for (const port of ports) {
  allRegisterNames.add(port.ddr);
  allRegisterNames.add(port.port);
  allRegisterNames.add(port.pin);
}
for (const reg of Object.keys(namedRegisterBits)) {
  allRegisterNames.add(reg);
}

// A nice helper to get a random port (for question generation)
export function getRandomPort(): PortInfo {
  // Prefer the commonly-used ports A-D for easier questions
  return ports[Math.floor(Math.random() * ports.length)];
}

export function getCommonPort(): PortInfo {
  const common = ports.filter(p => ['A','B','C','D'].includes(p.name));
  return common[Math.floor(Math.random() * common.length)];
}
