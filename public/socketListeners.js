// socketListeners.js
// Production-ready signaling initialiser for WebSocket events

/**
 * Initialise all socket event handlers.
 * @param {import('socket.io-client').Socket} socket - The connected socket instance
 * @param {object} handlers
 * @param {Function} handlers.answerOffer - Function to call when answering an offer
 * @param {Function} handlers.addAnswer - Function to call when receiving an answer
 * @param {Function} handlers.addNewIceCandidate - Function to call for ICE candidates
 */
export function initSocketListeners(
  socket,
  { answerOffer, addAnswer, addNewIceCandidate }
) {
  console.log('[🎬] initSocketListeners firing, socket.id=', socket.id);

  // Utility to render "Answer" buttons
  function createOfferEls(offers) {
    console.log('[📥] createOfferEls — offers:', offers);
    const container = document.getElementById('answer');
    if (!container) return;
    container.innerHTML = '';

    offers.forEach(offer => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-success m-1';
      btn.textContent = `Answer ${offer.offererUserName}`;
      btn.addEventListener('click', () => answerOffer(offer));
      container.appendChild(btn);
    });
  }

  // Log and handle connection lifecycle
  socket.on('connect', () => {
    console.log(`[📶] Connected to signaling server — id=${socket.id}`);
  });
  socket.on('disconnect', reason => {
    console.warn('[🚫] Disconnected from signaling server — reason:', reason);
  });

  // Handle available/pending offers
  socket.on('availableOffers', offers => {
    console.log('[📥] availableOffers — got', offers.length, 'offers', offers);
    createOfferEls(offers);
  });
  socket.on('newOfferAwaiting', offers => {
    console.log('[📥] newOfferAwaiting — got', offers.length, 'offers', offers);
    createOfferEls(offers);
  });

  // Handle answer exchange
  socket.on('answerResponse', offerObj => {
    console.log('[📤] answerResponse — offerObj.offererUserName=', offerObj.offererUserName, offerObj);
    addAnswer(offerObj);
  });

  // Handle ICE candidates from server
  socket.on('receivedIceCandidateFromServer', candidate => {
    console.log('[🌐] receivedIceCandidateFromServer — candidate:', candidate);
    addNewIceCandidate(candidate);
  });

  socket.on('hangup', () => {
    console.log('[🔴] hangup event received');
    console.log('🔴 Remote peer hung up');
    cleanup();
    // Re-enable the Call button in case it was disabled
    const callBtn = document.getElementById('call');
    const hangupBtn = document.getElementById('hangup');
    if (callBtn) callBtn.disabled = false;
    if (hangupBtn) hangupBtn.disabled = true;
  });
  
}