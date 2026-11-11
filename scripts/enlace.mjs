// Publica el sistema en un enlace https temporal con Cloudflare Tunnel.
//   npm run enlace
// No requiere cuenta. El enlace funciona mientras esta computadora y Docker
// estén encendidos, y cambia cada vez que se vuelve a iniciar el túnel.
import { execFileSync } from 'node:child_process';
import { setTimeout as esperar } from 'node:timers/promises';

const ESPERA_MAXIMA_S = 90;
const PATRON = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

execFileSync('docker', ['compose', '--profile', 'enlace', 'up', '-d', 'tunel'], {
    stdio: 'inherit',
});
console.log('\nEsperando el enlace público...');

for (let segundo = 0; segundo < ESPERA_MAXIMA_S; segundo += 2) {
    const registro = execFileSync('docker', ['compose', '--profile', 'enlace', 'logs', 'tunel'], {
        encoding: 'utf8',
    });
    const enlace = registro.match(PATRON)?.[0];
    if (enlace) {
        console.log(`\nEnlace del sistema:  ${enlace}\n`);
        console.log('Compártalo con el equipo auditor. Para cerrarlo: npm run enlace:cerrar');
        process.exit(0);
    }
    await esperar(2000);
}
console.error('No se obtuvo el enlace. Revise la conexión a internet y: docker compose logs tunel');
process.exit(1);
