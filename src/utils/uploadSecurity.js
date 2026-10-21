export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateSelectedImage(asset) {
  if (!asset?.uri) throw new Error('Please select a valid photo.');
  if (asset.mimeType && !TYPES.has(String(asset.mimeType).toLowerCase())) {
    throw new Error('Please choose a JPEG, PNG or WebP photo.');
  }
  if (Number(asset.fileSize) > MAX_IMAGE_BYTES) throw new Error('Please choose a photo smaller than 5 MB.');
}

// Check actual bytes, not just an extension or the picker's MIME label.
export function validateImageBytes(buffer) {
  if (!buffer?.byteLength || buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('Please choose a valid photo smaller than 5 MB.');
  }
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    return { fileExt: 'jpg', contentType: 'image/jpeg' };
  }
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) {
    return { fileExt: 'png', contentType: 'image/png' };
  }
  if (bytes.length >= 12 && [82, 73, 70, 70].every((v, i) => bytes[i] === v) && [87, 69, 66, 80].every((v, i) => bytes[i + 8] === v)) {
    return { fileExt: 'webp', contentType: 'image/webp' };
  }
  throw new Error('Please choose a JPEG, PNG or WebP photo.');
}
