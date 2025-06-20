import React, { useEffect, useRef, useContext, useState } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { AuthContext } from '../context/AuthContext.jsx';
import API from '../api/client.js';

export default function MeetingPage() {
  const { roomId } = useParams();
  const { user } = useContext(AuthContext);
  const localVideo = useRef();
  const remoteVideo = useRef();
  const [participants, setParticipants] = useState([]);

  useEffect(() => {
    // Initialize media & socket
    const socket = io(import.meta.env.VITE_API_URL, {
      auth: { token: localStorage.getItem('token') },
      query: { roomId }
    });

    socket.on('roomParticipants', setParticipants);

    // getUserMedia, add tracks to peer connections, etc.
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        localVideo.current.srcObject = stream;
        // TODO: set up WebRTC peer connections using socket signaling
      });

    return () => {
      socket.disconnect();
      // cleanup streams
    };
  }, [roomId]);

  return (
    <div className="container-fluid">
      <h3>Room: {roomId}</h3>
      <div className="row">
        <div className="col">
          <video ref={localVideo} autoPlay muted playsInline className="w-100 rounded" />
        </div>
        <div className="col">
          <video ref={remoteVideo} autoPlay playsInline className="w-100 rounded" />
        </div>
      </div>
      <h5 className="mt-3">Participants:</h5>
      <ul className="list-group">
        {participants.map(name => (
          <li key={name} className="list-group-item">{name}</li>
        ))}
      </ul>
    </div>
  );
}