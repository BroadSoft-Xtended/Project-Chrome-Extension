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

importScripts('tinyxmlw3cdom.js', 'tinyxmlsax.js');
var LOG_PREFIX = 'xsi-events-api|';
var XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>';
var HEARTBEAT_INTERVAL = 15000;
// channel and subscription expiry in seconds, don't set
// this lower than 600
var EXPIRES = 3600;
var channelId = '';
var mainXhr = null;
var heartbeatIntervalId = null;
var state = 'disconnected';
var hostIndex = -1;
var channelSetId = 'broadworks4chromechannelset';
var applicationId = 'broadworks4chrome';
var hosts = [];
var credentials = '';
var username = '';
var parser = new DOMImplementation();
var EVENT_CLOSE = '</xsi:Event>';
var CHANNEL_CLOSE = '</Channel>';
var HEARTBEAT_CLOSE = '<ChannelHeartBeat xmlns="http://schema.broadsoft.com/xsi"/>';
var subscriptionIds = {};
var updateIntervalId = null;

// define endsWith method for String
String.prototype.endsWith = function(suffix) {
	return this.indexOf(suffix, this.length - suffix.length) !== -1;
};

self.addEventListener('message', function(e) {
	switch (e.data.cmd) {
	case 'init':
		if (state == 'disconnected') {
			log('intializing');
			hosts = e.data.config.hosts;
			username = e.data.config.username;
			credentials = e.data.config.credentials;
		}
		break;
	case 'start':
		if (state == 'disconnected') {
			log('starting');
			connect();
		}
		break;
	case 'stop':
		log('stopping');
		mainXhr.abort();
		break;
	}
}, false);

function connect() {
	log('sending add channel request');
	state = 'connecting';
	hostIndex++;
	if (hostIndex == hosts.length) {
		hostIndex = 0;
	}
	mainXhr = new XMLHttpRequest();
	var index = 0;
	var responseBuffer = '';
	var url = hosts[hostIndex]
			+ '/com.broadsoft.async/com.broadsoft.xsi-events/v2.0/channel';
	mainXhr.open('POST', url, true);
	mainXhr.onreadystatechange = function() {
		var chunk = mainXhr.responseText.substring(index,
				mainXhr.responseText.length);
		index = mainXhr.responseText.length;
		log("Chunk is: " + chunk);
		// Ensure there is at least one complete Channel Response, Event
		// Response, or Heartbeat response in the responseText. Sometimes,
		// responses are split across chunks
		if (chunk.endsWith(EVENT_CLOSE) || chunk.endsWith(CHANNEL_CLOSE)
				|| chunk.endsWith(HEARTBEAT_CLOSE)) {
			// If anything is in the response buffer then add chunk to the
			// buffer, set as response, and then clear the buffer
			if (responseBuffer != '') {
				responseBuffer += chunk;
				response = responseBuffer;
				responseBuffer = '';
			} else {
				response = chunk;
			}
			log("complete response is: " + response);
			var tokens = response.split(XML_HEADER);
			for ( var i = 0; i < tokens.length; i++) {
				if (tokens[i] != '') {
					process(tokens[i]);
				}
			}
		}
		// If no complete response then add the chunk to the buffer
		else {
			responseBuffer += chunk;
		}
	};
	mainXhr.onloadend = function() {
		log('sending disconnected message');
		channelId = '';
		clearInterval(heartbeatIntervalId);
		heartbeatIntervalId = null;
		clearInterval(updateIntervalId);
		updateIntervalId = null;
		state = 'disconnected';
		// this is the only place that should send a disconnected message
		sendMessage(state, this.status);
	};

	var request = XML_HEADER;
	request = request + '<Channel xmlns="http://schema.broadsoft.com/xsi">';
	request = request + '<channelSetId>' + channelSetId + '</channelSetId>';
	request = request + '<priority>1</priority>';
	request = request + '<weight>100</weight>';
	request = request + '<expires>' + EXPIRES + '</expires>';
	request = request + '<applicationId>broadworks4chrome</applicationId>';
	request = request + '</Channel>';

	mainXhr.setRequestHeader('Authorization', 'Basic ' + credentials);
	mainXhr.send(request);
}

function process(chunk) {
	log('received data: ' + chunk);
	var xmlDoc = parser.loadXML(chunk).getDocumentElement();

	if (chunk.indexOf('<Channel ') >= 0) {
		channelId = xmlDoc.getElementsByTagName('channelId').item(0)
				.getFirstChild().getNodeValue();
		log('channelId: ' + channelId);
		heartbeatIntervalId = setInterval(heartbeat, HEARTBEAT_INTERVAL);
		status = 'connected';
		addEventSubscription(username, "Standard Call");
		addEventSubscription(username, "Do Not Disturb");
		addEventSubscription(username, "Remote Office");
		addEventSubscription(username, "Call Forwarding Always");
		// start channel and subscription update timer 5 mins before they expire
		if (updateIntervalId == null) {
			updateIntervalId = setInterval(updateChannelAndEventSubscriptions,
					(EXPIRES - 300) * 1000);
		}
	} else if (chunk.indexOf('<ChannelHeartBeat ') >= 0) {
	} else if (chunk.indexOf('SubscriptionTerminatedEvent') >= 0) {
		// don't handle these explicitly, just wait for the channel to terminate
		// since we won't send a event response
	} else if (chunk.indexOf('ChannelTerminatedEvent') >= 0) {
		// nothing to do here, mainXhr will return after this and the disconnect
		// message will be sent to background page
	} else if (chunk.indexOf('<xsi:Event ') >= 0) {
		var eventId = xmlDoc.getElementsByTagName('xsi:eventID').item(0)
				.getFirstChild().getNodeValue();
		sendEventResponse(eventId);
		var eventType = xmlDoc.getElementsByTagName('xsi:eventData').item(0)
				.getAttribute('xsi1:type').trim();
		eventType = eventType.substring(4);// string off the prefix "xsi:" from
		// the eventType
		log('eventType: ' + eventType);
		switch (eventType) {
		case 'DoNotDisturbEvent':
		case 'CallForwardingAlwaysEvent':
		case 'RemoteOfficeEvent':
			var active = xmlDoc.getElementsByTagName('xsi:active').item(0)
					.getFirstChild().getNodeValue();
			log('active: ' + active);
			sendMessage(eventType, active);
			break;
		case 'CallSubscriptionEvent':
		case 'CallOriginatingEvent':
		case 'CallOriginatedEvent':
		case 'CallReceivedEvent':
		case 'CallAnsweredEvent':
		case 'CallReleasedEvent':
		case 'CallHeldEvent':
		case 'CallRetrievedEvent':
		case 'CallUpdatedEvent':
			var calls = parseCalls(chunk);
			sendMessage(eventType, calls);
			break;
		}
	}
}

function heartbeat() {
	// abort mainXhr on heart-beat errors
	// we will use that to trigger disconnect messages
	// error on all other requests are ignored, as failed event responses will
	// eventually cause mainXhr to end
	if (channelId != '') {
		log('sending channel heartbeat');
		var url = hosts[hostIndex] + '/com.broadsoft.xsi-events/v2.0/channel/'
				+ channelId + '/heartbeat';
		send('PUT', url, null, function(xhr) {
			if (xhr.status != 200) {
				log('aborting main xhr');
				mainXhr.abort();
			}
		});
	}
}

function send(type, url, data, responseHandler) {
	log('sending ' + type + ' to ' + url);
	var xhr = new XMLHttpRequest();
	xhr.open(type, url, true);
	if (responseHandler) {
		xhr.onloadend = function() {
			responseHandler(xhr);
		};
	}
	xhr.setRequestHeader('Authorization', 'Basic ' + credentials);
	xhr.send(data);
}

function sendMessage(type, value) {
	self.postMessage({
		type : type,
		value : value
	});
}

function log(message) {
	var now = new Date();
	var year = now.getFullYear();
	var month = now.getMonth() + 1;
	var day = now.getDate();
	var hour = now.getHours();
	var minute = now.getMinutes();
	var second = now.getSeconds();
	if (month.toString().length == 1) {
		month = '0' + month;
	}
	if (day.toString().length == 1) {
		day = '0' + day;
	}
	if (hour.toString().length == 1) {
		hour = '0' + hour;
	}
	if (minute.toString().length == 1) {
		minute = '0' + minute;
	}
	if (second.toString().length == 1) {
		second = '0' + second;
	}
	var timestamp = year + '/' + month + '/' + day + ' ' + hour + ':' + minute
			+ ':' + second;
	sendMessage('log', LOG_PREFIX + timestamp + '|' + message);
}

function parseCalls(xml) {
	var calls = {};
	var xmlDoc = parser.loadXML(xml).getDocumentElement();

	var callNodes = xmlDoc.getElementsByTagName('xsi:call');
	for ( var i = 0; i < callNodes.length; i++) {
		var call = callNodes.item(i);
		var callId = call.getElementsByTagName('xsi:callId').item(0)
				.getFirstChild().getNodeValue();
		var personality = call.getElementsByTagName('xsi:personality').item(0)
				.getFirstChild().getNodeValue();
		var state = call.getElementsByTagName('xsi:state').item(0)
				.getFirstChild().getNodeValue();
		var remotePartyElement = call.getElementsByTagName('xsi:remoteParty')
				.item(0);
		var nameElement = remotePartyElement.getElementsByTagName('xsi:name')
				.item(0);
		var name = "";
		if (nameElement != null) {
			name = nameElement.getFirstChild().getNodeValue();
		}
		var address = "";
		var countryCode = "";
		var addressElement = remotePartyElement
				.getElementsByTagName('xsi:address');
		if (addressElement != null) {
			var addressNode = addressElement.item(0);
			if (addressNode != null) {
				address = addressNode.getFirstChild().getNodeValue();
				if (addressNode.hasAttributes()) {
					countryCode = addressNode.getAttribute('countryCode');
				}
			}
		}
		number = address.replace("tel:", "").replace("+" + countryCode,
				"+" + countryCode + "-");
		var startTime = call.getElementsByTagName('xsi:startTime').item(0)
				.getFirstChild().getNodeValue();
		var answerTime = null;
		var answerTimeNode = call.getElementsByTagName('xsi:answerTime')
				.item(0);
		if (answerTimeNode) {
			answerTime = answerTimeNode.getFirstChild().getNodeValue();
		}
		calls[callId] = {
			personality : personality,
			state : state,
			name : name,
			number : number,
			countryCode : countryCode,
			startTime : startTime,
			answerTime : answerTime
		};
	}
	return calls;
}

function addEventSubscription(targetId, event) {
	var url = hosts[hostIndex] + "/com.broadsoft.xsi-events/v2.0/user/"
			+ username;
	var data = XML_HEADER;
	data = data + "<Subscription xmlns=\"http://schema.broadsoft.com/xsi\">";
	data = data + "<subscriberId>" + username + "</subscriberId>";
	data = data + "<targetIdType>User</targetIdType>";
	data = data + "<targetId>" + targetId + "</targetId>";
	data = data + "<event>" + event + "</event>";
	data = data + "<expires>" + EXPIRES + "</expires>";
	data = data + "<channelSetId>" + channelSetId + "</channelSetId>";
	data = data + "<applicationId>" + applicationId + "</applicationId>";
	data = data + "</Subscription>";
	send("POST", url, data, function(xhr) {
		if (xhr.status == 200) {
			var xmlDoc = parser.loadXML(xhr.responseText);
			var subscriptionId = xmlDoc.getElementsByTagName('subscriptionId')
					.item(0).getFirstChild().getNodeValue();
			subscriptionIds[event] = subscriptionId;
		}
	});
}

function updateEventSubscription(subscriptionId) {
	var url = hosts[hostIndex] + "/com.broadsoft.xsi-events/v2.0/subscription/"
			+ subscriptionId;
	var data = XML_HEADER;
	data = data + "<Subscription xmlns=\"http://schema.broadsoft.com/xsi\">";
	data = data + "<subscriptionId>" + subscriptionId + "</subscriptionId>";
	data = data + "<expires>" + EXPIRES + "</expires>";
	data = data + "</Subscription>";
	send("PUT", url, data);
}

function sendEventResponse(eventId) {
	var url = hosts[hostIndex]
			+ "/com.broadsoft.xsi-events/v2.0/channel/eventresponse";
	var data = XML_HEADER;
	data = data + "<EventResponse xmlns=\"http://schema.broadsoft.com/xsi\">";
	data = data + "<eventID>" + eventId + "</eventID>";
	data = data + "<statusCode>200</statusCode>";
	data = data + "<reason>OK</reason>";
	data = data + "</EventResponse>";
	send("POST", url, data);
}

function updateChannel() {
	var url = hosts[hostIndex] + '/com.broadsoft.xsi-events/v2.0/channel/'
			+ channelId + "/" + channelId;
	var data = XML_HEADER;
	data = data + '<Channel xmlns="http://schema.broadsoft.com/xsi">';
	data = data + '<channelId>' + channelId + '</channelId>';
	data = data + '<expires>' + EXPIRES + '</expires>';
	data = data + '</Channel>';
	send("PUT", url, data);
}

function updateChannelAndEventSubscriptions() {
	if (channelId != '') {
		updateChannel();
		for ( var event in subscriptionIds) {
			updateEventSubscription(subscriptionIds[event]);
		}
	}
}