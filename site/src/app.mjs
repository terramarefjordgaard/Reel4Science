// Page data cycle (spec 2.3 BRW-01..04, PUB-09): read status.json; banner and toasts from it;
// read latest.json only for a new data_version and adopt it only when the two versions agree.
import { check_status, check_latest } from './snapshot.mjs';
import { public_state } from './state.mjs';
import { create_notifier, banner_items } from './notify.mjs';

export function create_app({ load, config, now, ui }) {
	const notifier = create_notifier();
	let status = null;
	let copy = null;
	let imported_at = null;
	let read_error = false;

	const render = () => {
		const state = public_state({
			has_copy: copy !== null,
			read_error,
			source_checked_at: status ? status.source_checked_at : null,
			delayed_after_minutes: config.status.delayed_after_minutes,
			now: now()
		});
		ui.state({
			state,
			source_checked_at: status ? status.source_checked_at : null,
			data_published_at: copy ? copy.meta.data_published_at : null,
			imported_at,
			period: copy ? [copy.meta.period_start, copy.meta.period_end] : null
		});
		if (status) {
			ui.banner(banner_items(status.open_trips), { stale: state !== 'up_to_date', source_checked_at: status.source_checked_at });
		}
		return state;
	};

	async function check() {
		let next;
		try {
			const c = check_status(await load('status'));
			if (!c.ok) {
				throw new Error(`status.json: ${c.error}`);
			}
			next = c.value;
		} catch (e) {
			read_error = true;
			render();
			throw e;
		}
		status = next;
		read_error = false;
		notifier.update(status).forEach((text) => ui.toast(text));
		if (!copy || copy.meta.data_version !== status.data_version) {
			try {
				const raw = await load('latest');
				let c = check_latest(raw, status.data_version);
				// First load while the CDN still serves an older latest.json: show it rather than nothing;
				// the newer one replaces it as soon as the two versions agree (PUB-09, DEC-28)
				if (!c.ok && c.error === 'version_mismatch' && !copy) {
					c = check_latest(raw, raw.meta.data_version);
				}
				if (c.ok) {
					copy = c.value;
					imported_at = new Date(now()).toISOString();
					ui.data(copy);
				} else if (c.error !== 'version_mismatch') {
					read_error = true;
				}
			} catch {
				read_error = true;
			}
		}
		render();
		if (read_error) {
			throw new Error('latest.json unreadable');
		}
	}

	return { check };
}
