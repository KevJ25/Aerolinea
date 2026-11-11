// =============================================================================
// Prueba de aceptación del Sprint 1 · Usuarios, roles y seguridad
// Se ejecuta con pruebas-aceptacion/ejecutar.mjs (npm run prueba:aceptacion).
// Recorre por HTTP, como lo haría un usuario o un auditor, los casos de prueba
// del Manual de Calidad: CP-01, CP-02, CP-03, CP-17, CP-24 y CP-25, y los
// controles S-03, S-04, S-06, S-08, S-13, RF-18 y RNF-12.
//
//   npm run prueba:aceptacion -- 1
//
// Requiere el sistema en ejecución (SGA_URL, por omisión http://127.0.0.1:3000)
// y una conexión administrativa a la base (variables PG* del archivo .env) para
// crear el administrador de prueba y verificar el cifrado (CP-24).
// Los usuarios que crea usan el dominio @prueba-aceptacion.mx.
// =============================================================================
import { BASE, correo, crearUsuario, Navegador, SUFIJO, verificar } from './comun.mjs';

function registrar(navegador, datos) {
    return navegador.pedir('/api/autenticacion/registro', {
        metodo: 'POST',
        cuerpo: { aceptaAviso: true, confirmacion: datos.contrasena, ...datos },
    });
}

export async function ejecutar(bd) {
    const CONTRASENA = 'Pasajero-2026!';
    const pasajero = correo('pasajero');
    const pasajero2 = correo('pasajero2');
    const admin = correo('admin');
    const CONTRASENA_ADMIN = 'Administrador-2026!';
    await crearUsuario(bd, 'Administración de prueba', admin, CONTRASENA_ADMIN, 'Administrador');

    console.log(
        `\nSistema: ${BASE}\n\n######## SPRINT 1 · Usuarios, roles y seguridad\n\n== Seguridad general`,
    );
    const anonimo = new Navegador();
    const pagina = await anonimo.pedir('/iniciar-sesion');
    verificar(
        'Política de seguridad de contenido presente',
        (pagina.encabezados.get('content-security-policy') ?? '').includes("default-src 'self'"),
    );
    verificar(
        'La página no se puede incrustar en otro sitio',
        pagina.encabezados.get('x-frame-options') === 'DENY',
    );
    const sinSesion = await anonimo.pedir('/admin/usuarios');
    verificar(
        'Una página protegida sin sesión redirige al inicio de sesión',
        sinSesion.estado === 302 && sinSesion.encabezados.get('location') === '/iniciar-sesion',
    );
    verificar(
        'La API protegida sin sesión responde 401',
        (await anonimo.pedir('/api/usuarios')).estado === 401,
    );

    console.log('\n== CP-01 Registro de usuario (RF-01)');
    const registro = await registrar(anonimo, {
        nombre: 'Pasajera de Prueba',
        correo: pasajero,
        contrasena: CONTRASENA,
    });
    verificar(
        'CP-01 el registro con datos válidos crea la cuenta y confirma',
        registro.estado === 201 && /correctamente/.test(registro.datos.mensaje),
        JSON.stringify(registro.datos),
    );
    const duplicado = await registrar(anonimo, {
        nombre: 'Otra',
        correo: pasajero.toUpperCase(),
        contrasena: CONTRASENA,
    });
    verificar(
        'RF-01 un correo ya registrado se rechaza, sin distinguir mayúsculas',
        duplicado.estado === 409 && /ya tiene una cuenta/.test(duplicado.datos.mensaje),
    );
    const debil = await registrar(anonimo, {
        nombre: 'Otra',
        correo: correo('debil'),
        contrasena: 'abc12345',
    });
    verificar(
        'S-05 una contraseña que no cumple la política se rechaza',
        debil.estado === 422 && /política/.test(debil.datos.mensaje),
    );
    const sinAviso = await registrar(anonimo, {
        nombre: 'Otra',
        correo: correo('aviso'),
        contrasena: CONTRASENA,
        aceptaAviso: false,
    });
    verificar('Sin aceptar el aviso de privacidad no se crea la cuenta', sinAviso.estado === 422);
    const invalido = await registrar(anonimo, {
        nombre: '   ',
        correo: 'no-es-correo',
        contrasena: CONTRASENA,
    });
    verificar('S-10 las entradas inválidas se rechazan en el servidor', invalido.estado === 422);
    await registrar(anonimo, { nombre: 'Pasajero Dos', correo: pasajero2, contrasena: CONTRASENA });

    console.log('\n== CP-24 Cifrado de credenciales (RNF-03, S-01)');
    const { rows: resumenes } = await bd.query(
        'SELECT correo, contrasena_hash FROM usuario WHERE correo = ANY($1)',
        [[pasajero, pasajero2]],
    );
    verificar(
        'CP-24 la contraseña se almacena como resumen Argon2id',
        resumenes.length === 2 &&
            resumenes.every((f) => f.contrasena_hash.startsWith('$argon2id$')),
    );
    verificar(
        'CP-24 el valor en texto claro no aparece en la base',
        resumenes.every((f) => !f.contrasena_hash.includes(CONTRASENA)),
    );
    verificar(
        'S-01 la misma contraseña produce resúmenes distintos (sal única)',
        resumenes[0].contrasena_hash !== resumenes[1].contrasena_hash,
    );

    console.log('\n== S-13 Mensajes genéricos');
    const inexistente = await anonimo.iniciarSesion(correo('nadie'), CONTRASENA);
    const incorrecta = await anonimo.iniciarSesion(pasajero, 'Incorrecta-2026!');
    verificar(
        'S-13 correo inexistente y contraseña incorrecta reciben el mismo mensaje',
        inexistente.estado === 401 &&
            incorrecta.estado === 401 &&
            inexistente.datos.mensaje === incorrecta.datos.mensaje,
    );

    console.log('\n== CP-26 Intento de inyección de código en formularios (S-10, S-11, S-13)');
    const inyeccionLogin = await anonimo.iniciarSesion("' OR 1=1 --", "' OR '1'='1");
    verificar(
        'CP-26 una inyección SQL en el correo del inicio de sesión se rechaza',
        inyeccionLogin.estado === 422,
    );
    const inyeccionClave = await anonimo.iniciarSesion(pasajero, "' OR '1'='1' --");
    verificar(
        'CP-26 una inyección SQL en la contraseña no permite entrar',
        inyeccionClave.estado === 401,
    );
    const nombreMalicioso = "Robert'); DROP TABLE usuario; -- <script>alert('x')</script>";
    const correoInyeccion = correo('inyeccion');
    const registroMalicioso = await registrar(anonimo, {
        nombre: nombreMalicioso,
        correo: correoInyeccion,
        contrasena: CONTRASENA,
    });
    const {
        rows: [guardado],
    } = await bd.query('SELECT nombre FROM usuario WHERE correo = $1', [correoInyeccion]);
    verificar(
        'CP-26 el texto con SQL y script se guarda literal, sin ejecutarse',
        registroMalicioso.estado === 201 && guardado?.nombre === nombreMalicioso,
    );
    const {
        rows: [tabla],
    } = await bd.query("SELECT to_regclass('public.usuario') IS NOT NULL AS existe");
    verificar(
        'CP-26 la base de datos no se alteró (la tabla de usuarios sigue existiendo)',
        tabla.existe === true,
    );
    verificar(
        'CP-26 la política de contenido impide ejecutar scripts en línea',
        /script-src 'self'/.test(pagina.encabezados.get('content-security-policy') ?? ''),
    );

    console.log('\n== CP-03 Perfil y menú (RF-03, S-07)');
    const navPasajero = new Navegador();
    const inicio = await navPasajero.iniciarSesion(pasajero, CONTRASENA);
    verificar(
        'RF-02 un usuario registrado inicia sesión',
        inicio.estado === 200 && inicio.datos.destino === '/vuelos',
    );
    verificar(
        'La cookie de sesión es HttpOnly y SameSite=Strict',
        /HttpOnly/i.test(inicio.encabezados.get('set-cookie')) &&
            /SameSite=Strict/i.test(inicio.encabezados.get('set-cookie')),
    );
    const sesionPasajero = await navPasajero.pedir('/api/autenticacion/sesion');
    verificar(
        'CP-03 la sesión del pasajero tiene perfil Pasajero',
        sesionPasajero.datos.rol === 'Pasajero',
    );
    verificar(
        'CP-03 el menú del pasajero no incluye funciones administrativas',
        !sesionPasajero.datos.menu.some((o) => o.ruta.startsWith('/admin')),
    );
    const perfil = await navPasajero.pedir('/api/perfil');
    verificar(
        'S-08 el pasajero consulta únicamente su propia información',
        perfil.estado === 200 && perfil.datos.correo === pasajero,
    );

    console.log('\n== CP-25 Intento de escalamiento de privilegios (RNF-04, CA-02)');
    const paginaAdmin = await navPasajero.pedir('/admin/usuarios');
    verificar(
        'CP-25 la URL administrativa responde 403 desde el servidor',
        paginaAdmin.estado === 403 && /No tiene permiso/.test(paginaAdmin.datos),
    );
    const apiAdmin = await navPasajero.pedir('/api/usuarios');
    verificar('CP-25 la API administrativa responde 403', apiAdmin.estado === 403);
    verificar(
        'S-13 el rechazo no revela el perfil requerido',
        !JSON.stringify(apiAdmin.datos).includes('Administrador'),
    );

    const inyeccionFiltro = await navPasajero.pedir(
        "/api/vuelos/buscar?origen=TLC'%20OR%20'1'='1&destino=CUN&fecha=2030-01-01",
    );
    verificar(
        'CP-26 una inyección en los filtros de búsqueda se rechaza como dato inválido',
        inyeccionFiltro.estado === 422,
        `${inyeccionFiltro.estado}`,
    );

    console.log('\n== CP-02 Bloqueo tras cinco intentos fallidos (RF-02, S-02)');
    const navAtaque = new Navegador();
    const intentos = [];
    for (let i = 0; i < 5; i += 1)
        intentos.push((await navAtaque.iniciarSesion(pasajero2, 'Equivocada-2026!')).estado);
    verificar(
        'CP-02 los intentos 1 a 4 se rechazan como credenciales incorrectas',
        intentos.slice(0, 4).every((e) => e === 401),
        intentos.join(','),
    );
    verificar(
        'CP-02 / CP-39 el quinto intento fallido bloquea la cuenta',
        intentos[4] === 423,
        intentos.join(','),
    );
    const sexto = await navAtaque.iniciarSesion(pasajero2, CONTRASENA);
    verificar(
        'CP-02 / CP-39 al sexto intento la cuenta sigue bloqueada aun con la contraseña correcta',
        sexto.estado === 423 && /24 horas/.test(sexto.datos.mensaje),
    );

    console.log('\n== Administración (RF-03, RF-18)');
    const navAdmin = new Navegador();
    const inicioAdmin = await navAdmin.iniciarSesion(admin, CONTRASENA_ADMIN);
    verificar(
        'El administrador inicia sesión y va a la gestión de usuarios',
        inicioAdmin.datos.destino === '/admin/usuarios',
    );
    verificar(
        'El administrador accede a la página administrativa',
        (await navAdmin.pedir('/admin/usuarios')).estado === 200,
    );
    const lista = await navAdmin.pedir(`/api/usuarios?buscar=${encodeURIComponent(SUFIJO)}`);
    const bloqueado = lista.datos.find((u) => u.correo === pasajero2);
    verificar('La lista muestra la cuenta bloqueada', bloqueado?.estado === 'Bloqueado');
    const bitacoraDenegado = await navAdmin.pedir('/api/bitacora?accion=ACCESO');
    verificar(
        'CP-25 el intento de escalamiento quedó en la bitácora con el usuario',
        bitacoraDenegado.datos.registros.some(
            (r) => r.correo === pasajero && r.detalle === 'Acceso denegado a GET /admin/usuarios',
        ),
    );
    verificar(
        'RF-18 el administrador desbloquea la cuenta',
        (
            await navAdmin.pedir(`/api/usuarios/${bloqueado.idUsuario}/desbloquear`, {
                metodo: 'POST',
            })
        ).estado === 200,
    );
    verificar(
        'RF-18 tras el desbloqueo el usuario inicia sesión',
        (await navAtaque.iniciarSesion(pasajero2, CONTRASENA)).estado === 200,
    );

    const empleado = correo('empleado');
    const alta = await navAdmin.pedir('/api/usuarios', {
        metodo: 'POST',
        cuerpo: {
            nombre: 'Empleado de Prueba',
            correo: empleado,
            contrasena: 'Empleado-2026!',
            rol: 'Empleado',
        },
    });
    verificar('RF-03 el administrador da de alta un empleado', alta.estado === 201);
    const navEmpleado = new Navegador();
    await navEmpleado.iniciarSesion(empleado, 'Empleado-2026!');
    const sesionEmpleado = await navEmpleado.pedir('/api/autenticacion/sesion');
    verificar(
        'CP-03 el empleado tiene su perfil y no ve funciones administrativas',
        sesionEmpleado.datos.rol === 'Empleado' &&
            !sesionEmpleado.datos.menu.some((o) => o.ruta.startsWith('/admin')),
    );
    verificar(
        'S-07 el empleado no consulta la bitácora',
        (await navEmpleado.pedir('/api/bitacora')).estado === 403,
    );

    console.log('\n== CP-17 Bitácora de una modificación (RF-17, CA-11)');
    const cambio = await navAdmin.pedir(`/api/usuarios/${alta.datos.idUsuario}`, {
        metodo: 'PATCH',
        cuerpo: { rol: 'Pasajero' },
    });
    verificar('RF-03 el administrador cambia el perfil de un usuario', cambio.estado === 200);
    const bitacoraCambio = await navAdmin.pedir(
        '/api/bitacora?accion=MODIFICACION&modulo=Usuarios',
    );
    const registroCambio = bitacoraCambio.datos.registros.find(
        (r) =>
            r.detalle.includes(`id_usuario=${alta.datos.idUsuario}`) &&
            r.detalle.includes('id_rol: 2 → 3'),
    );
    verificar(
        'CP-17 la modificación registra usuario, fecha, hora, acción y módulo',
        registroCambio &&
            registroCambio.correo === admin &&
            registroCambio.fechaHora &&
            registroCambio.modulo === 'Usuarios',
        JSON.stringify(registroCambio),
    );
    verificar(
        'S-06 el cambio de perfil se aplica en la siguiente petición del usuario',
        (await navEmpleado.pedir('/api/autenticacion/sesion')).datos.rol === 'Pasajero',
    );
    const idAdmin = (await navAdmin.pedir('/api/perfil')).datos.idUsuario;
    const autodegradacion = await navAdmin.pedir(`/api/usuarios/${idAdmin}`, {
        metodo: 'PATCH',
        cuerpo: { rol: 'Pasajero' },
    });
    verificar(
        'El administrador no puede quitarse su propio perfil',
        autodegradacion.estado === 403,
    );

    console.log('\n== RNF-12 Baja con confirmación explícita (S-14, V-12)');
    const bajaSinConfirmar = await navAdmin.pedir(`/api/usuarios/${alta.datos.idUsuario}/baja`, {
        metodo: 'POST',
        cuerpo: { confirmacion: 'otro@correo.mx' },
    });
    verificar(
        'CP-27 RNF-12 la baja sin la confirmación correcta se rechaza',
        bajaSinConfirmar.estado === 422,
    );
    const baja = await navAdmin.pedir(`/api/usuarios/${alta.datos.idUsuario}/baja`, {
        metodo: 'POST',
        cuerpo: { confirmacion: empleado },
    });
    verificar('CP-27 RNF-12 con la confirmación correcta la baja procede', baja.estado === 200);
    verificar(
        'La baja cierra la sesión abierta del usuario',
        (await navEmpleado.pedir('/api/autenticacion/sesion')).estado === 401,
    );
    verificar(
        'Un usuario dado de baja no puede iniciar sesión',
        (await new Navegador().iniciarSesion(empleado, 'Empleado-2026!')).estado === 401,
    );
    const {
        rows: [fila],
    } = await bd.query('SELECT activo FROM usuario WHERE correo = $1', [empleado]);
    verificar(
        'V-12 la baja es lógica: el registro se conserva inactivo',
        fila && fila.activo === false,
    );
    const bitacoraBaja = await navAdmin.pedir('/api/bitacora?accion=BAJA');
    verificar(
        'CP-41 RF-17 la baja quedó en la bitácora con usuario, fecha, hora, acción y módulo',
        bitacoraBaja.datos.registros.some((r) =>
            r.detalle.includes(`id_usuario=${alta.datos.idUsuario}`),
        ),
    );

    console.log('\n== S-04 Cierre de sesión');
    const cookieAnterior = navPasajero.cookie;
    verificar(
        'S-04 el usuario cierra sesión',
        (await navPasajero.pedir('/api/autenticacion/cerrar-sesion', { metodo: 'POST' })).estado ===
            200,
    );
    const reutilizado = new Navegador();
    reutilizado.cookie = cookieAnterior;
    verificar(
        'CP-40 S-04 el identificador de la sesión cerrada ya no es válido',
        (await reutilizado.pedir('/api/autenticacion/sesion')).estado === 401,
    );

    console.log('\n== S-03 Expiración por inactividad');
    const navInactivo = new Navegador();
    await navInactivo.iniciarSesion(pasajero2, CONTRASENA);
    await bd.query(
        "UPDATE sesion SET ultimo_uso = now() - interval '31 minutes' WHERE id_usuario = (SELECT id_usuario FROM usuario WHERE correo = $1) AND cerrada_en IS NULL",
        [pasajero2],
    );
    verificar(
        'S-03 tras 30 minutos de inactividad la sesión expira',
        (await navInactivo.pedir('/api/autenticacion/sesion')).estado === 401,
    );

    console.log('\n== Validación de filtros');
    verificar(
        'S-10 una fecha inválida en los filtros se rechaza',
        (await navAdmin.pedir('/api/bitacora?desde=ayer')).estado === 422,
    );
    const soloBajas = await navAdmin.pedir('/api/bitacora?accion=BAJA');
    verificar(
        'El filtro por acción de la bitácora funciona',
        soloBajas.datos.registros.every((r) => r.accion === 'BAJA'),
    );
}
