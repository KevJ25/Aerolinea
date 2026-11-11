-- =============================================================================
-- Migración 007 · Sesiones del servidor
-- [S-03] expiración automática tras 30 minutos de inactividad
-- [S-04] invalidación del identificador de sesión al cerrar sesión
-- [S-06] el rol se vuelve a leer de la base en cada petición
--
-- El identificador de sesión es un valor aleatorio de 256 bits que solo
-- conoce el navegador (cookie HttpOnly). La base guarda únicamente su resumen
-- SHA-256: quien copie esta tabla no puede usar las sesiones.
-- =============================================================================

CREATE TABLE sesion (
    id_sesion     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    token_hash    char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    id_usuario    integer NOT NULL REFERENCES usuario (id_usuario) ON DELETE RESTRICT,
    creada_en     timestamptz NOT NULL DEFAULT now(),
    ultimo_uso    timestamptz NOT NULL DEFAULT now(),
    cerrada_en    timestamptz,
    motivo_cierre varchar(20) CHECK (motivo_cierre IN ('CIERRE', 'INACTIVIDAD', 'BAJA'))
);

CREATE INDEX sesion_usuario_ix ON sesion (id_usuario) WHERE cerrada_en IS NULL;

-- Inicia una sesión para un usuario que ya se autenticó. Devuelve el token
-- en claro, que el backend entrega en la cookie y no conserva.
CREATE FUNCTION crear_sesion(p_id_usuario integer) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
    c_bytes_token constant integer := 32;
    v_token text := encode(gen_random_bytes(c_bytes_token), 'hex');
BEGIN
    IF NOT EXISTS (SELECT 1 FROM usuario WHERE id_usuario = p_id_usuario AND activo
                   AND coalesce(bloqueado_hasta <= now(), true)) THEN
        RAISE EXCEPTION 'La cuenta % no puede iniciar sesión', p_id_usuario USING ERRCODE = 'SGA04';
    END IF;
    INSERT INTO sesion (token_hash, id_usuario)
    VALUES (encode(digest(v_token, 'sha256'), 'hex'), p_id_usuario);
    RETURN v_token;
END;
$$;

-- Valida el token de una petición. Si es válido renueva el plazo de
-- inactividad y devuelve el usuario con su rol ACTUAL. Si la sesión venció,
-- la cierra. Devuelve cero filas cuando la sesión no es válida.
CREATE FUNCTION validar_sesion(p_token text)
RETURNS TABLE (id_usuario integer, nombre varchar, correo varchar, nombre_rol varchar)
LANGUAGE plpgsql AS $$
DECLARE
    c_inactividad constant interval := interval '30 minutes';
    v_sesion sesion%ROWTYPE;
BEGIN
    IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
        RETURN;
    END IF;

    SELECT * INTO v_sesion FROM sesion
    WHERE token_hash = encode(digest(p_token, 'sha256'), 'hex') AND cerrada_en IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF v_sesion.ultimo_uso < now() - c_inactividad THEN
        UPDATE sesion SET cerrada_en = now(), motivo_cierre = 'INACTIVIDAD'
        WHERE sesion.id_sesion = v_sesion.id_sesion;
        RETURN;
    END IF;

    -- Una baja o un bloqueo posteriores al inicio de sesión la invalidan
    IF NOT EXISTS (SELECT 1 FROM usuario u WHERE u.id_usuario = v_sesion.id_usuario AND u.activo
                   AND coalesce(u.bloqueado_hasta <= now(), true)) THEN
        UPDATE sesion SET cerrada_en = now(), motivo_cierre = 'BAJA'
        WHERE sesion.id_sesion = v_sesion.id_sesion;
        RETURN;
    END IF;

    UPDATE sesion SET ultimo_uso = now() WHERE sesion.id_sesion = v_sesion.id_sesion;

    RETURN QUERY
    SELECT u.id_usuario, u.nombre, u.correo, r.nombre_rol
    FROM usuario u JOIN rol r USING (id_rol)
    WHERE u.id_usuario = v_sesion.id_usuario;
END;
$$;

-- [S-04] Cierra la sesión: el token deja de ser válido aunque el navegador lo conserve
CREATE FUNCTION cerrar_sesion(p_token text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE sesion SET cerrada_en = now(), motivo_cierre = 'CIERRE'
    WHERE token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') AND cerrada_en IS NULL;
END;
$$;

-- Privilegios: la tabla solo se toca mediante estas funciones (S-07, S-09)
GRANT SELECT, INSERT ON sesion TO sga_operaciones;
GRANT UPDATE (ultimo_uso, cerrada_en, motivo_cierre) ON sesion TO sga_operaciones;
GRANT SELECT (id_usuario, activo, bloqueado_hasta, nombre, correo, id_rol) ON usuario TO sga_operaciones;
GRANT EXECUTE ON FUNCTION digest(text, text) TO sga_operaciones;

DO $$
DECLARE
    v_funcion regprocedure;
BEGIN
    FOREACH v_funcion IN ARRAY ARRAY[
        'crear_sesion(integer)', 'validar_sesion(text)', 'cerrar_sesion(text)'
    ]::regprocedure[] LOOP
        EXECUTE format('ALTER FUNCTION %s OWNER TO sga_operaciones', v_funcion);
        EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = public, pg_temp', v_funcion);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_funcion);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO sga_aplicacion', v_funcion);
    END LOOP;
END;
$$;

-- AUD-08 ya cubre la escritura directa de administradores; el borrado de
-- sesiones se audita igual que el de las demás tablas (AUD-06)
GRANT DELETE, TRUNCATE ON sesion TO sga_auditor;
CREATE TRIGGER sesion_sin_borrado BEFORE DELETE ON sesion FOR EACH ROW EXECUTE FUNCTION impedir_borrado_fisico();
