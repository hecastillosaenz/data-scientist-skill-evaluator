import path from 'node:path';
import type { Concept } from '../../shared/types';
import { conceptosDelFoco, contextoGenerador, focosVigentes, readObjetivos } from '../persistence/objetivos-store';
import type { CalibrationConfig } from './calibration';
import { MATERIAL_DIR, scanMaterial } from './material';
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
  /** Challenge pedido para un objetivo (R58): solo ese objetivo (aunque esté en pausa) orienta el plan y el contexto. */
  only?: { focoId?: string },
): Promise<{ focos: FocoPlan[]; context: GeneratorContext; /** Carpetas de material que el Generador puede leer (R49). */ materialDirs: string[] }> {
  // La biblioteca estándar `material/` aplica a todo reto, con o sin focos; si falta o está vacía, se sigue sin ella (R50).
  const lib = await scanMaterial(repoRoot, MATERIAL_DIR);
  const biblioteca: GeneratorContext['biblioteca'] =
    lib.dir && lib.files.length > 0 ? { ruta: lib.carpeta, dir: lib.dir, archivos: lib.files, omitidos: lib.skipped.length } : undefined;
  const libDirs = biblioteca ? [biblioteca.dir] : [];
  try {
    const objetivos = await readObjetivos(repoRoot, { conceptIds: new Set(concepts.map((c) => c.id)), focosActivosMax: config.focosActivosMax });
    const vigentes = only?.focoId ? objetivos.focos.filter((f) => f.id === only.focoId && f.estado !== 'logrado') : focosVigentes(objetivos, now);
    const base = contextoGenerador(vigentes, config.materialMaxCaracteres);
    // Una carpeta ausente o ilegible no impide generar: simplemente no aporta material (R50).
    const scans = await Promise.all(vigentes.map((f) => (f.carpeta ? scanMaterial(repoRoot, f.carpeta) : null)));
    const focos: GeneratorContext['focos'] = base.focos.map((f, i) => {
      const scan = scans[i];
      return scan?.dir && scan.files.length > 0 ? { ...f, carpeta: { ruta: scan.carpeta, dir: scan.dir, archivos: scan.files, omitidos: scan.skipped.length } } : f;
    });
    return {
      focos: vigentes.map((f) => ({ id: f.id, titulo: f.titulo, conceptIds: only?.focoId && f.plan ? f.plan.pasos.map((p) => p.conceptId) : conceptosDelFoco(f), dirige: only?.focoId ? !!f.plan : f.plan?.estado === 'aceptado' })),
      context: { focos, ...(biblioteca ? { biblioteca } : {}) },
      // Un foco dentro de `material/` ya queda cubierto por la biblioteca: no se agrega dos veces.
      materialDirs: [...new Set([...libDirs, ...focos.flatMap((f) => (f.carpeta && !libDirs.some((d) => f.carpeta!.dir.startsWith(`${d}${path.sep}`)) ? [f.carpeta.dir] : []))])],
    };
  } catch {
    return { focos: [], context: { focos: [], ...(biblioteca ? { biblioteca } : {}) }, materialDirs: libDirs };
  }
}
