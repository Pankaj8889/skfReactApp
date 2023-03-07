// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { Platform, Dimensions } from 'react-native';
import { ConsoleLogger as Logger } from '../Logger';
var logger = new Logger('DeviceInfo');
export var clientInfo = function () {
    var dim = Dimensions.get('screen');
    logger.debug(Platform, dim);
    var OS = 'ios';
    var Version = Platform.Version;
    var _a = dimToMake(dim), make = _a.make, model = _a.model;
    return {
        platform: OS,
        version: String(Version),
        appVersion: [OS, String(Version)].join('/'),
        make: make,
        model: model,
    };
};
function dimToMake(dim) {
    var height = dim.height, width = dim.width;
    if (height < width) {
        var tmp = height;
        height = width;
        width = tmp;
    }
    if (width === 320 && height === 568) {
        return { make: 'iPhone', model: 'iPhone 5' };
    }
    if (width === 375 && height === 667) {
        return { make: 'iPhone', model: 'iPhone 6/7/8' };
    }
    if (width === 414 && height === 736) {
        return { make: 'iPhone', model: 'iPhone 6/7/8 plus' };
    }
    if (width === 375 && height === 812) {
        return { make: 'iPhone', model: 'iPhone X' };
    }
    if (width === 414 && height === 896) {
        return { make: 'iPhone', model: 'iPhone XR' };
    }
    if (width === 768 && height === 1024) {
        return { make: 'iPad', model: 'iPad Mini/Air' };
    }
    if (width === 834 && height === 1112) {
        return { make: 'iPad', model: 'iPad Pro' };
    }
    if (width === 1024 && height === 1366) {
        return { make: 'iPad', model: 'iPad Pro' };
    }
    if (width === 272 && height === 340) {
        return { make: 'Watch', model: 'Watch 38mm' };
    }
    if (width === 312 && height === 390) {
        return { make: 'Watch', model: 'Watch 42mm' };
    }
    return { make: null, model: null };
}
//# sourceMappingURL=ios.js.map