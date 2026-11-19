// Config plugin for the local Game Center module: turns on the Game Center
// entitlement and adds the friends-list usage string. Without that string,
// every Game Center friends call errors.
const { withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins');

const DEFAULT_FRIENDS_USAGE =
  "See where your Game Center friends place on Word Fury's leaderboards.";

module.exports = function withGameCenter(config, props = {}) {
  config = withEntitlementsPlist(config, (mod) => {
    mod.modResults['com.apple.developer.game-center'] = true;
    return mod;
  });
  config = withInfoPlist(config, (mod) => {
    mod.modResults.NSGKFriendListUsageDescription =
      props.friendsUsageDescription || DEFAULT_FRIENDS_USAGE;
    return mod;
  });
  return config;
};
