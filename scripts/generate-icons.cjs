// Rebuild the PWA and Capacitor raster artwork from www/icon.svg.
const fs = require('node:fs');
const path = require('node:path');
const { Resvg } = require('@resvg/resvg-js');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'www/icon.svg'), 'utf8');
const background = '<rect width="512" height="512" rx="112" fill="#16302A"/>';
if (source.split(background).length !== 2) throw new Error('Expected one background in www/icon.svg');

// The favicon has rounded corners. Installed/maskable PNGs need a full-bleed
// background; the adaptive Android foreground needs no background at all.
const solid = source.replace(background, '<rect width="512" height="512" fill="#16302A"/>');
const mark = source.replace(background, '');
function render(svg, target, size) {
  const image = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  fs.writeFileSync(path.join(root, target), image.render().asPng());
}

for (const size of [192, 512]) render(solid, `www/icon-${size}.png`, size);
render(solid, 'www/apple-touch-icon.png', 180);
render(solid, 'assets/icon-only.png', 1024);
render(mark, 'assets/icon-foreground.png', 1024);
render('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">' +
  '<rect width="1024" height="1024" fill="#16302A"/></svg>', 'assets/icon-background.png', 1024);

// Use the same checklist on a dark splash screen; no personal branding.
const shapes = mark.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
if (!shapes) throw new Error('Could not read www/icon.svg');
const splash = '<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732">' +
  '<rect width="2732" height="2732" fill="#16302A"/>' +
  '<g transform="translate(956 956) scale(1.6)">' + shapes[1] + '</g></svg>';
for (const name of ['splash.png', 'splash-dark.png']) render(splash, `assets/${name}`, 2732);
