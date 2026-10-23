// The only image conversion is browser-native canvas → PNG. No remote renderer,
// source URL, authentication token, or financial payload is written to settings.
export async function renderChart(payload) {
  const { categories, values } = payload.chart;
  if (!globalThis.document?.createElement) throw new Error('Chart insertion requires an Office browser canvas.');
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 110 + categories.length * 52;
  if (canvas.height > 16000) throw new Error('This chart has too many categories to insert.');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('The Office browser cannot render chart images.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#172b26';
  ctx.font = 'bold 24px Arial';
  ctx.fillText(payload.title, 24, 34, 1150);
  ctx.font = '16px Arial';
  ctx.fillText(`${payload.currency} · ${payload.binding.period} · Missing values are marked “Not available”`, 24, 65, 1150);
  const present = values.filter(v => v !== null);
  const min = Math.min(0, ...present), max = Math.max(0, ...present);
  // A zero-only series still gets a real zero baseline, never an invented bar.
  const span = max - min || 1;
  const x = value => 330 + (value - min) / span * 610;
  const zero = x(0);
  ctx.strokeStyle = '#a2b1aa';
  ctx.beginPath(); ctx.moveTo(zero, 85); ctx.lineTo(zero, canvas.height - 16); ctx.stroke();
  const format = value => new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100);
  categories.forEach((category, i) => {
    const top = 90 + i * 52, value = values[i];
    ctx.fillStyle = '#172b26'; ctx.font = '18px Arial';
    ctx.fillText(category, 24, top + 25, 285);
    if (value !== null) {
      ctx.fillStyle = value < 0 ? '#a64b3c' : '#276c57';
      ctx.fillRect(Math.min(zero, x(value)), top + 7, Math.abs(x(value) - zero), 28);
    }
    ctx.fillStyle = '#172b26'; ctx.font = '18px Arial';
    ctx.fillText(value === null ? 'Not available' : format(value), 964, top + 26, 215);
  });
  const url = canvas.toDataURL('image/png');
  if (!url.startsWith('data:image/png;base64,')) throw new Error('Chart image could not be rendered.');
  return {
    image: url.slice('data:image/png;base64,'.length),
    width: canvas.width,
    height: canvas.height,
    description: `${payload.title}. ${payload.currency}. ${categories.map((c, i) => `${c}: ${values[i] === null ? 'Not available' : format(values[i])}`).join('; ')}`,
  };
}
