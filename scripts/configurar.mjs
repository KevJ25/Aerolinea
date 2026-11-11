// Genera o completa el archivo .env con contraseñas aleatorias seguras.
//   npm run configurar
// No sustituye valores que ya se cambiaron; solo completa los que faltan o
// conservan el texto de ejemplo. Funciona en Windows, macOS y Linux.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const SECRETOS = ['PGPASSWORD', 'SGA_API_CONTRASENA', 'SGA_RESPALDO_CLAVE'];
const LONGITUD = 32;

function nuevoSecreto() {
    return randomBytes(LONGITUD * 2)
        .toString('base64')
        .replace(/[+/=]/g, '')
        .slice(0, LONGITUD);
}

if (!existsSync('.env')) {
    copyFileSync('.env.ejemplo', '.env');
}
let contenido = readFileSync('.env', 'utf8').replace(/\r\n/g, '\n');
const generados = {};
for (const clave of SECRETOS) {
    const actual = contenido.match(new RegExp(`^${clave}=(.*)$`, 'm'))?.[1]?.trim() ?? '';
    if (actual === '' || actual.startsWith('cambie-')) {
        generados[clave] = nuevoSecreto();
        contenido = new RegExp(`^${clave}=`, 'm').test(contenido)
            ? contenido.replace(new RegExp(`^${clave}=.*$`, 'm'), `${clave}=${generados[clave]}`)
            : `${contenido.trimEnd()}\n${clave}=${generados[clave]}\n`;
    }
}
writeFileSync('.env', contenido);

const lista = Object.keys(generados);
if (lista.length === 0) {
    console.log('El archivo .env ya estaba completo; no se cambió nada.');
} else {
    console.log(`Archivo .env listo. Se generaron: ${lista.join(', ')}.`);
}
if (generados.SGA_RESPALDO_CLAVE) {
    let copiada = false;
    if (process.platform === 'win32') {
        try {
            execFileSync('clip', { input: generados.SGA_RESPALDO_CLAVE });
            copiada = true;
        } catch {
            copiada = false;
        }
    }
    console.log(
        copiada
            ? '\nLa frase de respaldos quedó en el portapapeles: péguela AHORA en el gestor de contraseñas del equipo.'
            : '\nGuarde la frase de respaldos (SGA_RESPALDO_CLAVE del archivo .env) en el gestor de contraseñas del equipo.',
    );
    console.log(
        'Sin ella no se puede restaurar ningún respaldo. No la comparta por chat ni en capturas.',
    );
}
if (generados.PGPASSWORD) {
    console.log(
        '\nSi ya tenía la base creada con otra contraseña, reiníciela con: docker compose down -v',
    );
}
