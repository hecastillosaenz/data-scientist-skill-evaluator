import { describe, expect, it } from 'vitest';
import { simulateCodeVerification, simulateConceptEvaluation } from '../../web/src/domain/simulate';

describe('simulaciones de evaluación', () => {
  it('la verificación de código alterna fallo y éxito', () => {
    expect(simulateCodeVerification(2, 0).status).toBe('fallida');
    expect(simulateCodeVerification(2, 1).status).toBe('aprobada');
    expect(simulateCodeVerification(2, 2).status).toBe('fallida');
  });
  it('una respuesta vacía no se evalúa', () => {
    expect(simulateConceptEvaluation('   ')).toBeNull();
  });
  it('respuesta corta → parcial; desarrollada → aprobada', () => {
    expect(simulateConceptEvaluation('Recomiendo lanzar.')?.status).toBe('parcial');
    expect(simulateConceptEvaluation('x'.repeat(150))?.status).toBe('aprobada');
  });
});
