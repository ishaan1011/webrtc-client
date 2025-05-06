/**
 * Production-ready client-side WebRTC + signaling logic with dynamic ICE acquisition.
 * Load via <script type="module" src="scripts.js"></script>
 * Enhanced with Zoom-like UI and controls
 */

// Generate a semi-unique username for this session
const userName = `User-${Math.floor(Math.random() * 100000)}`;
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

// UI elements - Video elements
const localVideo   = document.getElementById('local-video');
const remoteVideo  = document.getElementById('remote-video');

// UI elements - Control buttons
const callButton   = document.getElementById('call');
const hangupButton = document.getElementById('hangup');
const toggleAudioButton = document.getElementById('toggle-audio');
const toggleVideoButton = document.getElementById('toggle-video');
const shareScreenButton = document.getElementById('share-screen');
const chatButton = document.getElementById('chat');
const participantsButton = document.getElementById('participants');
const togglePipButton = document.getElementById('toggle-pip');

// UI elements - Sidebars
const chatSidebar = document.getElementById('chat-sidebar');
const participantsSidebar = document.getElementById('participants-sidebar');
const closeChatButton = document.getElementById('close-chat');
const closeParticipantsButton = document.getElementById('close-participants');
const chatInput = document.getElementById('chat-input');
const sendChatButton = document.getElementById('send-chat');
const chatMessages = document.getElementById('chat-messages');
const remoteParticipantName = document.getElementById('remote-participant-name');
const remoteUserNameElement = document.getElementById('remote-user-name');

// WebRTC state
let localStream    = null;
let remoteStream   = null;
let peerConnection = null;
let didIOffer      = false;
let isAudioMuted   = false;
let isVideoOff     = false;
let isScreenSharing = false;
let screenStream   = null;

// UI state
let activeRemoteUserName = 'Participant';

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
// Call and hangup buttons
if (callButton) {
  callButton.addEventListener('click', () => initiateCall().catch(console.error));
}
if (hangupButton) {
  hangupButton.addEventListener('click', () => {
    socket.emit('hangup');
    cleanup();
    if (callButton) callButton.disabled = false;
    if (hangupButton) hangupButton.disabled = true;
    
    // Reset UI
    resetUIState();
  });
}

// Audio controls
if (toggleAudioButton) {
  toggleAudioButton.addEventListener('click', () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        const enabled = !audioTracks[0].enabled;
        audioTracks[0].enabled = enabled;
        isAudioMuted = !enabled;
        
        // Update UI
        if (isAudioMuted) {
          toggleAudioButton.classList.add('muted');
          toggleAudioButton.querySelector('i').className = 'fa-solid fa-microphone-slash';
          toggleAudioButton.querySelector('.control-label').textContent = 'Unmute';
        } else {
          toggleAudioButton.classList.remove('muted');
          toggleAudioButton.querySelector('i').className = 'fa-solid fa-microphone';
          toggleAudioButton.querySelector('.control-label').textContent = 'Mute';
        }
      }
    }
  });
}

// Video controls
if (toggleVideoButton) {
  toggleVideoButton.addEventListener('click', () => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      if (videoTracks.length > 0) {
        const enabled = !videoTracks[0].enabled;
        videoTracks[0].enabled = enabled;
        isVideoOff = !enabled;
        
        // Update UI
        if (isVideoOff) {
          toggleVideoButton.classList.add('muted');
          toggleVideoButton.querySelector('i').className = 'fa-solid fa-video-slash';
          toggleVideoButton.querySelector('.control-label').textContent = 'Start Video';
        } else {
          toggleVideoButton.classList.remove('muted');
          toggleVideoButton.querySelector('i').className = 'fa-solid fa-video';
          toggleVideoButton.querySelector('.control-label').textContent = 'Stop Video';
        }
      }
    }
  });
}

// Screen sharing
if (shareScreenButton) {
  shareScreenButton.addEventListener('click', async () => {
    try {
      if (isScreenSharing) {
        // Stop screen sharing
        stopScreenSharing();
      } else {
        // Start screen sharing
        await startScreenSharing();
      }
    } catch (error) {
      console.error('Error sharing screen:', error);
    }
  });
}

// Chat sidebar toggle
if (chatButton) {
  chatButton.addEventListener('click', () => {
    if (chatSidebar) {
      // Close participants sidebar if open
      if (participantsSidebar) participantsSidebar.classList.remove('active');
      
      // Toggle chat sidebar
      chatSidebar.classList.toggle('active');
      
      // Focus on input if opening
      if (chatSidebar.classList.contains('active') && chatInput) {
        setTimeout(() => chatInput.focus(), 100);
      }
    }
  });
}

// Participants sidebar toggle
if (participantsButton) {
  participantsButton.addEventListener('click', () => {
    if (participantsSidebar) {
      // Close chat sidebar if open
      if (chatSidebar) chatSidebar.classList.remove('active');
      
      // Toggle participants sidebar
      participantsSidebar.classList.toggle('active');
    }
  });
}

// Close sidebar buttons
if (closeChatButton && chatSidebar) {
  closeChatButton.addEventListener('click', () => {
    chatSidebar.classList.remove('active');
  });
}

if (closeParticipantsButton && participantsSidebar) {
  closeParticipantsButton.addEventListener('click', () => {
    participantsSidebar.classList.remove('active');
  });
}

// Chat functionality
if (sendChatButton && chatInput && chatMessages) {
  // Send message on button click
  sendChatButton.addEventListener('click', () => {
    sendChatMessage();
  });
  
  // Send message on Enter key
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendChatMessage();
    }
  });
}

// Toggle PIP (Picture-in-Picture) mode for self view
if (togglePipButton) {
  togglePipButton.addEventListener('click', () => {
    const selfVideoWrapper = document.getElementById('self-video-wrapper');
    if (selfVideoWrapper) {
      selfVideoWrapper.classList.toggle('expanded');
      
      // Update the icon
      if (selfVideoWrapper.classList.contains('expanded')) {
        togglePipButton.innerHTML = '<i class="fa-solid fa-compress"></i>';
      } else {
        togglePipButton.innerHTML = '<i class="fa-solid fa-expand"></i>';
      }
    }
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
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }
  didIOffer = false;
  isScreenSharing = false;
  
  // Reset UI
  resetUIState();
}

/**
 * Reset UI state after a call ends
 */
function resetUIState() {
  // Reset UI elements for audio/video controls
  if (toggleAudioButton) {
    toggleAudioButton.classList.remove('muted');
    toggleAudioButton.querySelector('i').className = 'fa-solid fa-microphone';
    toggleAudioButton.querySelector('.control-label').textContent = 'Mute';
  }
  
  if (toggleVideoButton) {
    toggleVideoButton.classList.remove('muted');
    toggleVideoButton.querySelector('i').className = 'fa-solid fa-video';
    toggleVideoButton.querySelector('.control-label').textContent = 'Stop Video';
  }
  
  if (shareScreenButton) {
    shareScreenButton.querySelector('i').className = 'fa-solid fa-desktop';
    shareScreenButton.querySelector('.control-label').textContent = 'Share Screen';
  }
  
  // Close any open sidebars
  if (chatSidebar) chatSidebar.classList.remove('active');
  if (participantsSidebar) participantsSidebar.classList.remove('active');
  
  // Reset participant information
  if (remoteParticipantName) remoteParticipantName.textContent = 'Waiting for participants...';
  if (remoteUserNameElement) remoteUserNameElement.textContent = 'Waiting...';
  
  // Reset state variables
  isAudioMuted = false;
  isVideoOff = false;
  activeRemoteUserName = 'Participant';
}

/**
 * Send a chat message to the other participant
 */
function sendChatMessage() {
  if (!chatInput || !chatInput.value.trim() || !peerConnection) return;
  
  const messageText = chatInput.value.trim();
  const messageObj = {
    type: 'chat',
    sender: userName,
    text: messageText,
    timestamp: new Date().toISOString()
  };
  
  // Add message to local chat display
  addChatMessageToUI(messageObj, true);
  
  // Send message through data channel if available
  try {
    // In a real implementation, you'd use a data channel
    // This is a placeholder - in a production app, implement WebRTC data channels
    console.log('Would send message:', messageObj);
    
    // For this demo, we'll use signaling server as a proxy
    socket.emit('chat', messageObj);
  } catch (error) {
    console.error('Error sending chat message:', error);
  }
  
  // Clear input
  chatInput.value = '';
}

/**
 * Add a chat message to the UI
 */
function addChatMessageToUI(message, isFromMe = false) {
  if (!chatMessages) return;
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${isFromMe ? 'outgoing' : 'incoming'}`;
  
  const time = new Date(message.timestamp);
  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  messageDiv.innerHTML = `
    <div class="message-sender">${isFromMe ? 'You' : message.sender} <span class="message-time">${timeStr}</span></div>
    <div class="message-text">${message.text}</div>
  `;
  
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * Start screen sharing
 */
async function startScreenSharing() {
  try {
    // Get screen sharing stream
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    
    // Listen for the end of screen sharing
    screenStream.getVideoTracks()[0].addEventListener('ended', () => {
      stopScreenSharing();
    });
    
    // Save current video track to restore later
    const videoTrack = localStream.getVideoTracks()[0];
    
    // Replace video track with screen sharing track in peer connection
    if (peerConnection) {
      const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        sender.replaceTrack(screenStream.getVideoTracks()[0]);
      }
    }
    
    // Update UI
    isScreenSharing = true;
    if (shareScreenButton) {
      shareScreenButton.querySelector('i').className = 'fa-solid fa-stop';
      shareScreenButton.querySelector('.control-label').textContent = 'Stop Sharing';
    }
    
    // Show screen in self view
    if (localVideo) {
      localVideo.srcObject = screenStream;
    }
    
  } catch (error) {
    console.error('Error starting screen share:', error);
  }
}

/**
 * Stop screen sharing
 */
function stopScreenSharing() {
  if (!isScreenSharing || !peerConnection || !localStream) return;
  
  try {
    // Stop screen sharing stream
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
    }
    
    // Replace screen track with original video track in peer connection
    const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
    if (sender && localStream.getVideoTracks().length > 0) {
      sender.replaceTrack(localStream.getVideoTracks()[0]);
    }
    
    // Update UI
    isScreenSharing = false;
    if (shareScreenButton) {
      shareScreenButton.querySelector('i').className = 'fa-solid fa-desktop';
      shareScreenButton.querySelector('.control-label').textContent = 'Share Screen';
    }
    
    // Restore self view
    if (localVideo) {
      localVideo.srcObject = localStream;
    }
  } catch (error) {
    console.error('Error stopping screen share:', error);
  }
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