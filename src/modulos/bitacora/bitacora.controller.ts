import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../comun/autorizacion/autorizacion.decoradores';
import { Rol } from '../../comun/autorizacion/rol.enum';
import { BaseDatosService } from '../../comun/base-datos/base-datos.service';
import { EntradaInvalida, textoOpcional } from '../../comun/validacion/validacion';

const REGISTROS_POR_PAGINA = 50;
const LONGITUD_MAXIMA_FILTRO = 30;
const ACCIONES = ['ALTA', 'MODIFICACION', 'BAJA', 'ACCESO', 'ERROR'];
const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

interface RegistroBitacora {
    idBitacora: number;
    fechaHora: string;
    idUsuario: number | null;
    correo: string | null;
    accion: string;
    modulo: string;
    detalle: string;
}

function fechaOpcional(valor: unknown): string | null {
    const texto = textoOpcional(valor, LONGITUD_MAXIMA_FILTRO);
    if (texto === '') {
        return null;
    }
    if (!PATRON_FECHA.test(texto) || Number.isNaN(Date.parse(texto))) {
        throw new EntradaInvalida('Escriba las fechas con el formato AAAA-MM-DD.');
    }
    return texto;
}

/** [RF-17][HU-15][CA-11] Consulta de la bitácora, solo para el administrador */
@Roles(Rol.Administrador)
@Controller('api/bitacora')
export class BitacoraController {
    constructor(private readonly baseDatos: BaseDatosService) {}

    @Get()
    async consultar(
        @Query('accion') accion: unknown,
        @Query('modulo') modulo: unknown,
        @Query('desde') desde: unknown,
        @Query('hasta') hasta: unknown,
        @Query('pagina') pagina: unknown,
    ) {
        const filtroAccion = textoOpcional(accion, LONGITUD_MAXIMA_FILTRO).toUpperCase();
        if (filtroAccion !== '' && !ACCIONES.includes(filtroAccion)) {
            throw new EntradaInvalida('Seleccione una acción válida.');
        }
        const numeroPagina = Math.max(1, Number.parseInt(String(pagina ?? '1'), 10) || 1);
        const registros = await this.baseDatos.consultar<RegistroBitacora>(
            `SELECT b.id_bitacora AS "idBitacora", b.fecha_hora AS "fechaHora", b.id_usuario AS "idUsuario",
                    u.correo, b.accion, b.modulo, b.detalle
             FROM bitacora b LEFT JOIN usuario u USING (id_usuario)
             WHERE ($1 = '' OR b.accion = $1)
               AND ($2 = '' OR b.modulo = $2)
               AND ($3::date IS NULL OR b.fecha_hora >= ($3::date)::timestamp AT TIME ZONE 'America/Mexico_City')
               AND ($4::date IS NULL OR b.fecha_hora < ($4::date + 1)::timestamp AT TIME ZONE 'America/Mexico_City')
             ORDER BY b.id_bitacora DESC
             LIMIT $5 OFFSET $6`,
            [
                filtroAccion,
                textoOpcional(modulo, LONGITUD_MAXIMA_FILTRO),
                fechaOpcional(desde),
                fechaOpcional(hasta),
                REGISTROS_POR_PAGINA + 1,
                (numeroPagina - 1) * REGISTROS_POR_PAGINA,
            ],
        );
        const modulos = await this.baseDatos.consultar<{ modulo: string }>(
            'SELECT DISTINCT modulo FROM bitacora ORDER BY modulo',
        );
        return {
            pagina: numeroPagina,
            haySiguiente: registros.length > REGISTROS_POR_PAGINA,
            registros: registros.slice(0, REGISTROS_POR_PAGINA),
            acciones: ACCIONES,
            modulos: modulos.map((fila) => fila.modulo),
        };
    }
}
