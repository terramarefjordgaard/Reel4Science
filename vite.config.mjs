import { defineConfig } from 'vite';
import { load_site_config } from './scripts/site-config.mjs';
import { load_content, contact_items, escape } from './scripts/site-content.mjs';

// Replaces <!--content:<id>--> in index.html with the compiled Markdown, <!--nav--> with the menu and
// <!--contacts--> with the links, {{footer_logo_link}} with the address behind the footer logo.
// Any problem stops the build
function markdown_content(cfg) {
	let root;
	return {
		name: 'reel4science-markdown',
		configResolved(c) {
			root = c.root;
		},
		transformIndexHtml(html) {
			const content = load_content(cfg, root);
			const nav = cfg.sections.map((s) => `<a href="#${s.id}">${s.menu}</a>`).join('');
			return html.replace('<!--nav-->', nav).replace('<!--contacts-->', contact_items(cfg.contacts)).replace('{{footer_logo_link}}', escape(cfg.footer.logo_link)).replace(/<!--content:([a-z-]+)-->/g, (m, id) => {
				if (!(id in content)) {
					throw new Error(`index.html: no Markdown configured for ${id}`);
				}
				return content[id];
			});
		}
	};
}

// SITE_CONFIG selects another settings file, e.g. a local copy pointing to the test data repository
export default defineConfig(() => {
	const cfg = load_site_config(process.env.SITE_CONFIG || 'config/site.yaml');
	return {
		root: 'site',
		base: './',
		plugins: [markdown_content(cfg)],
		define: { __SITE__: JSON.stringify(cfg) },
		// Plotly (about 1.2 MB) is a separate chunk loaded on first chart, never in the first paint
		build: { outDir: '../dist', emptyOutDir: true, target: 'es2020', chunkSizeWarningLimit: 1400 }
	};
});
