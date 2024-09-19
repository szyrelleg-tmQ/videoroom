import React from 'react';
import { useTracker } from 'meteor/react-meteor-data';
import { Rooms } from '../api/rooms';
import VideoRoom from './VideoRoom';
import CreateRoom from './CreateRoom';

export const App = () => {
  const { rooms, isLoading } = useTracker(() => {
    const handle = Meteor.subscribe('rooms');
    return {
      rooms: Rooms.find().fetch(),
      isLoading: !handle.ready(),
    };
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Video Rooms</h1>
      <CreateRoom />
      {rooms.map(room => (
        <VideoRoom key={room._id} room={room} />
      ))}
    </div>
  );
};