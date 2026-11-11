// =============================================================================
// Prueba de aceptación del Sprint 4 · Reservaciones y concurrencia
// CP-10, CP-11, CP-12, CP-19, CA-06, CA-07 (RF-10 a RF-12, RNF-07), RNF-01, S-08.
// =============================================================================
import {
    exigir,
    fechaHoraEnDias,
    fechaHoraEnHoras,
    iataLibre,
    numeroVuelo,
    seccion,
    sesionDe,
    SUFIJO,
    verificar,
} from './comun.mjs';

const SOLICITUDES_SIMULTANEAS = 10;

async function prepararVuelo(admin, bd) {
    const ids = [];
    for (const ciudad of ['Origen', 'Destino']) {
        const codigo = await iataLibre(bd);
        const r = await admin.pedir('/api/aeropuertos', {
            metodo: 'POST',
            cuerpo: { codigoIata: codigo, nombre: `Aeropuerto ${codigo}`, ciudad, pais: 'México' },
        });
        ids.push(r.datos.idAeropuerto);
    }
    const ruta = await admin.pedir('/api/rutas', {
        metodo: 'POST',
        cuerpo: { idOrigen: ids[0], idDestino: ids[1] },
    });
    const avion = await admin.pedir('/api/aviones', {
        metodo: 'POST',
        cuerpo: {
            matricula: `XC-${SUFIJO.slice(-6).toUpperCase()}`,
            modelo: 'ATR 72-600',
            capacidad: 72,
            estadoOperativo: 'DISPONIBLE',
        },
    });
    const vuelo = await admin.pedir('/api/vuelos', {
        metodo: 'POST',
        cuerpo: {
            numeroVuelo: numeroVuelo('T4'),
            idRuta: ruta.datos.idRuta,
            idAvion: avion.datos.idAvion,
            salida: fechaHoraEnDias(10, '06:40'),
            llegada: fechaHoraEnDias(10, '09:15'),
            tarifa: 1850,
        },
    });
    return exigir(vuelo, 'programar el vuelo de prueba').idVuelo;
}

const reservar = (navegador, idVuelo, asiento, extra = {}) =>
    navegador.pedir('/api/reservaciones', {
        metodo: 'POST',
        cuerpo: { idVuelo, asiento, ...extra },
    });

async function estadoAsiento(navegador, idVuelo, numero) {
    return (await navegador.pedir(`/api/vuelos/${idVuelo}/asientos`)).datos.find(
        (s) => s.numero === numero,
    );
}

export async function ejecutar(bd) {
    console.log('\n######## SPRINT 4 · Reservaciones y concurrencia');
    const { navegador: admin } = await sesionDe(bd, 'admin-s4', 'Administrador');
    const { navegador: empleado, id: idEmpleado } = await sesionDe(bd, 'empleado-s4', 'Empleado');
    const ana = await sesionDe(bd, 'ana-s4', 'Pasajero');
    const jorge = await sesionDe(bd, 'jorge-s4', 'Pasajero');
    const idVuelo = await prepararVuelo(admin, bd);

    seccion('CP-10 Creación de reservación y código único (RF-10)');
    const primera = await reservar(ana.navegador, idVuelo, '1A');
    verificar(
        'CP-10 el pasajero reserva un asiento libre',
        primera.estado === 201,
        JSON.stringify(primera.datos),
    );
    verificar(
        'CP-10 se emite un código de 8 caracteres',
        /^[A-Z0-9]{8}$/.test(primera.datos.codigo ?? ''),
    );
    verificar(
        'CP-35 RNF-01 la reservación se completa en 3 segundos o menos',
        primera.ms <= 3000,
        `${Math.round(primera.ms)} ms`,
    );
    const codigos = [
        primera.datos.codigo,
        (await reservar(ana.navegador, idVuelo, '1B')).datos.codigo,
        (await reservar(ana.navegador, idVuelo, '1C')).datos.codigo,
    ];
    verificar(
        'CP-10 los códigos de reservación no se repiten',
        new Set(codigos).size === codigos.length,
    );
    const visto = await estadoAsiento(ana.navegador, idVuelo, '1A');
    verificar(
        'CA-05 el asiento reservado se muestra de inmediato como RESERVADO',
        visto?.estado === 'RESERVADO',
    );
    verificar('El pasajero identifica su propio asiento', visto?.mio === true);
    verificar(
        'S-08 otro pasajero ve el asiento ocupado pero no de quién es',
        (await estadoAsiento(jorge.navegador, idVuelo, '1A'))?.mio === false,
    );

    seccion('CA-06 Asiento no disponible (RF-11)');
    const repetida = await reservar(jorge.navegador, idVuelo, '1A');
    verificar(
        'CA-06 la segunda solicitud recibe un mensaje de asiento no disponible',
        repetida.estado === 409 && /no está disponible/.test(repetida.datos.mensaje),
        JSON.stringify(repetida.datos),
    );
    const {
        rows: [conteo1A],
    } = await bd.query(
        `SELECT count(*)::int AS n FROM reservacion r JOIN asiento a USING (id_asiento) WHERE a.id_vuelo = $1 AND a.numero = '1A'`,
        [idVuelo],
    );
    verificar('CA-06 la solicitud rechazada no genera registro', conteo1A.n === 1);

    seccion(
        `CP-11 y CP-19 Concurrencia: ${SOLICITUDES_SIMULTANEAS} pasajeros piden el mismo asiento al mismo tiempo (RF-11, RNF-07)`,
    );
    // Los usuarios se preparan uno por uno; lo que ocurre al mismo tiempo son las reservaciones
    const pasajeros = [];
    for (let i = 0; i < SOLICITUDES_SIMULTANEAS; i += 1) {
        pasajeros.push(await sesionDe(bd, `simultaneo${i}`, 'Pasajero'));
    }
    const respuestas = await Promise.all(
        pasajeros.map((p) => reservar(p.navegador, idVuelo, '2A')),
    );
    const exitosas = respuestas.filter((r) => r.estado === 201).length;
    const rechazadas = respuestas.filter((r) => r.estado === 409).length;
    verificar(
        'CP-11 exactamente una solicitud obtiene el asiento',
        exitosas === 1,
        `exitosas=${exitosas}`,
    );
    verificar(
        'CP-11 todas las demás reciben rechazo por asiento no disponible',
        rechazadas === SOLICITUDES_SIMULTANEAS - 1,
        `rechazadas=${rechazadas}`,
    );
    const {
        rows: [conteo2A],
    } = await bd.query(
        `SELECT count(*)::int AS n FROM reservacion r JOIN asiento a USING (id_asiento) WHERE a.id_vuelo = $1 AND a.numero = '2A'`,
        [idVuelo],
    );
    verificar(
        'CP-19 la base registra una sola reservación para el asiento',
        conteo2A.n === 1,
        `${conteo2A.n}`,
    );

    seccion('S-08 Cada pasajero ve solo sus reservaciones');
    const misAna = (await ana.navegador.pedir('/api/reservaciones/mias')).datos;
    verificar(
        'El pasajero consulta sus reservaciones',
        misAna.length === 3 && misAna.every((r) => r.correoPasajero === ana.correo),
    );
    const misJorge = (await jorge.navegador.pedir('/api/reservaciones/mias')).datos;
    verificar(
        'S-08 un pasajero no ve reservaciones de otros',
        !misJorge.some((r) => codigos.includes(r.codigo)),
    );
    verificar(
        'S-08 el pasajero no accede a la consulta general de reservaciones',
        (await jorge.navegador.pedir('/api/reservaciones')).estado === 403,
    );

    seccion('CP-12 Cancelación y liberación del asiento (RF-12, CA-07)');
    verificar(
        'S-08 un pasajero no cancela la reservación de otro',
        (
            await jorge.navegador.pedir(`/api/reservaciones/${primera.datos.codigo}/cancelar`, {
                metodo: 'POST',
            })
        ).estado === 403,
    );
    verificar(
        'CP-12 el pasajero cancela su reservación',
        (
            await ana.navegador.pedir(`/api/reservaciones/${primera.datos.codigo}/cancelar`, {
                metodo: 'POST',
            })
        ).estado === 200,
    );
    verificar(
        'CA-07 el asiento vuelve a mostrarse como disponible',
        (await estadoAsiento(jorge.navegador, idVuelo, '1A'))?.estado === 'LIBRE',
    );
    verificar(
        'CA-07 otro pasajero puede reservar el asiento liberado',
        (await reservar(jorge.navegador, idVuelo, '1A')).estado === 201,
    );
    verificar(
        'Una reservación cancelada no se cancela dos veces',
        (
            await ana.navegador.pedir(`/api/reservaciones/${primera.datos.codigo}/cancelar`, {
                metodo: 'POST',
            })
        ).estado === 409,
    );

    seccion('Atención a pasajeros por el empleado (Tabla 8)');
    const porEmpleado = await reservar(empleado, idVuelo, '5D', { correoPasajero: ana.correo });
    verificar('El empleado reserva a nombre de un pasajero', porEmpleado.estado === 201);
    verificar(
        'La reservación aparece en la cuenta del pasajero',
        (await ana.navegador.pedir('/api/reservaciones/mias')).datos.some(
            (r) => r.codigo === porEmpleado.datos.codigo,
        ),
    );
    verificar(
        'El empleado no puede reservar a nombre de un correo inexistente',
        (await reservar(empleado, idVuelo, '5E', { correoPasajero: 'nadie@prueba-aceptacion.mx' }))
            .estado === 404,
    );
    const busqueda = await empleado.pedir(`/api/reservaciones?codigo=${porEmpleado.datos.codigo}`);
    verificar(
        'El empleado localiza una reservación por su código',
        busqueda.datos.length === 1 && busqueda.datos[0].correoPasajero === ana.correo,
    );
    const bitacora = await admin.pedir('/api/bitacora?modulo=Reservaciones&accion=ALTA');
    const registro = bitacora.datos.registros.find(
        (r) => r.detalle.includes('reservacion') && r.idUsuario === idEmpleado,
    );
    verificar(
        'CP-34 RF-17 la bitácora registra al empleado que creó la reservación',
        Boolean(registro),
    );
    verificar(
        'Tabla 8 el administrador no crea reservaciones',
        (await reservar(admin, idVuelo, '6A')).estado === 403,
    );

    seccion('RN-12 La venta cierra 24 horas antes de la salida');
    const vueloOriginal = (await admin.pedir(`/api/vuelos/${idVuelo}`)).datos;
    const rutaProxima = (await admin.pedir('/api/rutas')).datos.find(
        (r) => r.origen === vueloOriginal.origen && r.destino === vueloOriginal.destino,
    );
    const avionProximo = (await admin.pedir('/api/aviones')).datos.find(
        (av) => av.matricula === vueloOriginal.matricula,
    );
    const proximo = await admin.pedir('/api/vuelos', {
        metodo: 'POST',
        cuerpo: {
            numeroVuelo: numeroVuelo('T4', 1),
            idRuta: rutaProxima.idRuta,
            idAvion: avionProximo.idAvion,
            salida: fechaHoraEnHoras(20),
            llegada: fechaHoraEnHoras(22),
            tarifa: 900,
        },
    });
    verificar(
        'Se puede programar un vuelo que sale en menos de 24 horas',
        proximo.estado === 201,
        JSON.stringify(proximo.datos),
    );
    const reservaTardia = await reservar(jorge.navegador, proximo.datos.idVuelo, '1A');
    verificar(
        'RN-12 ese vuelo ya no admite reservaciones',
        reservaTardia.estado === 409 && /24 horas/.test(reservaTardia.datos.mensaje),
        JSON.stringify(reservaTardia.datos),
    );
    const fechaProxima = fechaHoraEnHoras(20).slice(0, 10);
    const visibles = await jorge.navegador.pedir(
        `/api/vuelos/buscar?origen=${vueloOriginal.origen}&destino=${vueloOriginal.destino}&fecha=${fechaProxima}`,
    );
    verificar(
        'RN-12 ese vuelo no aparece en la búsqueda de vuelos disponibles',
        !visibles.datos.some((v) => v.idVuelo === proximo.datos.idVuelo),
    );

    seccion('RN-09 La cancelación del vuelo cancela sus reservaciones');
    const vuelo = (await admin.pedir(`/api/vuelos/${idVuelo}`)).datos;
    const cancelacion = await admin.pedir(`/api/vuelos/${idVuelo}/cancelar`, {
        metodo: 'POST',
        cuerpo: { confirmacion: vuelo.numeroVuelo },
    });
    verificar(
        'CP-33 el administrador cancela el vuelo e informa cuántas reservaciones se cancelaron',
        cancelacion.estado === 200 && cancelacion.datos.reservacionesCanceladas >= 4,
        JSON.stringify(cancelacion.datos),
    );
    const trasCancelar = (await ana.navegador.pedir('/api/reservaciones/mias')).datos;
    verificar(
        'CP-33 RN-09 las reservaciones del pasajero pasaron a CANCELADA',
        trasCancelar.every((r) => r.estado === 'CANCELADA'),
    );
    const nuevaEnCancelado = await reservar(jorge.navegador, idVuelo, '9A');
    verificar('Un vuelo cancelado ya no admite reservaciones', nuevaEnCancelado.estado === 409);
}
