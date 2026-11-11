// =============================================================================
// Catálogo de casos de prueba del Manual de Calidad MC-SGA-001 (secciones 21 a 24)
// Base del reporte de ejecución con formato de la Tabla 42 (NC-01, Etapa 2).
//
// "evaluacion" indica cómo se ejecuta cada caso:
//   aceptacion   pruebas-aceptacion (HTTP y base de datos)
//   rendimiento  pruebas-rendimiento/rendimiento.mjs (Tabla 50)
//   restauracion db/respaldos/prueba_restauracion.sh (registro PR-xx)
//   manual       requiere personas o un periodo prolongado; no evaluable en
//                esta fase (Plan de auditoría §9.3)
//
// CP-23, CP-28 y CP-30 no existen en el manual (hallazgo de la Etapa 1).
// CP-14 se cita en la Tabla 19 pero no estaba definido: se propone en v2.1.
// =============================================================================

export const CASOS = [
    // ---------------------------------------------------------------- funcionales (Tabla 43)
    {
        cp: 'CP-01',
        requisito: 'RF-01',
        nombre: 'Registro de usuario con datos válidos',
        tipo: 'Funcional',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-02',
        requisito: 'RF-02',
        nombre: 'Bloqueo tras cinco intentos fallidos',
        tipo: 'Funcional',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-03',
        requisito: 'RF-03',
        nombre: 'Asignación y respeto del perfil de usuario',
        tipo: 'Funcional',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-04',
        requisito: 'RF-04',
        nombre: 'Alta de aeropuerto con código IATA inválido',
        tipo: 'Funcional',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-05',
        requisito: 'RF-05',
        nombre: 'Alta de aeronave con matrícula duplicada',
        tipo: 'Funcional',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-06',
        requisito: 'RF-06',
        nombre: 'Programación de vuelo con llegada anterior a la salida',
        tipo: 'Funcional',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-07',
        requisito: 'RF-07',
        nombre: 'Consulta de vuelos por origen, destino y fecha',
        tipo: 'Funcional',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-08',
        requisito: 'RF-08',
        nombre: 'Generación automática de asientos',
        tipo: 'Funcional',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-09',
        requisito: 'RF-09',
        nombre: 'Visualización de disponibilidad en tiempo real',
        tipo: 'Funcional',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-10',
        requisito: 'RF-10',
        nombre: 'Creación de reservación y código único',
        tipo: 'Funcional',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-12',
        requisito: 'RF-12',
        nombre: 'Cancelación de reservación y liberación del asiento',
        tipo: 'Funcional',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-13',
        requisito: 'RF-13',
        nombre: 'Registro de pago con monto incorrecto',
        tipo: 'Funcional',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-14',
        requisito: 'RF-14',
        nombre: 'Registro de pago aprobado y transición a PAGADA (propuesto en v2.1)',
        tipo: 'Funcional',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-15',
        requisito: 'RF-15',
        nombre: 'Check-in sobre reservación no pagada',
        tipo: 'Funcional',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-16',
        requisito: 'RF-16',
        nombre: 'Generación de reporte de ocupación',
        tipo: 'Funcional',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-17',
        requisito: 'RF-17',
        nombre: 'Registro en bitácora de una modificación',
        tipo: 'Funcional',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-18',
        requisito: 'RNF-05',
        nombre: 'Realización de tareas clave sin asistencia',
        tipo: 'Usabilidad',
        evaluacion: 'manual',
        motivo: 'Requiere una sesión con usuarios representativos de cada perfil (KPI-11).',
    },
    // ---------------------------------------------------------------- integración (Tabla 46)
    {
        cp: 'CP-11',
        requisito: 'RF-11',
        nombre: 'Dos solicitudes simultáneas sobre el mismo asiento',
        tipo: 'Integración',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-19',
        requisito: 'RNF-07',
        nombre: 'Verificación del bloqueo transaccional del asiento',
        tipo: 'Integración',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-20',
        requisito: 'RF-14',
        nombre: 'Fallo simulado durante el registro del pago',
        tipo: 'Integración',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-31',
        requisito: 'RF-08',
        nombre: 'Alta de aeronave y verificación de asientos generados',
        tipo: 'Integración',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-32',
        requisito: 'RF-15',
        nombre: 'Check-in tras el pago de una reservación',
        tipo: 'Integración',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-33',
        requisito: 'RN-09',
        nombre: 'Cancelación de un vuelo con reservaciones asociadas',
        tipo: 'Integración',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-34',
        requisito: 'RF-17',
        nombre: 'Verificación del registro en bitácora tras una integración',
        tipo: 'Integración',
        evaluacion: 'aceptacion',
    },
    // ---------------------------------------------------------------- rendimiento (Tabla 49)
    {
        cp: 'CP-21',
        requisito: 'RNF-01',
        nombre: 'Consulta de vuelos disponibles (≤ 3 s)',
        tipo: 'Rendimiento',
        evaluacion: 'rendimiento',
    },
    {
        cp: 'CP-35',
        requisito: 'RNF-01',
        nombre: 'Creación de una reservación completa (≤ 3 s)',
        tipo: 'Rendimiento',
        evaluacion: 'rendimiento',
    },
    {
        cp: 'CP-36',
        requisito: 'RNF-01',
        nombre: 'Registro de un pago (≤ 3 s)',
        tipo: 'Rendimiento',
        evaluacion: 'rendimiento',
    },
    {
        cp: 'CP-37',
        requisito: 'RNF-01',
        nombre: 'Generación de un reporte de ocupación (≤ 5 s)',
        tipo: 'Rendimiento',
        evaluacion: 'rendimiento',
    },
    {
        cp: 'CP-38',
        requisito: 'RNF-02',
        nombre: 'Comportamiento ante pico de solicitudes',
        tipo: 'Rendimiento',
        evaluacion: 'rendimiento',
    },
    {
        cp: 'CP-22',
        requisito: 'RNF-02',
        nombre: 'Disponibilidad del sistema en operación sostenida (≥ 99 %)',
        tipo: 'Rendimiento',
        evaluacion: 'manual',
        motivo: 'Requiere operación sostenida durante el periodo de medición de KPI-08 (mensual).',
    },
    {
        cp: 'CP-29',
        requisito: 'RNF-10',
        nombre: 'Restauración desde respaldo (≤ 30 min)',
        tipo: 'Recuperación',
        evaluacion: 'restauracion',
    },
    // ---------------------------------------------------------------- seguridad (Tabla 51)
    {
        cp: 'CP-24',
        requisito: 'S-01, S-05',
        nombre: 'Verificación del cifrado de credenciales',
        tipo: 'Seguridad',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-25',
        requisito: 'S-03, S-06, S-08',
        nombre: 'Intento de escalamiento de privilegios',
        tipo: 'Seguridad',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-26',
        requisito: 'S-10, S-11, S-13',
        nombre: 'Intento de inyección de código en formularios',
        tipo: 'Seguridad',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-27',
        requisito: 'S-14',
        nombre: 'Confirmación en operaciones irreversibles',
        tipo: 'Seguridad',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-39',
        requisito: 'S-02',
        nombre: 'Bloqueo de cuenta por intentos fallidos',
        tipo: 'Seguridad',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-40',
        requisito: 'S-04',
        nombre: 'Invalidación de sesión al cerrar sesión',
        tipo: 'Seguridad',
        evaluacion: 'aceptacion',
    },
    {
        cp: 'CP-41',
        requisito: 'S-12',
        nombre: 'No repudio de operaciones',
        tipo: 'Seguridad',
        evaluacion: 'aceptacion',
    },
];
