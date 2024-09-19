import React from 'react';
import { Meteor } from 'meteor/meteor';

class VideoRoom extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      localStream: null,
      remoteStreams: {},
      myFeed: null,
      isJoined: false
    };
    this.pcMap = new Map();
    this.localVideoRef = React.createRef();

    // Bind methods
    this.trickle = this.trickle.bind(this);
    this.doAnswer = this.doAnswer.bind(this);
    this.subscribeTo = this.subscribeTo.bind(this);
    this.doOffer = this.doOffer.bind(this);
    this.publish = this.publish.bind(this);
    this.join = this.join.bind(this);
  }

  componentDidMount() {
    // This is where you'd put any setup code that was in useEffect
  }

  componentWillUnmount() {
    if (this.state.localStream) {
      this.state.localStream.getTracks().forEach(track => track.stop());
    }
    this.pcMap.forEach(pc => pc.close());
    this.pcMap.clear();
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.localVideoRef.current && this.state.localStream && prevState.localStream !== this.state.localStream) {
      this.localVideoRef.current.srcObject = this.state.localStream;
    }
  }

  trickle({ feed, candidate, done }) {
    const trickleData = candidate ? { candidate } : {};
    trickleData.feed = feed;
    const trickleEvent = candidate ? 'rooms.trickle' : 'rooms.trickle-complete';
    Meteor.call(trickleEvent, { feed, candidate }, (error) => {
    });
  }

  async doOffer(feed, display) {
    let pc = this.pcMap.get(feed);
    if (!pc) {
      pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      pc.onicecandidate = event => {
        if (event.candidate) {
          this.trickle({ feed, candidate: event.candidate });
        }
      };

      pc.ontrack = event => {
        console.log('Got local track:', event.streams[0]);
        this.setState({ localStream: event.streams[0] });
      };

      this.pcMap.set(feed, pc);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        stream.getTracks().forEach(track => pc.addTrack(track, stream));
        this.setState({ localStream: stream });
        if (this.localVideoRef.current) {
          this.localVideoRef.current.srcObject = stream;
        }
      } catch (e) {
        console.error('Error accessing media devices:', e);
        return null;
      }
    }

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('set local sdp OK');
      return offer;
    } catch (e) {
      console.error('error while doing offer', e);
      return null;
    }
  }

  async doAnswer(feed, display, offer) {
    let pc = this.pcMap.get(feed);
    if (!pc) {
      pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      pc.onicecandidate = event => {
        if (event.candidate) {
          this.trickle({ feed, candidate: event.candidate });
        } 
      };

      pc.ontrack = event => {
        console.log('Got remote track:', event.streams[0]);
        this.setState(prevState => ({
          remoteStreams: {
            ...prevState.remoteStreams,
            [feed]: { stream: event.streams[0], display }
          }
        }));
      };

      this.pcMap.set(feed, pc);
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      Meteor.call('rooms.start', { feed, jsep: answer }, (error) => {
        if (error) {
          console.error('Error starting subscriber:', error);
        } else {
          console.log('Subscriber started successfully');
        }
      });

      return answer;
    } catch (error) {
      console.error('Error in doAnswer:', error);
      throw error;
    }
  }

  subscribeTo(publishers, room) {
    console.log('Subscribing to:', publishers);
    publishers.forEach(({ feed, display }) => {
      Meteor.call('rooms.subscribe', { feed, room }, async (error, result) => {
        if (error) {
          console.error('Error subscribing:', error);
        } else {
          console.log('Subscribed:', result);
          try {
            const answer = await this.doAnswer(feed, display, result.jsep);
            console.log('Answer created:', answer);
            Meteor.call('rooms.start', { feed, jsep: answer }, (startError) => {
              if (startError) {
                console.error('Error starting subscriber:', startError);
              } else {
                console.log('Subscriber started successfully');
              }
            });
          } catch (answerError) {
            console.error('Error creating answer:', answerError);
          }
        }
      });
    });
  }
  async publish(feed, display) {
    try {
      const offer = await this.doOffer(feed, display);
      if (offer) {
        Meteor.call('rooms.configure', { feed, jsep: offer, audio: true, video: true, data: true }, async (error, result)  => {
          if (error) {
            console.error('Error configuring:', error);
          } else {
            const pc = this.pcMap.get(result.feed);
            if (pc && result.jsep) {
              await pc.setRemoteDescription(result.jsep);
              console.log('configure remote sdp OK',result.jsep.type);
              if (result.jsep.type === 'offer') {
                  console.log("==========================================")
              }
            }
  
          }
        });
      }
    } catch (e) {
      console.error('Error publishing:', e);
    }
  }

  join() {
    const myRoom = this.props.room.room;
    const myName = `User_${Math.floor(10000 * Math.random())}`;
    console.log('Joining room:', myRoom, myName);
    console.log('Joining room:', myRoom, myName);
    Meteor.call('rooms.join', { room: myRoom, display: myName }, (error, result) => {
      if (error) {
        console.error('Error joining room:', error);
      } else {
        console.log('Joined room:', result);
        this.setState({ myFeed: result.feed, isJoined: true }, () => {
          this.publish(result.feed, myName);
          this.subscribeTo(result.publishers, result.room);
        });
      }
    });
  }

  render() {
    const { room } = this.props;
    const { isJoined, localStream, remoteStreams } = this.state;

    return (
      <div>
        <h2>Room: {room.room}</h2>
        {!isJoined ? (
          <button onClick={this.join}>Join Room</button>
        ) : (
          <>
            <div>
              <h3>Local Video</h3>
              <video ref={this.localVideoRef} autoPlay muted playsInline style={{ width: '320px', height: '240px' }} />
            </div>
            <div>
              <h3>Remote Videos</h3>
              {Object.entries(remoteStreams).map(([feed, { stream, display }]) => (
                <div key={feed}>
                  <p>{display} ({feed})</p>
                  <video
                    autoPlay
                    playsInline
                    style={{ width: '320px', height: '240px' }}
                    ref={el => { if (el) el.srcObject = stream; }}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }
}

export default VideoRoom;