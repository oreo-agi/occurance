export const config = { runtime: 'edge' };

function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xFFFFFFFF;
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  // Mulberry32 PRNG - better distribution
  let s = seed | 0;
  return function() {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateAttractor(seed, width, height) {
  const rng = seededRandom(seed);

  // Clifford attractor with constrained parameters for good patterns
  const a = -2.0 + rng() * 1.5;
  const b = 0.5 + rng() * 1.5;
  const c = -1.5 + rng() * 1.0;
  const d = 0.5 + rng() * 1.5;

  let x = 0.1;
  let y = 0.1;

  const numPoints = 80000;
  const gridSize = 3;
  const cols = Math.ceil(width / gridSize);
  const rows = Math.ceil(height / gridSize);
  const grid = new Uint16Array(cols * rows);

  // Collect bounds first
  const xs = [];
  const ys = [];
  for (let i = 0; i < numPoints; i++) {
    const nx = Math.sin(a * y) + c * Math.cos(a * x);
    const ny = Math.sin(b * x) + d * Math.cos(b * y);
    x = nx;
    y = ny;
    if (i > 200) {
      xs.push(nx);
      ys.push(ny);
    }
  }

  // Compute bounds
  let minX = xs[0], maxX = xs[0], minY = ys[0], maxY = ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] < minX) minX = xs[i];
    if (xs[i] > maxX) maxX = xs[i];
    if (ys[i] < minY) minY = ys[i];
    if (ys[i] > maxY) maxY = ys[i];
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const pad = 60;
  const drawW = width - pad * 2;
  const drawH = height - pad * 2;

  // Populate density grid
  for (let i = 0; i < xs.length; i++) {
    const px = pad + ((xs[i] - minX) / rangeX) * drawW;
    const py = pad + ((ys[i] - minY) / rangeY) * drawH;
    const col = Math.floor(px / gridSize);
    const row = Math.floor(py / gridSize);
    if (col >= 0 && col < cols && row >= 0 && row < rows) {
      grid[row * cols + col]++;
    }
  }

  return { grid, cols, rows, gridSize };
}

function createSVG(title, width, height, seed) {
  const { grid, cols, rows, gridSize } = generateAttractor(seed, width, height);

  // Find max density for normalization
  let maxDensity = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] > maxDensity) maxDensity = grid[i];
  }
  if (maxDensity === 0) maxDensity = 1;

  // Use log scale for better contrast
  const logMax = Math.log(maxDensity + 1);

  // Build SVG circles
  let circles = '';
  let count = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const density = grid[row * cols + col];
      if (density > 0) {
        const logD = Math.log(density + 1) / logMax;
        const alpha = (0.08 + logD * 0.9).toFixed(3);
        const radius = (0.8 + logD * 1.8).toFixed(2);
        const cx = col * gridSize + gridSize / 2;
        const cy = row * gridSize + gridSize / 2;
        circles += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="rgba(255,255,255,${alpha})"/>`;
        count++;
      }
    }
  }

  // Escape title for SVG
  const safeTitle = title
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // Word wrap title
  const maxCharsPerLine = 28;
  const words = safeTitle.split(' ');
  const lines = [];
  let currentLine = '';
  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length > maxCharsPerLine && currentLine) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    }
  }
  if (currentLine.trim()) lines.push(currentLine.trim());

  const lineHeight = 48;
  const totalTextHeight = lines.length * lineHeight;
  const textStartY = height - 60 - totalTextHeight;

  let titleText = '';
  lines.forEach((line, i) => {
    titleText += `<text x="60" y="${textStartY + i * lineHeight}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="40" font-weight="700" fill="white" opacity="0.95">${line}</text>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#0a0a0a"/>
  <g>${circles}</g>
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a0a0a" stop-opacity="0"/>
      <stop offset="40%" stop-color="#0a0a0a" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#0a0a0a" stop-opacity="0.98"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${textStartY - 80}" width="${width}" height="${height - textStartY + 80}" fill="url(#g)"/>
  ${titleText}
  <text x="60" y="${height - 28}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="18" fill="white" opacity="0.4">agnivamahata.com</text>
</svg>`;
}

export default async function handler(req) {
  const url = new URL(req.url);
  const title = url.searchParams.get('title') || 'Agniva Mahata';
  const format = url.searchParams.get('format') || 'svg';
  const width = 1200;
  const height = 630;
  const seed = hashString(title);

  const svg = createSVG(title, width, height, seed);

  // Try to convert to PNG using resvg-wasm if available, otherwise serve SVG
  // Most crawlers (Twitter, Facebook, LinkedIn) accept SVG in og:image
  // but some (iMessage, Discord) prefer raster formats
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=604800, s-maxage=604800, immutable',
    },
  });
}
