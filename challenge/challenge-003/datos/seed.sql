CREATE TABLE sedes (
  id INTEGER PRIMARY KEY,
  nombre VARCHAR NOT NULL,
  ciudad VARCHAR NOT NULL
);
INSERT INTO sedes VALUES
  (1, 'Centro', 'Guadalajara'),
  (2, 'Norte', 'Zapopan'),
  (3, 'Sur', 'Tlaquepaque'),
  (4, 'Poniente', 'Zapopan');
CREATE TABLE membresias_mensuales (
  id INTEGER PRIMARY KEY,
  sede_id INTEGER NOT NULL REFERENCES sedes(id),
  mes DATE NOT NULL,
  socios_inicio INTEGER NOT NULL,
  altas INTEGER NOT NULL,
  bajas INTEGER NOT NULL,
  ingresos INTEGER NOT NULL
);
INSERT INTO membresias_mensuales VALUES
  (1, 1, DATE '2026-05-01', 400, 30, 20, 240000),
  (2, 1, DATE '2026-06-01', 410, 25, 22, 246000),
  (3, 1, DATE '2026-07-01', 413, 20, 25, 247800),
  (4, 1, DATE '2026-08-01', 408, 28, 18, 244800),
  (5, 2, DATE '2026-05-01', 250, 20, 30, 112500),
  (6, 2, DATE '2026-06-01', 240, 15, 32, 108000),
  (7, 2, DATE '2026-07-01', 223, 18, 29, 100350),
  (8, 2, DATE '2026-08-01', 212, 22, 27, 95400),
  (9, 3, DATE '2026-05-01', 180, 25, 10, 90000),
  (10, 3, DATE '2026-06-01', 195, 22, 12, 97500),
  (11, 3, DATE '2026-07-01', 205, 20, 11, 102500),
  (12, 3, DATE '2026-08-01', 214, 24, 13, 107000),
  (13, 4, DATE '2026-05-01', 320, 18, 16, 176000),
  (14, 4, DATE '2026-06-01', 322, 20, 17, 177100),
  (15, 4, DATE '2026-07-01', 325, 15, 19, 178750),
  (16, 4, DATE '2026-08-01', 321, 19, 12, 176550);
