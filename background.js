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
var url = localStorage["url"];
var username = localStorage["username"];
var password = localStorage["password"];
var MODULE = "background.js";

var xsievents_options = {
	host : url,
	username : username,
	password : password,
	channelSetId : "broadworks4chromechannelset",
	applicationId : "broadworks4chrome",
	onChannelAdded : function(data) {
		LOGGER.API.log(MODULE, "channel added");
		// reset retryAttempt now that the channel is up
		retryAttempt = 0;
		// set the local storage state to unknown, we will set them to
		// appropriate values once the initial events arrive
		setServiceStatesToUnknown();
		XSIEVENTS.API.addEventSubscription(username, "Standard Call");
		if (localStorage["dnd"] != "unassigned"){
			XSIEVENTS.API.addEventSubscription(username, "Do Not Disturb");
		}
		if (localStorage["ro"] != "unassigned"){
			XSIEVENTS.API.addEventSubscription(username, "Remote Office");
		}
		if (localStorage["cfa"] != "unassigned"){
			XSIEVENTS.API.addEventSubscription(username, "Call Forwarding Always");
		}
	},
	onEvent : onEvent,
	onSubscriptionTerminated : function(data) {
		LOGGER.API.log(MODULE, "subscription terminated");
		var eventId = $(data).find("xsi\\:eventID").text();
		XSIEVENTS.API.sendEventResponse(eventId);
		var subscriptionId = $(data).find("xsi\\:subscriptionId").text();
		if (subscriptions[subscriptionId] == "dnd") {
			localStorage["dnd"] = "unknown";
			XSIEVENTS.API.addEventSubscription(username, "Do Not Disturb");
		} else if (subscriptions[subscriptionId] == "cfa") {
			localStorage["cfa"] = "unknown";
			XSIEVENTS.API.addEventSubscription(username,
					"Call Forwarding Always");
		} else if (subscriptions[subscriptionId] == "ro") {
			localStorage["ro"] = "unknown";
			XSIEVENTS.API.addEventSubscription(username, "Remote Office");
		} else if (subscriptions[subscriptionId] == "call") {
			localStorage["callId"] = "unknown";
			localStorage["callHold"] = "unknown";
			XSIEVENTS.API.addEventSubscription(username, "Standard Call");
		}
	},
	onChannelTerminated : function(data) {
		LOGGER.API.log(MODULE, "channel terminated");
		setServiceStatesToUnknown();
	},
	onError : onError,
	onDisconnected : onDisconnected
};

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

		var url = "https://www.google.com/m8/feeds/contacts/default/full";
		var params = {
			"parameters" : {
				"v" : "3.0",
				"q" : text,
				"max-results" : 50
			}
		};
		oauth
				.sendSignedRequest(
						url,
						function(text, xhr) {
							$(text)
									.find("entry")
									.each(
											function() {
												var title = $(this).find(
														"title").text();
												if (title == "") {
													title = "Unknown";
												}
												$(this)
														.find(
																"gd\\:phoneNumber")
														.each(
																function() {
																	var number = $(
																			this)
																			.text();
																	var type = $(
																			this)
																			.attr(
																					"rel")
																			.replace(
																					"http://schemas.google.com/g/2005#",
																					"");
																	suggestions
																			.push({
																				content : number,
																				description : title
																						+ " ("
																						+ type
																						+ ": "
																						+ number
																						+ ")"
																			});
																});
											});
							suggest(suggestions);
						}, params);
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

function onEvent(event) {
	var eventId = $(event).find("xsi\\:eventID").text();
	XSIEVENTS.API.sendEventResponse(eventId);
	$(event)
			.find("xsi\\:eventData")
			.each(
					function() {
						$
								.each(
										this.attributes,
										function(i, attrib) {
											if (attrib.name == "xsi1:type"
													&& attrib.value == "xsi:CallReceivedEvent") {
												if (localStorage["notifications"] == "true") {
													if ($(event).find(
															"xsi\\:state")
															.text() == "Alerting") {
														var callId = $(event)
																.find(
																		"xsi\\:callId")
																.text();
														var name = $(event)
																.find(
																		"xsi\\:name")
																.text();
														var countryCode = $(
																event)
																.find(
																		"xsi\\:address")
																.attr(
																		"countryCode");
														var address = $(event)
																.find(
																		"xsi\\:address")
																.text();
														address = address
																.replace(
																		"tel:",
																		"")
																.replace(
																		"+"
																				+ countryCode,
																		"+"
																				+ countryCode
																				+ "-");
														var opts = {
															type : "basic",
															title : "Incoming Call",
															message : "Call from "
																	+ name
																	+ " "
																	+ address,
															iconUrl : "images/bsft_logo_128x128.png",
															buttons : [
																	{
																		title : "Answer"
																	},
																	{
																		title : "Decline"
																	} ]
														};
														chrome.notifications
																.create(
																		callId,
																		opts,
																		function() {
																		});
														if (localStorage["texttospeech"] == "true") {
															address = address
																	.replace(
																			"+"
																					+ countryCode
																					+ "-",
																			"")
																	.replace(
																			/([0-9])/g,
																			"$1 ");
															chrome.tts
																	.speak(
																			"Call from "
																					+ name
																					+ " "
																					+ address,
																			{
																				"lang" : "en-US"
																			});
														}
													}
												}
											} else if (attrib.name == "xsi1:type"
													&& attrib.value == "xsi:DoNotDisturbEvent") {
												localStorage["dnd"] = $(event)
														.find("xsi\\:active")
														.text();
												var subscriptionId = $(event)
														.find(
																"xsi\\:subscriptionId")
														.text();
												subscriptions[subscriptionId] = "dnd";
											} else if (attrib.name == "xsi1:type"
													&& attrib.value == "xsi:CallSubscriptionEvent") {
												var callId = $(event).find(
														"xsi\\:callId").text();
												if (callId) {
													localStorage["callId"] = callId;
													var state = $(event).find(
															"xsi\\:state")
															.text();
													localStorage["callHold"] = state == "Held" ? "true"
															: "false";
												} else {
													localStorage["callId"] = "";
												}
												var subscriptionId = $(event)
														.find(
																"xsi\\:subscriptionId")
														.text();
												subscriptions[subscriptionId] = "call";
											} else if (attrib.name == "xsi1:type"
													&& attrib.value == "xsi:CallForwardingAlwaysEvent") {
												localStorage["cfa"] = $(event)
														.find("xsi\\:active")
														.text();
												var subscriptionId = $(event)
														.find(
																"xsi\\:subscriptionId")
														.text();
												subscriptions[subscriptionId] = "cfa";
											} else if (attrib.name == "xsi1:type"
													&& attrib.value == "xsi:RemoteOfficeEvent") {
												localStorage["ro"] = $(event)
														.find("xsi\\:active")
														.text();
												var subscriptionId = $(event)
														.find(
																"xsi\\:subscriptionId")
														.text();
												subscriptions[subscriptionId] = "ro";
											} else if (attrib.name == "xsi1:type"
													&& attrib.value == "xsi:CallReleasedEvent") {
												var callId = $(event).find(
														"xsi\\:callId").text();
												chrome.notifications.clear(
														callId, function() {
														});
												localStorage["callId"] = "";
											} else if (attrib.name == "xsi1:type"
													&& attrib.value == "xsi:CallAnsweredEvent") {
												var callId = $(event).find(
														"xsi\\:callId").text();
												chrome.notifications.clear(
														callId, function() {
														});
												// localStorage["callId"] =
												// callId;
											} else if (attrib.name == "xsi1:type"
													&& attrib.value == "xsi:CallHeldEvent") {
												localStorage["callHold"] = "true";
											} else if (attrib.name == "xsi1:type"
													&& attrib.value == "xsi:CallRetrievedEvent") {
												localStorage["callHold"] = "false";
											}
										});
					});
}

var oauth = ChromeExOAuth.initBackgroundPage({
	'request_url' : 'https://www.google.com/accounts/OAuthGetRequestToken',
	'authorize_url' : 'https://www.google.com/accounts/OAuthAuthorizeToken',
	'access_url' : 'https://www.google.com/accounts/OAuthGetAccessToken',
	'consumer_key' : 'anonymous',
	'consumer_secret' : 'anonymous',
	'scope' : 'http://www.google.com/m8/feeds/',
	'app_name' : 'BroadSoft Xtended Dialer for Google Chrome'
});

function contentLoaded() {
	localStorage["restartRequired"] = "false";
	// restore Xsi-Actions
	var xsiactions_options = {
		host : localStorage["url"],
		username : localStorage["username"],
		password : localStorage["password"],
	};
	XSIACTIONS.API.init(xsiactions_options);
	oauth.authorize(function() {
	});

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

	chrome.runtime.onSuspend.addListener(function() {
		XSIEVENTS.API.shutdown();
	});

	connect();
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
											"User has signed out. Shutting down XSIEVENTS Framework");
							XSIEVENTS.API.shutdown();
						} else {
							LOGGER.API.log(MODULE,
									"Connection Lost! Restore Connection");
						}
					}
				});

function setServiceStatesToUnknown() {
	localStorage["callId"] = "unknown";
	localStorage["callHold"] = "unknown";
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

function onError(error) {
	LOGGER.API.log(MODULE, "Error occurred: " + error.message);
	setServiceStatesToUnknown();
}

function onDisconnected() {
	LOGGER.API.log(MODULE, "Disconnected!");
	setServiceStatesToUnknown();
}

function connect() {
	var status = localStorage["connectionStatus"];// Only init API if user is
	// signed in
	if (status == "signedIn") {
		XSIEVENTS.API.init(xsievents_options);
		LOGGER.API.log(MODULE, "Event API is initialized!");
	} else {
		LOGGER.API.log(MODULE,
				"Event API not initialized. User is not signed in yet.");
	}
}

document.addEventListener('DOMContentLoaded', contentLoaded);