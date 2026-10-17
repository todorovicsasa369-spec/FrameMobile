// Copies the static web app into www/, which Capacitor bundles into the APK.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'www');
const files = ['index.html', 'style.css', 'app.js', 'sw.js', 'manifest.webmanifest', 'icon.svg'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const f of files) fs.copyFileSync(path.join(root, f), path.join(out, f));
console.log(`copied ${files.length} files to www/`);
