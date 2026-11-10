// Editorial texts (spec 2.3 DEC-11, UX-04): Markdown files compiled at build time into safe HTML.
// Raw HTML, links outside http(s)/mailto/anchors/relative paths and files without a leading level-1 title stop the build.
// A title on two lines (opening text, UI-02) is written as a title underlined with ===.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: false, linkify: false, breaks: true, typographer: false });
// Detection pass: raw HTML on and every link kept, so that what the renderer would drop silently is reported
const detector = new MarkdownIt({ html: true });
detector.validateLink = () => true;
const allowed_link = (href) => /^(https?:\/\/|mailto:|#)/i.test(href) || !/^[a-z][a-z0-9+.-]*:/i.test(href);

function walk(tokens, fn) {
	tokens.forEach((t) => {
		fn(t);
		if (t.children) {
			walk(t.children, fn);
		}
	});
}

// level: HTML level of the leading # title (1 for the opening text, 2 for sections); deeper headings follow
export function compile_markdown(text, { file, anchor, level }) {
	const fail = (why) => {
		throw new Error(`${file}: ${why}`);
	};
	walk(detector.parse(text, {}), (t) => {
		if (t.type === 'html_block' || t.type === 'html_inline') {
			fail(`raw HTML is not allowed (${t.content.trim().slice(0, 40)})`);
		}
		const href = t.type === 'link_open' ? t.attrGet('href') : t.type === 'image' ? t.attrGet('src') : null;
		if (href !== null && !allowed_link(href)) {
			fail(`link not allowed: ${href.slice(0, 40)}`);
		}
	});
	const tokens = md.parse(text, {});
	if (!tokens.length || tokens[0].type !== 'heading_open' || tokens[0].tag !== 'h1') {
		fail('must start with a # title (or a title underlined with ===)');
	}
	let first = true;
	tokens.filter((t) => t.type === 'heading_open' || t.type === 'heading_close').forEach((t) => {
		t.tag = `h${Math.min(6, Number(t.tag.slice(1)) + level - 1)}`;
		if (t.type === 'heading_open' && first) {
			t.attrSet('id', `${anchor}-title`);
			first = false;
		}
	});
	return md.renderer.render(tokens, md.options, {}).trim();
}

export function load_content(cfg, root) {
	// sub-blocks inside a section: their # title becomes h3
	const extra = Object.entries(cfg.content).filter(([id]) => id !== 'intro').map(([id, file]) => [id, file, 3]);
	const entries = [['intro', cfg.content.intro, 1], ...extra, ...cfg.sections.map((s) => [s.id, s.file, 2])];
	return Object.fromEntries(entries.map(([id, file, level]) => {
		const path = resolve(root, file);
		if (!existsSync(path)) {
			throw new Error(`Markdown file missing: ${file}`);
		}
		return [id, compile_markdown(readFileSync(path, 'utf8'), { file, anchor: id, level })];
	}));
}

// Text safe inside HTML and attribute values
export const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Links of the Contacts section (contacts in config/site.yaml): the name, then the address as people read it,
// without https://, www., the part after ? or # and the final slash (for email, the address alone).
// Web links open in a new tab.
export function contact_items(contacts = []) {
	return contacts.map((c) => {
		let shown = c.url.replace(/^(https:\/\/(www\.)?|mailto:)/, '').replace(/[?#].*$/, '').replace(/\/$/, '');
		try {
			shown = decodeURI(shown);
		} catch {
			// malformed %-sequence: keep the address as written
		}
		const tab = c.url.startsWith('https://') ? ' target="_blank" rel="noopener noreferrer"' : '';
		return `<li><span class="contact-label">${escape(c.label)}</span> <a href="${escape(c.url)}"${tab}>${escape(shown)}</a></li>`;
	}).join('');
}
