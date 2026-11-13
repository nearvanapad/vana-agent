import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { guideFor } from "./install";

const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko)";

describe("which install steps to show", () => {
  const cases: [string, string, number, object][] = [
    ["iPhone Safari", `${IOS} Version/18.0 Mobile/15E148 Safari/604.1`, 5, { kind: "ios-safari" }],
    ["iPad Safari (asks for the desktop site)", `${MAC} Version/18.0 Safari/605.1.15`, 5, { kind: "ios-safari" }],
    ["Chrome on iPhone", `${IOS} CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1`, 5, { kind: "ios-browser", name: "Chrome" }],
    ["Edge on iPhone", `${IOS} EdgiOS/130.0.2849.80 Version/18.0 Mobile/15E148 Safari/604.1`, 5, { kind: "ios-browser", name: "Edge" }],
    ["Firefox on iPhone", `${IOS} FxiOS/132.0 Mobile/15E148 Safari/605.1.15`, 5, { kind: "ios-browser", name: "Firefox" }],
    ["an iOS app's web view (Telegram)", `${IOS} Mobile/15E148`, 5, { kind: "in-app", os: "ios" }],
    ["Instagram on iPhone", `${IOS} Mobile/15E148 Instagram 350.0.0.21.106 (iPhone15,2; iOS 18_0)`, 5, { kind: "in-app", os: "ios" }],
    ["MetaMask's browser on iPhone", `${IOS} Version/15.0 Mobile/15E148 Safari/604.1 WebView MetaMaskMobile`, 5, { kind: "in-app", os: "ios" }],
    ["Chrome on Android", `${ANDROID} Chrome/130.0.0.0 Mobile Safari/537.36`, 5, { kind: "android", browser: "chrome" }],
    ["an Android app's web view", "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36", 5, { kind: "in-app", os: "android" }],
    ["Samsung Internet", "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36", 5, { kind: "android", browser: "samsung" }],
    ["Firefox on Android", "Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0", 5, { kind: "android", browser: "firefox" }],
    ["Edge on Android", `${ANDROID} Chrome/130.0.0.0 Mobile Safari/537.36 EdgA/130.0.0.0`, 5, { kind: "android", browser: "edge" }],
    ["Safari on a Mac", `${MAC} Version/18.0 Safari/605.1.15`, 0, { kind: "mac-safari" }],
    ["Chrome on a Mac", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", 0, { kind: "desktop", browser: "chrome" }],
    ["Edge on Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0", 0, { kind: "desktop", browser: "edge" }],
    ["Firefox on a computer", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0", 0, { kind: "desktop-firefox" }],
  ];
  for (const [name, ua, touch, want] of cases) it(name, () => assert.deepEqual(guideFor(ua, touch), want));
});
