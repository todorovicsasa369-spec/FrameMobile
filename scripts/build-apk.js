// Runs the Gradle wrapper for the debug APK; works no matter which shell npm uses.
const { execFileSync } = require('child_process');
const path = require('path');

const dir = path.join(__dirname, '..', 'android');
if (process.platform === 'win32') {
  execFileSync('cmd.exe', ['/d', '/c', path.join(dir, 'gradlew.bat'), 'assembleDebug'], { cwd: dir, stdio: 'inherit' });
} else {
  execFileSync(path.join(dir, 'gradlew'), ['assembleDebug'], { cwd: dir, stdio: 'inherit' });
}
console.log('APK: ' + path.join(dir, 'app/build/outputs/apk/debug/app-debug.apk'));
