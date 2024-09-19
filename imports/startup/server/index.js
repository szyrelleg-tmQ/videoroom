import { Meteor } from 'meteor/meteor';
import Janode from 'janode'; 
import VideoRoomPlugin  from '../../../node_modules/janode/src/plugins/videoroom-plugin';
import { check, Match } from 'meteor/check';
import { Rooms } from '../../api/rooms';
const config = {
  janode: {
    is_admin: false,
    address: {
      url: 'ws://127.0.0.1:8188/',
    }
  }
};

const handler = {}
let janodeSession;
let janodeManagerHandle;

async function initBackEnd() {
    console.log('Connecting Janode...');
    let connection;
  
    try {
      connection = await Janode.connect(config.janode);
      console.log('Connection with Janus created');
  
      connection.once(Janode.EVENT.CONNECTION_CLOSED, () => {
        console.log('Connection with Janus closed');
      });
  
      connection.once(Janode.EVENT.CONNECTION_ERROR, error => {
        console.error('Connection with Janus error:', error.message);
        Meteor.setTimeout(initBackEnd, config.janode.retry_time_secs * 1000);
      });
  
      const session = await connection.create();
      if (!session) {
        throw new Error('Failed to create Janus session');
      }
      console.log(`Session ${session.id} with Janus created`);
      janodeSession = session;
  
      session.once(Janode.EVENT.SESSION_DESTROYED, () => {
        console.log(`Session ${session.id} destroyed`);
        janodeSession = null;
      });
  
      console.log('Attaching VideoRoomPlugin...');
      if (!VideoRoomPlugin) {
        throw new Error('VideoRoomPlugin is not defined');
      }
  
      const handle = await session.attach(VideoRoomPlugin);
      if (!handle) {
        throw new Error('Failed to attach VideoRoomPlugin');
      }
      console.log(`Manager handle ${handle.id} attached`);
      janodeManagerHandle = handle;
  
      handle.once(Janode.EVENT.HANDLE_DETACHED, () => {
        console.log(`${handle.name} manager handle detached event`);
      });
  
      console.log('Janode setup completed successfully');
    }
    catch (error) {
      console.error('Janode setup error:', error.message);
      if (error.stack) {
        console.error('Error stack:', error.stack);
      }
      if (connection) {
        try {
          await connection.close();
        } catch (closeError) {
          console.error('Error closing connection:', closeError.message);
        }
      }
      Meteor.setTimeout(initBackEnd, config.janode.retry_time_secs * 1000);
    }
  }

Meteor.startup(() => {
  initBackEnd().catch(error => {
    console.error('Error during server startup:', error);
  });
});


Meteor.methods({

      async 'rooms.create'(roomId) {
        check(roomId, Number);
        const newRoom = { 
          room: roomId,
          permanent: false,
          description: "My Test Room",
          is_private: false
        }
        const handler = await janodeSession.attach(VideoRoomPlugin);
        const response = await handler.create(newRoom);
        console.log(response);
        return Rooms.insert(newRoom);
      },

      async 'rooms.join'({ room, display }) {
        check(room, Number);
        check(display, String);

        console.log(`Joining room ${room} with display name ${display}`);

        try {
          const pubHandler = await janodeSession.attach(VideoRoomPlugin);

          pubHandler.on(VideoRoomPlugin.EVENT.VIDEOROOM_DESTROYED, evtdata => {
            console.log(`${pubHandler.name} destroyed event ${JSON.stringify(evtdata)}`);
          });
  
          pubHandler.on(VideoRoomPlugin.EVENT.VIDEOROOM_PUB_LIST, evtdata => {
            console.log(`${pubHandler.name} pub list event ${JSON.stringify(evtdata)}`);
          });
  
          pubHandler.on(VideoRoomPlugin.EVENT.VIDEOROOM_PUB_PEER_JOINED, evtdata => {
            console.log(`${pubHandler.name} peer joined event ${JSON.stringify(evtdata)}`);
          });
  
          pubHandler.on(VideoRoomPlugin.EVENT.VIDEOROOM_UNPUBLISHED, async evtdata => {
            console.log(`${pubHandler.name} unpublished event ${JSON.stringify(evtdata)}`);
          });
  
          pubHandler.on(VideoRoomPlugin.EVENT.VIDEOROOM_LEAVING, async evtdata => {
            console.log(`${pubHandler.name} leaving event ${JSON.stringify(evtdata)}`);
          });
  
          pubHandler.on(VideoRoomPlugin.EVENT.VIDEOROOM_DISPLAY, evtdata => {
            console.log(`${pubHandler.name} display event ---------------------------------------------------------------- ${JSON.stringify(evtdata)}`);
          });
  
          pubHandler.on(VideoRoomPlugin.EVENT.VIDEOROOM_TALKING, evtdata => {
              console.log(`${pubHandler.name} talking event ${JSON.stringify(evtdata)}`);
          });
  
          pubHandler.on(VideoRoomPlugin.EVENT.VIDEOROOM_KICKED, async evtdata => {
              console.log(`${pubHandler.name} kicked event ${JSON.stringify(evtdata)}`);
          });
  
          // generic videoroom events
          pubHandler.on(Janode.EVENT.HANDLE_WEBRTCUP, () => console.log(`${pubHandler.name} webrtcup event`));
          pubHandler.on(Janode.EVENT.HANDLE_MEDIA, evtdata => console.log(`${pubHandler.name} media event ${JSON.stringify(evtdata)}`));
          pubHandler.on(Janode.EVENT.HANDLE_SLOWLINK, evtdata => console.log(`${pubHandler.name} slowlink event ${JSON.stringify(evtdata)}`));
          pubHandler.on(Janode.EVENT.HANDLE_HANGUP, evtdata => console.log(`${pubHandler.name} hangup event ${JSON.stringify(evtdata)}`));
          pubHandler.on(Janode.EVENT.HANDLE_DETACHED, () => {
              console.log(`${pubHandler.name} handle detached event`);
          });
          pubHandler.on(Janode.EVENT.HANDLE_TRICKLE, evtdata => console.log(`${pubHandle.name} trickle event ${JSON.stringify(evtdata)}`));

          const response = await pubHandler.joinPublisher({ room, display });
          handler[response.feed] = pubHandler;

          return {
            room,
            feed: response.feed,
            display: response.display,
            publishers: response.publishers || []
          };
        } catch (error) {
          console.error('Error joining room:', error);
          throw new Meteor.Error('join-failed', 'Failed to join room', error);
        }
      },
  
      async 'rooms.configure'({ feed, jsep, audio, video, data }) {
        console.log(jsep.type)
        if (handler[feed].feed != feed) {
          throw new Meteor.Error('handle-not-found', 'Handle not found for this feed');
        }
    
        try {
          const response = await handler[feed].configure({ jsep, audio, video, data });
          console.log('Configuration result:', response);
          delete response.configured;

          return response;
        } catch (error) {
          console.error('Error configuring room:', error); // Add error logging
          throw new Meteor.Error('configuration-failed', 'Failed to configure room', error);
        }
      },

      async 'rooms.subscribe'({ feed, room }) {
        const subHandle = await janodeSession.attach(VideoRoomPlugin);
        handler[feed] = subHandle;
        const response = await subHandle.joinListener({ room, feed });
        return {
          feed: response.id,
          display: response.display,
          jsep: response.jsep
        };
      },
      
      async 'rooms.start'({ feed, jsep }) {
        check(jsep, Object);
        if (!handler[feed]) {
          throw new Meteor.Error('handle-not-found', `Handle not found for feed: ${feed}`);
        }
      
        try {
          const result = await handler[feed].start({ jsep });
          console.log('Start result:', result);
          return { success: true };
        } catch (error) {
          console.error('Error in rooms.start:', error);
          throw new Meteor.Error('start-failed', error.message);
        }
      },
    
      async 'rooms.trickle'({ feed, candidate }) {
        check(candidate, Match.Maybe(Object));
        if (handler[feed] != feed) {
          throw new Meteor.Error('handle-not-found', `Handle not found for feed: ${feed}`);
        }
          await handler[feed].trickle(candidate);
      },

      async 'rooms.trickle-complete'({ candidate }) {
        check(feed, String);
        if (handler[response.feed] != feed) {
          throw new Meteor.Error('handle-not-found', `Handle not found for feed: ${feed}`);
        }
        const handle = handler[response.feed].trickleComplete.getHandle(feed);
        await handle.trickleComplete(candidate);
      },























      async 'rooms.leave'({ feed }) {
        check(feed, String);
        const handle = janodeSession.getHandle(feed);
        if (handle) {
          await handle.leave();
          await handle.detach();
        }
      },
  
      async 'rooms.pause'({ feed }) {
        check(feed, String);
        const handle = janodeSession.getHandle(feed);
        await handle.pause();
      },
  
      async 'rooms.switch'({ from_feed, to_feed, audio, video, data }) {
        check(from_feed, String);
        check(to_feed, String);
        check(audio, Boolean);
        check(video, Boolean);
        check(data, Boolean);
        const handle = janodeSession.getHandle(from_feed);
        await handle.switch({ to_feed, audio, video, data });
      },
  
      async 'rooms.listParticipants'({ room }) {
        check(room, String);
        const response = await janodeManagerHandle.listParticipants({ room });
        return {
          room,
          participants: response.participants || []
        };
      },
  
      async 'rooms.kick'({ room, feed, secret }) {
        check(room, String);
        check(feed, String);
        check(secret, String);
        await janodeManagerHandle.kick({ room, feed, secret });
      },
  
  
      async 'rooms.listRooms'() {
        const response = await janodeManagerHandle.list();
        return response.list || [];
      },
  
      async 'rooms.destroy'({ room, permanent, secret }) {
        check(room, String);
        check(permanent, Boolean);
        check(secret, String);
        await janodeManagerHandle.destroy({ room, permanent, secret });
      },
});