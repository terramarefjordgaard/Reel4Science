// CSV of the active table view (spec 2.3 LB-04, PLOT-03): only the shown columns, values protected from being
// read as spreadsheet formulas, data version and scope in the file name.
const risky = /^[=+\-@\t\r]/;

function cell(v) {
	if (v === null || v === undefined) {
		return '';
	}
	let s = String(v);
	if (risky.test(s)) {
		s = `'${s}`;
	}
	return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function to_csv(columns, rows) {
	const lines = [columns.map((c) => cell(c.label)), ...rows.map((r) => columns.map((c) => cell(r[c.key])))];
	return `${lines.map((l) => l.join(',')).join('\r\n')}\r\n`;
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// period: { from, to } ISO dates or nulls
export function csv_name(view, period, data_version) {
	const p = period && (period.from || period.to) ? `${period.from || 'start'}_to_${period.to || 'end'}` : 'all-dates';
	return `reel4science_${view}_${slug(p)}_${data_version.slice(0, 12)}.csv`;
}
