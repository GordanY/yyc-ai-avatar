import type { NextApiRequest, NextApiResponse } from 'next';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/** Read the user's installed pack in place; never copy licensed motions into
 * public assets or the distributable avatar package. Only these seven files. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); res.status(405).end(); return; }
  const directory = process.env.AMICA_MOTION_PACK_DIR || path.join(os.homedir(), 'Downloads', 'VRMA_MotionPack');
  const filename = (index: number) => path.join(directory, 'vrma', `VRMA_0${index}.vrma`);
  if (req.query.id === undefined) {
    const available = await Promise.all(Array.from({ length: 7 }, async (_, i) => fs.access(filename(i + 1)).then(() => i + 1).catch(() => 0)));
    res.status(200).json({ motions: available.filter(Boolean), credit: "Animation credits to pixiv Inc.'s VRoid Project" }); return;
  }
  if (typeof req.query.id !== 'string' || !/^[1-7]$/.test(req.query.id)) { res.status(400).json({ error: 'Unknown motion' }); return; }
  try {
    const data = await fs.readFile(filename(Number(req.query.id)));
    res.setHeader('Content-Type', 'model/gltf-binary'); res.status(200).send(data);
  } catch { res.status(404).json({ error: 'Local motion pack not found' }); }
}
