import * as mediasoupClient from 'https://cdn.skypack.dev/mediasoup-client';
import { io } from 'https://cdn.skypack.dev/socket.io-client';

const socket = io('https://comm360-sfu.fly.dev');

let device;
let sendTransport;
let recvTransport;
let localStream;
let remoteStreams = [];
let consumers = [];

const localVideo = document.getElementById('local-video');
const remoteContainer = document.getElementById('remote-container');

async function start() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;

  await loadDevice();
  await createSendTransport();

  for (const track of localStream.getTracks()) {
    await produce(track);
  }

  await createRecvTransport();
  await consume();
}

async function loadDevice() {
  const rtpCapabilities = await new Promise(resolve => {
    socket.emit('getRtpCapabilities', null, resolve);
  });

  device = new mediasoupClient.Device();
  await device.load({ routerRtpCapabilities: rtpCapabilities });
}

async function createSendTransport() {
  const params = await new Promise(resolve => {
    socket.emit('createWebRtcTransport', null, resolve);
  });

  sendTransport = device.createSendTransport(params);

  sendTransport.on('connect', ({ dtlsParameters }, callback) => {
    socket.emit('connectTransport', { dtlsParameters });
    callback();
  });

  sendTransport.on('produce', ({ kind, rtpParameters }, callback) => {
    socket.emit('produce', { kind, rtpParameters }, ({ id }) => {
      callback({ id });
    });
  });
}

async function produce(track) {
  await sendTransport.produce({ track });
}

async function createRecvTransport() {
  const params = await new Promise(resolve => {
    socket.emit('createWebRtcTransport', null, resolve);
  });

  recvTransport = device.createRecvTransport(params);

  recvTransport.on('connect', ({ dtlsParameters }, callback) => {
    socket.emit('connectTransport', { dtlsParameters });
    callback();
  });
}

async function consume() {
  const { rtpCapabilities } = device;
  const data = await new Promise(resolve => {
    socket.emit('consume', { rtpCapabilities }, resolve);
  });

  if (data.error) {
    console.warn('No remote producer yet');
    return;
  }

  const consumer = await recvTransport.consume({
    id: data.id,
    producerId: data.producerId,
    kind: data.kind,
    rtpParameters: data.rtpParameters
  });

  const remoteStream = new MediaStream([consumer.track]);
  const remoteVideo = document.createElement('video');
  remoteVideo.srcObject = remoteStream;
  remoteVideo.autoplay = true;
  remoteVideo.playsInline = true;
  remoteContainer.appendChild(remoteVideo);

  consumers.push(consumer);
}

// Expose start to the DOM
window.start = start;

// Automatically wire the Join button to start the SFU call
document.getElementById('join-room').addEventListener('click', () => {
    start();
  
    // Switch UI to meeting view
    document.getElementById('landing-container').classList.add('d-none');
    document.getElementById('meeting-container').classList.remove('d-none');
  
    // Set display name in the UI
    const displayName = document.getElementById('display-name-input').value;
    document.getElementById('user-name').textContent = displayName;
});
  