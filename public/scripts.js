/**
 * Comm360 - WebRTC video conferencing with room support
 * Enhanced from original WebRTC implementation
 */

// Application state
const state = {
  userName: '',
  roomId: null,
  isHost: false,
  participants: [],
  localStream: null,
  remoteStream: null,
  peerConnection: null,
  didIOffer: false,
  isMuted: false,
  isVideoOff: false,
  isInCall: false,
  meetingStartTime: null,
  availableDevices: {
    audioInput: [],
    audioOutput: [],
    videoInput: []
  },
  selectedDevices: {
    audioInput: null,
    audioOutput: null,
    videoInput: null
  }
};

// ─ Recording state ─────────────
let mediaRecorder;
let chunkTimer;
let recordedChunks = [];
let sessionStartTime = null;
let sessionId = null;   // identify this “recording session” across chunks
let chunkIndex = 0;
const chatLog = [];
// ──────────────────────────────
let avatarClips = [];      // will be filled with objects { snippet, videoUrl }
let avatarIndex = 0;       // which clip is currently showing

// Function to get DOM elements (used to ensure elements are found after DOM is fully loaded)
function getDOMElements() {
  return {
    // Landing page elements
    landingContainer: document.getElementById('landing-container'),
    createRoomBtn: document.getElementById('create-room'),
    joinRoomBtn: document.getElementById('join-room'),
    roomIdInput: document.getElementById('room-id-input'),
    displayNameInput: document.getElementById('display-name-input'),
    activeRoomsList: document.getElementById('active-rooms-list'),
    cameraPreview: document.getElementById('camera-preview'),
    togglePreviewVideo: document.getElementById('toggle-preview-video'),
    togglePreviewAudio: document.getElementById('toggle-preview-audio'),
    
    // Meeting elements
    meetingContainer: document.getElementById('meeting-container'),
    userNameEl: document.getElementById('user-name'),
    meetingIdEl: document.getElementById('meeting-id'),
    meetingTimer: document.getElementById('meeting-timer'),
    copyInviteBtn: document.getElementById('copy-invite'),
    
    // Video elements
    localVideo: document.getElementById('local-video'),
    remoteVideo: document.getElementById('remote-video'),
    toggleGridView: document.getElementById('toggle-grid-view'),
    participantsGrid: document.getElementById('participants-grid'),
    
    // Controls
    toggleAudio: document.getElementById('toggle-audio'),
    toggleVideo: document.getElementById('toggle-video'),
    shareScreen: document.getElementById('share-screen'),
    chatBtn: document.getElementById('chat'),
    participantsBtn: document.getElementById('participants'),
    settingsBtn: document.getElementById('settings'),
    callButton: document.getElementById('call'),
    hangupButton: document.getElementById('hangup'),
    
    // Sidebars
    chatSidebar: document.getElementById('chat-sidebar'),
    chatMessages: document.getElementById('chat-messages'),
    chatInput: document.getElementById('chat-input'),
    sendChatBtn: document.getElementById('send-chat'),
    closeChatBtn: document.getElementById('close-chat'),
    participantsSidebar: document.getElementById('participants-sidebar'),
    closeParticipantsBtn: document.getElementById('close-participants'),
    
    // Device settings
    audioInputSelect: document.getElementById('audio-input-select'),
    audioOutputSelect: document.getElementById('audio-output-select'),
    videoInputSelect: document.getElementById('video-input-select'),
    settingsVideoPreview: document.getElementById('settings-video-preview'),
    applySettingsBtn: document.getElementById('apply-settings'),
    themeSelect: document.getElementById('meeting-theme-select')
  };
}

// Initialize elements as empty, will be properly populated during initialization
let elements = {};

// Generate a random username for initial display
state.userName = `User-${Math.floor(Math.random() * 100000)}`;
if (elements.displayNameInput) elements.displayNameInput.value = state.userName;
if (elements.userNameEl) elements.userNameEl.textContent = state.userName;

// Signaling server URL injected in index.html
const SIGNALING_SERVER_URL = window.SIGNALING_SERVER_URL;
if (!SIGNALING_SERVER_URL) {
  console.error('SIGNALING_SERVER_URL is not defined.');
}

// Socket.io initialization - will connect after room is selected
let socket = null;

/**
 * Room Management Functions
 */

// Initialize the application
async function init() {
  console.log('Initializing application...');
  try {
    // Important: Get DOM elements now that the document is fully loaded
    elements = getDOMElements();
    console.log('DOM elements loaded:', Object.keys(elements).filter(key => elements[key] !== null).length, 'found');
    
    // Check specifically for buttons to debug
    if (elements.createRoomBtn) {
      console.log('Create room button found in DOM: ', elements.createRoomBtn);
    } else {
      console.error('Create room button NOT found in DOM');
    }
    
    // Setup event listeners for UI elements
    setupEventListeners();
    
    // Load available rooms
    await fetchActiveRooms();
    
    // Start camera preview
    await setupDevices();
    startPreview();
    
    // Add direct click handler to button elements
    // This is a failsafe in case the other listeners don't work
    document.querySelectorAll('button').forEach(btn => {
      const id = btn.id;
      console.log(`Found button with ID: ${id}`);
      // if (id === 'create-room') {
      //   btn.onclick = function() {
      //     console.log('Create room clicked (direct handler)');
      //     createRoom();
      //   };
      // } else if (id === 'join-room') {
      //   btn.onclick = function() {
      //     console.log('Join room clicked (direct handler)');
      //     joinRoom();
      //   };
      // }
    });
    
    console.log('Application initialized successfully');
  } catch (error) {
    console.error('Error initializing application:', error);
  }

  // — Theme toggle logic —
  const themeToggle = document.getElementById('theme-toggle');
  // initialize from localStorage (default = dark)
  if (localStorage.getItem('theme') === 'light') {
    document.documentElement.classList.add('light-mode');
  }

  // on click, flip the class and persist
  themeToggle.addEventListener('click', () => {
    const isLight = document.documentElement.classList.toggle('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
  });

  if (elements.themeSelect) {
    // set the initial dropdown value from localStorage
    const saved = localStorage.getItem('theme') || 'dark';
    elements.themeSelect.value = saved;
    
    // when user picks a theme in the modal…
    elements.themeSelect.addEventListener('change', e => {
      const isLight = e.target.value === 'light';
      // apply to <html> so all your .light-mode rules fire
      document.documentElement.classList.toggle('light-mode', isLight);
      // update the floating toggle button icon too
      const themeToggle = document.getElementById('theme-toggle');
      if (themeToggle) themeToggle.textContent = isLight ? '🌙' : '🔆';
      // remember choice
      localStorage.setItem('theme', isLight ? 'light' : 'dark');
    });
  }
}

// Initialize the signaling connection for a specific room
function initializeSignaling(roomId) {
  if (socket) socket.disconnect();
  
  // Get the latest username from input
  if (elements.displayNameInput.value.trim()) {
    state.userName = elements.displayNameInput.value.trim();
  }
  
  // Connect to signaling server with room ID
  socket = io(SIGNALING_SERVER_URL, {
    transports: ['websocket'],
    auth: { 
      userName: state.userName, 
      password: 'x',
      roomId: roomId
    }
  });
  
  // Setup all socket event listeners
  setupSocketListeners();
  
  // Update UI with room information
  state.roomId = roomId;
  if (elements.meetingIdEl) elements.meetingIdEl.textContent = roomId;
  if (elements.userNameEl) elements.userNameEl.textContent = state.userName;
  
  console.log(`🔌 Connected to signaling server for room: ${roomId}`);
}

// Create a new room and join it
function createRoom() {
  const roomId = `room-${Math.floor(Math.random() * 1000000)}`;
  state.isHost = true;
  
  // Initialize signaling
  initializeSignaling(roomId);
  
  // Switch to meeting view
  showMeetingView();
  // initiateCall().catch(console.error);
}

// Join an existing room
function joinRoom(roomId) {
  if (!roomId) roomId = elements.roomIdInput.value.trim();
  if (!roomId) {
    alert('Please enter a valid room ID');
    return;
  }
  
  // Initialize signaling
  initializeSignaling(roomId);
  
  // Switch to meeting view
  showMeetingView();
  initiateCall().catch(console.error);
}

// Switch from landing page to meeting view
function showMeetingView() {
  // Hide landing page, show meeting container
  elements.landingContainer.classList.add('d-none');
  elements.meetingContainer.classList.remove('d-none');
  
  // Start meeting timer
  startMeetingTimer();
  
  // If we have a preview stream, transfer it to the meeting view
  if (state.localStream) {
    elements.localVideo.srcObject = state.localStream;
    // load past recordings for this room
    loadRecordings();
  }
  updateLocalMuteUI();
}

/**
 * Fetch and render this room's recordings in a vertical, snap-scroll feed.
 */
async function loadRecordings() {
  const feed = document.getElementById('recordings-feed');
  if (!feed) return;
  feed.innerHTML = '';

  // 1) Fetch all clips for this room in one go
  const res = await fetch(`${SIGNALING_SERVER_URL}/api/recordings/${state.roomId}`);
  if (!res.ok) return;
  const { clips } = await res.json();
  if (!clips.length) return; // nothing to show

  // Show the feed container now that we have at least one clip
  feed.style.display = 'block';

  // 2) Render each clip as a full‐viewport “reel”
  clips
    // (optional) sort by start time
    .sort((a, b) => new Date(a.metadata.startTime) - new Date(b.metadata.startTime))
    .forEach(({ sessionId }) => {
      const item = document.createElement('div');
      item.className = 'recording-item';

      const video = document.createElement('video');
      video.src         = `${SIGNALING_SERVER_URL}/recordings/files/${sessionId}/full.webm`;
      video.controls    = true;
      video.loop        = true;
      video.muted       = true;
      video.playsInline = true;

      item.appendChild(video);
      feed.appendChild(item);
    });
}

// Start the meeting timer
function startMeetingTimer() {
  state.meetingStartTime = new Date();
  
  function updateTimer() {
    if (!state.meetingStartTime) return;
    
    const elapsed = new Date() - state.meetingStartTime;
    const seconds = Math.floor((elapsed / 1000) % 60);
    const minutes = Math.floor((elapsed / (1000 * 60)) % 60);
    const hours = Math.floor(elapsed / (1000 * 60 * 60));
    
    elements.meetingTimer.textContent = 
      `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  
  updateTimer();
  setInterval(updateTimer, 1000);
}

// Fetch active rooms from the server
async function fetchActiveRooms() {
  try {
    const response = await fetch(`${SIGNALING_SERVER_URL}/rooms`);
    if (!response.ok) throw new Error('Failed to fetch rooms');
    
    const data = await response.json();
    displayActiveRooms(data.rooms);
  } catch (error) {
    console.error('Error fetching rooms:', error);
    elements.activeRoomsList.innerHTML = '<div class="room-error">Could not load rooms</div>';
  }
}

// Display active rooms in the UI
function displayActiveRooms(rooms) {
  if (!rooms || !rooms.length) {
    elements.activeRoomsList.innerHTML = '<div class="room-empty">No active rooms available</div>';
    return;
  }
  
  const roomsHtml = rooms.map(room => `
    <div class="room-card" data-room-id="${room.roomId}">
      <div class="room-card-info">
        <i class="fas fa-video"></i>
        ${room.roomId}
      </div>
      <button class="btn btn-sm btn-success room-join-btn">
        <i class="fas fa-sign-in-alt"></i> Join
      </button>
    </div>
  `).join('');
  
  elements.activeRoomsList.innerHTML = roomsHtml;
  
  // Add event listeners to room join buttons
  document.querySelectorAll('.room-join-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const roomId = e.target.closest('.room-card').dataset.roomId;
      joinRoom(roomId);
    });
  });
}

/**
 * Device Management Functions
 */

// Setup available media devices
async function setupDevices() {
  try {
    // Request permission to access media devices
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    
    // We'll use this stream for the preview
    state.localStream = stream;
    
    // Enumerate all available devices
    const devices = await navigator.mediaDevices.enumerateDevices();
    
    // Filter devices by type
    state.availableDevices.audioInput = devices.filter(device => device.kind === 'audioinput');
    state.availableDevices.audioOutput = devices.filter(device => device.kind === 'audiooutput');
    state.availableDevices.videoInput = devices.filter(device => device.kind === 'videoinput');
    
    // Update device selection UI
    updateDeviceSelectors();
    
    // Set default selections
    if (state.availableDevices.audioInput.length) {
      state.selectedDevices.audioInput = state.availableDevices.audioInput[0].deviceId;
    }
    if (state.availableDevices.audioOutput.length) {
      state.selectedDevices.audioOutput = state.availableDevices.audioOutput[0].deviceId;
    }
    if (state.availableDevices.videoInput.length) {
      state.selectedDevices.videoInput = state.availableDevices.videoInput[0].deviceId;
    }
  } catch (error) {
    console.error('Error accessing media devices:', error);
    alert('Could not access camera or microphone. Please ensure you have granted permission.');
  }
}

// Update device selection dropdowns
function updateDeviceSelectors() {
  // Audio inputs
  elements.audioInputSelect.innerHTML = state.availableDevices.audioInput
    .map(device => `<option value="${device.deviceId}">${device.label || `Microphone ${device.deviceId.slice(0, 5)}...`}</option>`)
    .join('');
  
  // Audio outputs (if supported)
  if ('sinkId' in HTMLMediaElement.prototype) {
    elements.audioOutputSelect.innerHTML = state.availableDevices.audioOutput
      .map(device => `<option value="${device.deviceId}">${device.label || `Speaker ${device.deviceId.slice(0, 5)}...`}</option>`)
      .join('');
  } else {
    elements.audioOutputSelect.disabled = true;
    elements.audioOutputSelect.parentElement.classList.add('d-none');
  }
  
  // Video inputs
  elements.videoInputSelect.innerHTML = state.availableDevices.videoInput
    .map(device => `<option value="${device.deviceId}">${device.label || `Camera ${device.deviceId.slice(0, 5)}...`}</option>`)
    .join('');
}

// Start camera preview for landing page
function startPreview() {
  if (state.localStream && elements.cameraPreview) {
    elements.cameraPreview.srcObject = state.localStream;
  }
}

// Apply device settings changes
async function applyDeviceSettings() {
  const audioSource = elements.audioInputSelect.value;
  const videoSource = elements.videoInputSelect.value;
  
  // Stop any existing tracks
  if (state.localStream) {
    state.localStream.getTracks().forEach(track => track.stop());
  }
  
  // Get new stream with selected devices
  try {
    const constraints = {
      audio: audioSource ? { deviceId: { exact: audioSource } } : true,
      video: videoSource ? { deviceId: { exact: videoSource } } : true
    };
    
    state.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    
    // Update all video elements with the new stream
    if (elements.cameraPreview) {
      elements.cameraPreview.srcObject = state.localStream;
    }
    if (elements.settingsVideoPreview) {
      elements.settingsVideoPreview.srcObject = state.localStream;
    }
    if (elements.localVideo) {
      elements.localVideo.srcObject = state.localStream;
    }
    
    // Apply audio output setting if supported
    if ('sinkId' in HTMLMediaElement.prototype) {
      const audioOutput = elements.audioOutputSelect.value;
      if (audioOutput) {
        await elements.remoteVideo.setSinkId(audioOutput);
      }
    }
    
    // If in a call, we need to update the peer connection
    if (state.peerConnection && state.isInCall) {
      // Replace tracks in the RTCPeerConnection
      const audioSender = state.peerConnection.getSenders().find(s => s.track?.kind === 'audio');
      const videoSender = state.peerConnection.getSenders().find(s => s.track?.kind === 'video');
      
      const audioTrack = state.localStream.getAudioTracks()[0];
      const videoTrack = state.localStream.getVideoTracks()[0];
      
      if (audioSender && audioTrack) await audioSender.replaceTrack(audioTrack);
      if (videoSender && videoTrack) await videoSender.replaceTrack(videoTrack);
    }
    
    // Save selected devices
    state.selectedDevices.audioInput = audioSource;
    state.selectedDevices.videoInput = videoSource;
    state.selectedDevices.audioOutput = elements.audioOutputSelect.value;
    
    console.log('Applied device settings:', state.selectedDevices);
    
    // Close settings modal
    const settingsModal = bootstrap.Modal.getInstance(document.getElementById('settings-modal'));
    if (settingsModal) settingsModal.hide();
    
  } catch (error) {
    console.error('Error applying device settings:', error);
    alert('Failed to apply device settings. Please try different devices.');
  }
}

/**
 * UI Event Listeners
 */
function setupEventListeners() {
  console.log('Setting up event listeners...');
  
  // Debug what DOM elements we found
  console.log('DOM elements state:', {
    createRoomBtn: elements.createRoomBtn,
    joinRoomBtn: elements.joinRoomBtn,
    roomIdInput: elements.roomIdInput,
    displayNameInput: elements.displayNameInput
  });
  
  // Landing page - Create room
  if (elements.createRoomBtn) {
    console.log('Adding event listener to createRoomBtn');
    elements.createRoomBtn.addEventListener('click', function() {
      console.log('Create room button clicked');
      createRoom();
    });
  } else {
    console.error('Create room button not found in DOM');
  }
  
  // Landing page - Join room
  if (elements.joinRoomBtn) {
    console.log('Adding event listener to joinRoomBtn');
    elements.joinRoomBtn.addEventListener('click', function() {
      console.log('Join room button clicked');
      joinRoom();
    });
  } else {
    console.error('Join room button not found in DOM');
  }
  
  if (elements.roomIdInput) {
    elements.roomIdInput.addEventListener('keypress', e => {
      if (e.key === 'Enter') joinRoom();
    });
  }
  
  // Preview controls
  elements.togglePreviewVideo?.addEventListener('click', () => {
    const videoTracks = state.localStream?.getVideoTracks();
    if (videoTracks && videoTracks.length > 0) {
      const enabled = !videoTracks[0].enabled;
      videoTracks[0].enabled = enabled;
      elements.togglePreviewVideo.innerHTML = enabled ? 
        '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';
    }
  });
  
  elements.togglePreviewAudio?.addEventListener('click', () => {
    const audioTracks = state.localStream?.getAudioTracks();
    if (audioTracks && audioTracks.length > 0) {
      const enabled = !audioTracks[0].enabled;
      audioTracks[0].enabled = enabled;
      elements.togglePreviewAudio.innerHTML = enabled ? 
        '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
    }
  });
  
  // Refresh active rooms periodically
  setInterval(fetchActiveRooms, 10000);
  
  // Copy meeting invite link
  elements.copyInviteBtn?.addEventListener('click', () => {
    const inviteUrl = `${window.location.origin}?room=${state.roomId}`;
    navigator.clipboard.writeText(inviteUrl)
      .then(() => {
        elements.copyInviteBtn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => {
          elements.copyInviteBtn.innerHTML = '<i class="fas fa-copy"></i>';
        }, 2000);
      })
      .catch(err => {
        console.error('Failed to copy:', err);
        alert(`Copy this link to invite others: ${inviteUrl}`);
      });
  });
  
  // Toggle grid/speaker view
  elements.toggleGridView?.addEventListener('click', () => {
    elements.participantsGrid.classList.toggle('speaker-view');
    const isGridView = !elements.participantsGrid.classList.contains('speaker-view');
    elements.toggleGridView.innerHTML = isGridView ? 
      '<i class="fas fa-th-large"></i> Gallery View' : '<i class="fas fa-user"></i> Speaker View';
  });
  
  // Audio/Video controls
  elements.toggleAudio?.addEventListener('click', () => toggleAudio());
  elements.toggleVideo?.addEventListener('click', () => toggleVideo());
  
  // Show/hide chat sidebar
  elements.chatBtn?.addEventListener('click', () => {
    elements.chatSidebar.classList.toggle('show');
    elements.participantsSidebar.classList.remove('show');
  });
  elements.closeChatBtn?.addEventListener('click', () => {
    elements.chatSidebar.classList.remove('show');
  });

  // Send chat messages
  elements.sendChatBtn?.addEventListener('click', sendChatMessage);
  elements.chatInput?.addEventListener('keypress', e => {
    if (e.key === 'Enter') sendChatMessage();
  });
  
  // Show/hide participants sidebar
  elements.participantsBtn?.addEventListener('click', () => {
    elements.participantsSidebar.classList.toggle('show');
    elements.chatSidebar.classList.remove('show');
  });
  elements.closeParticipantsBtn?.addEventListener('click', () => {
    elements.participantsSidebar.classList.remove('show');
  });
  
  // Settings button
  elements.settingsBtn?.addEventListener('click', () => {
    // Update preview in settings modal
    if (elements.settingsVideoPreview && state.localStream) {
      elements.settingsVideoPreview.srcObject = state.localStream;
    }
    
    // Initialize Bootstrap modal
    const settingsModal = new bootstrap.Modal(document.getElementById('settings-modal'));
    settingsModal.show();
  });
  
  // Apply settings button
  elements.applySettingsBtn?.addEventListener('click', () => applyDeviceSettings());
  
  // Call and hangup
  elements.hangupButton?.addEventListener('click', () => {
    socket.emit('hangup');
    cleanup();
    if (elements.callButton) elements.callButton.disabled = false;
    if (elements.hangupButton) elements.hangupButton.disabled = true;

    window.location.href = window.location.origin;
  });
  
  // Check URL for room parameter
  checkUrlForRoom();

  // Recording controls (stop-and-restart every 60 s)
  const startRecordingBtn = document.getElementById('start-recording');
  const stopRecordingBtn  = document.getElementById('stop-recording');

  if (startRecordingBtn && stopRecordingBtn) {
    startRecordingBtn.addEventListener('click', () => {
      if (!state.localStream) return alert('No media stream!');

      // New session ID and reset chunk index
      sessionId         = Date.now().toString();
      chunkIndex        = 0;
      sessionStartTime  = Date.now();

      startRecordingBtn.disabled = true;
      stopRecordingBtn.disabled  = false;

      // begin the first 60 s segment
      startNextSegment();
    });

    stopRecordingBtn.addEventListener('click', () => {
      stopRecordingBtn.disabled = true;
      // cancel the pending auto-restart
      clearTimeout(segmentTimer);
      // this will NOT re-invoke startNextSegment()
      mediaRecorder.stop();
      startRecordingBtn.disabled = false;
    });
  }

  // Avatar panel toggle
  const addAvatarBtn = document.getElementById('add-avatar');
  const avatarPanel  = document.getElementById('avatar-panel');
  console.log('👀 avatarBtn:', addAvatarBtn, 'avatarPanel:', avatarPanel);
  const startTalk    = document.getElementById('start-talking');
  const stopTalk     = document.getElementById('stop-talking');
  const textInput    = document.getElementById('avatar-text-input');
  const textSubmit   = document.getElementById('avatar-text-submit');
  const transcriptEl = document.getElementById('avatar-transcript');
  let avatarRecorder, avatarChunks = [], avatarMicStream;

  addAvatarBtn?.addEventListener('click', () => {
    console.log('🟢 avatar button clicked');
    avatarPanel.classList.toggle('show');
    // when opening, enable “Start” button
    if (!avatarPanel.classList.contains('show')) {
      startTalk.disabled = false;
    }
  });

  startTalk?.addEventListener('click', async () => {
    startTalk.disabled = true;
    stopTalk.disabled  = false;
    avatarChunks = [];
    avatarMicStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    avatarRecorder   = new MediaRecorder(avatarMicStream);
    avatarRecorder.ondataavailable = e => e.data.size && avatarChunks.push(e.data);
    avatarRecorder.start();
  });

  stopTalk?.addEventListener('click', async () => {
    stopTalk.disabled  = true;
    avatarRecorder.onstop = async () => {
      avatarMicStream.getTracks().forEach(t => t.stop());

      // 1) STT→LLM
      transcriptEl.textContent = '…thinking…';
      let replyText, json, userText;
      try {
        const blob = new Blob(avatarChunks, { type: 'audio/webm' });
        const form = new FormData();
        form.append('audio', blob, 'avatar.webm');
        const r = await fetch(`${SIGNALING_SERVER_URL}/bot/reply`, { method:'POST', body: form });
        // const json = await r.json();
        json = await r.json();          // assign to outer json
        console.log('🔊 /bot/reply response:', json);
        replyText = json.reply || json.transcript || '[no reply field]';
        userText  = json.transcript || '<no transcript returned>';
        console.log(userText);
      } catch (err) {
        transcriptEl.textContent = '[STT failed]';
        startTalk.disabled = false;
        return;
      }

      // 2) Parse the same way textSubmit does: build clips & render
      try {
        // raw.reply holds the JSON-encoded nested array
        const outer = JSON.parse(json.reply);
        const entries = Array.isArray(outer) && Array.isArray(outer[0]) ? outer[0] : [];

        // build avatarClips array
        avatarClips = entries.map(e => ({
          snippet:  e.snippet,
          videoUrl: `https://clavisds02.feeltiptop.com/360TeamCalls/downloads/` +
                    e.title.slice(0,4)+'/'+e.title.slice(5,7)+'/'+e.title+'/'+e.title+'.mp4' +
                    `#t=${e.videodetails.snippetstarttimesecs},${e.videodetails.snippetendtimesecs}`
        }));
        avatarIndex = 0;

        // inject slot if first time
        const grid = document.getElementById('participants-grid');
        if (grid && !document.getElementById('avatar-container')) {
          grid.classList.add('three-participants');
          const avatarSlot = document.createElement('div');
          avatarSlot.id = 'avatar-container';
          avatarSlot.className = 'video-wrapper';
          avatarSlot.innerHTML = `
            <div class="video-placeholder" id="avatar-placeholder">
              <i class="fas fa-robot fa-2x"></i><p>Your Avatar</p>
            </div>
            <video id="avatar-video" autoplay playsinline hidden></video>
            <div class="video-overlay"><div class="participant-name">Avatar</div></div>`;
          grid.appendChild(avatarSlot);
        }

        // render first clip
        renderAvatarClip(0);
        avatarIndex = 0;
        const prevBtn = document.getElementById('avatar-prev');
        const nextBtn = document.getElementById('avatar-next');
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = avatarClips.length < 2;
      } catch (err2) {
        // fallback to raw JSON on parse failure
        transcriptEl.textContent = JSON.stringify(json, null, 2);
      }
      // Re-enable the Start button
      startTalk.disabled = false;
      socket.emit('avatarOutput', json);
    };
    avatarRecorder.stop();
  });

  textSubmit.addEventListener('click', async () => {
    const question = textInput.value.trim();
    if (!question) return;
    textSubmit.disabled = true;
    document.getElementById('avatar-transcript').textContent = 'Thinking…';

    try {
      // 1) send text to your Bot API and display raw JSON
      const replyRes = await fetch(`${SIGNALING_SERVER_URL}/bot/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: question })
      });
      const raw = await replyRes.json();
      // parse out the array of snippet objects
      let entries = [];
      try {
        const outer = JSON.parse(raw.reply);
        entries = Array.isArray(outer) && Array.isArray(outer[0]) ? outer[0] : [];
      } catch (e) {
        transcriptEl.textContent = raw.reply;
        textSubmit.disabled = false;
        return;
      }

      // build our avatarClips array
      avatarClips = entries.map(e => ({
        snippet:  e.snippet,
        videoUrl: `https://clavisds02.feeltiptop.com/360TeamCalls/downloads/` +
                  e.title.slice(0,4)+'/'+e.title.slice(5,7)+'/'+e.title+'/'+e.title+'.mp4' +
                  `#t=${e.videodetails.snippetstarttimesecs},${e.videodetails.snippetendtimesecs}`
      }));
      avatarIndex = 0;

      // enable nav buttons
      document.getElementById('avatar-prev').disabled = true;
      document.getElementById('avatar-next').disabled = avatarClips.length < 2;

      // render first clip
      renderAvatarClip(0);
      textSubmit.disabled = false;
      socket.emit('avatarOutput', raw);
    } catch (err) {
      console.error('Avatar text query failed', err);
      document.getElementById('avatar-transcript')
              .textContent = 'Error – please try again.';
      textSubmit.disabled = false;
    }
  });

  // ── AVATAR NAVIGATION ─────────────────────────────────────────────────
  const prevBtn = document.getElementById('avatar-prev');
  const nextBtn = document.getElementById('avatar-next');

  prevBtn?.addEventListener('click', () => {
    console.log('👈 avatar-prev clicked');
    if (avatarIndex > 0) {
      avatarIndex--;
      renderAvatarClip(avatarIndex);
      prevBtn.disabled = avatarIndex === 0;
      nextBtn.disabled = false;
      socket.emit('avatarNavigate', { index: avatarIndex });
    }
  });

  nextBtn?.addEventListener('click', () => {
    console.log('👉 avatar-next clicked');
    if (avatarIndex < avatarClips.length - 1) {
      avatarIndex++;
      renderAvatarClip(avatarIndex);
      nextBtn.disabled = avatarIndex === avatarClips.length - 1;
      prevBtn.disabled = false;
      socket.emit('avatarNavigate', { index: avatarIndex });
    }
  });
  // ─────────────────────────────────────────────────────────────────────
}

// Render a given clip index into the sidebar text + avatar video element
function renderAvatarClip(i) {
  const clip = avatarClips[i];
  document.getElementById('avatar-transcript').textContent = clip.snippet;
  const av = document.getElementById('avatar-video');
  if (av) {
    av.srcObject = null;
    av.src      = clip.videoUrl;
    av.load();
    av.hidden   = false;
    av.controls = true;
    av.play().catch(err => {
      if (err.name !== 'AbortError') {
        console.error('Avatar video playback failed:', err);
      }
  });
  }
}

// Prev/Next button wiring
const prevBtn = document.getElementById('avatar-prev');
prevBtn.replaceWith(prevBtn.cloneNode(true));
document.getElementById('avatar-prev').addEventListener('click', () => {
  if (avatarIndex > 0) {
    avatarIndex--;
    renderAvatarClip(avatarIndex);
    document.getElementById('avatar-next').disabled = false;
    document.getElementById('avatar-prev').disabled = avatarIndex === 0;
    socket.emit('avatarNavigate', { index: avatarIndex });
  }
});
const nextBtn = document.getElementById('avatar-next');
nextBtn.replaceWith(nextBtn.cloneNode(true));
document.getElementById('avatar-next').addEventListener('click', () => {
  if (avatarIndex < avatarClips.length - 1) {
    avatarIndex++;
    renderAvatarClip(avatarIndex);
    document.getElementById('avatar-prev').disabled = false;
    document.getElementById('avatar-next').disabled = avatarIndex === avatarClips.length - 1;
    socket.emit('avatarNavigate', { index: avatarIndex });
  }
});

window.addEventListener('load', () => {
  const wrapper = document.getElementById('participants-grid');
  if (wrapper && !document.getElementById('avatar-video')) {
    const avatarVideo = document.createElement('video');
    avatarVideo.id       = 'avatar-video';
    avatarVideo.classList.add('remote-video','avatar-participant');
    avatarVideo.controls = true;
    avatarVideo.hidden   = true;
    wrapper.appendChild(avatarVideo);
  }
});

// ─── helper: record 60 s, upload, then auto-restart ────────────────────────
let segmentTimer;

function startNextSegment() {
  mediaRecorder = new MediaRecorder(state.localStream, {
    mimeType: 'video/webm; codecs=vp8'
  });

  mediaRecorder.ondataavailable = async e => {
    if (!e.data || e.data.size === 0) return;

    console.log(`🔖 Chunk #${chunkIndex} ready (${e.data.size} bytes)`);

    // build metadata
    const metadata = {
      sessionId,
      chunkIndex,
      roomId:        state.roomId,
      startOffsetMs: chunkIndex * 60000,
      timestamp:     new Date().toISOString()
    };

    // package for upload
    const form = new FormData();
    const name = String(chunkIndex).padStart(3, '0');
    form.append('video',
      e.data,
      `chunk_${name}.webm`
    );
    form.append('metadata',
      new Blob([JSON.stringify(metadata)], { type: 'application/json' }),
      `chunk_${name}.json`
    );

    try {
      const resp = await fetch(
        `${SIGNALING_SERVER_URL}/api/recordings`,
        { method: 'POST', body: form, mode: 'cors' }
      );
      if (!resp.ok) console.error('❌ chunk upload failed', await resp.text());
      else          console.log(`✅ Chunk #${chunkIndex} uploaded`);
    } catch (err) {
      console.error('❌ chunk upload error', err);
    }

    chunkIndex++;
  };

  mediaRecorder.onstop = () => {
    // if Stop button wasn't clicked (i.e. it’s still disabled = false), schedule next
    const stopBtn = document.getElementById('stop-recording');
    if (stopBtn.disabled) return;
    startNextSegment();
  };

  // start and schedule a stop in 60 s
  mediaRecorder.start();
  segmentTimer = setTimeout(() => mediaRecorder.stop(), 60000);
  console.log('📹 Started 60 s segment recorder');
}
// ─────────────────────────────────────────────────────────────────────────

function sendChatMessage() {
  const text = elements.chatInput.value.trim();
  if (!text) return;

  // Log outgoing chat
  chatLog.push({
    timestamp: Date.now() - (sessionStartTime || Date.now()),
    sender: state.userName,
    text
  });

  // send to server
  socket.emit('sendMessage', text);

  // render locally
  showMessage(text, 'from-me');
  elements.chatInput.value = '';
}

// Toggle audio mute
function toggleAudio() {
  const audioTracks = state.localStream?.getAudioTracks();
  if (audioTracks && audioTracks.length > 0) {
    state.isMuted = !state.isMuted;
    audioTracks[0].enabled = !state.isMuted;
    
    // Update UI
    elements.toggleAudio.innerHTML = state.isMuted ? 
      '<i class="fas fa-microphone-slash"></i><span class="control-label">Unmute</span>' : 
      '<i class="fas fa-microphone"></i><span class="control-label">Mute</span>';
    
    const audioBadge = document.querySelector('#self-video-wrapper .audio-badge');
    if (audioBadge) {
      audioBadge.innerHTML = state.isMuted ? 
        '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
      audioBadge.classList.toggle('muted', state.isMuted);
    }
  }
}

// Toggle video
function toggleVideo() {
  const videoTracks = state.localStream?.getVideoTracks();
  if (videoTracks && videoTracks.length > 0) {
    state.isVideoOff = !state.isVideoOff;
    videoTracks[0].enabled = !state.isVideoOff;
    
    // Update UI
    elements.toggleVideo.innerHTML = state.isVideoOff ? 
      '<i class="fas fa-video-slash"></i><span class="control-label">Start Video</span>' : 
      '<i class="fas fa-video"></i><span class="control-label">Stop Video</span>';
  }
}

// Check URL for room parameter
function checkUrlForRoom() {
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  
  if (roomParam) {
    elements.roomIdInput.value = roomParam;
  }
}

/**
 * Fetch ICE server configuration from signaling server
 */
/**
 * WebRTC and Signaling Functions
 */

// Setup socket event listeners
function setupSocketListeners() {
  // Basic connection events
  socket.on('connect', () => console.log('🟢 Connected to signaling server'));
  socket.on('disconnect', () => {
    console.warn('🔴 Disconnected from signaling');
    cleanup();
  });
  
  // Room-specific events
  socket.on('roomParticipants', participants => {
    state.participants = participants;
    updateParticipantsList(participants);
  });
  
  // WebRTC signaling events
  socket.on('answerResponse', async offerObj => {
    try {
      await addAnswer(offerObj);
    } catch (e) {
      console.error('Error handling answerResponse:', e);
    }
  });
  
  socket.on('receivedIceCandidateFromServer', async candidate => {
    try {
      await addNewIceCandidate(candidate);
    } catch (e) {
      console.error('Error adding ICE candidate:', e);
    }
  });
  
  // Handle new offers from peers
  socket.on('newOfferAwaiting', offers => {
    if (!offers || !offers.length) return;
    
    // Only handle offers that aren't our own
    const incomingOffers = offers.filter(o => o.offererUserName !== state.userName);
    if (!incomingOffers.length) return;
    
    showIncomingCallUI(incomingOffers[0]);
  });
  
  // Handle hangup
  socket.on('hangup', userName => {
    console.log(`📞 ${userName} has left the call`);
    cleanup();
    if (elements.callButton) elements.callButton.disabled = false;
    if (elements.hangupButton) elements.hangupButton.disabled = true;
    showMessage(`${userName} has left the call`, 'system');

    window.location.href = window.location.origin;
  });

  socket.on('receiveMessage', ({ userName, message }) => {
    // Log incoming chat
    chatLog.push({
      timestamp: Date.now() - (sessionStartTime || Date.now()),
      sender: userName,
      text: message
    });
    showMessage(message, 'from-other');
  });

  socket.on('avatarOutput', json => {
    try {
      // parse exactly like your local code
      const outer = JSON.parse(json.reply || json.rawReply || '[]');
      const entries = Array.isArray(outer) && Array.isArray(outer[0]) ? outer[0] : [];
      avatarClips = entries.map(e => ({
        snippet:  e.snippet,
        videoUrl: `https://clavisds02.feeltiptop.com/360TeamCalls/downloads/` +
                  e.title.slice(0,4)+'/'+e.title.slice(5,7)+'/'+e.title+'/'+e.title+'.mp4' +
                  `#t=${e.videodetails.snippetstarttimesecs},${e.videodetails.snippetendtimesecs}`
      }));
      avatarIndex = 0;

      // inject the UI slot if this is the first time
      const grid = document.getElementById('participants-grid');
      if (grid && !document.getElementById('avatar-container')) {
        grid.classList.add('three-participants');
        const avatarSlot = document.createElement('div');
        avatarSlot.id = 'avatar-container';
        avatarSlot.className = 'video-wrapper';
        avatarSlot.innerHTML = `
          <div class="video-placeholder" id="avatar-placeholder">
            <i class="fas fa-robot fa-2x"></i><p>Your Avatar</p>
          </div>
          <video id="avatar-video" autoplay playsinline hidden></video>
          <div class="video-overlay"><div class="participant-name">Avatar</div></div>`;
        grid.appendChild(avatarSlot);
      }

      // finally, render the first clip
      renderAvatarClip(0);
    } catch (err) {
      console.error('Failed to render remote avatar output', err);
    }
  });

  socket.on('avatarNavigate', ({ index }) => {
    console.log('🛰 avatarNavigate received:', index);
    avatarIndex = index;
    renderAvatarClip(index);
    document.getElementById('avatar-prev').disabled = index === 0;
    document.getElementById('avatar-next').disabled = index === avatarClips.length - 1;
  });
}

// Update the participants list in the UI
function updateParticipantsList(participants) {
  const participantsList = document.querySelector('.participants-list');
  if (!participantsList) return;
  
  // Update the UI count
  const participantCount = document.getElementById('participant-count');
  if (participantCount) {
    participantCount.textContent = participants.length;
  }

  const sidebarHeader = document.querySelector('#participants-sidebar .sidebar-header h5');
  if (sidebarHeader) {
    sidebarHeader.textContent = `Participants (${participants.length})`;
  }
  
  // Build the participants list HTML
  const participantsHtml = participants.map(userName => {
    const isYou = userName === state.userName;
    return `
      <div class="participant-item">
        <div class="participant-info">
          <span class="participant-name">${isYou ? 'You' : userName}${isYou && state.isHost ? ' (Host)' : ''}</span>
        </div>
        <div class="participant-controls">
          <i class="fas fa-microphone${state.isMuted && isYou ? '-slash' : ''} ${isYou && state.isMuted ? 'disabled' : 'enabled'}"></i>
          <i class="fas fa-video${state.isVideoOff && isYou ? '-slash' : ''} ${isYou && state.isVideoOff ? 'disabled' : 'enabled'}"></i>
        </div>
      </div>
    `;
  }).join('');
  
  participantsList.innerHTML = participantsHtml;

  const gridEl = elements.participantsGrid;
  gridEl.classList.toggle('two-participants',   participants.length === 2);
  gridEl.classList.toggle('three-participants', participants.length === 3);
  gridEl.classList.toggle('four-participants',  participants.length === 4);
}

// Show incoming call UI
function showIncomingCallUI(offerObj) {
  const answerDiv = document.getElementById('answer');
  if (!answerDiv) return;

  answerDiv.innerHTML = `
    <div class="incoming-call-modal">
      <p class="incoming-call-text">
        <strong>${offerObj.offererUserName}</strong> is requesting to join the call
      </p>
      <div class="incoming-call-buttons">
        <button id="accept-call-btn" class="btn btn-success">Accept</button>
        <button id="reject-call-btn" class="btn btn-danger ms-2">Reject</button>
      </div>
    </div>
  `;

  document
    .getElementById('accept-call-btn')
    .addEventListener('click', () => {
      answerOffer(offerObj).catch(console.error);
      answerDiv.innerHTML = '';
    });

  document
    .getElementById('reject-call-btn')
    .addEventListener('click', () => {
      socket.emit('rejectCall', offerObj.offererUserName);
      answerDiv.innerHTML = '';
    });
}

// Show a message in the chat
function showMessage(message, type = 'system') {
  if (!elements.chatMessages) return;
  
  const messageEl = document.createElement('div');
  messageEl.classList.add('chat-message');
  
  if (type === 'system') {
    messageEl.classList.add('system-message');
    messageEl.textContent = message;
  } else if (type === 'from-me') {
    messageEl.classList.add('from-me');
    messageEl.innerHTML = `<div class="message-content">${message}</div><div class="message-time">${new Date().toLocaleTimeString()}</div>`;
  } else if (type === 'from-other') {
    messageEl.classList.add('from-other');
    messageEl.innerHTML = `<div class="message-sender">${type}</div><div class="message-content">${message}</div><div class="message-time">${new Date().toLocaleTimeString()}</div>`;
  }
  
  elements.chatMessages.appendChild(messageEl);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

/**
 * WebRTC Core Functions
 */

// Fetch ICE server configuration from signaling server
// async function fetchIceConfig() {
//   const res = await fetch(`${SIGNALING_SERVER_URL}/ice`);
//   if (!res.ok) throw new Error('Failed to fetch ICE config');
//   const data = await res.json();
//   const iceServers = data.iceServers || [];

//   iceServers.unshift({
//     urls: [
//       'turn:54.210.247.10:3478?transport=udp',
//       'turn:54.210.247.10:3478?transport=tcp'
//     ],
//     username: 'webrtc',
//     credential: 'webrtc'
//   });
//   console.log('🔄 ICE servers including EC2 TURN:', iceServers);

//   return iceServers;
// }

async function fetchIceConfig() {
  return [{
    urls: [
      'turn:54.210.247.10:3478?transport=udp',
      'turn:54.210.247.10:3478?transport=tcp'
    ],
    username: 'webrtc',
    credential: 'webrtc'
  }];
}

// Initiate a call to peers in the room
async function initiateCall() {
  if (state.peerConnection) {
    console.warn('⚠️ Call already in progress');
    return;
  }
  
  state.isInCall = true;
  
  try {
    // Make sure we have local media
    if (!state.localStream) {
      await setupDevices();
    }
    
    // Setup peer connection
    await setupPeerConnection();
    
    // Create and send offer
    const offer = await state.peerConnection.createOffer();
    await state.peerConnection.setLocalDescription(offer);
    state.didIOffer = true;
    socket.emit('newOffer', offer);
    
    // Update UI
    if (elements.callButton) elements.callButton.disabled = true;
    if (elements.hangupButton) elements.hangupButton.disabled = false;
    
    console.log('📞 Call initiated');
  } catch (err) {
    console.error('Error initiating call:', err);
    state.isInCall = false;
  }
}

// Answer an incoming call offer
async function answerOffer(offerObj) {
  try {
    state.isInCall = true;
    
    // Make sure we have local media
    if (!state.localStream) {
      await setupDevices();
    }
    
    // Setup peer connection with the offer
    await setupPeerConnection(offerObj);
    
    // Create and send answer
    const answer = await state.peerConnection.createAnswer();
    await state.peerConnection.setLocalDescription(answer);
    offerObj.answer = state.peerConnection.localDescription;
    
    // Send answer and get saved ICE candidates
    const savedIce = await socket.emitWithAck('newAnswer', offerObj);
    
    // Add any ICE candidates that were collected before answer
    for (const c of savedIce) {
      await state.peerConnection.addIceCandidate(c);
    }
    
    // Update UI
    if (elements.callButton) elements.callButton.disabled = true;
    if (elements.hangupButton) elements.hangupButton.disabled = false;
    
    console.log('📞 Call answered');
    showMessage('Call connected', 'system');
  } catch (err) {
    console.error('Error answering call:', err);
    state.isInCall = false;
  }
}

// Process incoming answer to our offer
async function addAnswer(offerObj) {
  if (!state.peerConnection) {
    console.error('❌ No peerConnection to add answer.');
    return;
  }
  
  try {
    await state.peerConnection.setRemoteDescription(offerObj.answer);
    console.log('📞 Call connected (answer received)');
    showMessage('Call connected', 'system');
  } catch (err) {
    console.error('Error adding answer:', err);
  }
}

// Setup WebRTC peer connection
async function setupPeerConnection(offerObj = null) {
  // Get ICE servers from signaling server
  const iceServers = await fetchIceConfig();
  console.log('🔧 Creating RTCPeerConnection with ICE config:', iceServers);
  
  // Create peer connection
  state.peerConnection = new RTCPeerConnection({
    iceServers,
    iceTransportPolicy: "relay"   // ← force relay (TURN) only
  });

  // ── DEBUG: watch ICE‐connection & overall connection states ───────────
  state.peerConnection.addEventListener('iceconnectionstatechange', () => {
    console.log('❄️ ICE connection state:', state.peerConnection.iceConnectionState);
  });

  state.peerConnection.addEventListener('connectionstatechange', () => {
    console.log('🔗 Peer connection state:', state.peerConnection.connectionState);
    if (state.peerConnection.connectionState === 'failed') {
      // if we hit "failed", dump any succeeded candidate‐pairs for post‐mortem
      state.peerConnection.getStats().then(stats => {
        stats.forEach(report => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            console.log('👉 Successful candidate-pair:', report);
          }
        });
      });
    }
  });
  // ───────────────────────────────────────────────────────────────────────

  state.peerConnection.addEventListener('icegatheringstatechange', () => {
    console.log('🟡 ICE gathering state:', state.peerConnection.iceGatheringState);
    if (state.peerConnection.iceGatheringState === 'complete') {
      // Once done, inspect final relay candidates
      state.peerConnection.getStats().then(stats => {
        const relays = [...stats.values()]
          .filter(s => s.candidateType === 'relay');
        console.log('🛡️ Final relay candidates:', relays);
      });
    }
  });

  // ── Diagnostics: log candidate types ──────────────────────────────
  state.peerConnection.addEventListener('icecandidate', e => {
    if (e.candidate) {
      console.log('[ICE]', e.candidate.type, e.candidate.candidate);
    }
  });
  // ─────────────────────────────────────────────────────────────────

  // Prepare remote stream
  state.remoteStream = new MediaStream();
  if (elements.remoteVideo) elements.remoteVideo.srcObject = state.remoteStream;

  // Send local tracks to peer
  if (state.localStream) {
    state.localStream.getTracks().forEach(track => {
      state.peerConnection.addTrack(track, state.localStream);
    });
  }

  // Relay ICE candidates via signaling server
  state.peerConnection.addEventListener('icecandidate', ({ candidate }) => {
    if (candidate) {
      socket.emit('sendIceCandidateToSignalingServer', {
        iceCandidate: candidate,
        iceUserName: state.userName,
        didIOffer: state.didIOffer
      });
    }
  });

  // Handle connection state changes
  state.peerConnection.addEventListener('connectionstatechange', () => {
    console.log('Connection state:', state.peerConnection.connectionState);
    
    // Update connection status indicator
    const connectionStatus = document.querySelector('#self-video-wrapper .connection-status i');
    if (connectionStatus) {
      if (state.peerConnection.connectionState === 'connected') {
        connectionStatus.className = 'fas fa-signal';
      } else if (state.peerConnection.connectionState === 'connecting') {
        connectionStatus.className = 'fas fa-signal poor';
      } else if (['disconnected', 'failed', 'closed'].includes(state.peerConnection.connectionState)) {
        connectionStatus.className = 'fas fa-signal bad';
      }
    }
  });

  // Handle incoming audio/video tracks
  state.peerConnection.addEventListener('track', ({ streams: [stream], track }) => {
    // Add this single track to our remoteStream
    state.remoteStream.addTrack(track);

    // If this is the remote audio track, show/update its badge
    if (track.kind === 'audio') {
      const remoteBadge = document.querySelector('#remote-video-wrapper .audio-badge');
      if (remoteBadge) {
        // unhide it
        remoteBadge.style.display = 'flex';
        // choose the right icon
        remoteBadge.innerHTML = track.enabled
          ? '<i class="fas fa-microphone"></i>'
          : '<i class="fas fa-microphone-slash"></i>';
        // toggle the muted class for red/green styling
        remoteBadge.classList.toggle('muted', !track.enabled);
      }
    }

    // Update remote participant name
    const remoteParticipantName = document.getElementById('remote-participant-name');
    if (remoteParticipantName) {
      const remoteName = state.participants.find(p => p !== state.userName);
      remoteParticipantName.textContent = remoteName || 'Remote Participant';
    }
  });


  // If answering an offer, set remote description
  if (offerObj && offerObj.offer) {
    await state.peerConnection.setRemoteDescription(offerObj.offer);
  }
}

// Add an ICE candidate received from the signaling server
async function addNewIceCandidate(candidate) {
  if (state.peerConnection) {
    try {
      await state.peerConnection.addIceCandidate(candidate);
    } catch (err) {
      console.error('Error adding ICE candidate:', err);
    }
  } else {
    console.warn('⚠️ Received ICE candidate but no peerConnection exists yet');
  }
}

function updateLocalMuteUI() {
  const audioTrack = state.localStream?.getAudioTracks()[0];
  if (!audioTrack) return;

  // isMuted = true when track.enabled === false
  state.isMuted = !audioTrack.enabled;

  // update the toolbar button
  if (elements.toggleAudio) {
    elements.toggleAudio.innerHTML = state.isMuted
      ? '<i class="fas fa-microphone-slash"></i><span class="control-label">Unmute</span>'
      : '<i class="fas fa-microphone"></i><span class="control-label">Mute</span>';
  }

  // update the badge on your self–video
  const badge = document.querySelector('#self-video-wrapper .audio-badge');
  if (badge) {
    badge.innerHTML = state.isMuted
      ? '<i class="fas fa-microphone-slash"></i>'
      : '<i class="fas fa-microphone"></i>';
    badge.classList.toggle('muted', state.isMuted);
  }
}

// Clean up WebRTC resources
function cleanup() {
  state.isInCall = false;
  
  // Close peer connection
  if (state.peerConnection) {
    state.peerConnection.getSenders().forEach(sender => sender.track?.stop());
    state.peerConnection.close();
    state.peerConnection = null;
  }
  
  // Don't stop local stream on cleanup to keep preview running
  // Just update remote stream
  if (state.remoteStream) {
    state.remoteStream.getTracks().forEach(t => t.stop());
    state.remoteStream = null;
    if (elements.remoteVideo) elements.remoteVideo.srcObject = null;
  }
  
  state.didIOffer = false;
  
  // Show waiting message
  const remoteParticipantName = document.getElementById('remote-participant-name');
  if (remoteParticipantName) {
    remoteParticipantName.textContent = 'Waiting for participants...';
  }
  
  console.log('📞 Call ended');
}

// Simple direct event listeners for the landing page buttons
window.onload = function() {
  console.log('Window loaded - setting up essential buttons');
  
  // // Direct handlers for the most important buttons
  // const createRoomBtn = document.getElementById('create-room');
  // const joinRoomBtn = document.getElementById('join-room');
  // const roomIdInput = document.getElementById('room-id-input');
  
  // if (createRoomBtn) {
  //   console.log('Found create room button, adding direct click handler');
  //   createRoomBtn.onclick = function() {
  //     console.log('Create room clicked');
  //     createRoom();
  //   };
  // }
  
  // if (joinRoomBtn) {
  //   console.log('Found join room button, adding direct click handler');
  //   joinRoomBtn.onclick = function() {
  //     console.log('Join room clicked');
  //     joinRoom();
  //   };
  // }
  
  // if (roomIdInput) {
  //   roomIdInput.addEventListener('keypress', function(e) {
  //     if (e.key === 'Enter') {
  //       joinRoom();
  //     }
  //   });
  // }
  
  // Start normal initialization
  init();
};

// Export functions for possible external use
export { 
  state,
  elements,
  socket,
  initiateCall,
  answerOffer,
  addAnswer,
  addNewIceCandidate,
  cleanup
};