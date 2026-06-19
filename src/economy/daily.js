// Daily reward + streak logic, isolated as pure functions so it can be unit-tested
// with a controllable "day index" (no dependency on the real clock).
//
// Streak rules (real interval check, not a naive ever-increasing counter):
//   - same day        -> cannot claim again
//   - consecutive day  -> streak += 1
//   - gap of >= 2 days -> streak resets to 1 (a day was missed)

export const dayIndex = (now = Date.now()) => Math.floor(now / 86_400_000); // whole UTC days

export function dailyStatus(sd, today = dayIndex()) {
  return { available: sd._lastDayIndex !== today, streak: sd.dailyStreak || 0 };
}

export function dailyReward(streak) {
  return { coins: 50 + (streak - 1) * 25, gems: streak % 5 === 0 ? 1 : 0 };
}

// Mutates sd (streak + _lastDayIndex). Returns the claim result, or {ok:false} if already claimed today.
export function claimDaily(sd, today = dayIndex()) {
  if (sd._lastDayIndex === today) return { ok: false, reason: 'already_claimed' };
  if (sd._lastDayIndex === today - 1) sd.dailyStreak = (sd.dailyStreak || 0) + 1; // consecutive
  else sd.dailyStreak = 1;                                                        // first claim or missed day -> reset
  sd._lastDayIndex = today;
  const { coins, gems } = dailyReward(sd.dailyStreak);
  return { ok: true, reward: coins, gems, streak: sd.dailyStreak };
}
