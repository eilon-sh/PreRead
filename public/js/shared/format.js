function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncateFilename(name, maxLength = 36) {
  const filename = String(name || '');
  if (filename.length <= maxLength) return filename;

  const dotIndex = filename.lastIndexOf('.');
  const ext = dotIndex > 0 ? filename.slice(dotIndex) : '';
  const base = ext ? filename.slice(0, dotIndex) : filename;
  const budget = maxLength - ext.length - 1;

  if (budget <= 6) return `${filename.slice(0, maxLength - 1)}…`;

  const head = Math.ceil(budget * 0.55);
  const tail = budget - head;
  return `${base.slice(0, head)}…${base.slice(-tail)}${ext}`;
}
