const fs = require('node:fs');
const path = require('node:path');

const BLOCK_START = '<!-- issue-triage:start -->';
const BLOCK_END = '<!-- issue-triage:end -->';
const RESULT_FILE = path.join(process.env.GITHUB_WORKSPACE || process.cwd(), 'triage', 'result.json');

const LABELS = {
  bug: { color: 'd73a4a', description: 'Algo no funciona como se espera' },
  enhancement: { color: 'a2eeef', description: 'Funcionalidad nueva o mejora' },
  question: { color: 'd876e3', description: 'Duda o consulta' },
  documentation: { color: '0075ca', description: 'Documentación' },
  'needs-triage': { color: 'fbca04', description: 'Requiere revisión manual' },
  'area:gameplay': { color: '1d76db', description: 'Jugabilidad y mecánicas' },
  'area:input': { color: '1d76db', description: 'Controles y entrada' },
  'area:rendering': { color: '1d76db', description: 'Renderizado y canvas' },
  'area:ui': { color: '1d76db', description: 'Interfaz y textos' },
  'area:docs': { color: '1d76db', description: 'Documentación y README' },
};

const AREAS = ['gameplay', 'input', 'rendering', 'ui', 'docs'];
const SEVERITIES = { low: 'baja', medium: 'media', high: 'alta' };
const MAX_LABELS = 4;

// El texto generado por el modelo se inserta en Markdown: se limpia para que no
// rompa el bloque ni los marcadores de idempotencia.
function clean(value, maxLength) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';

  return String(value)
    .replace(/\r\n/g, '\n')
    .replace(/<!--|-->/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/```/g, '')
    .replace(/^#{1,6}[ \t]+/gm, '')
    .replace(/@(?=[A-Za-z0-9_])/g, '@\u200b')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

function readResult() {
  const stats = fs.lstatSync(RESULT_FILE);
  if (!stats.isFile()) throw new Error('triage/result.json no es un archivo regular');
  if (stats.size > 20000) throw new Error('triage/result.json excede el tamaño máximo');

  const raw = fs.readFileSync(RESULT_FILE, 'utf8').trim();
  const withoutFences = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(withoutFences);
}

// Para campos que van en una sola línea del bloque: se colapsan los saltos.
function cleanInline(value, maxLength) {
  return clean(value, maxLength).replace(/\n+/g, ' ');
}

function buildBlock({ summary, severity, severityReason, area, areaDetail, labels, steps }) {
  const lines = [
    BLOCK_START,
    '## Información automática',
    '',
    `**Resumen:** ${summary}`,
    '',
    severityReason
      ? `**Severidad:** ${SEVERITIES[severity]} — ${severityReason}`
      : `**Severidad:** ${SEVERITIES[severity]}`,
    '',
    areaDetail ? `**Área del código:** ${areaDetail} (\`${area}\`)` : `**Área del código:** \`${area}\``,
    '',
    `**Etiquetas aplicadas:** ${labels.map((label) => `\`${label}\``).join(', ')}`,
    '',
    '**Pasos sugeridos**',
    ...steps.map((step, index) => `${index + 1}. ${step}`),
    '',
    '<sub>Generado automáticamente. El texto original no fue modificado.</sub>',
    BLOCK_END,
  ];
  return lines.join('\n');
}

// Reemplaza el bloque existente o lo añade al final, sin tocar el resto del cuerpo.
function spliceBlock(body, block) {
  // Se localizan todos los bloques antes de reconstruir para no confundir el
  // bloque recién insertado con uno preexistente.
  const ranges = [];
  let searchFrom = 0;

  for (;;) {
    const start = body.indexOf(BLOCK_START, searchFrom);
    if (start < 0) break;

    const end = body.indexOf(BLOCK_END, start + BLOCK_START.length);
    if (end < 0) {
      throw new Error('el cuerpo contiene un marcador de inicio sin cierre');
    }

    ranges.push([start, end + BLOCK_END.length]);
    searchFrom = end + BLOCK_END.length;
  }

  if (ranges.length === 0) {
    if (body.trim() === '') return block;
    const separator = body.endsWith('\n\n') ? '' : body.endsWith('\n') ? '\n' : '\n\n';
    return body + separator + block;
  }

  let result = '';
  let cursor = 0;

  ranges.forEach(([start, end], index) => {
    result += body.slice(cursor, start);
    // Solo se conserva un bloque: los duplicados se descartan.
    if (index === 0) result += block;
    cursor = end;
  });

  return result + body.slice(cursor);
}

async function ensureLabel(github, context, name) {
  const meta = LABELS[name];
  if (!meta) return;

  try {
    await github.rest.issues.createLabel({
      ...context.repo,
      name,
      color: meta.color,
      description: meta.description,
    });
  } catch (error) {
    // 422 = la etiqueta ya existe, que es el caso normal.
    if (error.status !== 422) throw error;
  }
}

module.exports = async ({ github, context, core }) => {
  const issue = context.payload.issue;

  const flagForManualTriage = async (reason) => {
    core.warning(reason);
    try {
      await ensureLabel(github, context, 'needs-triage');
      await github.rest.issues.addLabels({
        ...context.repo,
        issue_number: issue.number,
        labels: ['needs-triage'],
      });
    } catch (error) {
      core.error(`No se pudo aplicar needs-triage: ${error.message}`);
    }
  };

  let result;
  try {
    result = readResult();
  } catch (error) {
    await flagForManualTriage(`No se pudo leer triage/result.json: ${error.message}`);
    return;
  }

  const summary = clean(result.summary, 600);
  const severity = SEVERITIES[result.severity] ? result.severity : null;
  const severityReason = cleanInline(result.severity_reason, 300);
  const area = AREAS.includes(result.area) ? result.area : null;
  const areaDetail = cleanInline(result.area_detail, 200);
  const steps = (Array.isArray(result.suggested_steps) ? result.suggested_steps : [])
    .map((step) => clean(step, 300))
    .filter(Boolean)
    .slice(0, 5);
  const labels = [...new Set(
    (Array.isArray(result.labels) ? result.labels : []).filter((label) => Object.hasOwn(LABELS, label)),
  )].slice(0, MAX_LABELS);

  if (!summary || !severity || !area || steps.length === 0) {
    await flagForManualTriage('El informe de triage está incompleto o mal formado.');
    return;
  }

  if (labels.length === 0) labels.push('needs-triage');

  const block = buildBlock({ summary, severity, severityReason, area, areaDetail, labels, steps });
  const body = issue.body ?? '';

  let newBody;
  try {
    newBody = spliceBlock(body, block);
  } catch (error) {
    await flagForManualTriage(`No se pudo insertar el informe: ${error.message}`);
    return;
  }

  for (const name of labels) {
    await ensureLabel(github, context, name);
  }

  await github.rest.issues.addLabels({
    ...context.repo,
    issue_number: issue.number,
    labels,
  });

  if (newBody !== body) {
    await github.rest.issues.update({
      ...context.repo,
      issue_number: issue.number,
      body: newBody,
    });
  }

  core.info(`Triage aplicado al issue #${issue.number} con las etiquetas: ${labels.join(', ')}`);
};
