function validTimestamp(value) {
  if (typeof value !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!m || !Number.isFinite(Date.parse(value))) return false;
  const [, y, mo, d, h, mi, s, zone] = m;
  const days = new Date(Date.UTC(Number(y), Number(mo), 0)).getUTCDate();
  return +y >= 2000 && +mo >= 1 && +mo <= 12 && +d >= 1 && +d <= days && +h < 24 && +mi < 60 && +s < 60
    && (zone === 'Z' || (+zone.slice(1, 3) <= 14 && +zone.slice(4) < 60 && (+zone.slice(1, 3) < 14 || +zone.slice(4) === 0)));
}
module.exports = { validTimestamp };
