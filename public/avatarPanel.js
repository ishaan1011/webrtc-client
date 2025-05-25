// avatarPanel.js
export function initAvatarPanel(config = {}) {
  const proxyUrl = config.proxyUrl || 'https://proxy-server-six-phi.vercel.app/api/proxy';
  // const chatAPI = config.chatAPI || 'https://feeltiptop.com/demos/ent/Chat/chatapi.php';
  const solrAPI = config.solrAPI || 'http://clavisds01.feeltiptop.com:8983/solr/360calls-speaker/select?q=speaker_s:*&facet=true&facet.field=speaker_s&facet.mincount=1&rows=0';
  const mergeUrl = config.mergeUrl || 'https://clavisds02.feeltiptop.com/demos/ira-test/backend-merge.php';
  const splitApi  = config.splitApi  || 'https://clavisds02.feeltiptop.com/demos/ira-test/splitvideo1.php';

  let numutter = 10;
  let whoseavatar = '';

  const chatBtn = document.getElementById('chat-btn');
  const chatInput = document.getElementById('avatar-chat-input');
  const speakerDropdown = document.getElementById('speaker-dropdown');
  const numutterDropdown = document.getElementById('numutter-dropdown');
  const languageDropdown = document.getElementById('language-dropdown');
  const resultsContainer = document.getElementById('results-container');
  const loadingIndicator = document.getElementById('loading');

  const proxySolrUrl = `${proxyUrl}?url=${encodeURIComponent(solrAPI)}`;

  // Load speaker list
  async function fetchSpeakers() {
    try {
      const res = await fetch(proxySolrUrl);

      // 1) Check for HTTP errors up front
      if (!res.ok) {
        console.error('❌ Solr proxy returned status', res.status, res.statusText);
        const body = await res.text();
        console.error('❌ Solr proxy response body:', body);
        return;
      }

      // 2) Grab the raw text so we can inspect it
      const txt = await res.text();
      console.log('📥 raw Solr proxy response:', txt);

      // 3) Try parsing JSON, with its own try/catch
      let data;
      try {
        data = JSON.parse(txt);
      } catch (jsonErr) {
        console.error('❌ JSON.parse failed:', jsonErr);
        return;
      }

      // 4) Safely dig into the path, bail if shape is unexpected
      const speakers = data
        && data.contents
        && data.contents.facet_counts
        && data.contents.facet_counts.facet_fields
        && data.contents.facet_counts.facet_fields.speaker_s;

      if (!Array.isArray(speakers)) {
        console.error('❌ Unexpected shape for speaker_s:', speakers);
        return;
      }

      // 5) Populate dropdown
      speakerDropdown.innerHTML = '<option value="">All Speakers</option>';
      for (let i = 0; i < speakers.length; i += 2) {
        const name = speakers[i];
        if (name.trim()) {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          speakerDropdown.appendChild(opt);
        }
      }

    } catch (err) {
      console.error('❌ Network or other error fetching speakers:', err);
    }
  }


  async function triggerChat() {
    const text = chatInput.value.trim();
    if (!text) return;
    resultsContainer.innerHTML = '';
    whoseavatar = speakerDropdown.value;
    await fetchChatData(text);
  }

  async function fetchChatData(text) {
    const constraint = whoseavatar ? `queryconstraint=speaker_s:%22${encodeURIComponent(whoseavatar)}%22&` : '';
    const href = `${chatAPI}?solrhost=clavisds01.feeltiptop.com&coll=360calls-speaker&${constraint}details=1&numutter=${numutter}&status=${encodeURIComponent(text)}`;
    const fullUrl = `${proxyUrl}?url=${encodeURIComponent(href)}`;

    try {
      const response = await fetch(fullUrl);
      const rawText = await response.text();
      const data = JSON.parse(rawText);
      const rows = data.contents?.[0] || [];

      if (!rows.length) {
        resultsContainer.innerHTML = `<p>No video segments found.</p>`;
        return;
      }

      for (const result of rows) {
        const { videodetails, snippet, title } = result;
        const { videoid, snippetstarttimesecs, snippetendtimesecs, segmenttitle } = videodetails;
        const [date, time, zone, id] = videoid.split('-');
        const [year, month] = date.split('.');

        const basePath = `http://clavisds02.feeltiptop.com/360TeamCalls/downloads/${year}/${month}/${date}-${time}-${zone}-${id}`;
        const mp4Url = `${basePath}/${date}-${time}-${zone}-${id}.mp4`;
        const vttBase = `${basePath}/${date}-${time}-${zone}-${id}`;

        const video = document.createElement('video');
        video.className = 'video-js';
        video.controls = true;
        video.width = 640;
        video.height = 360;

        const src = document.createElement('source');
        src.src = mp4Url;
        src.type = 'video/mp4';
        video.appendChild(src);

        const videoContainer = document.createElement('div');
        videoContainer.innerHTML = `
          <h4>${title}</h4>
          <p>${segmenttitle}</p>
          <p>${snippet}</p>
          <p>Start time: ${snippetstarttimesecs} secs, End time: ${snippetendtimesecs} secs</p>
          <select class="order-dropdown">
            <option value="" disabled selected>Select order</option>
            ${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}
          </select>
          <p><a href="${splitApi}?vurl=${mp4Url}&starttime=${snippetstarttimesecs}&endtime=${snippetendtimesecs}" target="_blank">Clip it (no subtitles)</a></p>
        `;

        const player = videojs(video);
        player.ready(() => {
          player.currentTime(snippetstarttimesecs);
        });
        player.on('timeupdate', () => {
          if (player.currentTime() >= snippetendtimesecs) player.pause();
        });

        videoContainer.appendChild(video);
        resultsContainer.appendChild(videoContainer);
      }
    } catch (err) {
      console.error('Error fetching chat data:', err);
      resultsContainer.innerHTML = `<p>Failed to load results</p>`;
    }
  }

  async function mergeSelectedVideos() {
    const dropdowns = document.querySelectorAll('.order-dropdown');
    if (dropdowns.length < 2) {
      alert('Select at least 2 clips to merge.');
      return;
    }

    const videoUrls = [];
    const startTimes = [];
    const endTimes = [];
    const mergeOrder = [];

    for (const dropdown of dropdowns) {
      const order = dropdown.value;
      if (!order) continue;

      const container = dropdown.closest('div');
      const url = container.querySelector('video source')?.src;
      const timeText = Array.from(container.querySelectorAll('p'))
        .find(p => p.textContent.includes('Start time'))?.textContent || '';

      const start = timeText.match(/Start time: (\d+)/)?.[1];
      const end = timeText.match(/End time: (\d+)/)?.[1];
      if (url && start && end) {
        videoUrls.push(url);
        startTimes.push(start);
        endTimes.push(end);
        mergeOrder.push(parseInt(order));
      }
    }

    const sorted = videoUrls.map((url, i) => ({
      url, startTime: startTimes[i], endTime: endTimes[i], order: mergeOrder[i]
    })).sort((a, b) => a.order - b.order);

    const mergeQuery = sorted.map((v, i) =>
      `vurl${i + 1}=${encodeURIComponent(v.url)}&starttime${i + 1}=${v.startTime}&endtime${i + 1}=${v.endTime}`
    ).join('&');

    const mergeRequest = `${proxyUrl}?url=${encodeURIComponent(`${mergeUrl}?${mergeQuery}`)}`;

    try {
      loadingIndicator.style.display = 'block';
      const res = await fetch(mergeRequest);
      const txt = await res.text();
      const parsed = JSON.parse(txt);
      const mergedUrl = `http://clavisds02.feeltiptop.com${parsed.contents}`;
      resultsContainer.innerHTML = `<a href="${mergedUrl}" target="_blank">Merged Video</a>`;
    } catch (err) {
      console.error('Error merging videos:', err);
      resultsContainer.innerHTML = `<p>Merge failed</p>`;
    } finally {
      loadingIndicator.style.display = 'none';
    }
  }

  // Event listeners
  chatBtn?.addEventListener('click', triggerChat);
  chatInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') triggerChat();
  });
  speakerDropdown?.addEventListener('change', triggerChat);
  numutterDropdown?.addEventListener('change', e => {
    numutter = e.target.value;
    triggerChat();
  });
  document.getElementById('merge-btn')?.addEventListener('click', mergeSelectedVideos);

  fetchSpeakers();
}