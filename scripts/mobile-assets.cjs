const { readFileSync, writeFileSync, readdirSync } = require('node:fs')
const path = require('node:path')
const { Resvg } = require('@resvg/resvg-js')

const root = path.resolve(__dirname, '..')
const logo = readFileSync(path.join(root, 'client/src/assets/logo3.svg'), 'utf8')
function render(file, width, height, size, transparent = false) {
    const nested = logo.replace(/<svg[^>]*>/, `<svg x="${(width - size) / 2}" y="${(height - size) / 2}" width="${size}" height="${size}" viewBox="120 120 230 250">`)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${transparent ? '' : '<rect width="100%" height="100%" fill="#faf9f6"/>'}${nested}</svg>`
    writeFileSync(path.join(root, file), new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng())
}
render('mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024, 1024, 640)
for (const file of readdirSync(path.join(root, 'mobile/ios/App/App/Assets.xcassets/Splash.imageset')).filter(file => file.endsWith('.png'))) {
    render(`mobile/ios/App/App/Assets.xcassets/Splash.imageset/${file}`, 2732, 2732, 240)
}
for (const [density, size] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
    for (const name of ['ic_launcher', 'ic_launcher_round']) render(`mobile/android/app/src/main/res/mipmap-${density}/${name}.png`, size, size, size * 0.64)
    const foreground = size * 108 / 48
    render(`mobile/android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`, foreground, foreground, foreground * 0.44, true)
}
for (const folder of readdirSync(path.join(root, 'mobile/android/app/src/main/res')).filter(folder => folder.startsWith('drawable'))) {
    if (folder === 'drawable-v24') continue
    const file = `mobile/android/app/src/main/res/${folder}/splash.png`
    const png = readFileSync(path.join(root, file))
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20)
    render(file, width, height, Math.min(width, height) * 0.18)
}
console.log('Generated mobile icons and launch screens from the Hexo Pro logo.')
