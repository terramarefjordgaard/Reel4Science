// Stops when the website folder contains something that must stay private: a path of a computer, an access token,
// a key, a password, the address of a Google Sheet, an email address, photo metadata (they can hold a GPS position).
//   npm run check:public                       these checks (GitHub runs them too, before each publication)
//   npm run check:public -- --words <file>     also the words listed in <file>, one per line
// Every file of the folder is read, the built site (dist) included; node_modules and .git are skipped.
// What is found is reported as file:line and reason, never printed.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const this_file = 'scripts/check-public.mjs'; // its own rules below would match themselves
const skipped_folders = ['node_modules', '.git'];
const image = /\.(png|jpe?g|gif|webp|ico)$/i;
const font = /\.(woff2?|ttf|otf|eot)$/i;

// What must never be published, with the reason shown when found
const rules = [
	['path of a computer', /\/Users\/|\/home\/|[A-Z]:\\Users\\|\/private\/tmp\//],
	['GitHub token', /github_pat_\w+|\bgh[pousr]_[A-Za-z0-9]{20,}/],
	['Google key', /AIza[\w-]{35}/],
	['AWS key', /AKIA[0-9A-Z]{16}/],
	['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
	['password', /password\s*[:=]/i],
	['Google Sheet ID', /SHEET_ID|docs\.google\.com\/spreadsheets\/d\//],
	['email address', /[\w.+-]+@[\w-]+(\.[\w-]+)*\.[a-z]{2,}/gi]
];

// Every file under the folder, as a path relative to it
function files(dir = root) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			return skipped_folders.includes(entry.name) ? [] : files(path);
		}
		return [relative(root, path)];
	});
}

// Emails published on purpose: the mailto: contacts of config/site.yaml
function public_emails() {
	const settings = join(root, 'config/site.yaml');
	const text = existsSync(settings) ? readFileSync(settings, 'utf8') : '';
	return [...text.matchAll(/mailto:([^'"\s]+)/g)].map((m) => m[1].toLowerCase());
}

// Private words from the file given after --words (lines starting with # are comments)
function private_words() {
	const at = process.argv.indexOf('--words');
	if (at < 0) {
		return [];
	}
	return readFileSync(process.argv[at + 1], 'utf8')
		.split('\n')
		.map((line) => line.trim().toLowerCase())
		.filter((line) => line && !line.startsWith('#'));
}

// Problems found in one text file: [line number, reason]
function text_problems(text, allowed_emails, words) {
	const found = [];
	text.split('\n').forEach((line, i) => {
		for (const [why, pattern] of rules) {
			const matches = line.match(pattern) || [];
			if (why === 'email address' ? matches.some((m) => !allowed_emails.includes(m.toLowerCase())) : matches.length) {
				found.push([i + 1, why]);
			}
		}
		if (words.some((w) => line.toLowerCase().includes(w))) {
			found.push([i + 1, 'private word']);
		}
	});
	return found;
}

const allowed_emails = public_emails();
const words = private_words();
const problems = [];
for (const file of files().filter((f) => f !== this_file)) {
	const bytes = readFileSync(join(root, file));
	if (image.test(file)) {
		// JPEG and PNG keep camera data (EXIF) in a block marked 'Exif' or 'eXIf'
		if (bytes.includes('Exif\0') || bytes.includes('eXIf')) {
			problems.push(`${file}: photo metadata (remove them: they can hold the GPS position)`);
		}
	} else if (!font.test(file)) {
		text_problems(bytes.toString('utf8'), allowed_emails, words).forEach(([line, why]) => problems.push(`${file}:${line}: ${why}`));
	}
}

if (problems.length) {
	console.log(`Private data found, nothing may be published:\n  ${problems.join('\n  ')}`);
	process.exit(1);
}
console.log('check:public: no private data found');
