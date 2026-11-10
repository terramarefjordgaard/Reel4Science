// Reads and checks config/site.yaml (or the file in SITE_CONFIG) for the Vite build; malformed settings stop the build.
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';

const positive = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

export function load_site_config(path) {
	const c = yaml.load(readFileSync(path, 'utf8'), { schema: yaml.CORE_SCHEMA });
	const problems = [];
	if (!c || !c.data || typeof c.data.base_url !== 'string' || !c.data.base_url) {
		problems.push('data.base_url');
	}
	['status_path', 'latest_path'].filter((k) => !c?.data?.[k]).forEach((k) => problems.push(`data.${k}`));
	['browser_interval_seconds', 'request_timeout_seconds', 'retry_max_seconds'].filter((k) => !positive(c?.polling?.[k])).forEach((k) => problems.push(`polling.${k}`));
	if (!positive(c?.status?.delayed_after_minutes)) {
		problems.push('status.delayed_after_minutes');
	}
	if (!positive(c?.toast?.seconds)) {
		problems.push('toast.seconds');
	}
	if (!c?.display_timezone) {
		problems.push('display_timezone');
	}
	if (!c?.content?.intro) {
		problems.push('content.intro');
	}
	const ids = (c?.sections || []).map((x) => x && x.id);
	if (!Array.isArray(c?.sections) || !c.sections.length || !c.sections.every((x) => x && x.id && x.menu && x.file) || new Set(ids).size !== ids.length) {
		problems.push('sections (entries with id, menu and file)');
	}
	const m = c?.map;
	if (!m || !m.tiles || !m.attribution || !positive(m.max_zoom) || !positive(m.zoom) || !Array.isArray(m.center) || m.center.length !== 2 || !m.center.every(Number.isFinite)) {
		problems.push('map (tiles, attribution, max_zoom, center, zoom)');
	}
	if (m && m.background !== undefined && (!m.background || !m.background.tiles || !m.background.attribution)) {
		problems.push('map.background (tiles, attribution)');
	}
	// contacts: optional; each link with a name and an https:// or mailto: address
	const contact_ok = (x) => x && typeof x.label === 'string' && x.label.trim() && /^(https:\/\/|mailto:)\S+$/.test(x.url || '');
	if (c?.contacts !== undefined && !(Array.isArray(c.contacts) && c.contacts.every(contact_ok))) {
		problems.push('contacts (label and https:// or mailto: url)');
	}
	if (!/^https:\/\/\S+$/.test(c?.footer?.logo_link || '')) {
		problems.push('footer.logo_link (https:// address)');
	}
	if (!Array.isArray(c?.palette?.species) || !c.palette.species.length) {
		problems.push('palette.species');
	}
	if (problems.length) {
		throw new Error(`${path}: missing or invalid ${problems.join(', ')}`);
	}
	return c;
}
