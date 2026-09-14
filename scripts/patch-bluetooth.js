/**
 * Replaces patch-package for @brooons/react-native-bluetooth-escpos-printer.
 * Updates build.gradle to use modern Android SDK versions and AndroidX.
 * Runs automatically via postinstall.
 */
const fs = require('fs');
const path = require('path');

const buildGradlePath = path.join(
  __dirname,
  '../node_modules/@brooons/react-native-bluetooth-escpos-printer/android/build.gradle'
);

if (!fs.existsSync(buildGradlePath)) {
  console.log('⚠  @brooons/react-native-bluetooth-escpos-printer not found, skipping patch.');
  process.exit(0);
}

let content = fs.readFileSync(buildGradlePath, 'utf8');

const replacements = [
  ['compileSdkVersion 28',                                                         'compileSdkVersion 34'],
  ['buildToolsVersion "28.0.3"',                                                   'buildToolsVersion "34.0.0"'],
  ['minSdkVersion 16',                                                             'minSdkVersion 21'],
  ['targetSdkVersion 24',                                                          'targetSdkVersion 34'],
  ["implementation group: 'com.android.support', name: 'support-v4', version: '27.0.0'",
   "implementation 'androidx.legacy:legacy-support-v4:1.0.0'"],
];

let changed = false;
for (const [from, to] of replacements) {
  if (content.includes(from)) {
    content = content.replace(from, to);
    changed = true;
  }
}

if (changed) {
  fs.writeFileSync(buildGradlePath, content, 'utf8');
  console.log('✓ Patched @brooons/react-native-bluetooth-escpos-printer/android/build.gradle');
} else {
  console.log('✓ @brooons/react-native-bluetooth-escpos-printer already patched, nothing to do.');
}
