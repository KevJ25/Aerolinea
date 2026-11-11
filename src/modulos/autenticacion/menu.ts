import { Rol } from '../../comun/autorizacion/rol.enum';

export interface OpcionMenu {
    etiqueta: string;
    ruta: string;
}

/**
 * [RF-03][CP-03][S-07] El menú lo define el servidor según el perfil (Tabla 8):
 * cada perfil ve únicamente las funciones disponibles para él. El pasajero paga
 * desde Mis reservaciones.
 */
const MENU_POR_ROL: Record<Rol, OpcionMenu[]> = {
    [Rol.Administrador]: [
        { etiqueta: 'Usuarios y roles', ruta: '/admin/usuarios' },
        { etiqueta: 'Aeropuertos y aviones', ruta: '/admin/catalogos' },
        { etiqueta: 'Rutas y vuelos', ruta: '/admin/vuelos' },
        { etiqueta: 'Reservaciones', ruta: '/reservaciones' },
        { etiqueta: 'Reportes', ruta: '/admin/reportes' },
        { etiqueta: 'Bitácora', ruta: '/admin/bitacora' },
        { etiqueta: 'Mi cuenta', ruta: '/inicio' },
    ],
    [Rol.Empleado]: [
        { etiqueta: 'Vuelos', ruta: '/vuelos' },
        { etiqueta: 'Reservaciones', ruta: '/reservaciones' },
        { etiqueta: 'Check-in', ruta: '/check-in' },
        { etiqueta: 'Mi cuenta', ruta: '/inicio' },
    ],
    [Rol.Pasajero]: [
        { etiqueta: 'Buscar vuelos', ruta: '/vuelos' },
        { etiqueta: 'Mis reservaciones', ruta: '/mis-reservaciones' },
        { etiqueta: 'Mi cuenta', ruta: '/inicio' },
    ],
};

export function menuDe(rol: Rol): OpcionMenu[] {
    return MENU_POR_ROL[rol];
}

/** Página a la que se dirige a cada perfil al iniciar sesión */
export function destinoInicial(rol: Rol): string {
    return rol === Rol.Administrador ? '/admin/usuarios' : '/vuelos';
}
