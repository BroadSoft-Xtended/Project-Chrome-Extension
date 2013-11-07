/* 
Copyright 2013, BroadSoft, Inc.

Licensed under the Apache License,Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
 
Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "ASIS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
 */


function authenticatedXhr(method, url, callback) {
	var retry = true;
	function getTokenAndXhr() {
		chrome.identity.getAuthToken({
			'interactive' : true
		}, function(access_token) {
			if (chrome.runtime.lastError) {
				callback(chrome.runtime.lastError);
				return;
			}

			var xhr = new XMLHttpRequest();
			xhr.open(method, url);
			xhr.setRequestHeader('Authorization', 'Bearer ' + access_token);

			xhr.onload = function() {
				if (this.status === 401 && retry) {
					// This status may indicate that the cached
					// access token was invalid. Retry once with
					// a fresh token.
					retry = false;
					chrome.identity.removeCachedAuthToken({
						'token' : access_token
					}, getTokenAndXhr);
					return;
				}
				console.log(this);
				callback(null, this.status, this.responseText);
			};

			xhr.send();
		});
	}
	getTokenAndXhr();
}
