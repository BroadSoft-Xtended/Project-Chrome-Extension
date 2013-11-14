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
var subscriptions = {};
var storageUrl = localStorage["url"];
var storageUsername = localStorage["username"];
var storagePassword = localStorage["password"];
var MODULE = "background.js";
var retryAttempt = 0;
var xsiEvents;


function onMessage(request, sender, sendResponse) {
	var type = request.type;
	if (type == "CALL") {
		var destination = request.text.replace(/[- \(\)\.]/g, "");
		var status = "ok";
		try {
			LOGGER.API.log(MODULE, "calling: " + destination);
			XSIACTIONS.API.call(destination);
		} catch (error) {
			status = "error";
		}
		sendResponse({
			status : status
		});
	} else if (type == "IS_CLICK_TO_DIAL_ENABLED") {
		sendResponse({
			status : localStorage["clicktodial"]
		});
	}
}

function onChange(text, suggest) {
	if (text.length > 1) {
		var suggestions = [];
		var response = XSIACTIONS.API.searchEnterpriseDirectory(text);
		$(response).find("directoryDetails").each(
				function() {
					var name = $(this).find("firstName").text() + " "
							+ $(this).find("lastName").text();
					var number = $(this).find("number").text();
					var mobile = $(this).find("mobile").text();
					if (number != "") {
						suggestions.push({
							content : number,
							description : name + " (work: " + number + ")"
						});
					}
					if (mobile != "") {
						suggestions.push({
							content : mobile,
							description : name + " (mobile: " + mobile + ")"
						});
					}
				});

		var url = "https://www.google.com/m8/feeds/contacts/default/full?v=3.0&max-results=20&q=" + text;
		authenticatedXhr('GET', url, function(error, status, response) {
			if (error == null){
				$(response).find("entry").each(function() {
					var title = $(this).find("title").text();
					if (title == "") {
						title = "Unknown";
					}
					$(this).find("gd\\:phoneNumber").each(function() {
							var number = $(this).text();
							var type = $(this).attr("rel").replace("http://schemas.google.com/g/2005#","");
							suggestions.push({content : number,description : title+ " ("+ type + ": " + number + ")"});
							});
				});
			}
			else{
				LOGGER.API.error(MODULE, error);
			}
		});
		suggest(suggestions);
	}
}

function onEntered(text) {
	var normalized = text.replace("+", "");
	LOGGER.API.log(MODULE, normalized);
	try {
		XSIACTIONS.API.call(normalized);
	} catch (error) {
		LOGGER.API.error(MODULE, "onEntered error: " + error.message);
	}
}										
									

// list to local storage changes. Jquery allows multiple handlers.
$(window)
		.bind(
				"storage",
				function(e) {
					if (e.originalEvent.key == "connectionStatus") {
						if (e.originalEvent.newValue == "signedIn") {
							LOGGER.API.log(MODULE,
									"User credentials have been validated.");
						} else if (e.originalEvent.newValue == "connected") {
							LOGGER.API.log(MODULE,
									"User is connected with XSI Events API");
						} else if (e.originalEvent.newValue == "signedOut") {
							LOGGER.API
									.log(MODULE,
											"User has signed out. Terminating XSIEVENTS Framework");
							xsiEvents.terminate();
						} 
					}					
				});

function setServiceStatesToUnknown() {
	if (localStorage["dnd"] != "unassigned"){
		localStorage["dnd"] = "unknown";
	}
	if (localStorage["ro"] != "unassigned"){
		localStorage["ro"] = "unknown";
	}
	if (localStorage["cfa"] != "unassigned"){
		localStorage["cfa"] = "unknown";
	}
}


function connectXsiEvents() {
	// init the worker, hosts contains all the XSP hosts
	var creds = $.base64.encode(storageUsername + ":" + storagePassword);
	xsiEvents.postMessage({
		cmd : 'init',
		config : {
			hosts : [ storageUrl ],
			username: storageUsername,
			credentials: creds
		}
	});

	sendStartMessage();
}

function contentLoaded() {
	localStorage["restartRequired"] = "false";
	// restore Xsi-Actions
	var xsiactions_options = {
		host : localStorage["url"],
		username : localStorage["username"],
		password : localStorage["password"],
	};
	XSIACTIONS.API.init(xsiactions_options);
	
	chrome.omnibox.onInputChanged.addListener(onChange);
	chrome.omnibox.onInputEntered.addListener(onEntered);
	chrome.extension.onMessage.addListener(onMessage);

	chrome.notifications.onButtonClicked.addListener(function(notificationId,
			buttonIndex) {
		if (notificationId.indexOf("callhalf") == 0) {
			chrome.notifications.clear(notificationId, function() {
			});
			if (buttonIndex == 0) {
				XSIACTIONS.API.talk(notificationId);
			} else {
				XSIACTIONS.API.transferToVoicemail(notificationId);
			}
		}
	});
	
	// add suspend listener
	chrome.runtime.onSuspend.addListener(function() {
		xsiEvents.terminate();
	});

	// create xsi events worker
	xsiEvents = new Worker('xsi-events-api.js');
	xsiEvents
			.addEventListener(
					'message',
					function(e) {
						switch (e.data.type) {
						case 'disconnected':
							// try to re-connect if the disconnect was NOT
							// because of auth failure; so that we don't keep
							// trying to connect with bad credentials and
							// lock-out the user
							if (e.data.value != '401' && e.data.value != '403') {
								if (retryAttempt > 4) {
									retryAttempt = 0;
								}
								var wait = (Math.pow(2, retryAttempt) * 5000)
										+ Math.floor(Math.random() * 11) * 1000;
								console.log('waiting for ' + wait
										+ 's before re-connect');
								setTimeout(function() {
									retryAttempt++;
									sendStartMessage();
								}, wait);
							} else {
								console.log("*** DISCONNECTED DUE TO AUTHORIZATION FAILURE ***");
								console.log("*** Will not try to reconnect to protect from account lockout ***");
								localStorage["errorMessage"] = "An authentication error occurred. Please login again.";
								localStorage["connectionStatus"] = "signedOut";
							}
							setServiceStatesToUnknown();
							break;
						case 'DoNotDisturbEvent':
							localStorage["dnd"] = e.data.value;
							break;
						case 'CallForwardingAlwaysEvent':
							localStorage["cfa"] = e.data.value;
							break;
						case 'RemoteOfficeEvent':
							localStorage["ro"] = e.data.value;
							break;						
						case 'CallSubscriptionEvent':
							for (var callId in e.data.value){
								var call = e.data.value[callId];
								//TODO
							}
							break;
						case 'CallOriginatedEvent':
							for (var callId in e.data.value){
								//TODO
							}
							break;
						case 'CallReceivedEvent':
							for (var callId in e.data.value){
								var call = e.data.value[callId];						
								if (call.state == "Alerting"){
									if (localStorage["notifications"] == "true") {	
										var opts = {
										type : "basic",
										title : "Incoming Call",
										message : "Call from "+ call.name + " "+ call.number,
										iconUrl : "images/bsft_logo_128x128.png",
										buttons : [	{title : "Answer"},
													{title : "Decline"} ]
										};
									chrome.notifications.create(callId,opts,function() {});
									}
									if (localStorage["texttospeech"] == "true") {
											number = call.number.replace("+"+ call.countryCode + "-","").replace(/([0-9])/g,"$1 ");
											chrome.tts.speak("Call from "+ call.name+ " "+ number,{"lang" : "en-US"});
									}
								}
							}
							break;
						case 'CallAnsweredEvent':
							for (var callId in e.data.value){
								var call = e.data.value[callId];
								chrome.notifications.clear(callId, function() {});
							}
							break;							
						case 'CallReleasedEvent':
							for (var callId in e.data.value){
								var call = e.data.value[callId];
								chrome.notifications.clear(callId, function() {});
							}
							break;						
						case 'CallHeldEvent':
							for (var callId in e.data.value){
								var call = e.data.value[callId];
								//TODO
							}
							break;
						case 'CallRetrievedEvent':
							for (var callId in e.data.value){
								var call = e.data.value[callId];
								//TODO
							}
							break;						
						case 'CallUpdatedEvent':
							console.log(e.data.type, e.data.value);
							break;
						case 'log':
							console.log(e.data.value);
							break;
						}
					}, false);
					
	if (localStorage["connectionStatus"] == "signedIn"){
		connectXsiEvents();
	}

}

function sendStartMessage() {
	xsiEvents.postMessage({
		cmd : 'start'
	});
}


document.addEventListener('DOMContentLoaded', contentLoaded);