(() => {
  const uploadForm = document.getElementById('uploadForm');
  const documentsList = document.getElementById('documentsList');
  const pdfInput = document.getElementById('pdf');
  const fileNameEl = document.getElementById('fileName');
  const localUploadingDocs = new Map();
  let documentsPollTimer = null;
  let cachedDocuments = [];
  const POLL_INITIAL_MS = 5000;
  const POLL_MAX_MS = 15000;
  const POLL_BACKOFF_FACTOR = 1.4;
  let pollDelayMs = POLL_INITIAL_MS;

  function hasProcessingDocs(docs = cachedDocuments) {
    return docs.some((d) => d.processing_status === 'processing');
  }

  function clearDocumentsPolling() {
    if (documentsPollTimer) {
      clearTimeout(documentsPollTimer);
      documentsPollTimer = null;
    }
  }

  function scheduleDocumentsPoll() {
    clearDocumentsPolling();
    if (document.hidden || !hasProcessingDocs()) return;

    documentsPollTimer = setTimeout(async () => {
      documentsPollTimer = null;
      const previousDelay = pollDelayMs;

      try {
        await loadDocuments();
      } catch {
        // keep polling on transient failures
      }

      if (!hasProcessingDocs()) {
        pollDelayMs = POLL_INITIAL_MS;
        return;
      }

      pollDelayMs = Math.min(Math.round(previousDelay * POLL_BACKOFF_FACTOR), POLL_MAX_MS);
      scheduleDocumentsPoll();
    }, pollDelayMs);
  }

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

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearDocumentsPolling();
      return;
    }

    if (!hasProcessingDocs()) return;

    pollDelayMs = POLL_INITIAL_MS;
    loadDocuments().catch(() => {});
  });

  window.addEventListener('pagehide', clearDocumentsPolling);

  pdfInput.addEventListener('change', () => {
    const file = pdfInput.files[0];
    if (!file) {
      fileNameEl.textContent = 'לא נבחר קובץ';
      fileNameEl.title = '';
      return;
    }
    fileNameEl.textContent = truncateFilename(file.name, 40);
    fileNameEl.title = file.name;
  });

  function getDocumentStatusLabel(status) {
    if (status === 'ready') return 'מוכן';
    if (status === 'failed') return 'נכשל';
    if (status === 'uploading') return 'מעלה...';
    return 'בתהליך';
  }

  function getStatusBadgeClass(status) {
    if (status === 'ready') return 'badge text-bg-secondary';
    if (status === 'failed') return 'badge badge-error';
    if (status === 'uploading') return 'badge badge-info';
    return 'badge badge-info';
  }

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
        const canDelete = status !== 'processing' && !String(d.id).startsWith('local-');
        const canOpenWords = isReady && !hasNoWords;

        return `
      <div class="doc-item d-flex align-items-center justify-content-between flex-wrap gap-2 p-3 border rounded">
        <div class="doc-info flex-grow-1" style="min-width:0">
          <strong class="doc-name d-block text-truncate" title="${escapeHtml(d.filename)}">${escapeHtml(truncateFilename(d.filename))}</strong>
          <span class="${getStatusBadgeClass(status)}">${getDocumentStatusLabel(status)}</span>
          <span class="badge text-bg-secondary">${d.word_count || 0} מילים</span>
        </div>
        <div class="doc-actions d-flex flex-wrap gap-2">
          ${
            hasNoWords
              ? '<span class="text-muted small">לא נמצאו מילים</span>'
              : canOpenWords
                ? `<a href="/words?documentId=${d.id}" class="btn btn-sm btn-outline-primary">צפה במילים</a>
               <a href="/words?documentId=${d.id}&printCards=1" class="btn btn-sm btn-outline-secondary btn-icon" title="הדפס כרטיסיות" aria-label="הדפס כרטיסיות">
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                   <path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                 </svg>
               </a>`
                : status === 'processing' || status === 'uploading'
                  ? '<span class="text-muted small">העיבוד עדיין רץ...</span>'
                  : ''
          }
          ${
            canDelete
              ? `<button type="button" class="btn btn-sm btn-outline-danger btn-icon js-delete-doc" data-doc-id="${d.id}" title="מחק" aria-label="מחק">
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                   <path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                 </svg>
               </button>`
              : ''
          }
        </div>
      </div>
    `;
      })
      .join('');
  }

  documentsList.addEventListener('click', async (event) => {
    const deleteBtn = event.target.closest('.js-delete-doc');
    if (!deleteBtn) return;

    const docId = deleteBtn.dataset.docId;
    const docName =
      deleteBtn.closest('.doc-item')?.querySelector('.doc-name')?.textContent?.trim() || 'המסמך';
    const shouldDelete = confirm(`למחוק את "${docName}"?`);
    if (!shouldDelete) return;

    deleteBtn.disabled = true;
    try {
      const res = await apiFetch(`/api/v1/documents/${docId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'מחיקת המסמך נכשלה');
      showStatusAlert(`המסמך ${truncateFilename(docName, 30)} נמחק`, 'success');
      await loadDocuments();
    } catch (err) {
      showStatusAlert(`שגיאה: ${err.message}`, 'error');
    } finally {
      deleteBtn.disabled = false;
    }
  });

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
    localUploadingDocs.set(localId, {
      id: localId,
      filename: file.name,
      word_count: 0,
      processing_status: 'uploading',
    });
    renderDocuments(cachedDocuments);

    const formData = new FormData();
    formData.append('pdf', file);
    formData.append('minCefr', document.getElementById('minCefr').value || '');

    try {
      const uploadRes = await apiFetch('/api/v1/documents', {
        method: 'POST',
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (isRateLimited(uploadRes)) {
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
      pollDelayMs = POLL_INITIAL_MS;
      loadDocuments();
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
