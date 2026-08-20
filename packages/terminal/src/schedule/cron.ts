/**
 * Minimal cron parser
 *
 * Five fields: `minuto hora dia-del-mes mes dia-de-semana`.
 * Escrito a mano en vez de traer una dependencia: el subconjunto que necesitamos
 * es pequeño y una librería de cron es superficie de suministro por algo que cabe
 * en un fichero.
 *
 * Soporta `*`, números, listas `1,2`, rangos `1-5` y pasos `*` / `n-m` con `/k`.
 * NO soporta los atajos con nombre (`@daily`, `MON`): un cron que no entendemos
 * se **rechaza** en vez de interpretarse a medias, porque una tarea que corre a
 * una hora que nadie pidió es peor que una que no corre.
 */

export interface CronFields {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
}

const RANGES: Array<[number, number]> = [
  [0, 59], // minuto
  [0, 23], // hora
  [1, 31], // dia del mes
  [1, 12], // mes
  [0, 6], // dia de semana (0 = domingo)
];

/** Expande un campo a la lista de valores que casan, o null si no es válido. */
export function parseField(field: string, min: number, max: number): number[] | null {
  const values = new Set<number>();

  for (const part of field.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) return null;

    const [rangePart, stepPart] = trimmed.split("/");
    if (stepPart !== undefined && !/^\d+$/.test(stepPart)) return null;
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (step <= 0) return null;

    let from: number;
    let to: number;

    if (rangePart === "*") {
      from = min;
      to = max;
    } else if (/^\d+$/.test(rangePart ?? "")) {
      from = Number(rangePart);
      to = stepPart === undefined ? from : max;
    } else if (/^\d+-\d+$/.test(rangePart ?? "")) {
      const [a, b] = (rangePart as string).split("-").map(Number);
      from = a as number;
      to = b as number;
      if (from > to) return null;
    } else {
      return null;
    }

    if (from < min || to > max) return null;
    for (let v = from; v <= to; v += step) values.add(v);
  }

  return values.size > 0 ? [...values].sort((a, b) => a - b) : null;
}

export function parseCron(expression: string): CronFields | null {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return null;

  const parsed = fields.map((f, i) => {
    const [min, max] = RANGES[i] as [number, number];
    return parseField(f, min, max);
  });

  if (parsed.some((p) => p === null)) return null;
  const [minutes, hours, daysOfMonth, months, daysOfWeek] = parsed as number[][];

  return {
    minutes: minutes as number[],
    hours: hours as number[],
    daysOfMonth: daysOfMonth as number[],
    months: months as number[],
    daysOfWeek: daysOfWeek as number[],
  };
}

/** Cuántos minutos se miran hacia adelante antes de rendirse (~2 años). */
const MAX_LOOKAHEAD_MINUTES = 366 * 24 * 60 * 2;

/**
 * Próxima ejecución **estrictamente posterior** a `from`.
 *
 * Estrictamente: si no, una tarea que acaba de correr volvería a dispararse en el
 * mismo minuto una y otra vez.
 *
 * Devuelve null cuando la expresión no puede cumplirse nunca (por ejemplo
 * `0 0 31 2 *`, 31 de febrero) en lugar de girar sin fin.
 */
export function nextRun(cron: CronFields, from: Date): Date | null {
  const d = new Date(from.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);

  for (let i = 0; i < MAX_LOOKAHEAD_MINUTES; i++) {
    if (
      cron.months.includes(d.getMonth() + 1) &&
      cron.daysOfMonth.includes(d.getDate()) &&
      cron.daysOfWeek.includes(d.getDay()) &&
      cron.hours.includes(d.getHours()) &&
      cron.minutes.includes(d.getMinutes())
    ) {
      return d;
    }
    d.setMinutes(d.getMinutes() + 1);
  }

  return null;
}

/** Atajo: parsea y calcula. Null si el cron es inválido o irrealizable. */
export function nextRunFor(expression: string, from: Date = new Date()): Date | null {
  const cron = parseCron(expression);
  return cron ? nextRun(cron, from) : null;
}
