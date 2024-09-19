import React, { useState } from 'react';
import { Meteor } from 'meteor/meteor';

const CreateRoom = () => {
  const [roomName, setRoomName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (roomName) {
      Meteor.call('rooms.create', parseInt(roomName), (error, result) => {
        if (error) {
          console.error('Error creating room:', error);
        } else {
          console.log('Room created with ID:', result);
          setRoomName(''); // Clear the input after successful creation
        }
      });
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={roomName}
        onChange={(e) => setRoomName(e.target.value)}
        placeholder="Enter room name"
      />
      <button type="submit">Create Room</button>
    </form>
  );
};

export default CreateRoom;