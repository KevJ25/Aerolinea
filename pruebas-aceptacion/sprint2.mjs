// =============================================================================
// Prueba de aceptación del Sprint 2 · Aeropuertos, aviones y asientos
// CP-04, CP-05, CA-03 (RF-04, RF-05) y restricciones de la Tabla 8.
// Los asientos (RF-08, RF-09, CP-08, CP-09) se verifican con los vuelos del Sprint 3.
// =============================================================================
import { iataLibre, seccion, sesionDe, SUFIJO, verificar } from './comun.mjs';

export async function ejecutar(bd) {
    console.log('\n######## SPRINT 2 · Aeropuertos, aviones y asientos');
    const { navegador: admin } = await sesionDe(bd, 'admin-s2', 'Administrador');
    const { navegador: empleado } = await sesionDe(bd, 'empleado-s2', 'Empleado');
    const { navegador: pasajero } = await sesionDe(bd, 'pasajero-s2', 'Pasajero');
    const iata = await iataLibre(bd);

    seccion('CP-04 Aeropuertos (RF-04, CA-03)');
    const datos = {
        codigoIata: iata,
        nombre: `Aeropuerto de prueba ${SUFIJO}`,
        ciudad: 'Toluca',
        pais: 'México',
    };
    const alta = await admin.pedir('/api/aeropuertos', { metodo: 'POST', cuerpo: datos });
    verificar('RF-04 el administrador registra un aeropuerto', alta.estado === 201);
    const invalido = await admin.pedir('/api/aeropuertos', {
        metodo: 'POST',
        cuerpo: { ...datos, codigoIata: 'mx1' },
    });
    verificar(
        'CP-04 un código IATA inválido se rechaza e informa el formato esperado',
        invalido.estado === 422 && /tres letras mayúsculas/.test(invalido.datos.mensaje),
        invalido.datos.mensaje,
    );
    verificar(
        'CP-04 un código IATA en minúsculas se rechaza',
        (
            await admin.pedir('/api/aeropuertos', {
                metodo: 'POST',
                cuerpo: { ...datos, codigoIata: iata.toLowerCase() },
            })
        ).estado === 422,
    );
    const duplicado = await admin.pedir('/api/aeropuertos', { metodo: 'POST', cuerpo: datos });
    verificar(
        'CA-03 un código IATA duplicado se rechaza',
        duplicado.estado === 409 && /código IATA/.test(duplicado.datos.mensaje),
    );
    const editado = await admin.pedir(`/api/aeropuertos/${alta.datos.idAeropuerto}`, {
        metodo: 'PATCH',
        cuerpo: { ...datos, nombre: 'Nombre corregido' },
    });
    verificar('RF-04 el administrador modifica un aeropuerto', editado.estado === 200);
    const consultaActivos = async () =>
        (await pasajero.pedir('/api/aeropuertos/activos')).datos.map((a) => a.codigoIata);
    verificar(
        'RF-04 cualquier perfil consulta los aeropuertos activos',
        (await consultaActivos()).includes(iata),
    );
    await admin.pedir(`/api/aeropuertos/${alta.datos.idAeropuerto}/desactivar`, { metodo: 'POST' });
    verificar(
        'RF-04 un aeropuerto desactivado deja de aparecer en la consulta',
        !(await consultaActivos()).includes(iata),
    );
    await admin.pedir(`/api/aeropuertos/${alta.datos.idAeropuerto}/activar`, { metodo: 'POST' });
    verificar('RF-04 al reactivarlo vuelve a aparecer', (await consultaActivos()).includes(iata));
    const {
        rows: [fila],
    } = await bd.query('SELECT activo FROM aeropuerto WHERE codigo_iata = $1', [iata]);
    verificar('V-12 desactivar no borra el registro', fila?.activo === true);

    seccion('CP-05 Aeronaves (RF-05, CA-03)');
    const matricula = `XA-${SUFIJO.slice(-6).toUpperCase()}`;
    const avion = { matricula, modelo: 'ATR 72-600', capacidad: 72, estadoOperativo: 'DISPONIBLE' };
    const altaAvion = await admin.pedir('/api/aviones', { metodo: 'POST', cuerpo: avion });
    verificar(
        'RF-05 el administrador registra una aeronave con matrícula, modelo, capacidad y estado',
        altaAvion.estado === 201,
    );
    const avionDuplicado = await admin.pedir('/api/aviones', {
        metodo: 'POST',
        cuerpo: { ...avion, matricula: matricula.toLowerCase() },
    });
    verificar(
        'CP-05 una matrícula duplicada se rechaza por unicidad',
        avionDuplicado.estado === 409 && /matrícula/.test(avionDuplicado.datos.mensaje),
    );
    verificar(
        'V-05 una capacidad de cero se rechaza',
        (
            await admin.pedir('/api/aviones', {
                metodo: 'POST',
                cuerpo: { ...avion, matricula: 'XA-ZZZ0', capacidad: 0 },
            })
        ).estado === 422,
    );
    verificar(
        'CA-03 una matrícula con formato inválido se rechaza',
        (
            await admin.pedir('/api/aviones', {
                metodo: 'POST',
                cuerpo: { ...avion, matricula: 'X' },
            })
        ).estado === 422,
    );
    const mantenimiento = await admin.pedir(`/api/aviones/${altaAvion.datos.idAvion}`, {
        metodo: 'PATCH',
        cuerpo: { ...avion, estadoOperativo: 'MANTENIMIENTO' },
    });
    verificar('RF-05 el administrador cambia el estado operativo', mantenimiento.estado === 200);

    seccion('Tabla 8 · Restricciones de acceso a catálogos (S-07)');
    verificar(
        'El empleado no gestiona aeronaves',
        (await empleado.pedir('/api/aviones')).estado === 403,
    );
    verificar(
        'El pasajero no registra aeropuertos',
        (await pasajero.pedir('/api/aeropuertos', { metodo: 'POST', cuerpo: datos })).estado ===
            403,
    );
    verificar(
        'El pasajero no accede a la pantalla de catálogos',
        (await pasajero.pedir('/admin/catalogos')).estado === 403,
    );
    const bitacora = await admin.pedir('/api/bitacora?modulo=Aeropuertos&accion=MODIFICACION');
    verificar(
        'CP-34 RF-17 la modificación del aeropuerto quedó en la bitácora',
        bitacora.datos.registros.some((r) =>
            r.detalle.includes(`id_aeropuerto=${alta.datos.idAeropuerto}`),
        ),
    );
}
