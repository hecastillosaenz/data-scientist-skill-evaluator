CREATE TABLE polizas (
    id INTEGER PRIMARY KEY,
    tipo VARCHAR(10) NOT NULL,
    prima_anual NUMERIC(10,2) NOT NULL
);

INSERT INTO polizas (id, tipo, prima_anual) VALUES
(1, 'auto', 1200.00),
(2, 'auto', 1000.00),
(3, 'auto', 800.00),
(4, 'hogar', 600.00),
(5, 'hogar', 500.00),
(6, 'salud', 2000.00),
(7, 'salud', 1800.00),
(8, 'salud', 2200.00);

CREATE TABLE siniestros (
    id INTEGER PRIMARY KEY,
    poliza_id INTEGER NOT NULL REFERENCES polizas(id),
    monto_pagado NUMERIC(10,2) NOT NULL
);

INSERT INTO siniestros (id, poliza_id, monto_pagado) VALUES
(1, 1, 900.00),
(2, 1, 600.00),
(3, 2, 300.00),
(4, 4, 1500.00),
(5, 6, 1000.00),
(6, 6, 400.00),
(7, 7, 700.00),
(8, 8, 500.00);
