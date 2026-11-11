-- =============================================================================
-- Sistema de Gestión de Aerolínea · Esquema inicial
-- Migración 001 · Derivada del Manual de Calidad MC-SGA-001 v2.1
--   Sección 13.6 (diccionario de datos), 13.9 (reglas de negocio RN-xx)
--   y 19.2 (reglas de validación V-xx).
-- El ejecutor db/migrar.sh aplica cada archivo en una sola transacción.
-- Convenciones (sección 14.1): tablas en singular y minúsculas; columnas en
-- snake_case. Cada restricción indica entre corchetes la regla que implementa.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Funciones auxiliares
-- -----------------------------------------------------------------------------

-- [V-12] No se permite el borrado físico de registros con dependencias: las
-- tablas principales solo admiten baja lógica.
CREATE FUNCTION impedir_borrado_fisico() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'V-12: no se permite el borrado físico en la tabla %, use baja lógica', TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END;
$$;

-- -----------------------------------------------------------------------------
-- M-01 Usuarios
-- -----------------------------------------------------------------------------

CREATE TABLE rol (
    id_rol      smallint PRIMARY KEY,
    nombre_rol  varchar(30) NOT NULL UNIQUE
        CHECK (nombre_rol IN ('Administrador', 'Empleado', 'Pasajero'))
);

INSERT INTO rol (id_rol, nombre_rol) VALUES
    (1, 'Administrador'),
    (2, 'Empleado'),
    (3, 'Pasajero');

CREATE TABLE usuario (
    id_usuario         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre             varchar(120) NOT NULL CHECK (length(trim(nombre)) > 0),
    -- [V-01] correo único y con formato válido
    correo             varchar(120) NOT NULL
        CHECK (correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    -- [V-02][RNF-03][S-01] nunca en texto claro: solo se acepta un resumen
    -- Argon2id, que incluye su sal única por usuario.
    contrasena_hash    varchar(255) NOT NULL
        CHECK (contrasena_hash LIKE '$argon2id$%'),
    -- [RN-07] un usuario posee exactamente un rol
    id_rol             smallint NOT NULL REFERENCES rol (id_rol) ON DELETE RESTRICT,
    -- [RF-02][S-02] bloqueo de 24 h tras cinco intentos fallidos consecutivos
    intentos_fallidos  smallint NOT NULL DEFAULT 0 CHECK (intentos_fallidos BETWEEN 0 AND 5),
    bloqueado_hasta    timestamptz,
    -- [V-12] baja lógica
    activo             boolean NOT NULL DEFAULT true,
    fecha_alta         timestamptz NOT NULL DEFAULT now(),
    fecha_baja         timestamptz,
    CHECK ((activo AND fecha_baja IS NULL) OR (NOT activo AND fecha_baja IS NOT NULL))
);

-- [V-01] la unicidad del correo no distingue mayúsculas de minúsculas
CREATE UNIQUE INDEX usuario_correo_uq ON usuario (lower(correo));

-- -----------------------------------------------------------------------------
-- M-02 Aeropuertos y rutas
-- -----------------------------------------------------------------------------

CREATE TABLE aeropuerto (
    id_aeropuerto  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- [V-03][RF-04] tres letras mayúsculas, único
    codigo_iata    char(3) NOT NULL UNIQUE CHECK (codigo_iata ~ '^[A-Z]{3}$'),
    nombre         varchar(120) NOT NULL,
    ciudad         varchar(80) NOT NULL,
    pais           varchar(80) NOT NULL,
    activo         boolean NOT NULL DEFAULT true
);

CREATE TABLE ruta (
    id_ruta             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_aeropuerto_origen   integer NOT NULL REFERENCES aeropuerto (id_aeropuerto) ON DELETE RESTRICT,
    id_aeropuerto_destino  integer NOT NULL REFERENCES aeropuerto (id_aeropuerto) ON DELETE RESTRICT,
    activo              boolean NOT NULL DEFAULT true,
    -- [V-07][RN-05] una ruta conecta exactamente dos aeropuertos distintos
    CHECK (id_aeropuerto_origen <> id_aeropuerto_destino),
    UNIQUE (id_aeropuerto_origen, id_aeropuerto_destino)
);

-- -----------------------------------------------------------------------------
-- M-03 Aviones
-- -----------------------------------------------------------------------------

CREATE TABLE avion (
    id_avion         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- [V-04][RF-05] matrícula única
    matricula        varchar(10) NOT NULL UNIQUE CHECK (length(trim(matricula)) > 0),
    modelo           varchar(60) NOT NULL,
    -- [V-05] capacidad mayor que cero
    capacidad        integer NOT NULL CHECK (capacidad > 0),
    estado_operativo varchar(20) NOT NULL DEFAULT 'DISPONIBLE'
        CHECK (estado_operativo IN ('DISPONIBLE', 'MANTENIMIENTO', 'FUERA_DE_SERVICIO')),
    activo           boolean NOT NULL DEFAULT true
);

-- -----------------------------------------------------------------------------
-- M-04 Vuelos
-- -----------------------------------------------------------------------------

CREATE TABLE vuelo (
    id_vuelo       integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero_vuelo   varchar(10) NOT NULL,
    id_ruta        integer NOT NULL REFERENCES ruta (id_ruta) ON DELETE RESTRICT,
    id_avion       integer NOT NULL REFERENCES avion (id_avion) ON DELETE RESTRICT,
    fecha_salida   timestamptz NOT NULL,
    fecha_llegada  timestamptz NOT NULL,
    tarifa         numeric(10, 2) NOT NULL CHECK (tarifa > 0),
    -- Dominio cerrado del diccionario de datos (sección 13.6)
    estado_vuelo   varchar(20) NOT NULL DEFAULT 'PROGRAMADO'
        CHECK (estado_vuelo IN ('PROGRAMADO', 'ABIERTO', 'EN VUELO', 'ATERRIZADO', 'RETRASADO', 'CANCELADO')),
    -- [V-06][RN-06] la llegada es posterior a la salida
    CHECK (fecha_llegada > fecha_salida),
    UNIQUE (numero_vuelo, fecha_salida)
);

-- [R-10] índices sobre las columnas de búsqueda frecuente (RF-07)
CREATE INDEX vuelo_busqueda_ix ON vuelo (id_ruta, fecha_salida);

-- -----------------------------------------------------------------------------
-- M-05 Asientos
-- -----------------------------------------------------------------------------
-- Decisión de modelado: el asiento pertenece al vuelo, porque RF-08 y RF-09
-- hablan de los asientos y la disponibilidad "de un vuelo". La regla V-08
-- (número único dentro de la aeronave) se aplica como número único por vuelo,
-- que es equivalente porque cada vuelo usa una sola aeronave.

CREATE TABLE asiento (
    id_asiento  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_vuelo    integer NOT NULL REFERENCES vuelo (id_vuelo) ON DELETE RESTRICT,
    -- Designación del asiento, por ejemplo 12A
    numero      varchar(5) NOT NULL CHECK (numero ~ '^[1-9][0-9]{0,3}[A-F]$'),
    -- [V-08] número único dentro del vuelo
    UNIQUE (id_vuelo, numero)
);

-- [RF-08][RN-04] genera automáticamente tantos asientos como la capacidad de
-- la aeronave, seis por fila (A a F).
CREATE FUNCTION generar_asientos() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_capacidad integer;
BEGIN
    SELECT capacidad INTO v_capacidad FROM avion WHERE id_avion = NEW.id_avion;

    INSERT INTO asiento (id_vuelo, numero)
    SELECT NEW.id_vuelo,
           ((n - 1) / 6 + 1)::text || substr('ABCDEF', ((n - 1) % 6) + 1, 1)
    FROM generate_series(1, v_capacidad) AS n;

    RETURN NEW;
END;
$$;

CREATE TRIGGER vuelo_generar_asientos
    AFTER INSERT ON vuelo
    FOR EACH ROW EXECUTE FUNCTION generar_asientos();

-- -----------------------------------------------------------------------------
-- M-06 Reservaciones
-- -----------------------------------------------------------------------------

CREATE TABLE reservacion (
    id_reservacion    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- [RF-10] código de reserva único de 8 caracteres alfanuméricos
    codigo_reserva    char(8) NOT NULL UNIQUE CHECK (codigo_reserva ~ '^[A-Z0-9]{8}$'),
    id_usuario        integer NOT NULL REFERENCES usuario (id_usuario) ON DELETE RESTRICT,
    id_asiento        integer NOT NULL REFERENCES asiento (id_asiento) ON DELETE RESTRICT,
    -- [V-10] dominio cerrado del estado
    estado            varchar(20) NOT NULL DEFAULT 'CONFIRMADA'
        CHECK (estado IN ('PENDIENTE', 'CONFIRMADA', 'PAGADA', 'ABORDADA', 'CANCELADA', 'EXPIRADA')),
    fecha_creacion    timestamptz NOT NULL DEFAULT now(),
    -- [RN-11] la calcula el disparador reservacion_calcular_expiracion
    fecha_expiracion  timestamptz NOT NULL
);

-- [V-09][RN-01][RF-11][R-01] un asiento no puede tener dos reservaciones
-- activas. Este índice es la garantía final ante solicitudes concurrentes: si
-- dos transacciones intentan reservar el mismo asiento, la segunda falla con
-- unique_violation aunque la aplicación omita el bloqueo pesimista (RNF-07).
CREATE UNIQUE INDEX reservacion_asiento_activo_uq
    ON reservacion (id_asiento)
    WHERE estado IN ('PENDIENTE', 'CONFIRMADA', 'PAGADA', 'ABORDADA');

CREATE INDEX reservacion_usuario_ix ON reservacion (id_usuario);

-- [RN-11] una reservación sin pago expira a las 48 h de su creación o 24 h
-- antes de la salida del vuelo, lo que ocurra primero.
CREATE FUNCTION calcular_expiracion() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_salida timestamptz;
BEGIN
    SELECT v.fecha_salida INTO v_salida
    FROM asiento a JOIN vuelo v ON v.id_vuelo = a.id_vuelo
    WHERE a.id_asiento = NEW.id_asiento;

    NEW.fecha_expiracion := LEAST(NEW.fecha_creacion + interval '48 hours',
                                  v_salida - interval '24 hours');
    RETURN NEW;
END;
$$;

CREATE TRIGGER reservacion_calcular_expiracion
    BEFORE INSERT ON reservacion
    FOR EACH ROW EXECUTE FUNCTION calcular_expiracion();

-- -----------------------------------------------------------------------------
-- M-07 Pagos (modalidad simulada)
-- -----------------------------------------------------------------------------
-- Diseño preventivo PCI-DSS: no se almacena ningún dato de tarjeta. Solo se
-- registra el método de prueba utilizado.

CREATE TABLE pago (
    id_pago         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_reservacion  integer NOT NULL REFERENCES reservacion (id_reservacion) ON DELETE RESTRICT,
    -- [V-11][RN-08] mayor que cero; la igualdad con la tarifa la valida el
    -- servidor y la confirma el disparador pago_validar_monto.
    monto           numeric(10, 2) NOT NULL CHECK (monto > 0),
    metodo_prueba   varchar(30) NOT NULL
        CHECK (metodo_prueba IN ('TARJETA_PRUEBA_APROBADA', 'TARJETA_PRUEBA_RECHAZADA')),
    estado          varchar(20) NOT NULL DEFAULT 'PENDIENTE'
        CHECK (estado IN ('PENDIENTE', 'APROBADO', 'RECHAZADO')),
    fecha_registro  timestamptz NOT NULL DEFAULT now()
);

-- Un pago APROBADO por reservación como máximo
CREATE UNIQUE INDEX pago_aprobado_uq ON pago (id_reservacion) WHERE estado = 'APROBADO';

-- [V-11][RN-08] segunda línea de defensa: un pago APROBADO debe coincidir
-- exactamente con la tarifa del vuelo.
CREATE FUNCTION validar_monto_pago() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_tarifa numeric(10, 2);
BEGIN
    IF NEW.estado = 'APROBADO' THEN
        SELECT v.tarifa INTO v_tarifa
        FROM reservacion r
        JOIN asiento a ON a.id_asiento = r.id_asiento
        JOIN vuelo v   ON v.id_vuelo = a.id_vuelo
        WHERE r.id_reservacion = NEW.id_reservacion;

        IF NEW.monto <> v_tarifa THEN
            RAISE EXCEPTION 'V-11: el monto % no coincide con la tarifa %', NEW.monto, v_tarifa
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER pago_validar_monto
    BEFORE INSERT OR UPDATE ON pago
    FOR EACH ROW EXECUTE FUNCTION validar_monto_pago();

-- -----------------------------------------------------------------------------
-- M-08 Check-in
-- -----------------------------------------------------------------------------

CREATE TABLE check_in (
    id_check_in       integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_reservacion    integer NOT NULL UNIQUE REFERENCES reservacion (id_reservacion) ON DELETE RESTRICT,
    -- [RF-15] número de pase de abordar único de 12 caracteres
    num_pase_abordar  char(12) NOT NULL UNIQUE CHECK (num_pase_abordar ~ '^[A-Z0-9]{12}$'),
    id_empleado       integer NOT NULL REFERENCES usuario (id_usuario) ON DELETE RESTRICT,
    fecha_check_in    timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Transiciones de estado protegidas por la base de datos
-- -----------------------------------------------------------------------------

-- [RN-02][R-04] una reservación no pasa a PAGADA sin un pago APROBADO.
-- [RN-03] y no pasa a ABORDADA sin estar PAGADA y tener check-in.
CREATE FUNCTION validar_transicion_reservacion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.estado = 'PAGADA' AND OLD.estado <> 'PAGADA' THEN
        IF NOT EXISTS (SELECT 1 FROM pago
                       WHERE id_reservacion = NEW.id_reservacion AND estado = 'APROBADO') THEN
            RAISE EXCEPTION 'RN-02: la reservación % no tiene un pago APROBADO', NEW.codigo_reserva
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW.estado = 'ABORDADA' AND OLD.estado <> 'ABORDADA' THEN
        IF OLD.estado <> 'PAGADA' THEN
            RAISE EXCEPTION 'RN-03: solo una reservación PAGADA puede pasar a ABORDADA (estado actual: %)', OLD.estado
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER reservacion_validar_transicion
    BEFORE UPDATE OF estado ON reservacion
    FOR EACH ROW EXECUTE FUNCTION validar_transicion_reservacion();

-- [RN-03][RF-15] el check-in solo procede sobre reservaciones PAGADAS.
CREATE FUNCTION validar_check_in() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_estado varchar(20);
BEGIN
    SELECT estado INTO v_estado FROM reservacion
    WHERE id_reservacion = NEW.id_reservacion
    FOR UPDATE;

    IF v_estado <> 'PAGADA' THEN
        RAISE EXCEPTION 'RN-03: el check-in requiere una reservación PAGADA (estado actual: %)', v_estado
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER check_in_validar
    BEFORE INSERT ON check_in
    FOR EACH ROW EXECUTE FUNCTION validar_check_in();

-- [RN-09] la cancelación de un vuelo propaga el cambio a sus reservaciones.
CREATE FUNCTION propagar_cancelacion_vuelo() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.estado_vuelo = 'CANCELADO' AND OLD.estado_vuelo <> 'CANCELADO' THEN
        UPDATE reservacion r
        SET estado = 'CANCELADA'
        FROM asiento a
        WHERE a.id_asiento = r.id_asiento
          AND a.id_vuelo = NEW.id_vuelo
          AND r.estado IN ('PENDIENTE', 'CONFIRMADA', 'PAGADA');
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER vuelo_propagar_cancelacion
    AFTER UPDATE OF estado_vuelo ON vuelo
    FOR EACH ROW EXECUTE FUNCTION propagar_cancelacion_vuelo();

-- -----------------------------------------------------------------------------
-- Transversal: bitácora
-- -----------------------------------------------------------------------------

-- [RF-17][RN-10][S-12] toda operación de alta, modificación, baja y acceso.
CREATE TABLE bitacora (
    id_bitacora  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_usuario   integer REFERENCES usuario (id_usuario) ON DELETE RESTRICT,
    fecha_hora   timestamptz NOT NULL DEFAULT now(),
    accion       varchar(20) NOT NULL
        CHECK (accion IN ('ALTA', 'MODIFICACION', 'BAJA', 'ACCESO', 'ERROR')),
    modulo       varchar(30) NOT NULL,
    detalle      varchar(500) NOT NULL
);

CREATE INDEX bitacora_fecha_ix ON bitacora (fecha_hora DESC);

-- [S-12] la bitácora es de solo inserción: no se modifica ni se borra.
CREATE FUNCTION impedir_cambio_bitacora() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'S-12: la bitácora no admite modificaciones ni borrados'
        USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER bitacora_solo_insercion
    BEFORE UPDATE OR DELETE ON bitacora
    FOR EACH ROW EXECUTE FUNCTION impedir_cambio_bitacora();

-- -----------------------------------------------------------------------------
-- [V-12] baja lógica obligatoria en las tablas principales
-- -----------------------------------------------------------------------------

CREATE TRIGGER usuario_sin_borrado     BEFORE DELETE ON usuario     FOR EACH ROW EXECUTE FUNCTION impedir_borrado_fisico();
CREATE TRIGGER aeropuerto_sin_borrado  BEFORE DELETE ON aeropuerto  FOR EACH ROW EXECUTE FUNCTION impedir_borrado_fisico();
CREATE TRIGGER ruta_sin_borrado        BEFORE DELETE ON ruta        FOR EACH ROW EXECUTE FUNCTION impedir_borrado_fisico();
CREATE TRIGGER avion_sin_borrado       BEFORE DELETE ON avion       FOR EACH ROW EXECUTE FUNCTION impedir_borrado_fisico();
CREATE TRIGGER vuelo_sin_borrado       BEFORE DELETE ON vuelo       FOR EACH ROW EXECUTE FUNCTION impedir_borrado_fisico();
CREATE TRIGGER reservacion_sin_borrado BEFORE DELETE ON reservacion FOR EACH ROW EXECUTE FUNCTION impedir_borrado_fisico();
CREATE TRIGGER pago_sin_borrado        BEFORE DELETE ON pago        FOR EACH ROW EXECUTE FUNCTION impedir_borrado_fisico();

-- -----------------------------------------------------------------------------
-- [RF-09] disponibilidad derivada: el estado del asiento no se almacena, se
-- calcula, para que no pueda contradecir a las reservaciones.
-- -----------------------------------------------------------------------------

CREATE VIEW disponibilidad_asiento AS
SELECT a.id_asiento,
       a.id_vuelo,
       a.numero,
       CASE
           WHEN r.estado = 'ABORDADA' THEN 'OCUPADO'
           WHEN r.estado IN ('PENDIENTE', 'CONFIRMADA', 'PAGADA') THEN 'RESERVADO'
           ELSE 'LIBRE'
       END AS estado_asiento
FROM asiento a
LEFT JOIN reservacion r
       ON r.id_asiento = a.id_asiento
      AND r.estado IN ('PENDIENTE', 'CONFIRMADA', 'PAGADA', 'ABORDADA');

