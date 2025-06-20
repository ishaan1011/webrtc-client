import React, { useContext, useEffect, useState } from 'react';
import API from '../api/client.js';
import { SocketContext } from '../context/SocketContext.jsx';
import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const socket = useContext(SocketContext);
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [newRoomName, setNewRoomName] = useState('');

  // Fetch active rooms
  useEffect(() => {
    API.get('/rooms')
      .then(res => setRooms(res.data.rooms))
      .catch(console.error);
  }, []);

  const createRoom = async () => {
    // your backend may return a roomId
    const roomId = Date.now().toString();
    navigate(`/meeting/${roomId}`);
  };

  const joinRoom = id => {
    navigate(`/meeting/${id}`);
  };

  return (
    <div className="container py-5">
      <h1>Comm360</h1>
      <button className="btn btn-primary me-2" onClick={createRoom}>
        New Meeting
      </button>
      <input
        className="form-control d-inline-block w-auto me-2"
        placeholder="Room ID"
        value={newRoomName}
        onChange={e => setNewRoomName(e.target.value)}
      />
      <button className="btn btn-success" onClick={() => joinRoom(newRoomName)}>
        Join
      </button>

      <h2 className="mt-5">Active Rooms</h2>
      <ul className="list-group">
        {rooms.map(r => (
          <li key={r.roomId} className="list-group-item d-flex justify-content-between align-items-center">
            {r.roomId}
            <button className="btn btn-sm btn-outline-primary" onClick={() => joinRoom(r.roomId)}>
              Join
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}