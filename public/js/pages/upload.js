(() => {
  const uploadForm = document.getElementById('uploadForm');
  const documentsList = document.getElementById('documentsList');
  const pdfInput = document.getElementById('pdf');
  const fileNameEl = document.getElementById('fileName');
  const localUploadingDocs = new Map();
  let documentsPollTimer = null;
  let cachedDocuments = [];
  let focusedProcessingDocId = null;
  const POLL_INITIAL_MS = 8000;
  const POLL_MAX_MS = 30000;
  const POLL_BACKOFF_FACTOR = 1.5;
  let pollDelayMs = POLL_INITIAL_MS;

  // בודק אם יש מסמכים בעיבוד
  function hasProcessingDocs(docs = cachedDocuments) {
    return docs.some((d) => d.processing_status === 'processing');
  }

  // מבטל טיימר סקירת מסמכים
  function clearDocumentsPolling() {
    if (documentsPollTimer) {
      clearTimeout(documentsPollTimer);
      documentsPollTimer = null;
    }
  }

  // מוצא מסמך בעיבוד למעקב
  function getFocusedProcessingDocId(docs = cachedDocuments) {
    if (focusedProcessingDocId) {
      const focusedDoc = docs.find((doc) => doc.id === focusedProcessingDocId);
      if (focusedDoc?.processing_status === 'processing') {
        return focusedProcessingDocId;
      }
      focusedProcessingDocId = null;
    }

    return docs.find((doc) => doc.processing_status === 'processing')?.id ?? null;
  }

  // ממזג עדכון מסמך לרשימה
  function mergeDocumentUpdate(updatedDoc) {
    const index = cachedDocuments.findIndex((doc) => doc.id === updatedDoc.id);
    if (index === -1) {
      cachedDocuments = [updatedDoc, ...cachedDocuments];
      return;
    }

    cachedDocuments[index] = { ...cachedDocuments[index], ...updatedDoc };
  }

  // מתזמן סקירה עם האטה הדרגתית
  function scheduleDocumentsPoll() {
    clearDocumentsPolling();
    if (document.hidden || !hasProcessingDocs()) return;

    documentsPollTimer = setTimeout(async () => {
      documentsPollTimer = null;
      const previousDelay = pollDelayMs;

      try {
        await loadFocusedDocument();
      } catch {
        // ממשיך סקרים בכשלים זמניים
      }

      if (!hasProcessingDocs()) {
        pollDelayMs = POLL_INITIAL_MS;
        return;
      }

      pollDelayMs = Math.min(Math.round(previousDelay * POLL_BACKOFF_FACTOR), POLL_MAX_MS);
      scheduleDocumentsPoll();
    }, pollDelayMs);
  }

  // מפעיל או עוצר סקירה לפי מצב
  function refreshDocumentsPolling(docs = []) {
    if (hasProcessingDocs(docs)) {
      if (!documentsPollTimer) {
        scheduleDocumentsPoll();
      }
      return;
    }

    clearDocumentsPolling();
    pollDelayMs = POLL_INITIAL_MS;
  }

  // עוצר סקירה כשהטאב מוסתר
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearDocumentsPolling();
      return;
    }

    if (!hasProcessingDocs()) return;

    pollDelayMs = POLL_INITIAL_MS;
    loadFocusedDocument().catch(() => {});
  });

  window.addEventListener('pagehide', clearDocumentsPolling);

  // מציג שם קובץ שנבחר
  pdfInput.addEventListener('change', () => {
    const file = pdfInput.files[0];
    if (!file) {
      fileNameEl.textContent = 'לא נבחר קובץ';
      fileNameEl.title = '';
      return;
    }
    fileNameEl.textContent = truncateFilename(file.name, 80);
    fileNameEl.title = file.name;
  });

  // מחזיר תווית סטטוס בעברית
  function getDocumentStatusLabel(status) {
    if (status === 'ready') return 'מוכן';
    if (status === 'failed') return 'נכשל';
    if (status === 'uploading') return 'מעלה...';
    return 'בתהליך';
  }

  // בוחר מחלקת תג לפי סטטוס
  function getStatusBadgeClass(status) {
    if (status === 'ready') return 'badge text-bg-secondary';
    if (status === 'failed') return 'badge badge-error';
    if (status === 'uploading') return 'badge badge-info';
    return 'badge badge-info';
  }

  // מפרמט תווית רמת CEFR מינימלית
  function formatMinCefrLabel(minCefr) {
    if (!minCefr) return '';
    const level = String(minCefr).toUpperCase();
    const labels = {
      B1: 'B1 ומעלה',
      B2: 'B2 ומעלה',
      C1: 'C1 ומעלה',
      C2: 'C2 בלבד',
    };
    return labels[level] || level;
  }

  // מרנדר תג רמת CEFR
  function renderMinCefrBadge(minCefr) {
    const label = formatMinCefrLabel(minCefr);
    if (!label) return '';
    return `<span class="badge text-bg-secondary">${escapeHtml(label)}</span>`;
  }

  // מרנדר כרטיסי מסמכים ברשימה
  function renderDocuments(docs = []) {
    const mergedDocs = [...Array.from(localUploadingDocs.values()), ...docs];

    if (mergedDocs.length === 0) {
      documentsList.innerHTML = '<p class="text-muted mb-0">אין מסמכים עדיין</p>';
      return;
    }

    documentsList.innerHTML = mergedDocs
      .map((d) => {
        const status = d.processing_status || 'ready';
        const isReady = status === 'ready';
        const hasNoWords = isReady && (d.word_count || 0) === 0;
        const isFailed = status === 'failed';
        const canDelete = (isFailed || hasNoWords) && !String(d.id).startsWith('local-');
        const canOpenWords = isReady && !hasNoWords;
        const isProcessing = status === 'processing' || status === 'uploading';

        const displayName = truncateFilename(d.filename, 80);
        const docNameHtml = canOpenWords
          ? `<a class="doc-name d-block" href="/words?documentId=${d.id}" title="${escapeHtml(d.filename)}">${escapeHtml(displayName)}</a>`
          : `<strong class="doc-name d-block" title="${escapeHtml(d.filename)}">${escapeHtml(displayName)}</strong>`;

        const gamesBtnHtml = canOpenWords
          ? `<a href="/games?documentId=${d.id}" class="btn btn-sm btn-outline-primary doc-action-btn" title="התחל משחק" aria-label="התחל משחק">
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                 <line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/>
                 <line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/>
                 <rect x="2" y="6" width="20" height="12" rx="2"/>
               </svg>
               <span>התחל משחק</span>
             </a>`
          : '';

        const studyBtnHtml = canOpenWords
          ? `<a href="/study?documentId=${d.id}" class="btn btn-primary doc-action-btn doc-study-btn" title="התחל לימוד" aria-label="התחל לימוד">
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                 <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                 <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
               </svg>
               <span>התחל לימוד</span>
             </a>`
          : '';

        const statusNoteHtml = hasNoWords
          ? '<span class="text-muted small">לא נמצאו מילים</span>'
          : isProcessing
            ? '<span class="text-muted small">העיבוד עדיין רץ...</span>'
            : '';

        const deleteBtnHtml = canDelete
          ? `<button type="button" class="btn btn-sm btn-outline-danger doc-action-btn js-delete-doc" data-doc-id="${d.id}" title="מחק" aria-label="מחק">
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                 <path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
               </svg>
               <span>מחק</span>
             </button>`
          : '';

        return `
      <article class="doc-card border rounded p-3" data-doc-id="${d.id}">
        <div class="doc-card-header d-flex align-items-start justify-content-between gap-2">
          <div class="doc-info flex-grow-1" style="min-width:0">
            ${docNameHtml}
            <div class="doc-meta d-flex flex-wrap gap-2 mt-2">
              <span class="${getStatusBadgeClass(status)}">${getDocumentStatusLabel(status)}</span>
              <span class="badge text-bg-secondary">${d.word_count || 0} מילים</span>
              ${renderMinCefrBadge(d.min_cefr)}
              ${statusNoteHtml}
            </div>
          </div>
          <div class="doc-header-actions d-flex align-items-center gap-2">
            ${studyBtnHtml}
            ${gamesBtnHtml}
            ${deleteBtnHtml}
          </div>
        </div>
      </article>
    `;
      })
      .join('');
  }

  // מוחק מסמך שנכשל אחרי אישור
  documentsList.addEventListener('click', async (event) => {
    const deleteBtn = event.target.closest('.js-delete-doc');
    if (!deleteBtn) return;

    const docId = deleteBtn.dataset.docId;
    const docName =
      deleteBtn.closest('.doc-card')?.querySelector('.doc-name')?.textContent?.trim() || 'המסמך';
    const shouldDelete = await showConfirmAlert({
      title: 'מחיקת מסמך',
      text: `למחוק את "${docName}"?`,
      confirmButtonText: 'מחק',
      cancelButtonText: 'ביטול',
    });
    if (!shouldDelete) return;

    deleteBtn.disabled = true;
    try {
      const res = await apiFetch(`/api/v1/documents/${docId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'מחיקת המסמך נכשלה');
      if (Number(docId) === focusedProcessingDocId) {
        focusedProcessingDocId = null;
      }
      showStatusAlert(`המסמך ${truncateFilename(docName, 30)} נמחק`, 'success');
      await loadDocuments();
    } catch (err) {
      showStatusAlert(`שגיאה: ${err.message}`, 'error');
    } finally {
      deleteBtn.disabled = false;
    }
  });

  // טוען את רשימת המסמכים
  async function loadDocuments() {
    const res = await apiFetch('/api/v1/documents');
    if (isRateLimited(res)) {
      documentsList.innerHTML = rateLimitPlaceholder();
      return;
    }
    const docs = await res.json();
    cachedDocuments = docs;
    renderDocuments(docs);
    refreshDocumentsPolling(docs);
  }

  // מרענן מסמך בעיבוד בלבד
  async function loadFocusedDocument() {
    const focusedDocId = getFocusedProcessingDocId();
    if (!focusedDocId) {
      refreshDocumentsPolling(cachedDocuments);
      return;
    }

    const res = await apiFetch(`/api/v1/documents/${focusedDocId}`);
    if (!res.ok) {
      await loadDocuments();
      return;
    }

    const doc = await res.json();
    mergeDocumentUpdate(doc);
    renderDocuments(cachedDocuments);
    refreshDocumentsPolling(cachedDocuments);
  }

  // מעלה PDF ומוסיף לרשימה
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('uploadBtn');
    const file = pdfInput.files[0];
    if (!file) {
      showStatusAlert('יש לבחור קובץ לפני העלאה', 'error');
      return;
    }

    btn.disabled = true;

    const localId = `local-${Date.now()}`;
    const minCefr = document.getElementById('minCefr').value || '';
    localUploadingDocs.set(localId, {
      id: localId,
      filename: file.name,
      word_count: 0,
      min_cefr: minCefr || null,
      processing_status: 'uploading',
    });
    renderDocuments(cachedDocuments);

    const formData = new FormData();
    formData.append('pdf', file);
    formData.append('minCefr', minCefr);

    try {
      const uploadRes = await apiFetch('/api/v1/documents', {
        method: 'POST',
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (isRateLimited(uploadRes)) {
        localUploadingDocs.delete(localId);
        renderDocuments(cachedDocuments);
        return;
      }
      if (!uploadRes.ok) throw new Error(uploadData.error);

      showStatusAlert(
        `הקובץ ${truncateFilename(uploadData.filename, 30)} נוסף לרשימה ומעובד ברקע`,
        'info',
      );
      uploadForm.reset();
      fileNameEl.textContent = 'לא נבחר קובץ';
      fileNameEl.title = '';
      localUploadingDocs.delete(localId);
      focusedProcessingDocId = uploadData.id;
      pollDelayMs = POLL_INITIAL_MS;
      await loadDocuments();
    } catch (err) {
      localUploadingDocs.delete(localId);
      renderDocuments(cachedDocuments);
      showStatusAlert(`שגיאה: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  loadDocuments();
})();
