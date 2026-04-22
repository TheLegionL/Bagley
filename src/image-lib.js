let Sharp = null;
let Jimp = null;
const useJimp = !!process.env.FORCE_JIMP;

try {
  if (!useJimp) {
    Sharp = require('sharp');
  }
} catch (err) {
  Sharp = null;
}

if (!Sharp) {
  try {
    Jimp = require('jimp');
  } catch (err) {
    Jimp = null;
  }
} else {
  // still load jimp for fallback operations if present
  try {
    const _j = require('jimp');
    Jimp = _j && _j.default ? _j.default : _j;
  } catch (err) {
    Jimp = null;
  }
}
// if Sharp was null, try loading jimp similarly
if (!Sharp && !Jimp) {
  try {
    const _j = require('jimp');
    Jimp = _j && _j.default ? _j.default : _j;
  } catch (err) {
    Jimp = null;
  }
}

async function resizeBuffer(buffer, width, height, opts = {}) {
  if (Sharp) {
    const fit = opts.fit || 'cover';
    return await Sharp(buffer).resize(width, height, { fit }).toBuffer();
  }
  if (!Jimp) throw new Error('No image backend available (sharp or jimp)');
  const img = await Jimp.read(buffer);
  const fit = (opts.fit || 'cover').toLowerCase();
  if (fit === 'cover') {
    img.cover(width, height);
  } else if (fit === 'contain') {
    img.contain(width, height);
  } else {
    img.resize(width, height);
  }
  return await img.getBufferAsync(Jimp.MIME_PNG);
}

async function compositeCanvas(width, height, background, composites = []) {
  if (Sharp) {
    const canvas = Sharp({ create: { width, height, channels: 3, background } });
    // composites: array of { input: Buffer, top, left }
    return await canvas.composite(composites).png().toBuffer();
  }
  if (!Jimp) throw new Error('No image backend available (sharp or jimp)');
  const bg = background || '#000000';
  let base;
  if (typeof Jimp.create === 'function') {
    base = await Jimp.create(width, height, bg);
  } else {
    // fallback to constructor (some builds expose constructor)
    base = await (typeof Jimp === 'function' ? new Jimp(width, height, bg) : Jimp.read(await (new Jimp(width, height, bg)).getBufferAsync(Jimp.MIME_PNG)));
  }
  for (const c of composites) {
    try {
      const img = await Jimp.read(c.input);
      await base.composite(img, c.left || 0, c.top || 0);
    } catch (err) {
      // ignore single composite failures
    }
  }
  return await base.getBufferAsync(Jimp.MIME_PNG);
}

module.exports = {
  resizeBuffer,
  compositeCanvas,
  hasSharp: !!Sharp,
  hasJimp: !!Jimp
};
