// XP utility functions for scaling level requirements

/**
 * Calculate total XP required to reach a specific level
 * Uses a scaling formula: baseXP * level^1.5
 */
function getXpForLevel(level) {
    if (level <= 1) return 0;
    const baseXP = 100;
    let totalXP = 0;
    for (let i = 2; i <= level; i++) {
        totalXP += Math.floor(baseXP * Math.pow(i, 1.5));
    }
    return totalXP;
}

/**
 * Calculate the current level based on total XP
 */
function getLevelFromXp(xp) {
    let level = 1;
    while (getXpForLevel(level + 1) <= xp) {
        level++;
    }
    return level;
}

/**
 * Get XP needed for next level
 */
function getXpForNextLevel(currentLevel) {
    return getXpForLevel(currentLevel + 1) - getXpForLevel(currentLevel);
}

/**
 * Get current progress to next level
 */
function getProgressToNextLevel(xp, currentLevel) {
    const currentLevelXp = getXpForLevel(currentLevel);
    const nextLevelXp = getXpForLevel(currentLevel + 1);
    const progress = xp - currentLevelXp;
    const required = nextLevelXp - currentLevelXp;
    return { progress, required };
}

module.exports = {
    getXpForLevel,
    getLevelFromXp,
    getXpForNextLevel,
    getProgressToNextLevel
};
