/**
 * Production-ready client-side WebRTC + signaling logic with dynamic ICE acquisition.
 * Load via <script type="module" src="scripts.js"></script>
 */

// Generate a semi-unique username for this session
const userName = `Ishaan-${Math.floor(Math.random() * 100000)}`;
const password = 'x';
const userNameEl = document.getElementById('user-name');
if (userNameEl) userNameEl.textContent = userName;

// Signaling server URL injected in index.html
const SIGNALING_SERVER_URL = window.SIGNALING_SERVER_URL;
if (!SIGNALING_SERVER_URL) {
  console.error('SIGNALING_SERVER_URL is not defined.');
}

// Connect to signaling server via websocket
export const socket = io(SIGNALING_SERVER_URL, {
  transports: ['websocket'],
  auth: { userName, password }
});

// UI elements
const localVideo   = document.getElementById('local-video');
const remoteVideo  = document.getElementById('remote-video');
const callButton   = document.getElementById('call');
const hangupButton = document.getElementById('hangup');

// WebRTC state
let localStream    = null;
let remoteStream   = null;
let peerConnection = null;
let didIOffer      = false;

/**
 * Fetch ICE server configuration from signaling server
 */
async function fetchIceConfig() {
  const res = await fetch(`${SIGNALING_SERVER_URL}/ice`);
  if (!res.ok) throw new Error('Failed to fetch ICE config');
  const { iceServers } = await res.json();

  // Normalize each entry so it has a `urls` field
  return iceServers.map(s => {
    // Xirsys returns `url` for single-item entries
    const urls = s.urls || (s.url ? [s.url] : []);
    return {
      urls,
      username: s.username,
      credential: s.credential
    };
  });
}

// SIGNALING EVENT HANDLERS
socket.on('connect', () => console.log('🟢 Connected to signaling server'));
socket.on('disconnect', () => {
  console.warn('🔴 Disconnected from signaling');
  cleanup();
});
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

// UI EVENT HANDLERS
if (callButton) {
  callButton.addEventListener('click', () => initiateCall().catch(console.error));
}
if (hangupButton) {
  hangupButton.addEventListener('click', () => {
    cleanup();
    if (callButton) callButton.disabled = false;
    if (hangupButton) hangupButton.disabled = true;
  });
}

// FUNCTIONS
async function initiateCall() {
  if (peerConnection) {
    console.warn('⚠️ Call already in progress');
    return;
  }
  await startLocalMedia();
  await setupPeerConnection();
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  didIOffer = true;
  socket.emit('newOffer', offer);
  if (callButton) callButton.disabled = true;
  if (hangupButton) hangupButton.disabled = false;
}

export async function answerOffer(offerObj) {
  await startLocalMedia();
  await setupPeerConnection(offerObj);
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  offerObj.answer = peerConnection.localDescription;
  const savedIce = await socket.emitWithAck('newAnswer', offerObj);
  for (const c of savedIce) {
    await peerConnection.addIceCandidate(c);
  }
}

async function addAnswer(offerObj) {
  if (!peerConnection) {
    console.error('❌ No peerConnection to add answer.');
    return;
  }
  await peerConnection.setRemoteDescription(offerObj.answer);
}

async function startLocalMedia() {
  if (!localStream) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (localVideo) localVideo.srcObject = localStream;
    } catch (err) {
      console.error('Error accessing media devices:', err);
      throw err;
    }
  }
}

async function setupPeerConnection(offerObj = null) {
  const iceServers = await fetchIceConfig();
  peerConnection = new RTCPeerConnection({ iceServers });

  // Prepare remote stream
  remoteStream = new MediaStream();
  if (remoteVideo) remoteVideo.srcObject = remoteStream;

  // Send local tracks
  if (localStream) {
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  }

  // Relay ICE candidates
  peerConnection.addEventListener('icecandidate', ({ candidate }) => {
    if (candidate) {
      socket.emit('sendIceCandidateToSignalingServer', {
        iceCandidate: candidate,
        iceUserName: userName,
        didIOffer
      });
    }
  });

  // Handle incoming tracks
  peerConnection.addEventListener('track', ({ streams: [stream] }) => {
    stream.getTracks().forEach(track => remoteStream.addTrack(track));
  });

  // If answering an offer, set remote description
  if (offerObj && offerObj.offer) {
    await peerConnection.setRemoteDescription(offerObj.offer);
  }
}

export async function addNewIceCandidate(candidate) {
  if (peerConnection) {
    await peerConnection.addIceCandidate(candidate);
  } else {
    console.warn('⚠️ Received ICE candidate but no peerConnection exists yet');
  }
}

function cleanup() {
  if (peerConnection) {
    peerConnection.getSenders().forEach(sender => sender.track?.stop());
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
    if (localVideo) localVideo.srcObject = null;
  }
  if (remoteStream) {
    remoteStream.getTracks().forEach(t => t.stop());
    remoteStream = null;
    if (remoteVideo) remoteVideo.srcObject = null;
  }
  didIOffer = false;
}

export { addAnswer };

;(async () => {
  const { initSocketListeners } = await import('./socketListeners.js');
  initSocketListeners(socket, {
    answerOffer,
    addAnswer,
    addNewIceCandidate
  });
})();