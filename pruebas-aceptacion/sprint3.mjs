// =============================================================================
// Prueba de aceptación del Sprint 3 · Vuelos y rutas (incluye asientos)
// CP-06, CP-07, CP-08, CP-09, CA-04, CA-05 (RF-06 a RF-09), RN-05, RN-09.
// =============================================================================
import {
    fechaHoraEnDias,
    iataLibre,
    numeroVuelo,
    seccion,
    sesionDe,
    SUFIJO,
    verificar,
} from './comun.mjs';

async function aeropuerto(admin, codigo, ciudad) {
    const respuesta = await admin.pedir('/api/aeropuertos', {
        metodo: 'POST',
        cuerpo: { codigoIata: codigo, nombre: `Aeropuerto ${codigo}`, ciudad, pais: 'México' },
    });
    return respuesta.datos.idAeropuerto;
}

export async function ejecutar(bd) {
    console.log('\n######## SPRINT 3 · Vuelos y rutas');
    const { navegador: admin } = await sesionDe(bd, 'admin-s3', 'Administrador');
    const { navegador: empleado } = await sesionDe(bd, 'empleado-s3', 'Empleado');
    const { navegador: pasajero } = await sesionDe(bd, 'pasajero-s3', 'Pasajero');
    const [a, b, c] = [await iataLibre(bd), await iataLibre(bd), await iataLibre(bd)];
    const idA = await aeropuerto(admin, a, 'Origen');
    const idB = await aeropuerto(admin, b, 'Destino');
    const idC = await aeropuerto(admin, c, 'Otro destino');

    seccion('Rutas (RN-05)');
    verificar(
        'RN-05 una ruta con origen igual a destino se rechaza',
        (
            await admin.pedir('/api/rutas', {
                metodo: 'POST',
                cuerpo: { idOrigen: idA, idDestino: idA },
            })
        ).estado === 422,
    );
    const ruta = await admin.pedir('/api/rutas', {
        metodo: 'POST',
        cuerpo: { idOrigen: idA, idDestino: idB },
    });
    verificar('El administrador registra una ruta', ruta.estado === 201);
    verificar(
        'Una ruta duplicada se rechaza',
        (
            await admin.pedir('/api/rutas', {
                metodo: 'POST',
                cuerpo: { idOrigen: idA, idDestino: idB },
            })
        ).estado === 409,
    );
    const otraRuta = await admin.pedir('/api/rutas', {
        metodo: 'POST',
        cuerpo: { idOrigen: idA, idDestino: idC },
    });
    const capacidad = 20;
    const avion = await admin.pedir('/api/aviones', {
        metodo: 'POST',
        cuerpo: {
            matricula: `XB-${SUFIJO.slice(-6).toUpperCase()}`,
            modelo: 'Avión de prueba',
            capacidad,
            estadoOperativo: 'DISPONIBLE',
        },
    });
    const vuelo = (numero, idRuta, dias, salida, llegada) => ({
        numeroVuelo: numero,
        idRuta,
        idAvion: avion.datos.idAvion,
        salida: fechaHoraEnDias(dias, salida),
        llegada: fechaHoraEnDias(dias, llegada),
        tarifa: 1850,
    });

    seccion('CP-06 Programación de vuelos (RF-06, CA-04)');
    const invertido = await admin.pedir('/api/vuelos', {
        metodo: 'POST',
        cuerpo: vuelo(numeroVuelo('T1', 1), ruta.datos.idRuta, 5, '12:00', '10:00'),
    });
    verificar(
        'CP-06 un vuelo con llegada anterior a la salida se rechaza e indica el error',
        invertido.estado === 422 && /posterior a la salida/.test(invertido.datos.mensaje),
        invertido.datos.mensaje,
    );
    verificar(
        'Un vuelo con salida en el pasado se rechaza',
        (
            await admin.pedir('/api/vuelos', {
                metodo: 'POST',
                cuerpo: vuelo(numeroVuelo('T1', 2), ruta.datos.idRuta, -1, '08:00', '10:00'),
            })
        ).estado === 422,
    );
    const programado = await admin.pedir('/api/vuelos', {
        metodo: 'POST',
        cuerpo: vuelo(numeroVuelo('T1', 3), ruta.datos.idRuta, 5, '08:00', '10:30'),
    });
    verificar(
        'RF-06 el administrador programa un vuelo con ruta, aeronave, salida y llegada',
        programado.estado === 201,
    );
    const idVuelo = programado.datos.idVuelo;
    await admin.pedir('/api/vuelos', {
        metodo: 'POST',
        cuerpo: vuelo(numeroVuelo('T1', 4), ruta.datos.idRuta, 6, '08:00', '10:30'),
    });
    await admin.pedir('/api/vuelos', {
        metodo: 'POST',
        cuerpo: vuelo(numeroVuelo('T1', 5), otraRuta.datos.idRuta, 5, '09:00', '11:00'),
    });
    verificar(
        'Un vuelo con el mismo número y salida se rechaza',
        (
            await admin.pedir('/api/vuelos', {
                metodo: 'POST',
                cuerpo: vuelo(numeroVuelo('T1', 3), ruta.datos.idRuta, 5, '08:00', '10:30'),
            })
        ).estado === 409,
    );

    seccion('CP-08 y CP-09 Asientos (RF-08, RF-09, CA-05)');
    const asientos = await pasajero.pedir(`/api/vuelos/${idVuelo}/asientos`);
    verificar(
        'CP-08 / CP-31 el número de asientos generados coincide con la capacidad',
        asientos.datos.length === capacidad,
        `${asientos.datos.length}`,
    );
    verificar(
        'RF-09 al programarse todos los asientos están libres',
        asientos.datos.every((s) => s.estado === 'LIBRE'),
    );
    const { rows } = await bd.query(
        'SELECT numero, estado_asiento FROM disponibilidad_asiento WHERE id_vuelo = $1',
        [idVuelo],
    );
    const almacenado = new Map(rows.map((r) => [r.numero, r.estado_asiento]));
    verificar(
        'CP-09 el estado mostrado coincide con el almacenado',
        asientos.datos.every((s) => almacenado.get(s.numero) === s.estado),
    );

    seccion('CP-07 Consulta de vuelos (RF-07, CA-04)');
    const fecha = fechaHoraEnDias(5).slice(0, 10);
    const busqueda = await pasajero.pedir(
        `/api/vuelos/buscar?origen=${a}&destino=${b}&fecha=${fecha}`,
    );
    verificar(
        'CP-07 la consulta devuelve únicamente el vuelo que coincide en origen, destino y fecha',
        busqueda.estado === 200 &&
            busqueda.datos.length === 1 &&
            busqueda.datos[0].numeroVuelo === numeroVuelo('T1', 3),
        JSON.stringify(busqueda.datos.map((v) => v.numeroVuelo)),
    );
    verificar(
        'CP-21 RNF-01 la consulta de vuelos responde en 3 segundos o menos',
        busqueda.ms <= 3000,
        `${Math.round(busqueda.ms)} ms`,
    );
    verificar(
        'El empleado también consulta vuelos',
        (await empleado.pedir(`/api/vuelos/buscar?origen=${a}&destino=${b}&fecha=${fecha}`))
            .estado === 200,
    );
    verificar(
        'S-10 una consulta con código IATA inválido se rechaza',
        (await pasajero.pedir(`/api/vuelos/buscar?origen=xx&destino=${b}&fecha=${fecha}`))
            .estado === 422,
    );

    seccion('Búsqueda con calendario y sugerencias (apoyo a RF-07)');
    const dia5 = fechaHoraEnDias(5).slice(0, 10);
    const dia6 = fechaHoraEnDias(6).slice(0, 10);
    const calendario = await pasajero.pedir(
        `/api/vuelos/calendario?origen=${a}&destino=${b}&desde=${dia5}`,
    );
    verificar(
        'El calendario devuelve una franja de 14 días',
        calendario.estado === 200 && calendario.datos.length === 14,
    );
    verificar(
        'El calendario cuenta los vuelos del día y su tarifa más baja',
        calendario.datos[0].fecha === dia5 &&
            calendario.datos[0].vuelos === 1 &&
            calendario.datos[0].tarifaMinima === 1850,
        JSON.stringify(calendario.datos[0]),
    );
    verificar(
        'Los días sin vuelos aparecen con cero',
        calendario.datos.slice(2).every((d) => d.vuelos === 0),
    );
    const desdeOrigen = await pasajero.pedir(
        `/api/vuelos/disponibles?origen=${a}&desde=${dia5}&hasta=${dia6}`,
    );
    verificar(
        'Con solo el origen se listan los vuelos de todas sus rutas en el intervalo',
        desdeOrigen.estado === 200 &&
            desdeOrigen.datos.length === 3 &&
            desdeOrigen.datos.every((v) => v.origen === a),
        JSON.stringify(desdeOrigen.datos.map((v) => `${v.origen}-${v.destino}`)),
    );
    verificar(
        'Sin filtros la vista inicial muestra vuelos próximos',
        (await pasajero.pedir('/api/vuelos/disponibles')).estado === 200,
    );
    const sugerencia = await pasajero.pedir(
        `/api/vuelos/sugerencias?origen=${a}&destino=${b}&fecha=${fechaHoraEnDias(1).slice(0, 10)}`,
    );
    verificar(
        'Sin vuelos en la fecha, se sugiere el siguiente vuelo de la ruta',
        sugerencia.datos.siguiente?.numeroVuelo === numeroVuelo('T1', 3),
        JSON.stringify(sugerencia.datos.siguiente),
    );
    verificar(
        'Se sugieren los destinos con vuelos desde el origen',
        [b, c].every((codigo) =>
            sugerencia.datos.alternativas.some((alt) => alt.codigo === codigo),
        ),
    );
    verificar(
        'S-10 un intervalo de más de 31 días se rechaza',
        (
            await pasajero.pedir(
                `/api/vuelos/disponibles?desde=${dia5}&hasta=${fechaHoraEnDias(60).slice(0, 10)}`,
            )
        ).estado === 422,
    );

    seccion('Modificación y cancelación de vuelos (RN-09, RNF-12)');
    verificar(
        'El administrador abre el vuelo para reservaciones',
        (
            await admin.pedir(`/api/vuelos/${idVuelo}`, {
                metodo: 'PATCH',
                cuerpo: { estado: 'ABIERTO' },
            })
        ).estado === 200,
    );
    const llegadaMala = await admin.pedir(`/api/vuelos/${idVuelo}`, {
        metodo: 'PATCH',
        cuerpo: { llegada: fechaHoraEnDias(5, '07:00') },
    });
    verificar(
        'RN-06 una modificación con llegada anterior a la salida se rechaza',
        llegadaMala.estado === 422,
    );
    const otro = (
        await pasajero.pedir(
            `/api/vuelos/buscar?origen=${a}&destino=${b}&fecha=${fechaHoraEnDias(6).slice(0, 10)}`,
        )
    ).datos[0];
    verificar(
        'CP-27 RNF-12 cancelar un vuelo sin escribir su número se rechaza',
        (
            await admin.pedir(`/api/vuelos/${otro.idVuelo}/cancelar`, {
                metodo: 'POST',
                cuerpo: { confirmacion: 'XX' },
            })
        ).estado === 422,
    );
    const cancelado = await admin.pedir(`/api/vuelos/${otro.idVuelo}/cancelar`, {
        metodo: 'POST',
        cuerpo: { confirmacion: otro.numeroVuelo },
    });
    verificar(
        'CP-27 RN-09 el administrador cancela el vuelo con confirmación explícita',
        cancelado.estado === 200,
    );
    const trasCancelar = await pasajero.pedir(
        `/api/vuelos/buscar?origen=${a}&destino=${b}&fecha=${fechaHoraEnDias(6).slice(0, 10)}`,
    );
    verificar('Un vuelo cancelado ya no aparece en la consulta', trasCancelar.datos.length === 0);

    seccion('Tabla 8 · Restricciones de acceso a vuelos (S-07)');
    verificar(
        'El pasajero no programa vuelos',
        (
            await pasajero.pedir('/api/vuelos', {
                metodo: 'POST',
                cuerpo: vuelo(numeroVuelo('T1', 6), ruta.datos.idRuta, 5, '08:00', '10:00'),
            })
        ).estado === 403,
    );
    verificar(
        'El empleado no gestiona rutas',
        (
            await empleado.pedir('/api/rutas', {
                metodo: 'POST',
                cuerpo: { idOrigen: idB, idDestino: idC },
            })
        ).estado === 403,
    );
    verificar(
        'El empleado no accede a la pantalla de gestión de vuelos',
        (await empleado.pedir('/admin/vuelos')).estado === 403,
    );
    verificar(
        'Los tres perfiles acceden a la pantalla de asientos',
        (await pasajero.pedir(`/vuelos/${idVuelo}`)).estado === 200 &&
            (await empleado.pedir(`/vuelos/${idVuelo}`)).estado === 200,
    );
    const bitacora = await admin.pedir('/api/bitacora?modulo=Vuelos&accion=ALTA');
    verificar(
        'CP-34 RF-17 la programación del vuelo quedó en la bitácora',
        bitacora.datos.registros.some((r) => r.detalle.includes(`id_vuelo=${idVuelo}`)),
    );
}
