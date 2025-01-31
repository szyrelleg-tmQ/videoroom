import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';

export const Rooms = new Mongo.Collection('rooms');

if (Meteor.isServer) {
  Meteor.publish('rooms', function() {
    return Rooms.find();
  });
}