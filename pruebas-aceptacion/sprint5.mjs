// =============================================================================
// Prueba de aceptación del Sprint 5 · Pagos, check-in y reportes
// CP-13, CP-14, CP-15, CP-16, CA-08, CA-09, CA-10 (RF-13 a RF-16), S-08.
// CP-20 (fallo simulado durante el pago) se verifica en db/pruebas/operaciones.sql.
// =============================================================================
import {
    exigir,
    fechaHoraEnDias,
    iataLibre,
    numeroVuelo,
    seccion,
    sesionDe,
    SUFIJO,
    verificar,
} from './comun.mjs';

const TARIFA = 2140;

async function prepararVuelo(admin, bd) {
    const ids = [];
    for (const ciudad of ['Origen', 'Destino']) {
        const codigo = await iataLibre(bd);
        const r = await admin.pedir('/api/aeropuertos', {
            metodo: 'POST',
            cuerpo: { codigoIata: codigo, nombre: `Aeropuerto ${codigo}`, ciudad, pais: 'México' },
        });
        ids.push(exigir(r, 'registrar aeropuerto').idAeropuerto);
    }
    const ruta = exigir(
        await admin.pedir('/api/rutas', {
            metodo: 'POST',
            cuerpo: { idOrigen: ids[0], idDestino: ids[1] },
        }),
        'crear ruta',
    );
    const avion = exigir(
        await admin.pedir('/api/aviones', {
            metodo: 'POST',
            cuerpo: {
                matricula: `XD-${SUFIJO.slice(-6).toUpperCase()}`,
                modelo: 'ATR 72-600',
                capacidad: 24,
                estadoOperativo: 'DISPONIBLE',
            },
        }),
        'registrar avión',
    );
    const vuelo = await admin.pedir('/api/vuelos', {
        metodo: 'POST',
        cuerpo: {
            numeroVuelo: numeroVuelo('T5'),
            idRuta: ruta.idRuta,
            idAvion: avion.idAvion,
            salida: fechaHoraEnDias(3, '18:05'),
            llegada: fechaHoraEnDias(3, '20:45'),
            tarifa: TARIFA,
        },
    });
    return {
        idVuelo: exigir(vuelo, 'programar vuelo').idVuelo,
        fecha: fechaHoraEnDias(3).slice(0, 10),
    };
}

const reservar = async (navegador, idVuelo, asiento) =>
    exigir(
        await navegador.pedir('/api/reservaciones', {
            metodo: 'POST',
            cuerpo: { idVuelo, asiento },
        }),
        `reservar ${asiento}`,
    ).codigo;
const pagar = (navegador, codigo, monto, metodo = 'TARJETA_PRUEBA_APROBADA') =>
    navegador.pedir(`/api/reservaciones/${codigo}/pago`, {
        metodo: 'POST',
        cuerpo: { monto, metodo },
    });
const estadoDe = async (navegador, codigo) =>
    (await navegador.pedir(`/api/reservaciones/${codigo}`)).datos.estado;

export async function ejecutar(bd) {
    console.log('\n######## SPRINT 5 · Pagos, check-in y reportes');
    const { navegador: admin } = await sesionDe(bd, 'admin-s5', 'Administrador');
    const { navegador: empleado, id: idEmpleado } = await sesionDe(bd, 'empleado-s5', 'Empleado');
    const ana = await sesionDe(bd, 'ana-s5', 'Pasajero');
    const jorge = await sesionDe(bd, 'jorge-s5', 'Pasajero');
    const { idVuelo, fecha } = await prepararVuelo(admin, bd);
    const codigoA = await reservar(ana.navegador, idVuelo, '1A');
    const codigoB = await reservar(ana.navegador, idVuelo, '1B');
    const codigoJorge = await reservar(jorge.navegador, idVuelo, '2C');

    seccion('CP-13 y CA-08 Pago con monto incorrecto (RF-13)');
    const incorrecto = await pagar(ana.navegador, codigoA, 1500);
    verificar(
        'CP-13 un pago cuyo monto no coincide con la tarifa se rechaza',
        incorrecto.estado === 200 && incorrecto.datos.estado === 'RECHAZADO',
        JSON.stringify(incorrecto.datos),
    );
    verificar(
        'CA-08 tras el rechazo la reservación conserva el estado CONFIRMADA',
        (await estadoDe(ana.navegador, codigoA)) === 'CONFIRMADA',
    );
    const rechazada = await pagar(ana.navegador, codigoA, TARIFA, 'TARJETA_PRUEBA_RECHAZADA');
    verificar(
        'La tarjeta de prueba de rechazo se rechaza y la reservación sigue CONFIRMADA',
        rechazada.datos.estado === 'RECHAZADO' &&
            (await estadoDe(ana.navegador, codigoA)) === 'CONFIRMADA',
    );
    verificar(
        'S-10 un método de pago desconocido se rechaza',
        (await pagar(ana.navegador, codigoA, TARIFA, 'TARJETA_REAL')).estado === 422,
    );

    seccion('CP-20 Fallo simulado durante el registro del pago (RF-14)');
    const codigoFallo = await reservar(jorge.navegador, idVuelo, '3A');
    await bd.query('BEGIN');
    try {
        await bd.query("SELECT registrar_pago($1, $2, 'TARJETA_PRUEBA_APROBADA')", [
            codigoFallo,
            TARIFA,
        ]);
        throw new Error('fallo simulado después de registrar el pago');
    } catch {
        await bd.query('ROLLBACK');
    }
    verificar(
        'CP-20 tras el fallo la transacción se revierte y la reservación conserva el estado CONFIRMADA',
        (await estadoDe(jorge.navegador, codigoFallo)) === 'CONFIRMADA',
    );
    const {
        rows: [pagosFallo],
    } = await bd.query(
        'SELECT count(*)::int AS n FROM pago p JOIN reservacion r USING (id_reservacion) WHERE r.codigo_reserva = $1',
        [codigoFallo],
    );
    verificar('CP-20 no queda ningún registro de pago parcial', pagosFallo.n === 0);

    seccion('CP-14 Pago aprobado (RF-14, RN-02)');
    const aprobado = await pagar(ana.navegador, codigoA, TARIFA);
    verificar(
        'CP-14 RF-13 el pago con el monto exacto se aprueba',
        aprobado.datos.estado === 'APROBADO',
    );
    verificar(
        'CP-36 RNF-01 el registro del pago responde en 3 segundos o menos',
        aprobado.ms <= 3000,
        `${Math.round(aprobado.ms)} ms`,
    );
    verificar(
        'CP-14 la reservación pasa a PAGADA solo tras el pago aprobado',
        (await estadoDe(ana.navegador, codigoA)) === 'PAGADA',
    );
    verificar(
        'Una reservación pagada no se paga dos veces',
        (await pagar(ana.navegador, codigoA, TARIFA)).estado === 409,
    );
    const {
        rows: [pagos],
    } = await bd.query(
        `SELECT count(*) FILTER (WHERE p.estado = 'APROBADO')::int AS aprobados, count(*) FILTER (WHERE p.estado = 'RECHAZADO')::int AS rechazados
         FROM pago p JOIN reservacion r USING (id_reservacion) WHERE r.codigo_reserva = $1`,
        [codigoA],
    );
    verificar(
        'S-12 cada intento de pago queda registrado (1 aprobado, 2 rechazados)',
        pagos.aprobados === 1 && pagos.rechazados === 2,
        JSON.stringify(pagos),
    );

    seccion('S-08 y Tabla 8 · Quién puede pagar');
    verificar(
        'S-08 un pasajero no paga ni consulta la reservación de otro',
        (await pagar(jorge.navegador, codigoB, TARIFA)).estado === 404 &&
            (await jorge.navegador.pedir(`/api/reservaciones/${codigoB}`)).estado === 404,
    );
    verificar(
        'El empleado no registra pagos',
        (await pagar(empleado, codigoB, TARIFA)).estado === 403,
    );
    verificar(
        'El administrador no registra pagos',
        (await pagar(admin, codigoB, TARIFA)).estado === 403,
    );
    verificar(
        'La pantalla de pago es solo del pasajero',
        (await ana.navegador.pedir(`/pago/${codigoB}`)).estado === 200 &&
            (await empleado.pedir(`/pago/${codigoB}`)).estado === 403,
    );

    seccion('CP-15 Check-in sobre reservación no pagada (RF-15, RN-03)');
    const consultaNoPagada = await empleado.pedir(`/api/check-in/${codigoB}`);
    verificar(
        'CP-15 la consulta informa el motivo por el que no procede',
        consultaNoPagada.estado === 200 &&
            /pago aprobado/.test(consultaNoPagada.datos.motivo ?? ''),
        consultaNoPagada.datos.motivo,
    );
    const noPagada = await empleado.pedir('/api/check-in', {
        metodo: 'POST',
        cuerpo: { codigo: codigoB, identificacionVerificada: true },
    });
    verificar(
        'CP-15 el sistema impide el check-in e informa el motivo',
        noPagada.estado === 409 && /pago aprobado/.test(noPagada.datos.mensaje),
        JSON.stringify(noPagada.datos),
    );
    verificar(
        'El check-in exige confirmar la identificación del pasajero',
        (
            await empleado.pedir('/api/check-in', {
                metodo: 'POST',
                cuerpo: { codigo: codigoA, identificacionVerificada: false },
            })
        ).estado === 422,
    );

    seccion('CA-09 Check-in y pase de abordar único (RF-15)');
    const checkIn = await empleado.pedir('/api/check-in', {
        metodo: 'POST',
        cuerpo: { codigo: codigoA, identificacionVerificada: true },
    });
    verificar(
        'CP-32 CA-09 el check-in de una reservación PAGADA emite un pase de 12 caracteres',
        checkIn.estado === 201 && /^[A-Z0-9]{12}$/.test(checkIn.datos.pase ?? ''),
        JSON.stringify(checkIn.datos),
    );
    verificar(
        'CP-32 la reservación pasa a ABORDADA',
        (await estadoDe(ana.navegador, codigoA)) === 'ABORDADA',
    );
    const asiento1A = (await ana.navegador.pedir(`/api/vuelos/${idVuelo}/asientos`)).datos.find(
        (s) => s.numero === '1A',
    );
    verificar('RF-09 el asiento se muestra como OCUPADO', asiento1A?.estado === 'OCUPADO');
    const repetido = await empleado.pedir('/api/check-in', {
        metodo: 'POST',
        cuerpo: { codigo: codigoA, identificacionVerificada: true },
    });
    verificar(
        'No se emite un segundo pase para la misma reservación',
        repetido.estado === 409 && repetido.datos.mensaje.includes(checkIn.datos.pase),
    );
    exigir(await pagar(jorge.navegador, codigoJorge, TARIFA), 'pagar la reservación de Jorge');
    const otroPase = exigir(
        await empleado.pedir('/api/check-in', {
            metodo: 'POST',
            cuerpo: { codigo: codigoJorge, identificacionVerificada: true },
        }),
        'check-in de Jorge',
    ).pase;
    verificar('CP-32 CA-09 los números de pase son únicos', otroPase !== checkIn.datos.pase);
    const detalle = await ana.navegador.pedir(`/api/reservaciones/${codigoA}`);
    verificar('El pasajero consulta su pase de abordar', detalle.datos.pase === checkIn.datos.pase);
    verificar(
        'El pasajero no realiza check-in',
        (
            await ana.navegador.pedir('/api/check-in', {
                metodo: 'POST',
                cuerpo: { codigo: codigoA, identificacionVerificada: true },
            })
        ).estado === 403,
    );
    const bitacoraCheckIn = await admin.pedir('/api/bitacora?modulo=Check-in&accion=ALTA');
    verificar(
        'CP-34 RF-17 la bitácora registra al empleado que hizo el check-in',
        bitacoraCheckIn.datos.registros.some((r) => r.idUsuario === idEmpleado),
    );

    seccion('CP-16 y CA-10 Reportes (RF-16)');
    const ocupacion = await admin.pedir(`/api/reportes/ocupacion?desde=${fecha}&hasta=${fecha}`);
    const filaVuelo = ocupacion.datos.filas?.find((f) => f.idVuelo === idVuelo);
    const {
        rows: [real],
    } = await bd.query(
        `SELECT count(*)::int AS asientos,
                count(r.id_reservacion) FILTER (WHERE r.estado IN ('PENDIENTE', 'CONFIRMADA'))::int AS apartados,
                count(r.id_reservacion) FILTER (WHERE r.estado IN ('PAGADA', 'ABORDADA'))::int AS vendidos
         FROM asiento a LEFT JOIN reservacion r ON r.id_asiento = a.id_asiento
              AND r.estado IN ('PENDIENTE', 'CONFIRMADA', 'PAGADA', 'ABORDADA')
         WHERE a.id_vuelo = $1`,
        [idVuelo],
    );
    verificar(
        'CP-16 los totales del reporte de ocupación coinciden con la base de datos',
        filaVuelo &&
            filaVuelo.asientosTotales === real.asientos &&
            filaVuelo.asientosApartados === real.apartados &&
            filaVuelo.asientosVendidos === real.vendidos,
        `${JSON.stringify(filaVuelo)} vs ${JSON.stringify(real)}`,
    );
    verificar(
        'El reporte de ocupación suma sus totales',
        ocupacion.datos.totales.asientosTotales ===
            ocupacion.datos.filas.reduce((t, f) => t + f.asientosTotales, 0),
    );
    const hoy = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Mexico_City' }).format(
        new Date(),
    );
    const reportePagos = await admin.pedir(`/api/reportes/pagos?desde=${hoy}&hasta=${hoy}`);
    const {
        rows: [pagosHoy],
    } = await bd.query(
        `SELECT count(*) FILTER (WHERE estado = 'APROBADO')::int AS aprobados,
                coalesce(sum(monto) FILTER (WHERE estado = 'APROBADO'), 0)::float AS monto,
                count(*) FILTER (WHERE estado = 'RECHAZADO')::int AS rechazados
         FROM pago WHERE (fecha_registro AT TIME ZONE 'America/Mexico_City')::date = $1::date`,
        [hoy],
    );
    const t = reportePagos.datos.totales;
    verificar(
        'CA-10 el reporte de pagos coincide con los pagos registrados en la base',
        t.pagosAprobados === pagosHoy.aprobados &&
            Math.abs(t.montoAprobado - pagosHoy.monto) < 0.01 &&
            t.pagosRechazados === pagosHoy.rechazados,
        `${JSON.stringify(t)} vs ${JSON.stringify(pagosHoy)}`,
    );
    const reporteReservaciones = await admin.pedir(
        `/api/reportes/reservaciones?desde=${hoy}&hasta=${hoy}`,
    );
    const {
        rows: [reservacionesHoy],
    } = await bd.query(
        "SELECT count(*)::int AS total FROM reservacion WHERE (fecha_creacion AT TIME ZONE 'America/Mexico_City')::date = $1::date",
        [hoy],
    );
    verificar(
        'CA-10 el reporte de reservaciones coincide con la base',
        reporteReservaciones.datos.totales.total === reservacionesHoy.total,
    );
    verificar(
        'S-10 un periodo invertido se rechaza',
        (await admin.pedir(`/api/reportes/pagos?desde=${hoy}&hasta=2000-01-01`)).estado === 422,
    );
    verificar(
        'Tabla 8 el empleado no genera reportes',
        (await empleado.pedir('/api/reportes/ocupacion')).estado === 403,
    );
    verificar(
        'Tabla 8 el pasajero no accede a la pantalla de reportes',
        (await ana.navegador.pedir('/admin/reportes')).estado === 403,
    );
}
