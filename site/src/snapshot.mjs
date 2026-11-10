// Checks of the public files before any number is shown (spec 2.3 BRW-01, BRW-03, PUB-09).
export const supported_schema = 1;

const version_re = /^[0-9a-f]{64}$/;
const instant = (v) => typeof v === 'string' && /T\d\d:\d\d/.test(v) && Number.isFinite(Date.parse(v));
const text = (v) => typeof v === 'string' && v.length > 0;
const fail = (error) => ({ ok: false, error });

export function check_status(s) {
	if (!s || typeof s !== 'object') {
		return fail('not_an_object');
	}
	if (s.schema_version !== supported_schema) {
		return fail('schema_version');
	}
	if (!version_re.test(s.data_version || '')) {
		return fail('data_version');
	}
	if (!instant(s.source_checked_at)) {
		return fail('source_checked_at');
	}
	if (!Array.isArray(s.open_trips) || !s.open_trips.every((t) => t && text(t.key) && text(t.station) && instant(t.start))) {
		return fail('open_trips');
	}
	if (!Array.isArray(s.notifications) || !s.notifications.every((n) => n && text(n.id) && text(n.type) && text(n.station) && instant(n.at))) {
		return fail('notifications');
	}
	return { ok: true, value: s };
}

export function check_latest(l, expected_version) {
	const m = l && l.meta;
	if (!m || m.schema_version !== supported_schema) {
		return fail('schema_version');
	}
	if (m.is_demo !== false) {
		return fail('demo');
	}
	if (m.data_version !== expected_version) {
		return fail('version_mismatch');
	}
	if (!l.tables || !['station_info', 'catchdata', 'station_registry'].every((t) => Array.isArray(l.tables[t])) || !l.results || !l.results.overview) {
		return fail('content');
	}
	return { ok: true, value: l };
}
