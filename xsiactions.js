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
var XSIACTIONS = XSIACTIONS || {};

XSIACTIONS.API = (function() {
	var MODULE = "xsiactions.js";
	var host = "";
	var username = "";
	var password = "";
	var context = "/com.broadsoft.xsi-actions";

	var XML_HEADER = "<?xml version='1.0' encoding='UTF-8'?>";

	function init(options) {
		host = options.host;
		username = options.username;
		password = options.password;
		if (options.context) {
			context = options.context;
		}
		LOGGER.API.log(MODULE,"Xsi Actions initialized");
	}

	function getAuthorizationHeader() {
		var header = "Basic " + $.base64.encode(username + ":" + password);
		return header;
	}

	function sendXsiRequest(type, url, data) {
		LOGGER.API.log(MODULE, "Request: " + type + " " + url);
		if (data) {
			LOGGER.API.log(MODULE, "Payload: ", data);
		}
		var response = null;
		$.ajax({
			beforeSend : function(request) {
				request.setRequestHeader("Authorization", getAuthorizationHeader());
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
			error : function(xhr, error) {
				LOGGER.API.error(MODULE,xhr.responseText + " " + xhr.status + " " + error.message);
				throw new Error("XSI Error status: " + xhr.status);
			}
		});
		if (response) {
			LOGGER.API.log(MODULE, "Response: ", response);
		}
		return response;
	}

	function getServices() {
		var geturl = host + context + "/v2.0/user/" + username + "/services";
		var response = sendXsiRequest("GET", geturl, null);
		var services = new Array();
		var x = 0;
		$("service", response).each(function(i) {
			services[x++] = $(this).find("name").text();
		});
		return services;
	}

	function getName() {
		var geturl = host + context + "/v2.0/user/" + username + "/profile";
		var response = sendXsiRequest("GET", geturl, null);
		var name = $(response).find("firstName").text() + " " + $(response).find("lastName").text();
		return name;
	}

	function getDoNotDisturb() {
		var geturl = host + context + "/v2.0/user/" + username + "/services/donotdisturb";
		var response = sendXsiRequest("GET", geturl, null);
		var active = $(response).find("active").text();
		return active == "true";
	}

	function setDoNotDisturb(dnd) {
		var puturl = host + context + "/v2.0/user/" + username + "/services/donotdisturb";
		var data = XML_HEADER + "<DoNotDisturb xmlns='http://schema.broadsoft.com/xsi'><active>" + dnd
				+ "</active><ringSplash>false</ringSplash></DoNotDisturb>";
		sendXsiRequest("PUT", puturl, data);
	}

	function getCallForwardAlways() {
		var geturl = host + context + "/v2.0/user/" + username + "/services/callforwardingalways";
		var response = sendXsiRequest("GET", geturl, null);
		var active = $(response).find("active").text();
		return active == "true";
	}

	function setCallForwardAlways(cfa) {
		var puturl = host + context + "/v2.0/user/" + username + "/services/callforwardingalways";
		var data = XML_HEADER + "<CallForwardingAlways  xmlns='http://schema.broadsoft.com/xsi'><active>" + cfa + "</active></CallForwardingAlways >";
		sendXsiRequest("PUT", puturl, data);
	}

	function getRemoteOffice() {
		var geturl = host + context + "/v2.0/user/" + username + "/services/remoteoffice";
		var response = sendXsiRequest("GET", geturl, null);
		var active = $(response).find("active").text();
		return active == "true";
	}

	function setRemoteOffice(ro) {
		var puturl = host + context + "/v2.0/user/" + username + "/services/remoteoffice";
		var data = XML_HEADER + "<RemoteOffice xmlns='http://schema.broadsoft.com/xsi'><active>" + ro + "</active></RemoteOffice>";
		sendXsiRequest("PUT", puturl, data);
	}

	function call(destination) {
		var posturl = host + context + "/v2.0/user/" + username + "/calls/new?address=" + encodeURIComponent(destination);
		var response = sendXsiRequest("POST", posturl, null);
		var callId = $(response).find("callId").text();
		return callId;
	}

	function talk(callhalf) {
		var puturl = host + context + "/v2.0/user/" + username + "/calls/" + callhalf + "/talk";
		sendXsiRequest("PUT", puturl, null);
	}

	function transferToVoicemail(callhalf) {
		var puturl = host + context + "/v2.0/user/" + username + "/calls/" + callhalf + "/vmtransfer";
		sendXsiRequest("PUT", puturl, null);
	}

	function searchEnterpriseDirectory(data) {
		var geturl = host + context + "/v2.0/user/" + username + "/directories/enterprise?";
		var tokens = data.split(" ");
		if (tokens.length == 1) {
			geturl = geturl + "firstName=" + tokens[0] + "*/i&lastName=" + tokens[0] + "*/i&searchCriteriaModeOr=true";
		} else if (tokens.length >= 2) {
			geturl = geturl + "firstName=" + tokens[0] + "*/i&lastName=" + tokens[1] + "*/i";
		}
		var response = sendXsiRequest("GET", geturl, null);
		return response;
	}

	function getCallLogs() {
		LOGGER.API.log(MODULE,"get call logs user: " + username);
		var geturl = host + context + "/v2.0/user/" + username + "/directories/calllogs";
		var response = sendXsiRequest("GET", geturl, null);
		return response;
	}

	function hangup(callhalf) {
		var deleteurl = host + context + "/v2.0/user/" + username + "/calls/" + callhalf;
		sendXsiRequest("DELETE", deleteurl, null);
	}

	function hold(callhalf) {
		var puturl = host + context + "/v2.0/user/" + username + "/calls/" + callhalf + "/hold";
		sendXsiRequest("PUT", puturl, null);
	}

	return {
		init : init,
		getServices : getServices,
		getName : getName,
		getDoNotDisturb : getDoNotDisturb,
		setDoNotDisturb : setDoNotDisturb,
		getCallForwardAlways : getCallForwardAlways,
		setCallForwardAlways : setCallForwardAlways,
		getRemoteOffice : getRemoteOffice,
		setRemoteOffice : setRemoteOffice,
		call : call,
		talk : talk,
		transferToVoicemail : transferToVoicemail,
		searchEnterpriseDirectory : searchEnterpriseDirectory,
		getCallLogs : getCallLogs,
		hangup : hangup,
		hold : hold
	};
})();