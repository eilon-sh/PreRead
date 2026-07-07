(() => {
  const params = new URLSearchParams(window.location.search);
  const documentId = params.get('documentId') || '';
  const wordsTable = document.getElementById('wordsTable');
  const studyLink = document.getElementById('studyLink');
  const printMode = params.get('printCards') === '1';

  if (printMode) {
    document.querySelector('.filters')?.classList.add('d-none');
  }

  function updateStudyLink() {
    const query = new URLSearchParams();
    if (documentId) query.set('documentId', documentId);
    studyLink.href = `/study${query.toString() ? `?${query.toString()}` : ''}`;
  }

  function escapeCell(text) {
    return escapeHtml(text || '-');
  }

  function toCardBackText(word) {
    const parts = [
      word.definition ? `הגדרה: ${word.definition}` : '',
      word.translation ? `תרגום: ${word.translation}` : '',
      word.context ? `הקשר: ${word.context}` : '',
    ].filter(Boolean);
    return parts.join('\n');
  }

  function buildBackOrder(words) {
    const ordered = [];
    for (let i = 0; i < words.length; i += 2) {
      const left = words[i];
      const right = words[i + 1];
      if (right) ordered.push(right);
      if (left) ordered.push(left);
    }
    return ordered;
  }

  function renderDuplexGuideHtml() {
    return `
      <aside class="duplex-guide no-print" id="duplexGuide" aria-label="הנחיית הדפסה דו-צדדית">
        <div class="duplex-guide-header">
          <div>
            <p class="duplex-guide-title">הדפסה דו-צדדית נדרשת</p>
          </div>
          <button class="btn btn-sm btn-outline-secondary" type="button" id="duplexGuideDismiss" aria-label="סגור והסתר">
            הבנתי
          </button>
        </div>
        <div class="duplex-guide-visual">
          <div class="duplex-guide-scene">
            <svg class="duplex-guide-printer" width="56" height="44" viewBox="0 0 72 56" fill="none" aria-hidden="true">
              <rect x="14" y="22" width="44" height="26" rx="3" fill="currentColor" opacity="0.15"></rect>
              <rect x="14" y="22" width="44" height="26" rx="3" stroke="currentColor" stroke-width="1.5"></rect>
              <rect x="20" y="6" width="32" height="18" rx="2" stroke="currentColor" stroke-width="1.5"></rect>
              <rect x="18" y="34" width="36" height="14" rx="2" fill="currentColor" opacity="0.25"></rect>
            </svg>
            <div class="duplex-guide-perspective">
              <div class="duplex-guide-paper">
                <div class="duplex-guide-paper-face front">
                  <small>צד קדמי</small>
                  <strong>1</strong>
                  <div class="duplex-guide-paper-line"></div>
                  <div class="duplex-guide-paper-line short"></div>
                </div>
                <div class="duplex-guide-paper-face back">
                  <small>צד אחורי</small>
                  <strong>2</strong>
                  <div class="duplex-guide-paper-line"></div>
                  <div class="duplex-guide-paper-line short"></div>
                </div>
              </div>
            </div>
          </div>
          <div class="duplex-guide-caption" aria-live="polite">
            <span class="duplex-caption-step">צד קדמי - חזית הכרטיסיות</span>
            <span class="duplex-caption-step">צד אחורי - גב הכרטיסיות</span>
          </div>
          <div class="duplex-guide-dots" aria-hidden="true">
            <span class="duplex-guide-dot"></span>
            <span class="duplex-guide-dot"></span>
          </div>
        </div>
      </aside>
    `;
  }

  function initDuplexGuide() {
    const guide = document.getElementById('duplexGuide');
    const dismissBtn = document.getElementById('duplexGuideDismiss');
    if (!guide || !dismissBtn) return;

    const storageKey = 'preread.duplexGuide.dismissed';
    if (localStorage.getItem(storageKey) === '1') {
      guide.remove();
      return;
    }

    dismissBtn.addEventListener('click', () => {
      localStorage.setItem(storageKey, '1');
      guide.remove();
    });
  }

  function renderPrintLayout(words) {
    const frontCards = words
      .map(
        (w) => `
      <article class="print-card">
        <h3>${escapeCell(w.word)}</h3>
      </article>
    `,
      )
      .join('');

    const backCards = buildBackOrder(words)
      .map(
        (w) => `
      <article class="print-card print-card-back">
        <p>${escapeCell(toCardBackText(w)).replace(/\n/g, '<br>')}</p>
      </article>
    `,
      )
      .join('');

    wordsTable.innerHTML = `
      ${renderDuplexGuideHtml()}
      <div class="print-toolbar no-print d-flex flex-wrap gap-2 mb-3">
        <button class="btn btn-primary btn-sm" id="printBtn" type="button">הדפס עכשיו</button>
        <a href="/words${window.location.search.replace(/([?&])printCards=1(&?)/, '$1').replace(/[?&]$/, '')}" class="btn btn-secondary btn-sm">חזרה לטבלה</a>
      </div>
      <section class="print-sheet">
        <h2 class="h6">חזית הכרטיסיות</h2>
        <div class="print-grid">${frontCards}</div>
      </section>
      <section class="print-sheet print-back-page">
        <h2 class="h6">גב הכרטיסיות (להדפסה בצד השני)</h2>
        <div class="print-grid">${backCards}</div>
      </section>
    `;

    const printBtn = document.getElementById('printBtn');
    if (printBtn) {
      printBtn.addEventListener('click', () => window.print());
    }
    initDuplexGuide();
  }

  async function loadWords() {
    const query = new URLSearchParams();
    if (documentId) query.set('documentId', documentId);

    const res = await apiFetch(`/api/v1/words?${query.toString()}`);
    if (isRateLimited(res)) {
      wordsTable.innerHTML = rateLimitPlaceholder();
      return;
    }
    const data = await res.json();
    updateStudyLink();

    if (data.words.length === 0) {
      const emptyMessage = documentId
        ? 'לא נמצאו מילים במסמך הזה. נסה להעלות מסמך אחר או לשנות את רמת ה-CEFR.'
        : 'אין מילים. <a href="/upload">העלה PDF</a> כדי להתחיל.';
      wordsTable.innerHTML = `<p class="text-muted mb-0">${emptyMessage}</p>`;
      return;
    }

    if (printMode) {
      renderPrintLayout(data.words);
      return;
    }

    wordsTable.innerHTML = `
      <table class="table table-sm table-hover align-middle mb-0">
        <thead class="table-light">
          <tr>
            <th>מילה</th>
            <th>רמה</th>
            <th>הגדרה</th>
            <th>תרגום</th>
            <th>הקשר</th>
            <th>חזרה הבאה</th>
          </tr>
        </thead>
        <tbody>
          ${data.words
            .map(
              (w) => `
            <tr>
              <td><strong>${escapeCell(w.word)}</strong></td>
              <td>${
                w.cefr
                  ? `<span class="cefr-badge cefr-${escapeHtml(w.cefr)}">${escapeCell(w.cefr)}</span>`
                  : '-'
              }</td>
              <td>${escapeCell(w.definition)}</td>
              <td>${escapeCell(w.translation)}</td>
              <td class="context small text-muted">${escapeCell(w.context)}</td>
              <td>${w.next_review || '-'}</td>
            </tr>
          `,
            )
            .join('')}
        </tbody>
      </table>
    `;
  }

  loadWords();
})();
