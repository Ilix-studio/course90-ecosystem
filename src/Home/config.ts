// Tuning tables: camera journey, captions, chapters, lighting, gravity presets.
export type Vec3 = [number, number, number];
/** [scroll progress, camera position, look-at target] */
export type CameraKey = [progress: number, position: Vec3, lookAt: Vec3];
export type GravId = 'earth' | 'moon' | 'mars';
/* camera journey: [scroll progress, camera position, look-at target] */
export const PC_KEYS: CameraKey[] = [
  [0.00, [-36, 31, 60], [0, 3, -6]],
  [0.09, [-24, 21, 44], [0, 3, -5]],
  [0.17, [-9, 9.5, 26], [0, 2.6, -4]],
  [0.24, [-1.2, 3.2, 11], [0, 1.9, -4]],
  [0.30, [0, 1.7, 3.2], [0, 1.65, -8]],
  [0.345, [0, 1.65, -2.2], [0.6, 1.6, -9]],
  [0.39, [0.15, 1.65, -5.6], [3, 1.65, -7.6]],
  [0.43, [1.4, 1.66, -6.95], [8, 1.7, -7.1]],
  [0.47, [3.4, 1.72, -6.7], [12, 1.8, -7.2]],
  [0.53, [5.3, 1.48, -5.75], [13.9, 1.85, -7.3]],
  [0.58, [5.45, 1.44, -5.3], [13.9, 1.85, -7.35]],
  [0.66, [5.7, 1.45, -5.35], [13.9, 1.88, -7.3]],
  [0.80, [7.3, 1.42, -6.0], [13.9, 1.7, -7.15]],
  [1.00, [8.9, 1.36, -6.3], [13.9, 1.47, -7.05]]
];
export const PC_CAPS: [number, number][] = [[-1, 0.16], [0.22, 0.38], [0.43, 0.58], [0.62, 0.78], [0.84, 2]];
export const PC_GOTO: number[] = [0.0, 0.3, 0.52, 0.7, 1.0];
// Physically-based lighting (r155+): no implicit ×π on hemi/directional, and point lights fall off as 1/d².
// Values are the r149 intensities carried over (×π for hemi/sun; point lights matched at a typical 3–5 m distance).
export const PC_LIGHT = { hemiOut: 0.62 * Math.PI, hemiIn: 0.42 * Math.PI, sun: 2.5 * Math.PI, room: 15, corr: 4.5, board: 6 };
export const PC_GRAVS: [id: GravId, label: string, g: number][] = [['earth', 'Earth', 9.81], ['moon', 'Moon', 1.62], ['mars', 'Mars', 3.71]];
export const PC_CHAPTERS: string[] = ['School', 'Classroom', 'Lesson', 'Understand', 'Visualize'];
