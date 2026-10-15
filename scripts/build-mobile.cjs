const { spawnSync } = require('node:child_process')
const { existsSync, mkdirSync, copyFileSync, cpSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const target = process.argv[2]
if (!['android', 'ios'].includes(target)) throw new Error('Usage: node scripts/build-mobile.cjs android|ios')
const artifacts = path.join(root, 'mobile/artifacts')
mkdirSync(artifacts, { recursive: true })
function run(command, args, options = {}) {
    const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options })
    if (result.error) throw result.error
    if (result.status !== 0) process.exit(result.status || 1)
}
run(process.execPath, ['scripts/mobile-assets.cjs'])
run(process.platform === 'win32' ? 'yarn.cmd' : 'yarn', ['build:mobile'])
run(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', target])
if (target === 'android') {
    const studioJava = '/Applications/Android Studio.app/Contents/jbr/Contents/Home'
    const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME || path.join(os.homedir(), process.platform === 'darwin' ? 'Library/Android/sdk' : 'Android/Sdk')
    const java = process.env.JAVA_HOME || (existsSync(studioJava) ? studioJava : undefined)
    run(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', ['assembleDebug'], {
        cwd: path.join(root, 'mobile/android'), env: { ...process.env, ANDROID_HOME: sdk, ...(java ? { JAVA_HOME: java } : {}) },
    })
    copyFileSync(path.join(root, 'mobile/android/app/build/outputs/apk/debug/app-debug.apk'), path.join(artifacts, 'HexoPro-android-debug.apk'))
    console.log('Android APK: mobile/artifacts/HexoPro-android-debug.apk')
} else {
    const derived = path.join(artifacts, 'ios-build')
    run('xcodebuild', ['-project', 'mobile/ios/App/App.xcodeproj', '-scheme', 'App', '-configuration', 'Debug',
        '-sdk', 'iphonesimulator', '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', derived, 'CODE_SIGNING_ALLOWED=NO', 'build'])
    cpSync(path.join(derived, 'Build/Products/Debug-iphonesimulator/App.app'), path.join(artifacts, 'HexoPro-ios-simulator.app'), { recursive: true })
    console.log('iOS simulator app: mobile/artifacts/HexoPro-ios-simulator.app; device distribution requires Xcode signing.')
}
