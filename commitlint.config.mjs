// Convención de mensajes de confirmación · sección 15.4 del Manual de Calidad
// Formato: tipo(CLAVE): descripción     ej. feat(RF-11): bloqueo de asiento en reserva concurrente
// La clave enlaza el commit con el requisito, defecto o cambio que atiende:
//   RF-xx / RNF-xx  requisito funcional o no funcional
//   DEF-xx          defecto registrado
//   SC-xx           solicitud de cambio aprobada (sección 16)
//   HU-xx           historia de usuario
//   base            infraestructura del repositorio sin requisito asociado (uso excepcional)
const CLAVE_TRAZABLE = /^((RF|RNF|DEF|SC|HU)-\d{2,3}|base)$/;

export default {
    extends: ['@commitlint/config-conventional'],
    plugins: [
        {
            rules: {
                'alcance-trazable': ({ scope }) => {
                    const claves = (scope ?? '').split(',').map((clave) => clave.trim());
                    const validas = scope && claves.every((clave) => CLAVE_TRAZABLE.test(clave));
                    return [
                        Boolean(validas),
                        'el alcance debe ser la clave trazable atendida, por ejemplo feat(RF-11): ... o fix(DEF-03): ...',
                    ];
                },
            },
        },
    ],
    rules: {
        'scope-empty': [2, 'never'],
        'scope-case': [0],
        'subject-case': [0],
        'alcance-trazable': [2, 'always'],
    },
};
