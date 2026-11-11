-- Funciones auxiliares de prueba. Se crean dentro de la transacción de cada
-- archivo de pruebas y desaparecen con su ROLLBACK final.
CREATE SCHEMA prueba;
GRANT USAGE ON SCHEMA prueba TO sga_aplicacion, sga_reportes, sga_auditor;

-- Ejecuta p_sql con el rol actual y exige que falle con el SQLSTATE indicado
CREATE FUNCTION prueba.debe_fallar(p_regla text, p_sqlstate text, p_sql text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_estado text;
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE;
        IF v_estado = p_sqlstate THEN
            RAISE NOTICE 'OK   %  (% %)', p_regla, v_estado, SQLERRM;
            RETURN;
        END IF;
        RAISE EXCEPTION 'FALLA %: se esperaba % y se obtuvo %: %', p_regla, p_sqlstate, v_estado, SQLERRM;
    END;
    RAISE EXCEPTION 'FALLA %: la sentencia debió ser rechazada: %', p_regla, p_sql;
END;
$$;

CREATE FUNCTION prueba.ok(p_regla text, p_condicion boolean) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF p_condicion IS NOT TRUE THEN
        RAISE EXCEPTION 'FALLA %', p_regla;
    END IF;
    RAISE NOTICE 'OK   %', p_regla;
END;
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA prueba TO sga_aplicacion, sga_reportes, sga_auditor;
