const fs = require('fs');
const path = require('path');
const { resizeBuffer, compositeCanvas, hasJimp, hasSharp } = require('./src/image-lib');

(async () => {
  console.log('hasSharp:', hasSharp, 'hasJimp:', hasJimp);
  const tmp = path.join(__dirname, 'tmp-test.png');
  if (hasJimp) {
    const _j = require('jimp');
    const Jimp = _j && _j.default ? _j.default : _j;
    let img;
    if (typeof Jimp.create === 'function') {
      img = await Jimp.create(256, 256, 0xFF0000FF);
      await img.writeAsync(tmp);
    } else if (typeof Jimp === 'function') {
      img = await new Jimp(256, 256, 0xFF0000FF);
      await img.writeAsync(tmp);
    } else {
      // fallback: create via read from buffer
      const tmpBuf = Buffer.alloc(256 * 256 * 4, 0xFF);
      img = await Jimp.read(tmpBuf);
      await img.writeAsync(tmp);
    }
  } else if (hasSharp) {
    const sharp = require('sharp');
    await sharp({ create: { width: 256, height: 256, channels: 3, background: '#FF0000' } }).png().toFile(tmp);
  } else {
    console.error('No image backend available');
    process.exit(1);
  }
  const buf = fs.readFileSync(tmp);
  const resized = await resizeBuffer(buf, 64, 64, { fit: 'cover' });
  fs.writeFileSync(path.join(__dirname, 'tmp-resized.png'), resized);
  const composite = await compositeCanvas(128, 128, '#0000FF', [{ input: resized, top: 32, left: 32 }]);
  fs.writeFileSync(path.join(__dirname, 'tmp-composite.png'), composite);
  console.log('Wrote tmp-resized.png and tmp-composite.png');
})().catch(err => { console.error(err); process.exit(1); });
