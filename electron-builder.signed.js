'use strict';
/**
 * Build config for a properly signed + notarized macOS release.
 *
 *   export APPLE_TEAM_ID=XXXXXXXXXX
 *   export APPLE_ID=you@example.com
 *   export APPLE_APP_SPECIFIC_PASSWORD=abcd-efgh-ijkl-mnop   # appleid.apple.com
 *   npm run dist:mac:signed
 *
 * Requires a "Developer ID Application" certificate in your login keychain
 * (Apple Developer Program, 99 USD/year). Produces a DMG that opens anywhere
 * with no warning and no xattr command.
 */
const base = require('./package.json').build;

if (!process.env.APPLE_TEAM_ID) {
  throw new Error('APPLE_TEAM_ID is not set — see the header of electron-builder.signed.js');
}

module.exports = {
  ...base,
  mac: {
    ...base.mac,
    hardenedRuntime: true,          // required for notarization
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    notarize: { teamId: process.env.APPLE_TEAM_ID },
  },
};
