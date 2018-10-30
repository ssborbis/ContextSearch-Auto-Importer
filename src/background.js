window.browser = (function () {
  return window.msBrowser ||
    window.browser ||
    window.chrome;
})();

var userOptions = {};

function notify(message, sender, sendResponse) {

	switch(message.action) {
		case "nativeAppRequest":
			userOptions = message.userOptions || null;

			if (!userOptions) {
				console.log('no userOptions in message');
				return Promise.resolve(false);
				break;
			}

			let nativeApping = nativeApp( {force: message.force || false} ).then((result) => {
				return result;
			});
			
			return nativeApping;

			break;
	}
}

browser.runtime.onMessageExternal.addListener(notify);