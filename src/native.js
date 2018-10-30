function nativeApp(options) {
	
	browser.runtime.sendNativeMessage("ContextSearch",'{"request": "%version%"}').then((response) => {
		console.log(response);
	});

	options = options || {
		force: false
	}
	
	if (options.force === undefined) options.force = false;

	function readMozlz4Base64String(str)
	{

		let input = Uint8Array.from(atob(str), c => c.charCodeAt(0));
		let output;
		let uncompressedSize = input.length*3;  // size estimate for uncompressed data!

		// Decode whole file.
		do {
			output = new Uint8Array(uncompressedSize);
			uncompressedSize = decodeLz4Block(input, output, 8+4);  // skip 8 byte magic number + 4 byte data size field
			// if there's more data than our output estimate, create a bigger output array and retry (at most one retry)
		} while (uncompressedSize > output.length);

		output = output.slice(0, uncompressedSize); // remove excess bytes

		let decodedText = new TextDecoder().decode(output);
		
		return JSON.parse(decodedText);
	}
	
	function onResponse(response) {
		
		console.log('native app: Received file mod time');
		
		if (response.error) {
			console.error(response.error);
			return response;
		}

		return browser.storage.local.get("searchObject_last_mod").then((result) => {
			if (result.searchObject_last_mod === undefined) {
				result.searchObject_last_mod = Date.now();
				console.log("native app: No searchObject_last_mod in localStorage. Creating...");
			}
			
			if (
				result.searchObject_last_mod === response.last_mod 
				&& options.force === false
			) {
				console.log("native app: mod date unchanged");
				return false;
			}

//			browser.browserAction.setIcon({path: "icons/spinner.svg"});
			
			return browser.runtime.sendNativeMessage("ContextSearch",'{"path": "' + userOptions.searchJsonPath + '"}').then((response) => {
				
				console.log('native app: Request file');
				
				if (response.error) {
					console.error(response.error);
					return response;
				}
				
				if (!response.base64) {
					console.error("native app: Bad message. No base64 data");
					response.error = "No base64 data";
					return response;
				}

				console.log('native app: Received file');

				let searchObject = readMozlz4Base64String(response.base64);

				browser.storage.local.set({'searchObject_last_mod': response.last_mod});
			
				let searchEngines = searchJsonObjectToArray(searchObject.engines);
			
				// only add engines without existing titles
				let newEngines = [];
				searchEngines.forEach( (se) => {
					if ( !userOptions.searchEngines.find( _se => _se.title === se.title) ) {
						newEngines.push(se);
					}
				});
				
				if ( newEngines.length === 0 ) {
					console.log("no new engines to import");
					return Promise.resolve(false);
				}

				return loadRemoteIcon({
					searchEngines: newEngines, // 1.3.2+
				}).then( (details) => {
					return hideSearchEngines(details.searchEngines).then((_result) => {					
						if (_result) searchEngines = userOptions.searchEngines.concat(_result);
						console.log("New Search Engines ->");
						console.log(_result);
						userOptions.searchEngines = searchEngines;

						return userOptions;
					});
				});

			});

		});

	}

	function onError(error) {
		console.log(`Error: ${error}`);
		return Promise.resolve({error: error});
	}
	
	if (!userOptions.searchJsonPath) {
		console.log('native app: userOptions.searchJsonPath empty');
		return Promise.resolve({error: "empty path"});
	}
	
	// throttler
	// if (window.nativeAppActive && !options.force) {

		// if (!window.nativeAppQueue) {	
			// window.nativeAppQueue = true;

			// console.log('native app: throttled');
			// return new Promise((resolve, reject) => {
				// setTimeout(() => {
					// if (!window.nativeAppActive) {
						// resolve(nativeApp(options).then((result) => {
							// console.log('native app: unthrottled');
							// window.nativeAppActive = false;
							// window.nativeAppQueue = false;
							// return result;
						// }));
					// }
				// }, 5000);
			// });
		// } else {
			// return Promise.resolve(false);
		// }
	// }
	
	return new Promise( (resolve, reject) => {
		let _interval = setInterval(() => {
			if (window.nativeAppActive) return;
			
			// set active for throttling
			window.nativeAppActive = true;
			
			var sending = browser.runtime.sendNativeMessage("ContextSearch",'{"!@!@": "' + userOptions.searchJsonPath + '"}');
			resolve(sending.then(onResponse, onError).then((result) => {
				window.nativeAppActive = false;
				clearInterval(_interval);
				return result;
			}));
		}, 100);
	});

}

function readHiddenEngines() {
	return browser.runtime.sendNativeMessage("ContextSearch",'{"path": "' + userOptions.searchJsonPath.replace("search.json.mozlz4", "prefs.js") + '"}').then((response) => {
				
		console.log('native app: Request file prefs.js');
		
		if (response.error) {
			console.error(response.error);
			return "";
		}
		
		if (!response.base64) {
			console.error("native app: Bad message. No base64 data");
			return "";
		}

		console.log('native app: Received file prefs.js');
		
		function u_atob(ascii) {
			return Uint8Array.from(atob(ascii), c => c.charCodeAt(0));
		}

		let prefs = new TextDecoder().decode(u_atob(response.base64));
		
		for (let line of prefs.split('\n')) {
			if (line.match(/^user_pref\("browser.search.hiddenOneOffs/)) {
	
				let regstr =/user_pref\("browser.search.hiddenOneOffs",\s*"(.*?)"\);/g;
				var match = regstr.exec(line);
				if (!match) continue;
				
				return match[1];
			}
		}
		
		return "";

	});
}

function hideSearchEngines(searchEngines) {

	return readHiddenEngines().then((result) => {
		if (!result || typeof result !== 'string') return searchEngines;
		let names = result.split(",");

		for (let i=searchEngines.length -1;i>-1;i--) {
			
			if (names.includes(searchEngines[i].title)) {
				searchEngines[i].hidden = true;
			}
		}
		
		return searchEngines;
	});
}



