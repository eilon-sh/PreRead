(() => {
  const params = new URLSearchParams(window.location.search);
  const documentId = params.get('documentId') || '';
  if (!documentId) {
    window.location.replace('/upload');
    return;
  }

  const wordsTable = document.getElementById('wordsTable');
  const printCardsLink = document.getElementById('printCardsLink');
  const deleteDocBtn = document.getElementById('deleteDocBtn');
  const wordsSummary = document.getElementById('wordsSummary');
  const wordsToolbar = document.getElementById('wordsToolbar');
  const printMode = params.get('printCards') === '1';

  if (printMode) {
    document.body.classList.add('print-preview');
    wordsToolbar?.classList.add('d-none');
    document.querySelector('.words-page-header')?.classList.add('d-none');
  }

  // מעדכן קישור למצב הדפסה
  function updatePrintLink() {
    if (!printCardsLink) return;
    const query = new URLSearchParams();
    if (documentId) query.set('documentId', documentId);
    query.set('printCards', '1');
    printCardsLink.href = `/words?${query.toString()}`;
  }

  // בורח תוכן תא בטבלה
  function escapeCell(text) {
    return escapeHtml(text || '-');
  }

  // בונה טקסט גב לכרטיסייה
  function toCardBackText(word) {
    const parts = [
      word.definition ? `הגדרה: ${word.definition}` : '',
      word.translation ? `תרגום: ${word.translation}` : '',
      word.context ? `הקשר: ${word.context}` : '',
    ].filter(Boolean);
    return parts.join('\n');
  }

  const PRINT_CARDS_PER_PAGE = 8;

  // מחלק מילים לדפי הדפסה
  function chunkWords(words, size) {
    const chunks = [];
    for (let i = 0; i < words.length; i += size) {
      chunks.push(words.slice(i, i + size));
    }
    return chunks;
  }

  // מרנדר חזית כרטיסייה להדפסה
  function renderFrontCard(word) {
    return `
      <article class="print-card">
        <div class="print-card-content">
          <h3 data-fit-text>${escapeCell(word.word)}</h3>
        </div>
      </article>
    `;
  }

  // מרנדר גב כרטיסייה להדפסה
  function renderBackCard(word) {
    return `
      <article class="print-card print-card-back">
        <div class="print-card-content">
          <p data-fit-text>${escapeCell(toCardBackText(word)).replace(/\n/g, '<br>')}</p>
        </div>
      </article>
    `;
  }

  // מרנדר דף הדפסה עם כרטיסים
  function renderPrintSheet(title, cardsHtml, { isBack = false, pageBreakAfter = false } = {}) {
    const classes = ['print-sheet'];
    if (isBack) classes.push('print-back-page');
    if (pageBreakAfter) classes.push('print-sheet-break');
    return `
      <section class="${classes.join(' ')}">
        <h2 class="h6 print-sheet-title">${title}</h2>
        <div class="print-grid">${cardsHtml}</div>
      </section>
    `;
  }

  // שומר העדפת הסתרת כותרות
  function bindPrintOptions() {
    const noHeadersCheck = document.getElementById('printNoHeaders');
    if (!noHeadersCheck) return;

    const saved = localStorage.getItem('printNoHeaders') === '1';
    noHeadersCheck.checked = saved;
    noHeadersCheck.addEventListener('change', () => {
      localStorage.setItem('printNoHeaders', noHeadersCheck.checked ? '1' : '0');
    });
  }

  // מוסיף מספר עמוד לכותרת
  function renderSheetTitle(baseTitle, pageIndex, totalPages) {
    if (totalPages <= 1) return baseTitle;
    return `${baseTitle} - עמוד ${pageIndex + 1}`;
  }

  // מסדר גב להדפסה דו-צדדית
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

  // מתאים גודל טקסט לכרטיס
  function fitTextElement(textEl, container, { minPx = 7, maxPx = 14 } = {}) {
    textEl.style.fontSize = `${maxPx}px`;
    textEl.style.lineHeight = '1.35';

    if (textEl.scrollHeight <= container.clientHeight) return;

    let low = minPx;
    let high = maxPx;

    while (high - low > 0.25) {
      const mid = (low + high) / 2;
      textEl.style.fontSize = `${mid}px`;
      if (textEl.scrollHeight > container.clientHeight) {
        high = mid;
      } else {
        low = mid;
      }
    }

    textEl.style.fontSize = `${low}px`;
  }

  // מתאים טקסט בכל כרטיסי ההדפסה
  function fitPrintCardText(root = document) {
    root.querySelectorAll('[data-fit-text]').forEach((textEl) => {
      const container = textEl.closest('.print-card-content');
      if (!container) return;
      const isFront = textEl.tagName === 'H3';
      fitTextElement(textEl, container, {
        minPx: 7,
        maxPx: isFront ? 18 : 14,
      });
    });
  }

  let printFitBound = false;

  // מציג הנחיית הדפסה דו-צדדית
  function renderDuplexGuideHtml() {
    return `
      <aside class="duplex-guide no-print" aria-label="הנחיית הדפסה דו-צדדית">
        <div class="duplex-guide-header">
          <p class="duplex-guide-title">הדפסה דו-צדדית - איך זה עובד?</p>
          <p class="duplex-guide-text">
            כל חזית מופיעה ואחריה הגב שלה. בהדפסה בחרו הדפסה דו-צדדית (היפוך על הצד הארוך) - כך החזית והגב יודפסו על אותו דף.
          </p>
        </div>
        <ol class="duplex-guide-steps">
          <li class="duplex-guide-step">לחצו <strong>הדפס עכשיו</strong></li>
          <li class="duplex-guide-step">בחלון ההדפסה בחרו <strong>הדפסה דו-צדדית</strong> / היפוך על הצד הארוך</li>
          <li class="duplex-guide-step">כל חזית תודפס עם הגב שלה מאחוריה - ואז גזרו לאורך הקווים המקווקווים</li>
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
            <span>אותו דף · צד שני</span>
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

  // בונה פריסת הדפסה דו-צדדית
  function renderPrintLayout(words) {
    const frontPages = chunkWords(words, PRINT_CARDS_PER_PAGE);
    const sheetConfigs = [];

    frontPages.forEach((pageWords, index) => {
      const isLastSheet = index === frontPages.length - 1;
      sheetConfigs.push({
        title: renderSheetTitle('חזית הכרטיסיות', index, frontPages.length),
        cardsHtml: pageWords.map(renderFrontCard).join(''),
        isBack: false,
        pageBreakAfter: true,
      });
      sheetConfigs.push({
        title: renderSheetTitle('גב הכרטיסיות (צד שני של אותו דף)', index, frontPages.length),
        cardsHtml: buildBackOrder(pageWords).map(renderBackCard).join(''),
        isBack: true,
        pageBreakAfter: !isLastSheet,
      });
    });

    const sheetsHtml = sheetConfigs
      .map((sheet) =>
        renderPrintSheet(sheet.title, sheet.cardsHtml, {
          isBack: sheet.isBack,
          pageBreakAfter: sheet.pageBreakAfter,
        }),
      )
      .join('');

    const backQuery = new URLSearchParams();
    if (documentId) backQuery.set('documentId', documentId);
    const backHref = `/words?${backQuery.toString()}`;

    wordsTable.innerHTML = `
      ${renderDuplexGuideHtml()}
      <div class="print-toolbar no-print d-flex flex-wrap gap-2 mb-3">
        <button class="btn btn-primary btn-sm" id="printBtn" type="button">הדפס עכשיו</button>
        <a href="${escapeHtml(backHref)}" class="btn btn-secondary btn-sm">חזרה לטבלה</a>
      </div>
      ${sheetsHtml}
    `;

    document.getElementById('printBtn')?.addEventListener('click', () => window.print());

    bindPrintOptions();
    fitPrintCardText(wordsTable);

    if (!printFitBound) {
      window.addEventListener('beforeprint', () => fitPrintCardText(wordsTable));
      printFitBound = true;
    }
  }

  // מציג מצב ריק כשאין מילים
  function renderEmptyState(messageHtml) {
    return `
      <div class="words-empty">
        <div class="words-empty-icon" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            <path d="M8 7h8"/>
            <path d="M8 11h6"/>
          </svg>
        </div>
        <p class="words-empty-text mb-0">${messageHtml}</p>
      </div>
    `;
  }

  // מפרמט תאריך חזרה הבאה
  function formatNextReview(value) {
    if (!value) return '<span class="text-muted">-</span>';
    return `<time datetime="${escapeHtml(String(value))}">${escapeCell(value)}</time>`;
  }

  // מעדכן סיכום מספר מילים
  function setSummary(count) {
    if (!wordsSummary) return;
    wordsSummary.hidden = false;
    wordsSummary.textContent = count === 1 ? 'מילה אחת' : `${count} מילים`;
  }

  // מציג או מסתיר כפתור מחיקה
  function setDeleteButtonVisible(visible) {
    if (!deleteDocBtn) return;
    deleteDocBtn.hidden = !visible;
  }

  // מביא את המסמך אם הוא קיים
  async function fetchDocument() {
    if (!documentId) return null;
    try {
      const res = await apiFetch(`/api/v1/documents/${documentId}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  // מביא שם מסמך לתצוגה
  async function getDocumentName() {
    const doc = await fetchDocument();
    return doc?.filename || 'המסמך';
  }

  // מוחק מסמך אחרי אישור משתמש
  async function handleDeleteDocument() {
    if (!documentId || !deleteDocBtn) return;

    const docName = await getDocumentName();
    const shouldDelete = await showConfirmAlert({
      title: 'מחיקת מסמך',
      text: `למחוק את "${docName}"?`,
      confirmButtonText: 'מחק',
      cancelButtonText: 'ביטול',
    });
    if (!shouldDelete) return;

    deleteDocBtn.disabled = true;
    try {
      const res = await apiFetch(`/api/v1/documents/${documentId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'מחיקת המסמך נכשלה');
      showStatusAlert(`המסמך ${truncateFilename(docName, 30)} נמחק`, 'success');
      window.location.href = '/upload';
    } catch (err) {
      showStatusAlert(`שגיאה: ${err.message}`, 'error');
      deleteDocBtn.disabled = false;
    }
  }

  if (deleteDocBtn) {
    deleteDocBtn.addEventListener('click', handleDeleteDocument);
  }

  // טוען מילים ומרנדר טבלה או הדפסה
  async function loadWords() {
    const query = new URLSearchParams();
    if (documentId) query.set('documentId', documentId);

    const res = await apiFetch(`/api/v1/words?${query.toString()}`);
    if (isRateLimited(res)) {
      wordsTable.innerHTML = rateLimitPlaceholder();
      return;
    }
    const data = await res.json();
    updatePrintLink();

    if (data.words.length === 0) {
      if (printCardsLink) printCardsLink.hidden = true;
      const doc = await fetchDocument();
      setDeleteButtonVisible(Boolean(doc));
      if (wordsSummary) wordsSummary.hidden = true;
      const emptyMessage = doc
        ? 'לא נמצאו מילים במסמך הזה. נסה להעלות מסמך אחר.'
        : documentId
          ? 'המסמך לא נמצא.'
          : 'אין מילים עדיין. <a class="words-empty-link" href="/upload">העלה PDF</a> כדי להתחיל.';
      wordsTable.innerHTML = renderEmptyState(emptyMessage);
      return;
    }

    if (printMode) {
      renderPrintLayout(data.words);
      return;
    }

    if (printCardsLink) printCardsLink.hidden = false;
    setDeleteButtonVisible(Boolean(documentId));
    setSummary(data.words.length);

    wordsTable.innerHTML = `
      <table class="table table-sm table-hover align-middle mb-0 words-table">
        <thead class="table-light">
          <tr>
            <th scope="col">מילה</th>
            <th scope="col" class="words-col-secondary">רמה</th>
            <th scope="col" class="words-col-secondary">הגדרה</th>
            <th scope="col" class="words-col-secondary">תרגום</th>
            <th scope="col" class="words-col-secondary">הקשר</th>
            <th scope="col">חזרה הבאה</th>
          </tr>
        </thead>
        <tbody>
          ${data.words
            .map(
              (w) => `
            <tr>
              <td class="words-cell-word"><strong>${escapeCell(w.word)}</strong></td>
              <td class="words-col-secondary">${
                w.cefr
                  ? `<span class="cefr-badge cefr-${escapeHtml(w.cefr)}">${escapeCell(w.cefr)}</span>`
                  : '<span class="text-muted">-</span>'
              }</td>
              <td class="words-cell-def words-col-secondary">${escapeCell(w.definition)}</td>
              <td class="words-cell-translation words-col-secondary">${escapeCell(w.translation)}</td>
              <td class="context small text-muted words-col-secondary">${escapeCell(w.context)}</td>
              <td class="words-cell-review small">${formatNextReview(w.next_review)}</td>
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
