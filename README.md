# MCU Practice Tools

A Progressive Web App (PWA) for practicing microcontroller bit manipulation, specifically tailored for the ATmega2560 (Arduino Mega) architecture used in university courses like MXEN2003.

## Features

- **Infinite Practice Questions:** Automatically generates endless variations of bit manipulation problems.
- **7 Question Types:**
  - Hex Assignment (`PORTA = 0xFF`)
  - Set Bits (`PORTB |= (1<<3)`)
  - Clear Bits (`PORTC &= ~(1<<4)`)
  - Toggle Bits (`PORTD ^= (1<<5)`)
  - Combined Operations
  - Named Register Bits (`UCSR0B = (1<<RXEN0)`)
  - Read State (`if (PINA & (1<<2))`)
- **Live Evaluation:** See the register state update in real-time as you type your code.
- **Speed-Based Scoring:** Earn XP based on how quickly you solve problems.
  - ⚡ Lightning (< 3s)
  - 🔥 Blazing (< 6s)
  - ✨ Quick (< 12s)
- **Gamification:**
  - XP System & Leveling
  - Streak Tracking (Daily & Session)
  - Accuracy & Speed Stats
- **Mobile-First PWA:** Install on your phone or desktop for offline practice.
- **Dark Mode IDE Theme:** Designed to look and feel like a modern code editor.

## Tech Stack

- **Framework:** [Vite](https://vitejs.dev/) (Vanilla TypeScript)
- **Languages:** TypeScript, HTML5, CSS3
- **PWA:** `vite-plugin-pwa` (Service Worker, Manifest)
- **Storage:** LocalStorage for persistence

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/mcu-practice-tools.git
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

## Building for Production

To build the app for production deployment:

```bash
npm run build
```

The output will be in the `dist/` directory, ready to be deployed to static hosts like GitHub Pages, Vercel, or Netlify.

## License

MIT
