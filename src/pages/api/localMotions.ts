import type { NextApiRequest, NextApiResponse } from 'next';
import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const bundledMotions = ['showFullBody', 'greeting', 'peaceSign', 'shoot', 'spin', 'modelPose', 'squat'];

/** Keep the existing gesture IDs while using the clips shipped with the app.
 * A numbered user override takes priority; Downloads remains a legacy fallback. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); res.status(405).end(); return; }
  const filenames = (index: number) => [
    ...(process.env.AMICA_MOTION_PACK_DIR ? [path.join(process.env.AMICA_MOTION_PACK_DIR, 'vrma', `VRMA_0${index}.vrma`)] : []),
    path.join(process.cwd(), 'public', 'animations', `${bundledMotions[index - 1]}.vrma`),
    path.join(os.homedir(), 'Downloads', 'VRMA_MotionPack', 'vrma', `VRMA_0${index}.vrma`),
  ];
  if (req.query.id === undefined) {
    const available = await Promise.all(Array.from({ length: 7 }, async (_, i) => {
      for (const filename of filenames(i + 1)) {
        try { await fs.access(filename, constants.R_OK); return i + 1; } catch { /* Try the next source. */ }
      }
      return 0;
    }));
    res.status(200).json({ motions: available.filter(Boolean), credit: "Animation credits to pixiv Inc.'s VRoid Project" }); return;
  }
  if (typeof req.query.id !== 'string' || !/^[1-7]$/.test(req.query.id)) { res.status(400).json({ error: 'Unknown motion' }); return; }
  for (const filename of filenames(Number(req.query.id))) {
    try {
      const data = await fs.readFile(filename);
      res.setHeader('Content-Type', 'model/gltf-binary'); res.status(200).send(data); return;
    } catch { /* Try the next source. */ }
  }
  res.status(404).json({ error: 'Gesture file not found. Re-run setup and restart the server.' });
}
