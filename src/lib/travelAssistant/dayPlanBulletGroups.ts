/**
 * Day-plan Timeline: collapse hotel/activity fine print under a headline,
 * and remove repeated bullet blocks from Word/import merges (I31).
 */

export interface DayPlanBulletGroup {
  title: string;
  details: string[];
}

function normalizeBullet(line: string): string {
  return line.trim().toLowerCase().replace(/\s+/gu, " ");
}

/** Lines that are stay/booking fine print, not a separate day activity. */
export function isDayPlanDetailLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^(address|phone|email|wifi|confirmation|conf\.?\s*#?|booking\s*ref)\b/iu.test(t)) {
    return true;
  }
  if (/check[\s-]*in/iu.test(t) && /check[\s-]*out/iu.test(t)) return true;
  if (/^check[\s-]*in\b/iu.test(t) || /^check[\s-]*out\b/iu.test(t)) return true;
  if (/^late check/iu.test(t)) return true;
  if (/^breakfast\b/iu.test(t)) return true;
  if (/tourist\s*tax/iu.test(t)) return true;
  if (/^not included\b/iu.test(t) || /^includes?\b/iu.test(t)) return true;
  if (/^cancellation\b/iu.test(t)) return true;
  if (/^€\s?\d+/u.test(t) && /(breakfast|tax|person|night)/iu.test(t)) return true;
  if (/\bper person per (night|day)\b/iu.test(t)) return true;
  if (/^(mediterranean style|served (at|in)|no eggs|no bacon)\b/iu.test(t)) return true;
  if (/^(meeting point|meet at|duration|what'?s included|cancellation policy|voucher)\b/iu.test(t)) {
    return true;
  }
  if (/^(time|when|where):\s*/iu.test(t)) return true;
  if (/^\d{1,2}:\d{2}\b/u.test(t) && t.length < 80) return true;
  return false;
}

/**
 * Drop consecutive duplicate lines and consecutive repeated blocks
 * (e.g. A,B,C,D,A,B,C,D → A,B,C,D).
 */
export function dedupeDayPlanBullets(bullets: string[]): string[] {
  const consecutive: string[] = [];
  for (const bullet of bullets) {
    const trimmed = bullet.trim();
    if (!trimmed) continue;
    if (
      consecutive.length > 0 &&
      normalizeBullet(consecutive[consecutive.length - 1]!) === normalizeBullet(trimmed)
    ) {
      continue;
    }
    consecutive.push(trimmed);
  }

  let result = consecutive;
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let blockLen = Math.floor(result.length / 2); blockLen >= 2; blockLen -= 1) {
      for (let i = 0; i + 2 * blockLen <= result.length; i += 1) {
        const first = result.slice(i, i + blockLen);
        const second = result.slice(i + blockLen, i + 2 * blockLen);
        const same = first.every(
          (line, index) => normalizeBullet(line) === normalizeBullet(second[index]!),
        );
        if (same) {
          result = [...result.slice(0, i + blockLen), ...result.slice(i + 2 * blockLen)];
          changed = true;
          break outer;
        }
      }
    }
  }
  return result;
}

/** Attach detail lines to the preceding activity/stay headline. */
export function groupDayPlanBullets(bullets: string[]): DayPlanBulletGroup[] {
  const cleaned = dedupeDayPlanBullets(bullets);
  const groups: DayPlanBulletGroup[] = [];
  for (const line of cleaned) {
    const last = groups[groups.length - 1];
    if (isDayPlanDetailLine(line) && last) {
      last.details.push(line);
      continue;
    }
    groups.push({ title: line, details: [] });
  }
  return groups;
}

export function flattenDayPlanGroups(groups: DayPlanBulletGroup[]): string[] {
  return groups.flatMap((group) => [group.title, ...group.details]);
}
