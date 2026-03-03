/**
 * Minimal valid image buffer factories for testing.
 * Each creates the smallest possible valid file header for its format.
 */

/** Minimal valid PNG: 8-byte signature + IHDR chunk + IEND chunk */
export function createMinimalPng(): Buffer {
  return Buffer.from([
    // PNG signature
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    // IHDR chunk (13 bytes data)
    0x00, 0x00, 0x00, 0x0d, // length
    0x49, 0x48, 0x44, 0x52, // "IHDR"
    0x00, 0x00, 0x00, 0x01, // width: 1
    0x00, 0x00, 0x00, 0x01, // height: 1
    0x08, 0x02,             // bit depth: 8, color type: 2 (RGB)
    0x00, 0x00, 0x00,       // compression, filter, interlace
    0x90, 0x77, 0x53, 0xde, // CRC
    // IEND chunk
    0x00, 0x00, 0x00, 0x00, // length: 0
    0x49, 0x45, 0x4e, 0x44, // "IEND"
    0xae, 0x42, 0x60, 0x82, // CRC
  ]);
}

/** Minimal valid JPEG: SOI + APP0 (JFIF) marker */
export function createMinimalJpeg(): Buffer {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, // SOI + APP0 marker
    0x00, 0x10,             // length: 16
    0x4a, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
    0x01, 0x01,             // version 1.1
    0x00,                   // aspect ratio units: none
    0x00, 0x01,             // X density: 1
    0x00, 0x01,             // Y density: 1
    0x00, 0x00,             // thumbnail: 0x0
    0xff, 0xd9,             // EOI
  ]);
}

/** Minimal valid GIF: GIF89a header + minimal content */
export function createMinimalGif(): Buffer {
  return Buffer.from([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // "GIF89a"
    0x01, 0x00, 0x01, 0x00, // 1x1
    0x00, 0x00, 0x00,       // GCT flag, background, aspect
    0x3b,                   // trailer
  ]);
}

/** Creates a buffer of given size filled with valid PNG header + padding */
export function createPngOfSize(sizeInBytes: number): Buffer {
  const header = createMinimalPng();
  if (sizeInBytes <= header.length) {
    return header.subarray(0, sizeInBytes);
  }
  const padding = Buffer.alloc(sizeInBytes - header.length);
  return Buffer.concat([header, padding]);
}

/** Creates a buffer with fake/invalid magic bytes */
export function createFakeImageBuffer(): Buffer {
  return Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
}

/** Creates an executable-like buffer (PE header) */
export function createExeBuffer(): Buffer {
  return Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
}
