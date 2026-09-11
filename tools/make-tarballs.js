'use strict';
// Packs each built .app into a .tar.gz WITHOUT macOS metadata.
//
// Why: quarantine is an extended attribute added by whatever downloads or receives a
// file (browser, Mail, AirDrop, Archive Utility). A tarball built without xattrs, and
// unpacked with `tar` from Terminal, arrives with no quarantine flag at all — so an
// ad-hoc signed app opens normally, with no xattr command on the target Mac.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const version = require(path.join(root, 'package.json')).version;
const builds = [
  { dir: 'mac', arch: 'x64' },
  { dir: 'mac-arm64', arch: 'arm64' },
];

let made = 0;
for (const { dir, arch } of builds) {
  const outDir = path.join(dist, dir);
  if (!fs.existsSync(outDir)) continue;
  const app = fs.readdirSync(outDir).find((f) => f.endsWith('.app'));
  if (!app) continue;
  const tarball = path.join(dist, `Fshare-Tabs-${version}-${arch}-mac.tar.gz`);
  execFileSync('tar', ['--no-mac-metadata', '--no-xattrs', '-czf', tarball, '-C', outDir, app], {
    stdio: 'inherit',
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  });
  const mb = (fs.statSync(tarball).size / 1048576).toFixed(0);
  console.log(`  • ${path.basename(tarball)}  (${mb} MB, ${arch})`);
  made++;
}
if (!made) console.log('No built .app found in dist/ — run the mac build first.');
