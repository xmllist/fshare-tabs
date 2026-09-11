'use strict';
// electron-builder has no signing identity here, and an unsigned .app is refused
// outright on Apple Silicon. Ad-hoc sign so the bundle at least runs locally.
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  // Skip when a real Developer ID is in play — electron-builder signs it properly
  // and an ad-hoc signature here would only get in the way.
  if (process.env.APPLE_TEAM_ID || process.env.CSC_LINK || process.env.CSC_NAME) {
    console.log('  • skipping ad-hoc signing (real signing identity configured)');
    return;
  }
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  console.log('  • ad-hoc signed  ' + appPath);
};
