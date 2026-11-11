// =============================================================================
// Evidencia de gestión de configuración en Git · NC-04 (Etapa 2)
// Manual §14.1 (Tabla 22) y §15.1 a §15.4 (Figura 20) · criterios V-19 y V-20
//   npm run evidencia:git
//
// Genera evidencias/git/evidencia-git-<fecha>.md con: ramas locales y remotas,
// verificación del flujo (main, develop, feature/*), etiquetas de líneas base,
// grafo del historial y revisión de la convención de mensajes de cada commit.
// =============================================================================
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const CONVENCION =
    /^(feat|fix|test|docs|refactor|chore|ci|build|perf|style|revert)\(((RF|RNF|DEF|SC|HU)-\d{2,3}|base)(,\s*((RF|RNF|DEF|SC|HU)-\d{2,3}|base))*\): \S/;
const COMMITS_REVISADOS = 200;
const DIRECTORIO = 'evidencias/git';

function git(...argumentos) {
    return execFileSync('git', argumentos, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
}

try {
    git('rev-parse', '--is-inside-work-tree');
} catch {
    console.error(
        'Esta carpeta no es un repositorio Git. Consulte docs/git-flujo.md para inicializarlo.',
    );
    process.exit(1);
}

const ramas = git('branch', '-a', '--format=%(refname:short)').split('\n').filter(Boolean);
const tieneMain = ramas.some((r) => /(^|\/)main$/.test(r));
const tieneDevelop = ramas.some((r) => /(^|\/)develop$/.test(r));
const ramasFeature = ramas.filter((r) => /(^|\/)(feature|fix|release|hotfix)\//.test(r));
const etiquetas = git('tag', '--list', '-n1').split('\n').filter(Boolean);

// Commits sin fusiones: los de fusión los genera la plataforma con su propio texto
const commits = git(
    'log',
    '--all',
    '--no-merges',
    `-n${COMMITS_REVISADOS}`,
    '--format=%h%x09%ad%x09%an%x09%s',
    '--date=short',
)
    .split('\n')
    .filter(Boolean)
    .map((linea) => {
        const [hash, fecha, autor, ...mensaje] = linea.split('\t');
        const asunto = mensaje.join('\t');
        return { hash, fecha, autor, asunto, cumple: CONVENCION.test(asunto) };
    });
const cumplen = commits.filter((c) => c.cumple).length;
const grafo = git('log', '--all', '--graph', '--decorate', '--oneline', '-n60');
const remoto = (() => {
    try {
        return git('remote', '-v').split('\n')[0] ?? 'Sin remoto';
    } catch {
        return 'Sin remoto';
    }
})();

const verificacion = (ok) => (ok ? 'Cumple' : 'No cumple');
const escapar = (texto) => texto.replace(/\|/g, '\\|');
const ahora = new Date();
const documento = [
    '# Evidencia de gestión de configuración en Git (NC-04)',
    '',
    `Generada el ${ahora.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })} con \`npm run evidencia:git\`. Remoto: \`${remoto}\`. Commit actual: \`${git('rev-parse', '--short', 'HEAD')}\` en la rama \`${git('rev-parse', '--abbrev-ref', 'HEAD')}\`.`,
    '',
    '## Verificación del flujo de ramas (§15.1, Figura 20)',
    '',
    '| Criterio | Resultado | Evidencia |',
    '| --- | --- | --- |',
    `| Existe la rama main | ${verificacion(tieneMain)} | ${ramas.filter((r) => /main$/.test(r)).join(', ') || '—'} |`,
    `| Existe la rama develop | ${verificacion(tieneDevelop)} | ${ramas.filter((r) => /develop$/.test(r)).join(', ') || '—'} |`,
    `| Se trabaja en ramas feature/*, fix/*, release/* o hotfix/* | ${verificacion(ramasFeature.length > 0)} | ${ramasFeature.length} ramas |`,
    `| Líneas base etiquetadas (LB-n) | ${verificacion(etiquetas.some((e) => /^LB-/.test(e)))} | ${etiquetas.length ? etiquetas.map(escapar).join('; ') : 'Sin etiquetas'} |`,
    `| Mensajes de commit con la convención de §15.4 | ${verificacion(commits.length > 0 && cumplen === commits.length)} | ${cumplen} de ${commits.length} commits revisados |`,
    '',
    '## Ramas',
    '',
    ...ramas.map((r) => `- \`${r}\``),
    '',
    '## Historial (grafo de las últimas 60 confirmaciones)',
    '',
    '```',
    grafo,
    '```',
    '',
    '## Revisión de la convención de mensajes',
    '',
    '| Commit | Fecha | Autor | Mensaje | Convención |',
    '| --- | --- | --- | --- | --- |',
    ...commits.map(
        (c) =>
            `| \`${c.hash}\` | ${c.fecha} | ${escapar(c.autor)} | ${escapar(c.asunto)} | ${c.cumple ? 'Cumple' : 'No cumple'} |`,
    ),
    '',
].join('\n');

mkdirSync(DIRECTORIO, { recursive: true });
const ruta = `${DIRECTORIO}/evidencia-git-${ahora.toISOString().slice(0, 16).replace(/[-:T]/g, '')}.md`;
writeFileSync(ruta, documento);
console.log(
    `main: ${verificacion(tieneMain)} · develop: ${verificacion(tieneDevelop)} · ramas de trabajo: ${ramasFeature.length} · commits con convención: ${cumplen}/${commits.length}`,
);
console.log(`Evidencia de Git: ${ruta}`);
