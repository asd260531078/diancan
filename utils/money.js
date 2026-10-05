function roundMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

function formatMoney(value) {
  return String(roundMoney(value));
}

module.exports = { formatMoney, roundMoney };
