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

var MODULE = "options.js";

function showMessage(message, fadeOut) {
	$("#status").text(message);
	$("#status").fadeIn();
	if (fadeOut) {
		$("#status").fadeOut(5000);
	}
}

function signin() {
	localStorage["url"] = $("#url").val();
	localStorage["username"] = $("#username").val();
	localStorage["password"] = $("#password").val();
	localStorage["clicktodial"] = "true";
	localStorage["notifications"] = "true";
	localStorage["texttospeech"] = "true";
	var xsiactions_options = {
		host : localStorage["url"],
		username : localStorage["username"],
		password : localStorage["password"],
	};
	XSIACTIONS.API.init(xsiactions_options);	
	try {
		var name = XSIACTIONS.API.getName();
		LOGGER.API.log(MODULE,"User name: " + name);
		localStorage["name"] = name;
		localStorage["connectionStatus"] = "signedIn";
		
		try{
		var dnd = XSIACTIONS.API.getDoNotDisturb();
		localStorage["dnd"] = dnd;
		dndAssigned = true;
		} catch (error) {
			LOGGER.API.error(MODULE,error.message);
			localStorage["dnd"] = "unassigned";
		}
	
		try{
		var cfa = XSIACTIONS.API.getCallForwardAlways();
		localStorage["cfa"] = cfa;
		} catch (error) {
			LOGGER.API.error(MODULE,error.message);
			localStorage["cfa"] = "unassigned";
		}
	
		try{
		var ro = XSIACTIONS.API.getRemoteOffice();
		localStorage["ro"] = ro;
		} catch (error) {
			LOGGER.API.error(MODULE,error.message);
			localStorage["ro"] = "unassigned";
		}
	} catch (error) {
		showMessage("Invalid credentials. Please verify the information is correct and try again.");
		LOGGER.API.error(MODULE,error.message);
	}
	
	
	
	if (localStorage["connectionStatus"] == "signedIn"){
		localStorage["restartRequired"] = "true";
		localStorage["errorMessage"]="";
		top.location.assign("restart.html");
	}
	
}

function showGUI(name) {
	$("#dnd").prop("checked", getDoNotDisturb());
	$("#name").text(name);
	$("#settings").hide();
	$("#tabs").show();
}

function restoreOptions() {

	$("#url").focus();
	$(document).keypress(function(event) {
		if (event.keyCode == 13) {
			$('#signin').trigger('click');
		}
	});

	var error = localStorage["errorMessage"];
	if (localStorage["errorMessage"] != undefined && localStorage["errorMessage"] != ""){
		showMessage(error);
		$("#url").val(localStorage["url"]);
		$("#username").val(localStorage["username"]);
		$("#password").val("");
		localStorage["connectionStatus"] = "signedOut";
	}
	else if (localStorage["restartRequired"] == "true") {
		top.location.assign("restart.html");
	} else {
		var url = localStorage["url"];
		var username = localStorage["username"];
		var password = localStorage["password"];
		if (url) {
			$("#url").val(url);
		}
		if (username) {
			$("#username").val(username);
		}
		if (password) {
			$("#password").val(password);
		}
		try {
			name = localStorage["name"];
			// If name exists then user had logged in successfully. Go to tabs.
			if (name && url) {
				localStorage["connectionStatus"] = "signedIn";
				top.location.assign("tabs.html");
			}
		} catch (error) {
			$("#settings").show();
			LOGGER.API.error(MODULE,error.message);
		}
	}
}

function done() {
	window.close();
}

function showAboutBox() {
	localStorage["currentTab"] = "options";
	top.location.assign("about.html");
}


// about
document.querySelector('#about_link_options').addEventListener('click', showAboutBox);

document.addEventListener('DOMContentLoaded', restoreOptions);
document.querySelector('#signin').addEventListener('click', signin);
