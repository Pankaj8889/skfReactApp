import { Reachability } from '@aws-amplify/core';
import { default as NetInfo } from '@react-native-community/netinfo';
export var ReachabilityMonitor = function () {
    return new Reachability().networkMonitor(NetInfo);
};
//# sourceMappingURL=index.native.js.map