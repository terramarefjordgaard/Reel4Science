// Sheet values have no zone: Sheets serial numbers (days since 1899-12-30) or dd/mm/yyyy text,
// read as wall time in the source zone and converted to UTC instants (spec 2.3 DATA-04, DATA-11).
const epoch = Date.UTC(1899, 11, 30); // day 0 of Sheets serial dates
// Milliseconds in a minute, an hour and a day (minute and hour are used by the other files too)
export const minute = 6e4;
export const hour = 36e5;
const day = 864e5;
// One clock reader per time zone, created once and reused
const formatters = {};

function formatter(tz) {
	formatters[tz] = formatters[tz] || new Intl.DateTimeFormat('en-GB', {
		timeZone: tz,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	});
	return formatters[tz];
}

// What a wall clock in zone tz shows at instant ms, written as if it were UTC
function zone_wall(ms, tz) {
	const p = Object.fromEntries(formatter(tz).formatToParts(new Date(ms)).map((x) => [x.type, Number(x.value)]));
	return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

// Difference between the zone clock and UTC at instant ms (for example +1 h in winter in Rome)
function offset(ms, tz) {
	return zone_wall(ms, tz) - Math.floor(ms / 1000) * 1000;
}

// The instant at which the zone clock shows wall. Daylight saving changes make some times missing (invalid)
// or repeated (ambiguous): those are not guessed
function wall_to_instant(wall, tz) {
	const offsets = new Set([offset(wall - 12 * hour, tz), offset(wall + 12 * hour, tz)]);
	const hits = [...offsets].map((o) => wall - o).filter((ms) => offset(ms, tz) === wall - ms);
	if (hits.length === 1) {
		return { ok: true, ms: hits[0] };
	}
	return { ok: false, error: hits.length ? 'ambiguous' : 'invalid' };
}

// Empty cell
function is_blank(v) {
	return v === null || v === undefined || v === '';
}

// Wall-clock milliseconds of the date part, or null
function date_wall(v) {
	if (typeof v === 'number') {
		return epoch + Math.floor(v) * day;
	}
	const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(v).trim()) || /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v).trim());
	if (!m) {
		return null;
	}
	const [y, mo, d] = m[1].length === 4 ? [m[1], m[2], m[3]] : [m[3], m[2], m[1]];
	return Date.UTC(Number(y), Number(mo) - 1, Number(d));
}

// Wall-clock milliseconds since midnight, or null
function time_wall(v) {
	if (typeof v === 'number') {
		return Math.round((v - Math.floor(v)) * 86400) * 1000;
	}
	const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(v).trim());
	if (!m) {
		return null;
	}
	return ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3] || 0)) * 1000;
}

// Calendar day of a Date cell (serial or text) as a comparable number, or null
export function date_key(v) {
	return is_blank(v) ? null : date_wall(v);
}

// Publication encodings: YYYY-MM-DD and HH:MM:SS, null when blank or unparsable
export function iso_date(v) {
	const d = date_key(v);
	return d === null ? null : new Date(d).toISOString().slice(0, 10);
}


export function hms(v) {
	const t = is_blank(v) ? null : time_wall(v);
	return t === null ? null : new Date(t).toISOString().slice(11, 19);
}

// Result of a conversion: { ok: true, ms } or { ok: false, error }
function instant(wall, tz) {
	return wall === null ? { ok: false, error: 'unparsable' } : wall_to_instant(wall, tz);
}

// Instant of a Date cell plus a time cell (Start or End of a trip)
export function event_instant(date_value, time_value, tz) {
	if (is_blank(date_value) || is_blank(time_value)) {
		return { ok: false, error: 'missing' };
	}
	const d = date_wall(date_value);
	const t = time_wall(time_value);
	return instant(d === null || t === null ? null : d + t, tz);
}

// Instant of a single date-and-time cell (UpdatedAt)
export function datetime_instant(value, tz) {
	if (is_blank(value)) {
		return { ok: false, error: 'missing' };
	}
	if (typeof value === 'number') {
		return instant(epoch + Math.round(value * 86400) * 1000, tz);
	}
	const [date_part, time_part = '00:00'] = String(value).trim().split(/\s+/);
	return event_instant(date_part, time_part, tz);
}

// Instant as local text with its offset, for example 2026-06-01T09:00:00+02:00
export function to_iso_local(ms, tz) {
	const wall = zone_wall(ms, tz);
	const off = Math.round((wall - Math.floor(ms / 1000) * 1000) / minute);
	const sign = off < 0 ? '-' : '+';
	const pad = (n) => String(Math.abs(n)).padStart(2, '0');
	return `${new Date(wall).toISOString().slice(0, 19)}${sign}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`;
}
