export const getCurrentUtcDayStart = (now: number) => {
  const day = 86_400_000;
  return now - (now % day);
};

export const getNextDailyResetAt = (now: number) => {
  return getCurrentUtcDayStart(now) + 86_400_000;
};
