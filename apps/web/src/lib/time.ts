export function formatMinutes(totalMinutes: number): string {
  const m = Math.round(totalMinutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

export function secondsToMinutes(seconds: number): number {
  return Math.ceil(seconds / 60);
}

// "today", "yesterday", "3 days ago", "2 weeks ago", "never"
export function relativeDay(date: Date | number | null | undefined, now = new Date()): string {
  if (date == null) return "never";
  const d = typeof date === "number" ? new Date(date) : date;
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

export function daysSince(date: Date | number | null | undefined, now = new Date()): number | null {
  if (date == null) return null;
  const t = typeof date === "number" ? date : date.getTime();
  return (now.getTime() - t) / 86400000;
}

export function formatDateTime(date: Date | number): string {
  const d = typeof date === "number" ? new Date(date) : date;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
