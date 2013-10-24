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
var XSIEVENTS = XSIEVENTS || {};

XSIEVENTS.API = (function() {
	var MODULE = "xsievents.js";
	var host = "";
	var username = "";
	var password = "";
	var credentials = "";
	var XML_HEADER = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>";
	var channelSetId = "";
	var channelId = "";
	var applicationId = "";
	var heartbeatId = "";

	callbacks = {
		onChannelAdded : null,
		onEvent : null,
		onSubscriptionTerminated : null,
		onChannelTerminated : null,
		onError : null,
		onDisconnected : null
	};

	function init(options) {
		if (!isConnected()) {
			host = options.host;
			username = options.username;
			password = options.password;
			channelSetId = options.channelSetId;
			applicationId = options.applicationId;
			callbacks.onChannelAdded = options.onChannelAdded;
			callbacks.onEvent = options.onEvent;
			callbacks.onSubscriptionTerminated = options.onSubscriptionTerminated;
			callbacks.onChannelTerminated = options.onChannelTerminated;
			callbacks.onError = options.onError;
			callbacks.onDisconnected = options.onDisconnected;
			credentials = $.base64.encode(username + ":" + password);
			connect();
			heartbeatId = setInterval(heartbeat, 15000);
		}
	}

	function shutdown() {
		removeChannel();
		channelId = "";
		clearInterval(heartbeatId);
	}

	function isConnected() {
		return channelId != "";
	}

	function connect() {
		var xhr = new XMLHttpRequest();
		var index = 0;
		var url = host
				+ "/com.broadsoft.async/com.broadsoft.xsi-events/v2.0/channel";
		xhr.open("POST", url, true);
		xhr.onreadystatechange = function() {
			var chunk = xhr.responseText.substring(index,
					xhr.responseText.length);
			index = xhr.responseText.length;
			var tokens = chunk.split(XML_HEADER);
			for ( var i = 0; i < tokens.length; i++) {
				if (tokens[i] != "") {
					process(tokens[i]);
				}
			}
		};
		xhr.onerror = function(error) {
			LOGGER.API.error(MODULE, "Error on ajax request: " + error.message);
			channelId = "";
			clearInterval(heartbeatId);
			callbacks.onError(error);
		};
		xhr.onloadend = function() {
			channelId = "";
			clearInterval(heartbeatId);
			callbacks.onDisconnected();
		};

		var request = XML_HEADER;
		request = request
				+ "<Channel xmlns=\"http://schema.broadsoft.com/xsi\">";
		request = request + "<channelSetId>" + channelSetId + "</channelSetId>";
		request = request + "<priority>1</priority>";
		request = request + "<weight>100</weight>";
		request = request + "<expires>3600</expires>";
		request = request + "<applicationId>broadworks4chrome</applicationId>";
		request = request + "</Channel>";

		xhr.setRequestHeader("Authorization", "Basic " + credentials);
		xhr.send(request);
	}

	function process(chunk) {
		LOGGER.API.log(MODULE, XML_HEADER + chunk);
		if (chunk.indexOf("<Channel ") >= 0) {
			chunk = XML_HEADER + chunk;
			channelId = $(chunk).find("channelId").text();
			heartbeat();
			callbacks.onChannelAdded(chunk);
		} else if (chunk.indexOf("<ChannelHeartBeat ") >= 0) {
		} else if (chunk.indexOf("SubscriptionTerminatedEvent") >= 0) {
			callbacks.onSubscriptionTerminated(XML_HEADER + chunk);
		} else if (chunk.indexOf("ChannelTerminatedEvent") >= 0) {
			channelId = "";
			clearInterval(heartbeatId);
			callbacks.onChannelTerminated(XML_HEADER + chunk);
		} else if (chunk.indexOf("<xsi:Event ") >= 0) {
			callbacks.onEvent(XML_HEADER + chunk);
		}
	}

	function heartbeat() {
		if (isConnected()) {
			var url = host + "/com.broadsoft.xsi-events/v2.0/channel/"
					+ channelId + "/heartbeat";
			var response = send("PUT", url, null);
			if (response != null) {
				channelId = "";
				clearInterval(heartbeatId);
			}
		}
	}

	function removeChannel() {
		var url = host + "/com.broadsoft.xsi-events/v2.0/channel/" + channelId;
		send("DELETE", url, null);
	}

	function send(type, url, data) {
		var response = null;
		$.ajax({
			beforeSend : function(request) {
				request.setRequestHeader("Authorization", "Basic "
						+ credentials);
			},
			cache : false,
			type : type,
			url : url,
			dataType : "xml",
			data : data,
			async : false,
			success : function(doc) {
				response = doc;
			},
			error : function(xhr, status, error) {
				LOGGER.API.error(MODULE, xhr.responseText + " " + status,
						error.message);
				channelId = "";
				clearInterval(heartbeatId);
				callbacks.onDisconnected();
			}
		});
		return response;
	}

	function addEventSubscription(targetId, event) {
		var url = host + "/com.broadsoft.xsi-events/v2.0/user/" + username;
		var data = XML_HEADER;
		data = data
				+ "<Subscription xmlns=\"http://schema.broadsoft.com/xsi\">";
		data = data + "<subscriberId>" + username + "</subscriberId>";
		data = data + "<targetIdType>User</targetIdType>";
		data = data + "<targetId>" + targetId + "</targetId>";
		data = data + "<event>" + event + "</event>";
		data = data + "<expires>3600</expires>";
		data = data + "<channelSetId>" + channelSetId + "</channelSetId>";
		data = data + "<applicationId>" + applicationId + "</applicationId>";
		data = data + "</Subscription>";
		var response = send("POST", url, data);
		return response;
	}

	function sendEventResponse(eventId) {
		var url = host + "/com.broadsoft.xsi-events/v2.0/channel/eventresponse";
		var data = XML_HEADER;
		data = data
				+ "<EventResponse xmlns=\"http://schema.broadsoft.com/xsi\">";
		data = data + "<eventID>" + eventId + "</eventID>";
		data = data + "<statusCode>200</statusCode>";
		data = data + "<reason>OK</reason>";
		data = data + "</EventResponse>";
		var response = send("POST", url, data);
		return response;
	}

	function getSubscription(subscriptionId) {
		var url = host + "/com.broadsoft.xsi-events/v2.0/subscription/"
				+ subscriptionId;
		var response = send("GET", url, null);
		return response;
	}

	return {
		init : init,
		shutdown : shutdown,
		isConnected : isConnected,
		addEventSubscription : addEventSubscription,
		sendEventResponse : sendEventResponse,
		getSubscription : getSubscription
	};
})();