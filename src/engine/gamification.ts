// Gamification system — Speed-based XP, levels, streaks, stats
// Persisted to localStorage

const STORAGE_KEY = 'mcu_practice_stats';

export interface Stats {
    totalQuestions: number;
    correctAnswers: number;
    currentStreak: number;
    bestStreak: number;
    xp: number;
    level: number;
    topicStats: Record<string, { total: number; correct: number }>;
    lastSessionDate: string;
    dailyStreak: number;
    fastestTime: number; // fastest solve in ms
    averageTime: number; // rolling average solve time in ms
}

function defaultStats(): Stats {
    return {
        totalQuestions: 0,
        correctAnswers: 0,
        currentStreak: 0,
        bestStreak: 0,
        xp: 0,
        level: 1,
        topicStats: {},
        lastSessionDate: '',
        dailyStreak: 0,
        fastestTime: 0,
        averageTime: 0,
    };
}

export function loadStats(): Stats {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            return { ...defaultStats(), ...JSON.parse(raw) };
        }
    } catch { }
    return defaultStats();
}

export function saveStats(stats: Stats): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

// XP thresholds for each level
export function xpForLevel(level: number): number {
    return Math.floor(50 * level * (level + 1));
}

export function getLevelProgress(stats: Stats): { current: number; needed: number; percent: number } {
    const currentThreshold = xpForLevel(stats.level - 1);
    const nextThreshold = xpForLevel(stats.level);
    const current = stats.xp - currentThreshold;
    const needed = nextThreshold - currentThreshold;
    return {
        current,
        needed,
        percent: Math.min(100, Math.round((current / needed) * 100)),
    };
}

export interface AnswerResult {
    xpGained: number;
    leveledUp: boolean;
    newLevel: number;
    streakBonus: number;
    timeBonus: number;
    solveTimeMs: number;
}

/**
 * Speed-based scoring: all answers recorded are correct (auto-submit on correct).
 * XP is based on how fast you solved it.
 */
export function recordAnswer(
    stats: Stats,
    difficulty: number,
    topic: string,
    solveTimeMs: number
): AnswerResult {
    stats.totalQuestions++;
    stats.correctAnswers++;

    // Update topic stats
    if (!stats.topicStats[topic]) {
        stats.topicStats[topic] = { total: 0, correct: 0 };
    }
    stats.topicStats[topic].total++;
    stats.topicStats[topic].correct++;

    // Update daily streak
    const today = new Date().toISOString().split('T')[0];
    if (stats.lastSessionDate !== today) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        if (stats.lastSessionDate === yesterday) {
            stats.dailyStreak++;
        } else {
            stats.dailyStreak = 1;
        }
        stats.lastSessionDate = today;
    }

    // Streak always increments (only correct answers are recorded)
    stats.currentStreak++;
    if (stats.currentStreak > stats.bestStreak) {
        stats.bestStreak = stats.currentStreak;
    }

    // Update timing stats
    if (stats.fastestTime === 0 || solveTimeMs < stats.fastestTime) {
        stats.fastestTime = solveTimeMs;
    }
    if (stats.averageTime === 0) {
        stats.averageTime = solveTimeMs;
    } else {
        // Exponential moving average
        stats.averageTime = Math.round(stats.averageTime * 0.9 + solveTimeMs * 0.1);
    }

    // ─── SPEED-BASED XP CALCULATION ─────────────────────────────────
    // Base XP by difficulty: 10–55
    const baseXP = 5 + difficulty * 5;

    // Time bonus: faster = more XP
    // Under 3s = max bonus (2x), under 6s = 1.5x, under 12s = 1.2x, over 30s = 1x
    const seconds = solveTimeMs / 1000;
    let timeMultiplier: number;
    if (seconds < 3) {
        timeMultiplier = 2.0;
    } else if (seconds < 6) {
        timeMultiplier = 1.5 + 0.5 * ((6 - seconds) / 3);
    } else if (seconds < 12) {
        timeMultiplier = 1.2 + 0.3 * ((12 - seconds) / 6);
    } else if (seconds < 30) {
        timeMultiplier = 1.0 + 0.2 * ((30 - seconds) / 18);
    } else {
        timeMultiplier = 1.0;
    }

    // Streak bonus: +2 XP per streak level, max +20
    const streakBonus = Math.min(20, Math.floor(stats.currentStreak / 2) * 2);

    const timeBonus = Math.round(baseXP * (timeMultiplier - 1));
    const xpGained = Math.round(baseXP * timeMultiplier) + streakBonus;

    const oldLevel = stats.level;
    stats.xp += xpGained;

    // Check level up
    while (stats.xp >= xpForLevel(stats.level)) {
        stats.level++;
    }

    saveStats(stats);

    return {
        xpGained,
        leveledUp: stats.level > oldLevel,
        newLevel: stats.level,
        streakBonus,
        timeBonus,
        solveTimeMs,
    };
}

export function getAccuracy(stats: Stats): number {
    if (stats.totalQuestions === 0) return 0;
    return Math.round((stats.correctAnswers / stats.totalQuestions) * 100);
}

export function resetStats(): Stats {
    const s = defaultStats();
    saveStats(s);
    return s;
}

export function formatTime(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1)}s`;
    const m = Math.floor(s / 60);
    const remainder = (s % 60).toFixed(0);
    return `${m}m${remainder}s`;
}
