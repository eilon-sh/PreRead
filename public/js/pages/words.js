(() => {
  const params = new URLSearchParams(window.location.search);
  const documentId = params.get('documentId') || '';
  const wordsTable = document.getElementById('wordsTable');
  const studyLink = document.getElementById('studyLink');
  const printMode = params.get('printCards') === '1';

  if (printMode) {
    document.body.classList.add('print-preview');
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
      <aside class="duplex-guide no-print" aria-label="הנחיית הדפסה דו-צדדית">
        <div class="duplex-guide-header">
          <p class="duplex-guide-title">הדפסה דו-צדדית - איך זה עובד?</p>
          <p class="duplex-guide-text">
            הדפיסו קודם את עמוד החזית, החזירו את הנייר ללא סיבוב (צד ארוך), ואז הדפיסו את עמוד הגב.
          </p>
        </div>
        <ol class="duplex-guide-steps">
          <li class="duplex-guide-step">לחצו <strong>הדפס עכשיו</strong> - יודפס עמוד החזית (המילים באנגלית)</li>
          <li class="duplex-guide-step">הוציאו את הנייר, <strong>הפכו אותו על הצד הארוך</strong> והחזירו למגש</li>
          <li class="duplex-guide-step">הדפיסו שוב - יודפס עמוד הגב (הגדרות ותרגומים) בדיוק מאחורי החזית</li>
          <li class="duplex-guide-step">גזרו לאורך הקווים המקווקווים - כל כרטיסייה מוכנה</li>
        </ol>
        <div class="duplex-guide-demo" aria-hidden="true">
          <div class="duplex-guide-sheet">
            <span class="duplex-guide-sheet-label">עמוד 1 · חזית</span>
            <div class="duplex-guide-mini-grid">
              <div class="duplex-guide-mini-card">Hypothesis</div>
              <div class="duplex-guide-mini-card">Framework</div>
              <div class="duplex-guide-mini-card">Methodology</div>
              <div class="duplex-guide-mini-card">Analysis</div>
            </div>
          </div>
          <div class="duplex-guide-flow">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M7 17l5-5-5-5M13 17l5-5-5-5"/>
            </svg>
            <span>הדפסה על הצד השני</span>
          </div>
          <div class="duplex-guide-sheet">
            <span class="duplex-guide-sheet-label">עמוד 2 · גב</span>
            <div class="duplex-guide-mini-grid">
              <div class="duplex-guide-mini-card is-back">הגדרה…</div>
              <div class="duplex-guide-mini-card is-back">הגדרה…</div>
              <div class="duplex-guide-mini-card is-back">הגדרה…</div>
              <div class="duplex-guide-mini-card is-back">הגדרה…</div>
            </div>
          </div>
        </div>
      </aside>
    `;
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
