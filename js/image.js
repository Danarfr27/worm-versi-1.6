// Client-side image generation UI logic
(function(){
  const imageBtn = document.getElementById('imageBtn');
  const imageModal = document.getElementById('imageModal');
  const closeImageModal = document.getElementById('closeImageModal');
  const generateBtn = document.getElementById('generateImageBtn');
  const imagePrompt = document.getElementById('imagePrompt');
  const imageSize = document.getElementById('imageSize');
  const imageModel = document.getElementById('imageModel');
  const imageResults = document.getElementById('imageResults');
  const imageProgress = document.getElementById('imageProgress');

  if (!imageBtn || !imageModal) return;

  imageBtn.addEventListener('click', () => {
    imageModal.style.display = 'flex';
    // restore last used model if any
    try {
      const saved = localStorage.getItem('imageModel');
      if (saved && imageModel) imageModel.value = saved;
    } catch (e) {}
    imagePrompt && imagePrompt.focus();
  });

  closeImageModal && closeImageModal.addEventListener('click', () => {
    imageModal.style.display = 'none';
    if (imageResults) imageResults.innerHTML = '';
  });

  async function generateImage() {
    const prompt = (imagePrompt && imagePrompt.value || '').trim();
    if (!prompt) {
      alert('Isi prompt terlebih dahulu');
      return;
    }
    const size = (imageSize && imageSize.value) || '1024x1024';
    generateBtn.disabled = true;
    imageProgress.style.display = 'block';
    imageResults.innerHTML = '';

    try {
      const model = (imageModel && imageModel.value && imageModel.value.trim()) ? imageModel.value.trim() : undefined;
      const bodyPayload = { prompt, size, n: 1 };
      if (model) bodyPayload.model = model;

      const resp = await fetch('/api/generate_image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });

      if (!resp.ok) {
        // try parse structured json error from server, else read text
        let errBody = null;
        try { errBody = await resp.json(); } catch(e) { /* ignore */ }
        if (errBody) {
          imageResults.innerHTML = '<pre style="color:tomato;">'+JSON.stringify(errBody, null, 2)+'</pre>';
        } else {
          const txt = await resp.text().catch(() => 'Server error');
          imageResults.innerHTML = '<pre style="color:tomato;">'+String(txt)+'</pre>';
        }
        return;
      }

      const data = await resp.json();

      const images = [];

      // OpenAI - { data: [ { b64_json } ] }
      if (Array.isArray(data.data) && data.data.length) {
        data.data.forEach(item => {
          if (item.b64_json) images.push('data:image/png;base64,' + item.b64_json);
          if (item.url) images.push(item.url);
        });
      }

      // Google style
      if (data.imageUri) images.push(data.imageUri);
      if (Array.isArray(data.images)) {
        data.images.forEach(it => {
          if (it.imageUri) images.push(it.imageUri);
          if (it.url) images.push(it.url);
          if (it.b64) images.push('data:image/png;base64,' + it.b64);
        });
      }

      // generic fields
      if (data.base64) images.push('data:image/png;base64,' + data.base64);
      if (Array.isArray(data.output)) {
        data.output.forEach(o => {
          if (o.imageUri) images.push(o.imageUri);
          if (o.b64_json) images.push('data:image/png;base64,' + o.b64_json);
        });
      }

      if (images.length === 0 && typeof data === 'string') images.push(data);

      if (images.length === 0) {
        imageResults.innerHTML = '<pre style="color:var(--text-secondary);">'+JSON.stringify(data, null, 2)+'</pre>';
      } else {
        images.forEach(src => {
          const wrap = document.createElement('div');
          wrap.style.position = 'relative';

          const img = document.createElement('img');
          img.src = src;
          img.style.width = '100%';
          img.style.borderRadius = '8px';
          img.loading = 'lazy';
          wrap.appendChild(img);

          const dl = document.createElement('a');
          dl.href = src;
          dl.download = 'generated.png';
          dl.textContent = 'Download';
          dl.style.display = 'inline-block';
          dl.style.marginTop = '6px';
          dl.style.color = 'var(--primary)';
          wrap.appendChild(dl);

          imageResults.appendChild(wrap);
        });
      }

      // persist selected model for convenience
      try { if (imageModel && imageModel.value) localStorage.setItem('imageModel', imageModel.value); } catch(e) {}

    } catch (err) {
      console.error('Image generation error', err);
      const msg = (err && err.message) ? err.message : String(err);
      imageResults.innerHTML = '<div style="color:tomato;">Error: '+msg+'</div>';
      // If message looks like JSON, also show raw
      try {
        const parsed = JSON.parse(msg);
        const pre = document.createElement('pre');
        pre.style.color = 'var(--text-secondary)';
        pre.textContent = JSON.stringify(parsed, null, 2);
        imageResults.appendChild(pre);
      } catch (e) {/* not JSON */}
    } finally {
      imageProgress.style.display = 'none';
      generateBtn.disabled = false;
    }
  }

  generateBtn && generateBtn.addEventListener('click', generateImage);
  imagePrompt && imagePrompt.addEventListener('keydown', function(e){ if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generateImage(); } });

})();

// Quick menu and upload handler
(function(){
  const quickBtn = document.getElementById('quickMenuBtn');
  const quickMenu = document.getElementById('quickMenu');
  const quickItems = quickMenu ? quickMenu.querySelectorAll('.quick-item') : [];
  const fileInput = document.getElementById('imageUploadInput');
  const chatLog = document.getElementById('chatLog');

  function appendMessage(text, isUser){
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'ai-message'}`;
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = '<p>' + (text || '').replace(/\n\n/g, '</p><p>').replace(/\n/g,'<br>') + '</p>';
    bubble.appendChild(content);
    messageDiv.appendChild(bubble);
    chatLog.appendChild(messageDiv);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function showQuickMenu(show){
    if (!quickMenu) return;
    quickMenu.style.display = show ? 'block' : 'none';
  }

  if (quickBtn) {
    quickBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = quickMenu && quickMenu.style.display === 'block';
      showQuickMenu(!open);
      if (!open) {
        // position menu near button
        const rect = quickBtn.getBoundingClientRect();
        quickMenu.style.top = (rect.bottom + window.scrollY + 8) + 'px';
        quickMenu.style.left = (rect.left + window.scrollX) + 'px';
      }
    });
  }

  document.addEventListener('click', () => showQuickMenu(false));

  quickItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const action = item.dataset.action;
      showQuickMenu(false);
      if (action === 'upload') {
        if (fileInput) fileInput.click();
      } else if (action === 'generate') {
        // open existing image modal if available
        const imgModal = document.getElementById('imageModal');
        if (imgModal) imgModal.style.display = 'flex';
      } else {
        appendMessage('Menu: ' + action + ' clicked (belum diimplementasikan)', true);
      }
    });
  });

  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;

      // show preview as user message
      const reader = new FileReader();
      reader.onload = async function(ev) {
        const dataUrl = ev.target.result;
        const imgHtml = `<img src="${dataUrl}" style="max-width:220px;border-radius:8px;display:block;margin-bottom:6px;">`;
        appendMessage(imgHtml, true);

        // send base64 (without prefix)
        const base64 = (dataUrl.indexOf(',') !== -1) ? dataUrl.split(',')[1] : dataUrl;

        // show temporary progress
        appendMessage('Mengirim gambar ke server untuk analisis...', false);

        try {
          const resp = await fetch('/api/analyze_image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64, filename: f.name })
          });

          if (!resp.ok) {
            const t = await resp.text().catch(() => 'Server error');
            appendMessage('Analisis gagal: ' + t, false);
            return;
          }

          const json = await resp.json();
          // format summary
          const summary = json.summaryText || (json.resultText || '') || (json.message || 'Tidak ada hasil');
          appendMessage(summary, false);
        } catch (err) {
          console.error('Upload failed', err);
          appendMessage('Gagal mengirim gambar: ' + (err.message || err), false);
        }
      };
      reader.readAsDataURL(f);
      // reset input so same file can be selected again
      fileInput.value = '';
    });
  }

})();
