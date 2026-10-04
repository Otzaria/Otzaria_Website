// Complete 1×1 GIF, including palette, image data and trailer.
export const GIF89A = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
export const GIF87A = Buffer.concat([Buffer.from('GIF87a'), GIF89A.subarray(6)]);

// Two frames, each delayed by 100 ms; original compressed image data is reused.
const control = Buffer.from([0x21, 0xf9, 4, 0, 10, 0, 0, 0]);
const frame = GIF89A.subarray(19, -1);
export const ANIMATED_GIF = Buffer.concat([
  GIF89A.subarray(0, 19), control, frame, control, frame, Buffer.from([0x3b]),
]);
