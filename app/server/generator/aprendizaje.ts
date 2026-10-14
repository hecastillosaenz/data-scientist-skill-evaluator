import type { Concept } from '../../shared/types';
import { contextoGenerador, focosVigentes, readObjetivos } from '../persistence/objetivos-store';
import type { CalibrationConfig } from './calibration';
import { scanMaterial } from './material';
import type { FocoPlan } from './plan';
import type { GeneratorContext } from './prompts';

/**
 * Lo que los objetivos del usuario aportan al plan y al Generador (SDD R44, R45): los focos vigentes sesgan el plan y su
 * material, recortado, viaja como contexto. Si `objetivos.json` es ilegible, no se inventa nada: se sigue sin focos.
 */
export async function loadLearning(
  repoRoot: string,
  concepts: Concept[],
  config: CalibrationConfig,
  now: Date,
): Promise<{ focos: FocoPlan[]; context: GeneratorContext; /** Carpetas de material que el Generador puede leer (R49). */ materialDirs: string[] }> {
  try {
    const objetivos = await readObjetivos(repoRoot, { conceptIds: new Set(concepts.map((c) => c.id)), focosActivosMax: config.focosActivosMax });
    const vigentes = focosVigentes(objetivos, now);
    const base = contextoGenerador(vigentes, config.materialMaxCaracteres);
    // Una carpeta ausente o ilegible no impide generar: simplemente no aporta material (R50).
    const scans = await Promise.all(vigentes.map((f) => (f.carpeta ? scanMaterial(repoRoot, f.carpeta) : null)));
    const focos: GeneratorContext['focos'] = base.focos.map((f, i) => {
      const scan = scans[i];
      return scan?.dir && scan.files.length > 0 ? { ...f, carpeta: { ruta: scan.carpeta, dir: scan.dir, archivos: scan.files, omitidos: scan.skipped.length } } : f;
    });
    return {
      focos: vigentes.map((f) => ({ id: f.id, titulo: f.titulo, conceptIds: f.conceptIds })),
      context: { focos },
      materialDirs: [...new Set(focos.flatMap((f) => (f.carpeta ? [f.carpeta.dir] : [])))],
    };
  } catch {
    return { focos: [], context: { focos: [] }, materialDirs: [] };
  }
}
