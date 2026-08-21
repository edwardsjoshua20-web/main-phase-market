export const RELEASE_STATES = {
  UPCOMING: 'UPCOMING',
  NEW: 'NEW',
  RELEASED: 'RELEASED'
};

const DAY_MS = 24 * 60 * 60 * 1000;
const NEW_RELEASE_DAYS = 7;

function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getTodayStart() {
  return startOfLocalDay(new Date());
}

export function parseReleaseDateStart(value) {
  if (!value) return null;

  const datePart = String(value).slice(0, 10);
  const [year, month, day] = datePart.split('-').map((part) => Number(part));
  if (year && month && day) {
    return new Date(year, month - 1, day);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : startOfLocalDay(parsed);
}

export function getReleaseState(releaseDateValue, todayStart = getTodayStart()) {
  const releaseDate = parseReleaseDateStart(releaseDateValue);
  if (!releaseDate) return null;

  const today = startOfLocalDay(todayStart);
  const dayDelta = Math.round((releaseDate.getTime() - today.getTime()) / DAY_MS);
  if (dayDelta > 0) return RELEASE_STATES.UPCOMING;
  if (dayDelta >= -NEW_RELEASE_DAYS) return RELEASE_STATES.NEW;
  return RELEASE_STATES.RELEASED;
}

export function isHomepagePromotableReleaseState(state) {
  return state === RELEASE_STATES.UPCOMING || state === RELEASE_STATES.NEW;
}

export function getReleaseStateLabel(state) {
  if (state === RELEASE_STATES.UPCOMING) return 'UPCOMING RELEASE';
  if (state === RELEASE_STATES.NEW) return 'NEW RELEASE';
  if (state === RELEASE_STATES.RELEASED) return 'RELEASED';
  return '';
}
